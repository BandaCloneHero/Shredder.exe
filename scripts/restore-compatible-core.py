#!/usr/bin/env python3
"""Restore the pinned public Core and Shredder's existing judgment patch safely."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / 'YARG.Core'
REVISION = '3beb94e526558134145bcd3e409428f759001a40'
REMOTE = 'https://github.com/YARC-Official/YARG.Core'
PATCH = ROOT / 'docs/patches/rhythm-judgments-core.patch'


def git(*args, cwd=ROOT, env=None):
    return subprocess.run(['git', '-C', str(cwd), *args], check=True,
                          capture_output=True, text=True, env=env).stdout.strip()


def recover_committed_patch(current):
    # A local commit of the shipped patch is compatible but cannot be fetched
    # from the official remote. Only normalize an EXACT tree match, never
    # a commit containing additional changes or a dirty checkout.
    if git('status', '--porcelain', '--untracked-files=all', cwd=CORE):
        return False
    with tempfile.TemporaryDirectory(prefix='shredder-core-index-') as tmp:
        env = dict(os.environ, GIT_INDEX_FILE=str(Path(tmp) / 'index'))
        git('read-tree', REVISION, cwd=CORE, env=env)
        git('apply', '--cached', str(PATCH), cwd=CORE, env=env)
        expected_tree = git('write-tree', cwd=CORE, env=env)
    if git('rev-parse', 'HEAD^{tree}', cwd=CORE) != expected_tree:
        return False
    backup = Path(tempfile.mkdtemp(prefix='shredder-core-backup-')) / 'local-core.bundle'
    git('bundle', 'create', str(backup), 'HEAD', cwd=CORE)
    print(f'Preserved local Core commit {current} in {backup}', flush=True)
    git('checkout', '--detach', REVISION, cwd=CORE)
    return True


def restore():
    if not CORE.exists() or not any(CORE.iterdir()):
        # Populate only after a successful checkout; never replace an existing Core.
        with tempfile.TemporaryDirectory(prefix='shredder-core-', dir=ROOT) as tmp:
            checkout = Path(tmp) / 'checkout'
            git('clone', '--no-checkout', REMOTE, str(checkout))
            git('checkout', '--detach', REVISION, cwd=checkout)
            if CORE.exists():
                CORE.rmdir()
            checkout.rename(CORE)
    if git('rev-parse', '--show-toplevel', cwd=CORE) != str(CORE):
        sys.exit('YARG.Core is not an initialized Git checkout. No files changed.')
    current = git('rev-parse', 'HEAD', cwd=CORE)
    if current != REVISION and not recover_committed_patch(current):
        sys.exit(f'Core is at {current}, expected {REVISION}. Existing files were preserved. '
                 'Back up/move that checkout before restoring; do not use the latest Core.')
    subprocess.run([sys.executable, str(ROOT / 'scripts/apply-rhythm-core-patch.py')], check=True)
    print(f'Compatible Core ready: {REVISION} + rhythm-judgments-core.patch')


if __name__ == '__main__':
    try:
        restore()
    except subprocess.CalledProcessError as error:
        sys.exit(error.stderr or str(error))
