"""Run with: py -m unittest discover -s scripts -p test_restore_compatible_core.py"""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'restore_core', Path(__file__).with_name('restore-compatible-core.py'))
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)


class RestoreTests(unittest.TestCase):
    def test_dirty_checkout_is_never_switched(self):
        with patch.object(restore, 'git', return_value=' M local.cs') as git:
            self.assertFalse(restore.recover_clean_checkout('old'))
            self.assertEqual(git.call_count, 1)

    def test_clean_master_is_backed_up_before_checkout(self):
        calls = []

        def git(*args, **kwargs):
            calls.append(args)
            return ''

        with tempfile.TemporaryDirectory() as directory:
            with patch.object(restore, 'git', side_effect=git), \
                    patch.object(restore.tempfile, 'mkdtemp', return_value=directory):
                self.assertTrue(restore.recover_clean_checkout('master-sha'))
        backup_index = next(i for i, c in enumerate(calls) if c[:2] == ('bundle', 'create'))
        checkout_index = next(i for i, c in enumerate(calls) if c[0] == 'checkout')
        self.assertLess(backup_index, checkout_index)
        self.assertIn('--no-overwrite-ignore', calls[checkout_index])
        self.assertFalse(any(c[0] == 'fetch' for c in calls))

    def test_missing_revision_fetches_only_pinned_commit(self):
        calls = []

        def git(*args, **kwargs):
            calls.append(args)
            if args[0] == 'cat-file':
                raise subprocess.CalledProcessError(1, 'git')
            return ''

        with tempfile.TemporaryDirectory() as directory:
            with patch.object(restore, 'git', side_effect=git), \
                    patch.object(restore.tempfile, 'mkdtemp', return_value=directory):
                restore.recover_clean_checkout('old')
        self.assertIn(('fetch', restore.REMOTE, restore.REVISION), calls)

    def test_windows_git_path_uses_filesystem_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            core = Path(directory)
            (core / '.git').touch()  # Submodules use a .git file, not a directory.
            windows_git_path = 'C:/Users/joaoa/OneDrive/Desktop/shredder/Shredder.exe/YARG.Core'

            def git(*args, **kwargs):
                return windows_git_path if args[-1] == '--show-toplevel' else restore.REVISION

            with patch.object(restore, 'CORE', core), \
                    patch.object(restore, 'git', side_effect=git), \
                    patch.object(restore.os.path, 'samefile', return_value=True) as samefile, \
                    patch.object(restore.subprocess, 'run') as run:
                restore.restore()
                samefile.assert_called_once_with(windows_git_path, core)
                run.assert_called_once()

    def test_parent_repository_is_not_accepted_as_core(self):
        with tempfile.TemporaryDirectory() as directory:
            core = Path(directory) / 'YARG.Core'
            core.mkdir()
            (core / 'unrelated.txt').touch()
            with patch.object(restore, 'CORE', core), \
                    patch.object(restore, 'git', return_value=directory), \
                    patch.object(restore.subprocess, 'run') as run:
                with self.assertRaises(SystemExit):
                    restore.restore()
                run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
