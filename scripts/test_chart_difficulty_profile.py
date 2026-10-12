"""Gameplay policy, changing-tempo MIDI rewrite and immutable audio checks."""
from pathlib import Path
import tempfile
import unittest

import mido

from chart_difficulty_profile import apply_easy_medium, easy_medium_notes, verify_profile
from chart_library import digest
from create_mp3_test_chart import make_track
from revise_chart_difficulty import absolute, extract, revise_midi, revise_song, tempo_map


class DifficultyTests(unittest.TestCase):
    def test_kick_counts_toward_two_hit_limit_and_rapid_fills_are_thinned(self):
        notes = [[t, t+.04, lane] for t in (0., .1, .2, .5, .6, 1., 1.1) for lane in (0, 1, 2, 3)]
        result = easy_medium_notes('drums', notes, 120., snare_lane=2)
        stats = verify_profile({'drums': {'Medium': result}})['drums']
        self.assertEqual(stats['max_simultaneous_including_kick'], 2)
        self.assertTrue(all(note[2] in (0, 2) for note in result))
        self.assertLess(len(result), len(notes))

    def test_single_fret_and_key_with_no_overlapping_holds(self):
        notes = [[t, t+3., lane] for t in (0., .15, .4, .9, 1.3) for lane in (0, 2, 4)]
        guitar = easy_medium_notes('guitar', notes)
        self.assertTrue(all(n[2] < 4 for n in guitar))
        keys = easy_medium_notes('keys', [[t, end, 48+lane] for t, end, lane in notes])
        verify_profile({'guitar': {'Medium': guitar}, 'keys': {'Medium': keys}})

    def fixture(self, path):
        midi = mido.MidiFile(ticks_per_beat=480)
        midi.tracks.append(make_track('TEMPO', [(0, mido.MetaMessage('set_tempo', tempo=500000)),
                                                (960, mido.MetaMessage('set_tempo', tempo=750000))], 2400))
        events = []
        for tick in (0, 120, 480, 960, 1200, 1600):
            for note in (96, 97, 98):
                events.extend([(tick, mido.Message('note_on', note=note, velocity=100)),
                               (tick+30, mido.Message('note_off', note=note))])
        events.extend([(0, mido.Message('note_on', note=116, velocity=100)),
                       (480, mido.Message('note_off', note=116))])
        midi.tracks.append(make_track('PART DRUMS', events, 2400))
        midi.tracks.append(make_track('PART VOCALS', [(0, mido.MetaMessage('lyrics', text='keep me')),
            (0, mido.Message('note_on', note=62, velocity=100)), (480, mido.Message('note_off', note=62))], 2400))
        midi.save(path)

    def test_tempo_vocals_and_starpower_preserved_with_medium_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp)/'original.mid', Path(tmp)/'new.mid'
            self.fixture(source)
            old = mido.MidiFile(source)
            seconds, _, _ = tempo_map(old)
            old_notes = extract(old.tracks[1], {96, 97, 98}, lambda n:n-96, seconds)
            revise_midi(source, output)
            new = mido.MidiFile(output)
            self.assertEqual(old.tracks[0], new.tracks[0])
            self.assertEqual(old.tracks[2], new.tracks[2])
            self.assertEqual([(t, m.copy(time=0)) for t, m in absolute(old.tracks[1])[0] if m.type in ('note_on','note_off') and m.note == 116],
                             [(t, m.copy(time=0)) for t, m in absolute(new.tracks[1])[0] if m.type in ('note_on','note_off') and m.note == 116])
            notes = extract(new.tracks[1], {72, 73, 74, 75, 76}, lambda n:n-72, seconds)
            verify_profile({'drums': {'Medium': notes}})
            self.assertTrue(all(any(abs(n[0]-o[0]) < .002 for o in old_notes) for n in notes))

    def test_easy_export_uses_easy_frets_and_pro_keys_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, target = Path(tmp)/'source.mid', Path(tmp)/'easy.mid'
            self.fixture(source)
            midi = mido.MidiFile(source)
            for level in ('E', 'M', 'H', 'X'):
                events = [(0, mido.Message('note_on', note=48, velocity=100)),
                          (240, mido.Message('note_off', note=48))] if level == 'M' else []
                midi.tracks.append(make_track('PART REAL_KEYS_'+level, events, 2400))
            midi.save(source)
            revise_midi(source, target, difficulty='Easy')
            rendered = mido.MidiFile(target)
            for track in rendered.tracks:
                notes = [m.note for m in track if m.type == 'note_on' and m.velocity]
                if track.name == 'PART DRUMS':
                    self.assertTrue(notes)
                    self.assertTrue(all(n in (60,61,62,63,64,116) for n in notes))
                elif track.name == 'PART REAL_KEYS_E':
                    self.assertIn(48, notes)
                elif track.name.startswith('PART REAL_KEYS_'):
                    self.assertFalse(any(48 <= n <= 72 for n in notes))
            charts = apply_easy_medium({'drums': {'Easy': [], 'Medium': [], 'Hard': [],
                'Expert': [[0., .04, 0], [0., .04, 1], [0., .04, 2]]}}, 120, difficulty='Easy')
            self.assertEqual(set(charts['drums']), {'Easy', 'Medium', 'Hard', 'Expert'})
            self.assertEqual(verify_profile(charts, difficulty='Easy')['drums']['notes'], 2)

    def test_switching_light_profile_to_easy_preserves_fourth_fret(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, target = Path(tmp)/'medium.mid', Path(tmp)/'easy.mid'
            midi = mido.MidiFile()
            midi.tracks.append(make_track('PART GUITAR', [
                (480, mido.Message('note_on', note=75, velocity=100)),
                (720, mido.Message('note_off', note=75))], 960))
            midi.save(source)
            revise_midi(source, target, difficulty='Easy', preserve_profile=True)
            actual = mido.MidiFile(target)
            self.assertEqual([(t, m.note) for t, m in absolute(actual.tracks[0])[0]
                             if m.type in ('note_on','note_off')], [(480,63),(720,63)])

    def test_backup_audio_integrity_and_repeat_skips(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)/'songs'/'Artist - Song'
            folder.mkdir(parents=True)
            self.fixture(folder/'notes.mid')
            (folder/'song.ini').write_text('[song]\nname = Song\ndiff_drums = 5\n')
            (folder/'song.ogg').write_bytes(b'unchanged-audio')
            old_midi = digest(folder/'notes.mid')
            audio_hash = digest(folder/'song.ogg')
            backups = Path(tmp)/'backups'; backups.mkdir()
            first = revise_song(folder, backups)
            archive = Path(first['previous_backup'])
            self.assertEqual(digest(archive/'notes.mid'), old_midi)
            self.assertEqual(digest(folder/'song.ogg'), audio_hash)
            self.assertEqual(revise_song(folder, backups)['status'], 'skipped_complete')
            self.assertEqual(len(list(folder.parent.iterdir())), 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
