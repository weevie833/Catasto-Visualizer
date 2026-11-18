# Response to CODEX_REVIEW_2.md (independent follow-up review)

Reviewed 2026-11-12 against the uncommitted working tree (HEAD `8832486`). I checked each finding against the source before acting. Each fix has a regression test, and I confirmed that test fails without the fix. Nothing was committed or pushed. The previous response is now `CLAUDE_RESPONSE_7.md`.

Result: all five actionable findings are now fixed: M1, M2, M3, L3 and Codex's NEW-01. L2 is resolved: the unused view state is removed, and you decided (D13) to keep the two land-clause rule sets separate and documented. Codex's 11 RESOLVED findings are unchanged. I agree with Codex's reassessment of my earlier NEW-01 (journal removal) and withdraw it.

## Validation

- `node --test *.test.mjs`: **153 tests, 150 passed, 3 skipped, 0 failed** (149 before; 4 added). The 3 skips are the optional checks on the private Marano source.
- `python3 -m unittest test_serve`: **55 passed** (52 before; 3 added).
- `npm run test:browser`: 1 passed. `npx eslint .` and `.venv/bin/ruff check .`: clean.
- **Each new test was run without its fix:**
  - The 3 new Python tests failed or errored on a copy of `project_store.py`/`serve.py` with only these fixes reverted. The huge-integer PUT ended in an unhandled error, as Codex reported.
  - The reparse-offer test failed with `PARSER_VERSION = 6`.
  - The repeated-opening test failed on the previous `pageParts`.
- **With `CATASTO_VALIDATION_MD` naming the saved project:** 49 passed and 1 failed: the English/Italian agreement check, which is meant to fail until the transcript corrections are re-imported. The Name Index and XLSX Index checks pass, so the saved project has no merged records and is not affected by the M1 refusal.
- **Not tested:** Windows, a real Python 3.7 interpreter, power loss (unchanged from the previous round).

## CRITICAL

None reported.

## HIGH

### H1, H2, H3

**RESOLVED** (Codex agrees). No change this round.

## MEDIUM

### M1 — Exports omit members from later legacy merged entries

**RESOLVED — protective refusal.**

Confirmed by reading `memberLines`: once the first entry yields members, the merged `members_text` fallback is never used, so people from the later entries are dropped. I took Codex's minimum option. It fits D10, under which a correction belongs in the transcript, not in the app.

- **What changed:**
  - `CatastoNameIndex.refusalFor(data)` names any household with more than one `source_entries` item.
  - `collectMentions`, which both the Name Index and the XLSX Index use, throws that message, so neither export can be made from such a project.
  - In Admin, the Name Index dialog shows the explanation and disables the four export buttons. A click that gets through anyway is caught and reported in the status line.
  - The project's own export (backup) is unaffected.
- **Not implemented:** reading members from each merged entry. That needs rules for reconciling people and for citing pages, which Codex says need your decision. D10 makes them unnecessary.
- **Test:** `admin.test.mjs`, "a project with households merged by an earlier version gets no index, and says why". It uses Codex's Bruno, Lucia and Carlo example.

### M2 — A later import can overwrite the retained rollback journal

**RESOLVED.**

Confirmed. `add_all` called `settle` only for its own ids, then wrote the single journal over one that still named an earlier import's leftovers.

- **What changed:** under the store lock, `add_all` first calls `settle_import()`. If the journal still exists after that, the import is refused with 503 before anything is written.
- **Test:** `test_an_import_waits_while_an_earlier_failed_import_is_still_being_undone`, built from Codex's probe. The first import fails part-way and its rollback is blocked, so the second import is refused and the journal still names `new-1` and `new-2`. After a restart, `new-1` is gone, and the second import succeeds and leaves no journal.

**My earlier NEW-01 is withdrawn.** Codex is right: the import reported an error, so undoing it at the next access keeps the import all-or-none. It is not a lost success.

### M3 — Numeric validation has overflow and response-encoding gaps

**RESOLVED.**

Confirmed both gaps.

- **What changed:**
  - **Reading:** `loads` now has a `parse_float` that rejects numbers too large to represent, such as `1e999`. A request containing one gets 400 ("not valid JSON"), and a stored file containing one is reported as damaged (500) and left unchanged, the same as other damaged files.
  - **Number checks:** `is_number` no longer converts integers to a float. Integers are accepted up to 2^53, the largest a browser holds exactly. A larger page number gets a 400 with an error message instead of a crash. Floats must be finite.
  - **Replies:** `send_json` now uses the strict `dumps`, so a reply can never contain `NaN` or `Infinity`.
