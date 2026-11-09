#!/usr/bin/env python3
"""Restore the pinned public Core and Shredder's existing judgment patch safely."""
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / 'YARG.Core'
REVISION = '3beb94e526558134145bcd3e409428f759001a40'
REMOTE = 'https://github.com/YARC-Official/YARG.Core'


def git(*args, cwd=ROOT):
    return subprocess.run(['git', '-C', str(cwd), *args], check=True,
                          capture_output=True, text=True).stdout.strip()


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
    if current != REVISION:
        sys.exit(f'Core is at {current}, expected {REVISION}. Existing files were preserved. '
                 'Back up/move that checkout before restoring; do not use the latest Core.')
    subprocess.run([sys.executable, str(ROOT / 'scripts/apply-rhythm-core-patch.py')], check=True)
    print(f'Compatible Core ready: {REVISION} + rhythm-judgments-core.patch')


if __name__ == '__main__':
    try:
        restore()
    except subprocess.CalledProcessError as error:
        sys.exit(error.stderr or str(error))
