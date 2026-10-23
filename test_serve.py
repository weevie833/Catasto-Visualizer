"""Tests for serve.py. Run with: python -m unittest test_serve.py"""

import mimetypes
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

import serve


class ServeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        (root / "app.js").write_text("export const ok = true;", encoding="utf-8")
        (root / "index.html").write_text("<!doctype html>", encoding="utf-8")
        (root / "data.json").write_text("{}", encoding="utf-8")
        (root / ".git").mkdir()
        (root / ".git" / "config").write_text("[core]", encoding="utf-8")
        self.server = serve.create_server(port=0, directory=root)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.directory.cleanup()
        mimetypes.init()

    def fetch(self, path):
        return urllib.request.urlopen(f"http://127.0.0.1:{self.port}/{path}")

    def test_binds_to_this_computer_only(self):
        self.assertEqual(self.server.server_address[0], "127.0.0.1")

    def test_javascript_type_ignores_a_wrong_system_mapping(self):
        # Simulates a Windows registry that labels .js files as plain text.
        mimetypes.add_type("text/plain", ".js")
        with self.fetch("app.js") as response:
            self.assertEqual(response.headers["Content-Type"], "text/javascript; charset=utf-8")

    def test_app_files_get_fixed_types_and_revalidation(self):
        with self.fetch("index.html") as response:
            self.assertEqual(response.headers["Content-Type"], "text/html; charset=utf-8")
            self.assertEqual(response.headers["Cache-Control"], "no-cache")
        with self.fetch("data.json") as response:
            self.assertEqual(response.headers["Content-Type"], "application/json; charset=utf-8")

    def test_hidden_files_are_not_served(self):
        for path in (".git/config", "%2Egit/config"):
            with self.subTest(path=path), self.assertRaises(urllib.error.HTTPError) as error:
                self.fetch(path)
            self.assertEqual(error.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
