"""Serve the Catasto Visualizer on this computer only.

Python's built-in server takes file types from the Windows registry, which on many
machines labels .js files as text/plain. Browsers refuse to run JavaScript modules
with that type, so the 3D view fails. This server sends fixed types instead.

It also saves projects as files in a per-user folder outside the app (see
project_store.py), through a small /api/ that only pages it served can use.

Usage:  python serve.py [--port 8000] [--open]     (Windows: py serve.py)

The double-click launchers in this folder run it with --open.
"""

from __future__ import annotations

import argparse
import errno
import functools
import http.server
import posixpath
import threading
import urllib.parse
import webbrowser
from pathlib import Path

from project_store import (
    DataDirInUse,
    DataDirLock,
    ProjectError,
    ProjectStore,
    default_data_dir,
    dumps,
    loads,
)

HOST = "127.0.0.1"
DEFAULT_PORT = 8000
ROOT = Path(__file__).resolve().parent
# Large enough for a whole Catasto with its source text; stops a runaway request filling the disk.
MAX_REQUEST_BYTES = 200 * 1024 * 1024
# A stalled connection is dropped after this many seconds of silence.
REQUEST_TIMEOUT_SECONDS = 30
# Requests handled at once; further connections wait their turn instead of starting more threads.
MAX_CONCURRENT_REQUESTS = 32
# Pages may run and style themselves only from the app's own files, and talk only to this server.
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; "
    "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
)
# The only files the server hands out. Transcriptions, backups, and anything else kept in the app
# folder stay unreachable from the browser.
APP_FILES = {
    "/index.html",
    "/admin.html",
    "/admin.css",
    "/admin.js",
    "/app.js",
    "/building-types.js",
    "/catasto-name-index.js",
    "/catasto-parser.js",
    "/catasto-records.js",
    "/catasto-relations.js",
    "/catasto-storage.js",
    "/catasto-xlsx-index.js",
    "/catasto-xlsx.js",
    "/index.css",
    "/scene3d-boot.js",
    "/scene3d.css",
    "/scene3d.js",
    "/vendor/OrbitControls.js",
    "/vendor/three.module.js",
}

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
    timeout = REQUEST_TIMEOUT_SECONDS

    def __init__(self, *args, store: ProjectStore, **kwargs):
        self.store = store
        super().__init__(*args, **kwargs)

    def guess_type(self, path):
        extension = posixpath.splitext(path)[1].lower()
        return CONTENT_TYPES.get(extension) or super().guess_type(path)

    def send_head(self):
        # A rebound address reaches this server under a foreign Host; refuse it before any file.
        if self.headers.get("Host", "") not in self.allowed_hosts():
            self.send_error(403, "Forbidden")
            return None
        path = self.request_path()
        if path == "/":
            self.path = "/index.html"
        elif path not in APP_FILES:
            self.send_error(404, "File not found")
            return None
        return super().send_head()

    def end_headers(self):
        # App files: the browser checks for updates instead of mixing cached versions.
        # Project replies: the browser keeps no copy of the project in its cache.
        self.send_header("Cache-Control", "no-store" if self.is_api() else "no-cache")
        # Stops the browser treating a file as a different type than the one sent.
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", CONTENT_SECURITY_POLICY)
        super().end_headers()

    # Project API

    def request_path(self) -> str:
        return urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)

    def allowed_hosts(self) -> set[str]:
        port = self.server.server_address[1]
        return {f"127.0.0.1:{port}", f"localhost:{port}"}

    # Blocks other websites: a rebound address arrives with a foreign Host, and a cross-site write
    # carries a foreign Origin (or, for a form post, no JSON content type).
    def refuse_foreign_request(self, method: str) -> bool:
        host = self.headers.get("Host", "")
        refused = host not in self.allowed_hosts()
        if method != "GET" and not refused:
            refused = self.headers.get("Origin") != f"http://{host}"
        if method in ("POST", "PUT") and not refused:
            content_type = self.headers.get("Content-Type", "").split(";")[0].strip().lower()
            refused = content_type != "application/json"
        if refused:
            self.send_json(403, {"error": "Only the Catasto Visualizer on this computer can use project storage."})
        return refused

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ProjectError(400, "The request has no valid length.") from None
        if length < 0:
            raise ProjectError(400, "The request has no valid length.")
        if length > MAX_REQUEST_BYTES:
            raise ProjectError(413, "The project is too large to save.")
        try:
            payload = loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            raise ProjectError(400, "The request is not valid JSON.") from None
        if not isinstance(payload, dict):
            raise ProjectError(400, "The request is not a storage request.")
        return payload

    def send_json(self, status: int, payload: object) -> None:
        body = dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_api(self, method: str) -> None:
        if self.refuse_foreign_request(method):
            return
        parts = self.request_path().strip("/").split("/")[1:]
        try:
            if parts == ["projects"] and method == "GET":
                self.send_json(200, self.store.list())
            elif parts == ["projects", "import"] and method == "POST":
                self.store.add_all(self.read_json().get("projects"))
                self.send_json(200, {"ok": True})
            elif parts == ["migrate"] and method == "POST":
                self.send_json(200, self.store.migrate(self.read_json().get("projects")))
            elif len(parts) == 2 and parts[0] == "projects" and method == "GET":
                project = self.store.get(parts[1])
                self.send_json(200, project) if project else self.send_json(404, {"error": "Project not found."})
            elif len(parts) == 2 and parts[0] == "projects" and method == "PUT":
                request = self.read_json()
                project = request.get("project")
                if not isinstance(project, dict) or project.get("id") != parts[1]:
                    raise ProjectError(400, "The project does not match its address.")
                saved = self.store.save(project, request.get("loadedUpdatedAt"), bool(request.get("create")), request.get("snapshot"))
                self.send_json(200, saved)
            elif len(parts) == 3 and parts[0] == "projects" and parts[2] == "export" and method == "GET":
                exported = self.store.export(parts[1])
                self.send_json(200, exported) if exported else self.send_json(404, {"error": "Project not found."})
            elif len(parts) == 3 and parts[0] == "projects" and parts[2] == "snapshot" and method == "GET":
                snapshot = self.store.get_snapshot(parts[1])
                self.send_json(200, snapshot) if snapshot else self.send_json(404, {"error": "This project has no previous version."})
            elif len(parts) == 3 and parts[0] == "projects" and parts[2] == "restore" and method == "POST":
                request = self.read_json()
                self.send_json(200, self.store.restore_snapshot(parts[1], request.get("loadedUpdatedAt"), request.get("data")))
            elif len(parts) == 2 and parts[0] == "projects" and method == "DELETE":
                self.store.delete(parts[1], self.read_json().get("loadedUpdatedAt"))
                self.send_json(200, {"ok": True})
            else:
                self.send_json(404, {"error": "Unknown storage request."})
        except ProjectError as error:
            self.send_json(error.status, {"error": str(error)})
        except OSError as error:
            self.send_json(500, {"error": f"The project folder could not be written: {error.strerror or error}"})

    def is_api(self) -> bool:
        return self.request_path().startswith("/api/")

    def do_GET(self):
        self.handle_api("GET") if self.is_api() else super().do_GET()

    def do_HEAD(self):
        self.send_json(405, {"error": "Not supported."}) if self.is_api() else super().do_HEAD()

    def do_POST(self):
        self.handle_api("POST") if self.is_api() else self.send_error(405)

    def do_PUT(self):
        self.handle_api("PUT") if self.is_api() else self.send_error(405)

    def do_DELETE(self):
        self.handle_api("DELETE") if self.is_api() else self.send_error(405)


