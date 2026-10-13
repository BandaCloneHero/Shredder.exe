"""Preserved guitar semantics and audio-derived beginner drum selection."""
from pathlib import Path
import tempfile
import unittest

import mido
from create_mp3_test_chart import make_track

from enrich_pack_chart import convert_guitar, easier_drums, absolute_events, validate_export, LEVELS


class PackEnrichmentTests(unittest.TestCase):
    def test_eighth_note_groove_preserved_without_third_hit_or_invented_time(self):
        notes=[];events=[]
        for i in range(16):
            t=i*.22
            for lane,kind in ((0,'kick'),(2,'snare'),(1,'hihat')):
                if lane==0 and i%4:continue
                if lane==2 and i%4!=2:continue
                notes.append([t,t+.035,lane])
                events.append({'start':t,'pitches':[lane],'confidence':.9,'strength':1.,'kind':kind})
        selected,report=easier_drums(notes,events,136.)
        self.assertEqual(sorted(set(n[0] for n in selected)),[i*.22 for i in range(16)])
        self.assertTrue(all(n in notes for n in selected))
        self.assertLessEqual(max(sum(n[0]==t for n in selected) for t in {n[0] for n in selected}),2)
        self.assertEqual(report['artificial_hits'],0)

    def test_rapid_fill_thinned_and_no_notes_without_wav_evidence(self):
        notes=[[i*.05,i*.05+.035,3] for i in range(20)]
        events=[{'start':n[0],'pitches':[3],'confidence':.9,'strength':1.} for n in notes]
        selected,_=easier_drums(notes,events,136.)
        self.assertLess(len(selected),len(notes)/2)
        self.assertTrue(all(n in notes for n in selected))
        self.assertEqual(easier_drums(notes,[],136.)[0],[])

    def test_quantized_chord_releases_compare_by_lane(self):
        with tempfile.TemporaryDirectory() as tmp:
            midi=mido.MidiFile(ticks_per_beat=192)
            midi.tracks.append(make_track('TEMPO',[(0,mido.MetaMessage('set_tempo',tempo=500000))],500))
            midi.tracks.append(make_track('PART GUITAR',[],500))
            events=[]
            for pitch in (48,52):
                events.extend([(77,mido.Message('note_on',note=pitch,velocity=100)),
                               (384,mido.Message('note_off',note=pitch))])
            midi.tracks.append(make_track('PART REAL_KEYS_M',events,500))
            path=Path(tmp)/'notes.mid';midi.save(path)
            report={level:{'gems':[],'types':[]} for level in LEVELS}
            actual=validate_export(path,report,{'keys':[[.2,1.001,48],[.2,1.,52]]},{})
            self.assertEqual(actual['parts']['keys']['notes'],2)

    def test_guitar_variable_tempo_holds_taps_forcing_and_phrase_membership(self):
        chart='''[Song]
{
Resolution = 192
Offset = 0
}
[SyncTrack]
{
0 = B 120000
384 = B 100000
0 = TS 4
}
[Events]
{
0 = E "section Intro"
}
'''
        for level in ('Easy','Medium','Hard','Expert'):
            chart+='['+level+'''Single]
{
0 = N 0 96
48 = N 1 0
96 = N 2 0
96 = N 5 0
144 = N 3 0
144 = N 6 0
0 = S 2 190
}
'''
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'notes.chart';path.write_text(chart)
            midi,report=convert_guitar(path)
            self.assertEqual([m.tempo for m in midi.tracks[0] if m.type=='set_tempo'],[500000,600000])
            self.assertEqual(report['Expert']['types'],[[0,'strum'],[48,'hopo'],[96,'strum'],[144,'tap']])
            self.assertEqual(report['Expert']['gems'],[[0,96,0],[48,0,1],[96,0,2],[144,0,3]])
            self.assertEqual(sum(m.type=='sysex' for _,m in absolute_events(midi.tracks[2])),8)
            self.assertTrue(report['phrase_conversion']['membership_preserved'])


if __name__=='__main__':unittest.main(verbosity=2)
