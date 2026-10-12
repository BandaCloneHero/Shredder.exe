"""Known audio/gap fixtures for explicit gameplay adaptations and MP3 alignment."""
import collections
from pathlib import Path
import tempfile
import unittest

import numpy as np
import generate_charts_batch as batch

from chart_playability import accompany_keys, original_audio_layout, refine_groove
from test_wav_charts import percussion
from wav_chart_analysis import analyze, difficulty_charts, SAMPLE_RATE


class PlayabilityTests(unittest.TestCase):
    def test_original_export_has_full_mix_only(self):
        frames = 44100
        t = np.arange(frames)/44100
        mix = np.column_stack([.2*np.sin(2*np.pi*440*t), .15*np.sin(2*np.pi*660*t)]).astype('<f4')
        raw = {i: mix*.1 for i in ('guitar', 'bass', 'drums', 'keys')}
        raw['mix'] = mix
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            output = work/'output'
            output.mkdir()
            report = batch.export_audio(raw, work, output, original=True)
            self.assertEqual([p.name for p in output.iterdir()], ['song.ogg'])
            self.assertTrue(report['original_recording_only'])
            decoded = batch.decode_stereo(output/'song.ogg', work/'decoded.f32')
            length = min(len(decoded), len(mix))
            self.assertGreater(np.corrcoef(decoded[:length].ravel(), mix[:length].ravel())[0, 1], .99)

    def test_original_mix_encoder_padding_and_common_lag(self):
        rng = np.random.default_rng(42)
        signal = rng.normal(0, .05, (44100*2, 2)).astype(np.float32)
        shift = 1100
        mix = np.zeros((len(signal)+200, 2), dtype=np.float32)
        mix[shift:] = signal[:len(mix)-shift]
        raw = {i: signal/4 for i in ('guitar', 'bass', 'drums', 'keys')}
        raw['mix'] = mix
        with tempfile.TemporaryDirectory() as tmp:
            aligned, report = original_audio_layout(raw, Path(tmp))
            self.assertAlmostEqual(report['common_stem_shift_ms'], shift/44.1, delta=.25)
            self.assertEqual(len(aligned['drums']), len(mix))
            self.assertGreater(report['mix_probes'][0]['correlation'], .95)
            summed = sum(aligned[i] for i in ('guitar', 'bass', 'drums', 'keys'))
            np.testing.assert_allclose(summed, mix, atol=1e-7)

    def test_wrong_recording_is_rejected(self):
        rng = np.random.default_rng(12)
        raw = {i: rng.normal(0, .1, (44100*2, 2)).astype(np.float32)
               for i in ('guitar', 'bass', 'drums', 'keys', 'mix')}
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, 'alignment evidence'):
                original_audio_layout(raw, Path(tmp))

    def test_accompaniment_fills_rests_preserves_notes_and_holds(self):
        original = [[1., 1.1, 48], [10., 12., 52], [28., 28.1, 55]]
        charts = {d: [list(n) for n in original] for d in ('Easy', 'Medium', 'Hard', 'Expert')}
        analyses = {i: {'events': []} for i in ('bass', 'guitar', 'drums')}
        beat = {'bpm': 120., 'beats': list(np.arange(.5, 32, .5))}
        mix = np.full(SAMPLE_RATE*32, .15, dtype=np.float32)
        adapted, report = accompany_keys(charts, analyses, beat, mix)
        self.assertTrue(report['synthetic_gameplay_adaptation'])
        self.assertGreater(len(adapted['Expert']), 40)
        self.assertEqual(charts['Expert'], original)
        for note in original:
            self.assertIn(note, adapted['Expert'])
        additions = report['added_notes']['Expert']
        self.assertTrue(all(not 10 <= n['time'] <= 12 for n in additions))
        self.assertLess(max(np.diff([n[0] for n in adapted['Expert']])), 3.)
        self.assertTrue(all(n['lane'] in (48, 50, 52, 53, 55, 57, 59) for n in additions))

    def test_silent_mix_gets_no_accompaniment(self):
        charts = {d: [] for d in ('Easy', 'Medium', 'Hard', 'Expert')}
        analyses = {i: {'events': []} for i in ('bass', 'guitar', 'drums')}
        adapted, _ = accompany_keys(charts, analyses, {'bpm': 120., 'beats': [1, 2, 3]},
                                     np.zeros(SAMPLE_RATE*5, dtype=np.float32))
        self.assertEqual(adapted, charts)

    def test_high_band_recovery_does_not_turn_tonal_toms_into_hats(self):
        audio = np.zeros(SAMPLE_RATE*5, dtype=np.float32)
        for start, kind in ((.5, 'tom'), (1., 'hihat'), (1.5, 'hihat'), (2., 'tom'), (2.5, 'hihat')):
            sound = percussion(kind)
            frame = round(start*SAMPLE_RATE)
            audio[frame:frame+len(sound)] += sound
        # Remove hats from the initial analysis to simulate sparse dictionary misses.
        analysis = analyze(audio, 'drums')
        analysis['events'] = [e for e in analysis['events'] if e['kind'] not in ('hihat', 'crash')]
        refined = refine_groove(analysis, audio, {'bpm': 120.})
        hats = [e['start'] for e in refined['events'] if e['kind'] == 'hihat']
        self.assertTrue(all(any(abs(t-start) < .06 for t in hats) for start in (1., 1.5, 2.5)))
        self.assertTrue(all(abs(t-.5) > .08 and abs(t-2.) > .08 for t in hats))
        self.assertEqual(refined['diagnostics']['groove_refinement']['forced_pattern_hits'], 0)
        chart = difficulty_charts(refined, {'bpm': 120., 'beats': list(np.arange(0, 5, .5))})
        self.assertGreater(len(chart['Expert']), 0)

    def test_silence_gets_no_groove_hits(self):
        audio = np.zeros(SAMPLE_RATE*3, dtype=np.float32)
        refined = refine_groove(analyze(audio, 'drums'), audio, {'bpm': 120.})
        self.assertEqual(refined['events'], [])

    def test_standard_groove_pulses_are_explicit_and_stop_at_silence(self):
        duration = 6
        t = np.arange(SAMPLE_RATE*duration)/SAMPLE_RATE
        audio = (.02*np.sin(2*np.pi*6000*t)*(t < 4)).astype(np.float32)
        events = []
        for start in np.arange(.5, 4, .5):
            kind = 'kick' if round(start*2) % 2 else 'snare'
            sound = percussion(kind)
            frame = round(start*SAMPLE_RATE)
            audio[frame:frame+len(sound)] += sound
            events.append({'start': float(start), 'end': float(start+.045),
                           'pitches': [0 if kind == 'kick' else 1],
                           'kind': kind, 'confidence': .9, 'strength': 1.})
        analysis = {'events': events, 'diagnostics': {}}
        refined = refine_groove(analysis, audio, {'bpm': 120., 'confidence': .8,
                                               'beats': list(np.arange(.5, duration, .5))})
        info = refined['diagnostics']['groove_refinement']
        self.assertTrue(info['groove_pulses_are_gameplay_adaptation'])
        self.assertGreater(len(info['standard_groove_hat_pulses']), 0)
        self.assertTrue(all(t < 4 for t in info['standard_groove_hat_pulses']))
        faithful = refine_groove(analysis, audio, {'bpm': 120., 'confidence': .8,
                                 'beats': list(np.arange(.5, duration, .5))}, standard_pulses=False)
        self.assertEqual(faithful['diagnostics']['groove_refinement']['standard_groove_hat_pulses'], [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
