"""Organization tests: no musical transcription or actual song reprocessing."""
import argparse
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock

import generate_charts_batch as batch
from chart_library import Library, artifacts_valid, audit_legacy, atomic_json, source_id


def fixture(folder, source, created='2026-10-11T18:46:58+00:00', content=b'chart'):
    folder.mkdir(parents=True)
    for filename in ('notes.mid', 'song.ini', 'guitar.ogg', 'bass.ogg', 'drums.ogg', 'keys.ogg'):
        (folder/filename).write_bytes(content)
    (folder/'song.ini').write_text('[song]\nname = Song (WAV direto)\nartist = Artist\n')
    batch.dump(folder/'analysis.json', {'source_folder': str(source.resolve()),
        'sources': {'guitar': str(source/'guitar.wav')}, 'charts': {}, 'reprocessed_instrument': None})
    batch.dump(folder/'complete.json', {'signature': 'signature', 'created_utc': created,
        'files': {p.name: batch.digest(p) for p in folder.iterdir()}})
    return folder


class ChartLibraryTests(unittest.TestCase):
    def test_direct_song_directory_and_external_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root/'inputs'/'Song'
            source.mkdir(parents=True)
            songs = root/'musicas'
            library = Library(root/'chart-backups'/'musicas-state', songs=songs)
            # Existing unrelated game charts must remain untouched.
            songs.mkdir()
            existing = songs/'Other Artist - Song'
            existing.mkdir()
            (existing/'notes.mid').write_bytes(b'original')
            library.root.mkdir(parents=True)
            first, _ = library.publish(fixture(root/'stage1', source), source, 'Song', 'Artist', 'a')
            second, backup = library.publish(fixture(root/'stage2', source, content=b'new'), source, 'Song', 'Artist', 'b')
            self.assertEqual(first, songs/'Artist - Song')
            self.assertEqual(first, second)
            self.assertEqual(library.active(source)[0], second)
            self.assertNotIn(songs, backup.parents)
            self.assertNotIn(songs, library.index_path.parents)
            self.assertEqual((existing/'notes.mid').read_bytes(), b'original')

    def test_stable_path_and_backups_outside_library(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); library = Library(root/'output'); source = root/'input'/'song'
            source.mkdir(parents=True)
            first, _ = library.publish(fixture(root/'stage1', source), source, 'Song', 'Artist', 'signature')
            hashes = {p.name: batch.digest(p) for p in first.iterdir()}
            second, backup = library.publish(fixture(root/'stage2', source, content=b'revision'), source, 'Song', 'Artist', 'new')
            self.assertEqual(first, second)
            self.assertEqual(first.name, 'Artist - Song')
            self.assertEqual(hashes, {p.name: batch.digest(p) for p in backup.iterdir()})
            self.assertNotIn(library.songs, backup.parents)
            self.assertEqual(len(list(library.songs.iterdir())), 1)
            self.assertTrue(artifacts_valid(second))

    def test_same_name_different_sources_never_merge(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); library=Library(root/'out')
            a, b = root/'a'/'Song', root/'b'/'Song'
            a.mkdir(parents=True); b.mkdir(parents=True)
            p, _ = library.publish(fixture(root/'stage1', a), a, 'Song', 'Artist', 'a')
            q, _ = library.publish(fixture(root/'stage2', b), b, 'Song', 'Artist', 'b')
            self.assertNotEqual(p, q)
            self.assertNotEqual(source_id(a), source_id(b))
            self.assertEqual(library.active(a)[0], p)
            self.assertEqual(library.active(b)[0], q)
            self.assertEqual(len(list(library.songs.iterdir())), 2)
            self.assertTrue(q.name.startswith('Artist - Song ('))

    def test_legacy_latest_by_completion_not_modified_time_and_duplicate_audit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source=root/'input'; source.mkdir()
            out=root/'out'; out.mkdir()
            old=fixture(out/'old', source, '2026-10-11T18:00:00+00:00')
            new=fixture(out/'new', source, '2026-10-11T19:00:00+00:00', b'new')
            duplicate=fixture(out/'duplicate', source, '2026-10-11T18:30:00+00:00')
            invalid=fixture(out/'corrupt', source, '2026-10-11T20:00:00+00:00')
            (invalid/'notes.mid').write_bytes(b'broken')
            batch.dump(out/'batch-report-a.json', {'songs':[{'source':str(source),'status':'generated','output':str(new)}]})
            audit=audit_legacy(out,source)
            self.assertEqual(audit['latest_valid'],str(new))
            self.assertEqual(next(r for r in audit['folders'] if r['folder']=='duplicate')['duplicate_of'],'old')
            self.assertEqual(len(audit['batch_reports']),1)
            before={p.name:batch.digest(p) for p in new.iterdir()}
            work=root/'work'; work.mkdir()
            library=Library(out)
            active,copied=library.adopt(new,source,'Song','Artist','signature',work)
            self.assertTrue(copied)
            self.assertEqual(before,{p.name:batch.digest(p) for p in new.iterdir()})
            self.assertEqual(before,{p.name:batch.digest(p) for p in active.iterdir()})
            self.assertFalse(library.adopt(new,source,'Song','Artist','signature',work)[1])
            self.assertTrue(all(p.exists() for p in (old,new,duplicate,invalid)))

    def test_publication_failure_restores_old_main(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); library=Library(root/'out'); source=root/'source'; source.mkdir()
            active,_=library.publish(fixture(root/'first',source),source,'Song','Artist','a')
            hashes={p.name:batch.digest(p) for p in active.iterdir()}
            staging=fixture(root/'next',source,content=b'new')
            original_rename=Path.rename
            def fail_new(path,target):
                if path==staging:
                    raise OSError('fixture publication failure')
                return original_rename(path,target)
            with mock.patch.object(Path,'rename',fail_new):
                with self.assertRaises(OSError):
                    library.publish(staging,source,'Song','Artist','b')
            self.assertEqual(hashes,{p.name:batch.digest(p) for p in active.iterdir()})
            self.assertTrue(staging.exists())

    def test_case_collision_and_index_cannot_point_to_other_song(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); library=Library(root/'out'); a,b=root/'a',root/'b'
            a.mkdir();b.mkdir()
            p,_=library.publish(fixture(root/'s1',a),a,'Song','Artist','a')
            q,_=library.publish(fixture(root/'s2',b),b,'song','artist','b')
            self.assertNotEqual(p.name.casefold(),q.name.casefold())
            index=library.index();index['songs'][source_id(a)]['folder']=q.name
            atomic_json(library.index_path,index)
            with self.assertRaisesRegex(ValueError,'different song'):
                library.active(a)

    def test_organize_mode_and_resume_never_decode_or_analyze(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source=root/'source';source.mkdir();out=root/'out';out.mkdir()
            sources={i:source/(i+'.wav') for i in batch.INSTRUMENTS}
            for p in sources.values():p.write_bytes(b'WAV fixture')
            settings={'name':'Song','artist':'Artist'}
            impl=batch.implementation_hash();hashes={i:batch.digest(p) for i,p in sources.items()}
            payload={'version':batch.VERSION,'implementation':impl,'hashes':hashes,
                     'settings':settings,'artist':'Artist','name':'Song'}
            import hashlib
            signature=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
            old=fixture(out/'old',source)
            report=batch.read_json(old/'analysis.json');report['source_hashes']=hashes
            batch.dump(old/'analysis.json',report)
            marker=batch.read_json(old/'complete.json');marker['signature']=signature
            marker['files']['analysis.json']=batch.digest(old/'analysis.json');batch.dump(old/'complete.json',marker)
            args=argparse.Namespace(output=out,artist=None,resume=True,instrument=None,compare=None,organize_existing=True)
            with mock.patch.object(batch,'identify_folder',return_value=(sources,None,settings)), \
                 mock.patch.object(batch,'decode_stereo',side_effect=AssertionError('unexpected decode')), \
                 mock.patch.object(batch,'analyze',side_effect=AssertionError('unexpected transcription')):
                for organize,status in [(True,'organized_existing'),(False,'skipped_complete'),(True,'already_organized')]:
                    args.organize_existing=organize
                    with tempfile.TemporaryDirectory(dir=out) as work:
                        result=batch.process(source,args,Path(work),impl)
                    self.assertEqual(result['status'],status)
            self.assertTrue(old.exists())
            self.assertEqual(len(list((out/'library').iterdir())),1)
            self.assertFalse((out/'backups').exists())


if __name__=='__main__':
    unittest.main(verbosity=2)
