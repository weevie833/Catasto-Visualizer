# Response to the previous CODEX_REVIEW.md (second round)

Kept for history; the current response is `CLAUDE_RESPONSE.md`.

Reviewed 2026-10-26 against the current working tree, including the uncommitted move of project storage from IndexedDB to per-user files. Each finding was checked against the source before acting. Nothing was committed or pushed. This file replaces the response to the previous review round, which remains in git history.

The audit fixes were made first; the decisions in `HUMAN_DECISIONS.md` were then implemented, which resolved the findings that had needed them. Validation after the audit fixes, before the decisions:

- `node --test *.test.mjs`: 57 passed.
- `python3 -m unittest test_serve.py`: 20 passed (12 before; 8 added).
- `node --check` on every app and vendor script, and `py_compile` on the Python files: passed.
- Browser smoke test against the hardened server on a temporary data folder: `/`, `index.html`, and `admin.html` load with no console errors; the 3D view, project import, and project listing work; every app asset returns 200. With `curl`, a transcription `.md`, `marano-residence-corrections.json`, `README.md`, and `vendor/` returned 404, and a foreign `Host` returned 403.
- Not tested: Windows, and an actual Python 3.7 interpreter (none is installed here; the 3.7 grammar check is described under M6).

## High

### H1. Project files and source documents are accessible to other local users — RESOLVED

Confirmed: the API has no per-user authentication, and project files were created `0644` in a `0755` folder. Serving of source documents is resolved under H2.

- **Decision (D1):** private files only, with no access token. One trusted OS user runs the server.
- **Changed:**
  - Data folders are created `0700` and files are written `0600`; the temp file is opened with that mode, so a project is never readable by others, even briefly.
  - Folders and files written by earlier versions are tightened when the server starts.
  - Windows is unaffected, since `%APPDATA%` is already per-user.
- **Files:** `project_store.py`, `test_serve.py`, `ARCHITECTURE.md`.
- **Validation:** tests check the folder and file modes for new files and for files from an earlier version; a browser save produced a `-rw-------` project file.
- **Remaining:** another account could still call the running server while it is up. That risk was accepted by choosing D1 without a token.

### H2. Static files bypass the API's foreign-Host defense — RESOLVED

Confirmed: only `/api/` checked `Host`, and any non-hidden file in the app folder was served, including the ignored transcription and `.docx` files.

- **Changed:**
  - `send_head` now refuses any request whose `Host` is not `127.0.0.1` or `localhost` at the server's port, for GET and HEAD alike.
  - Only the ten files in `APP_FILES` are served (`/` maps to `index.html`). Everything else returns 404, including directory listings, so the old hidden-file check is no longer needed.
  - The app's own pages were checked for every asset they load; none fetch the JSON or Markdown files in the folder.
  - The app files stay where they are, since an allowlist removes the need to move them into a separate data-free folder.
- **Files:** `serve.py`, `test_serve.py`, `ARCHITECTURE.md`.
- **Validation:**
  - New tests cover a foreign `Host` on static GET and HEAD, plus private files, directories, and test files.
  - The existing type and revalidation tests pass.
  - The browser smoke test and `curl` checks above.

### H3. Startup migration can discard manual research edits — RESOLVED

Confirmed: `rebuildStoredProjectBoundaries` replaced data, the backup was written only once, and `isMaranoDefaultProject` matched by filename.

- **Decision (D2):**
  - Ask before reparsing, with a snapshot, carrying edits over.
  - Keep only the latest snapshot.
  - Label guessed pages "inferred".
  - Remove all project-specific code.
- **Changed:**
  - The Marano filename check and its three load-time migrations are gone. Load now only converts ids (M1) and restores missing member lines.
  - A project whose `parser_version` is older than the parser's shows a notice. Review update lists the planned changes; Update project saves them.
  - How a reparse is built (`CatastoRecords.planReparse`):
    - Records are matched by identical source text, then by head name or alias, and matched records keep their ids.
    - Edited or merged records keep their stored content, including edited records the new parse no longer finds.
    - Page numbers guessed from position are marked `source_pages_inferred` and shown as "(inferred)".
  - The previous data goes into `migrationSnapshot`, replacing any earlier one, including the legacy `entryBoundaryMigrationBackup`.
