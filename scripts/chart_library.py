"""One visible song per source; immutable backups and legacy audit (stdlib only)."""
import configparser
import datetime
import hashlib
import json
from pathlib import Path
import re
import shutil
import uuid


def digest(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024*1024), b''):
            result.update(block)
    return result.hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def atomic_json(path, value):
    path = Path(path)
    pending = path.with_name(path.name+'.'+uuid.uuid4().hex+'.pending')
    pending.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf-8')
    pending.replace(path)


def source_id(folder):
    # Identity does NOT include title, artist, code, settings or audio contents.
    # Equal titles in different input folders are intentionally different songs.
    return hashlib.sha256(str(Path(folder).resolve()).encode()).hexdigest()


def report_source(report):
    if report.get('source_folder'):
        return Path(report['source_folder']).resolve()
    paths = [Path(p).resolve().parent for i, p in report.get('sources', {}).items() if i != 'mix']
    return paths[0] if paths and len(set(paths)) == 1 else None


def artifacts_valid(folder):
    try:
        marker = read_json(folder/'complete.json')
        files = marker['files']
        required = {'notes.mid', 'song.ini', 'analysis.json', 'guitar.ogg', 'bass.ogg', 'keys.ogg', 'drums.ogg'}
        return required <= files.keys() and all(Path(name).name == name and name not in ('.', '..')
            and (folder/name).is_file() and digest(folder/name) == sha for name, sha in files.items())
    except (OSError, ValueError, KeyError, TypeError):
        return False


def creation(folder):
    try:
        return datetime.datetime.fromisoformat(read_json(folder/'complete.json')['created_utc']).timestamp()
    except (OSError, ValueError, KeyError, TypeError):
        return 0.


def metadata(folder):
    ini = configparser.ConfigParser(interpolation=None, strict=False)
    ini.read(folder/'song.ini', encoding='utf-8-sig')
    name = ini.get('song', 'name', fallback=folder.name)
    name = re.sub(r' \(WAV direto\)$', '', name)
    return name, ini.get('song', 'artist', fallback='Unknown')


def legacy_candidates(root, source):
    result = []
    if not root.exists():
        return result
    for child in root.iterdir():
        if child.is_dir() and (child/'analysis.json').is_file():
            try:
                if report_source(read_json(child/'analysis.json')) == source.resolve():
                    result.append(child)
            except (OSError, ValueError, TypeError):
                pass
    return sorted(result, key=lambda p: (creation(p), p.name), reverse=True)


def audit_legacy(root, source):
    rows, batches = [], []
    for path in sorted(root.glob('batch-report-*.json')):
        try:
            for row in read_json(path)['songs']:
                if Path(row.get('source', '')).resolve() == source.resolve():
                    batches.append({'report': path.name, **row})
        except (OSError, ValueError, KeyError, TypeError):
            batches.append({'report': path.name, 'error': 'Unreadable batch report'})
    candidates = legacy_candidates(root, source)
    valid = [p for p in candidates if artifacts_valid(p)]
    latest = valid[0] if valid else None
    # Equivalence of playable files is stronger than note counts alone.
    rendered = {}
    for folder in reversed(candidates):
        report = read_json(folder/'analysis.json')
        marker = read_json(folder/'complete.json')
        files = marker['files']
        render_key = tuple(sorted((n, sha) for n, sha in files.items()
                                 if n in ('notes.mid', 'song.ini') or n.endswith('.ogg')))
        duplicate = rendered.get(render_key)
        rendered.setdefault(render_key, folder.name)
        rows.append({'folder': folder.name, 'created_utc': marker.get('created_utc'),
                     'hashes_valid': folder in valid, 'latest_valid': folder == latest,
                     'classification': 'latest_valid' if folder == latest else (
                         'duplicate_playable_files' if duplicate else 'older_test_revision'),
                     'duplicate_of': duplicate, 'reprocessed_instrument': report.get('reprocessed_instrument'),
                     'notes_sha256': files.get('notes.mid'),
                     'expert_notes': {i: len(c['Expert']) for i, c in report.get('charts', {}).items()}})
    return {'source': str(source.resolve()), 'latest_valid': str(latest) if latest else None,
            'folders': rows, 'batch_reports': batches,
            'validity_scope': 'File integrity; MIDI/audio validation is recorded separately. Musical correctness is unconfirmed.'}