- **Tests:**
  - `test_numbers_too_large_for_a_browser_are_refused_with_a_reply`: a 400-digit integer, `1e999`, 2^53+1, and a nested `-1e999`.
  - `test_a_saved_file_with_an_overflowing_number_is_reported_damaged_not_sent`: a nested `1e999` in a stored file; the file is kept byte for byte.

### M4, M5, M6, M7, M8

**RESOLVED** (Codex agrees). No change this round. Codex's platform limits for M7 still apply: Windows folder syncs and real power loss are unverified.

### NEW-01 (Codex) — Parser behavior changed without an upgrade version

**RESOLVED.**

Confirmed. I had left the version at 6 because the English output was unchanged, but that meant existing Italian projects were never offered the fix.

- **What changed:** `PARSER_VERSION` is now 7, and ARCHITECTURE.md says so. Projects still go through the existing reviewed update: nothing is reparsed on load, and a previous-version snapshot is kept.
- **Side effect:** every saved project now shows the update notice once. For your English Marano project, the review lists any changes before anything is saved.
- **Test:** `catasto-records.test.mjs`. A version-6 Italian project with one edited household is offered the update, and the update keeps that household's id and correction while adding the household from the same-line heading.

## LOW

### L1

**RESOLVED** (Codex agrees).

### L2 — Duplicated extraction rules and obsolete view state

**RESOLVED — unused state removed; the rules kept separate by decision D13.**

- **Removed:** `view.x`, `view.y` and `view.scale` from `app.js`. A search found no reads of them; `scene3d.js` uses only Three.js objects' own `.scale`.
- **Decided (D13, 2026-11-12):** the land-clause rules for the parcel view (`app.js`) and for relation evidence (`catasto-relations.js`) stay separate. Nothing you see changes.
  - **Documented in ARCHITECTURE.md:**
    - The view draws only sentences that name land, includes a garden named in the residence sentence, and keeps public roads and the owner's name.
    - The report counts anything owned that borders someone, skips residence sentences, and keeps only other people.
  - **Pinned by a test:** "the Landholdings view and relation evidence keep their own land-clause rules" in `index-app.test.mjs`. It covers a garden in the residence sentence, a vineyard bordering a road and the owner's own name, and a mill.
  - **Supporting change:** `landNeighborNames` is now exported from `CatastoRelations` so that test can reach it.

### L3 — Page attribution is ambiguous when openings repeat

**RESOLVED.**

Confirmed. Each opening was found with `indexOf` from the start of the entry, so two identical openings landed on the same position.

- **What changed:** `pageParts` now trusts the recorded page breaks only when every opening occurs exactly once in the entry and the openings are in page order. Otherwise it cites the whole entry with all its pages, the fallback D10 already chose.
- **Test:** `catasto-name-index.test.mjs`. In Codex's example, pages 2 and 3 open with the same sentence, so Carlo Rossi is cited as pages 1–3, not page 3 alone. A second case puts two openings out of order.

## INFORMATIONAL

### I1, I2

**RESOLVED** (Codex agrees). This round adds no request handling beyond stricter number checks.

## Summary of files changed this round

- `project_store.py`: `finite_float` for `loads`; `is_number` with the 2^53 integer limit; `add_all` refuses while an import journal remains.
- `serve.py`: `send_json` uses the strict `dumps`; the unused `json` import is removed.
- `catasto-parser.js`: `PARSER_VERSION` 7.
- `catasto-name-index.js`: `pageParts` requires unique, ordered openings; `refusalFor` and the refusal in `collectMentions`.
- `admin.js`: the Name Index dialog shows the refusal and disables the exports; export clicks report errors.
- `app.js`: unused `view.x/y/scale` removed.
- `catasto-relations.js`: `landNeighborNames` exported, for the D13 test.
- Tests:
  - `test_serve.py`: 3 tests.
  - `catasto-records.test.mjs`, `catasto-name-index.test.mjs`, `admin.test.mjs` and `index-app.test.mjs`: 1 test each.
- Docs:
  - `ARCHITECTURE.md`: number checks, import refusal, page anchors, index refusal, parser version, and the D13 land-clause rules.
  - `HUMAN_DECISIONS.md`: D13.
  - `HANDOFF.md`: test counts.

STATUS: RESOLVED
