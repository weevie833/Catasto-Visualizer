# Catasto Visualizer — Follow-up Review (Round 2)

Reviewed: 2026-10-23. Baseline is the pre-audit checkpoint `b9bc543`. The repairs are uncommitted working-tree changes
in `ARCHITECTURE.md`, `HANDOFF.md`, `README.md`, `admin.js`, `catasto-storage.js`, `index.html` and `requirements.txt`.
Inputs: `CODEX_REVIEW.md`, `CLAUDE_RESPONSE.md`, `HUMAN_DECISIONS.md`, `git diff b9bc543`. No source code was modified.

## Verification performed

- `node --test *.test.mjs`: **21 passed, 0 failed.** The count is unchanged, so no regression tests were added for any repair.
- `node --check` on `admin.js`, `catasto-storage.js`, `catasto-parser.js`, `scene3d.js`, `building-types.js`, plus a
  `vm.Script` compile of the whole inline `index.html` script: all pass. `git diff --check`: clean.
- Behavioural harness (scratch script outside the repo). It loads the inline `index.html` functions in a Node `vm` with a
  stubbed DOM and a `localStorage` that throws on every call. Results:
  - The app script initializes even though `localStorage` throws (L4).
  - After `recalculateStoredIdentityGraph` on the Marano parse, 0 member identities have an undefined `source_line`;
    before the repair, all of them did (M3).
  - `memberPersonName("Giuseppe Covello — age 40")` returns `"Giuseppe Covello"` (M4).
  - `isPublicAnchor`: `Rivera` → false, `Paolo Road` → true (M9 partial).
  - `{"households":[{}]}` and a record without `source_entry` **still throw** in `buildHouseholds`
    (`detectAssets` → `toLowerCase`) and `buildLandholdings` (`sentenceList` → `replace`) (H3).
  - The Marano data has **22 groups of household heads that share a name**. For those names,
    `matchingUnitIdForPerson(name)` now returns `null`, so `useData` falls back to `households[0]` (L6 regression).
- Dead code: `EMBEDDED_DATA`, `residenceLinks`, `adjacencyOrderedRecords`, `connectedRecordComponents`,
  `hexPositionComponent`, `layoutRecordGroup`, `displayMembers` and the undefined `NEIGHBOR_OFFSETS` references are all
  gone. `index.html` went from 514,783 to 144,535 bytes.
- `HUMAN_DECISIONS.md` is unchanged from the first review. **No human decision has been recorded**, so no
  decision-dependent change could be checked against a decision. All the repairs made fall within the automatic
  category, as required.

---

## Status of prior findings

| ID | Prior severity | Status |
|---|---|---|
| H1 Divergent parsers | High | HUMAN_DECISION_REQUIRED |
| H2 Destructive migrations | High | HUMAN_DECISION_REQUIRED |
| H3 Malformed import breaks visualizer | High | **STILL_OPEN** (crash safety) + HUMAN_DECISION_REQUIRED (schema policy) |
| M1 Dev server bound to all interfaces | Medium | RESOLVED |
| M2 Unstable record IDs | Medium | HUMAN_DECISION_REQUIRED |
| M3 `source_line` erased | Medium | RESOLVED (residual note) |
| M4 Editor head name / mutate-before-save | Medium | RESOLVED for the editor (see NEW-1 for the other write paths) |
| M5 Cross-tab last-write-wins | Medium | HUMAN_DECISION_REQUIRED |
| M6 Merge leaves dangling references | Medium | HUMAN_DECISION_REQUIRED |
| M7 Corrections fetch blocks all projects | Medium | RESOLVED |
| M8 Evictable storage | Medium | HUMAN_DECISION_REQUIRED |
| M9 Duplicated helpers diverge | Medium | HUMAN_DECISION_REQUIRED (narrow fix verified) |
| M10 Insufficient tests | Medium | **STILL_OPEN** |
| L1 Dead code | Low | HUMAN_DECISION_REQUIRED (automatic part resolved) |
| L2 Unescaped `data-id` | Low | RESOLVED |
| L3 No CSP | Low | HUMAN_DECISION_REQUIRED |
| L4 `localStorage` failure | Low | RESOLVED |
| L5 Positional page fallback | Low | HUMAN_DECISION_REQUIRED |
| L6 First same-name match | Low | **REGRESSION_INTRODUCED** |
| L7 Italian-only parsing | Low | HUMAN_DECISION_REQUIRED |
| L8 Non-atomic import / revoked download URL | Low | RESOLVED |
| L9 3D recovery, localization, startup race | Low | HUMAN_DECISION_REQUIRED (parts are automatic, see below) |
| L10 Stale documentation | Low | RESOLVED |
| I1 Licensing / source documents | Info | HUMAN_DECISION_REQUIRED |
| I2 Vendored dependencies (DISAGREE) | Info | RESOLVED — disagreement accepted |
| I3 Manual cache busting | Info | HUMAN_DECISION_REQUIRED |
| I4 No authentication | Info | HUMAN_DECISION_REQUIRED |
| I5 No outbound data flow (DISAGREE) | Info | RESOLVED — disagreement accepted |
| I6 No lint/CI | Info | HUMAN_DECISION_REQUIRED |

