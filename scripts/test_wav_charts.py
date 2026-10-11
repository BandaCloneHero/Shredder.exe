"""Musical fixtures with known attacks/pitches, plus batch lifecycle tests."""
import os
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
os.environ.setdefault('OMP_NUM_THREADS', '1')

import argparse
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import numpy as np
from scipy.io import wavfile

import generate_charts_batch as batch
from wav_chart_analysis import (DT, INSTRUMENTS, Event, activity, analyze, bass_events,
                                beat_analysis, difficulty_charts, drum_identity,
                                drums_events, guitar_events, keys_events, musical_checks)

SR = 22050


def tone(pitches, duration=.4, harmonics=4):
    t = np.arange(round(duration*SR))/SR
    x = sum(sum(np.sin(2*np.pi*440*2**((pitch-69)/12)*h*t)/h**1.15
                for h in range(1, harmonics+1)) for pitch in pitches)
    edge = np.minimum(t/.008, 1)*np.minimum((duration-t)/.025, 1)
    return (x*edge*.10).astype(np.float32)


def sequence(spec, duration=4.):
    audio = np.zeros(round(duration*SR), dtype=np.float32)
    for start, pitches, length in spec:
        note = tone(pitches, length)
        first = round(start*SR)
        audio[first:first+len(note)] += note[:len(audio)-first]
    return audio


def percussion(kind, duration=.3, seed=1):
    t = np.arange(round(duration*SR))/SR
    rng = np.random.default_rng(seed)
    if kind == 'kick':
        x = np.sin(2*np.pi*65*t)*np.exp(-t/.07)
    elif kind == 'tom':
        x = np.sin(2*np.pi*240*t)*np.exp(-t/.09)
    elif kind == 'snare':
        x = (.55*rng.normal(size=len(t))+.5*np.sin(2*np.pi*185*t))*np.exp(-t/.055)
    else:
        noise = rng.normal(size=len(t))
        from scipy import signal
        x = signal.sosfilt(signal.butter(4, 4000, fs=SR, btype='highpass', output='sos'), noise)
        x *= np.exp(-t/(.035 if kind == 'hihat' else .20))
    return (x*np.minimum(t/.002, 1)*.2).astype(np.float32)


