"""Serve the Catasto Visualizer on this computer only.

Python's built-in server takes file types from the Windows registry, which on many
machines labels .js files as text/plain. Browsers refuse to run JavaScript modules
with that type, so the 3D view fails. This server sends fixed types instead.

Usage:  python serve.py [--port 8000]     (Windows: py serve.py)
"""

from __future__ import annotations

import argparse
import functools
import http.server
import posixpath
import urllib.parse
from pathlib import Path

HOST = "127.0.0.1"
DEFAULT_PORT = 8000
ROOT = Path(__file__).resolve().parent

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}


class CatastoRequestHandler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        extension = posixpath.splitext(path)[1].lower()
        return CONTENT_TYPES.get(extension) or super().guess_type(path)

    def is_hidden_path(self):
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        return any(part.startswith(".") for part in path.split("/") if part)

    def send_head(self):
        # Keeps .git and other hidden files out of reach of the browser.
        if self.is_hidden_path():
            self.send_error(404, "File not found")
            return None
        return super().send_head()

    def end_headers(self):
        # Makes the browser check for updated app files instead of mixing cached versions.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def create_server(port: int = DEFAULT_PORT, directory: Path = ROOT) -> http.server.ThreadingHTTPServer:
    handler = functools.partial(CatastoRequestHandler, directory=str(directory))
    return http.server.ThreadingHTTPServer((HOST, port), handler)


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the Catasto Visualizer on this computer only.")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT,
                        help="keep 8000 to reopen the same browser project library (default: 8000)")
    port = parser.parse_args().port
    with create_server(port) as server:
        print(f"Catasto Visualizer: http://{HOST}:{port}/index.html  (Ctrl+C to stop)")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
