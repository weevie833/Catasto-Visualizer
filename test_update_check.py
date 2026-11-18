"""The update-available check (update_check.py, serve.py /api/update-check).
GitHub is never contacted: fetch_latest_tag and the opener are replaced."""

import io
import json
import os
import unittest
import urllib.error
import urllib.request
from unittest import mock

import serve
import update_check
from test_serve import ServerFixture


class UpdateCheckTests(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(update_check, "_cache", {"checked_at": None, "tag": None})
        patcher.start()
        self.addCleanup(patcher.stop)
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        os.environ.pop("CV_NO_UPDATE_CHECK", None)

    def latest_is(self, tag):
        calls = []
        patcher = mock.patch.object(update_check, "fetch_latest_tag", lambda: calls.append(1) or tag)
        patcher.start()
        self.addCleanup(patcher.stop)
        return calls

    def test_parse_version(self):
        cases = {"0.12.0": (0, 12, 0), "v1.10.0": (1, 10, 0), " v2.0.1\n": (2, 0, 1),
                 "dev": None, "": None, "0.12": None, "v1.2.3-beta": None}
        for text, expected in cases.items():
            self.assertEqual(update_check.parse_version(text), expected, text)

    def test_a_newer_release_is_reported(self):
        self.latest_is("v0.13.0")
        status = update_check.update_status("0.12.0")
        self.assertIs(status["update_available"], True)
        self.assertEqual((status["latest"], status["current"]), ("0.13.0", "0.12.0"))
        self.assertTrue(status["release_url"].endswith("/Catasto-Visualizer/releases/tag/v0.13.0"))
        self.assertTrue(status["mac_download_url"].endswith("/releases/download/v0.13.0/Catasto-Visualizer-Mac.dmg"))

    def test_versions_compare_as_numbers_not_text(self):
        self.latest_is("v0.100.0")
        self.assertIs(update_check.update_status("0.99.9")["update_available"], True)

    def test_the_same_or_an_older_release_is_not_an_update(self):
        self.latest_is("v0.12.0")
        for current in ("0.12.0", "0.13.0"):
            self.assertEqual(update_check.update_status(current), {"current": current, "update_available": False})

    def test_an_unknown_installed_version_never_checks(self):
        calls = self.latest_is("v9.9.9")
        for current in ("", "0.12"):
            self.assertIs(update_check.update_status(current)["update_available"], False)
        self.assertEqual(calls, [])

    def test_a_failed_check_shows_nothing(self):
        self.latest_is(None)
        self.assertIs(update_check.update_status("0.12.0")["update_available"], False)

    def test_it_can_be_turned_off(self):
        calls = self.latest_is("v9.9.9")
        os.environ["CV_NO_UPDATE_CHECK"] = "1"
        self.assertIs(update_check.update_status("0.12.0")["update_available"], False)
        self.assertEqual(calls, [])

    def test_the_answer_is_kept(self):
        calls = self.latest_is("v0.13.0")
        update_check.latest_tag(now=1000)
        update_check.latest_tag(now=1000 + update_check.CHECK_INTERVAL_SECONDS - 1)
        self.assertEqual(len(calls), 1)
        update_check.latest_tag(now=1000 + update_check.CHECK_INTERVAL_SECONDS)
        self.assertEqual(len(calls), 2)

    def test_a_failure_is_retried_sooner(self):
        calls = self.latest_is(None)
        update_check.latest_tag(now=0)
        update_check.latest_tag(now=update_check.RETRY_AFTER_SECONDS - 1)
        self.assertEqual(len(calls), 1)
        update_check.latest_tag(now=update_check.RETRY_AFTER_SECONDS)
        self.assertEqual(len(calls), 2)

    def test_the_tag_is_read_from_the_redirect(self):
        def redirect_to(location, code=302):
            headers = {"Location": location} if location is not None else {}
            return urllib.error.HTTPError(update_check.LATEST_URL, code, "Found", headers, None)

        cases = [
            (redirect_to("https://github.com/x/y/releases/tag/v0.13.0"), "v0.13.0"),
            (redirect_to("https://github.com/x/y/releases/tag/nightly"), None),
            (redirect_to("https://github.com/x/y/releases"), None),
            (redirect_to(None), None),
            (urllib.error.HTTPError(update_check.LATEST_URL, 404, "Not Found", {}, None), None),
            (urllib.error.URLError("offline"), None),
            (TimeoutError(), None),
            (None, None),    # a 200 with no redirect: no release published
        ]
        for outcome, expected in cases:
            requests = []

            class FakeOpener:
                def open(self, request, timeout, outcome=outcome, requests=requests):
                    requests.append((request, timeout))
                    if isinstance(outcome, Exception):
                        raise outcome
                    return io.BytesIO(b"")

            with mock.patch.object(urllib.request, "build_opener", lambda *handlers: FakeOpener()):
                self.assertEqual(update_check.fetch_latest_tag(), expected, outcome)
            request, timeout = requests[0]
            self.assertEqual((request.get_method(), request.full_url), ("HEAD", update_check.LATEST_URL))
            self.assertEqual(timeout, update_check.TIMEOUT_SECONDS)

    def test_the_request_carries_nothing_about_the_user(self):
        requests = []

        class FakeOpener:
            def open(self, request, timeout):
                requests.append(request)
                raise urllib.error.URLError("offline")

        with mock.patch.object(urllib.request, "build_opener", lambda *handlers: FakeOpener()):
            update_check.fetch_latest_tag()
        request = requests[0]
        self.assertIsNone(request.data)
        self.assertEqual({name.lower() for name in request.headers}, {"user-agent"})
        self.assertEqual(request.full_url, "https://github.com/weevie833/Catasto-Visualizer/releases/latest")

    @unittest.skipUnless(os.path.isfile(update_check.MAC_CA_FILE), "macOS certificate bundle")
    def test_certificates_are_loaded_even_when_python_has_none_of_its_own(self):
        with mock.patch("ssl.SSLContext.load_default_certs", lambda self, purpose=None: None):
            context = update_check._ssl_context()
        self.assertGreater(context.cert_store_stats()["x509_ca"], 0)
        self.assertEqual(context.verify_mode.name, "CERT_REQUIRED")
        self.assertTrue(context.check_hostname)

    def test_the_app_version_is_the_version_file(self):
        self.assertIsNotNone(update_check.parse_version(update_check.app_version()))


class UpdateCheckEndpointTests(ServerFixture, unittest.TestCase):
    def test_the_endpoint_answers(self):
        with mock.patch.object(serve, "app_version", lambda: "0.12.0"), \
                mock.patch.object(update_check, "_cache", {"checked_at": None, "tag": None}), \
                mock.patch.object(update_check, "fetch_latest_tag", lambda: "v0.13.0"), \
                mock.patch.dict(os.environ, {"CV_NO_UPDATE_CHECK": ""}), \
                self.fetch("api/update-check") as response:
            body = json.load(response)
            self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertIs(body["update_available"], True)
        self.assertEqual(body["latest"], "0.13.0")

    def test_the_banner_script_is_served(self):
        self.assertIn("/update-banner.js", serve.APP_FILES)


if __name__ == "__main__":
    unittest.main()
