# Response to the third-round CODEX_REVIEW.md

Kept for history; the current response is `CLAUDE_RESPONSE.md`.

Reviewed 2026-10-26 against the current working tree. Each finding was reproduced or checked in the source before acting. Nothing was committed or pushed. The previous response is kept as `CLAUDE_RESPONSE_2.md`. D7 was decided by the user (separate snapshot file) and is recorded in `HUMAN_DECISIONS.md`.

## Validation

- `node --test *.test.mjs`: 75 passed (68 before; 7 added).
- `python3 -m unittest test_serve.py`: 27 passed (23 before; 4 added).
- `npx eslint .` and `.venv/bin/ruff check .`: clean.
- Browser check on a temporary data folder, using a 196-household project saved by the old Admin parser:
  - **Opening:** the project was converted to permanent ids without loss and the update notice appeared.
  - **Preview:** listed the counts (24 → 192 households with a residence; 4 saved residences kept where the new parse differs; 3 records with neighbor changes) and a per-record change list.
  - **Applying:** wrote the new project and a separate `snapshots/old-admin-240.json` snapshot with mode `0600`, holding the old 196 records.
  - **Restore in Admin:** brought back the old data. No console errors.
- **Not tested:** Windows; a real Python 3.7; the Restore confirmation dialog itself (it was accepted by script during the browser check).

## HIGH

### H1. Updating a project can resurrect a household the user merged — RESOLVED

Confirmed: a merged record claimed one new entry by head name, and its other entry came back as a new household.

- **Changed:** `planReparse` first lets each merged record claim every new entry whose text equals one of its `source_entries`. The record is kept once, and each claimed entry's parse id is redirected to it.
  - A merged entry found only by its head's name is an uncertain match. The preview names the record, and Update project stays disabled until the merge is undone or the entry corrected.
  - The preview now also lists changes by record: new, removed, residence place, and neighbors added or removed.
- **Files:** `catasto-records.js`, `app.js`, `index.html`, `index.css`.
- **Validation:**
  - A merged record holding both entries yields one household and nothing added.
  - A reworded merged entry is reported as uncertain.
  - The browser preview showed the change list.

### H2. Reparse and source edits can erase manually curated residence neighbors — RESOLVED

Confirmed on both counts: `recalculateStoredIdentityGraph` reread every record's residence from its source text, which drops a merged record's combined neighbors and curated lists, and an unmarked older correction was replaced by the new parse.

- **Changed:**
  - **Link recalculation:** it now only rebuilds links from each record's stored neighbors and never rereads source text. Editing one household no longer changes others. A reparse still takes new neighbors for unedited records from the fresh parse, and the preview lists them.
  - **Unmarked corrections:** an unedited record keeps its stored residence place where the new parse reads it differently, because earlier versions applied residence corrections without marking them. The preview counts these.
  - **Marking edits:** the source editor now also sets `residence_edited_at` when the typed place differs from the parsed one, and `hasUserEdits` checks it.
- **Files:** `app.js`, `catasto-records.js`.
- **Validation:**
  - Saving one household leaves another's curated neighbors untouched.
  - A merged record keeps its combined neighbors through a reparse.
  - A stored place is kept and counted, and place and neighbor changes appear in the change list.
  - The workflow test was updated to expect the kept place.

### H3. Automatic legacy-ID conversion can silently remove research links — RESOLVED

Confirmed: conversion ran and saved at startup even when it dropped references.

- **Changed:**
  - Conversion is planned on a copy (`planPermanentIds`) when a project is opened.
  - **Lossless conversion:** saved at once.
  - **Conversion that would drop references:** nothing is saved. The notice explains it, the review lists every reference that would be removed, and Update project saves the conversion with the previous data as the snapshot.
  - Conversion no longer runs for every project at startup (see M4).
  - The misleading comment was replaced.
- **Files:** `catasto-records.js`, `app.js`.
- **Validation:** a test opens a project whose conversion would drop a link. Nothing is saved before review, the review lists the dropped reference, and applying stores the converted data and a snapshot with the old ids.

## MEDIUM

### M1. Duplicate permanent IDs in version-2 imports are accepted — RESOLVED

Confirmed.

- **Changed:**
  - `repairProjectData` gives every owner of a shared id a new id and drops the links, candidates, and "keep separate" decisions that named it. Each change is reported in Admin's import prompt.
  - The server now refuses duplicate ids on every write (see M2).
- **Files:** `catasto-records.js`, `project_store.py`.
- **Validation:** a records test checks three unique ids, the link and decision removed, and four reported changes; a server test checks the refusal.

### M2. Direct API writes bypass the browser's record repair — RESOLVED

Confirmed: `households: [{}]` was accepted.

- **Changed:**
  - **Server checks:** `project_store.validate_data` checks every household on save, import, and browser migration. Each must be an object with a non-empty, unique `id` and a text `household_head`, and optional fields must have the types the app reads. Violations are refused with the household's position.
  - **Old browser projects:** the browser now repairs them before copying them to the server. One that cannot be repaired stays in the browser.
  - **Stored projects not opened since this version:** they are not rewritten. Missing optional fields are allowed, so data already saved by this build still passes.
