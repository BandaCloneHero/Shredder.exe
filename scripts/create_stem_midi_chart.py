#!/usr/bin/env python3
"""Adapt Basic Pitch MIDIs and separate WAVs to a Shredder song folder.

Dependencies: numpy, scipy, mido, imageio-ffmpeg.
Usage: create_stem_midi_chart.py SOURCE_FOLDER OUTPUT_FOLDER --artist ARTIST
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

import imageio_ffmpeg
import mido
import numpy as np
from scipy import signal

from create_mp3_test_chart import (
    DIFFICULTIES, HOP, PPQ, SAMPLE_RATE, WHITE_KEYS, estimate_tempo,
    flux, make_track, select_attacks, validate,
)


def read_notes(path):
    """Read actual seconds across all tracks using the source tempo map."""
    active = collections.defaultdict(collections.deque)
    notes = []
    seconds = 0
    for event in mido.MidiFile(path):
        seconds += event.time
        if event.type not in ('note_on', 'note_off'):
            continue
        key = (event.channel, event.note)
        if event.type == 'note_on' and event.velocity:
            active[key].append((seconds, event.velocity))
        elif active.get(key):
            start, velocity = active[key].popleft()
            if not active[key]:
                del active[key]
            if seconds-start >= .025:
                notes.append((start, seconds, event.note, velocity))
    if active:
        raise ValueError(f'Unpaired source MIDI notes: {path}')
    return sorted(notes)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--artist', required=True)
    parser.add_argument('--name', default='Pro Dia Nascer Feliz')
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Choose a new output folder; existing songs are preserved.')
    instruments = {'guitar': 'guitar', 'bass': 'bass', 'keys': 'keys', 'drums': 'drum'}

    def unique(pattern):
        paths = list(args.source.glob(pattern))
        if len(paths) != 1:
            parser.error(f'Expected one {pattern}, found {len(paths)}')
        return paths[0]

    sources = {i: unique(prefix+'*.wav') for i, prefix in instruments.items()}
    transcriptions = {i: unique(prefix+'*transcription.mid') for i, prefix in instruments.items()}
    full_audio = unique('*.mp3')
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    fingerprints = {str(p): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in [full_audio, *sources.values(), *transcriptions.values()]}
    report = {'source_hashes': fingerprints, 'isolated_stems': True,
              'in_game_test': 'Not run', 'keyboard_midi_pitches': list(map(int, WHITE_KEYS)),
              'note_sources': {i: str(transcriptions[i]) for i in ['guitar', 'bass', 'keys']},
              'drum_note_source': str(sources['drums']),
              'drum_midi': {'path': str(transcriptions['drums']),
                            'pitched_notes': len(read_notes(transcriptions['drums'])),
                            'used_for_lane_assignment': False}}

    with tempfile.TemporaryDirectory(prefix='shredder-stems-') as temporary:
        work = Path(temporary)
        raw = {}
        for instrument, path in {'mix': full_audio, **sources}.items():
            target = work / (instrument+'.f32')
            subprocess.run([ffmpeg, '-v', 'error', '-xerror', '-i', str(path),
                            '-map', '0:a:0', '-vn', '-ac', '2', '-ar', '44100',
                            '-f', 'f32le', str(target)], check=True)
            raw[instrument] = np.memmap(target, dtype='<f4', mode='r').reshape(-1, 2)
        frames = len(raw['mix'])
        if any(len(data) != frames for data in raw.values()):
            raise ValueError('Audio files have different sample counts; align them before generating.')
        duration = frames / 44100
        # Check that the full mix and the separated waveforms share their origin.
        chunk = min(frames, 44100*60)
        mix_probe = raw['mix'][:chunk].mean(axis=1)[::10]
        stem_probe = sum(raw[i][:chunk].mean(axis=1)[::10] for i in sources)
        correlation = signal.correlate(mix_probe, stem_probe, method='fft')
        lags = signal.correlation_lags(len(mix_probe), len(stem_probe))
        allowed = abs(lags) < 2205
        lag = int(lags[allowed][np.argmax(correlation[allowed])])
        if abs(lag/4410) > .005:
            raise ValueError(f'Stem/mix alignment mismatch: {lag/4410:.6f}s')
        report['alignment'] = {'samples_per_file': frames, 'sample_rate': 44100,
                               'waveform_lag_seconds': lag/4410,
                               'normalized_correlation': float(correlation[allowed].max()/np.sqrt(
                                   np.dot(mix_probe, mix_probe)*np.dot(stem_probe, stem_probe)))}

        # Only the drum WAV determines drum attacks and the estimated beat.
        drum = signal.resample_poly(raw['drums'].mean(axis=1), 1, 2)
        frequencies, times, spectrum = signal.stft(drum, SAMPLE_RATE, nperseg=2048, noverlap=2048-HOP)
        amplitude = abs(spectrum)
        bpm = estimate_tempo(flux(amplitude[(frequencies > 45) & (frequencies < 9000)]))
        tempo = mido.bpm2tempo(bpm)
        seconds_per_tick = tempo / 1e6 / PPQ
        tick = lambda seconds: round(seconds/seconds_per_tick)
        end_tick = tick(duration)
        charts = collections.defaultdict(list)
        source_counts = {}

        for instrument in ['guitar', 'bass', 'keys']:
            notes = [n for n in read_notes(transcriptions[instrument]) if n[0] < duration-.05]
            source_counts[instrument] = len(notes)
            if not notes:
                raise ValueError(f'No usable notes in {transcriptions[instrument]}')
            low, high = np.quantile([n[2] for n in notes], [.05, .95])
            span = max(1, high-low)
            groups = []
            for note in notes:
                if groups and note[0]-groups[-1][0] <= .035:
                    groups[-1][1].append(note)
                else:
                    groups.append([note[0], [note]])
            for level, difficulty in enumerate(DIFFICULTIES):
                spacing = (.42, .28, .16, .065)[level]
                kept = []
                for start, group in sorted(groups, key=lambda g: max(n[3] for n in g[1]), reverse=True):
                    if all(abs(start-other[0]) >= spacing for other in kept):
                        kept.append((start, group))
                for start, group in sorted(kept):
                    mapped = {}
                    for onset, end, pitch, velocity in group:
                        if instrument == 'keys':
                            folded = 48+pitch%12
                            lane = int(WHITE_KEYS[np.argmin(abs(WHITE_KEYS-folded))])
                        else:
                            lane = int(np.clip(round((pitch-low)*4/span), 0, 4))
                        previous = mapped.get(lane)
                        if previous is None or velocity > previous[1]:
                            mapped[lane] = (min(end, start+3, duration-.01), velocity)
                    max_chord = (1, 2, 2, 3)[level] if instrument == 'keys' else (
                        (1, 1, 2, 2)[level] if instrument == 'guitar' else 1)
                    selected = sorted(mapped, key=lambda p: mapped[p][1], reverse=True)[:max_chord]
                    for lane in selected:
                        charts[(instrument, difficulty)].append([start, mapped[lane][0], lane])

        envelopes = [flux(amplitude[(frequencies > low) & (frequencies < high)])
                     for low, high in [(45, 170), (170, 2800), (3500, 9000)]]
        for level, difficulty in enumerate(DIFFICULTIES):
            gap = (.42, .28, .18, .12)[level]
            hits = []
            for band, envelope in enumerate(envelopes):
                for start, frame in select_attacks(envelope, times, gap, (.68, .56, .43, .30)[level], duration):
                    lane = band
                    if band == 2 and level >= 2 and envelope[frame] > 2*np.quantile(envelope, .9):
                        lane = 4
                    hits.append((start, lane, float(envelope[frame])))
            groups = []
            for start, lane, strength in sorted(hits):
                if groups and start-groups[-1][0] < .045:
                    groups[-1][1].append((lane, strength))
                else:
                    groups.append([start, [(lane, strength)]])
            kept = []
            for start, group in sorted(groups, key=lambda g: sum(n[1] for n in g[1]), reverse=True):
                if all(abs(start-other[0]) >= gap for other in kept):
                    kept.append((start, group))
            for start, group in sorted(kept):
                lanes = set(n[0] for n in sorted(group, key=lambda n: n[1], reverse=True)[:2 if level == 0 else 3])
                for lane in lanes:
                    charts[('drums', difficulty)].append([start, min(start+.065, duration-.01), lane])

        # Folding octaves can put overlapping source notes on the same game lane.
        # Shorten the preceding hold at the next onset; retain actual onset times.
        for chart in charts.values():
            by_pitch = collections.defaultdict(list)
            for note in chart:
                by_pitch[note[2]].append(note)
            for lane_notes in by_pitch.values():
                lane_notes.sort()
                for current, following in zip(lane_notes, lane_notes[1:]):
                    current[1] = min(current[1], following[0]-.004)
            chart[:] = [n for n in chart if n[1]-n[0] >= .02]

        # The large analysis arrays are no longer needed during audio export.
        del spectrum, amplitude, drum, correlation, stem_probe, mix_probe

        midi = mido.MidiFile(type=1, ticks_per_beat=PPQ)
        midi.tracks.append(make_track('TEMPO', [(0, mido.MetaMessage('set_tempo', tempo=tempo)),
                           (0, mido.MetaMessage('time_signature', numerator=4, denominator=4))], end_tick))
        events = [(0, mido.MetaMessage('text', text='[section Inicio]')),
                  (end_tick, mido.MetaMessage('text', text='[end]'))]
        for seconds in range(30, int(duration)-5, 30):
            events.append((tick(seconds), mido.MetaMessage('text', text=f'[section Trecho {seconds}s]')))
        midi.tracks.append(make_track('EVENTS', events, end_tick))
        summary = collections.defaultdict(dict)
        for instrument in instruments:
            combined = []
            for level, difficulty in enumerate(DIFFICULTIES):
                events = []
                if instrument == 'keys':
                    events = [(0, mido.Message('note_on', note=0, velocity=100)),
                              (end_tick, mido.Message('note_off', note=0))]
                chart = charts[(instrument, difficulty)]
                summary[instrument][difficulty] = len(chart)
                for start, end, pitch in chart:
                    game_pitch = pitch if instrument == 'keys' else (60, 72, 84, 96)[level]+pitch
                    events.extend([(tick(start), mido.Message('note_on', note=game_pitch, velocity=100)),
                                   (tick(end), mido.Message('note_off', note=game_pitch))])
                if instrument == 'keys':
                    midi.tracks.append(make_track('PART REAL_KEYS_'+('E', 'M', 'H', 'X')[level], events, end_tick))
                else:
                    combined.extend(events)
            if instrument != 'keys':
                midi.tracks.append(make_track('PART '+instrument.upper(), combined, end_tick))
        counts = validate(midi, duration, seconds_per_tick)

        # Do not play the full mix alongside the instrument stems: that doubles
        # those instruments. Recover vocals/other accompaniment by subtraction.
        residual_path = work/'song.f32'
        residual = np.memmap(residual_path, dtype='<f4', mode='w+', shape=(frames, 2))
        maximum = max(float(np.max(abs(data))) for data in raw.values())
        reconstruction_error = 0
        for start in range(0, frames, 262144):
            stop = min(frames, start+262144)
            total = sum(raw[i][start:stop] for i in sources)
            residual[start:stop] = raw['mix'][start:stop]-total
            maximum = max(maximum, float(np.max(abs(residual[start:stop]))))
            reconstruction_error = max(reconstruction_error, float(np.max(abs(
                total+residual[start:stop]-raw['mix'][start:stop]))))
        residual.flush()
        gain = min(1., .94/max(maximum, 1e-9))
        args.output.mkdir(parents=True)
        midi.save(args.output/'notes.mid')
        validate(mido.MidiFile(args.output/'notes.mid'), duration, seconds_per_tick)
        audio_validation = {}
        for instrument in [*sources, 'song']:
            path = work/(instrument+'.f32')
            destination = args.output/(instrument+'.ogg')
            subprocess.run([ffmpeg, '-v', 'error', '-n', '-f', 'f32le', '-ar', '44100', '-ac', '2',
                            '-i', str(path), '-af', f'volume={gain},asetpts=N/SR/TB',
                            '-c:a', 'libvorbis', '-q:a', '7', str(destination)], check=True)
            check = subprocess.run([ffmpeg, '-v', 'error', '-xerror', '-i', str(destination),
                                    '-f', 'f32le', '-'], capture_output=True, check=True)
            if check.stderr or abs(len(check.stdout)/8/44100-duration) > .025:
                raise ValueError(f'Output audio validation failed: {destination}')
            audio_validation[instrument] = {'full_decode': 'passed', 'samples': len(check.stdout)//8}
        report.update(duration_seconds=duration, estimated_bpm=bpm, midi_tempo=tempo,
                      source_midi_notes=source_counts, instruments=summary, track_note_counts=counts,
                      shared_audio_gain=gain, residual_reconstruction_max_error=reconstruction_error,
                      audio_validation=audio_validation, midi_roundtrip='passed',
                      method='provided MIDI adaptation for pitched instruments; separated WAV drum attacks')
        (args.output/'song.ini').write_text(f'''[song]
name = {args.name} (stems e MIDI)
artist = {args.artist}
charter = Basic Pitch + Codex (adaptacao)
genre = Rock
song_length = {round(duration*1000)}
preview_start_time = 30000
delay = 0
diff_guitar = 3
diff_bass = 3
diff_drums = 3
diff_keys_real = 3
pro_drums = False
five_lane_drums = False
loading_phrase = MIDI adaptado de pistas separadas. Pro Keys 7K: Z X C V B N M.
''', encoding='utf-8')
        (args.output/'analysis.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
        print(json.dumps({'output': str(args.output), 'duration_seconds': duration,
                          'bpm': bpm, 'instruments': summary, 'gain': gain}, indent=2))


if __name__ == '__main__':
    main()