- **Files:** `app.js`, `catasto-records.js`, `index.html`, `index.css`, `ARCHITECTURE.md`, `INSTALL.md`, `catasto-records.test.mjs`, `index-app.test.mjs`.
- **Validation:**
  - Unit tests cover matching, edit preservation, unmatched edited records, inferred pages, and when a reparse is offered.
  - A Visualizer workflow test covers the notice, preview, snapshot, and kept edits.
  - In the browser, a 196-household project saved by the old parser showed the notice and preview, and updated. Its hand-edited record kept its correction, and a snapshot of all 196 records was saved.

### H4. Two parsing pipelines can produce different research records — RESOLVED

Confirmed. Before the change, on the local transcriptions:

| Transcription | Parser | Households | Blank residences | Resolved links |
|---|---|---|---|---|
| Marano, English | Admin | 362 | 288 | 218 |
| Marano, English | Visualizer | 362 | 20 | 238 |
| 240-entry test, English | Admin | 196 | 172 | 90 |
| 240-entry test, English | Visualizer | 196 | 4 | 100 |
| 240-entry test, Italian | Admin | 197 | 6 | 105 |
| 240-entry test, Italian | Visualizer | 197 | 6 | 106 |

- **Decision (D3):** merge the Visualizer parser's rules into `catasto-parser.js`, and offer a previewed reparse to existing projects.
- **Changed:**
  - The Visualizer's pipeline (residence places, neighbor expansion, normalization, linking, triangulation) now lives in `catasto-parser.js` and is the only `parsePlainText`.
  - The parser's prefix-stripping name cleaner was renamed `cleanPersonName` and still serves the Italian rules and family inference.
  - `app.js` imports the shared rules instead of defining its own.
  - Output carries `parser_version: 6`, which drives the H3 offer.
- **Files:** `catasto-parser.js`, `app.js`, `catasto-parser.test.mjs`.
- **Validation:**
  - On all three transcriptions, the merged parser's output matches the old Visualizer parser's household for household (0 of 362, 196, and 197 households differ).
  - New tests check residence-place reading and that `app.js` defines no parser of its own.

## Medium

### M1. Record identifiers are regenerated from mutable names and order — RESOLVED

Confirmed.

- **Decision (D4):** permanent ids; version-1 exports still import and are converted, with a report.
- **Changed:**
  - `CatastoRecords.convertToPermanentIds` gives every household a random `h-…` id, keeps the old one in `legacy_id`, and rewrites the references to it together:
    - residence links and candidates
    - member identity ids
    - "keep separate" decisions
    - the record copies in merge history, so undo still finds its record
  - References to an id shared by several records are dropped and listed in `data.record_id_migration`.
  - Stored projects are converted once at load; imports are converted in `createProject`.
  - `recalculateStoredIdentityGraph` no longer regenerates ids.
  - Exports are version 2, and a backup from a newer version is refused.
- **Files:** `catasto-records.js`, `catasto-storage.js`, `app.js`, plus the storage, records, and Visualizer tests.
- **Validation:** tests cover v1 import conversion (links, decisions, dropped-reference report), shared old ids, conversion running only once, startup conversion of a stored project with a single save, and refusal of newer backups.

### M2. Import validation accepts malformed records and unbounded nested data — RESOLVED

Confirmed.

- **Decision (D5):** repair with a report shown before saving; 50 MB per project.
- **Changed:**
  - `CatastoRecords.repairProjectData`:
    - fills in missing optional fields;
    - converts or removes values of the wrong type (pages, residence, neighbors, links);
    - takes a missing head from the first source line;
    - removes records with neither a head nor source text.
  - Each change is reported, and Admin shows the list and asks before saving; Cancel saves nothing.
  - The server refuses a project over 50 MB, while an import request may still carry several projects, up to 200 MB.