class CatastoServer(http.server.ThreadingHTTPServer):
    def __init__(self, *args, store: ProjectStore | None = None, data_lock: DataDirLock | None = None, **kwargs):
        self.slots = threading.BoundedSemaphore(MAX_CONCURRENT_REQUESTS)
        self.store = store
        self.data_lock = data_lock
        super().__init__(*args, **kwargs)

    def server_close(self):
        try:
            super().server_close()
        finally:
            if self.data_lock:
                self.data_lock.release()

    def process_request(self, request, client_address):
        self.slots.acquire()
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


# The project folder is locked before its interrupted changes are recovered, so a second launch,
# on any port, stops here (DataDirInUse) instead of recovering or changing a running server's work.
def create_server(port: int = DEFAULT_PORT, directory: Path = ROOT, data_dir: Path | None = None) -> CatastoServer:
    data_dir = data_dir or default_data_dir()
    lock = DataDirLock(data_dir)
    try:
        store = ProjectStore(data_dir)
        handler = functools.partial(CatastoRequestHandler, directory=str(directory), store=store)
        return CatastoServer((HOST, port), handler, store=store, data_lock=lock)
    except BaseException:
        lock.release()
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the Catasto Visualizer on this computer only.")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT,
                        help="keep 8000 to reopen the same browser project library (default: 8000)")
    parser.add_argument("--open", action="store_true", help="open the Visualizer in the default browser")
    args = parser.parse_args()
    url = f"http://{HOST}:{args.port}/index.html"
    try:
        server = create_server(args.port)
    except DataDirInUse:
        # Another launch, perhaps on a different port, is already serving this computer's projects.
        print("The Catasto Visualizer is already running; this launch was stopped so it cannot change the open one's projects.")
        print(f"If it was started on port {args.port}, it is at {url}")
        if args.open:
            webbrowser.open(url)
        return
    except OSError as error:
        if error.errno != errno.EADDRINUSE:
            raise
        # Usually the Visualizer is already running from an earlier launch; reopen it instead of failing.
        print(f"Port {args.port} is already in use, probably by an open Catasto Visualizer window.")
        if args.open:
            webbrowser.open(url)
        return
    with server:
        print(f"Catasto Visualizer: {url}")
        print(f"Projects are saved in: {default_data_dir() / 'projects'}")
        print("Keep this window open while you use the app. Close it (or press Ctrl+C) to stop.")
        if args.open:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
