"""Simplify existing playable MIDIs locally, keeping audio and immutable backups.

This edits final game charts, not intermediate musical transcriptions.
"""
import argparse
import configparser
import datetime
import json
from pathlib import Path
import shutil
import tempfile
import uuid

import mido

from chart_library import atomic_json, digest
from chart_difficulty_profile import easy_medium_notes, verify_profile
from create_mp3_test_chart import make_track


def tempo_map(midi):
    changes, tick, seconds, tempo = [(0, 0., 500000)], 0, 0., 500000
    for message in mido.merge_tracks(midi.tracks):
        seconds += mido.tick2second(message.time, midi.ticks_per_beat, tempo)
        tick += message.time
        if message.type == 'set_tempo':
            tempo = message.tempo
            changes.append((tick, seconds, tempo))
    def to_seconds(value):
        start, offset, rate = next(c for c in reversed(changes) if c[0] <= value)
        return offset + mido.tick2second(value-start, midi.ticks_per_beat, rate)
    def to_ticks(value):
        start, offset, rate = next(c for c in reversed(changes) if c[1] <= value)
        return round(start+mido.second2tick(value-offset, midi.ticks_per_beat, rate))
    return to_seconds, to_ticks, 60e6/changes[0][2]


def absolute(track):
    tick = 0
    result = []
    for message in track:
        tick += message.time
        if message.type not in ('track_name', 'end_of_track'):
            result.append((tick, message))
    return result, tick


def extract(track, valid, lane, seconds):
    active, notes = {}, []
    messages, _ = absolute(track)
    for tick, message in messages:
        if message.type not in ('note_on', 'note_off') or message.note not in valid:
            continue
        key = (message.channel, message.note)
        if message.type == 'note_on' and message.velocity:
            active[key] = tick
        elif key in active:
            start = active.pop(key)
            if tick > start:
                notes.append([seconds(start), seconds(tick), lane(message.note)])
    if active:
        raise ValueError('Unclosed playable notes in source chart')
    return notes


def revise_midi(source, target, difficulty='Medium', preserve_profile=False):
    if difficulty not in ('Easy', 'Medium'):
        raise ValueError('Expected Easy or Medium')
    target_base = 60 if difficulty == 'Easy' else 72
    target_keys = 'E' if difficulty == 'Easy' else 'M'
    midi = mido.MidiFile(source)
    seconds, ticks, bpm = tempo_map(midi)
    names = {next((m.name for m in t if m.type == 'track_name'), ''): t for t in midi.tracks}
    converted, stats = {}, {}
    for track_name, instrument in [('PART GUITAR', 'guitar'), ('PART BASS', 'bass'), ('PART DRUMS', 'drums'), ('PART KEYS', 'keys5')]:
        if track_name not in names:
            continue
        track = names[track_name]
        before = []
        for base in (96, 84, 72, 60):
            valid = set(range(base, base+5))
            if instrument in ('guitar', 'bass'):
                valid.add(base+5)  # open strums become green, not discarded
            before = extract(track, valid, lambda note: (note-base)%5, seconds)
            if before:
                break
        policy_instrument = 'guitar' if instrument == 'keys5' else instrument
        after = before if preserve_profile else easy_medium_notes(policy_instrument, before, bpm, snare_lane=1)
        stats[instrument] = {'previous_notes': len(before), **verify_profile({policy_instrument: {difficulty: after}}, difficulty=difficulty)[policy_instrument]}
        messages, end = absolute(track)
        playable = set().union(*(set(range(base, base+(8 if instrument in ('guitar', 'bass') else 5))) for base in (60, 72, 84, 96)))
        # Ghost/drum-animation notes and global star power are metadata, kept.
        kept = [(tick, m) for tick, m in messages if not (m.type in ('note_on', 'note_off') and m.note in playable)]
        for start, stop, lane in after:
            a, b = ticks(start), max(ticks(start)+1, ticks(stop))
            kept.extend([(a, mido.Message('note_on', note=target_base+lane, velocity=100)),
                         (b, mido.Message('note_off', note=target_base+lane))])
        converted[track_name] = make_track(track_name, kept, end)
    real_source = next((names.get('PART REAL_KEYS_'+level) for level in ('X', 'H', 'M', 'E')
                        if names.get('PART REAL_KEYS_'+level) is not None and any(m.type == 'note_on' and m.velocity and 48 <= m.note <= 72 for m in names['PART REAL_KEYS_'+level])), None)
    if real_source is not None:
        white = [48, 50, 52, 53, 55, 57, 59]
        def fold(note):
            return min(white, key=lambda p: min(abs(p%12-note%12), 12-abs(p%12-note%12)))
        before = extract(real_source, set(range(48, 73)), fold, seconds)
        after = before if preserve_profile else easy_medium_notes('keys', before, bpm)
        stats['keys'] = {'previous_notes': len(before), **verify_profile({'keys': {difficulty: after}}, difficulty=difficulty)['keys']}
        for level in ('E', 'M', 'H', 'X'):
            name = 'PART REAL_KEYS_'+level
            if name not in names:
                continue
            messages, end = absolute(names[name])
            kept = [(t, m) for t, m in messages if not (m.type in ('note_on', 'note_off') and (48 <= m.note <= 72 or 0 <= m.note <= 9))]
            if level == target_keys:
                kept.extend([(0, mido.Message('note_on', note=0, velocity=100)), (end, mido.Message('note_off', note=0))])
                for start, stop, lane in after:
                    a, b = ticks(start), max(ticks(start)+1, ticks(stop))
                    kept.extend([(a, mido.Message('note_on', note=lane, velocity=100)), (b, mido.Message('note_off', note=lane))])
            converted[name] = make_track(name, kept, end)
    midi.tracks = [converted.get(next((m.name for m in t if m.type == 'track_name'), ''), t) for t in midi.tracks]
    midi.save(target)
    # Verify the rendered MIDI, including near-simultaneous pedal/pad hits.
    rendered = mido.MidiFile(target)
    for track in rendered.tracks:
        name = next((m.name for m in track if m.type == 'track_name'), '')
        if name in ('PART GUITAR', 'PART BASS', 'PART DRUMS', 'PART KEYS'):
            notes = extract(track, set(range(target_base, target_base+5)), lambda n: n-target_base, seconds)
            instrument = {'PART GUITAR':'guitar','PART BASS':'bass','PART DRUMS':'drums','PART KEYS':'guitar'}[name]
            verify_profile({instrument: {difficulty: notes}}, difficulty=difficulty)
            for m in track:
                if m.type == 'note_on' and m.velocity:
                    assert m.note not in set().union(*(set(range(base, base+5)) for base in (60,72,84,96) if base != target_base))
    return stats


