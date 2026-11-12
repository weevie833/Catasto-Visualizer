# Response to CODEX_REVIEW.md (seventh round: independent repository review)

Reviewed 2026-11-12 against the working tree at HEAD `8832486`. I checked every finding against the source before acting. Each fix was preceded by a test that reproduced the reported behavior on the unfixed code. Nothing was committed or pushed. The previous response is now `CLAUDE_RESPONSE_6.md`; earlier ones are `CLAUDE_RESPONSE_2.md` through `_5.md`.

Result: 15 of 16 findings RESOLVED (H1, H2, M2, M3, M4, M5, L1 and L3 by code changes; M7 and M8 by code after your decisions; H3 and M1 by your D10 decision to remove merging; M6 by your D12 decision to accept the advisory; I1 and I2 needed no change). 1 is HUMAN_DECISION_REQUIRED: L2. Fixing these findings also turned up NEW-02, NEW-03 and NEW-04, all fixed. No disagreements with Codex's findings. I do disagree with two of its automation labels (M6, M8), for reasons given below.

## Validation

- `node --test *.test.mjs`: **149 tests, 146 passed, 3 skipped, 0 failed** (130 before; 20 added, including 10 on the synthetic fixture, and the merge/undo test removed with the feature). The 3 skips are the optional checks on the private Marano source (`CATASTO_VALIDATION_MD` not set).
- `python3 -m unittest test_serve`: **52 passed** (41 before; 11 added).
- With `CATASTO_VALIDATION_MD` naming the saved project: 147 passed, and 1 failed by design: the English/Italian agreement check, which reports source formatting problems (see M8).
- `npm run test:browser`: **1 passed** (Chromium against the real server on a temporary project folder; see M8).
- `npx eslint .`: clean. `.venv/bin/ruff check .`: clean.
- **Each fix was reproduced first.** All 7 new Python tests failed or errored on the original `project_store.py`/`serve.py`. The 5 new Visualizer tests failed on the original `app.js`. The new relations test failed on the original `catasto-relations.js`. All of them pass now.
- The test that checks the code parses under Python 3.7 (`ast.parse(..., feature_version=(3, 7))`) still passes for both server files.
- **Not tested:** Windows (the `msvcrt` lock path ran on no machine); a real Python 3.7 interpreter; power loss. The user's saved library was opened read-only in the browser to confirm it loads, and was never written to.

## CRITICAL

None reported.

## HIGH

### H1 — Version tokens can repeat, allowing stale saves and deletes

**RESOLVED.**

Confirmed. Say the stored token is `.123Z` and the clock reads `.123456`. The reading compares greater than `.123000`, so the token is not bumped, and it is then written back as `.123Z` again. The existing test froze the clock exactly on a millisecond boundary, so it could not catch this.

- **Changed:** `next_updated_at` (`project_store.py`) now truncates the clock to milliseconds before comparing, so a new token is always at least 1 ms after the stored one. I kept the existing ISO-timestamp token rather than adding a separate revision field. That keeps the token format the browser and existing files already use: no migration, nothing becomes incompatible.
- **Test:** `test_saves_within_one_millisecond_off_its_boundary_still_detect_a_stale_copy` uses a stepped clock: `.123000`, `.123456`, `.123789`, then a clock set back an hour. It checks that 4 successive tokens are distinct and increasing, and that a stale save and a stale delete both return 409.

### H2 — A second launch can recover and delete another running server's work

**RESOLVED.**

Confirmed. `create_server` built `ProjectStore`, which runs destructive recovery, before trying to bind the port. The only lock was a per-process `RLock`.

- **Changed:**
  - **New lock.** `DataDirLock` (`project_store.py`) is an OS-level exclusive lock on `server.lock` in the data folder: `fcntl.flock` on macOS/Linux, `msvcrt.locking` on Windows. It is non-blocking, and the OS releases it when the process exits, even if it is killed.
  - **Lock comes first.** `create_server` (`serve.py`) takes the lock before `ProjectStore` exists, so before any permission migration, recovery or write. The server holds it until `server_close`, and it is released if construction fails.
  - **Any port.** A second launch on any port raises `DataDirInUse`. `main()` prints that the app is already running and opens the browser, the same as the existing port-in-use path.
  - **Tests unaffected.** The lock is outside the `ProjectStore` constructor on purpose: the store tests simulate restarts by building a second `ProjectStore` on the same folder.
