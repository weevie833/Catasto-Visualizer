# Catasto Visualizer — Independent Code and Security Review

Reviewed: 2026-10-23, commit `b9bc543` (`main`, `HANDOFF.md` modified locally).
Scope: the entire tracked repository, not only recent changes. No source code was modified.

## Method

- Read all application code: `index.html` (inline application script, lines 913–3495), `admin.html`, `admin.js`,
  `catasto-parser.js`, `catasto-storage.js`, `building-types.js`, `scene3d.js`, `scene3d.css`, tests, docs,
  `marano-residence-corrections.json`, `extract_page_5_13_households.py`. Vendored Three.js r170 was checked for version only.
- `node --test *.test.mjs` (Node 23.1.0): **21 tests, 21 pass, 0 fail.**
- No linter or static-analysis configuration exists in the repository. None was installed.
- Scan of tracked text files for credentials (API keys, tokens, passwords): **none found.**
- Differential diagnostic (scratch script, run in a Node `vm` sandbox): the same source file
  `MM 1754 Catasto Onciario Transcription 300.md` was parsed by both parser pipelines in the code base:

  | Metric (362 households each) | App pipeline (`index.html`) | Admin pipeline (`catasto-parser.js`) |
  |---|---|---|
  | Households with no residence place | 20 | **288** |
  | Household-head names that differ | — | 14 (e.g. `Giuseppe Beratta` vs `Giuseppe Beratta of the Land of Figline`) |
  | Households with different residence neighbors | — | 39 |
  | Resolved residence links | 238 | 218 |

- The same harness confirmed that `recalculateStoredIdentityGraph` sets every `member_identities[].source_line` to `undefined`
  (finding M3), and that the source-entry editor takes `Giuseppe Covello — age 40` as the household-head name (finding M4).

Context: this is a single-user, local, static web app with no server, accounts or network API. Its live data exists only
in the browser's IndexedDB. Data-integrity findings therefore carry more weight than conventional web-security findings.

---

## CRITICAL

No critical findings.

---

## HIGH

### H1. Two separate parser pipelines produce substantially different project data

- **Files:** `index.html:2245–2675` (the app's own `isMemberLine`, `splitEntries`, `parseResidence`, `expandNeighborNames`,
  `linkResidenceAdjacency`, `triangulateResidenceAdjacency`, `parsePlainText`); `catasto-parser.js:11–384`
  (a second copy of the same pipeline); `admin.js:83, 116` (Admin uses only `CatastoParser.parsePlainText`).
- **Description:** The default Marano project is created with the parser inside `index.html`. Projects created or imported
  as text through Admin use `catasto-parser.js`, which is an older, simpler copy. On the same source, the Admin parser
  leaves 288 of 362 residences blank (the app leaves 20), produces 14 different household-head names, and resolves 20
  fewer neighbor links. `ARCHITECTURE.md` says `catasto-parser.js` "owns plain-text parsing", which is not how the app works.
- **Why it matters:** A user who rebuilds or shares a project from the same transcription through Admin gets a different,
  degraded dataset with no warning. Head names feed IDs, so identities differ between projects made from the same source.
  Parser fixes must be made twice, and the tests cover only the copy the visualizer does not use for the default project.
- **Recommended correction:** Keep one parser module. Move the `index.html` pipeline (the more complete one) into
  `catasto-parser.js`, have `index.html` and `admin.js` both call it, and add a regression test that parses the Marano
  source and checks fixed counts (households, blank places, resolved links).
- **Automatic or human:** **Human decision.** Someone must decide which behaviour is canonical, and whether existing
  Admin-created projects should be reparsed. See HUMAN_DECISIONS.md D1.

### H2. Load-time migrations can overwrite user corrections without a recoverable snapshot

- **Files:** `index.html:3049–3064` (`refreshProjects`), `2989–3011` (`rebuildStoredProjectBoundaries`),
  `2940–2957` (`applyMaranoResidenceCorrections`), `2896–2932` (`recalculateStoredIdentityGraph`),
  `2985–2987` (`isMaranoDefaultProject`).
