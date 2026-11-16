"""Recusas que precisam acontecer antes de qualquer extração ou acesso ao Docker."""
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import ptw_operacao as op


class RecoveryTests(unittest.TestCase):
    def test_manifest_signature_rejects_modified_content(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'secrets').mkdir()
            (root / 'secrets/audit_anchor_key').write_bytes(b'key-for-local-test-only-' * 3)
            with patch.object(op, 'SERVER', root):
                manifest = {'format': 'ptw-backup/1', 'heads': [['unit', '42', 'abc']], 'files': {}}
                manifest['signature'] = op.signature(manifest)
                saved = manifest['signature']
                self.assertEqual(saved, op.signature(json.loads(json.dumps(manifest))))
                manifest['heads'][0][1] = '43'
                self.assertNotEqual(saved, op.signature(manifest))
                manifest['heads'][0][1] = '42'
                (root / 'secrets/audit_anchor_key').write_bytes(b'other-local-test-key-' * 3)
                self.assertNotEqual(saved, op.signature(manifest))

    def test_tar_cannot_escape_new_volume(self):
        for name, kind in [('safe/file.txt', tarfile.REGTYPE), ('../../outside', tarfile.REGTYPE),
                           ('/absolute', tarfile.REGTYPE), ('safe\\..\\outside', tarfile.REGTYPE),
                           ('symlink', tarfile.SYMTYPE), ('hardlink', tarfile.LNKTYPE)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                archive = Path(temp) / 'files.tar'
                with tarfile.open(archive, 'w') as f:
                    item = tarfile.TarInfo(name)
                    item.type = kind
                    item.size = 0
                    item.linkname = '../../outside' if kind != tarfile.REGTYPE else ''
                    f.addfile(item, io.BytesIO())
                if name == 'safe/file.txt':
                    op.validate_tar(archive)
                else:
                    with self.assertRaises(RuntimeError):
                        op.validate_tar(archive)


if __name__ == '__main__':
    unittest.main()
