"""Tests for serve.py. Run with: python -m unittest test_serve.py"""

import http.client
import json
import mimetypes
import os
import socket
import stat
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

import project_store
import serve


class ServerFixture:
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        (root / "admin.js").write_text("export const ok = true;", encoding="utf-8")
        (root / "index.html").write_text("<!doctype html>", encoding="utf-8")
        (root / "households.json").write_text("{}", encoding="utf-8")
        (root / "MM Transcription.md").write_text("private source", encoding="utf-8")
        (root / "vendor").mkdir()
        (root / "vendor" / "three.module.js").write_text("export {};", encoding="utf-8")
        (root / ".git").mkdir()
        (root / ".git" / "config").write_text("[core]", encoding="utf-8")
        self.data = tempfile.TemporaryDirectory()
        self.server = serve.create_server(port=0, directory=root, data_dir=Path(self.data.name))
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.directory.cleanup()
        self.data.cleanup()
        mimetypes.init()

    def fetch(self, path):
        return urllib.request.urlopen(f"http://127.0.0.1:{self.port}/{path}")


class ServeTests(ServerFixture, unittest.TestCase):
    def test_binds_to_this_computer_only(self):
        self.assertEqual(self.server.server_address[0], "127.0.0.1")

    def test_javascript_type_ignores_a_wrong_system_mapping(self):
        # Simulates a Windows registry that labels .js files as plain text.
        mimetypes.add_type("text/plain", ".js")
        with self.fetch("admin.js") as response:
            self.assertEqual(response.headers["Content-Type"], "text/javascript; charset=utf-8")

    def test_app_files_get_fixed_types_revalidation_and_nosniff(self):
        for path in ("index.html", ""):
            with self.subTest(path=path), self.fetch(path) as response:
                self.assertEqual(response.headers["Content-Type"], "text/html; charset=utf-8")
                self.assertEqual(response.headers["Cache-Control"], "no-cache")
                self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
                self.assertIn("script-src 'self'", response.headers["Content-Security-Policy"])
                self.assertNotIn("unsafe-inline", response.headers["Content-Security-Policy"])
        with self.fetch("vendor/three.module.js") as response:
            self.assertEqual(response.headers["Content-Type"], "text/javascript; charset=utf-8")

    def test_only_app_files_are_served(self):
        for path in (".git/config", "%2Egit/config", "households.json", "MM%20Transcription.md", "vendor/", "test_serve.py"):
            with self.subTest(path=path), self.assertRaises(urllib.error.HTTPError) as error:
                self.fetch(path)
            self.assertEqual(error.exception.code, 404)

    def raw_request(self, method, path, host):
        connection = http.client.HTTPConnection("127.0.0.1", self.port)
        connection.request(method, path, headers={"Host": host})
        response = connection.getresponse()
        response.read()
        connection.close()
        return response.status

    def test_a_rebound_address_cannot_read_app_files(self):
        for method in ("GET", "HEAD"):
            with self.subTest(method=method):
                self.assertEqual(self.raw_request(method, "/index.html", "attacker.example"), 403)
                self.assertEqual(self.raw_request(method, "/index.html", f"localhost:{self.port}"), 200)

    def test_a_stalled_connection_is_dropped(self):
        self.assertEqual(serve.CatastoRequestHandler.timeout, serve.REQUEST_TIMEOUT_SECONDS)


def household(record_id):
    return {"id": record_id, "household_head": f"Head {record_id}", "residence": {"place": None, "adjacent_to": []}}


def project(project_id, name="Marano", updated_at="2026-01-01T00:00:00.000Z"):
    return {"id": project_id, "name": name, "updatedAt": updated_at, "data": {"households": []}}