- **Tests:**
  - `test_a_second_server_on_the_same_project_folder_is_refused_before_recovery`: with an import journal present, a second `create_server` is refused, and the journal and the in-progress project are untouched.
  - `test_the_project_folder_lock_excludes_another_process_and_is_released_on_close`: a real subprocess cannot take the lock while a server holds it, can take it after `server_close`, and a new server can then start.
- **Limit:** a server from an earlier version (V 0.08 or before) does not take the lock. Running an old and a new copy at the same time is still unprotected.

### H3 — Editing a merged source leaves stale evidence that later merges restore

**RESOLVED — by decision (D10): the merge feature was removed.**

Confirmed by reading the code: `saveSourceEntry` rewrote only `source_entry`, and a later merge rebuilt the composite from the uncorrected `source_entries`. You decided on 2026-11-12 that the Visualizer is not an authoring or correction platform. Auditing is done by exporting an index, correcting the source transcript and importing it again. So merging was removed rather than given a provenance model.

- **Removed** (`app.js`, `index.html`, `index.css`):
  - the duplicate-household review that a name correction opened;
  - merge, undo merge, and "keep separate" (`findStrongDuplicate`, `openDuplicateReview`, `mergeDuplicateRecords`, `undoDuplicateMerge`, `keepDuplicateSeparate` and their helpers);
  - the `#duplicateModal` markup and the `.duplicate-*` styles.
- **What happens now:** correcting a head to a namesake's name just saves the entry. Both households stay.
- **Kept for older data.** Records merged by an earlier version are still read correctly:
  - reparse matching by `source_entries` (`catasto-records.js`) is kept, so an update does not split them;
  - the id conversion of old `merge_history` and `duplicate_decisions` is kept.
  - Removing these would change or drop data in imported older projects. Your saved library has no merged records (checked: 355 households, none merged), so this affects only older exports.
- **Reparse message.** It no longer tells the user to "undo the merge". It says merging is no longer available and to correct the transcript and import it again.
- **Tests:**
  - removed the merge/undo test, and the merge and keep-separate parts of the failed-save test;
  - added `correcting a head to a namesake's name keeps both households; nothing is merged`;
  - updated the reparse-summary wording test.
- **Kept on purpose:** the legacy merged-record tests in `catasto-records.test.mjs` and `catasto-storage.test.mjs`.
- **Planned features withdrawn.** In `HANDOFF.md`, the planned "dedicated record editor" and "spelling-variant decisions" features are now marked withdrawn under this decision.

### M1 — Name and XLSX exports omit members from later merged entries

**RESOLVED — by decision (D10).**

Confirmed: `memberLines` (`catasto-name-index.js`) stops at the first narrative line, so a merged composite's second member block is never read.

With merging removed (H3), no new merged record can be created. The defect remains only for a record merged by an earlier version and then imported, and your library has none. I left the exporter unchanged: fixing it for legacy data alone would need the same people-reconciliation rules D10 was about. If an older project with merges is ever imported, the remedy is the same as for any audit: correct the transcript and import it again, which gives one record per entry.

### M2 — Failed rollback removes the journal needed to finish recovery

**RESOLVED.**

Confirmed. `finally: remove_file(journal)` ran even when undoing the import's writes failed.

- **Changed** (`project_store.py`):
  - **Undo is checked.** `add_all` now removes the journal only after a successful import, or after `undo_import` confirms that every listed file is gone. Otherwise the journal stays and the original error is re-raised.
  - **Retry on access.** The new `settle_import` runs from `settle()`, so it covers every get/save/delete/export/restore/import, and also from `list()`. It retries the undo on each access.
  - **Projects are refused meanwhile.** While the undo is incomplete, the import's own projects are refused with 503 and listed `unavailable`. Nothing can be saved into a project that recovery would later delete. Other projects are served normally.
  - **Same rule at startup.** The startup recovery keeps the journal if it could not remove everything.