class MusicalAnalysisTests(unittest.TestCase):
    def test_silence_and_numeric_tails_do_not_invent_notes(self):
        for kind in INSTRUMENTS:
            for amplitude in (0., 1e-7):
                audio = np.full(SR*2, amplitude, dtype=np.float32)
                self.assertEqual(analyze(audio, kind)['events'], [], kind)

    def test_bass_attacks_pitch_and_octave(self):
        expected = [(.30, [33], .35), (1.0, [40], .40), (1.8, [45], .4), (2.5, [40], .55)]
        events, diagnostics = bass_events(sequence(expected))
        for start, pitches, length in expected:
            matched = [e for e in events if abs(e.start-start) < .065 and e.pitches == pitches]
            self.assertTrue(matched, (start, pitches, [(e.start, e.pitches) for e in events]))
            self.assertLessEqual(matched[0].end, start+length+.09)
        self.assertLessEqual(len(events), 6, 'pitch flicker duplicated bass notes')

    def test_bass_repeated_pitch_keeps_new_attacks(self):
        expected = [(.3, [40], .22), (.8, [40], .22), (1.3, [40], .22)]
        events, _ = bass_events(sequence(expected, 2.))
        for start, pitches, _ in expected:
            self.assertTrue(any(abs(e.start-start) < .065 and e.pitches == pitches for e in events))

    def test_detuned_guitar_and_keyboard_keep_nominal_pitches(self):
        detuned = sequence([(.3, [60.35, 64.35, 67.35], .7)], 2.)
        for function in (guitar_events, keys_events):
            events, diagnostics = function(detuned)
            self.assertLess(abs(diagnostics['tuning']['cents']-35), 8)
            for pitch in (60, 64, 67):
                self.assertTrue(any(pitch in e.pitches for e in events), (function.__name__, pitch, events))

    def test_guitar_repeated_strums_and_chord_support(self):
        expected = [(.3, [52, 55, 59], .22), (.8, [52, 55, 59], .22),
                    (1.3, [52, 55, 59], .22), (2.0, [57], .55)]
        events, _ = guitar_events(sequence(expected))
        for start, pitches, length in expected:
            matches = [e for e in events if abs(e.start-start) < .06]
            self.assertTrue(matches, (start, [(e.start, e.pitches) for e in events]))
            self.assertTrue(set(pitches) & set(matches[0].pitches))
        self.assertTrue(any(len(e.pitches) >= 2 for e in events))

    def test_keyboard_chords_hold_and_silence_between_phrases(self):
        expected = [(.3, [60, 64, 67], .70), (1.6, [62, 65, 69], .65)]
        events, _ = keys_events(sequence(expected, 3.))
        for start, pitches, length in expected:
            for pitch in pitches:
                matches = [e for e in events if e.pitches == [pitch] and abs(e.start-start) < .09]
                self.assertTrue(matches, (start, pitch, [(e.start, e.pitches) for e in events]))
                self.assertGreater(matches[0].end-matches[0].start, .40)
        self.assertFalse(any(1.20 < e.start < 1.50 or e.start > 2.50 for e in events))

    def test_drum_physical_features_and_simultaneous_mapping(self):
        from wav_chart_analysis import stft
        for kind in ('kick', 'snare', 'hihat', 'tom', 'crash'):
            sound = percussion(kind)
            f, t, magnitude = stft(sound, 2048)
            spectrum = np.sqrt(np.mean(magnitude[:, 1:5]**2, axis=1))
            tail = np.linalg.norm(magnitude[:, 10:20])/np.sqrt(10)/np.linalg.norm(spectrum)
            identified, _ = drum_identity(f, spectrum, tail)
            self.assertEqual(identified, kind, (kind, identified, tail))
        events = [Event(1., 1.045, [lane], 1., .9, kind) for lane, kind in (
            (0, 'kick'), (1, 'snare'), (2, 'hihat'))]
        value = {'instrument': 'drums', 'duration': 3., 'events': [e.__dict__ for e in events]}
        charts = difficulty_charts(value, {'beats': [0., 1., 2.]})
        self.assertEqual({n[2] for n in charts['Expert']}, {0, 1, 2})
        self.assertLessEqual(len(charts['Easy']), 2)

    def test_adaptive_drum_detection_on_known_recording(self):
        audio = np.zeros(SR*5, dtype=np.float32)
        expected = []
        for index, kind in enumerate(('kick', 'snare', 'hihat', 'tom', 'crash')*2):
            start = .25+index*.45
            hit = percussion(kind, seed=index+1)
            first = round(start*SR)
            audio[first:first+len(hit)] += hit
            expected.append((start, kind))
        events, info = drums_events(audio)
        matches = sum(any(e.kind == kind and abs(e.start-start) < .08 for e in events)
                      for start, kind in expected)
        self.assertGreaterEqual(matches, 8, (matches, [(e.start, e.kind) for e in events], info))
        self.assertLessEqual(len(events), 16, 'one physical hit was split into too many pads')

    def test_audio_simultaneous_drums_not_blanket_suppressed(self):
        audio = np.zeros(SR*7, dtype=np.float32)
        for index, kind in enumerate(('kick', 'snare', 'hihat', 'tom', 'crash')*2):
            start = .25+index*.45
            hit = percussion(kind, seed=index+1)
            first = round(start*SR)
            audio[first:first+len(hit)] += hit
        for kind in ('kick', 'snare', 'hihat'):
            first = round(5.5*SR)
            hit = percussion(kind, seed=41)
            audio[first:first+len(hit)] += hit
        events, diagnostics = drums_events(audio)
        detected = {e.kind for e in events if abs(e.start-5.5) < .08}
        self.assertEqual(detected, {'kick', 'snare', 'hihat'}, (detected, diagnostics))

    def test_easy_drums_limit_global_alternating_density(self):
        events = [Event(.3+i*.09, .34+i*.09, [i%5], 1., .9, 'drums') for i in range(20)]
        value = {'instrument': 'drums', 'duration': 3., 'events': [e.__dict__ for e in events]}
        charts = difficulty_charts(value, {'beats': [0., .5, 1., 1.5, 2.]})
        times = np.unique([n[0] for n in charts['Easy']])
        self.assertTrue(np.all(np.diff(times) >= .28))
        self.assertLess(len(times), 9)
        self.assertEqual(len(charts['Expert']), 20)

    def test_beat_estimate_and_unquantized_clock(self):
        audio = np.zeros(SR*8, dtype=np.float32)
        for start in np.arange(.3, 7.5, .5):
            first = round(start*SR)
            hit = percussion('kick')
            audio[first:first+len(hit)] += hit
        beat = beat_analysis(audio)
        self.assertLess(abs(beat['bpm']-120), 4)
        value = {'instrument': 'bass', 'duration': 3., 'events': [
            Event(.317, .7, [40], 1., .9).__dict__, Event(1.083, 1.5, [43], 1., .9).__dict__]}
        charts = difficulty_charts(value, beat)
        self.assertEqual([n[0] for n in charts['Expert']], [.317, 1.083])

    def test_mapping_no_impossible_chords_and_midi_roundtrip(self):
        beat = {'beats': [0, 1, 2, 3], 'bpm': 120}
        charts = {}
        for kind in INSTRUMENTS:
            events = [Event(.3, .95, ([60, 64, 67] if kind != 'drums' else [0, 1, 2]), 1., .9),
                      Event(1.1, 1.6, ([62, 65, 69] if kind != 'drums' else [0, 3, 4]), 1., .9)]
            if kind == 'bass':
                for e in events:
                    e.pitches = e.pitches[:1]
            value = {'instrument': kind, 'duration': 3., 'events': [e.__dict__ for e in events],
                     'diagnostics': {'independent_onsets': [.3, 1.1]}}
            charts[kind] = difficulty_charts(value, beat)
            check = musical_checks(value, charts[kind], np.ones(SR*3, dtype=np.float32)*.1)
            self.assertEqual(check['structural_errors'], [])
            self.assertFalse(check['musical_correctness_certified'])
        with tempfile.TemporaryDirectory() as tmp:
            report = batch.write_midi(charts, 3., 120., Path(tmp)/'notes.mid')
            self.assertEqual(report['roundtrip'], 'passed')
            self.assertEqual(len(batch.midi_summary(Path(tmp)/'notes.mid')[('keys', 'Expert')]), 6)

    def test_missing_notes_and_unsupported_sustains_are_reported(self):
        audio = sequence([(.3, [60], .3), (1.4, [60], .4)], 3.)
        value = {'instrument': 'bass', 'events': [], 'diagnostics': {'independent_onsets': [.3, 1.4]}}
        charts = {d: [[.3, 1.3, 0]] for d in batch.DIFFICULTIES}
        report = musical_checks(value, charts, audio)
        self.assertIn(1.4, report['difficulties']['Expert']['uncovered_onset_times'])
        self.assertEqual(report['difficulties']['Expert']['suspect_hold_times'], [.3])

    def test_keyboard_hand_limits_include_previous_sustains(self):
        events = [Event(.3, 2.5, [60, 64, 67], 1., .9),
                  Event(1.1, 2.5, [62, 65, 69], 1., .9)]
        value = {'instrument': 'keys', 'duration': 3., 'events': [e.__dict__ for e in events],
                 'diagnostics': {'independent_onsets': [.3, 1.1]}}
        charts = difficulty_charts(value, {'beats': [0., 1., 2.]})
        for level, name in enumerate(batch.DIFFICULTIES):
            chart = charts[name]
            for time in {n[0] for n in chart}:
                self.assertLessEqual(sum(n[0] <= time < n[1] for n in chart), (1, 2, 3, 4)[level])