- **Not changed:** the list endpoint still returns full projects. The Visualizer needs full data at startup to convert ids, so a metadata-only list was not adopted.
- **Files:** `catasto-records.js`, `catasto-storage.js`, `admin.js`, `project_store.py`, plus tests.
- **Validation:** tests cover each repair case and the change report, the size refusal (413), and Admin import with a repaired fixture.

### M3. A save token can repeat within one millisecond — RESOLVED

Confirmed: `updatedAt` came from the clock at millisecond precision, so two saves in the same millisecond, or after the clock was set back, could reuse a token.

- **Changed:** `next_updated_at` always returns a time later than the stored token, adding 1 ms when needed.
  - It needs no new field and no change to the file format, so existing project files and exports still work.
  - A legacy token that can't be parsed falls back to the current time.
- **Files:** `project_store.py`, `test_serve.py`.
- **Validation:** a new test freezes the clock, saves twice, and confirms the second copy of the old version is refused with 409 and the first save is kept.

### M4. Request framing and unbounded server threads allow resource exhaustion — RESOLVED

Confirmed: a negative `Content-Length` reached `read(-1)`, and there was no socket timeout or thread bound.

- **Changed:**
  - A negative length now returns 400.
  - The handler has a 30-second socket timeout.
  - `CatastoServer` caps concurrent requests at 32 with a semaphore; further connections wait instead of spawning threads.
  - The 200 MiB body limit is kept on purpose. The real Marano source is 0.76 MB, but one import request can carry a multi-project backup. The server listens only on loopback, so lowering the limit would chiefly risk refusing legitimate large backups. Choosing a lower ceiling is left open.
- **Files:** `serve.py`, `test_serve.py`, `ARCHITECTURE.md`.
- **Validation:** a raw-socket test sends `Content-Length: -1` and gets an immediate 400; a test checks the handler timeout.

### M5. Import is not crash-atomic across multiple projects — RESOLVED

Confirmed: `add_all` rolled back only on `OSError`, and not at all after a crash.

- **Changed:**
  - Before writing, `add_all` records the incoming ids in `import-journal.json`. It removes the journal only after every file is written.
  - Any exception, not just `OSError`, deletes the files written so far.
  - At startup, `ProjectStore` finds a leftover journal and deletes the listed projects. This is safe because an import is refused unless every one of its ids is new.
  - The UI's "all or none" message is now accurate, so the UI is unchanged.
- **Files:** `project_store.py`, `test_serve.py`, `ARCHITECTURE.md`.
- **Validation:** tests cover crash recovery at restart, a non-`OSError` failure part-way, and a clean import leaving no journal.

### M6. Documented Python support does not match the code — RESOLVED

The cause Codex gives is incorrect, but a real 3.7 problem existed.

- **Cause given:** both files start with `from __future__ import annotations`, so `Path | None` and `dict | None` are never evaluated and parse fine on 3.7.
- **Real problem:** `Path.unlink(missing_ok=True)` requires Python 3.8 and would fail at runtime on 3.7.
- **Changed:**
  - A `remove_file` helper replaces every `missing_ok` call.
  - The Mac launcher's message now says "Python 3.7 or later is not installed" instead of "Python 3 is not installed" when an older Python is found.
  - The documented minimum stays 3.7.
- **Files:** `project_store.py`, `Start Catasto Visualizer (Mac).command`, `test_serve.py`.
- **Validation:** a new test parses `serve.py` and `project_store.py` with `ast.parse(..., feature_version=(3, 7))`. No 3.7 interpreter was available here for a runtime test.

## Low

### L1. Dead upload and review workflow remains in the visualizer — RESOLVED

Confirmed: `openUploadModal` was never called.

