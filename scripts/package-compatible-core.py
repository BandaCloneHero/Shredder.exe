#!/usr/bin/env python3
"""Build the Unity Core package from a public revision plus the shipped patch."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import subprocess
import tarfile
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
REVISION = '3beb94e526558134145bcd3e409428f759001a40'
VERSION = '0.13.0-shredder.1'
OUTPUT = ROOT / 'Packages' / f'in.yarg.core-{VERSION}.tgz'
PATCH = ROOT / 'docs/patches/rhythm-judgments-core.patch'
GUID_NAMESPACE = uuid.UUID('d5d82403-1291-4abd-b23a-9a7bf71b468b')


def build():
    # Export the PUBLIC base, independent of the current submodule checkout.
    exported = subprocess.run(
        ['git', '-C', str(ROOT / 'YARG.Core'), 'archive', REVISION, 'YARG.Core', 'LICENSE'],
        check=True, capture_output=True).stdout
    with tempfile.TemporaryDirectory(prefix='shredder-core-package-') as tmp:
        work = Path(tmp)
        with tarfile.open(fileobj=io.BytesIO(exported)) as archive:
            for member in archive:
                destination = work / member.name
                if destination.resolve().is_relative_to(work) and member.isfile():
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(archive.extractfile(member).read())
                elif not member.isdir():
                    raise ValueError(f'Unexpected archive member: {member.name}')
        subprocess.run(['git', '-C', str(work), 'apply', '--include=YARG.Core/*', str(PATCH)],
                       check=True)
        package = work / 'YARG.Core'
        (package / 'LICENSE.md').write_bytes((work / 'LICENSE').read_bytes())
        metadata = json.loads((package / 'package.json').read_text())
        metadata['version'] = VERSION
        (package / 'package.json').write_text(json.dumps(metadata, indent=2) + '\n', newline='\n')
        (package / 'SHREDDER_CORE_VERSION.json').write_text(json.dumps({
            'upstream': 'https://github.com/YARC-Official/YARG.Core',
            'revision': REVISION,
            'patch': 'docs/patches/rhythm-judgments-core.patch',
            'patchSha256': hashlib.sha256(PATCH.read_bytes()).hexdigest(),
        }, indent=2) + '\n', newline='\n')

        # Immutable UPM packages need stable metadata. Keep every original .meta
        # and generate deterministic GUIDs only where upstream supplies none.
        for path in sorted(package.rglob('*')):
            if path.suffix == '.meta':
                continue
            meta = path.with_name(path.name + '.meta')
            if not meta.exists():
                guid = uuid.uuid5(GUID_NAMESPACE, path.relative_to(package).as_posix()).hex
                text = f'fileFormatVersion: 2\nguid: {guid}\n'
                if path.is_dir():
                    text += 'folderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n'
                elif path.suffix == '.cs':
                    text += ('MonoImporter:\n  externalObjects: {}\n  serializedVersion: 2\n'
                             '  defaultReferences: []\n  executionOrder: 0\n'
                             '  icon: {instanceID: 0}\n  userData:\n'
                             '  assetBundleName:\n  assetBundleVariant:\n')
                meta.write_text(text, newline='\n')
        buffer = io.BytesIO()
        with gzip.GzipFile(fileobj=buffer, mode='wb', filename='', mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as archive:
                for path in sorted(package.rglob('*')):
                    if path.is_file():
                        contents = path.read_bytes()
                        member = tarfile.TarInfo('package/' + path.relative_to(package).as_posix())
                        member.size = len(contents)
                        member.mode = 0o644
                        archive.addfile(member, io.BytesIO(contents))
        OUTPUT.write_bytes(buffer.getvalue())
    print(f'{OUTPUT.name}: {OUTPUT.stat().st_size} bytes; SHA256 {hashlib.sha256(OUTPUT.read_bytes()).hexdigest()}')


if __name__ == '__main__':
    build()
