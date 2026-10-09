#!/usr/bin/env python3
"""Generate experimental four-instrument MIDI charts from a mixed audio file.

Dependencies: numpy, scipy, mido, imageio-ffmpeg.
This is onset/pitch analysis of a mix, not isolated instrument transcription.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import subprocess

import imageio_ffmpeg
import mido
import numpy as np
from scipy import ndimage, signal

SAMPLE_RATE = 22050
HOP = 220
PPQ = 480
WHITE_KEYS = np.array([48, 50, 52, 53, 55, 57, 59])
DIFFICULTIES = ('Easy', 'Medium', 'Hard', 'Expert')


def flux(spectrum):
    change = np.maximum(0, np.diff(np.log1p(200 * spectrum), axis=1))
    envelope = np.r_[0, change.sum(axis=0)]
    return np.maximum(0, envelope - ndimage.median_filter(envelope, size=101))


def select_attacks(envelope, times, minimum_gap, quantile, duration):
    # Pick real local maxima, then keep strong attacks far enough apart.
    floor = max(float(np.quantile(envelope, quantile)), float(envelope.max()) * .025)
    candidates, _ = signal.find_peaks(envelope, prominence=floor, distance=7)
    chosen = []
    for frame in sorted(candidates, key=lambda f: float(envelope[f]), reverse=True):
        time = max(0, float(times[frame]) - .010)
        if .5 <= time < duration - .2 and all(abs(time - other[0]) >= minimum_gap for other in chosen):
            chosen.append((time, int(frame)))
    return sorted(chosen)


def estimate_tempo(envelope):
    corr = signal.correlate(envelope, envelope, mode='full', method='fft')[len(envelope)-1:]
    lo = int(60 * SAMPLE_RATE / HOP / 170)
    hi = int(60 * SAMPLE_RATE / HOP / 95)
    lag = lo + int(np.argmax(corr[lo:hi+1]))
    return 60 * SAMPLE_RATE / (HOP * lag)


def pitch_salience(harmonic, frequencies):
    # Whiten broad spectral coloration and combine up to four harmonics.
    baseline = ndimage.median_filter(harmonic, size=(19, 1))
    whitened = np.maximum(0, harmonic - baseline)
    notes = np.arange(36, 85)
    scores = []
    for note in notes:
        fundamental = 440 * 2 ** ((int(note) - 69) / 12)
        score = np.zeros(harmonic.shape[1], dtype=np.float64)
        for overtone in range(1, 5):
            frequency = fundamental * overtone
            center = int(np.argmin(abs(frequencies - frequency)))
            if center + 1 < len(frequencies):
                score += whitened[max(0, center-1):center+2].max(axis=0) / overtone ** 1.5
        scores.append(score)
    return notes, np.asarray(scores)


def pitches_at(scores, midi_notes, frame, low, high):
    window = scores[:, min(frame+2, scores.shape[1]-1):min(frame+11, scores.shape[1])]
    mean = window.mean(axis=1) if window.size else scores[:, frame]
    allowed = (midi_notes >= low) & (midi_notes <= high)
    return midi_notes[allowed], mean[allowed]


def mapped_chord(scores, midi_notes, frame, maximum):
    pitches, strengths = pitches_at(scores, midi_notes, frame, 55, 84)
    by_key = collections.defaultdict(float)
    for pitch, strength in zip(pitches, strengths):
        folded = 48 + int(pitch) % 12
        key = int(WHITE_KEYS[np.argmin(abs(WHITE_KEYS - folded))])
        by_key[key] += float(strength)
    ranked = sorted(by_key, key=lambda key: by_key[key], reverse=True)
    peak = max(by_key.values()) if by_key else 0
    return sorted(key for key in ranked[:maximum] if by_key[key] >= peak * .52)


def make_track(name, events, end_tick):
    track = mido.MidiTrack([mido.MetaMessage('track_name', name=name)])
    previous = 0
    # Note offs precede note ons at the same tick, including repeated pitches.
    for tick, message in sorted(events, key=lambda event: (event[0], event[1].type != 'note_off')):
        track.append(message.copy(time=tick-previous))
        previous = tick
    track.append(mido.MetaMessage('end_of_track', time=max(0, end_tick-previous)))
    return track


def validate(midi, duration, seconds_per_tick):
    counts = {}
    for track in midi.tracks:
        active = {}
        total = 0
        tick = 0
        notes = collections.Counter()
        for event in track:
            assert event.time >= 0
            tick += event.time
            if event.type not in ('note_on', 'note_off'):
                continue
            key = (event.channel, event.note)
            if event.type == 'note_on' and event.velocity:
                assert key not in active, (track.name, 'overlapping pitch', key)
                active[key] = tick
                notes[event.note] += 1
                total += 1
                assert tick * seconds_per_tick < duration
            else:
                assert key in active and tick > active.pop(key), (track.name, 'unpaired note', key)
                assert tick * seconds_per_tick <= duration + .003
        assert not active
        if track.name.startswith('PART REAL_KEYS'):
            assert set(notes) <= set(WHITE_KEYS) | {0}
        counts[track.name] = dict(sorted(notes.items()))
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('audio', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--name', required=True)
    parser.add_argument('--artist', required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Output already exists; choose a new folder to preserve existing charts.')
    executable = imageio_ffmpeg.get_ffmpeg_exe()
    decoded = subprocess.run([executable, '-v', 'error', '-i', str(args.audio), '-map', '0:a:0', '-vn',
                              '-ac', '1', '-ar', str(SAMPLE_RATE), '-f', 'f32le', '-'],
                             capture_output=True, check=True)
    audio = np.frombuffer(decoded.stdout, dtype='<f4')
    duration = len(audio) / SAMPLE_RATE
    frequencies, times, spectrum = signal.stft(audio, SAMPLE_RATE, nperseg=2048, noverlap=2048-HOP)
    amplitude = abs(spectrum)
    horizontal = ndimage.median_filter(amplitude, size=(1, 25))
    vertical = ndimage.median_filter(amplitude, size=(17, 1))
    mask = horizontal ** 2 / (horizontal ** 2 + vertical ** 2 + 1e-12)
    harmonic = amplitude * mask
    percussion = amplitude * (1-mask)
    all_flux = flux(amplitude[(frequencies > 60) & (frequencies < 6000)])
    bpm = estimate_tempo(all_flux)
    tempo = mido.bpm2tempo(bpm)
    seconds_per_tick = tempo / 1e6 / PPQ

    def to_tick(seconds):
        return round(seconds / seconds_per_tick)

    end_tick = to_tick(duration)
    pitched_notes, salience = pitch_salience(harmonic, frequencies)
    envelopes = {
        'guitar': flux(harmonic[(frequencies > 180) & (frequencies < 2600)]),
        'bass': flux(amplitude[(frequencies > 45) & (frequencies < 260)]),
        'keys': flux(harmonic[(frequencies > 250) & (frequencies < 4000)]),
    }
    drum_bands = ((45, 170), (170, 2800), (3500, 9000))
    drum_envelopes = [flux(percussion[(frequencies > lo) & (frequencies < hi)]) for lo, hi in drum_bands]
    thresholds = [.68, .56, .43, .30]
    spacing = [.42, .28, .18, .12]
    chart_notes = collections.defaultdict(list)
    summary = collections.defaultdict(dict)

    def add(instrument, difficulty, time, length, pitches):
        length = min(length, duration - time - .02)
        assert length > 0
        chart_notes[(instrument, difficulty)].append((time, length, list(pitches)))

    for level, difficulty in enumerate(DIFFICULTIES):
        for instrument in ('guitar', 'bass', 'keys'):
            gap = spacing[level] * (1.15 if instrument == 'bass' else 1)
            attacks = select_attacks(envelopes[instrument], times, gap, thresholds[level], duration)
            for index, (time, frame) in enumerate(attacks):
                next_time = attacks[index+1][0] if index+1 < len(attacks) else duration-.02
                length = min(.38 if level <= 1 else .55, max(.09, next_time-time-.035))
                if instrument == 'keys':
                    pitches = mapped_chord(salience, pitched_notes, frame, (1, 2, 2, 3)[level])
                else:
                    lo, hi = (36, 59) if instrument == 'bass' else (52, 83)
                    pitches0, strengths = pitches_at(salience, pitched_notes, frame, lo, hi)
                    strongest = int(pitches0[np.argmax(strengths)])
                    lane = int(np.clip(round((strongest-lo)*4/(hi-lo)), 0, 4))
                    pitches = [lane]
                    if instrument == 'guitar' and level >= 2:
                        ranked = np.argsort(strengths)[::-1]
                        second = int(np.clip(round((int(pitches0[ranked[1]])-lo)*4/(hi-lo)), 0, 4))
                        if second != lane and strengths[ranked[1]] > .8*strengths[ranked[0]]:
                            pitches.append(second)
                if pitches:
                    add(instrument, difficulty, time, length, pitches)

        # Low/mid/high attack envelopes approximate kick, snare and cymbals.
        drums = []
        for band, envelope in enumerate(drum_envelopes):
            gap = spacing[level] * (1.6 if band == 2 and level == 0 else 1)
            for time, frame in select_attacks(envelope, times, gap, thresholds[level], duration):
                lane = (0, 1, 2)[band]
                if band == 2 and level >= 2:
                    hi_strength = envelope[frame] / max(float(np.quantile(envelope, .9)), 1e-9)
                    lane = 4 if hi_strength > 2 else 2
                drums.append((time, lane, float(envelope[frame])))
        # Merge simultaneous hits; reduce chords to two lanes on Easy.
        groups = []
        for time, lane, strength in sorted(drums):
            if groups and abs(time-groups[-1][0]) < .045:
                groups[-1][1].append((lane, strength))
            else:
                groups.append([time, [(lane, strength)]])
        # Independent bands can interleave faster than a difficulty allows.
        # Thin the merged attacks too, preserving simultaneous drum chords.
        kept = []
        for time, hits in sorted(groups, key=lambda group: sum(hit[1] for hit in group[1]), reverse=True):
            if all(abs(time-other[0]) >= spacing[level] for other in kept):
                kept.append((time, hits))
        for time, hits in sorted(kept):
            pitches = sorted(set(lane for lane, _ in sorted(hits, key=lambda hit: hit[1], reverse=True)[:2 if level == 0 else 3]))
            add('drums', difficulty, time, .065, pitches)

    midi = mido.MidiFile(type=1, ticks_per_beat=PPQ)
    midi.tracks.append(make_track('TEMPO', [(0, mido.MetaMessage('set_tempo', tempo=tempo)),
                       (0, mido.MetaMessage('time_signature', numerator=4, denominator=4))], end_tick))
    event_track = [(to_tick(.5), mido.MetaMessage('text', text='[music_start]')),
                   (0, mido.MetaMessage('text', text='[section Inicio]')),
                   (to_tick(duration), mido.MetaMessage('text', text='[end]'))]
    for seconds in range(20, int(duration)-5, 20):
        event_track.append((to_tick(seconds), mido.MetaMessage('text', text=f'[section Trecho {seconds}s]')))
    midi.tracks.append(make_track('EVENTS', event_track, end_tick))
    for instrument in ('guitar', 'bass', 'drums'):
        events = []
        for level, difficulty in enumerate(DIFFICULTIES):
            base = (60, 72, 84, 96)[level]
            for time, length, pitches in chart_notes[(instrument, difficulty)]:
                for pitch in pitches:
                    events.extend([(to_tick(time), mido.Message('note_on', note=base+pitch, velocity=100)),
                                   (to_tick(time+length), mido.Message('note_off', note=base+pitch))])
        midi.tracks.append(make_track('PART ' + instrument.upper(), events, end_tick))
    for level, difficulty in enumerate(DIFFICULTIES):
        events = [(0, mido.Message('note_on', note=0, velocity=100)),
                  (end_tick, mido.Message('note_off', note=0))]
        for time, length, pitches in chart_notes[('keys', difficulty)]:
            for pitch in pitches:
                events.extend([(to_tick(time), mido.Message('note_on', note=pitch, velocity=100)),
                               (to_tick(time+length), mido.Message('note_off', note=pitch))])
        midi.tracks.append(make_track('PART REAL_KEYS_' + ('E', 'M', 'H', 'X')[level], events, end_tick))

    counts = validate(midi, duration, seconds_per_tick)
    for (instrument, difficulty), notes in chart_notes.items():
        summary[instrument][difficulty] = {'attacks': len(notes), 'notes': sum(len(n[2]) for n in notes)}
    args.output.mkdir(parents=True)
    midi.save(args.output / 'notes.mid')
    # Standard OGG avoids MP3 decoder delay differences during playback.
    subprocess.run([executable, '-v', 'error', '-n', '-i', str(args.audio), '-map', '0:a:0', '-vn', '-af', 'asetpts=N/SR/TB',
                    '-c:a', 'libvorbis', '-q:a', '7', str(args.output / 'song.ogg')], check=True)
    (args.output / 'song.ini').write_text(f'''[song]
name = {args.name} (teste MP3)
artist = {args.artist}
charter = Codex - chart automatico experimental
genre = Teste
song_length = {round(duration*1000)}
preview_start_time = 5000
delay = 0
diff_guitar = 3
diff_bass = 3
diff_drums = 3
diff_keys_real = 3
pro_drums = False
five_lane_drums = False
loading_phrase = Chart experimental de audio mixado. Teclado 7K: Z X C V B N M.
''', encoding='utf-8')
    analysis = {'source_file': str(args.audio), 'source_sha256': hashlib.sha256(args.audio.read_bytes()).hexdigest(),
                'duration_seconds': duration, 'estimated_bpm': bpm, 'midi_tempo': tempo,
                'method': 'spectral attacks and harmonic salience from mixed audio; experimental',
                'instruments': summary, 'track_note_counts': counts,
                'keyboard_midi_pitches': list(map(int, WHITE_KEYS)),
                'in_game_test': 'Not run', 'isolated_stems': False}
    (args.output / 'analysis.json').write_text(json.dumps(analysis, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'output': str(args.output), 'seconds': duration, 'bpm': bpm, 'instruments': summary}, indent=2))


if __name__ == '__main__':
    main()
