import io
import json
import tarfile
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from vn_store import Catalog


class CatalogTest(unittest.TestCase):
    def test_updates_keep_old_metadata_and_tarballs_immutable(self):
        with tempfile.TemporaryDirectory() as directory:
            archives = []
            for version in ['0.2.2-alpha.2', '0.2.2-alpha.2-vn.1']:
                path = Path(directory) / f'plugin-{version}.tgz'
                data = json.dumps({'name': '@deepseek-ai/dsh-client-ui-vn-studio', 'version': version,
                                   'dsh': {'bundle': {'patch': './cordis.patch.yml'}}}).encode()
                with tarfile.open(path, 'w:gz') as archive:
                    member = tarfile.TarInfo('package/package.json')
                    member.size = len(data)
                    archive.addfile(member, io.BytesIO(data))
                archives.append(path)
            catalog = Catalog(archives[1], 'http://127.0.0.1:3091', previous=[archives[0]], legacy_version='0.2.2-alpha.2')
            metadata = json.loads(catalog.respond('/@deepseek-ai%2fdsh-client-ui-vn-studio')[2])
            old = metadata['versions']['0.2.2-alpha.2']
            new = metadata['versions']['0.2.2-alpha.2-vn.1']
            self.assertEqual(old['dist']['tarball'], 'http://127.0.0.1:3091/vn-studio.tgz')
            self.assertEqual(catalog.respond('/vn-studio.tgz')[2], archives[0].read_bytes())
            self.assertIn('/tarballs/0.2.2-alpha.2-vn.1.tgz', new['dist']['tarball'])
            self.assertEqual(catalog.respond('/tarballs/0.2.2-alpha.2-vn.1.tgz')[2], archives[1].read_bytes())
            self.assertEqual(int(datetime.fromisoformat(metadata['time']['0.2.2-alpha.2-vn.1']).timestamp()), int(archives[1].stat().st_mtime))

    def test_catalog_and_registry_publish_the_same_version_and_verified_tarball(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'plugin.tgz'
            manifest = {'name': '@deepseek-ai/dsh-client-ui-vn-studio', 'version': '0.2.2-alpha.2', 'dsh': {'bundle': {'patch': './cordis.patch.yml'}}}
            data = json.dumps(manifest).encode()
            with tarfile.open(path, 'w:gz') as archive:
                member = tarfile.TarInfo('package/package.json')
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
            catalog = Catalog(path, 'http://127.0.0.1:3091')
            index = json.loads(catalog.respond('/index.json')[2])
            metadata = json.loads(catalog.respond('/@deepseek-ai%2fdsh-client-ui-vn-studio')[2])
            self.assertEqual(index['plugins'][0]['versions'][0]['version'], manifest['version'])
            published = metadata['versions'][manifest['version']]
            self.assertTrue(published['dist']['integrity'].startswith('sha512-'))
            self.assertEqual(catalog.respond('/vn-studio.tgz')[2], path.read_bytes())
            self.assertEqual(catalog.respond('/../../Windows/system.ini')[0], 404)
            self.assertEqual(catalog.respond('/%2e%2e/secrets')[0], 404)


if __name__ == '__main__':
    unittest.main()