- **Decision (D6):** remove it.
- **Changed:** removed the upload modal, the review panel, the LLM-prompt generator, their translations, styles, and listeners, and the helpers used only by them (`qualityProblemForRecord`, `residenceSentence`, `likelyPlaceFromResidence`, and others).
- **Files:** `index.html`, `app.js`, `index.css`.
- **Validation:** tests pass, eslint reports no unused code, and the browser smoke test is clean.

### L2. Browser security policy is not explicitly constrained — RESOLVED

- **Decision:** move scripts to files and send a strict CSP.
- **Changed:**
  - The inline script, the 3D bootstrap module, and both pages' `<style>` blocks moved to `app.js`, `scene3d-boot.js`, `index.css`, and `admin.css`.
  - The import map was replaced by relative imports in `scene3d.js` and `vendor/OrbitControls.js` (a one-line vendor change, documented).
  - Every response carries `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, plus `nosniff`.
  - `index-app.test.mjs` now loads `app.js`.
- **Files:** `serve.py`, `index.html`, `admin.html`, the new CSS/JS files, `scene3d.js`, `vendor/OrbitControls.js`, and tests.
- **Validation:**
  - A test checks the header and that it contains no `unsafe-inline`.
  - In the browser, the Visualizer (with 3D), source editing and saving, the reparse flow, and Admin all ran with no CSP violations or console errors.
- **Not tested:** Admin's Export JSON download was not clicked in the browser.

## Informational

### I1. Test and static-analysis coverage is uneven — RESOLVED

- **Decision:** ruff and eslint.
- **Changed:**
  - Added `ruff.toml`, `requirements-dev.txt` (ruff 0.17.2), `package.json` (eslint 10.13.0), and `eslint.config.mjs`. Development tools install into a local `.venv` and `node_modules`, both git-ignored.
  - Fixed what they found:
    - two unused parameters in `scene3d.js`
    - an unused variable in `app.js`
    - `raise … from None` in `serve.py`
    - dict literals in `test_serve.py`
  - Regression tests were added for every finding above.
- **Validation:** `npx eslint .` and `.venv/bin/ruff check .` are clean.
- **Note:** eslint 10 warns that Node 23 is not in its supported engine list, but it runs correctly here.

### I2. No embedded credentials found — RESOLVED

Verified: no credentials appear in the app, server, or launchers. The only runtime fetches are `catasto-storage.js` calls to the local `/api/`. No change was needed. Add a secret scan if external services are ever introduced.

## Validation after implementing the decisions

- `node --test *.test.mjs`: 68 passed.
- `python3 -m unittest test_serve.py`: 23 passed.
- `npx eslint .` and `.venv/bin/ruff check .`: clean.
- Browser checks on a temporary data folder are described under H3 and L2.
- Not tested: Windows, a real Python 3.7 interpreter, and Admin's import-repair prompt in a browser (covered by tests only).

## Files changed in this round

- Server: `serve.py`, `project_store.py`, `test_serve.py`
- Visualizer page and code: `index.html`, `index.css`, `app.js`, `scene3d-boot.js`, `scene3d.js`, `vendor/OrbitControls.js`
- Admin: `admin.html`, `admin.css`, `admin.js`
- Parser, records, and storage: `catasto-parser.js`, `catasto-records.js`, `catasto-storage.js`
- Tests: `catasto-parser.test.mjs`, `catasto-records.test.mjs`, `catasto-storage.test.mjs`, `admin.test.mjs`, `index-app.test.mjs`
- Lint configuration: `eslint.config.mjs`, `package.json`, `package-lock.json`, `ruff.toml`, `requirements-dev.txt`, `.gitignore`
- Launcher: `Start Catasto Visualizer (Mac).command`
- Docs: `README.md`, `INSTALL.md`, `ARCHITECTURE.md`, `HANDOFF.md`, `HUMAN_DECISIONS.md`, `CLAUDE_RESPONSE.md`

STATUS: READY_FOR_REVIEW