- **Test:** `test_an_import_whose_undo_fails_keeps_its_journal_and_refuses_its_projects` injects a write failure and an unlink failure at the same time. It checks that the journal is kept, the imported project gets 503 and is listed unavailable, and the other project is unaffected. Once unlinking works again, the next access finishes the undo.
- **New issue found, not fixed (NEW-01):** after a *successful* import, if removing the journal itself fails, the request returns 500 and the next start deletes the successful import. This existed before; I only moved the removal out of `finally`. Fixing it needs either a "committed" marker written into the journal or a second journal state. It is low-probability, and I am noting it rather than adding another storage state unasked.

### M3 — Non-finite values and malformed stored data escape validation and error handling

**RESOLVED** (for the storage and API layer; scope limit stated below).

All three parts were confirmed: `NaN` was accepted and persisted, `households: 5` raised `TypeError` from `len()`, and a corrupt project file raised an error outside the handler's `ProjectError`/`OSError` branches.

- **Changed:**
  - **Strict JSON.** `loads` and `dumps` in `project_store.py` reject `NaN`/`Infinity`. Request bodies, stored-file reads and every project, snapshot and import write now use them, and `is_number` requires `math.isfinite`. A non-finite value in a save is a 400 with a message; nothing is written.
  - **Damaged files.** A stored file that is not readable JSON, or not a JSON object, raises `DamagedFile`. It is a 500 with the file's name, and the file is left unchanged. `DamagedFile` subclasses both `ProjectError` and `ValueError`, so the existing code that sets aside a damaged import journal keeps working unchanged.
  - **Listing.** `project_summary` tolerates a non-list `households`, and `list()` also catches `TypeError`, so one malformed file no longer hides the library.
- **Tests:** `test_non_finite_numbers_are_refused` (API), `test_non_finite_numbers_are_refused_by_the_store`, and `test_a_damaged_project_file_gets_a_clear_error_and_is_kept`.
- **Deliberately not done:** full schema validation of stored projects on every read. Decisions D2, D4 and D8 rely on opening and repairing older projects and snapshots that do not pass the current rules. Refusing them on read would make existing user data inaccessible. No existing file is modified, moved or deleted by this change.

### M4 — Asynchronous project changes can leave the wrong project active

**RESOLVED.**

Confirmed: there was no request generation in `activateProject`, the reparse modal was missing from `isEditingProject`, and save continuations reassigned `activeProject` unconditionally.

- **Changed** (`app.js`):
  - **Latest choice wins.** `activateProject` takes a generation number and drops any continuation that a later choice has superseded.
  - **Failed reads.** If `getProject` fails, the selector goes back to the project still shown.
  - **Guarded saves.** Every edit save (source entry, merge, undo merge, keep separate, apply reparse) goes through `saveEdit`, which counts saves in flight. After the save, the result is applied only if the same project is still the active one. The save itself is never lost: it is already stored.
  - **Wider broadcast guard.** `isEditingProject` now also covers an open reparse review and any save in flight. An Admin announcement then only updates the selector list, as it already did for an open editor.
- **Tests** (`index-app.test.mjs`, with deferred storage calls resolved in a chosen order):
  - choosing two projects quickly opens the one chosen last, whichever loads first;
  - a failed read returns the selector to the open project;
  - a save that finishes after another project was opened is stored but does not reopen the edited project;
  - an import announced while a reparse review or a save is open does not replace the project.

### M5 — Unknown ages become zero in family-lead scoring

**RESOLVED.**

Confirmed: `Number(null)` is `0`, so a head with no age produced "age 30: old enough to be a parent".

- **Changed:** `ageNumber` (`catasto-relations.js`) returns `null` for a missing, empty or invalid age, so it never counts as a clue. An explicit `infant` is now treated as 0, matching the export's rule. Before, it was `NaN`, so it was simply ignored.
- **Test:** `an unknown age is not evidence for or against a lead` covers a subject with no age and a candidate with no age. It failed before the fix.
- The existing lead tests, which use real ages, are unchanged.

### M6 — Locked development dependencies include a disclosed denial-of-service issue

