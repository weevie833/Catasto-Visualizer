# Response to CODEX_REVIEW.md

Reviewed against the current Catasto Visualizer source. No changes were committed or pushed. Existing edits to `HANDOFF.md` and the two audit files were preserved.

## High

| Finding | Status | Evaluation and action |
|---|---|---|
| H1 — divergent parsers | HUMAN_DECISION_REQUIRED | Confirmed: Admin and the visualizer use different parsing pipelines. Consolidation would choose canonical names and IDs and affect existing imports. D1 must settle those choices first. |
| H2 — destructive load-time migrations | HUMAN_DECISION_REQUIRED | Confirmed: boundary rebuilds, correction updates, and identity recalculation can replace manual work. A snapshot alone does not settle which fields are authoritative or how backups are retained. D2 is required before changing migration behavior. |
| H3 — malformed import | HUMAN_DECISION_REQUIRED | Confirmed: `validateData` accepts a household with missing fields. The new `memberLines` guard prevents the cited `.split` crash, but full schema validation or repair could reject older exports or change their data. Decide the supported exchange schema and legacy import policy before enforcing it. |

## Medium

| Finding | Status | Evaluation and action |
|---|---|---|
| M1 — network-facing dev server | RESOLVED | README now binds the server to `127.0.0.1` and explains why port 8000 matters. Files: `README.md`. |
| M2 — unstable record IDs | HUMAN_DECISION_REQUIRED | Confirmed. Permanent IDs require an exchange-format migration and a decision about version-1 imports (D3). |
| M3 — lost member source lines | RESOLVED | Identity generation now carries each member line into `source_line`; recalculation can restore it from `members_text`. Files: `index.html`. |
| M4 — source editor name and failed-save state | RESOLVED | The editor uses `memberPersonName` and edits a cloned project, replacing the active copy only after saving succeeds. Files: `index.html`. |
| M5 — cross-tab overwrite | HUMAN_DECISION_REQUIRED | Confirmed. Optimistic locking would need conflict handling in every editor and migration path; reloading could discard unsaved state, while merging has different tradeoffs. |
| M6 — merge references and evidence | HUMAN_DECISION_REQUIRED | Confirmed. Recalculation currently discards merged neighbor evidence; fixing references safely depends on D2's policy for preserving manual fields and merge history. |
| M7 — corrections fetch blocks unrelated projects | RESOLVED | The corrections file is fetched only when the default or an existing Marano project needs it. Existing projects continue to load if it is unavailable; creation of a new default project waits for its corrections to avoid applying them later over new edits. Files: `index.html`. |
| M8 — evictable browser storage | HUMAN_DECISION_REQUIRED | The browser can evict IndexedDB. A persistence request changes browser permission behavior, and export reminders and retention need D2's backup policy. |
| M9 — inconsistent duplicated helpers | HUMAN_DECISION_REQUIRED | Confirmed. The visualizer's public-anchor check now uses word boundaries, avoiding `Rivera`-style false matches. Full helper consolidation depends on the canonical-parser decision D1. Partial file: `index.html`. |
| M10 — limited application tests | HUMAN_DECISION_REQUIRED | Confirmed. The suggested extraction of the inline application into ES modules is a material architecture change; its test and lint strategy should follow D1 and D2. |

## Low

