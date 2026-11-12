# Independent follow-up review

Reviewed: 2026-11-12  
Project: `/Users/stevecovello/Documents/Codex/Catasto Visualizer`  
Comparison checkpoint: `88324866127a2a6cda977c9f3f7416232bcf067b`

## Scope and result

Read `CODEX_REVIEW.md`, the current `CLAUDE_RESPONSE.md`, and `HUMAN_DECISIONS.md`. Compared the working tree, including staged changes and untracked repair/test files, against the pre-audit checkpoint. Inspected the repaired storage/server, UI workflows, parsing, relation scoring, exports, dependency/configuration changes, tests, and affected documentation, with unchanged integration code where needed. The repairs are uncommitted; HEAD alone does not contain them.

Of the 16 prior findings: **11 RESOLVED**, **4 STILL_OPEN**, **1 HUMAN_DECISION_REQUIRED**. One additional MEDIUM finding concerns delivery of the parser repair to existing projects. No CRITICAL finding was identified. Passing tests do not close the reproduced integrity defects below.

No source code was changed. Diagnostics used temporary synthetic libraries, not the user's saved library. This report replaces the older file of the same name; prior review/response and decision files were left unchanged.

## Verification

| Diagnostic | Independent result |
| --- | --- |
| `npm test` | 149 tests: 146 passed, 3 skipped, 0 failed |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest test_serve` | 52 passed |
| `npm run test:browser` | 1 passed; real Chromium, temporary library, real loopback server |
| `npm run lint` | Passed |
| `.venv/bin/ruff check --no-cache .` | Passed |
| `git diff --check 8832486` | Passed |
| `npm audit --ignore-scripts --json` | 4 moderate package entries from the already accepted minimatch advisory; no high/critical entries |
| Additional synthetic probes | Reproduced M1, M2, M3, L3, and NEW-01 below |

Environment: Node v23.1.0, Python 3.12.0, macOS. There is no separate configured TypeScript check or application build in `package.json`; this is a directly served JavaScript/Python application.

The three skipped checks require `CATASTO_VALIDATION_MD`. Claude reports that the optional current-source bilingual check fails with 355 English versus 358 Italian households. That private-data result was **not independently rerun**, and its attribution solely to transcription formatting is not certified by this review. Synthetic bilingual coverage passes. Windows, a real Python 3.7 runtime, and actual power interruption were not tested. Flush-order tests verify calls/order, not hardware durability. The browser check covers one creation/edit/reload flow, not every UI interaction.

## CRITICAL

No findings.

## HIGH

### H1 — Revision tokens repeat within a millisecond

**Status: RESOLVED.**

Location: `project_store.py:130–141`; `test_serve.py`, test `test_saves_within_one_millisecond_off_its_boundary_still_detect_a_stale_copy`.

The clock is truncated to stored precision before comparison, and the next token advances beyond the stored token even when the clock moves backward. The regression test exercises nonzero microseconds and rejects stale saves/deletes. No further correction or human decision is needed for this finding.

### H2 — A second server recovers another server's active work

**Status: RESOLVED.**

Location: `project_store.py:84–109`; `serve.py:229–241,258–269`.

An OS lock is acquired before constructing/recovering the store and held until server closure. Constructor failures release it. Passing tests cover same-folder exclusion and a separate process, including release/reacquisition. Direct `ProjectStore` construction remains intentionally unlocked for tests; production construction uses `create_server`. An older executable that does not honor the lock is outside this protection. Windows locking was not executed here. No additional decision is required.

### H3 — A later merge restores stale source evidence over an edit

**Status: RESOLVED.**

Location: `app.js:1809–1914`, `index.html`, `index.css`; retained compatibility handling in `catasto-records.js`.

D10 was implemented by removing merge/undo/separate actions, their modal, and the duplicate-review trigger. A name correction no longer initiates merging. Legacy merge metadata remains available to compatibility/reparse handling. The specific later-merge overwrite path is gone. This does **not** resolve the separate legacy export omission in M1. No new decision is required for H3.

## MEDIUM

### M1 — Exports still omit members from later legacy merged entries

**Status: STILL_OPEN.**

**Affected files:** `catasto-name-index.js:252–262,375–384`; `catasto-xlsx-index.js` consumes `CatastoNameIndex.collectMentions`.

**Technical reason and evidence:** `memberLines` still stops at the first narrative after the first member block. Removing the merge UI prevents new merges but does not prevent importing or opening older merged records, which D10 explicitly retains. A synthetic legacy composite with Bruno Ventrella and Lucia Serra in the first entry and Carlo Ventrella in the second exported only Lucia and Bruno. The merged `members_text` included Carlo, but the fallback is not used once the first block has yielded members. Both export formats rely on this extraction. The absence of merged records in the current personal library does not make the supported import path correct.

**Recommended correction:** At minimum, detect legacy merged records and refuse the incomplete name/XLSX index with a visible explanation and instructions to correct/reimport the transcript; preserve ordinary project backup/export. Alternatively, implement constituent-aware member extraction with explicit reconciliation rules and regression coverage.

**Can Claude address automatically?** Yes, detection and a protective refusal can be implemented without changing stored evidence. Do not silently infer a new provenance or person-reconciliation model.

**Human judgment required?** Only if full legacy merged-index support is desired instead of the protective refusal; choose reconciliation/provenance rules first. D10 does not authorize silent omissions.

### M2 — A later import can overwrite the retained rollback journal

**Status: STILL_OPEN.**

**Affected files:** `project_store.py:319–359,612–652`; `test_serve.py:563–600`.

**Technical reason and evidence:** Retaining the journal on rollback failure fixes the original immediate deletion. However, `settle_import(project_id)` refuses only IDs belonging to that failed import. A new import with different IDs proceeds to overwrite the single global journal at line 639, even if the earlier rollback is still blocked. Once the new import succeeds, it deletes that journal. The old partial import is then neither unavailable nor recoverable.

A temporary-store probe injected failure writing `new-2` and failure removing `new-1`. The journal correctly contained both IDs. While that unlink failure remained, importing `other` succeeded and removed the journal. After creating a fresh store to simulate restart, `get('new-1')` returned the orphan from the failed import. This violates the advertised all-or-none import contract. The new regression test never attempts a second import during the unresolved rollback.

**Recommended correction:** Under the store lock, prevent any new batch from replacing an unresolved import journal. Finish the earlier rollback or reject the new import with a recoverable error before writing a new journal. Add a regression with two consecutive imports and persistent rollback failure. Per-import journals are an alternative, but are unnecessary for this simple serialization rule.

**Can Claude address automatically?** Yes.

**Human judgment required?** No; preserving the established atomic-import contract needs no product decision.

**Reassessment of Claude's separate NEW-01:** Independently reproduced journal-unlink failure after all project writes: the request fails, the files initially exist, and the next access rolls them back. This is not evidence of losing an *acknowledged successful* import: journal removal is the current commit boundary and the operation returned an error. Consistent rollback of that failed operation is compatible with all-or-none semantics. A committed-state marker could change those semantics, but is not required merely because all data writes happened before the error. Do not conflate that case with the journal-overwrite defect reproduced above.

### M3 — Numeric validation still has overflow and response-encoding gaps

**Status: STILL_OPEN.**

**Affected files:** `project_store.py:112–122,207–208,224–226,469–478`; `serve.py:160–167,169–207`.

**Technical reason and evidence:** The explicit `NaN`/`Infinity` tests now pass, malformed JSON becomes a controlled error, and malformed household counts no longer break the list. Two boundaries remain:

- `math.isfinite` converts integers to a float. A valid JSON integer of `10**400` in `source_pages` raises `OverflowError`. This is newly introduced by the finite-number repair and is outside the API's exception branches. A same-origin PUT to the temporary server ended with `RemoteDisconnected`, rather than a validation response.
- `parse_constant` does not handle ordinary exponent syntax. `loads('{"x":1e999}')` produces an infinite Python float. A synthetic existing project containing this value was served with HTTP 200 and `"extra": Infinity`, because `send_json` still uses permissive `json.dumps`. The browser cannot parse that response. New saves are caught by strict serialization, but existing-file reads and API responses remain exposed.

**Recommended correction:** Validate integer magnitude without unsafe float conversion; reject unsupported page values with `ProjectError(400)`. Use a finite-checking `parse_float` or equivalent recursive numeric validation for reads, and strict response encoding with a controlled damaged-file/error path. Preserve the original damaged file. Add API tests for huge integers and overflowing exponents, including nested fields and legacy files.

**Can Claude address automatically?** Yes.

**Human judgment required?** No. Rejecting unrepresentable numeric values and returning valid JSON does not require rejecting repairable legacy schemas.

### M4 — Out-of-order project activation and save continuations

**Status: RESOLVED.**

Location: `app.js:1479–1538,1672–1698,1765–1767,1856–1908`; deferred-I/O tests in `index-app.test.mjs`.

Activation generations discard superseded loads, save continuations check the original active object, and the edit guard covers reparse review and saves in flight. Tests verify latest-selection ordering, failed-read selector recovery, navigation during a save, and broadcasts while editing. No additional correction or decision is required for the reported schedules.

### M5 — Unknown ages are treated as zero in family leads

**Status: RESOLVED.**

Location: `catasto-relations.js:725–733`; unknown-age regression test in `catasto-relations.test.mjs`.

Missing/empty ages return unknown rather than zero. Explicit infant values map to zero. The targeted regression and existing lead tests pass. No human decision is needed.

### M6 — Development dependency advisory

**Status: RESOLVED — accepted risk under D12, not technically patched.**

Location: `package.json`, `package-lock.json`, `eslint.config.mjs`; D12 in `HUMAN_DECISIONS.md`.

The independent npm audit still reports four moderate package entries caused by [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). These are not four independent runtime vulnerabilities. The affected tooling is development-only and the repository's lint patterns are fixed. No major downgrade or forced override was introduced. The added Playwright dependency did not produce an additional audit finding.

D12 explicitly accepts waiting for a compatible upstream fix, so the agreed disposition is satisfied. Keep the documented update/review trigger; do not describe the lockfile as vulnerability-free. Claude's objection to an unconditional automatic dependency fix is reasonable: npm's suggested major downgrade is not proof of compatibility. No new human decision is required under the recorded exposure model.

### M7 — Durability of acknowledged writes

**Status: RESOLVED for the reviewed macOS implementation, with platform limits below.**

Location: `project_store.py:150–203,328–345,395–423,637–652,656–662`; flush-order tests in `test_serve.py`.

D11's selected approach is implemented: staged contents are flushed before replacement, transaction intent precedes the paired replacement, destination directories are synchronized before journal removal, and deletions are synchronized before completion. macOS uses `F_FULLFSYNC` with an `fsync` fallback. The ordering tests and the macOS-specific test pass. JSON storage, portable export, and snapshot shape remain intact.

This status closes the original absence of synchronization on the current platform; it is not a certification against real power loss. Windows directory synchronization is explicitly skipped by `sync_dir`, and Windows was not exercised. Do not treat NTFS journaling alone or these macOS tests as proof of D11 on Windows; cross-platform durability verification remains a release limitation. No new storage-engine decision is required for the reviewed macOS repair.

### M8 — Missing browser and failure-schedule test coverage

**Status: RESOLVED for the agreed coverage work.**

Location: `smoke.browser.mjs`, `synthetic-fixture.test.mjs`, `test-fixtures/synthetic-catasto.md`, `validation-source.mjs`, expanded JS/Python tests, `package.json`.

The synthetic bilingual fixture covers parser, family, page, reference and export behavior without publishing private source. The Chromium smoke test exercises real server headers/CSP, Admin creation, a rendered 3D canvas, source editing and persistence after reload. Subprocess locking, deferred UI I/O, numeric failures and flush ordering have targeted tests. These tests independently pass.

The response records approval for the new browser dependency and for leaving CI out of scope. Its concern about assuming permission for a toolchain addition is reasonable; the recorded choice now supplies that direction. The new probes in this review need to become regression tests when corrected, but do not negate completion of the agreed browser/synthetic work. Optional private-source failures/skips remain disclosed above.

### NEW-01 — Parser behavior changed without an upgrade version

**NEW FINDING — MEDIUM.**

**Affected files:** `catasto-parser.js:276–291,345`; `catasto-records.js:387–388`; `app.js:1545–1551`. This is the repair Claude calls NEW-04, not its journal-cleanup NEW-01.

**Technical reason and evidence:** Same-line page/section labels now parse correctly, but `PARSER_VERSION` remains 6, the same as at the checkpoint. `needsReparse` exclusively compares that version to the saved project's version. Therefore existing version-6 projects created with the defective parser never receive the reviewed update offer.

A synthetic Italian transcript with one normal section heading and one same-line heading produced **one household under the checkpoint parser and two under the current parser**. Both results were version 6, and `needsReparse({sourceText, data: oldData})` returned **false**. Fresh imports benefit from the repair while existing projects silently retain the omitted household. This conflicts with D3's reviewed parser upgrade requirement; English output being unchanged does not resolve the Italian upgrade path.

**Recommended correction:** Advance the parser version (or introduce an equally explicit capability/version discriminator), preserving the established reviewed-reparse workflow and previous-version snapshot. Add a test that saves data from the old parser, confirms that an update is offered, and verifies the reviewed result preserves IDs and edits while adding the missed entry. Do not silently reparse existing projects on load.

**Can Claude address automatically?** Yes; use the already approved D2/D3 workflow.

**Human judgment required?** No new policy decision. Individual project updates remain user-reviewed as already required.

## LOW

### L1 — Storage errors are hidden or escape action handlers

**Status: RESOLVED.**

Location: `admin.js:230–273`; `app.js:1449–1476,1793–1798,1922–1927`; `index.html:56–62`.

Admin actions now have an outer rejection handler, missing projects refresh the list, and Visualizer errors use a visible alert rather than the hidden filename line. Failed automatic preparation is disclosed as unsaved. Added tests pass and the real browser flow succeeds. No new human decision is needed.

### L2 — Duplicated extraction rules and obsolete view state

**Status: HUMAN_DECISION_REQUIRED.**

**Affected files:** `app.js:234–237,406–410,476–509`; `catasto-relations.js:454–472`; affected architecture/readme/planning documentation.

**Technical reason:** Documentation corrections were made, but separate English land-clause recognizers still implement different criteria. Consolidating them without a behavior decision can change the parcels and neighbor evidence shown. The obsolete `view.x`, `view.y`, and `view.scale` initializers remain; a repository search found no `view.x/y/scale` uses. These were specifically identified in the prior review, so they are not an unspecified cleanup request.

**Recommended correction:** Remove verified unused state separately. Add parity fixtures documenting current land/report differences. Decide whether both views must recognize the same clauses or whether their differing inclusion criteria are intentional; then share safe helpers and document the chosen semantics. Do not change domain extraction just to reduce line count.

**Can Claude address automatically?** Yes for unused state and behavior-preserving cleanup/tests. Not for selecting new evidence-inclusion semantics.

**Human judgment required?** Choose unified clause inclusion versus deliberately different rules for parcel visualization and relation evidence. This is the remaining substantive decision in Claude's response; it is not a reason to defer the safe cleanup.

### L3 — Page attribution remains ambiguous when openings repeat

**Status: STILL_OPEN.**

**Affected files:** `catasto-name-index.js:192–205`; `catasto-parser.js:585`; XLSX export via `collectMentions`.

**Technical reason and evidence:** Falling back to all entry pages when an opening disappears correctly implements that part of D10. However, each recorded opening is still located with `entry.indexOf`, independently from the beginning. Repeated openings resolve to the same offset, even though all anchors technically match.

A synthetic three-page entry used `He owns a garden bordering Matteo Ferrandina.` as the opening on both pages 2 and 3. Carlo Rossi appeared only on page 2. The current parser recorded both openings, but `collectMentions` assigned Carlo **page 3 only**. Thus a normal repeated phrase, or an edit that duplicates an anchor, can still produce a confident wrong citation rather than the approved conservative fallback.

**Recommended correction:** Require unambiguous, ordered page anchors. When anchors are repeated, displaced, or otherwise ambiguous, cite all entry pages under D10. More precise occurrence/offset metadata may be introduced later, but must remain valid after editing. Add repeated-opening and edited-anchor tests for reference mentions/XLSX.

**Can Claude address automatically?** Yes, with the conservative fallback already selected in D10.

**Human judgment required?** No; no new provenance or display policy is needed.

## INFORMATIONAL

### I1 — Trusted local-user authentication model

**Status: RESOLVED — retained accepted design under D1.**

Location: `serve.py`, `project_store.py`, D1 in `HUMAN_DECISIONS.md`.

The application remains loopback-only with private local files and no API token. This is the accepted single-trusted-OS-user model, not a repaired authentication mechanism. Revisit before shared/untrusted-host or remote deployment. No new decision is required for current use.

### I2 — Existing defensive controls

**Status: RESOLVED — no corrective action was required.**

Location: `serve.py` request validation/static serving/headers; `project_store.py` private-file handling; UI escaping and export code.

Loopback binding, static allowlisting, CSP/nosniff, Host/Origin checks, request limits and private storage remain in place. Security tests and the real-browser check pass. The repair diff introduced no hardcoded secret, runtime dependency service, shell/SQL execution path, or evident new injection sink. This is a bounded review statement, not a guarantee that all inputs are harmless; M3 remains open.

## Decision compliance and disagreement reassessment

- **D1, D4–D9:** The reviewed changes preserve the local trust model, permanent-ID/repair flows, Admin ingestion, separate snapshots and backup behavior. No contrary change was found.
- **D2/D3:** Reviewed reparse remains intact, but NEW-01 prevents the parser repair from being offered to existing version-6 data.
- **D10:** Merge UI removal and retention of the single-entry editor were followed. Legacy compatibility remains, so M1 is not closed merely by removal of creation controls. Missing-anchor fallback follows the decision; repeated-anchor attribution still fails in L3.
- **D11:** Synchronization was implemented and tested on macOS. Windows and physical power-loss durability are unverified, as stated under M7.
- **D12:** Accepted dependency risk was retained without an unsupported forced upgrade/downgrade.
- **M8 direction:** Browser/synthetic coverage was added; no CI was introduced. That direction is recorded in Claude's response rather than as a numbered decision in `HUMAN_DECISIONS.md`.
- **DISAGREE:** Claude did not reject the factual prior findings. Its objections concern automation labels for dependency remediation and adding browser tooling. Those objections are reasonable and do not remove the need to verify behavior; the relevant choices are now recorded. Its claimed closure of M1/M2/M3/L3 is not supported by the independent probes above.

**Human input still needed:** L2's intended relationship between land-clause rules. Full legacy merged-index support in M1 would also require reconciliation rules; a protective refusal needs no new decision. The other actionable corrections can proceed under existing decisions. No additional decision is required merely to preserve atomic imports after a failed request.

OVERALL STATUS: CHANGES_REQUIRED
