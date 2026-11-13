"""Validate the pinned UPM artifact without Unity or changing the submodule."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'package_core', Path(__file__).with_name('package-compatible-core.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class PackagedCoreTests(unittest.TestCase):
    def setUp(self):
        self.contents = {}
        with tarfile.open(builder.OUTPUT) as archive:
            for member in archive:
                self.assertTrue(member.isfile())
                self.assertTrue(member.name.startswith('package/'))
                self.assertNotIn('..', Path(member.name).parts)
                self.contents[member.name] = archive.extractfile(member).read()

    def test_manifest_and_provenance(self):
        manifest = json.loads((builder.ROOT / 'Packages/manifest.json').read_text())
        self.assertEqual(manifest['dependencies']['in.yarg.core'], 'file:' + builder.OUTPUT.name)
        provenance = json.loads(self.contents['package/SHREDDER_CORE_VERSION.json'])
        self.assertEqual(provenance['revision'], builder.REVISION)
        self.assertEqual(provenance['patchSha256'], hashlib.sha256(builder.PATCH.read_bytes()).hexdigest())
        self.assertIn('package/LICENSE.md', self.contents)

    def test_assets_have_unique_stable_metadata(self):
        guids = []
        for name, contents in self.contents.items():
            self.assertFalse(any(p in name.split('/') for p in ('.artifacts', 'obj', 'bin', '.git')))
            if not name.endswith('.meta'):
                self.assertIn(name + '.meta', self.contents)
            else:
                guids.extend(line for line in contents.decode().splitlines() if line.startswith('guid:'))
        self.assertEqual(len(guids), len(set(guids)))
        self.assertIn(b'guid: 0f3fe8abe204c3c4f9d35d95e262099f',
                      self.contents['package/YARG.Core.asmdef.meta'])

    def test_artifact_is_reproducible_from_public_base(self):
        delivered = builder.OUTPUT.read_bytes()
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(builder, 'OUTPUT', Path(temporary) / builder.OUTPUT.name):
                builder.build()
                self.assertEqual(builder.OUTPUT.read_bytes(), delivered)


if __name__ == '__main__':
    unittest.main()