| Finding | Status | Evaluation and action |
|---|---|---|
| L1 — dead code and workflow | HUMAN_DECISION_REQUIRED | Confirmed. Removed the unused embedded dataset and unreachable layout helpers from `index.html`. The upload, review, and prompt workflow remains pending D4. |
| L2 — unescaped attribute | RESOLVED | Escaped the household ID before inserting it into the `data-id` attribute. Files: `index.html`. |
| L3 — no CSP | HUMAN_DECISION_REQUIRED | Confirmed. The proposed CSP requires moving the large inline application script and testing module loading, a material architecture change tied to M10. |
| L4 — blocked localStorage | RESOLVED | Preference reads and writes now catch storage failures and fall back without stopping the app. Files: `index.html`, `admin.js`. |
| L5 — guessed page numbers | HUMAN_DECISION_REQUIRED | Confirmed. Removing the positional fallback changes research provenance; D5 must decide how uncertain pages are represented. |
| L6 — first same-name match | RESOLVED | Ambiguous matches now return `null`, and missing person names no longer throw. Files: `index.html`. |
| L7 — Italian-only parsing | HUMAN_DECISION_REQUIRED | Confirmed: `isMemberLine` excludes `anni`. Merely adding that word would not establish whether Italian-only input is supported throughout segmentation and residence extraction. Decide the intended language support first. |
| L8 — partial imports and cancelled downloads | RESOLVED | Imported projects are added in one IndexedDB transaction; synchronous transaction errors abort it. Object URLs remain valid for 60 seconds after download starts. Files: `catasto-storage.js`, `admin.js`. |
| L9 — 3D recovery and localization | HUMAN_DECISION_REQUIRED | Confirmed. Rebuilding after WebGL context restoration and choosing complete translation behavior require coordinated scene lifecycle changes and browser validation. |
| L10 — stale documentation | RESOLVED | Updated the server instructions, test command/count, Python dependency, parser ownership, and pushed commit reference. Files: `README.md`, `HANDOFF.md`, `ARCHITECTURE.md`, `requirements.txt`. |

## Informational

| Finding | Status | Evaluation and action |
|---|---|---|
| I1 — licensing and source content | HUMAN_DECISION_REQUIRED | Confirmed. D6 must determine licensing and whether the transcription and DOCX files may remain in the repository. |
| I2 — vendored dependencies | DISAGREE | The dependency inventory is correct; I disagree with treating the absence of a checksum or upgrade procedure as a present code-integrity defect. The browser loads fixed repository files, with no package installation or runtime third-party download. A checksum for those same tracked files would not add an independent trust boundary: Git already identifies their contents, and an attacker able to alter both source and checksum could update both. A future dependency-update policy may still be useful. |
| I3 — manual cache busting | HUMAN_DECISION_REQUIRED | Confirmed. A release/cache policy is needed before changing versioning across scripts and styles. |
| I4 — no authentication | HUMAN_DECISION_REQUIRED | Confirmed and consistent with local single-user use. D6 must decide whether hosting is in scope before changing access control. |
| I5 — no outbound data flow | DISAGREE | The observation is accurate; I disagree with treating it as a finding requiring a correction. The cited `fetch` calls use same-origin project files, while the prompt feature only creates local text. There is no network submission path to remove or repair. |
| I6 — diagnostics and lint suggestion | HUMAN_DECISION_REQUIRED | Confirmed: there is no configured linter or CI. Adding the suggested lint and module workflow depends on the M10 architecture decision. |

## Validation

- `node --test *.test.mjs`: 21 passed, 0 failed.
- `node --check` for `admin.js`, `catasto-storage.js`, `scene3d.js`, and the extracted inline script: passed.
- `git diff --check`: passed.
- A case-insensitive search of the entire project directory, including hidden files, binary files, and Git internals, found no reference to the incorrect workspace name.

## Decisions required