- **Description:**
  - `rebuildStoredProjectBoundaries` replaces `project.data` with a fresh parse of `project.sourceText`. Source-entry
    edits, residence corrections and merges are stored in `data.households`, not in `sourceText`, so a rebuild discards
    them. A backup is kept only `if (!project.entryBoundaryMigrationBackup)`. A second future boundary migration would
    therefore keep the old 338-record backup and lose the state just before that migration.
  - `applyMaranoResidenceCorrections` runs again whenever the corrections file's `version` changes. It overwrites
    `residence.place` (and possibly `household_head`/`id`) on matching records, including places the user has since
    corrected by hand. `record.id = slugify(...)` can create an ID that collides with an existing record.
  - `recalculateStoredIdentityGraph` (also run on every source edit, `index.html:3310`) replaces each record's
    `residence.adjacent_to` with a reparse of `source_entry`. Neighbors added by merging (`index.html:3222`) or by the
    review panel are lost. For a merged record, only the first residence sentence in the combined text is parsed.
  - Migrations are selected by the string `sourceFile === "MM 1754 Catasto Onciario Transcription 300.md"`. Any project
    imported under that filename (for example a colleague's export) is migrated with Marano-specific corrections.
  - All migrations run on page load in every open tab, with no lock.
- **Why it matters:** The live research data exists only in browser storage (`HANDOFF.md`, "Known cautions"). A routine
  app update that bumps a migration or corrections version can silently undo hours of manual correction.
- **Recommended correction:** Before any migration writes, store a versioned snapshot (or force an export). Keep
  user-edited fields separate from parsed fields and re-apply them after a reparse. Skip corrections on records that
  carry `source_edited_at` or a manual place. Mark the default project with an explicit flag, not a filename. Keep a
  migration log on the project.
- **Automatic or human:** **Human decision** on migration policy (what may be overwritten, where snapshots go, how
  long they are kept). Snapshot-before-write and the `source_line` fix (M3) are safe to make automatically. See D2.

### H3. A malformed or hostile project import can stop the visualizer from loading

- **Files:** `catasto-storage.js:66–71` (`validateData` checks only that `households` is an array),
  `catasto-storage.js:131–150`, `index.html:1294–1300` (`record.members_text.split`), `index.html:3065–3069`,
  `admin.js:126–127`.
- **Description:** Any JSON file with `{"households":[{}]}` is accepted. Import then makes it the active project
  (`localStorage "catasto-active-project"`). On the next load, `memberLines` throws on the missing `members_text`. The
  rejection is caught only at the top level (`loadData`), so the 3D scene and project selector are left half-initialized.
  The page stays broken until the user finds Admin and deletes the project. Nothing checks file size, record count,
  field types, string lengths or ID format.
- **Why it matters:** README and ARCHITECTURE describe export/import "for backup or exchange with another user", so
  imported files are untrusted input. All rendering paths escape HTML, so this is not script injection, but it is a
  denial of service and a data-integrity risk.
- **Recommended correction:** Validate imported data against a schema (required string fields, arrays, ID pattern
  `^[a-z0-9-]+$`, maximum sizes), reject or repair invalid records, and put each project activation in a try/catch that
  falls back to the project list with an error message.
- **Automatic or human:** **Automatic** (validation rules follow from what the code reads).

---

## MEDIUM

### M1. The documented dev-server command exposes the whole repository, including `.git`, to the local network

- **Files:** `README.md:74` (`python3 -m http.server 8000`); `HANDOFF.md:18` correctly uses `--bind 127.0.0.1`.
- **Why it matters:** Without `--bind`, Python's server listens on all interfaces. Anyone on the same Wi-Fi can browse
  the folder, including `.git/` (full history), the `.docx` sources and the transcription. The repo is private on GitHub.
- **Recommended correction:** Use `--bind 127.0.0.1` in README, and note that the port must stay 8000 to keep the same
  IndexedDB origin.
- **Automatic or human:** **Automatic.**

### M2. Record IDs are recomputed from names and order, so stored decisions and links can point at the wrong record

- **Files:** `index.html:2908–2920` (IDs rebuilt from `slugify(household_head)` plus an occurrence counter),
  `3106–3117` (`duplicate_decisions` keyed by those IDs), `3245` (undo finds a record by ID),
  `2677–2691` (`withUniqueRecordIds` renames again at display time), `catasto-parser.js:344–347`.
- **Description:** IDs such as `giuseppe-covello-2` depend on how many earlier records share the slug. Editing a head
  name, merging, or reordering changes the IDs of unrelated records. Saved "Keep separate" decisions, merge history and
  `residence_links` all reference IDs, so they can be applied to a different pair of people. This also conflicts with
  the "stable member IDs" promise in `ARCHITECTURE.md`.
- **Recommended correction:** Give each household a permanent opaque ID (UUID) when it is first created. Keep the slug as
  a display key only, and migrate existing decisions to the permanent IDs.
- **Automatic or human:** **Human decision** (it changes the exchange format and needs a migration). See D3.

### M3. Identity recalculation erases every member's `source_line`

- **File:** `index.html:2921–2927`. `householdMemberIdentities` returns objects without a `sourceLine` property, so
  `source_line: member.sourceLine` writes `undefined`. Confirmed: after recalculation, `Angelo Chiappetta, shepherd, age 30`
  becomes `undefined`.
- **Why it matters:** Each member's provenance is lost on every source edit and on the identity migration. The Marano
  project in IndexedDB has probably already lost it.
- **Recommended correction:** Add `sourceLine: line` in `householdMemberIdentities` (`index.html:1331–1340`). Restore the
  missing values from a reparse of `members_text`.
- **Automatic or human:** **Automatic.**

### M4. The source-entry editor derives the wrong head name and changes memory before the save succeeds

- **File:** `index.html:3275–3323`.
- **Description:** `parsedMembers[0].split(",")[0]` is used where the parser uses `memberPersonName`. For a head line
  with no comma (`Giuseppe Covello — age 40`, a form the parser supports) the new head name includes `— age 40`. The record
  is then renamed, its ID changes, and the old name becomes an alias. The function also changes `activeProject` in place
  before `saveProject`. If the save fails, the screen shows edits that were never stored, and a later save from any path
  writes them anyway.
- **Recommended correction:** Use the shared `memberPersonName`. Apply edits to a cloned project and copy it to
  `activeProject` only after the save succeeds.
- **Automatic or human:** **Automatic.**

### M5. Whole-project last-write-wins across tabs

- **Files:** `catasto-storage.js:103–108` (`put` of the whole project), `index.html:3229, 3255, 3270, 3311`, `admin.js:67`.
- **Description:** Each visualizer tab keeps its own copy of the project. Saving in one tab overwrites changes made in
  another. If Admin deletes a project while a visualizer tab is open, the next save there recreates it.
- **Recommended correction:** Use optimistic concurrency: read `updatedAt` inside the write transaction and reject a stale
  write. Alternatively, broadcast changes through `BroadcastChannel` and reload.
- **Automatic or human:** **Automatic.**

### M6. Merging leaves dangling references, and source edits drop merged neighbors

- **File:** `index.html:3194–3237`.
- **Description:** The merge removes the duplicate record but does not update other records' `residence_links` that
  pointed at it. Their `household_id`/`candidate_household_ids` stay dangling until a later edit recalculates the graph.
  That recalculation then drops the merged `adjacent_to` (see H2). `merge_history` stores full copies of both records
  for every merge, so the project grows without limit.
- **Recommended correction:** Recalculate the identity graph after a merge or undo, rewrite references from the duplicate
  ID to the canonical one, and keep the merged evidence in a field the recalculation preserves.
- **Automatic or human:** **Automatic**, except the merge-history retention policy (D2).

### M7. Every project fails to load if the Marano corrections file is unavailable

- **File:** `index.html:3049–3050`. `loadMaranoResidenceCorrections()` runs before anything else and throws if the fetch
  fails, even when no Marano project exists.
- **Recommended correction:** Fetch the corrections only when a Marano project needs them, and continue without them if
  the fetch fails.
- **Automatic or human:** **Automatic.**

### M8. Live data can be evicted, and the only backup is a manual export

- **Files:** `catasto-storage.js` (no `navigator.storage.persist()`), README "Project Data".
- **Why it matters:** Browsers may evict non-persistent IndexedDB under storage pressure. Safari also evicts script-written
  storage after periods of inactivity. The corrected research dataset would be lost.
- **Recommended correction:** Request persistent storage at startup, show its status in Admin, and prompt for an export
  after edits (or track a "last exported" date).
- **Automatic or human:** **Automatic** for the persistence request. The backup reminder policy is part of D2.

### M9. Duplicated helpers inside the app behave differently from the parser module

- **Files:** `index.html:1270` (`isPublicAnchor` matches the substrings `river` and `road` anywhere) vs `catasto-parser.js:51`
  (exact match); `index.html:1488, 2274` (`personKey`/`normalizeName` remove `the|of|and|property|...`) vs
  `catasto-parser.js:40–49`; `slugify`/`escapeHtml` repeated in three files.
- **Why it matters:** A name containing "river" or "road" (e.g. `Rivera`, `Riverso`) is treated as a public landmark and
  dropped from residence and landholding links. Identity keys differ between the parser that stores links and the view
  that resolves them.
- **Recommended correction:** Fold these helpers into the single parser module (H1) with tests. Use word-boundary or
  exact matching for public anchors.
- **Automatic or human:** **Automatic** once D1 is decided.

### M10. Most application logic has no tests

- **Files:** test files cover `catasto-parser.js` (19 tests), `building-types.js` (6) and `catasto-storage.js` (1).
- **Description:** About 2,500 lines in `index.html` have no tests: the default-project parser, all four migrations, merge
  and undo, source editing, duplicate detection, search and reference-name extraction, identity labels, landholding
  parsing and resolution. There is no CI, no linter, and no test for IndexedDB behaviour or import validation. The logic
  is in an inline classic script, so it cannot be imported by tests.
- **Recommended correction:** Move the inline script into ES modules (`app-data.js`, `migrations.js`, `search.js`) that
  can be imported by `node --test`. Add fixture-based tests for migrations and merge/undo, and a
  `package.json` `test` script.
- **Automatic or human:** **Automatic** (refactor plus tests, no behaviour change).

---

## LOW

### L1. A large block of dead code and data ships and runs on every load

- **Files:** `index.html:914` (`EMBEDDED_DATA`: a 362 KB JSON string parsed with `JSON.parse` on every load and never
  used. It also embeds an absolute local path from the developer's computer); `index.html:1278–1292, 1324–1326, 1568–1744`
  (`displayMembers`, `connectedRecordComponents`, `hexPositionComponent`, `layoutRecordGroup` and others, which call an
  undefined `NEIGHBOR_OFFSETS`); `index.html:897–909, 3072–3081, 3409–3448` (upload modal with no opener;
  `openUploadModal` is never called); `index.html:838–859, 2706–2840, 3450–3472` (review panel and LLM prompt generator,
  reachable only from the dead upload flow); `view.x/y/scale`; the `UI_STRINGS` `upload` key.
- **Why it matters:** Slower startup, confusing maintenance, and a misleading "LLM route" UI that sends nothing anywhere.
- **Recommended correction:** Delete `EMBEDDED_DATA` and the unreachable layout helpers. Either remove the
  upload/review/LLM flow or wire it into Admin.
- **Automatic or human:** Removing `EMBEDDED_DATA` and the layout helpers is **automatic**. Whether to keep the
  review/LLM workflow is a **human decision** (D4).

### L2. An HTML attribute is written without escaping

- **File:** `index.html:2176` (`data-id="${household.id}"`). Today this is safe only because `withUniqueRecordIds`
  slugifies IDs before display. The same value is escaped elsewhere (`scene3d.js:858`).
- **Recommended correction:** Use `escapeHtml(household.id)`, or build the list with DOM APIs.
- **Automatic or human:** **Automatic.**

### L3. No Content-Security-Policy

- **Files:** `index.html`, `admin.html`. All rendering escapes correctly today, but there is no defence in depth if a
  future change adds an injection. Imported data is untrusted (H3).
- **Recommended correction:** Move inline scripts into files and add a CSP `<meta>` such as
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'`.
- **Automatic or human:** **Automatic** after the inline script is moved into modules (M10).

### L4. A `localStorage` error stops the app before it starts

- **Files:** `index.html:1000, 3024, 3065, 3363, 3369`; `admin.js:98, 127`. Browsers can throw on these calls when storage
  is blocked, and the exception happens at top-level script evaluation.
- **Recommended correction:** Wrap reads and writes in try/catch and fall back to defaults.
- **Automatic or human:** **Automatic.**

### L5. Page numbers can be assigned by position when no name matches

- **File:** `index.html:2976`. When no parsed household matches by name or alias, `backfillSourcePages` uses the
  household at the same array index. This contradicts the project rule that unresolved references stay unresolved
  rather than being assigned by guesswork.
- **Recommended correction:** Leave `source_pages` empty and mark the record "page not recorded".
- **Automatic or human:** **Human decision** (D5). This is a methodological choice.

### L6. First-match fallbacks for same-name people

- **Files:** `index.html:1504` (`bestMatchingRecord` returns `records[0]` when `sourceRecord` is missing),
  `index.html:1979–1983` (`matchingUnitIdForPerson` falls back to the first head with the same name; it also throws if
  `person.name` is undefined).
- **Recommended correction:** Return `null` for an ambiguous match, and select by the stable ID only.
- **Automatic or human:** **Automatic.**

### L7. Italian-only text cannot be parsed even though parts of the code handle Italian

- **File:** `catasto-parser.js:12` and `index.html:2246`. `isMemberLine` requires `age|aged`, while
  `inferFamilyRelationships` and the narrative keyword list handle Italian (`anni`, `figlio`, `abita`). Text with
  `— anni 35` produces zero households.
- **Recommended correction:** Accept `anni` in `isMemberLine` and add tests, or document that only English is supported.
- **Automatic or human:** **Automatic.**

### L8. Imports are not atomic, and the export download can be cancelled

- **Files:** `admin.js:126` saves projects one by one, so a failure part-way leaves a partial import.
  `admin.js:31–32` revokes the object URL straight after `click()`, which some browsers handle by cancelling the download.
- **Recommended correction:** Save every imported project in one IndexedDB transaction, and delay
  `revokeObjectURL` (e.g. `setTimeout(..., 0)`, or revoke on the next user action).
- **Automatic or human:** **Automatic.**

### L9. 3D scene robustness and localization gaps

- **Files:** `scene3d.js:1159–1163` (WebGL context loss shows a message but has no `webglcontextrestored` handler);
  `scene3d.js:1124` (hard-coded `Exit expanded`/`Expand`); `scene3d.js:765` (`parcel`/`parcels`); `scene3d.js:855`
  (English kicker text); `scene3d.js:1183–1191` (the initial "richest district" focus depends on the data loading before
  the module runs, which is a race).
- **Recommended correction:** Rebuild the scene on context restore, route all strings through `tr()`, and run the
  initial focus on the first `catasto:change` that contains data.
- **Automatic or human:** **Automatic.**

### L10. Documentation is out of date

- **Files:** `HANDOFF.md:12` (says the latest commit is `47f8896`; it is `b9bc543`), `HANDOFF.md:27` ("20 tests"; there
  are 21 across three files), `README.md:71` ("Open `index.html` in a browser"; the 3D view requires HTTP), `README.md:101`
  (test command runs only one of three files), `README.md:106–107` (`requirements.txt` "currently empty", but
  `extract_page_5_13_households.py` imports `python-docx`), `ARCHITECTURE.md:7` (H1).
- **Recommended correction:** Update the docs, add `python-docx` to `requirements.txt`, and give one test command that
  runs every test file.
- **Automatic or human:** **Automatic.**

---

## INFORMATIONAL

- **I1. Licensing and repository content.** The footer says "All rights reserved — free to download and run for personal
  use", but there is no `LICENSE` file. The repo holds about 5.5 MB of `.docx` sources and the full transcription, which
  may carry their own rights. The repo is currently **private**. See D6.
- **I2. Dependencies.** No package manager and no third-party runtime downloads. Three.js r170 and OrbitControls are
  vendored with the MIT licence. Supply-chain exposure is minimal, but there is no recorded checksum or upgrade process
  for the vendored files.
- **I3. Cache busting is manual.** `scene3d.js?v=8` and `scene3d.css?v=8` are versioned, but `catasto-parser.js`,
  `catasto-storage.js` and `building-types.js` are not. After an update, a browser may combine new and cached old modules.
- **I4. No authentication or authorization.** This is by design for a local single-user tool: anyone who can load the
  origin can read and change every project. It matters only if the app is ever hosted (see M1 and D6).
- **I5. No network data flows.** The only `fetch` calls load same-origin files (`index.html:2935, 3028`). The "LLM prompt"
  feature only builds text locally. No user data leaves the browser.
- **I6. Diagnostics.** 21/21 tests pass. No linter or type checker is configured. Suggested: ESLint (flat config,
  `eslint:recommended`) together with the module split in M10.

---

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 3 |
| Medium | 10 |
| Low | 10 |
| Informational | 6 |

The rendering code consistently escapes user and imported data, and no secrets or outbound data flows were found. The
main risks are to data integrity: two parsers that disagree, load-time migrations that can overwrite manual corrections,
identifiers that drift, a bug that erases member provenance, and live data that exists only in evictable browser storage.
Several fixes depend on decisions listed in `HUMAN_DECISIONS.md`.

OVERALL STATUS: HUMAN_DECISION_REQUIRED