class ProjectApiTests(ServerFixture, unittest.TestCase):
    def api(self, method, path, payload=None, origin="same", host=None, content_type="application/json"):
        """Returns (status, decoded JSON) for a storage request."""
        base = f"127.0.0.1:{self.port}"
        request = urllib.request.Request(f"http://{base}/api/{path}", method=method,
                                         data=None if payload is None else json.dumps(payload).encode())
        if host:
            request.add_header("Host", host)
        if origin == "same":
            request.add_header("Origin", f"http://{host or base}")
        elif origin:
            request.add_header("Origin", origin)
        if payload is not None:
            request.add_header("Content-Type", content_type)
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    def test_a_negative_length_is_refused_without_waiting_for_more_data(self):
        connection = socket.create_connection(("127.0.0.1", self.port), timeout=5)
        connection.sendall((f"POST /api/migrate HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\n"
                            f"Origin: http://127.0.0.1:{self.port}\r\nContent-Type: application/json\r\n"
                            "Content-Length: -1\r\n\r\n").encode())
        reply = connection.recv(200).decode()
        connection.close()
        self.assertIn(" 400 ", reply.splitlines()[0])

    def test_saves_in_the_same_millisecond_still_detect_a_stale_copy(self):
        frozen = "2026-10-26T10:00:00.000Z"
        original = project_store.datetime
        class FrozenClock(original):
            @classmethod
            def now(cls, tz=None):
                return original.fromisoformat("2026-10-26T10:00:00.000+00:00")
        project_store.datetime = FrozenClock
        try:
            _, created = self.api("PUT", "projects/p1", {"project": project("p1"), "create": True})
            _, first = self.api("PUT", "projects/p1", {"project": {**created, "name": "First"}, "loadedUpdatedAt": created["updatedAt"]})
            status, _ = self.api("PUT", "projects/p1", {"project": {**created, "name": "Second"}, "loadedUpdatedAt": created["updatedAt"]})
        finally:
            project_store.datetime = original
        self.assertEqual(created["updatedAt"], frozen)
        self.assertNotEqual(first["updatedAt"], created["updatedAt"])
        self.assertEqual(status, 409)
        self.assertEqual(self.api("GET", "projects/p1")[1]["name"], "First")

    def project_files(self):
        return sorted(path.name for path in (Path(self.data.name) / "projects").glob("*.json"))

    def test_a_project_is_created_saved_listed_and_deleted_as_a_file(self):
        self.assertEqual(self.api("GET", "projects"), (200, []))
        status, created = self.api("PUT", "projects/p1", {"project": project("p1"), "create": True})
        self.assertEqual(status, 200)
        self.assertEqual(self.project_files(), ["p1.json"])
        renamed = {**created, "name": "Marano 1754"}
        status, saved = self.api("PUT", "projects/p1", {"project": renamed, "loadedUpdatedAt": created["updatedAt"]})
        self.assertEqual((status, saved["name"]), (200, "Marano 1754"))
        self.assertEqual(self.api("GET", "projects/p1")[1]["name"], "Marano 1754")
        self.assertEqual([item["id"] for item in self.api("GET", "projects")[1]], ["p1"])
        self.assertEqual(self.api("DELETE", "projects/p1", {"loadedUpdatedAt": created["updatedAt"]})[0], 409, "a stale delete is refused")
        self.assertEqual(self.api("DELETE", "projects/p1", {"loadedUpdatedAt": saved["updatedAt"]})[0], 200)
        self.assertEqual(self.api("GET", "projects/p1")[0], 404)
        self.assertEqual(self.project_files(), [])

    def test_the_list_carries_names_and_counts_but_not_project_data(self):
        item = {**project("p1"), "sourceText": "long transcription", "data": {"source_language": "it", "households": [household("a")]}}
        self.api("PUT", "projects/p1", {"project": item, "create": True})
        _, listed = self.api("GET", "projects")
        self.assertEqual(listed[0]["householdCount"], 1)
        self.assertEqual(listed[0]["sourceLanguage"], "it")
        self.assertNotIn("data", listed[0])
        self.assertNotIn("sourceText", listed[0])

    def test_an_update_keeps_the_previous_data_as_a_snapshot_that_can_be_restored(self):
        original = {**project("p1"), "data": {"households": [household("a")]}}
        _, created = self.api("PUT", "projects/p1", {"project": original, "create": True})
        updated = {**created, "data": {"households": [household("a"), household("b")]}}
        status, saved = self.api("PUT", "projects/p1", {"project": updated, "loadedUpdatedAt": created["updatedAt"], "snapshot": {"reason": "Before reparsing"}})
        self.assertEqual(status, 200)
        status, snapshot = self.api("GET", "projects/p1/snapshot")
        self.assertEqual((status, snapshot["reason"], len(snapshot["data"]["households"])), (200, "Before reparsing", 1))
        self.assertIsNotNone(self.api("GET", "projects")[1][0]["snapshotCreatedAt"])
        # The snapshot is a separate file, so it does not count toward the project's size.
        self.assertEqual(len(self.api("GET", "projects/p1")[1]["data"]["households"]), 2)

        self.assertEqual(self.api("POST", "projects/p1/restore", {"loadedUpdatedAt": "stale"})[0], 409)
        status, restored = self.api("POST", "projects/p1/restore", {"loadedUpdatedAt": saved["updatedAt"]})
        self.assertEqual((status, len(restored["data"]["households"])), (200, 1))
        self.assertEqual(len(self.api("GET", "projects/p1/snapshot")[1]["data"]["households"]), 2, "a restore can be undone")

        self.api("DELETE", "projects/p1", {"loadedUpdatedAt": restored["updatedAt"]})
        self.assertEqual(self.api("GET", "projects/p1/snapshot")[0], 404)

    def test_malformed_or_duplicate_households_are_refused_at_every_write(self):
        cases = {
            "empty record": [{}],
            "no head": [{"id": "a"}],
            "neighbors not names": [{**household("a"), "residence": {"adjacent_to": [3]}}],
            "pages not numbers": [{**household("a"), "source_pages": ["1"]}],
            "duplicate ids": [household("a"), household("a")],
        }
        for label, households in cases.items():
            with self.subTest(label):
                item = {**project("p1"), "data": {"households": households}}
                self.assertEqual(self.api("PUT", "projects/p1", {"project": item, "create": True})[0], 400)
                self.assertEqual(self.api("POST", "projects/import", {"projects": [item]})[0], 400)
                self.assertEqual(self.api("POST", "migrate", {"projects": [item]})[1]["skipped"], 1)
        self.assertEqual(self.project_files(), [])

    def test_a_new_project_requires_an_explicit_create(self):
        status, body = self.api("PUT", "projects/p1", {"project": project("p1")})
        self.assertEqual(status, 409)
        self.assertIn("deleted in another tab", body["error"])
        self.assertEqual(self.project_files(), [])

    def test_a_stale_copy_cannot_overwrite_a_newer_save(self):
        _, created = self.api("PUT", "projects/p1", {"project": project("p1"), "create": True})
        self.api("PUT", "projects/p1", {"project": {**created, "name": "First"}, "loadedUpdatedAt": created["updatedAt"]})
        status, body = self.api("PUT", "projects/p1", {"project": {**created, "name": "Second"}, "loadedUpdatedAt": created["updatedAt"]})
        self.assertEqual(status, 409)
        self.assertIn("changed in another tab", body["error"])
        self.assertEqual(self.api("GET", "projects/p1")[1]["name"], "First")

    def test_an_import_with_a_collision_stores_none_of_its_projects(self):
        self.api("PUT", "projects/p1", {"project": project("p1"), "create": True})
        status, _ = self.api("POST", "projects/import", {"projects": [project("p2"), project("p1", "Collision")]})
        self.assertEqual(status, 409)
        self.assertEqual(self.project_files(), ["p1.json"])
        self.assertEqual(self.api("GET", "projects/p1")[1]["name"], "Marano")

    def test_ids_that_could_name_other_files_are_refused(self):
        for project_id in ("..", "a.b", "%2E%2E"):
            with self.subTest(project_id=project_id):
                status, _ = self.api("PUT", f"projects/{project_id}", {"project": project(project_id), "create": True})
                self.assertIn(status, (400, 404))
        self.assertEqual(list(Path(self.data.name).rglob("*.json")), [])

    def test_invalid_household_data_is_refused(self):
        bad = {**project("p1"), "data": {"households": "none"}}
        self.assertEqual(self.api("PUT", "projects/p1", {"project": bad, "create": True})[0], 400)

    def test_other_websites_cannot_use_project_storage(self):
        write = {"project": project("p1"), "create": True}
        cases = {
            "foreign origin": {"origin": "https://example.com"},
            "no origin": {"origin": None},
            "form post": {"content_type": "text/plain"},
            "rebound host": {"host": "attacker.example:80"},
        }
        for label, options in cases.items():
            with self.subTest(label):
                self.assertEqual(self.api("PUT", "projects/p1", write, **options)[0], 403)
        self.assertEqual(self.api("GET", "projects", host="attacker.example:80")[0], 403)
        self.assertEqual(self.project_files(), [])

    def test_migration_copies_each_browser_project_once(self):
        self.api("PUT", "projects/p1", {"project": project("p1", "Already here"), "create": True})
        browser = [project("p1", "Old copy"), project("p2"), {"id": "broken"}]
        self.assertEqual(self.api("POST", "migrate", {"projects": browser}), (200, {"added": 1, "skipped": 1}))
        self.assertEqual(self.api("GET", "projects/p1")[1]["name"], "Already here")

        # A copied project the user deletes later must not come back from the browser's old copy.
        self.api("DELETE", "projects/p2", {"loadedUpdatedAt": self.api("GET", "projects/p2")[1]["updatedAt"]})
        self.assertEqual(self.api("POST", "migrate", {"projects": browser})[1]["added"], 0)
        self.assertEqual(self.project_files(), ["p1.json"])


