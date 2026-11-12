# Response to CODEX_REVIEW.md (sixth round)

Reviewed 2026-10-26 against the current working tree. Each finding was checked in the source before acting. No new human decisions were needed. Nothing was committed or pushed. Earlier responses are kept as `CLAUDE_RESPONSE_2.md` through `CLAUDE_RESPONSE_5.md`.

## Validation

- `node --test *.test.mjs`: 79 passed (77 before; 2 added).
- `python3 -m unittest test_serve.py`: 41 passed (38 before; 3 added, and the existing delete tests now include the stale case).
- `npx eslint .` and `.venv/bin/ruff check .`: clean.
- **Not tested:** Windows; a real Python 3.7; the Admin delete confirmation in a browser (covered by the HTTP and Admin tests).

## HIGH

### H1. Delete can discard a newer save from another tab without a conflict warning — RESOLVED

Confirmed: `DELETE` carried only the id.

- **Changed:**
  - `CatastoStorage.deleteProject(project)` sends the loaded `updatedAt`.
  - `ProjectStore.delete` first settles any pending update. It refuses with 409 if the stored project was saved since that copy was loaded, and only then removes the project and its snapshot.
  - Admin shows the refusal, refreshes the list, and announces nothing, so the user reviews the project and confirms again.
- **Files:** `project_store.py`, `serve.py`, `catasto-storage.js`, `admin.js`, `test_serve.py`, `admin.test.mjs`, `ARCHITECTURE.md`.
- **Validation:**
  - **HTTP test:** a delete with the pre-save version returns 409, and one with the current version succeeds.
  - **Store test:** a project is exported, another tab saves it, and a delete using the exported version is refused, keeping the newer save.
  - **After a partly failed update:** a delete confirmed against the version before the update is refused.
  - **Admin test:** a refused delete leaves the project, shows the message, and announces no deletion.

## MEDIUM

### M1. An unrecoverable transaction for one project prevents the whole server from starting — RESOLVED

Confirmed. Startup also deleted every staged file, including those of a project whose update was still recorded.

- **Changed:**
  - `recover_interrupted_transactions` handles each project separately. If one project's update cannot be finished, its record and staged files are kept, the problem is printed, and startup continues. That project is refused with 503 until a later attempt succeeds.
  - At startup, only staged files without a transaction record are discarded.
- **Files:** `project_store.py`, `test_serve.py`.
- **Validation:**
  - With one project whose replacement keeps failing and one healthy project, the server starts and serves the healthy one.
  - The failing project returns 503, and its staged files remain.
  - A later start, once replacement works, finishes its update.

### M2. Project listing presents an unsettled project as available — RESOLVED

Confirmed.

- **Changed:**
  - A project whose pending update cannot be settled is listed as `{id, name, unavailable: reason}`, without counts or a snapshot date, so an inconsistent pair is never summarized.
  - Admin shows it with the reason and no actions.
  - The Visualizer lists it as "(being recovered)", disabled, and opens the first available project instead. If every project is unavailable, it says so instead of waiting.
- **Files:** `project_store.py`, `admin.js`, `app.js`, `test_serve.py`, `index-app.test.mjs`.
- **Validation:**
  - A server test lists one failing and one healthy project: the failing one is marked unavailable without counts, and the healthy one is normal.
  - A Visualizer test confirms the recovering project is disabled and labeled, and the healthy one is opened.

## INFORMATIONAL

### I1. Recovery and deletion tests miss the above failure paths — RESOLVED

- **Changed:** added tests for:
  - a stale delete after an independent save, including export followed by a save
  - startup with a persistently failing transaction beside a healthy project
  - listing while settlement fails
  - Admin's handling of a refused delete
  - the Visualizer's handling of an unavailable project
- **Validation:** the counts above.

## Files changed in this round

- Server: `project_store.py`, `serve.py`, `test_serve.py`
- Browser: `catasto-storage.js`, `admin.js`, `app.js`
- Tests: `admin.test.mjs`, `index-app.test.mjs`
- Docs: `ARCHITECTURE.md`, `HANDOFF.md`, `CLAUDE_RESPONSE.md`, `CLAUDE_RESPONSE_5.md` (the previous response, kept for history)

STATUS: READY_FOR_REVIEW