- **Files:** `project_store.py`, `catasto-storage.js`, `test_serve.py`, `catasto-storage.test.mjs`.
- **Validation:**
  - A server test covers an empty record, no head, non-name neighbors, non-number pages, and duplicate ids. Each is refused by PUT and import and skipped by migration.
  - The migration test checks the repaired payload.

### M3. The snapshot requirement conflicts with the 50 MB project limit — RESOLVED

- **Decision (D7):** a separate private file.
- **Changed:**
  - **Server:** `PUT` takes an optional `snapshot` reason. Under the save lock, the stored data is written to `projects/snapshots/<id>.json`, which has its own 50 MB limit, before the new data.
  - **New endpoints:** `GET /api/projects/<id>/snapshot` and `POST /api/projects/<id>/restore`. Restore checks the loaded version, puts the snapshot back, and keeps the replaced data as the new snapshot, so a restore can be undone.
  - **Delete:** deleting a project deletes its snapshot.
  - **Visualizer:** it no longer embeds `migrationSnapshot`, and it removes the old in-project `entryBoundaryMigrationBackup` on update. The preview estimates the updated project's size and blocks the update above 50 MB.
  - **Admin:** shows Restore previous version when a snapshot exists.
- **Files:** `project_store.py`, `serve.py`, `catasto-storage.js`, `app.js`, `admin.js`, `test_serve.py`, `index-app.test.mjs`, `INSTALL.md`, `ARCHITECTURE.md`.
- **Validation:**
  - A server test covers the snapshot written on update and its separate size, the snapshot date in the list, a stale restore refused, a restore swapping the versions, and the snapshot removed with the project.
  - A Visualizer test checks the snapshot request and that no snapshot sits in the project.
  - The browser check above.

### M4. Listing projects loads every full project and source transcription — RESOLVED

Confirmed.

- **Changed:**
  - `GET /api/projects` returns summaries: id, name, source file, timestamps, household count, language, and snapshot date.
  - The Visualizer prepares (converts and backfills) only the project it opens.
  - Admin renders from the summaries and fetches a full project only to export, restore, or delete it.
  - The server still reads each file to build its summary, but sends and keeps only the summary.
- **Files:** `project_store.py`, `app.js`, `admin.js`, `admin.test.mjs`.
- **Validation:** a server test confirms the list has counts but no `data` or `sourceText`; the Admin and Visualizer tests pass with summary lists.

### M5. A malformed import journal can prevent the server from starting — RESOLVED

Confirmed: a list-shaped or unreadable journal raised during server construction.

- **Changed:** the journal is read inside a guard and its shape checked. A damaged journal (bad JSON, wrong type, `ids` not a list, or an id that is not a valid project id) is renamed `import-journal.damaged-<time>.json`. No project is touched, a message is printed, and the server starts.
- **Files:** `project_store.py`, `test_serve.py`.
- **Validation:** a test covers each of the four damaged forms; the existing project remains and the journal is set aside.

## LOW

### L1. The server's no-token trust assumption remains operationally important — RESOLVED

This is an accepted constraint under D1, not a defect, so no code changed.

- **Changed:** `INSTALL.md` now tells users to run the app only on a computer whose other accounts they trust, and explains why. `HUMAN_DECISIONS.md` (Codex's text) already notes that D1 must be revisited before any shared-computer deployment.
- **Files:** `INSTALL.md`.

## INFORMATIONAL

### I1. Tests and analysis cover most changed paths, with focused gaps — RESOLVED

- **Changed:**
  - Regression tests now cover each gap Codex listed:
    - merged-record reparse overlap
    - curated adjacency through recalculation and editing
    - duplicate version-2 ids
    - a reviewed conversion with dropped references
    - malformed journals
    - server-side schema refusal
    - snapshots and restore
  - `HANDOFF.md` documents how to check and update the vendored Three.js r170, including the one-line import change and the advisory check that `npm audit` does not cover.
- **Validation:** the counts above.

## Other changes this round

- When a restore is announced, an open Visualizer showing that project reloads it.
- Admin's delete prompt says the previous version is deleted too.
- `ARCHITECTURE.md` describes the summary list, server-side checks, journal handling, merge-aware reparse matching, kept places, the snapshot file and restore, and link-only recalculation.

## Files changed in this round

- Server: `project_store.py`, `serve.py`, `test_serve.py`
- Browser: `catasto-records.js`, `catasto-storage.js`, `app.js`, `admin.js`, `index.html`, `index.css`
- Tests: `catasto-records.test.mjs`, `catasto-storage.test.mjs`, `index-app.test.mjs`, `admin.test.mjs`
- Docs: `ARCHITECTURE.md`, `INSTALL.md`, `HANDOFF.md`, `HUMAN_DECISIONS.md`, `CLAUDE_RESPONSE.md`, `CLAUDE_RESPONSE_2.md` (the previous response, kept for history)

STATUS: READY_FOR_REVIEW
