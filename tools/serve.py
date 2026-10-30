"""Serve web/ on the local network with caching off, so phones always get fresh files.

    python3 tools/serve.py [port]
"""
import http.server, os, socket, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web')


class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript',
                      '.glb': 'model/gltf-binary', '.wasm': 'application/wasm'}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # code and the bake change all the time: never cached. The PC's icons and sounds don't,
        # and its screen snapshots re-request them every capture, so those may be cached.
        static = self.path.startswith('/pc/xp/') or self.path.split('?')[0].endswith(('.woff', '.woff2', '.wav', '.mp3'))
        self.send_header('Cache-Control', 'public, max-age=3600' if static else 'no-store')
        # the PC's Cricket 07 needs SharedArrayBuffer, which needs the page around it isolated
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'credentialless')
        super().end_headers()


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('192.168.0.1', 1))
        return s.getsockname()[0]
    except OSError:
        return 'localhost'
    finally:
        s.close()


if __name__ == '__main__':
    print(f'serving on http://localhost:{PORT}  and  http://{lan_ip()}:{PORT}', flush=True)
    http.server.ThreadingHTTPServer(('0.0.0.0', PORT), NoCache).serve_forever()