class BatchLifecycleTests(unittest.TestCase):
    def test_input_discovery_rejects_ambiguity_and_ignores_midis(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)/'song'
            folder.mkdir()
            for kind in INSTRUMENTS:
                (folder/(kind+'.wav')).touch()
                (folder/(kind+'_basic_pitch_transcription.mid')).write_bytes(b'INVALID DO NOT READ')
            self.assertEqual(batch.discover(Path(tmp)), [folder])
            stems, mix, settings = batch.identify_folder(folder)
            self.assertEqual(len(stems), 4)
            self.assertIsNone(mix)
            (folder/'guitar-second.wav').touch()
            with self.assertRaises(ValueError):
                batch.identify_folder(folder)

    def test_complete_resume_immutable_revision_partial_processing_and_changed_audio(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source, output = root/'input'/'song', root/'out'
            source.mkdir(parents=True)
            output.mkdir()
            for kind in INSTRUMENTS:
                audio = sequence([(.3, [40 if kind == 'bass' else 60], .3),
                                  (1., [43 if kind == 'bass' else 64], .4)], 2.)
                if kind == 'drums':
                    audio = np.zeros(SR*2, dtype=np.float32)
                    for start, drum in ((.3, 'kick'), (1., 'snare')):
                        sound = percussion(drum)
                        first = round(start*SR)
                        audio[first:first+len(sound)] += sound
                wavfile.write(source/(kind+'.wav'), SR, audio)
                (source/(kind+'.mid')).write_bytes(b'INVALID MIDI')
            args = argparse.Namespace(output=output, artist='Test', resume=True, instrument=None, compare=None)
            impl = batch.implementation_hash()
            def run():
                with tempfile.TemporaryDirectory(dir=output) as work:
                    return batch.process(source, args, Path(work), impl)
            first = run()
            folder = Path(first['output'])
            self.assertTrue(batch.artifacts_valid(folder))
            original_hashes = {p.name: batch.digest(p) for p in folder.iterdir()}
            self.assertEqual(run()['status'], 'skipped_complete')
            args.instrument = 'bass'
            real_analyze = batch.analyze
            with mock.patch.object(batch, 'analyze', wraps=real_analyze) as spy:
                second = run()
            self.assertNotEqual(first['output'], second['output'])
            self.assertEqual([call.args[1] for call in spy.call_args_list], ['bass'])
            second_report = batch.read_json(Path(second['output'])/'analysis.json')
            first_report = batch.read_json(folder/'analysis.json')
            for kind in ('guitar', 'keys', 'drums'):
                self.assertEqual(first_report['charts'][kind], second_report['charts'][kind])
            self.assertEqual(original_hashes, {p.name: batch.digest(p) for p in folder.iterdir()})
            # Editing the selected stem must also refresh its OGG and shared mix.
            wavfile.write(source/'bass.wav', SR, sequence([(.4, [45], .5)], 2.))
            third = run()
            self.assertNotEqual(batch.digest(Path(second['output'])/'bass.ogg'), batch.digest(Path(third['output'])/'bass.ogg'))
            wavfile.write(source/'keys.wav', SR, np.zeros(SR*2, dtype=np.float32))
            with self.assertRaisesRegex(ValueError, 'Unselected source'):
                run()
            (folder/'notes.mid').write_bytes(b'CORRUPTED')
            self.assertFalse(batch.artifacts_valid(folder))

    def test_misaligned_and_unequal_audio_rejected(self):
        count = 44100*2
        rng = np.random.default_rng(5)
        audio = rng.normal(0, .1, (count, 2)).astype(np.float32)
        raw = {kind: audio/4 for kind in INSTRUMENTS}
        raw['mix'] = np.roll(audio, 1000, axis=0)
        with self.assertRaisesRegex(ValueError, 'differ by'):
            batch.alignment(raw)
        raw.pop('mix')
        raw['bass'] = raw['bass'][:-1]
        with self.assertRaisesRegex(ValueError, 'sample counts'):
            batch.alignment(raw)

    def test_batch_continues_after_bad_song(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ('bad', 'good'):
                folder = root/'input'/name
                folder.mkdir(parents=True)
                for kind in INSTRUMENTS:
                    (folder/(kind+'.wav')).touch()
            output = root/'output'
            def fake_process(folder, args, work, implementation):
                if folder.name == 'bad':
                    raise ValueError('fixture error')
                return {'source': str(folder), 'status': 'generated'}
            with mock.patch('sys.argv', ['generate_charts_batch.py', str(root/'input'), '--output', str(output)]), \
                 mock.patch.object(batch, 'process', side_effect=fake_process):
                self.assertEqual(batch.main(), 1)
            report = batch.read_json(next(output.glob('batch-report-*.json')))
            self.assertEqual([r['status'] for r in report['songs']], ['error', 'generated'])
            self.assertFalse((output/'.batch.lock').exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