def revise_song(folder, backups, difficulty='Medium'):
    marker = folder/'difficulty-profile.json'
    previous = {}
    if marker.exists():
        previous = json.loads(marker.read_text())
        if previous.get('profile') == 'easy-medium' and previous.get('midi_difficulty') == difficulty and previous.get('notes_sha256') == digest(folder/'notes.mid'):
            return {'folder': str(folder), 'status': 'skipped_complete'}
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    with tempfile.TemporaryDirectory(prefix='.profile-', dir=backups) as tmp:
        staging = Path(tmp)/folder.name
        shutil.copytree(folder, staging)
        stats = revise_midi(folder/'notes.mid', staging/'notes.mid', difficulty=difficulty,
                            preserve_profile=previous.get('profile') == 'easy-medium')
        ini = configparser.ConfigParser(interpolation=None, strict=False)
        ini.read(staging/'song.ini', encoding='utf-8-sig')
        for key in ('diff_guitar', 'diff_bass', 'diff_drums', 'diff_drums_real', 'diff_keys', 'diff_keys_real', 'diff_band'):
            if ini.has_option('song', key) and ini.getint('song', key, fallback=-1) >= 0:
                ini.set('song', key, '1')
        ini.set('song', 'five_lane_drums', 'False')
        # The simplified four-pad profile does not require cymbal modifiers.
        ini.set('song', 'pro_drums', 'False')
        with (staging/'song.ini').open('w', encoding='utf-8') as stream:
            ini.write(stream)
        for path in folder.iterdir():
            if path.suffix.lower() in ('.ogg', '.mp3', '.wav', '.opus', '.mogg'):
                assert digest(path) == digest(staging/path.name), 'Audio changed during revision'
        report = {'profile':'easy-medium', 'midi_difficulty':difficulty, 'max_drum_hits_including_kick':2,
                  'notes_sha256':digest(staging/'notes.mid'), 'validation':stats,
                  'audio_unchanged':True, 'in_game_test':'not run', 'created_utc':stamp}
        atomic_json(staging/'difficulty-profile.json', report)
        if (staging/'complete.json').exists():
            raise ValueError('Use WAV generator for managed charts; do not invalidate its completion signature.')
        archive = backups/(folder.name+'-'+stamp+'-'+uuid.uuid4().hex[:8])
        folder.rename(archive)
        try:
            staging.rename(folder)
        except Exception:
            archive.rename(folder)
            raise
    return {'folder':str(folder),'status':'generated','previous_backup':str(archive),'validation':stats}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--library', type=Path, default=Path('musicas'))
    parser.add_argument('--song', action='append', required=True, help='exact existing song folder name; repeat to select more')
    parser.add_argument('--difficulty', choices=['Easy', 'Medium'], default='Easy')
    args = parser.parse_args()
    backups = args.library.resolve().parent/'chart-backups'/'difficulty-revisions'
    backups.mkdir(parents=True, exist_ok=True)
    rows = []
    for name in args.song:
        if Path(name).name != name:
            parser.error('--song must be an exact folder name')
        folder = args.library.resolve()/name
        if not (folder/'notes.mid').exists():
            parser.error(f'No playable MIDI: {folder}')
        row = revise_song(folder, backups, difficulty=args.difficulty)
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False))
    atomic_json(backups/('report-'+uuid.uuid4().hex+'.json'), {'songs':rows})