class ProjectStoreTests(unittest.TestCase):
    def setUp(self):
        self.data = tempfile.TemporaryDirectory()
        self.root = Path(self.data.name)

    def tearDown(self):
        self.data.cleanup()

    def test_an_import_interrupted_by_a_crash_is_undone_at_next_start(self):
        store = project_store.ProjectStore(self.root)
        store.write(project("kept"))
        # The state a crash leaves: the journal written and one of two projects on disk.
        project_store.atomic_write_text(self.root / project_store.IMPORT_JOURNAL, json.dumps({"ids": ["new-1", "new-2"]}))
        store.write(project("new-1"))
        restarted = project_store.ProjectStore(self.root)
        self.assertEqual([item["id"] for item in restarted.list()], ["kept"])
        self.assertFalse((self.root / project_store.IMPORT_JOURNAL).exists())

    def stored_pair(self):
        store = project_store.ProjectStore(self.root)
        store.save({**project("p1"), "data": {"households": [household("a")]}}, None, create=True)
        first = store.get("p1")
        store.save({**first, "data": {"households": [household("b")]}}, first["updatedAt"], snapshot={"reason": "First update"})
        return store, store.get("p1")

    def heads(self, record):
        return [item["id"] for item in record["data"]["households"]]

    def test_a_failed_write_while_updating_leaves_both_the_project_and_its_snapshot(self):
        store, current = self.stored_pair()
        original_write = project_store.atomic_write_text
        def fail_on_staged_project(path, text):
            if path.name.endswith(".project.json"):
                raise OSError(28, "No space left on device")
            original_write(path, text)
        project_store.atomic_write_text = fail_on_staged_project
        try:
            with self.assertRaises(OSError):
                store.save({**current, "data": {"households": [household("c")]}}, current["updatedAt"], snapshot={"reason": "Second update"})
        finally:
            project_store.atomic_write_text = original_write
        self.assertEqual(self.heads(store.get("p1")), ["b"])
        self.assertEqual(self.heads(store.get_snapshot("p1")), ["a"])
        self.assertEqual(list((self.root / "projects" / project_store.PENDING_FOLDER).glob("*.json")), [])

    def test_an_update_interrupted_after_it_was_recorded_is_completed_at_next_start(self):
        store, current = self.stored_pair()
        store.finish_transaction = lambda project_id: (_ for _ in ()).throw(SystemExit("stopped"))
        with self.assertRaises(SystemExit):
            store.save({**current, "data": {"households": [household("c")]}}, current["updatedAt"], snapshot={"reason": "Second update"})
        self.assertEqual(self.heads(project_store.ProjectStore(self.root).get("p1")), ["c"])
        restarted = project_store.ProjectStore(self.root)
        self.assertEqual(self.heads(restarted.get_snapshot("p1")), ["b"])
        self.assertEqual(list(self.root.glob("transaction-*.json")), [])

    def fail_project_replacement_once(self, store):
        original = store.replace_file
        state = {"failed": False}
        def replace(source, target):
            if source.name.endswith(".project.json") and not state["failed"]:
                state["failed"] = True
                raise OSError(5, "Input/output error")
            original(source, target)
        store.replace_file = replace

    def test_a_later_save_finishes_an_update_that_failed_after_its_snapshot_was_replaced(self):
        store, current = self.stored_pair()
        self.fail_project_replacement_once(store)
        with self.assertRaises(project_store.ProjectError) as error:
            store.save({**current, "data": {"households": [household("c")]}}, current["updatedAt"], snapshot={"reason": "Second update"})
        self.assertEqual(error.exception.status, 503)
        # The recorded update is finished before anything else touches the project.
        finished = store.get("p1")
        self.assertEqual(self.heads(finished), ["c"])
        with self.assertRaises(project_store.ProjectError):
            store.save({**current, "data": {"households": [household("stale")]}}, current["updatedAt"])
        store.save({**finished, "data": {"households": [household("d")]}}, finished["updatedAt"])
        restarted = project_store.ProjectStore(self.root)
        self.assertEqual(self.heads(restarted.get("p1")), ["d"], "a restart never replays the earlier update")
        self.assertEqual(self.heads(restarted.get_snapshot("p1")), ["b"])

    def test_a_delete_after_a_partly_failed_update_stays_deleted(self):
        store, current = self.stored_pair()
        self.fail_project_replacement_once(store)
        with self.assertRaises(project_store.ProjectError):
            store.save({**current, "data": {"households": [household("c")]}}, current["updatedAt"], snapshot={"reason": "Second update"})
        with self.assertRaises(project_store.ProjectError) as stale:
            store.delete("p1", current["updatedAt"])
        self.assertEqual(stale.exception.status, 409, "the delete was confirmed against the version before the update")
        store.delete("p1", store.get("p1")["updatedAt"])
        restarted = project_store.ProjectStore(self.root)
        self.assertIsNone(restarted.get("p1"))
        self.assertIsNone(restarted.get_snapshot("p1"))
        self.assertEqual(restarted.list(), [])

    def test_a_project_whose_update_cannot_be_finished_is_refused_rather_than_changed(self):
        store, current = self.stored_pair()
        store.replace_file = lambda source, target: (_ for _ in ()).throw(OSError(5, "Input/output error"))
        with self.assertRaises(project_store.ProjectError):
            store.save({**current, "data": {"households": [household("c")]}}, current["updatedAt"], snapshot={"reason": "Second update"})
        for operation in (lambda: store.get("p1"), lambda: store.delete("p1", current["updatedAt"]), lambda: store.save(current, current["updatedAt"])):
            with self.assertRaises(project_store.ProjectError) as error:
                operation()
            self.assertEqual(error.exception.status, 503)

    def test_a_delete_confirmed_before_another_tab_saved_is_refused(self):
        store, loaded = self.stored_pair()
        exported = store.export("p1")
        store.save({**loaded, "name": "Saved in another tab"}, loaded["updatedAt"])
        with self.assertRaises(project_store.ProjectError) as error:
            store.delete("p1", exported["project"]["updatedAt"])
        self.assertEqual(error.exception.status, 409)
        self.assertEqual(store.get("p1")["name"], "Saved in another tab")

    def failing_transaction_beside_a_healthy_project(self):
        store, current = self.stored_pair()
        store.write({**project("healthy"), "data": {"households": [household("h")]}})
        self.fail_project_replacement_once(store)
        with self.assertRaises(project_store.ProjectError):
            store.save({**current, "data": {"households": [household("c")]}}, current["updatedAt"], snapshot={"reason": "Second update"})
        original = project_store.ProjectStore.replace_file
        def failing(store_self, source, target):
            if source.name.startswith("p1."):
                raise OSError(13, "Permission denied")
            original(store_self, source, target)
        return original, failing

    def test_one_unrecoverable_project_does_not_stop_the_server_from_starting(self):
        original, failing = self.failing_transaction_beside_a_healthy_project()
        project_store.ProjectStore.replace_file = failing
        try:
            restarted = project_store.ProjectStore(self.root)
            self.assertEqual(self.heads(restarted.get("healthy")), ["h"])
            with self.assertRaises(project_store.ProjectError) as error:
                restarted.get("p1")
            self.assertEqual(error.exception.status, 503)
            self.assertTrue(list((self.root / "projects" / project_store.PENDING_FOLDER).glob("p1.*")), "its staged files are kept")
        finally:
            project_store.ProjectStore.replace_file = original
        recovered = project_store.ProjectStore(self.root)
        self.assertEqual(self.heads(recovered.get("p1")), ["c"], "a later start finishes the update")

    def test_the_list_marks_a_project_that_is_still_being_recovered(self):
        original, failing = self.failing_transaction_beside_a_healthy_project()
        project_store.ProjectStore.replace_file = failing
        try:
            listed = {item["id"]: item for item in project_store.ProjectStore(self.root).list()}
        finally:
            project_store.ProjectStore.replace_file = original
        self.assertIn("recovered", listed["p1"]["unavailable"])
        self.assertNotIn("householdCount", listed["p1"])
        self.assertNotIn("unavailable", listed["healthy"])

    def test_an_export_reads_the_project_and_its_previous_version_together(self):
        store, _ = self.stored_pair()
        exported = store.export("p1")
        self.assertEqual(self.heads(exported["project"]), ["b"])
        self.assertEqual(self.heads(exported["previousVersion"]), ["a"])
        self.assertIsNone(store.export("missing"))

    def test_the_list_shows_the_date_recorded_in_an_imported_snapshot(self):
        store = project_store.ProjectStore(self.root)
        item = {**project("p1"), "data": {"households": [household("b")]},
                "previousVersion": {"createdAt": "2020-05-01T00:00:00.000Z", "reason": "Earlier", "data": {"households": []}}}
        store.add_all([item])
        self.assertEqual(store.list()[0]["snapshotCreatedAt"], "2020-05-01T00:00:00.000Z")

    def test_files_staged_before_an_update_was_recorded_are_discarded_at_next_start(self):
        store, _ = self.stored_pair()
        staged_project, _ = store.pending_paths("p1")
        project_store.atomic_write_text(staged_project, json.dumps({**project("p1"), "data": {"households": [household("z")]}}))
        restarted = project_store.ProjectStore(self.root)
        self.assertEqual(self.heads(restarted.get("p1")), ["b"])
        self.assertEqual(self.heads(restarted.get_snapshot("p1")), ["a"])
        self.assertFalse(staged_project.exists())

    def test_a_snapshot_older_than_the_record_rules_is_restored_only_from_a_reviewed_repair(self):
        store, current = self.stored_pair()
        legacy = {"createdAt": "2026-01-01T00:00:00.000Z", "reason": "Before permanent ids",
                  "data": {"households": [household("same"), household("same")]}}
        project_store.atomic_write_text(store.snapshot_path("p1"), json.dumps(legacy))
        with self.assertRaises(project_store.ProjectError) as error:
            store.restore_snapshot("p1", current["updatedAt"])
        self.assertIn("share the id", str(error.exception))
        repaired = {"households": [household("one"), household("two")]}
        restored = store.restore_snapshot("p1", current["updatedAt"], repaired)
        self.assertEqual(self.heads(restored), ["one", "two"])
        self.assertEqual(self.heads(store.get_snapshot("p1")), ["b"])

    def test_an_imported_previous_version_becomes_the_snapshot(self):
        store = project_store.ProjectStore(self.root)
        item = {**project("p1"), "data": {"households": [household("b")]},
                "previousVersion": {"createdAt": "2026-01-01T00:00:00.000Z", "reason": "Earlier", "data": {"households": [household("a"), household("a")]}}}
        store.add_all([item])
        self.assertEqual(self.heads(store.get_snapshot("p1")), ["a", "a"], "kept exactly as exported")
        self.assertNotIn("previousVersion", store.get("p1"))
        self.assertIsNotNone(store.list()[0]["snapshotCreatedAt"])

    def test_the_library_list_follows_changes_to_project_files(self):
        store = project_store.ProjectStore(self.root)
        store.write({**project("p1"), "data": {"households": [household("a")]}})
        self.assertEqual(store.list()[0]["householdCount"], 1)
        store.write({**project("p1"), "data": {"households": [household("a"), household("b")]}})
        self.assertEqual(store.list()[0]["householdCount"], 2)
        store.delete("p1", store.get("p1")["updatedAt"])
        self.assertEqual(store.list(), [])

    def test_a_damaged_import_journal_is_set_aside_without_touching_projects(self):
        for label, content in {"not json": "{oops", "a list": "[1, 2]", "ids not a list": '{"ids": "kept"}', "bad id": '{"ids": ["../x"]}'}.items():
            with self.subTest(label):
                store = project_store.ProjectStore(self.root)
                store.write(project("kept"))
                (self.root / project_store.IMPORT_JOURNAL).write_text(content, encoding="utf-8")
                restarted = project_store.ProjectStore(self.root)
                self.assertEqual([item["id"] for item in restarted.list()], ["kept"])
                self.assertFalse((self.root / project_store.IMPORT_JOURNAL).exists())
                self.assertTrue(list(self.root.glob("import-journal.damaged-*.json")))
                for aside in self.root.glob("import-journal.damaged-*.json"):
                    aside.unlink()

    def test_an_import_failing_part_way_removes_what_it_wrote(self):
        store = project_store.ProjectStore(self.root)
        original_write = store.write
        def write_then_fail(item):
            if item["id"] == "new-2":
                raise RuntimeError("unexpected failure")
            original_write(item)
        store.write = write_then_fail
        with self.assertRaises(RuntimeError):
            store.add_all([project("new-1"), project("new-2")])
        self.assertEqual(store.list(), [])
        self.assertFalse((self.root / project_store.IMPORT_JOURNAL).exists())

    def test_a_successful_import_leaves_no_journal(self):
        store = project_store.ProjectStore(self.root)
        store.add_all([project("new-1"), project("new-2")])
        self.assertEqual(len(store.list()), 2)
        self.assertFalse((self.root / project_store.IMPORT_JOURNAL).exists())

    @unittest.skipUnless(os.name == "posix", "file modes apply on macOS and Linux")
    def test_project_files_are_private_to_the_user(self):
        store = project_store.ProjectStore(self.root)
        store.write(project("p1"))
        mode = lambda path: stat.S_IMODE(path.stat().st_mode)
        self.assertEqual(mode(self.root), 0o700)
        self.assertEqual(mode(self.root / "projects"), 0o700)
        self.assertEqual(mode(self.root / "projects" / "p1.json"), 0o600)

    @unittest.skipUnless(os.name == "posix", "file modes apply on macOS and Linux")
    def test_files_from_an_earlier_version_are_made_private_at_start(self):
        (self.root / "projects").mkdir(parents=True)
        old = self.root / "projects" / "old.json"
        old.write_text(json.dumps(project("old")), encoding="utf-8")
        os.chmod(old, 0o644)
        os.chmod(self.root / "projects", 0o755)
        project_store.ProjectStore(self.root)
        self.assertEqual(stat.S_IMODE(old.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE((self.root / "projects").stat().st_mode), 0o700)

    def test_a_project_over_the_size_limit_is_refused(self):
        store = project_store.ProjectStore(self.root)
        original = project_store.MAX_PROJECT_BYTES
        project_store.MAX_PROJECT_BYTES = 200
        try:
            with self.assertRaises(project_store.ProjectError) as error:
                store.save({**project("big"), "sourceText": "x" * 500}, None, create=True)
        finally:
            project_store.MAX_PROJECT_BYTES = original
        self.assertEqual(error.exception.status, 413)
        self.assertEqual(store.list(), [])

    def test_server_code_parses_under_the_oldest_supported_python(self):
        import ast
        for name in ("serve.py", "project_store.py"):
            with self.subTest(name=name):
                ast.parse(Path(__file__).with_name(name).read_text(encoding="utf-8"), feature_version=(3, 7))


if __name__ == "__main__":
    unittest.main()