---

## Detail on resolved findings

- **M1:** `README.md:74` now runs `python3 -m http.server 8000 --bind 127.0.0.1` and explains why the port matters.
- **M3:** `householdMemberIdentities` now returns `sourceLine: line` (`index.html:1343`). Residual note: the stored
  Marano project already has `identity_resolution_version` 4, so `refreshProjects` (`index.html:2847`) does not
  recalculate it. Its already-erased `source_line` values are restored only after the next source edit triggers a full
  recalculation. Until then those values stay undefined in IndexedDB and in exports. A one-time backfill (bump the
  version or check for undefined values) would close this. Claude can do this automatically.
- **M4:** `saveSourceEntry` (`index.html:3063`) uses `memberPersonName`, edits a `structuredClone` copy, and replaces
  `activeProject` only after `saveProject` resolves. Verified by reading the code and with the harness.
- **M7:** The corrections file is fetched only when the library is empty or contains a Marano project. A failed fetch
  logs a warning and existing projects still load. First-run creation still requires the file, which is a reasonable,
  documented choice.
- **L2:** `data-id="${escapeHtml(household.id)}"`.
- **L4:** `storedPreference`/`savePreference` wrappers in `index.html` and `admin.js`. Verified with a throwing
  `localStorage`.
- **L8:** `saveImportedProjects` (`catasto-storage.js:114`) adds every imported project with `store.add` inside one
  transaction, and a synchronous throw now aborts that transaction. The object URL is revoked after 60 s.
- **L10:** Test command and count, server binding, `python-docx` in `requirements.txt`, and parser ownership in
  `ARCHITECTURE.md` are now accurate.
- **I2, I5 (DISAGREE):** Claude's reasoning is accepted. Both were informational observations with no defect. A checksum
  committed beside vendored files tracked by Git adds no independent trust boundary, and there is no outbound flow to fix.

---

## Unresolved findings

### H3 — STILL_OPEN (crash safety) / HUMAN_DECISION_REQUIRED (schema policy)

- **Files:** `catasto-storage.js:66` (`validateData`), `index.html:1285` (`detectAssets`), `index.html:1377`
  (`sentenceList`), `index.html:2793` (`activateProject`).
- **Technical reason:** Guarding `memberLines` alone does not stop the crash. A record without `source_entry` still throws
  in `detectAssets(record.source_entry)` (household view) and `sentenceList(record.source_entry)` (landholding view).
  Reproduced. Because the imported project becomes the remembered active project, the visualizer fails on every load
  until the project is deleted in Admin.
- **Recommended correction:** Split the finding into two parts:
  1. **Crash safety (automatic, no policy needed):** coerce the text fields the renderer reads (`source_entry`,
     `members_text`, `household_head`) to strings at the point of use. Wrap project activation in a try/catch that
     reports the error, clears the remembered project, and leaves the selector usable. This changes no stored data and
     no import policy.
  2. **Schema policy (human):** reject, repair or convert malformed and legacy records, and set size and count limits.
- **Claude can address automatically:** Yes, for part 1. **Human judgment required:** Yes, for part 2 only. Claude's
  response deferred the whole finding to a human decision. Part 1 does not depend on that decision.

### H1, H2, M2 — HUMAN_DECISION_REQUIRED

No change since the first review, and no decision recorded in `HUMAN_DECISIONS.md` (D1, D2, D3). The `ARCHITECTURE.md`
wording now accurately describes the two parsers. **Claude can address automatically:** No. **Human judgment required:** Yes.

### M5 — HUMAN_DECISION_REQUIRED

- **Files:** `catasto-storage.js` (`saveProject`), `index.html` write paths.
- **Technical reason:** The problem is unchanged. Cloning in the editor does not prevent one tab overwriting another.
- **Reassessment:** The choice of conflict behaviour does reasonably belong to a human. One step is safe regardless of
  that choice: refuse a write when the stored `updatedAt` is newer than the copy being saved, and show an error. Data is
  never silently lost, and nothing is merged.
- **Claude can address automatically:** That stale-write refusal only. **Human judgment required:** Yes, for reload or
  merge behaviour.

### M6, M8, M9 — HUMAN_DECISION_REQUIRED

Classification accepted. All three depend on D1 or D2. The narrow M9 change (word-boundary public-anchor match,
`index.html:1277`) is verified. It still differs from `catasto-parser.js:51`, which uses an exact match.

### M10 — STILL_OPEN

- **Files:** `*.test.mjs`.
- **Technical reason:** Eight repairs landed (M3, M4, M7, L2, L4, L6, L8, plus the dead-code removal) and the test count
  is still 21. None of the fixed defects has a regression test. Claude deferred the finding on the grounds that tests
  require extracting modules first. That is not true: the inline functions can be loaded in a Node `vm` with a stubbed
  DOM, as this review's harness did, in the same way the existing tests already load `catasto-parser.js` and
  `catasto-storage.js`. The missing test also allowed the L6 regression below to ship unnoticed.
