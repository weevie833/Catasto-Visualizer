# Response to the fourth-round CODEX_REVIEW.md

Kept for history; the current response is `CLAUDE_RESPONSE.md`.

Reviewed 2026-10-26 against the current working tree. Each finding was reproduced or checked in the source before acting. Nothing was committed or pushed. Earlier responses are kept as `CLAUDE_RESPONSE_2.md` and `CLAUDE_RESPONSE_3.md`. D8 and D9 were decided by the user and are recorded in `HUMAN_DECISIONS.md`.

## Validation

- `node --test *.test.mjs`: 77 passed (75 before; 2 added).
- `python3 -m unittest test_serve.py`: 33 passed (27 before; 6 added).
- `npx eslint .` and `.venv/bin/ruff check .`: clean.
- **Browser check** on a temporary data folder, using a planted snapshot whose records share an id:
  - Admin showed Restore previous version and Download previous version.
  - The restore confirmation listed both repairs.
  - The repaired copy (3 records, 3 unique ids) became current, and the replaced 196-record data became the new snapshot.
  - No console errors.
- **Not tested:** Windows; a real Python 3.7; the Export JSON and Download previous version downloads in a browser. Downloads were not clicked; the export contents are covered by tests.

## HIGH

### H1. A failed save or restore can destroy the only earlier snapshot — RESOLVED

Confirmed: the snapshot was replaced before the project was written.

- **Changed:** updates and restores now go through `ProjectStore.commit_pair`.
  - Both files are staged in `projects/.pending/`, then `transaction-<id>.json` is recorded, and only then are the real files replaced.
  - A failure while staging leaves both files untouched and removes the staged files.
  - At startup, a recorded transaction is completed, and staged files without a record are discarded.
- **Files:** `project_store.py`, `test_serve.py`, `ARCHITECTURE.md`.
- **Validation:** fault-injection tests cover three stages:
  - Disk full while staging the project: both the project and the snapshot are unchanged, and nothing is left staged.
  - Stopped after the transaction was recorded: the next start completes the update and the snapshot.
  - Files staged without a record: both are discarded and nothing changes.

### H2. A legacy conversion snapshot can be impossible to restore — RESOLVED

Confirmed: restoring a snapshot whose records share an id returned 400.

- **Decision (D8):** download the exact snapshot, and restore only through a reviewed repair.
- **Changed:**
  - **Restore:** Admin's Restore previous version repairs a copy of the snapshot with `CatastoRecords.repairProjectData` and lists every repair in the confirmation. The confirmation suggests downloading the exact version first. It then sends the repaired copy.
  - **Server:** `restore_snapshot` takes the copy, validates it, and refuses invalid data. It never writes invalid data into the active project. Without a copy it validates the stored snapshot as before.
  - **Download previous version:** saves the snapshot exactly as stored, wrapped as a project file that Admin can import. Admin's normal import repair runs at that point.
- **Files:** `admin.js`, `catasto-storage.js`, `project_store.py`, `serve.py`, `admin.test.mjs`, `test_serve.py`, `INSTALL.md`, `ARCHITECTURE.md`.
- **Validation:**
  - A server test checks that the shared-id snapshot is refused as stored and restored from a repaired copy, and that the replaced data becomes the snapshot.
  - An Admin test checks that the repairs appear in the confirmation and that the repaired data has unique ids.
  - The browser check above.

## MEDIUM

### M1. The delete prompt implies an export can back up the previous version, but exports omit it — RESOLVED

Confirmed.

- **Decision (D9):** exports include the previous version.
- **Changed:**
  - **Export:** `serializeProject(project, previousVersion)` adds `project.previousVersion` (created date, reason, data, exactly as stored), and Admin's Export JSON fetches it.
  - **Import:** an imported `previousVersion` becomes the new project's snapshot file, unrepaired, inside the same all-or-nothing import; an interrupted import removes it too. Older exports without it import as before.
  - **Delete prompt:** now says the export includes the previous version.
- **Files:** `catasto-storage.js`, `admin.js`, `project_store.py`, `admin.test.mjs`, `test_serve.py`, `INSTALL.md`, `ARCHITECTURE.md`.
- **Validation:** an Admin test round-trips an export with a previous version through import; a server test checks that an imported previous version becomes the snapshot exactly and is not stored inside the project.

## LOW

### L1. Project listing still parses every full project and snapshot — RESOLVED

Confirmed.

- **Changed:**
  - The store keeps each project's summary keyed by its file's modification time and size, and parses a project only when it changed since the last listing.
  - The snapshot date now comes from the snapshot file's modification time, so snapshots are never parsed to list the library.
  - The first listing after a start still reads each project once. A persisted index was not added; it would need its own recovery, and this cache rebuilds itself from the files.
- **Files:** `project_store.py`, `test_serve.py`.
- **Validation:** a test checks that the list follows a rewritten project file and a deletion; the snapshot date appears in the listing tests.

## INFORMATIONAL

### I1. Recovery failure paths lack tests — RESOLVED

- **Changed:** added the fault-injection tests (H1), the legacy-snapshot restore tests (H2, server and Admin), the export round-trip and imported-snapshot tests (M1), and the list-cache test (L1).
- **Validation:** the counts above.

## Files changed in this round

- Server: `project_store.py`, `serve.py`, `test_serve.py`
- Browser: `catasto-storage.js`, `admin.js`
- Tests: `admin.test.mjs`
- Docs: `ARCHITECTURE.md`, `INSTALL.md`, `HANDOFF.md`, `HUMAN_DECISIONS.md`, `CLAUDE_RESPONSE.md`, `CLAUDE_RESPONSE_3.md` (the previous response, kept for history)

STATUS: READY_FOR_REVIEW