| Finding | Decision | Options and important tradeoffs |
|---|---|---|
| H1 | Choose the canonical parser and the treatment of existing Admin-created projects. | **Use the visualizer parser**: retains its more complete residence extraction, but changes Admin output and some head names/IDs. **Use the Admin parser**: one simpler implementation, but loses currently extracted detail. **Keep both with an explicit distinction**: preserves output but keeps divergent projects and maintenance cost. Existing projects can be left alone, offered an opt-in reparse, or migrated; automatic reparse may overwrite manual work. |
| H2 | Define which data is user-owned and how migration snapshots are kept. | **Preserve manual fields and retain snapshots inside IndexedDB**: recoverable but grows the only browser-local store. **Require or offer an export before migration**: external backup, but download can be missed or cancelled. **Skip automatic migration and require opt-in**: protects edits but leaves older project data until reviewed. Also decide whether corrections can modify imports that share the default filename. |
| H3 | Set the supported import schema and policy for older or incomplete exports. | **Reject malformed records**: prevents broken projects but may make older backups incompatible. **Repair missing fields on import**: accepts more backups but may silently invent or discard meaning. **Version the schema and offer explicit conversion**: reviewable, with more code and maintenance. Size and count limits also need values that accommodate legitimate research files. |
| M2 | Choose permanent household identifiers and version-1 exchange support. | **Opaque permanent IDs with a migration**: stable references, but links and duplicate decisions need careful conversion. **Keep name-derived IDs and repair references after edits**: preserves format but cannot make IDs reliably stable. Version-1 imports can remain supported through conversion or be rejected, trading compatibility against implementation complexity. |
| M5 | Choose cross-tab conflict behavior for whole-project writes. | **Optimistic version check with a visible conflict and reload**: prevents silent overwrite but can strand unsaved edits. **Broadcast updates and refresh other tabs**: smoother when idle, but simultaneous edits still need conflict handling. **Merge field-level edits**: preserves more work but requires more complex semantics, especially for migrations and merges. |
| M6 | Decide how merged evidence and references survive recalculation, and how much history to retain. | **Store manual neighbor evidence separately and redirect references on merge**: preserves research edits but adds schema and migration work. **Recompute all links from source text**: simpler, but loses manual and merged evidence. Full-record history can be unlimited for complete undo or capped/exported to limit IndexedDB growth. This depends on H2. |
| M8 | Choose browser-storage and backup policy. | **Request persistent storage**: may reduce eviction where supported, but can expose a permission/status flow and is not a backup. **Export reminders or last-export tracking**: keeps control with the user but can be ignored. **Automatic local snapshots**: easier recovery but consumes the same potentially evictable storage. This depends on H2. |
| M9 | Decide whether shared parsing helpers must follow the canonical parser. | **Consolidate helpers with H1**: consistent identity and anchor handling, but can change imported and displayed links. **Keep separate helpers with compatibility tests**: limits immediate changes but preserves divergence. The narrow false-positive anchor match was already corrected. |
| M10 | Decide whether to extract the inline application into modules as part of the audit. | **Extract modules and add fixture-based tests/lint**: improves test access but changes script loading and dependency boundaries. **Keep the inline script and test browser workflows**: less refactor risk, but harder to isolate logic. Parser and migration decisions should precede test fixtures. |
| L1 | Decide whether the unreachable upload, review, and prompt workflow remains a product feature. | **Remove it**: reduces code and UI maintenance but loses the review flow. **Move it into Admin**: restores the workflow but requires UI and data-flow design. Dead sample data and layout helpers were removed independently. |
| L3 | Choose the script-loading and CSP strategy. | **Move inline scripts to files and set a restrictive CSP**: stronger injection defense, with module-loading and browser-compatibility work. **Keep inline scripts with a hash-based CSP**: less refactoring but hashes must be updated on every release. **Defer CSP**: no loading changes now, but less defense if later rendering code introduces injection. |
| L5 | Decide whether an unmatched source page may be inferred by record position. | **Leave page unknown**: avoids unsupported provenance, but loses potentially useful location hints. **Keep the positional fallback and label it inferred**: offers a lead without presenting it as certain, but may still attach the wrong page. |
| L7 | Define whether Italian-only source text is supported input. | **Support it fully**: requires Italian entry segmentation, residence extraction, and fixtures; accepting `anni` alone is insufficient. **Document English-only support**: predictable parsing, but Italian-only sources cannot be imported directly. |
| L9 | Choose the 3D recovery and localization scope. | **Recreate renderer resources on WebGL restoration and localize all scene strings**: restores the view after context loss, but needs browser and graphics-lifecycle testing. **Show a reload action after context loss and fix strings incrementally**: simpler, but interrupts the user's view and leaves temporary mixed-language UI. The first-data focus race can be handled in either path. |
| I1 | Decide repository licensing and source-document rights. | **Add a license matching the footer and retain documents** if rights permit: clearer terms, with source exposure if published. **Remove or segregate documents**: less exposure, but reduced reproducibility. Rights and publishing intent must be confirmed. |
| I3 | Choose release cache policy for static assets. | **Version all referenced scripts/styles on each release**: reliable refresh, but manual bookkeeping. **Use content-hashed names or a build step**: reliable and automatic, but changes the no-build architecture. **Rely on HTTP revalidation**: simplest, with possible mixed-version loads under some cache settings. |
| I4 | Decide whether hosting beyond loopback is a supported deployment. | **Local-only**: document and preserve the current single-user design. **Hosted use**: requires authentication, authorization, storage isolation, and infrastructure choices; exposing the current app as-is would expose every project on that origin. |
| I6 | Decide whether CI/lint infrastructure belongs in this change. | **Add ESLint and CI now**: catches more issues, but introduces tooling and configuration. **Add them after M10's module split**: cleaner rules, but delayed coverage. **Keep local test commands only**: no new infrastructure, with weaker automatic checks. |

