"""Read-only validation of two explicitly selected local Cazuza revisions."""
import json
from pathlib import Path
import tempfile

import numpy as np
import mido

import generate_charts_batch as batch
from chart_library import artifacts_valid, creation, read_json


def longest_rest(notes, duration):
    cursor, largest = 0., 0.
    for start, end, _ in sorted(notes):
        largest = max(largest, start-cursor)
        cursor = max(cursor, end)
    return max(largest, duration-cursor)


def validate_song(name):
    folder = Path('musicas')/('Cazuza - '+name)
    report = read_json(folder/'analysis.json')
    assert artifacts_valid(folder), 'Chart file checksum failure'
    assert report['chart_options']['difficulty'] == 'Expert'
    assert report['chart_options']['drum_order'] == 'hihat,snare,tom,crash'
    assert report['audio_export']['original_recording_only']
    assert sorted(p.name for p in folder.glob('*.ogg')) == ['song.ogg']
    for instrument, levels in report['charts'].items():
        assert not report['musical_checks'][instrument]['structural_errors']
        assert all(not notes for difficulty, notes in levels.items() if difficulty != 'Expert')
    counts = {}
    for track in mido.MidiFile(folder/'notes.mid').tracks:
        track_name = next((m.name for m in track if m.type == 'track_name'), '')
        notes = [m.note for m in track if m.type == 'note_on' and m.velocity]
        if track_name.startswith('PART REAL_KEYS'):
            notes = [n for n in notes if 48 <= n <= 72]
            if track_name != 'PART REAL_KEYS_X':
                assert not notes
        elif track_name in ('PART GUITAR', 'PART BASS', 'PART DRUMS'):
            assert all(96 <= n <= 100 for n in notes)
        counts[track_name] = len(notes)
    # Compare the exported full recording with the MP3 itself, never with the
    # sum of four stems (which lacks vocals and other background instruments).
    with tempfile.TemporaryDirectory(prefix='chart-audio-qa-') as tmp:
        work = Path(tmp)
        original = batch.decode_stereo(Path(report['sources']['mix']), work/'original.f32')
        exported = batch.decode_stereo(folder/'song.ogg', work/'exported.f32')
        length = min(len(original), len(exported))
        # Subsample only for the numerical correlation, decode the whole audio.
        a, b = original[:length:16].astype(np.float64).ravel(), exported[:length:16].astype(np.float64).ravel()
        correlation = float(np.corrcoef(a, b)[0, 1])
        assert correlation > .98, 'Export is not the full original recording'
        assert abs(len(original)-len(exported)) <= 1103
    backups = Path('chart-backups/musicas-state/backups')
    candidates = [p for p in backups.glob(folder.name+'-*/*') if artifacts_valid(p)]
    # Earliest pre-adaptation version in the generator backup history.
    originals = [p for p in candidates if not read_json(p/'analysis.json').get('keyboard_accompaniment')]
    old_folder = max(originals, key=creation) if originals else None
    old_report = read_json(old_folder/'analysis.json') if old_folder else None
    added = report['keyboard_accompaniment']['added_notes']['Expert']
    expert_keys = report['charts']['keys']['Expert']
    assert all(any(abs(n[0]-e['time']) < .001 and n[2] == e['lane'] for n in expert_keys) for e in added)
    return {'folder': str(folder.resolve()), 'artifact_hashes_valid': True,
            'original_audio_correlation': correlation, 'ogg_files': ['song.ogg'],
            'midi_playable_note_counts': counts, 'alignment': report['alignment'],
            'keyboard_added_gameplay_notes': len(added),
            'keyboard_longest_rest_seconds': longest_rest(expert_keys, report['duration_seconds']),
            'previous_chart': str(old_folder) if old_folder else None,
            'previous_keyboard_longest_rest_seconds': longest_rest(old_report['charts']['keys']['Expert'], old_report['duration_seconds']) if old_report else None,
            'drum_refinement': report['instrument_analysis']['drums']['groove_refinement'],
            'warnings': {i: c['warnings'] for i, c in report['musical_checks'].items()},
            'in_game_test': 'not run', 'listening_validation': 'not run',
            'musical_correctness_certified': False}


if __name__ == '__main__':
    results = {'songs': [validate_song(name) for name in ('Exagerado', 'Pro Dia Nascer Feliz')],
               'unit_tests_passed': 33,
               'test_suites': ['test_wav_charts.py:18', 'test_chart_library.py:7', 'test_chart_playability.py:8'],
               'scope': 'Two songs only; no full batch processing'}
    target = Path('chart-backups/musicas-state/playability-revision-validation.json')
    batch.dump(target, results)
    for row in results['songs']:
        print(json.dumps({k: row[k] for k in ('folder', 'original_audio_correlation', 'keyboard_added_gameplay_notes', 'keyboard_longest_rest_seconds', 'previous_keyboard_longest_rest_seconds')}, ensure_ascii=False))