**RESOLVED — by decision (D12, Option A: accept and wait). No dependency change.**

You decided on 2026-11-12 to accept the advisory until ESLint ships a release that depends on minimatch 11.0.1 or later. Rechecked that day: nothing had changed (ESLint 10.14.0 requires `^10.2.6`, `@eslint/config-array` 0.23.5 requires `^10.2.4`). The decision is recorded as D12 in `HUMAN_DECISIONS.md`. `HANDOFF.md` has a "Known cautions" entry to update ESLint and rerun `npm audit`, lint and the tests when a fixed release ships. Until then, `npm audit` keeps reporting the same 4 moderate entries, all from this one advisory.

The analysis behind the decision follows.

I verified the advisory: minimatch 7.0.0–11.0.0 ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)). I disagree that this is "safe automatically": no compatible set exists today.

- The latest ESLint, 10.14.0, still requires `minimatch ^10.2.6`.
- The latest `@eslint/config-array`, 0.23.5, requires `^10.2.4`.
- The newest 10.x release is 10.2.6, which is the version installed.

Every fix therefore changes the toolchain. I made no dependency changes.

- **Option A (chosen): accept and wait.** Leave the lockfile as it is until ESLint ships a release that depends on minimatch 11. The risk is a crafted glob, and this project's lint globs are fixed in `eslint.config.mjs` and are not taken from user input. The package is dev-only and never shipped to the browser. Recommended.
- **Option B: downgrade to ESLint 9.39.x** (npm's `--force` suggestion). Its minimatch 3.x is outside the affected range, but it is a major-version downgrade. The flat config and `@eslint/js` 10 rules would need to be re-checked.
- **Option C: add an `overrides` entry forcing minimatch 11.** This is an unsupported combination for ESLint 10, it could break glob matching in lint silently, and Codex itself advises against it.

### M7 — Atomic rename does not establish durable crash-safe transactions

**RESOLVED — by decision (D11, Option A: durable saves), then by code change.**

Confirmed: `atomic_write_text` and the transaction and journal steps never flushed files or folders. You chose on 2026-11-12 that a successful save must survive an OS crash or power loss.

- **Changed** (`project_store.py`):
  - **Every atomic write flushes first.** `atomic_write_text` flushes the temporary file to the disk before the rename, then flushes its folder so the rename is permanent. New folders are flushed into their parent.
  - **macOS uses `F_FULLFSYNC`.** Plain `fsync` can leave data in the drive's cache. `sync_descriptor` falls back to `fsync` where `F_FULLFSYNC` is not supported, for example on some network drives.
  - **Windows:** file contents are flushed. Folders cannot be opened for flushing there, and NTFS journals the rename itself.
  - **Ordering in a paired update** (project plus snapshot):
    1. Both staged files and their `.pending` folder are on the disk before the transaction record is written.
    2. The record is on the disk before the real files are replaced.
    3. Both replacements (`projects/` and `snapshots/`) are on the disk before the record is removed.
    4. The removal is flushed.
  - **Imports:** every project file is on the disk before the journal is removed, and the removal is flushed. After a power loss, a finished import is therefore never undone at the next start. This also covers NEW-01 when the power fails, but not when removing the journal fails.
  - **Undo, recovery and delete:** removals are flushed before the journal or transaction record that depends on them is removed. A delete is flushed before it is reported.
- **Cost, measured on this Mac:** writing a 2.2 MB file, the size of the Marano project, takes a median of 10 ms with flushing against 1 ms without. An update that also keeps the previous version writes 3 files, about 30–50 ms. Reads and listing are unchanged.
- **Tests** (`test_serve.py`). They record flushes, folder flushes, renames and removals in order:
  - `test_an_update_reaches_the_disk_in_an_order_a_power_loss_cannot_break`;
  - `test_an_import_is_on_the_disk_before_its_journal_is_removed`;
  - `test_a_delete_is_on_the_disk_before_it_is_reported`, which also covers deleting a project that does not exist;
  - `test_macos_writes_through_the_drive_cache`, which checks that `F_FULLFSYNC` is used and `fsync` is not.
- **Limit:** a real power loss cannot be tested. The tests prove the order of flushes, not the drive's behavior. A drive or virtual machine that ignores flush requests can still lose recent writes. Windows was not run.

### M8 — Test doubles miss browser behavior and important failure schedules

**RESOLVED — by decision.** You chose on 2026-11-12 to add a real-browser check and a synthetic fixture, and to skip CI unless GitHub reports an error.

**Targeted regressions** (added earlier this round):
- the H1 timestamp test with non-zero microseconds;
- a real subprocess lock test (H2);
- simultaneous write and rollback failure (M2);
- deferred-I/O ordering tests for activation and saves (M4);
- unknown-age scoring (M5);
- visible-error tests (L1);
- flush ordering (M7).

**Synthetic fixture:**
- `test-fixtures/synthetic-catasto.md` is an invented bilingual transcription. Its names, places and figures are made up; nothing comes from the private file. Where the parser depends on wording, I checked the real transcription's phrasing only for which forms occur (for example "vedova del fu" and "Paga al…"). No text was copied.
- It covers:
  - both languages;
  - an entry that crosses a page;
  - a widow's children;
  - an infant;
  - an Italian patronymic and origin;
  - residence and land borders;
  - a creditor of another town.
- `synthetic-fixture.test.mjs` adds 10 tests of the parser, the Name Index and the XLSX Index on it, plus a check that the English and Italian sides yield the same people.

**It found two real bugs, both fixed:**
- **NEW-02:** the Italian reference triggers (`paga a`, `confina`, `giusta li beni di`, `contiguo`, `esige da`) matched only lowercase. The transcription begins sentences with them ("Paga al nobile…"), so on the real `300.md` file, 45 people named in Italian creditor clauses were missing from the Italian Name and XLSX indexes. Fixed in `catasto-name-index.js`.
- **NEW-03:** "Teresa, daughter, an infant" exported the occupation "an", because `descriptionOf` removed "infant" but not its article. The real file has 11 such lines. Fixed in `catasto-relations.js`.
- Both bugs fail the fixture tests on the original code.

**Real-browser check:**
- Playwright 1.64.1 is a pinned development dependency. It was installed with `--ignore-scripts` and runs the Chromium build already on this Mac, so nothing was downloaded.
- `npm run test:browser` (`smoke.browser.mjs`, about 7 seconds) runs these steps:
  1. Starts the real `serve.py` on a free port with a temporary project folder.
  2. Creates a project from the fixture in Admin.
  3. Opens the Visualizer and checks that the household list and the 3D canvas render.
  4. Edits a source entry, reloads, and confirms the edit is kept.
  5. Fails on any console error, page error, or security-policy violation.
- **Negative check:** a temporary inline `style` attribute in `index.html` made it fail with the CSP violation, and the file was restored.
- It runs separately from `npm test`. `npm audit` is unchanged (the same 4 entries from D12).

**Not done, by decision:** CI. It is to be revisited only if GitHub reports an error.

**Source checks now read the current project.** On 2026-11-12 you said that the current project holds the most recently corrected source, and that all earlier source files and test files should be ignored. The three optional source checks therefore no longer read any older file:
- **Which checks:** the Name Index check, the XLSX Index check, and the English/Italian agreement check. The agreement check used to read `MM 1754 Catasto Onciario Transcription 300.md` whenever that file was present.
- **How they read the source:** they read `CATASTO_VALIDATION_MD` through `validation-source.mjs`. It may name the saved project's `.json` file, whose stored `sourceText` is used, an Admin export, or a transcription. They skip when it is unset.
- **Updated expectation:** "Carlo, grandson", after Nicolò Guido, son-in-law, now has a stated relation in the source. The old "Relation of preceding man not stated" note is correctly gone.
- **Results on the current project:** the Name Index and XLSX checks pass.
- **NEW-04, a parser bug, fixed:** in 545 of the 546 Italian sections, the "Italian Transcription" label sits on the page-heading line (`### **…: Page 4** **Italian Transcription:**`). `extractTranscriptionSections` (`catasto-parser.js`) missed those labels, so choosing IT for this source produced 1 household. It now produces 358.
  - The English output is byte-for-byte identical, so `PARSER_VERSION` is unchanged and no reparse is offered.
  - Test: `a section label on the page heading's own line is read`. It failed on the original parser.
- **The agreement check still fails, deliberately.** English reads 355 households and Italian 358, and its message now names the households found on one side only. The real cases are formatting problems in the source, not parser bugs. They are listed for you separately, and the parser was not loosened to accept them.

## LOW

### L1 — Several storage errors have no visible recovery message

**RESOLVED.**

Confirmed: `filenameLine` is permanently `hidden`, the Admin project-action handler had no catch, and preparation save failures went only to the console.

- **Changed:**
  - **New notice in the Visualizer.** A visible `role="alert"` notice, `#storageNotice` in `index.html` with a Dismiss button, reuses the existing `.reparse-notice` style, so no CSS change or stylesheet version bump was needed.
  - **What it reports:**
    - a failed project open, which also resets the selector (M4);
    - a failed library update after an Admin announcement;
    - an automatic preparation update that could not be saved. It says the project is shown with an unsaved update and that the update is retried next time.
  - **Admin.** The project-action handler (export, Name Index, download previous, restore, delete) is now one async function with a catch that writes to `#libraryStatus`. A project that disappeared is reported, and the list is refreshed.
- **Tests:**
  - `an automatic update that could not be saved is reported visibly`: the notice shows; then, after a successful retry, it hides and the update is stored.
  - `a project that cannot be read for an action is reported, not ignored` (Admin).

### L2 — Duplicate parsing/display rules and stale documentation invite drift

`HUMAN_DECISION_REQUIRED` (documentation part done)

- **Done:**
  - `README.md` no longer says that localhost and 127.0.0.1 have separate libraries. It also documents the H2 single-server rule.
  - `ADJACENT_EVIDENCE_PLAN.md` is now labeled a historical design record, implemented in V 0.07.
- **Not done (needs a decision):**
  - **Duplicated rules:** the duplicated English-landholding detection in `app.js` and `catasto-relations.js` uses different inclusion rules. Unifying them means choosing which rule is correct, and that changes what one of the two views shows.
  - **Name helpers:** the same applies to the divergent name, title and surname helpers across the parser, Visualizer and exports.
  - **Options:**
    - (a) Write parity fixtures that record the current differences, then choose per rule which behavior is intended.
    - (b) Leave them separate and document each deliberate difference.
  - **Unused state:** I did not remove the "obsolete view coordinates and translation entries". Codex gave no specific identifiers, and proving them unused across the 3D view and both languages was out of proportion to the benefit this round.

### L3 — Source-page metadata can become stale after edits and merges

**RESOLVED.** The merge half was resolved by D10. For the edit half, you decided on 2026-11-12 to keep the source-entry editor, and I changed the code.

Confirmed and reproduced. `pageParts` (`catasto-name-index.js`) finds each page break by its recorded opening words. After the opening of page 6 was edited, a name on page 6 was exported as page 5: its text fell under the previous break that could still be found. So the citation was not just broader, it was wrong.

- **Changed:** if any recorded break can no longer be found, `pageParts` treats the whole entry as one part with all of its pages. A citation can become broader (for example "5, 6"), but it is never moved to the wrong page. When every break is still found, citations stay exact. Projects created before breaks were recorded behave as before.
- **No layout change:** I added no "uncertain" marker, so the XLSX layout copied from the Transcriber template and the Name Index formats are unchanged. If you later want a visible marker for widened citations, that is a separate choice.
- **Test:** `an edited page opening widens a reference's pages to the entry's, never to the wrong page` (`catasto-name-index.test.mjs`). It failed on the original code.
- **Re-import clears it:** a re-import of the corrected transcript records fresh breaks, which makes the citations exact again.

## INFORMATIONAL

### I1 — Authentication relies on an explicitly accepted trusted-local-computer boundary

**RESOLVED — no change required.**

Agreed. This is decision D1 and nothing in this round changes it. The H2 lock does not change the trust boundary. It only stops two servers run by the same user from conflicting.

### I2 — Existing security controls are useful, with bounded assurance

**RESOLVED — no change required.**

All existing controls are retained, and their tests still pass:

- the Host and Origin checks;
- CSP and nosniff headers;
- the static allowlist;
- request size and concurrency limits;
- private file modes.

The new `server.lock` file is created `0600` under the private data folder.

## Summary of files changed

- `project_store.py`:
  - H1 token precision;
  - H2 `DataDirLock` and `DataDirInUse`;
  - M2 `undo_import` and `settle_import`, with the journal kept on a failed undo;
  - M3 strict `loads`/`dumps`, `DamagedFile`, finite `is_number`, a tolerant summary;
  - M7 `sync_descriptor`, `sync_dir`, `remove_durably` and `sync_project_dirs`, with flushes ordered in every write, transaction, import, undo and delete.
- `serve.py`: H2 lock taken in `create_server` before the store and released in `server_close`; `main()` handles `DataDirInUse`; strict JSON request parsing.
- `app.js`: H3 merge and duplicate review removed; M4 activation generation, `saveEdit` with stale-continuation guards, a wider `isEditingProject`; L1 `showStorageProblem`/`clearStorageProblem` and `prepareProject` returning its save error.
- `index.html`: L1 `#storageNotice`; H3 `#duplicateModal` removed.
- `index.css`: H3 `.duplicate-*` styles removed.
- `admin.js`: L1 project actions wrapped with a visible error.
- `catasto-relations.js`: M5 `ageNumber`; NEW-03 "an infant" is not an occupation.
- `catasto-parser.js`: NEW-04, a section label on the page-heading line.
- `validation-source.mjs`: the optional checks read the current project's stored source.
- `catasto-name-index.js`: NEW-02 Italian reference triggers match capitalized; L3 `pageParts` widens to the entry's pages when a recorded break is not found.
- Tests:
  - `test_serve.py`: 7 tests (H1, H2 ×2, M2, M3 ×3);
  - `index-app.test.mjs`: 5 tests added (M4 ×4, L1); merge tests replaced by one test that nothing is merged (H3);
  - `admin.test.mjs`: 1 test (L1);
  - `catasto-relations.test.mjs`: 1 test (M5);
  - `catasto-name-index.test.mjs`: 1 test (L3);
  - `synthetic-fixture.test.mjs` with `test-fixtures/synthetic-catasto.md`: 10 tests (M8, NEW-02, NEW-03);
  - `smoke.browser.mjs`: the real-browser check (M8), run with `npm run test:browser`.
- `package.json` and `package-lock.json`: `playwright` 1.64.1 (dev) and the `test:browser` script. `eslint.config.mjs`: globals for `*.browser.mjs`.
- `CLAUDE.md`: the browser-check command.
- Documentation:
  - `ARCHITECTURE.md`: the lock, strict JSON, damaged files, the retained import journal;
  - `README.md`: the shared library and single server (L2);
  - `ADJACENT_EVIDENCE_PLAN.md`: status line (L2);
  - `HANDOFF.md`, `INSTALL.md`, `HUMAN_DECISIONS.md`: merge removal, D10 decided, record-editor and spelling-variant plans withdrawn (H3).
- `CLAUDE_RESPONSE.md` → `CLAUDE_RESPONSE_6.md` (staged rename with `git mv`, not committed); this file is new.

The app version (V 0.08 in the footers and `INSTALL.md`) was not bumped. That is for you to do when you release these changes.

## Decisions needed from you

1. **D10:** decided. Merging was removed (H3, M1). The source-entry editor stays, and L3 is resolved by widening citations instead of misplacing them.
2. **D11:** decided. Saves are durable (Option A); M7 is resolved.
3. **M6:** decided (D12). The advisory is accepted until ESLint ships a fixed release.
4. **M8:** decided. The browser check and synthetic fixture were added; CI is skipped unless GitHub reports an error.
5. **L2:** how to handle the duplicated parsing rules.
6. **NEW-01** (under M2): whether to fix the rare loss of a successful import when removing its journal fails. A power loss at that moment is now covered by M7.

STATUS: HUMAN_DECISION_REQUIRED
