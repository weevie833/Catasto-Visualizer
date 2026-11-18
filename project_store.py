"""Saved Catasto projects, one JSON file per project in a per-user folder.

The folder sits outside the app folder, so replacing the app with a new version
never touches it, and clearing browser data cannot delete it either:

  Windows:  %APPDATA%\\Catasto Visualizer\\projects\\
  macOS:    ~/Library/Application Support/Catasto Visualizer/projects/
  Linux:    $XDG_DATA_HOME/Catasto Visualizer/projects/  (or ~/.local/share/...)
"""

from __future__ import annotations

import json
import math
import os
import platform
import re
import sys
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

APP_FOLDER_NAME = "Catasto Visualizer"
# Ids come from crypto.randomUUID() or the app's own fallback; anything else could name a path.
PROJECT_ID = re.compile(r"^[A-Za-z0-9_-]{1,100}$")
# Ids of every project copied from browser storage, so a project deleted later is never copied again.
MIGRATION_FILE = "browser-migration.json"
# Lists the projects an import is writing; if the server stops part-way, they are removed at next start.
IMPORT_JOURNAL = "import-journal.json"
# About 65 times the full Marano source with its parsed data; a larger project is refused. A project's
# snapshot is a separate file with the same limit.
MAX_PROJECT_BYTES = 50 * 1024 * 1024
# Before an update replaces a project's data, the previous data is kept here, one file per project.
SNAPSHOT_FOLDER = "snapshots"
# A save that replaces both a project and its snapshot stages both files here and records a
# transaction file; at startup an interrupted transaction is completed, so neither file is lost.
PENDING_FOLDER = ".pending"
TRANSACTION_PREFIX = "transaction-"
# Held by the running server for as long as it runs, so a second server (a second double-click, or
# one on another port) cannot recover, or write over, the first one's changes.
LOCK_FILE = "server.lock"
# Only the account that runs the app may read or change its projects (no effect on Windows,
# where the folder under %APPDATA% is already private to the user).
PRIVATE_DIR_MODE = 0o700
PRIVATE_FILE_MODE = 0o600


def default_data_dir() -> Path:
    system = platform.system()
    if system == "Darwin":
        base = Path.home() / "Library" / "Application Support"
    elif system == "Windows":
        base = Path(os.environ.get("APPDATA") or (Path.home() / "AppData" / "Roaming"))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or (Path.home() / ".local" / "share"))
    return base / APP_FOLDER_NAME