STATUS: HUMAN_DECISION_REQUIRED

---

# Response to CODEX_REVIEW_2.md

Only the items CODEX_REVIEW_2.md marks as automatic were changed. Nothing was committed or pushed. No human decision in
`HUMAN_DECISIONS.md` was assumed.

| Finding | Status | Action |
|---|---|---|
| L6 regression — selection jumps to the first household | RESOLVED | Saving, merging and undoing now select by stored record position (`storedRecordSelection`), not by name. `matchingUnitIdForPerson` accepts `recordIndex`. Files: `index.html`. |
| H3 part 1 — crash safety | RESOLVED | `renderableRecord` gives the display copy the field types the renderer reads; the stored project is unchanged. If a project still cannot be displayed, `showUnavailableProject` reports it, leaves the selector usable and clears it as the remembered project. Each project's load-time migration is isolated, so one failure no longer blocks the library. Part 2 (import schema policy) remains a human decision. Files: `index.html`. |
| NEW-1 — merge, undo and keep-separate mutate before save | RESOLVED | All three use the clone, save, then swap pattern already used by the source editor. Files: `index.html`. |
| M3 residual — erased `source_line` values | RESOLVED | `backfillMemberSourceLines` restores missing values from `members_text` at startup for every project, changing nothing else. Files: `index.html`. |
| L9 automatic parts | RESOLVED | Expand/Exit, parcel counts and inspector kickers use `tr()`. The initial "richest district" view now opens on the first state that contains units, whether data loads before or after the 3D module. WebGL context restoration remains a human decision. Files: `scene3d.js`. |
| M5 stale-write refusal | RESOLVED (minimal) | `saveProject` refuses to write when the stored `updatedAt` differs from the loaded copy, or when the project was deleted, unless it is saved with `{ create: true }`. The message asks the user to reload; nothing is merged. The reload/merge conflict behaviour remains a human decision. Files: `catasto-storage.js`, `admin.js`, `index.html`. |
| M10 regression tests | RESOLVED for the repaired defects | New `index-app.test.mjs` (9 tests) runs the real inline script with a stub DOM. `catasto-storage.test.mjs` gained 4 tests using an in-memory IndexedDB. The module split, lint and CI remain human decisions (I6). |

## Validation

- `node --test *.test.mjs`: 34 passed, 0 failed (was 21).
- Mutation check on a scratch copy: reverting each fix individually (name-based selection after save and after undo,
  no stale check, no record normalization, no backfill, `sourceLine: undefined`) makes the matching new test fail.
- Browser check on a separate origin (`127.0.0.1:8791`, so the port-8000 library was not touched), with no console
  errors:
  - The default project was created with `{ create: true }`.
  - The initial view opened after late data loading.
  - Italian Expand/Exit, parcel count and landholding kicker text appeared.
  - Real IndexedDB refused both a stale save and a save of a deleted project.
  - A source edit of a same-name head (`Anna Capizzano`, record 300) was stored, kept that record selected, kept
    `source_line` values, and opened duplicate review.
- `node --check` (`admin.js`, `catasto-storage.js`, `scene3d.js`) and `git diff --check`: passed.

STATUS: HUMAN_DECISION_REQUIRED (decisions D1–D6 and the deferred items in HUMAN_DECISIONS.md and above remain open)
