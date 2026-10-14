"""Three-stem input, distributed audio checks and phrase-preserving conversion."""
from pathlib import Path
import tempfile
import unittest
import configparser
from unittest import mock

import numpy as np
from scipy import signal

from enrich_pack_stems import identify_stems, verify_alignment, cached_analysis,enrich,PROFILE,policy_signature,preserve_guitar_sustains
from chart_library import atomic_json,digest
from enrich_pack_chart import convert_guitar, LEVELS
from wav_chart_analysis import SAMPLE_RATE, yin_pitch


class ThreeStemTests(unittest.TestCase):
    def test_quiet_keyboard_alignment_uses_independent_bands_and_rejects_shift(self):
        rng=np.random.default_rng(9);n=SAMPLE_RATE*40
        tone_band=signal.butter(4,(400,800),btype='bandpass',fs=SAMPLE_RATE,output='sos')
        bass_band=signal.butter(4,120,btype='lowpass',fs=SAMPLE_RATE,output='sos')
        keys=.015*signal.sosfiltfilt(tone_band,rng.normal(size=n))
        mix=keys+signal.sosfiltfilt(bass_band,rng.normal(size=n))
        report=verify_alignment(mix,{'keys':keys})['instruments']['keys']
        self.assertIn('band-limited',report['method'])
        self.assertGreaterEqual(report['credible_probes'],5)
        self.assertGreaterEqual(report['independent_probe_span_seconds'],20)
        with self.assertRaises(ValueError):verify_alignment(mix,{'keys':np.roll(keys,round(.020*SAMPLE_RATE))})

    def test_short_authored_guitar_holds_preserved_but_zero_length_gems_stay_taps(self):
        ini=configparser.ConfigParser();ini.add_section('song')
        guitar={level:{'gems':[[0,0,0],[192,40,1]]} for level in LEVELS}
        preserve_guitar_sustains(ini,'song',guitar,192)
        cutoff=ini.getint('song','sustain_cutoff_threshold')
        self.assertLess(1,cutoff);self.assertGreaterEqual(40,cutoff)
        ini.set('song','sustain_cutoff_threshold','80')
        preserve_guitar_sustains(ini,'song',guitar,192)
        self.assertEqual(ini.getint('song','sustain_cutoff_threshold'),80)

    def test_explicit_no_keys_accepts_two_stems_but_default_requires_keyboard(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            for name in ('bass.wav','drums.wav'):(folder/name).touch()
            self.assertEqual(set(identify_stems(folder,include_keys=False)),{'bass','drums'})
            with self.assertRaises(ValueError):identify_stems(folder)

    def test_completed_two_instrument_song_resumes_without_decoding_or_new_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'stems';source.mkdir();pack=root/'pack';pack.mkdir()
            for name in ('bass','drums'):(source/(name+'.wav')).write_bytes(b'fixture')
            (pack/'notes.mid').write_bytes(b'validated fixture');(pack/'song.ogg').write_bytes(b'audio')
            hashes={i:digest(source/(i+'.wav')) for i in ('bass','drums')}
            atomic_json(pack/'enrichment-report.json',{'profile':PROFILE,'policy_signature':policy_signature(),
                'source_hashes':hashes,'notes_sha256':digest(pack/'notes.mid'),'pack_audio_sha256':digest(pack/'song.ogg')})
            with mock.patch('enrich_pack_stems.decode_stereo',side_effect=AssertionError('Resume must not analyze again')):
                self.assertEqual(enrich(pack,source,include_keys=False)['status'],'skipped_complete')
                with mock.patch('enrich_pack_stems.policy_signature',return_value='new implementation'):
                    resumed=enrich(pack,source,include_keys=False)
                    self.assertEqual(resumed['status'],'skipped_complete')
                    self.assertTrue(resumed['implementation_changed'])
            self.assertEqual({p.name for p in root.iterdir()},{'stems','pack'})

    def test_yin_lowest_lag_boundary_has_no_right_interpolation_sample(self):
        maximum=int(SAMPLE_RATE/(440*2**((28-69)/12)))
        t=np.arange(SAMPLE_RATE)/SAMPLE_RATE
        pitches,confidence=yin_pitch(np.sin(2*np.pi*(SAMPLE_RATE/maximum)*t))
        self.assertTrue(np.any(np.isfinite(pitches)))
        self.assertLess(abs(float(np.nanmedian(pitches))-28),.1)

    def test_only_three_stems_no_guitar_required_and_ambiguity_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            for name in ('bass_separated.wav','drums_separated.wav','keys_separated.wav'):(folder/name).touch()
            self.assertEqual(set(identify_stems(folder)),{'bass','drums','keys'})
            (folder/'baixo.wav').touch()
            with self.assertRaises(ValueError):identify_stems(folder)

    def test_waveform_checks_reject_delayed_stem_and_silent_evidence(self):
        rng=np.random.default_rng(42);n=SAMPLE_RATE*40
        bass=rng.normal(size=n).astype(np.float32);drums=rng.normal(size=n).astype(np.float32)
        keys=rng.normal(size=n).astype(np.float32);mix=bass+drums+keys
        report=verify_alignment(mix,{'bass':bass,'drums':drums,'keys':keys})
        self.assertEqual(report['offset_seconds'],0)
        delayed=np.roll(drums,int(.020*SAMPLE_RATE))
        with self.assertRaises(ValueError):verify_alignment(mix,{'drums':delayed})
        with self.assertRaises(ValueError):verify_alignment(mix,{'keys':np.zeros(n)})

    def test_cache_reuses_raw_detection_and_rejects_tampering(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch('enrich_pack_stems.analyze',return_value={'events':[]}) as analyze:
            cache=Path(tmp)
            self.assertFalse(cached_analysis([], 'bass','source',cache)[1])
            self.assertTrue(cached_analysis([], 'bass','source',cache)[1]);self.assertEqual(analyze.call_count,1)
            p=next(cache.glob('*.json'));p.write_text(p.read_text().replace('"events": []','"events": [1]'))
            self.assertFalse(cached_analysis([], 'bass','source',cache)[1]);self.assertEqual(analyze.call_count,2)

    def test_common_phrase_endpoint_preserves_membership_even_when_max_length_fails(self):
        chart='[Song]\n{\nResolution = 192\nOffset = 0\n}\n[SyncTrack]\n{\n0 = B 80000\n}\n'
        for level in LEVELS:
            length=100 if level=='Expert' else 200
            # Expert has an outside note at 150. Other levels' last awarded
            # note is at 90, allowing a shared end <=150.
            extra='150 = N 2 0\n' if level=='Expert' else ''
            chart+='['+level+'Single]\n{\n0 = N 0 0\n90 = N 1 0\n'+extra+'0 = S 2 '+str(length)+'\n}\n'
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'notes.chart';p.write_text(chart)
            midi,report=convert_guitar(p)
            self.assertTrue(report['phrase_conversion']['membership_preserved'])
            self.assertEqual(report['phrase_conversion']['canonical'],[[0,2,150]])


if __name__=='__main__':unittest.main(verbosity=2)
