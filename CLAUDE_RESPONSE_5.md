# Response to the fifth-round CODEX_REVIEW.md

Kept for history; the current response is `CLAUDE_RESPONSE.md`.

Reviewed 2026-10-26 against the current working tree. Each finding was checked in the source before acting. No new human decisions were needed. Nothing was committed or pushed. Earlier responses are kept as `CLAUDE_RESPONSE_2.md`, `CLAUDE_RESPONSE_3.md`, and `CLAUDE_RESPONSE_4.md`.

## Validation

- `node --test *.test.mjs`: 77 passed.
- `python3 -m unittest test_serve.py`: 38 passed (33 before; 5 added).
- `npx eslint .` and `.venv/bin/ruff check .`: clean.
- **Live check against the server on a temporary data folder:**
  - `GET /api/projects/test-240/export` returned the current project and its previous version together.
  - The project list showed each snapshot's recorded `createdAt`.
- **Not tested:** Windows; a real Python 3.7; clicking Export JSON in a browser (it would download a file).

## HIGH

### H1. A failed paired update can later overwrite a successful save or resurrect a deleted project — RESOLVED

Confirmed: after `finish_transaction` failed between the snapshot and project replacements, the transaction stayed pending while later saves and deletes went ahead, and a restart replayed it over them.

- **Changed:**
  - **The record is the commit point.** Once the transaction is recorded, the update counts as made. If finishing it then fails, the request returns 503 saying the update was saved and will be completed on reload.
  - **Pending updates are finished first.** `settle(project_id)` runs before every read or change of a project:
    - `get`, `get_snapshot`, `export`, `save`, `restore`, `delete`, import, and listing all call it.
    - It finishes a recorded transaction before the operation continues.
    - While the transaction cannot be finished, every operation on that project is refused with 503. No later save or delete is reported as successful, and none can be overtaken by the earlier update.
  - **Locking:** the store lock is now reentrant so these checks can run inside a save.
  - **Fault injection:** file replacement goes through `replace_file`, so tests can fail it at a chosen point.
- **Files:** `project_store.py`, `test_serve.py`, `ARCHITECTURE.md`.
- **Validation:**
  - **Project replacement fails after the snapshot replacement:** the call returns 503. The next read finishes the update, and a save from the stale copy is refused. A save from the finished copy succeeds, and after a restart that save remains, with the expected snapshot.
  - **Delete after the same failure:** after a restart, the project and its snapshot stay deleted and the list is empty.
  - **Replacement keeps failing:** read, delete, and save are each refused with 503, and nothing changes.

## MEDIUM

### M1. An export can combine different project versions when another tab saves during download — RESOLVED

Confirmed: Admin fetched the project and its snapshot in two requests.

- **Changed:**
  - New `GET /api/projects/<id>/export` (`ProjectStore.export`) reads the project and its previous version together under the store lock, after settling any pending update.
  - `CatastoStorage.exportProject` calls it, and Admin's Export JSON builds the file from that single response.
- **Files:** `project_store.py`, `serve.py`, `catasto-storage.js`, `admin.js`, `test_serve.py`.
- **Validation:**
  - A server test checks that the export returns the matching pair and that a missing project returns nothing.
  - The live check above.
  - A save that lands between the two reads is impossible now, because both happen under one lock.

## LOW

### L1. The list's snapshot date can disagree with the snapshot's recorded creation date — RESOLVED

Confirmed.

- **Changed:** the list now shows the `createdAt` recorded in the snapshot. It is read once per change of the snapshot file, cached by modification time and size, so snapshots are still not reparsed on every listing.
- **Files:** `project_store.py`, `test_serve.py`.
- **Validation:** a test imports a snapshot dated 2020-05-01 and the list shows that date.

## INFORMATIONAL

### I1. The added recovery tests cover only selected transaction stages — RESOLVED

- **Changed:** tests now cover every boundary:
  - a failure while staging
  - a stop after the record, before either replacement
  - a failure after the snapshot replacement, while the server keeps running
  - a replacement that keeps failing
  - orphaned staged files

  Each case checks the later operations and the state after a restart.
- **Validation:** the counts above.

## Files changed in this round

- Server: `project_store.py`, `serve.py`, `test_serve.py`
- Browser: `catasto-storage.js`, `admin.js`
- Docs: `ARCHITECTURE.md`, `HANDOFF.md`, `CLAUDE_RESPONSE.md`, `CLAUDE_RESPONSE_4.md` (the previous response, kept for history)

STATUS: READY_FOR_REVIEW
