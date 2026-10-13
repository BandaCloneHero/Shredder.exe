"""Keyboard density, melodic continuity, long-gap accompaniment and track isolation."""
import tempfile
import unittest
from pathlib import Path

import mido
import numpy as np

from create_mp3_test_chart import make_track
from revise_pack_keyboard import balanced_keyboard, track_chunks, WHITE


class KeyboardTests(unittest.TestCase):
    def fixture(self):
        sr=22050;duration=50
        mix=(.15*np.sin(2*np.pi*220*np.arange(sr*duration)/sr)).astype(np.float32)
        events=[{'start':float(t),'end':float(t+.1),'pitches':[48], 'confidence':.9} for t in np.arange(.5,duration-.5,.5)]
        analyses={i:{'events':events} for i in ('guitar','bass','drums')}
        beat={'bpm':120.,'beats':list(np.arange(.5,duration-.5,.5))}
        return analyses,beat,mix

    def test_dense_ending_keeps_playable_dyads_and_releases_previous_holds(self):
        analyses,beat,mix=self.fixture()
        notes=[[t,t+2.,p] for t in np.arange(40,49,.08) for p in (48,52,59)]
        result,report=balanced_keyboard(notes,analyses,beat,mix)
        self.assertLess(report['retained_detected_notes'],len(notes)/4)
        starts=sorted(set(n[0] for n in result))
        self.assertTrue(all(b-a>=.20 for a,b in zip(starts,starts[1:])))
        self.assertTrue(all(sum(n[0]<=t<n[1] for n in result)<=2 for t in starts))
        self.assertGreater(report['chord_size_counts']['2'],0)
        self.assertGreater(report['chord_size_counts']['1'],0)
        self.assertGreater(report['maximum_simultaneous_keys'],1)

    def test_long_intro_filled_on_rhythm_and_synthetic_notes_are_identified(self):
        analyses,beat,mix=self.fixture()
        result,report=balanced_keyboard([[40.,40.4,52]],analyses,beat,mix)
        self.assertGreater(report['synthetic_accompaniment_notes'],25)
        self.assertLess(result[0][0],2.)
        self.assertLess(report['maximum_internal_attack_gap_seconds'],4.)
        allowed=beat['beats']+[float(t+.25) for t in beat['beats']]
        self.assertTrue(all(e['time'] in allowed for e in report['accompaniment']))
        self.assertGreater(report['synthetic_accompaniment_attacks'],40)
        self.assertTrue(report['synthetic_gameplay_adaptation'])

    def test_no_accompaniment_in_total_audio_silence(self):
        analyses,beat,mix=self.fixture()
        result,report=balanced_keyboard([],analyses,beat,np.zeros_like(mix))
        self.assertEqual(result,[])
        self.assertEqual(report['synthetic_accompaniment_notes'],0)

    def test_unmodified_tracks_remain_byte_identical_when_keys_are_replaced(self):
        with tempfile.TemporaryDirectory() as tmp:
            old,new=Path(tmp)/'old.mid',Path(tmp)/'new.mid'
            midi=mido.MidiFile()
            midi.tracks.append(make_track('PART DRUMS',[(0,mido.Message('note_on',note=72,velocity=100)),
                (100,mido.Message('note_off',note=72))],960))
            midi.tracks.append(make_track('PART REAL_KEYS_M',[],960));midi.save(old)
            midi=mido.MidiFile(old)
            midi.tracks[1]=make_track('PART REAL_KEYS_M',[(0,mido.Message('note_on',note=48,velocity=100)),
                (100,mido.Message('note_off',note=48))],960);midi.save(new)
            self.assertEqual(track_chunks(old)[0],track_chunks(new)[0])
            self.assertNotEqual(track_chunks(old)[1],track_chunks(new)[1])


if __name__=='__main__':unittest.main(verbosity=2)
