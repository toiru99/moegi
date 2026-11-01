"""Loopback-only development catalog and npm tarball endpoint for Harness Discover."""
import argparse
import base64
import hashlib
import json
import re
import tarfile
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


class Catalog:
    def __init__(self, archive: Path, base_url: str, previous=(), legacy_version=None):
        self.releases = {}
        for path in [archive, *previous]:
            data = path.read_bytes()
            with tarfile.open(path, 'r:gz') as package:
                manifest = json.load(package.extractfile('package/package.json'))
            if not manifest.get('dsh', {}).get('bundle'):
                raise ValueError('The tarball must contain an actual Harness bundle.')
            version = manifest['version']
            if version in self.releases and self.releases[version]['archive'] != data:
                raise ValueError('A published version cannot identify different tarball bytes.')
            self.releases[version] = {
                'manifest': manifest, 'archive': data, 'timestamp': int(path.stat().st_mtime),
                'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode(),
            }
        with tarfile.open(archive, 'r:gz') as package:
            self.manifest = json.load(package.extractfile('package/package.json'))
        self.base_url = base_url.rstrip('/')
        self.name = self.manifest['name']
        self.version = self.manifest['version']
        if any(release['manifest']['name'] != self.name for release in self.releases.values()):
            raise ValueError('One local catalog serves one bundle family.')
        if legacy_version is not None and legacy_version not in self.releases:
            raise ValueError('The legacy version archive is missing.')
        self.legacy_version = legacy_version

    def version_metadata(self, version):
        release = self.releases[version]
        route = '/vn-studio.tgz' if version == self.legacy_version else f'/tarballs/{version}.tgz'
        return {**release['manifest'], 'dist': {
            'tarball': self.base_url + route, 'integrity': release['integrity'],
            'shasum': hashlib.sha1(release['archive']).hexdigest(),
        }}

    def respond(self, target):
        path = unquote(urlsplit(target).path)
        if '\\' in path or '..' in path.split('/'):
            return 404, {}, b'Not found'
        headers = {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}
        if path == '/vn-studio.tgz':
            return 200, {'Content-Type': 'application/octet-stream'}, self.releases[self.legacy_version or self.version]['archive']
        if path.startswith('/tarballs/') and path.endswith('.tgz'):
            version = path[len('/tarballs/'):-4]
            release = self.releases.get(version)
            return (200, {'Content-Type': 'application/octet-stream'}, release['archive']) if release else (404, {}, b'Not found')
        if path == '/index.json':
            value = {
                'format': 1, 'title': {'en': 'VN Studio local development', 'zh': '视觉小说本地开发'},
                'plugins': [{
                    'name': self.name, 'title': {'en': 'Novel studio', 'zh': '视觉小说工作室'},
                    'description': {'en': 'Dialogue, choices, ChatGPT sign-in and actual Siglus previews inside Harness.', 'zh': '在Harness中编写对白、使用ChatGPT并运行Siglus预览。'},
                    'author': 'Local development',
                    'versions': [{'version': version, 'publishTimestamp': release['timestamp'],
                                  'source': {'type': 'npm', 'registry': self.base_url},
                                  'engines': release['manifest'].get('engines', {})}
                                 for version, release in self.releases.items()],
                }],
            }
        elif path == '/' + self.name:
            value = {
                'name': self.name, 'dist-tags': {'latest': self.version},
                'versions': {version: self.version_metadata(version) for version in self.releases},
                'time': {version: datetime.fromtimestamp(release['timestamp'], timezone.utc).isoformat()
                         for version, release in self.releases.items()},
            }
        elif path.startswith('/' + self.name + '/') and path[len(self.name) + 2:] in self.releases:
            value = self.version_metadata(path[len(self.name) + 2:])
        elif path == '/-/ping':
            value = {'ok': True}
        elif re.fullmatch(r'/(?:@[a-z0-9._~-]+/)?[a-z0-9][a-z0-9._~-]*(?:/[a-z0-9][a-z0-9._~+\-]*)?', path, re.I):
            # Other public dependency metadata stays on the ordinary npm registry.
            return 302, {'Location': 'https://registry.npmjs.org' + target}, b''
        else:
            return 404, {}, b'Not found'
        return 200, headers, json.dumps(value, ensure_ascii=False).encode('utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tarball', required=True, type=Path)
    parser.add_argument('--port', type=int, default=3091)
    parser.add_argument('--archive-directory', type=Path)
    parser.add_argument('--legacy-version')
    args = parser.parse_args()
    previous = list(args.archive_directory.glob('*.tgz')) if args.archive_directory else []
    catalog = Catalog(args.tarball, f'http://127.0.0.1:{args.port}', previous=previous, legacy_version=args.legacy_version)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            status, headers, body = catalog.respond(self.path)
            self.send_response(status)
            for key, value in headers.items():
                self.send_header(key, value)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'VN Studio local catalog: {catalog.base_url}/index.json', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
