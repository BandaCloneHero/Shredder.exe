#!/usr/bin/env python3
"""Restore the delivered Core changes in another checkout, without changing Git history."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
core = root / 'YARG.Core'
patch = root / 'docs/patches/rhythm-judgments-core.patch'

def git(*args):
    return subprocess.run(['git', '-C', str(core), *args], capture_output=True, text=True)

if not (core / 'YARG.Core/Engine/BaseEngine.cs').exists():
    sys.exit('Restore the compatible Core first: python3 scripts/restore-compatible-core.py')
if git('apply', '--reverse', '--check', str(patch)).returncode == 0:
    print('Core judgment patch is already applied.')
    sys.exit(0)
expected = '3beb94e526558134145bcd3e409428f759001a40'
revision = git('rev-parse', 'HEAD')
if revision.returncode or revision.stdout.strip() != expected:
    sys.exit(f'Expected Core {expected}; no files changed. '
             'Use scripts/restore-compatible-core.py instead of updating Core to latest.')
result = git('apply', '--check', str(patch))
if result.returncode:
    sys.exit('Patch does not apply cleanly; no files changed.\n' + result.stderr)
result = git('apply', str(patch))
if result.returncode:
    sys.exit(result.stderr)
print('Core judgment patch applied. No commits or index changes were made.')
