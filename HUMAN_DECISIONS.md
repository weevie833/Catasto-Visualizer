# Human decisions — independent repository review

Reviewed: 2026-11-12. Related findings are in `CODEX_REVIEW.md`. No decisions below were assumed approved and no application fixes were applied.

## Open decisions

### D10 — Authoritative source and provenance after merging and editing

**Findings:** H3, M1, L3.

A merged record has both a composite `source_entry` and constituent `source_entries`. Editing updates only the composite; later merges prefer the old constituents. Exports also miss later member blocks and can lose precise page attribution.

**Decision needed:** How should edits to a merged record be represented while preserving original evidence and citations?

- **Recommended:** Keep original source entries immutable, with editable corrected versions per constituent entry and explicit page provenance. Generate the composite from corrected constituents. Reconcile repeated member appearances while preserving distinct same-name people.
- **Simpler alternative:** Treat the edited composite as authoritative, retain original entries as archival evidence only, and label page-level attribution as uncertain until reviewed. Subsequent merges must use the authoritative corrected composite.

The implementation must preserve saved corrections under either policy. Do not silently rewrite archival text or discard people. Error detection and regression tests can proceed before this choice; provenance migration cannot safely be inferred.

**Status:** Decided 2026-11-12 by the user: neither option. **The merge feature is removed.** The app is not an authoring or correction platform; to audit entries, the user exports an index, corrects the source transcript, and imports it again. Records merged by an earlier version are still read (reparse matching and id conversion keep their data), but no new merge can be made. The user's saved library contains no merged records. The single-entry source editor stays (decided the same day); an export whose recorded page break no longer matches the edited text cites all of the entry's pages rather than a wrong one. See `CLAUDE_RESPONSE.md` (H3, M1, L3).

### D11 — Durability promised after a successful save

**Finding:** M7.

Current rename/journal logic helps with interrupted processes but does not synchronize files and directories to establish power-loss durability.

**Decision needed:** Does a successful save promise survival of an OS crash/power loss, or only consistent recovery after application-process interruption?

- **Recommended:** Require durable acknowledged saves. Choose a transactional store with explicit durability settings, or implement and verify the necessary synchronization sequence for the supported operating systems. Preserve portable JSON exports and existing snapshots.
- **Alternative:** Explicitly limit the guarantee to process-interruption recovery, document the power-loss limitation and backup expectations, and avoid broader crash-safe claims.

No power-loss experiment was run. The decision concerns the documented contract and implementation approach, not permission to modify real projects during testing.

**Status:** Decided 2026-11-12 by the user: **Option A, durable acknowledged saves.** Implemented by flushing files and folders in a fixed order (`F_FULLFSYNC` on macOS); no storage engine change, JSON files and exports unchanged. See `CLAUDE_RESPONSE.md` M7.

### D12 — Development dependency advisory (minimatch, via ESLint)

**Finding:** M6.

ESLint 10 depends on minimatch 10.x, which is affected by GHSA-g3hv-75wg-m249 (crafted glob patterns can use excessive CPU and memory; fixed in minimatch 11.0.1). As of 2026-11-12, no ESLint release depends on a fixed minimatch.

**Status:** Decided 2026-11-12 by the user: **accept and wait.** ESLint is a development tool only, never shipped or run with the app, and its glob patterns are fixed in `eslint.config.mjs`, so a crafted pattern cannot reach it. No dependency is downgraded or overridden. When an ESLint release depends on minimatch 11.0.1 or later, update ESLint and `@eslint/js`, then rerun `npm audit`, lint and the tests. Revisit sooner if lint ever takes patterns from outside the repository.

### D13 — Land-clause rules in the Landholdings view and the Adjacent Evidence report

**Finding:** L2.

`app.js` (`isLandholdingSentence`, `parseLandholdings`) and `catasto-relations.js` (`landNeighborNames`) read English land clauses by different rules. Unifying them would change the parcels drawn or the evidence ranked.

**Status:** Decided 2026-11-12 by the user: **keep the rules separate and document them.** The view draws land parcels; the report collects other people who border land. The differences, recorded in ARCHITECTURE.md and pinned by a test in `index-app.test.mjs`, are intended. Italian clauses already share the parser's rules in both.

## Existing decisions retained

These are reconstructed from the prior decision file, `CLAUDE_RESPONSE_2.md`, `CLAUDE_RESPONSE_3.md`, `CLAUDE_RESPONSE_4.md`, and current architecture documentation. They are historical decisions, not newly requested approvals.

- **D1:** Private project files, no access token; one trusted OS user runs the server. Revisit before shared/untrusted-computer or remote deployment.
- **D2:** Ask before reparsing; preserve user edits, keep the latest snapshot, label inferred pages, and remove project-specific load-time migrations.
- **D3:** Use the shared parser and offer reviewed reparsing to existing projects.
- **D4:** Permanent household IDs; convert legacy imports with a report.
- **D5:** Repair imports with a report before saving; cap each project at 50 MB.
- **D6:** Remove the obsolete Visualizer upload/review/LLM-prompt workflow; use Admin for ingestion.
- **D7:** Keep a separate private previous-version snapshot, capped at 50 MB separately from the project.
- **D8:** Allow exact legacy-snapshot download and restore through reviewed repair of a copy.
- **D9:** Export the previous version with a project and restore it during import.

The other review corrections can be implemented under these established requirements. Dependency remediation must be compatibility-tested; npm's suggested downgrade is not itself a decision or a fix. Private source fixtures must not be published to obtain test coverage.

OVERALL STATUS: CHANGES_REQUIRED