class Library:
    def __init__(self, root, songs=None):
        self.root = Path(root).resolve()
        self.songs = Path(songs).resolve() if songs is not None else self.root/'library'
        self.backups = self.root/'backups'
        self.index_path = self.root/'library-index.json'

    def index(self):
        if not self.index_path.exists():
            return {'schema': 1, 'songs': {}}
        value = read_json(self.index_path)
        if value.get('schema') != 1 or not isinstance(value.get('songs'), dict):
            raise ValueError('Malformed library index; refusing to guess song identities.')
        return value

    def active(self, source):
        identity = source_id(source)
        entry = self.index()['songs'].get(identity)
        candidates = []
        if self.songs.exists():
            for folder in self.songs.iterdir():
                if not folder.is_dir() or not (folder/'analysis.json').is_file():
                    continue
                try:
                    if report_source(read_json(folder/'analysis.json')) == source.resolve():
                        candidates.append(folder)
                except (OSError, ValueError):
                    pass
        if entry:
            name = entry['folder']
            if Path(name).name != name or name in ('.', '..'):
                raise ValueError('Unsafe folder in library index.')
            indexed = self.songs/name
            if indexed.exists() and indexed not in candidates:
                raise ValueError('Library index points to a different song; refusing to replace it.')
            if not indexed.exists():
                # Do not silently publish a second folder after an interrupted
                # rename. Recovery can adopt the one active matching source.
                entry = None
        if len(candidates) > 1:
            raise ValueError('Multiple main folders for this source; resolve the library index before processing.')
        return (candidates[0] if candidates else None), entry

    def destination(self, source, name, artist):
        active, _ = self.active(source)
        if active:
            return active
        identity = source_id(source)
        human_name = f'{artist} - {name}' if artist and artist != 'Unknown' else name
        human_name = re.sub(r'[^\w .()-]+', '_', human_name).strip(' .') or 'song'
        occupied = {p.name.casefold() for p in self.songs.iterdir()} if self.songs.exists() else set()
        occupied |= {v['folder'].casefold() for k, v in self.index()['songs'].items() if k != identity}
        if human_name.casefold() not in occupied:
            return self.songs/human_name
        # Only a real name collision adds an identity suffix. Full IDs in the
        # registry prevent mixing two recordings even if a short prefix clashes.
        for length in (8, 12, 16, 32, 64):
            candidate = f'{human_name} ({identity[:length]})'
            if candidate.casefold() not in occupied:
                return self.songs/candidate
        raise ValueError('Cannot reserve a unique readable song folder.')

    def publish(self, staging, source, name, artist, signature):
        """Archive the old directory before activating a new one; never overwrite files."""
        self.songs.mkdir(parents=True, exist_ok=True)
        target = self.destination(source, name, artist)
        identity = source_id(source)
        backup = None
        if target.exists():
            timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            parent = self.backups/(target.name+'-'+identity[:12])
            parent.mkdir(parents=True, exist_ok=True)
            backup = parent/(timestamp+'-'+uuid.uuid4().hex[:8])
            target.rename(backup)
        try:
            # staging is on the same filesystem, under the output root.
            if target.exists():
                raise ValueError('Main folder unexpectedly exists; refusing overwrite.')
            staging.rename(target)
        except Exception:
            if backup is not None and not target.exists():
                backup.rename(target)
            raise
        index = self.index()
        index['songs'][identity] = {'source': str(source.resolve()), 'folder': target.name,
            'generation_signature': signature, 'updated_utc': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        atomic_json(self.index_path, index)
        return target, backup

    def adopt(self, legacy, source, name, artist, signature, work):
        """Copy an existing valid result, preserving every legacy file and folder."""
        active, entry = self.active(source)
        if active:
            if not artifacts_valid(active):
                raise ValueError('Existing main folder is corrupt; organize does not overwrite it.')
            return active, False
        if not artifacts_valid(legacy):
            raise ValueError('Legacy chart failed integrity verification.')
        staging = work/'adopted-song'
        shutil.copytree(legacy, staging)
        if not artifacts_valid(staging):
            raise ValueError('Copied chart failed integrity verification.')
        output, backup = self.publish(staging, source, name, artist, signature)
        return output, True