class ProjectError(Exception):
    """A refused request; status is the HTTP status the server sends back."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


# A stored file that is not readable JSON. It is also a ValueError, so code that already set aside
# unreadable files keeps doing so. The file itself is left as it is.
class DamagedFile(ProjectError, ValueError):
    def __init__(self, path: Path):
        super().__init__(500, f"The saved file {path.name} is damaged and cannot be opened. It was left unchanged in the project folder.")


class DataDirInUse(Exception):
    """Another running server holds the project folder."""


# An exclusive lock on the project folder, held by one server process at a time and released when
# that process stops (including when it is killed). Taken before anything in the folder is recovered.
class DataDirLock:
    def __init__(self, data_dir: Path):
        make_private_dir(Path(data_dir))
        path = Path(data_dir) / LOCK_FILE
        descriptor = os.open(path, os.O_RDWR | os.O_CREAT, PRIVATE_FILE_MODE)
        self.handle = open(descriptor, "r+b")  # noqa: SIM115 - held open for the life of the server
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.handle.close()
            raise DataDirInUse(f"Another Catasto Visualizer is already using {data_dir}.") from None

    def release(self) -> None:
        if self.handle is not None:
            self.handle.close()
            self.handle = None


def reject_constant(name: str) -> None:
    raise ValueError(f"{name} is not a JSON number")


def finite_float(text: str) -> float:
    value = float(text)
    if not math.isfinite(value):
        raise ValueError(f"{text} is too large to be a JSON number")
    return value


# Standard JSON only: NaN and Infinity, written as names or as an overflowing number such as 1e999,
# are accepted by Python but cannot be read by a browser.
def loads(text: str) -> object:
    return json.loads(text, parse_constant=reject_constant, parse_float=finite_float)


def dumps(value: object, **options) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, **options)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_iso(value: object) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


# updatedAt is the token that detects stale saves, so every save must change it, even two saves
# within one millisecond or after the clock was set back.
def next_updated_at(previous: object) -> str:
    # Compared at the precision that is stored: a later reading within the same millisecond would
    # otherwise compare greater and still be written as the same token.
    now = datetime.now(timezone.utc)
    now = now.replace(microsecond=now.microsecond // 1000 * 1000)
    earlier = parse_iso(previous)
    if earlier and now <= earlier:
        now = earlier + timedelta(milliseconds=1)
    return now.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def remove_file(path: Path) -> None:
    # Path.unlink(missing_ok=True) needs Python 3.8; the app supports 3.7.
    try:
        path.unlink()
    except FileNotFoundError:
        pass


# A save is reported only once it is on the disk, so it survives a power loss or system crash, not
# only the app stopping (decision D11). The operating system otherwise keeps recent writes in memory.
# On macOS, fsync leaves them in the drive's cache; F_FULLFSYNC writes them through.
def sync_descriptor(descriptor: int) -> None:
    if sys.platform == "darwin":
        import fcntl
        try:
            fcntl.fcntl(descriptor, fcntl.F_FULLFSYNC)
            return
        except OSError:
            pass  # A file system without F_FULLFSYNC (some network drives); fsync is the best available.
    os.fsync(descriptor)


# Makes a file's creation, rename or removal in this folder permanent. Windows cannot open a folder to
# flush it; there NTFS records the change in its own journal, and file contents are still flushed.
def sync_dir(path: Path) -> None:
    if os.name == "nt":
        return
    descriptor = os.open(path, os.O_RDONLY)
    try:
        sync_descriptor(descriptor)
    finally:
        os.close(descriptor)


def remove_durably(path: Path) -> None:
    remove_file(path)
    if path.parent.is_dir():
        sync_dir(path.parent)


def make_private_dir(path: Path) -> None:
    created = not path.is_dir()
    path.mkdir(mode=PRIVATE_DIR_MODE, parents=True, exist_ok=True)
    os.chmod(path, PRIVATE_DIR_MODE)
    if created:
        sync_dir(path.parent)


def atomic_write_text(path: Path, text: str) -> None:
    # Writes a sibling temp file, puts it on the disk, and swaps it in, so neither a crash nor a power
    # loss leaves a half-written project.
    make_private_dir(path.parent)
    tmp_path = path.with_name(f".{path.name}.tmp-{os.getpid()}-{uuid.uuid4().hex[:8]}")
    try:
        descriptor = os.open(tmp_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, PRIVATE_FILE_MODE)
        with open(descriptor, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            sync_descriptor(handle.fileno())
        tmp_path.replace(path)
        sync_dir(path.parent)
    finally:
        remove_file(tmp_path)


# A browser holds integers exactly only up to 2**53; larger ones are refused rather than converted to
# a float (which fails above about 10**308).
MAX_EXACT_INTEGER = 2 ** 53


def is_number(value: object) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return abs(value) <= MAX_EXACT_INTEGER
    return isinstance(value, float) and math.isfinite(value)


def is_text_or_none(value: object) -> bool:
    return value is None or isinstance(value, str)


# The shape every stored household must have; the browser repairs imports to it (catasto-records.js),
# and the server refuses anything else, whoever sends it.
def household_problem(record: object) -> str | None:
    if not isinstance(record, dict):
        return "is not a record"
    if not isinstance(record.get("id"), str) or not record["id"]:
        return "has no id"
    if not isinstance(record.get("household_head"), str):
        return "has no household head"
    for field in ("source_entry", "members_text"):
        if field in record and not isinstance(record[field], str):
            return f"has a {field.replace('_', ' ')} that is not text"
    pages = record.get("source_pages", [])
    if not isinstance(pages, list) or not all(is_number(page) for page in pages):
        return "has source pages that are not page numbers"
    residence = record.get("residence", {})
    if residence is not None and not isinstance(residence, dict):
        return "has an unreadable residence"
    residence = residence or {}
    if not is_text_or_none(residence.get("place")) or not is_text_or_none(residence.get("description")):
        return "has a residence place or description that is not text"
    neighbors = residence.get("adjacent_to", [])
    if not isinstance(neighbors, list) or not all(isinstance(name, str) for name in neighbors):
        return "has residence neighbors that are not names"
    links = record.get("residence_links", [])
    if not isinstance(links, list) or not all(isinstance(link, dict) for link in links):
        return "has unreadable residence links"
    return None


def validate_data(data: object, name: str = "The project") -> dict:
    if not isinstance(data, dict) or not isinstance(data.get("households"), list):
        raise ProjectError(400, "This file does not contain valid Catasto household data.")
    seen = set()
    for index, record in enumerate(data["households"]):
        problem = household_problem(record)
        if problem:
            raise ProjectError(400, f"{name}: household {index + 1} {problem}.")
        if record["id"] in seen:
            raise ProjectError(400, f"{name}: two households share the id “{record['id']}”.")
        seen.add(record["id"])
    return data


def check_size(value: object, name: str) -> None:
    try:
        text = dumps(value)
    except ValueError:
        raise ProjectError(400, f"“{name}” contains a number that is not a valid JSON number.") from None
    if len(text.encode("utf-8")) > MAX_PROJECT_BYTES:
        raise ProjectError(413, f"“{name}” is larger than 50 MB and cannot be saved.")


def validate_project(project: object) -> dict:
    if not isinstance(project, dict) or not isinstance(project.get("id"), str) or not PROJECT_ID.match(project["id"]):
        raise ProjectError(400, "The project has no valid id.")
    if not isinstance(project.get("name"), str):
        raise ProjectError(400, "The project has no name.")
    validate_data(project.get("data"), f"“{project['name']}”")
    check_size(project, project["name"])
    return project


def project_summary(project: dict, snapshot: dict | None) -> dict:
    data = project.get("data") or {}
    households = data.get("households")
    return {
        "id": project.get("id"),
        "name": project.get("name", ""),
        "sourceFile": project.get("sourceFile", ""),
        "createdAt": project.get("createdAt"),
        "updatedAt": project.get("updatedAt"),
        "householdCount": len(households) if isinstance(households, list) else 0,
        "sourceLanguage": data.get("source_language"),
        "snapshotCreatedAt": (snapshot or {}).get("createdAt"),
    }


class ProjectStore:
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.projects_dir = self.data_dir / "projects"
        # The server answers requests on several threads; every change happens under this lock. It is
        # reentrant so that reading a project can first finish an interrupted update of it.
        self.lock = threading.RLock()
        # Project summaries keyed by file, reused while the file is unchanged, so listing the library
        # does not reread every project.
        self.summary_cache: dict[str, tuple[tuple[int, int], dict]] = {}
        self.snapshot_date_cache: dict[str, tuple[tuple[int, int], str | None]] = {}
        self.make_existing_files_private()
        self.recover_interrupted_import()
        self.recover_interrupted_transactions()

    # Folders and files written by an earlier version may be readable by other accounts.
    # Only the store's own files: the Mac app keeps its copy of the app (App/) and its Python
    # (Runtime/) in the same folder, and those must stay executable.
    def make_existing_files_private(self) -> None:
        if os.name != "posix" or not self.data_dir.is_dir():
            return
        for directory in (self.data_dir, self.projects_dir):
            if directory.is_dir():
                os.chmod(directory, PRIVATE_DIR_MODE)
        own_files = [path for path in self.data_dir.iterdir() if path.is_file()]
        if self.projects_dir.is_dir():
            own_files += [path for path in self.projects_dir.rglob("*") if path.is_file()]
        for path in own_files:
            os.chmod(path, PRIVATE_FILE_MODE)

    # The ids a failed import still has to remove; empty when no import is waiting to be undone.
    def import_ids(self) -> list[str]:
        try:
            record = self.read(self.data_dir / IMPORT_JOURNAL)
        except (OSError, ValueError):
            return []
        ids = record.get("ids") if isinstance(record, dict) else None
        return [item for item in ids if isinstance(item, str)] if isinstance(ids, list) else []

    # Makes renames and removals in the project and snapshot folders permanent.
    def sync_project_dirs(self) -> None:
        for directory in (self.projects_dir, self.projects_dir / SNAPSHOT_FOLDER):
            if directory.is_dir():
                sync_dir(directory)

    # Removes every listed project; True only when all of them are gone (and that is on the disk).
    def undo_import(self, ids: list[str]) -> bool:
        undone = True
        for project_id in ids:
            for path in (self.path_for(project_id), self.snapshot_path(project_id)):
                try:
                    remove_file(path)
                except OSError as error:
                    undone = False
                    print(f"Could not remove {path.name} while undoing an import: {error}")
        if undone:
            self.sync_project_dirs()
        return undone

    # An import whose undo failed keeps its journal; its projects are refused until the undo finishes,
    # so no change is saved to a project the next start would remove.
    def settle_import(self, project_id: str | None = None) -> None:
        with self.lock:
            journal = self.data_dir / IMPORT_JOURNAL
            if not journal.exists():
                return
            ids = self.import_ids()
            if ids and self.undo_import(ids):
                remove_durably(journal)
            elif project_id is not None and project_id in ids:
                raise ProjectError(503, "This project belongs to an import that failed and is still being undone. Try again in a moment; if this remains, restart the app.")

    def recover_interrupted_import(self) -> None:
        journal = self.data_dir / IMPORT_JOURNAL
        try:
            record = self.read(journal)
        except (OSError, ValueError):
            record = "unreadable"
        if record is None:
            return
        ids = record.get("ids") if isinstance(record, dict) else None
        if not isinstance(ids, list) or not all(isinstance(item, str) and PROJECT_ID.match(item) for item in ids):
            # A damaged journal names no trustworthy project; it is set aside and no project is touched.
            aside = journal.with_name(f"import-journal.damaged-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json")
            journal.replace(aside)
            print(f"An import journal could not be read and was moved to {aside.name}; no project was changed.")
            return
        # Each listed project was new when the import began, so removing it restores the library. The
        # journal stays until every one is gone, so a later start tries again.
        if not self.undo_import(ids):
            print("An interrupted import could not be fully undone; its projects are unavailable until it is.")
            return
        remove_durably(journal)
        print("An interrupted import was undone; none of its projects were kept.")

    def pending_paths(self, project_id: str) -> tuple[Path, Path]:
        pending = self.projects_dir / PENDING_FOLDER
        name = self.path_for(project_id).stem
        return pending / f"{name}.project.json", pending / f"{name}.snapshot.json"

    def transaction_path(self, project_id: str) -> Path:
        return self.data_dir / f"{TRANSACTION_PREFIX}{self.path_for(project_id).name}"

    # Writes a project and its snapshot as one change: both are staged, the transaction is recorded,
    # and only then are the real files replaced. A failure before the record leaves both as they were;
    # after it, startup finishes the change.
    def commit_pair(self, project: dict, snapshot: dict) -> None:
        staged_project, staged_snapshot = self.pending_paths(project["id"])
        try:
            atomic_write_text(staged_snapshot, dumps(snapshot))
            atomic_write_text(staged_project, dumps(project))
        except BaseException:
            remove_file(staged_project)
            remove_file(staged_snapshot)
            raise
        atomic_write_text(self.transaction_path(project["id"]), json.dumps({"id": project["id"]}))
        # From here the update is committed: if finishing fails, the next access to the project finishes it.
        try:
            self.finish_transaction(project["id"])
        except OSError as error:
            raise ProjectError(503, "The update was saved but could not be finished. Reload the page; it will be completed then.") from error

    def replace_file(self, source: Path, target: Path) -> None:
        source.replace(target)

    def finish_transaction(self, project_id: str) -> None:
        staged_project, staged_snapshot = self.pending_paths(project_id)
        if staged_snapshot.exists():
            make_private_dir(self.snapshot_path(project_id).parent)
            self.replace_file(staged_snapshot, self.snapshot_path(project_id))
        if staged_project.exists():
            self.replace_file(staged_project, self.path_for(project_id))
        # Both replacements are made permanent before the record that would redo them is removed.
        self.sync_project_dirs()
        remove_durably(self.transaction_path(project_id))

    # Finishes a recorded update of the project before anything else reads or changes it, so a later
    # save or delete can never be overtaken by the earlier update at restart.
    def settle(self, project_id: str) -> None:
        with self.lock:
            self.settle_import(project_id)
            if not self.transaction_path(project_id).exists():
                return
            try:
                self.finish_transaction(project_id)
            except OSError as error:
                raise ProjectError(503, "This project is still being recovered from an interrupted update. Try again in a moment.") from error

    def recover_interrupted_transactions(self) -> None:
        if not self.data_dir.is_dir():
            return
        recorded = set()
        for record in sorted(self.data_dir.glob(f"{TRANSACTION_PREFIX}*.json")):
            project_id = record.stem[len(TRANSACTION_PREFIX):]
            if not PROJECT_ID.match(project_id):
                remove_file(record)
                continue
            recorded.add(project_id)
            # One project that cannot be recovered must not keep the others from being served; its
            # record and staged files stay, and the project is refused until a later attempt succeeds.
            try:
                self.finish_transaction(project_id)
                print(f"An interrupted update of project {project_id} was completed.")
            except OSError as error:
                print(f"Project {project_id} could not be recovered yet and is unavailable: {error}")
        # Files staged without a transaction record belong to a change that never took effect.
        pending = self.projects_dir / PENDING_FOLDER
        if pending.is_dir():
            for path in pending.glob("*.json"):
                if path.name.split(".")[0] not in recorded:
                    remove_file(path)

    def path_for(self, project_id: str) -> Path:
        if not isinstance(project_id, str) or not PROJECT_ID.match(project_id):
            raise ProjectError(400, "The project id is not valid.")
        return self.projects_dir / f"{project_id}.json"

    def snapshot_path(self, project_id: str) -> Path:
        return self.projects_dir / SNAPSHOT_FOLDER / self.path_for(project_id).name

    def read(self, path: Path) -> dict | None:
        try:
            value = loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None
        except (ValueError, UnicodeDecodeError):
            raise DamagedFile(path) from None
        if not isinstance(value, dict):
            raise DamagedFile(path)
        return value

    def write(self, project: dict) -> None:
        atomic_write_text(self.path_for(project["id"]), dumps(project))

    # Names and counts only; a page fetches one project's full data when it opens it. A project or
    # snapshot file is parsed only when it changed since the last listing.
    def list(self) -> list[dict]:
        if not self.projects_dir.is_dir():
            return []
        summaries = []
        seen = set()
        # A project whose interrupted update cannot be finished is listed as unavailable, not as healthy.
        unavailable = {}
        self.settle_import()
        for project_id in self.import_ids():
            if PROJECT_ID.match(project_id):
                unavailable[f"{project_id}.json"] = "This project belongs to an import that failed and is still being undone."
        for record in self.data_dir.glob(f"{TRANSACTION_PREFIX}*.json"):
            project_id = record.stem[len(TRANSACTION_PREFIX):]
            if PROJECT_ID.match(project_id):
                try:
                    self.settle(project_id)
                except ProjectError as error:
                    unavailable[f"{project_id}.json"] = str(error)
        for path in sorted(self.projects_dir.glob("*.json")):
            if path.name in unavailable:
                summaries.append({"id": path.stem, "name": self.cached_name(path.name), "unavailable": unavailable[path.name]})
                continue
            try:
                info = path.stat()
                key = (info.st_mtime_ns, info.st_size)
                cached = self.summary_cache.get(path.name)
                if cached and cached[0] == key:
                    summary = dict(cached[1])
                else:
                    summary = project_summary(self.read(path) or {}, None)
                    self.summary_cache[path.name] = (key, summary)
                    summary = dict(summary)
                seen.add(path.name)
                summary["snapshotCreatedAt"] = self.snapshot_date(path.name)
                summaries.append(summary)
            except (OSError, ValueError, AttributeError, TypeError) as error:
                # One damaged file must not hide the rest of the library.
                print(f"Skipped unreadable project file {path.name}: {error}")
        for name in set(self.summary_cache) - seen:
            del self.summary_cache[name]
        return summaries

    def cached_name(self, file_name: str) -> str:
        cached = self.summary_cache.get(file_name)
        return cached[1].get("name") or file_name if cached else file_name[:-len(".json")]

    # The date recorded in the snapshot, read once per change of the snapshot file.
    def snapshot_date(self, file_name: str) -> str | None:
        path = self.projects_dir / SNAPSHOT_FOLDER / file_name
        try:
            info = path.stat()
        except OSError:
            self.snapshot_date_cache.pop(file_name, None)
            return None
        key = (info.st_mtime_ns, info.st_size)
        cached = self.snapshot_date_cache.get(file_name)
        if cached and cached[0] == key:
            return cached[1]
        try:
            created = (self.read(path) or {}).get("createdAt")
        except (OSError, ValueError, AttributeError):
            created = None
        self.snapshot_date_cache[file_name] = (key, created)
        return created

    def get_snapshot(self, project_id: str) -> dict | None:
        self.settle(project_id)
        return self.read(self.snapshot_path(project_id))

    def get(self, project_id: str) -> dict | None:
        self.settle(project_id)
        return self.read(self.path_for(project_id))

    # The project and its previous version read together, so an export cannot mix two saves.
    def export(self, project_id: str) -> dict | None:
        with self.lock:
            project = self.get(project_id)
            if not project:
                return None
            return {"project": project, "previousVersion": self.get_snapshot(project_id)}

    # Refuses to overwrite a project another tab saved or deleted after this copy was loaded.
    # New projects must be saved with create=True. With a snapshot, the stored data is kept in the
    # project's snapshot file, replacing any earlier one, before the new data is written.
    def save(self, project: object, loaded_updated_at: object, create: bool = False, snapshot: object = None) -> dict:
        project = validate_project(project)
        if snapshot is not None and (not isinstance(snapshot, dict) or not isinstance(snapshot.get("reason"), str)):
            raise ProjectError(400, "The snapshot request is not valid.")
        with self.lock:
            stored = self.get(project["id"])
            if stored and stored.get("updatedAt") != loaded_updated_at:
                raise ProjectError(409, "This project was changed in another tab or window. Reload the page before saving again; your unsaved change was not stored.")
            if not stored and not create:
                raise ProjectError(409, "This project was deleted in another tab or window. Reload the page; your unsaved change was not stored.")
            saved = {**project, "updatedAt": next_updated_at(stored.get("updatedAt") if stored else None)}
            if snapshot is not None and stored:
                self.commit_pair(saved, self.snapshot_record(stored, snapshot["reason"]))
            else:
                self.write(saved)
        return saved

    def snapshot_record(self, stored: dict, reason: str) -> dict:
        record = {"createdAt": now_iso(), "reason": reason, "updatedAt": stored.get("updatedAt"), "data": stored.get("data")}
        check_size(record, f"The snapshot of {stored.get('name', 'this project')}")
        return record

    # Puts the previous version back and keeps the data it replaces as the new snapshot, so a restore
    # can itself be undone. A snapshot saved before the current record rules may not pass them; the
    # browser then sends a repaired copy (`data`) that the user reviewed, and the server checks that.
    def restore_snapshot(self, project_id: str, loaded_updated_at: object, data: object = None) -> dict:
        with self.lock:
            stored = self.get(project_id)
            snapshot = self.get_snapshot(project_id)
            if not stored:
                raise ProjectError(404, "Project not found.")
            if not isinstance(snapshot, dict) or not isinstance(snapshot.get("data"), dict):
                raise ProjectError(404, "This project has no previous version to restore.")
            if stored.get("updatedAt") != loaded_updated_at:
                raise ProjectError(409, "This project was changed in another tab or window. Reload the page and try again.")
            replacement = snapshot["data"] if data is None else data
            restored = {**stored, "data": validate_data(replacement, f"The previous version of “{stored.get('name', '')}”")}
            check_size(restored, stored.get("name", "This project"))
            restored["updatedAt"] = next_updated_at(stored.get("updatedAt"))
            replaced = self.snapshot_record(stored, f"Replaced by restoring the version from {snapshot.get('createdAt')}")
            self.commit_pair(restored, replaced)
        return restored

    # Stores every project or none of them, even if the server stops part-way (see IMPORT_JOURNAL).
    # A project may carry its previous version (`previousVersion`), which becomes its snapshot file.
    def add_all(self, projects: object) -> None:
        if not isinstance(projects, list) or not projects:
            raise ProjectError(400, "No projects were selected for import.")
        previous_versions = {}
        for project in projects:
            previous = project.pop("previousVersion", None) if isinstance(project, dict) else None
            if previous is None:
                continue
            if not isinstance(previous, dict) or not isinstance(previous.get("data"), dict):
                raise ProjectError(400, "A previous version in the import is not readable.")
            # Kept exactly as exported; it is checked only if it is restored (see restore_snapshot).
            record = {"createdAt": previous.get("createdAt") or now_iso(), "reason": str(previous.get("reason") or "Imported previous version"),
                      "updatedAt": previous.get("updatedAt"), "data": previous["data"]}
            check_size(record, f"The previous version of {project.get('name', 'a project')}")
            previous_versions[project.get("id")] = record
        projects = [validate_project(project) for project in projects]
        if len({project["id"] for project in projects}) != len(projects):
            raise ProjectError(409, "The import contains the same project twice.")
        with self.lock:
            # A failed import whose undo is unfinished keeps the only journal; a new import must not
            # replace it, or the earlier import's leftover projects would survive the next start.
            self.settle_import()
            if (self.data_dir / IMPORT_JOURNAL).exists():
                raise ProjectError(503, "An earlier import failed and is still being undone. Try again in a moment; if this remains, restart the app.")
            for project in projects:
                self.settle(project["id"])
            if any(self.path_for(project["id"]).exists() or self.snapshot_path(project["id"]).exists() for project in projects):
                raise ProjectError(409, "A project with the same id is already saved.")
            journal = self.data_dir / IMPORT_JOURNAL
            ids = [project["id"] for project in projects]
            atomic_write_text(journal, json.dumps({"ids": ids}))
            try:
                for project in projects:
                    self.write(project)
                    if project["id"] in previous_versions:
                        record = previous_versions[project["id"]]
                        atomic_write_text(self.snapshot_path(project["id"]), dumps(record))
            except BaseException:
                # The journal is removed only once the undo is complete; otherwise it stays, and the
                # undo is finished on the next access or start (see settle_import).
                if self.undo_import(ids):
                    remove_durably(journal)
                raise
            remove_durably(journal)

    # Refuses to delete a project another tab saved after this copy was loaded, so a newer save is
    # never discarded by a deletion confirmed against an older view.
    def delete(self, project_id: str, loaded_updated_at: object) -> None:
        with self.lock:
            stored = self.get(project_id)
            if stored and stored.get("updatedAt") != loaded_updated_at:
                raise ProjectError(409, "This project was changed in another tab or window after you opened it. Review it and delete it again if you still want to.")
            remove_durably(self.path_for(project_id))
            remove_durably(self.snapshot_path(project_id))

    # Copies projects from a browser's old storage, once each. Projects already saved here, and
    # projects copied before and deleted since, are left alone; invalid records are skipped.
    def migrate(self, projects: object) -> dict:
        if not isinstance(projects, list):
            raise ProjectError(400, "No projects were sent.")
        marker = self.data_dir / MIGRATION_FILE
        added = skipped = 0
        with self.lock:
            seen = set((self.read(marker) or {}).get("migratedIds", []))
            for project in projects:
                try:
                    validate_project(project)
                except ProjectError:
                    skipped += 1
                    continue
                if project["id"] not in seen and not self.path_for(project["id"]).exists():
                    self.write(project)
                    added += 1
                seen.add(project["id"])
            atomic_write_text(marker, json.dumps({"migratedIds": sorted(seen)}, indent=2))
        return {"added": added, "skipped": skipped}
