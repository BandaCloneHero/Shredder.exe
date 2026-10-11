#!/usr/bin/env python3
"""Repair guitar/drums in the Pro Dia Nascer Feliz separated-stem chart.

The timbre exemplars below were calibrated for this recording. They must be
reviewed for other songs; this is not a general purpose drum transcription model.
Dependencies: numpy, scipy, mido, imageio-ffmpeg.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

import imageio_ffmpeg
import mido
import numpy as np
from scipy import cluster, ndimage, signal

from create_mp3_test_chart import (
    DIFFICULTIES, PPQ, flux, make_track, pitch_salience, select_attacks, validate,
)


def decode(path):
    result = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-xerror',
                             '-i', str(path), '-map', '0:a:0', '-ac', '1', '-ar', '22050',
                             '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(result.stdout, dtype='<f4')


def decode_drums(path):
    # Match the preprocessing used when this recording's exemplars were fitted.
    result = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-xerror',
                             '-i', str(path), '-map', '0:a:0', '-ac', '2', '-ar', '44100',
                             '-f', 'f32le', '-'], capture_output=True, check=True)
    stereo = np.frombuffer(result.stdout, dtype='<f4').reshape(-1, 2)
    return signal.resample_poly(stereo.mean(axis=1), 1, 2)


def drum_model(audio):
    frequency, times, spectrum = signal.stft(audio, 22050, nperseg=1024, noverlap=804)
    magnitude = abs(spectrum).astype('f4')
    average = magnitude.mean(axis=1)
    weight = 1/np.maximum(average, np.quantile(average, .40))**.55
    weight[frequency < 40] = 0
    magnitude *= weight[:, None]
    train = magnitude[:, ::6]
    train = train[:, train.sum(axis=0) > np.quantile(train.sum(axis=0), .25)]
    rng = np.random.default_rng(5)
    templates = rng.uniform(.1, 1, (len(frequency), 10)).astype('f4')
    activations = rng.uniform(.1, 1, (10, train.shape[1])).astype('f4')
    for _ in range(150):
        activations *= (templates.T@(train/(templates@activations+1e-8)))/(templates.sum(axis=0)[:, None]+1e-8)
        templates *= ((train/(templates@activations+1e-8))@activations.T)/(activations.sum(axis=1)[None, :]+1e-8)
    templates /= np.maximum(templates.sum(axis=0), 1e-9)
    activations = np.maximum(templates.T@magnitude, 1e-9)
    for _ in range(100):
        activations *= (templates.T@(magnitude/(templates@activations+1e-8)))/(templates.sum(axis=0)[:, None]+1e-8)
    return frequency, times, templates, activations


def physical_drums(templates, activations):
    # A snare has both a tonal body and broadband rattle. Tie them to ONE
    # physical instrument instead of interpreting each frequency band as a pad.
    # These example mixtures represent distinct hits in this recording.
    mixtures = np.array([
        [12, 3, 3, 1, 1, 3, 24, 1, 4, 6],  # kick, including its attack click
        [1, 25, 19, 14, 8, 19, 11, 13, 49, 20],  # snare body + rattle
        [0, 0, 0, 3, 1, 0, 0, 0, 0, 15],  # treble cymbal
        [0, 0, 0, 0, 0, 3, 25, 0, 1, 1],  # tom body
        [1, 5, 1, 6, 35, 1, 0, 15, 0, 7],  # crash
    ], dtype='f4').T
    physical = templates@mixtures
    physical /= np.linalg.norm(physical, axis=0)
    projection = physical.T@templates@activations
    gram = physical.T@physical
    result = np.maximum(projection, 1e-8)
    for _ in range(250):
        result *= projection/(gram@result+1e-8)
    return physical, result


def drum_hits(times, activations):
    scales = np.quantile(activations, .95, axis=1)
    candidates = []
    for lane in range(5):
        envelope = ndimage.gaussian_filter1d(activations[lane], .6)
        peaks = signal.find_peaks(envelope, distance=(10, 12, 10, 10, 30)[lane],
                                  prominence=scales[lane]*.25)[0]
        floor = scales[lane]*(.6, .6, .7, .9, 1.6)[lane]
        candidates.append([int(p) for p in peaks if envelope[p] > floor])
    kick_times = times[candidates[0]]
    snare_times = times[candidates[1]]
    crash_times = times[candidates[4]]
    # Residual high-frequency peaks immediately after a snare are its rattle,
    # not an extra hi-hat hit. Similarly, kick clicks do not become tom notes.
    candidates[2] = [p for p in candidates[2] if np.min(abs(snare_times-times[p]), initial=999) > .16
                     and np.min(abs(crash_times-times[p]), initial=999) > .10]
    other_times = np.r_[kick_times, snare_times]
    candidates[3] = [p for p in candidates[3] if np.min(abs(other_times-times[p]), initial=999) > .065]
    hits = []
    for lane, peaks in enumerate(candidates):
        envelope = ndimage.gaussian_filter1d(activations[lane], .6)
        for p in peaks:
            # Backtrack from the timbre's amplitude peak to the rising attack.
            start = p
            floor = envelope[p]*.35
            while start > max(0, p-8) and envelope[start-1] > floor:
                start -= 1
            time = float(times[start])
            hits.append((time, lane, float(envelope[p]/max(scales[lane], 1e-9))))
    return sorted(hits)


def thin(hits, gap, strength_ratio=.0):
    selected = []
    for hit in sorted(hits, key=lambda h: h[2], reverse=True):
        if hit[2] >= strength_ratio and all(abs(hit[0]-other[0]) >= gap for other in selected):
            selected.append(hit)
    return sorted(selected)


def combo_counts(track):
    groups = collections.defaultdict(list)
    ticks = 0
    for event in track:
        ticks += event.time
        if event.type == 'note_on' and event.velocity and 96 <= event.note <= 100:
            groups[ticks].append(event.note-96)
    return collections.Counter(tuple(sorted(x)) for x in groups.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('song', type=Path)
    parser.add_argument('--cached-drum-model', type=Path)
    args = parser.parse_args()
    paths = {instrument: next(args.source.glob(prefix+'*.wav'))
             for instrument, prefix in [('guitar', 'guitar'), ('drums', 'drum')]}
    report_path = args.song/'analysis.json'
    report = json.loads(report_path.read_text())
    if any(str(path) not in report['source_hashes'] or hashlib.sha256(path.read_bytes()).hexdigest()
           != report['source_hashes'][str(path)] for path in paths.values()):
        parser.error('Source files differ from the original song analysis.')
    original = mido.MidiFile(args.song/'notes.mid')
    tempo = next(e.tempo for t in original.tracks for e in t if e.type == 'set_tempo')
    seconds_per_tick = tempo/1e6/PPQ
    to_tick = lambda seconds: round(seconds/seconds_per_tick)
    duration = report['duration_seconds']
    end_tick = to_tick(duration)

    guitar_audio = decode(paths['guitar'])
    frequency, times, spectrum = signal.stft(guitar_audio, 22050, nperseg=2048, noverlap=1828)
    amplitude = abs(spectrum)
    energy = np.sqrt((amplitude*amplitude).sum(axis=0))
    envelope = flux(amplitude[(frequency > 70) & (frequency < 7000)])
    attacks = select_attacks(envelope, times, .12, .30, duration)
    energy_floor = np.quantile(energy, .90)*.08
    attacks = [(time, frame) for time, frame in attacks if energy[frame] > energy_floor]
    pitches, salience = pitch_salience(amplitude, frequency)
    profiles = []
    for time, frame in attacks:
        strengths = salience[:, frame+2:frame+11].mean(axis=1)
        chroma = np.zeros(12)
        for pitch, strength in zip(pitches, strengths):
            chroma[int(pitch)%12] += strength
        profiles.append(chroma/max(np.linalg.norm(chroma), 1e-9))
    profiles = np.asarray(profiles)
    # Stable harmonic shapes get stable fret positions, including repeated
    # strums that a pitched-note transcriber failed to represent.
    centers, labels = cluster.vq.kmeans2(profiles, 5, iter=60, minit='++', seed=11)
    ordering = sorted(range(5), key=lambda j: (int(np.argmax(centers[j])), float(centers[j].sum())))
    lanes = {j: ordering.index(j) for j in ordering}
    guitar_hits = [(time, index, float(envelope[frame])) for index, (time, frame) in enumerate(attacks)]
    guitar_events = []
    summary = collections.defaultdict(dict)
    for level, difficulty in enumerate(DIFFICULTIES):
        selected = thin(guitar_hits, (.42, .28, .18, .12)[level])
        total = 0
        for k, (start, index, strength) in enumerate(selected):
            frame = attacks[index][1]
            lane = lanes[int(labels[index])]
            note_lanes = [lane]
            top = sorted(range(12), key=lambda pc: profiles[index, pc], reverse=True)
            if level >= 2 and profiles[index, top[1]] > profiles[index, top[0]]*.78:
                # A nearby second fret represents a well-supported guitar chord.
                note_lanes.append(lane+1 if lane < 4 else 3)
            next_start = selected[k+1][0] if k+1 < len(selected) else duration-.02
            hold_end = frame
            floor = max(energy_floor, energy[frame]*.4)
            while hold_end+1 < len(energy) and times[hold_end+1] < min(start+1.3, next_start-.04) and energy[hold_end+1] >= floor:
                hold_end += 1
            length = max(.06, min(float(times[hold_end])-start, next_start-start-.04))
            if length < .25:
                length = .06
            for note_lane in note_lanes:
                note = (60, 72, 84, 96)[level]+note_lane
                guitar_events.extend([(to_tick(start), mido.Message('note_on', note=note, velocity=100)),
                                      (to_tick(min(start+length, duration-.01)), mido.Message('note_off', note=note))])
                total += 1
        summary['guitar'][difficulty] = {'attacks': len(selected), 'notes': total}

    del guitar_audio, spectrum, amplitude, salience
    if args.cached_drum_model:
        model = np.load(args.cached_drum_model)
        templates = model['templates']*model['weight'][:, None]
        templates /= templates.sum(axis=0)
        drum_times = model['time']
        activations = model['activations']
        drum_frequency = model['frequency']
    else:
        drum_frequency, drum_times, templates, activations = drum_model(decode_drums(paths['drums']))
    physical, physical_activations = physical_drums(templates, activations)
    hits = drum_hits(drum_times, physical_activations)
    drum_events = []
    for level, difficulty in enumerate(DIFFICULTIES):
        chosen = []
        for lane in range(5):
            lane_hits = [hit for hit in hits if hit[1] == lane]
            chosen += thin(lane_hits, (.40, .25, .16, .095)[level])
        # Merge ONLY independently detected coincident instrument attacks.
        groups = []
        for start, lane, strength in sorted(chosen):
            if groups and start-groups[-1][0] <= .018:
                groups[-1][1].append((lane, strength))
            else:
                groups.append([start, [(lane, strength)]])
        total = 0
        for start, notes in groups:
            if level == 0 and len(notes) > 2:
                notes = sorted(notes, key=lambda n: n[1], reverse=True)[:2]
            for lane, strength in notes:
                note = (60, 72, 84, 96)[level]+lane
                drum_events.extend([(to_tick(start), mido.Message('note_on', note=note, velocity=100)),
                                    (to_tick(min(start+.045, duration-.01)), mido.Message('note_off', note=note))])
                total += 1
        summary['drums'][difficulty] = {'attacks': len(groups), 'notes': total}

    replacement_guitar = make_track('PART GUITAR', guitar_events, end_tick)
    replacement_drums = make_track('PART DRUMS', drum_events, end_tick)
    repaired = mido.MidiFile(type=original.type, ticks_per_beat=original.ticks_per_beat)
    for track in original.tracks:
        repaired.tracks.append(replacement_guitar if track.name == 'PART GUITAR' else (
            replacement_drums if track.name == 'PART DRUMS' else track))
    counts = validate(repaired, duration, seconds_per_tick)
    old_drums = next(track for track in original.tracks if track.name == 'PART DRUMS')
    old_guitar = next(track for track in original.tracks if track.name == 'PART GUITAR')
    old_combos = combo_counts(old_drums)
    new_combos = combo_counts(replacement_drums)
    old_triples = sum(n for combo, n in old_combos.items() if len(combo) >= 3)/sum(old_combos.values())
    new_triples = sum(n for combo, n in new_combos.items() if len(combo) >= 3)/sum(new_combos.values())
    if new_triples > .10 or len(attacks) < 200:
        raise ValueError('Repair failed the known guitar coverage/drum duplication regression checks.')
    # Physical regression probes from the separate drum WAV's opening bars.
    expert = []
    ticks = 0
    for event in replacement_drums:
        ticks += event.time
        if event.type == 'note_on' and event.velocity and 96 <= event.note <= 100:
            expert.append((ticks*seconds_per_tick, event.note-96))
    probes = []
    for time, expected_lane in [(.51, 1), (.90, 0), (2.11, 1), (3.74, 1)]:
        nearby = [lane for start, lane in expert if abs(start-time) < .06]
        if expected_lane not in nearby or len(nearby) != 1:
            raise ValueError(f'Physical hit probe failed at {time}s: {nearby}')
        probes.append({'seconds': time, 'lane': expected_lane, 'passed': True})
    for track in original.tracks:
        if track.name not in ['PART DRUMS', 'PART GUITAR']:
            other = next(t for t in repaired.tracks if t.name == track.name)
            assert list(other) == list(track)
    backup = args.song/'notes.before-refinement.mid'
    if not backup.exists():
        shutil.copyfile(args.song/'notes.mid', backup)
        shutil.copyfile(report_path, args.song/'analysis.before-refinement.json')
    candidate = args.song/'notes.refinement-candidate.mid'
    repaired.save(candidate)
    validate(mido.MidiFile(candidate), duration, seconds_per_tick)
    candidate.replace(args.song/'notes.mid')
    metrics = {'guitar_wav_attacks': len(attacks), 'old_guitar_expert_attacks': sum(combo_counts(old_guitar).values()),
               'old_drum_triple_attack_fraction': old_triples, 'new_drum_triple_attack_fraction': new_triples,
               'drum_expert_combinations': [{'lanes': list(c), 'attacks': n} for c, n in new_combos.most_common()],
               'physical_drum_probes': probes, 'bass_keys_tempo_events_preserved': True,
               'in_game_test': 'Not run', 'transcription_quality': 'Approximate; listening review still required'}
    report['refinement'] = metrics
    report['track_note_counts'] = counts
    for instrument in ['guitar', 'drums']:
        report['instruments'][instrument] = {d: summary[instrument][d]['notes'] for d in DIFFICULTIES}
    report['method'] = 'guitar WAV attacks and stable harmonic mapping; recording-calibrated drum timbre model; original bass/keys MIDI adaptation'
    report['note_sources']['guitar'] = str(paths['guitar'])
    report_path.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    np.savez_compressed(args.song/'drum-timbre-analysis.npz', frequency=drum_frequency,
                        times=drum_times, templates=physical, activations=physical_activations)
    print(json.dumps({'summary': summary, 'metrics': metrics}, indent=2))


if __name__ == '__main__':
    main()