- **Recommended correction:** Add `vm`-based tests for at least: `source_line` preservation after recalculation;
  `memberPersonName` head derivation in the editor path; save failure leaving `activeProject` unchanged; same-name
  selection after save, merge and undo (L6); crash safety for records with missing fields (H3 part 1); atomic
  `saveImportedProjects` rollback (with an IndexedDB shim such as `fake-indexeddb`, or a stubbed store).
- **Claude can address automatically:** Yes. **Human judgment required:** No. The module split and lint/CI (I6) remain
  separate decisions.

### L6 — REGRESSION_INTRODUCED

- **Files:** `index.html:1748` (`matchingUnitIdForPerson`), with callers at `index.html:3019`, `3046` and `3108`.
- **Technical reason:** The name-only fallback now returns `null` when several heads share a name. Correct as a rule, but
  three callers still pass only a **name**: save source entry, merge, and undo. For any of the 22 same-name groups in the
  Marano data, `useData` then selects `households[0]` (currently Angelo Chiappetta). The user is moved away from the
  record they just edited, merged or restored, and the source panel and **Edit** button now point at an unrelated
  household. This happens most often in duplicate review, because by definition the edited record has a namesake there.
  Before the repair, the first namesake was selected, which was at least the right name.
- **Recommended correction:** Pass the record's identity instead of its name:
  `useData(projectScopedData(activeProject), { householdId: \`${activeProject.id}-${record.id}\`, name: record.household_head })`.
  Apply the same pattern to merge (canonical record) and undo (restored duplicate). Add a regression test (M10).
- **Claude can address automatically:** Yes. **Human judgment required:** No.

### L1, L3, L5, L7 — HUMAN_DECISION_REQUIRED

Classifications accepted. L1: the automatic part (dead data and layout helpers) is verified as removed. The
upload/review/LLM workflow remains, pending D4.

### L9 — HUMAN_DECISION_REQUIRED (partially automatic)

- **Files:** `scene3d.js` (context-loss handler, `toggleExpanded`, `applyScope`, inspector kicker, start-up focus block).
- **Reassessment:** The WebGL context-restore approach is a reasonable decision for a human. Two parts are not: the
  hard-coded English strings (`Exit expanded`/`Expand`, `parcel`/`parcels`, inspector kicker) and the start-up race
  (initial focus runs only if data arrived before the module). Both have one obvious fix: use `tr()`, and focus on the
  first `catasto:change` that contains units.
- **Claude can address automatically:** The strings and the race, yes. **Human judgment required:** For the
  context-restore approach only.

### I1, I3, I4, I6 — HUMAN_DECISION_REQUIRED

Classifications accepted. No decision recorded.

---

## New findings

### NEW-1 (LOW) — Merge, undo and keep-separate still change data before the save succeeds

- **Files:** `index.html:2982` (`mergeDuplicateRecords`), `3027` (`undoDuplicateMerge`), `3050` (`keepDuplicateSeparate`).
- **Technical reason:** M4 fixed this pattern only in the source editor. These three functions still change
  `activeProject.data` in place (splice records, append `merge_history` and `duplicate_decisions`) before
  `await CatastoStorage.saveProject`. If the save fails (quota, blocked storage, closed database), the screen and the
  in-memory project hold a merge that was never stored, and the next successful save from any path writes it anyway.
- **Recommended correction:** Use the editor's clone, save, then swap pattern in all three functions.
- **Claude can address automatically:** Yes. **Human judgment required:** No.

### NEW-2 (INFORMATIONAL) — Deferred decisions are not recorded in `HUMAN_DECISIONS.md`

- **Files:** `HUMAN_DECISIONS.md`, `CLAUDE_RESPONSE.md`.
- **Technical reason:** `CLAUDE_RESPONSE.md` moved eleven more findings to human decisions (H3, M5, M6, M8, M9, M10, L3,
  L7, L9, I3, I6, beyond the original D1–D6) and lists their options in its own table. `HUMAN_DECISIONS.md` was not
  updated and has no answers recorded. The decision list is therefore split across two files, and there is no
  authoritative record against which later repairs can be checked.
- **Recommended correction:** Merge the open decisions into `HUMAN_DECISIONS.md` (dropping the parts this review marks
  as automatic), with a field for the chosen option and date.
- **Claude can address automatically:** Claude can consolidate the document. **Human judgment required:** Yes, to make
  the decisions.

---

## Summary

The repairs that were made are correct and introduced no security issue: escaping is intact, there are no new network
flows, and import is now atomic. All tests and syntax checks pass. One repair (L6) introduced a user-visible regression,
because callers still select records by name. One high finding (H3) is only partly mitigated, and the crash is still
reproducible. No regression tests were added. Six original decisions and several newly deferred items still need a
human answer, and none has been recorded.

Automatic next steps for Claude: L6 regression, H3 crash safety, NEW-1, M10 regression tests, the M3 backfill, the
automatic parts of L9, and the M5 stale-write refusal. Everything else waits on `HUMAN_DECISIONS.md`.

OVERALL STATUS: HUMAN_DECISION_REQUIRED
