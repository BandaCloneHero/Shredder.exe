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
    sys.exit('Initialize YARG.Core first: git submodule update --init YARG.Core')
if git('apply', '--reverse', '--check', str(patch)).returncode == 0:
    print('Core judgment patch is already applied.')
    sys.exit(0)
result = git('apply', '--check', str(patch))
if result.returncode:
    sys.exit('Patch does not apply cleanly; no files changed.\n' + result.stderr)
result = git('apply', str(patch))
if result.returncode:
    sys.exit(result.stderr)
print('Core judgment patch applied. No commits or index changes were made.')
