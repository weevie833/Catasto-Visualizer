# Independent repository review

Reviewed: 2026-11-12. Repository: Catasto Visualizer. HEAD: `88324866127a2a6cda977c9f3f7416232bcf067b`.

This is a fresh review of the repository, not a review of recent changes. No application source was modified and no fixes were applied. This report supersedes the previous change-set review in this file; historical response documents remain historical evidence, not proof that current behavior is correct.

## Scope and verification

The repository inventory contains 57 tracked files. Review covered the Python server and file store; every first-party JavaScript module; HTML entry points and stylesheet integration; launchers; package manifests, lockfile, lint configuration and ignore rules; test architecture and execution; documentation and previously recorded decisions. Local ignored extraction tooling and its requirements were also inspected. Local transcription/document files were inventoried as data, not treated as executable application code. Vendored Three.js r170 and OrbitControls were inspected for integration, licensing and dangerous execution sinks; this is not a line-by-line audit of the complete upstream renderer or installed development packages. Git history, live saved projects and unrelated repositories were not audited.

Diagnostics:

- `npm test`: 130 tests, **128 passed, 2 skipped, 0 failed**. The two corrected-transcription checks require `CATASTO_VALIDATION_MD`; that fixture was not supplied. No substitute transcription was presented as that fixture.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v test_serve`: **41 passed**. The initial sandbox run had 19 socket-binding errors; rerunning with authorized loopback access passed. Those initial errors were environmental, not application failures.
- `npm run lint`: **passed**.
- `.venv/bin/ruff check --no-cache .`: **passed**.
- `npm audit --ignore-scripts --json`: **4 moderate affected package entries**, all development dependencies, stemming from **one minimatch advisory**. No dependency changes were made.
- Additional deterministic probes used temporary directories and temporary VM harnesses only. They reproduced H1–H3, M1–M5 below. They did not touch the user's saved project library.
- Environment: Node v23.1.0 and Python 3.12.0 on macOS. No real-browser/WebGL, Windows, Python 3.7 runtime, power-loss, or load/stress testing was performed. Passing tests are not a security certification.

## CRITICAL

No confirmed critical findings.

## HIGH

### H1 — Version tokens can repeat, allowing stale saves and deletes

1. **Description:** `next_updated_at` compares a microsecond-resolution clock value with a stored millisecond timestamp, then truncates the result. A later instant within the same millisecond compares greater but serializes to the same token. A deterministic clock at `00:00:00.123456` produced two successive `.123Z` tokens; a stale third save was accepted and replaced the newer name.
2. **Location:** `project_store.py:75–82`, `:413–427`, `:499–506`; `test_serve.py:132–148`.
3. **Why it matters:** The application's protection against overwriting another tab's work is bypassed. Deletion and snapshot restoration also depend on this token. The existing regression test freezes the clock exactly on a millisecond boundary, missing the actual failure.
4. **Recommended correction:** Compare timestamps after normalizing to the precision actually stored, and enforce a strictly increasing stored revision; alternatively use an independent opaque revision. Test nonzero microseconds, same-millisecond updates, stale deletes/restores, and clock rollback.
5. **Automation:** **Safe automatically** under the established stale-write protection requirement.

### H2 — A second launch can recover and delete another running server's work

1. **Description:** Every `ProjectStore` constructor runs destructive recovery. `create_server` constructs the store *before* binding its port. A second double-click therefore runs recovery even when it subsequently discovers port 8000 is occupied. Locks are per-instance `threading.RLock`s, not locks shared across processes. In a temporary-store probe, constructing a second store after the first import wrote its project deleted that project; the first import then returned successfully with nothing saved.
2. **Location:** `serve.py:242–245`, `:255–264`; `project_store.py:193–205`, `:218–238`, `:290–312`, `:476–495`.
3. **Why it matters:** An ordinary second launch can treat an active transaction as a crashed one, delete imported projects or remove staged files. Servers started on different ports also share the same data directory and can bypass each other's write locks.
4. **Recommended correction:** Acquire an OS-level exclusive lock for the data directory before any permission migration, recovery or mutation. Refuse a second writer regardless of port and release the lock on shutdown. Do not run recovery merely to reopen an already-running browser session. Add subprocess tests with a paused import and staged paired update.
5. **Automation:** **Safe automatically**: enforcing one writer preserves the existing single-user design.

### H3 — Editing a merged source leaves stale evidence that later merges restore

1. **Description:** `saveSourceEntry` updates `source_entry` but leaves `source_entries` unchanged. `sourceEvidence` preferentially returns the latter; the next merge rebuilds the source from that stale array. A VM probe changed a merged record's age from 40 to 41: the displayed source contained 41, while `sourceEvidence` still returned 40.
2. **Location:** `app.js:1875–1879`, `:1900–1906`, `:1968–2005`; `catasto-records.js:266–280`.
3. **Why it matters:** A later confirmed merge silently discards a previously saved correction. Reparse matching also reads the stale constituent evidence, so the application has conflicting versions of the same source.
4. **Recommended correction:** Define one authoritative editable source representation. Preserve original evidence separately and record corrections against constituent entries, or explicitly treat a corrected merged source as a new authoritative composite. Ensure merge, export and reparse consume the same version. Add merge → edit → merge → export/reload regression tests.
5. **Automation:** **Requires human decision D10** about provenance and how a composite correction maps to its constituent entries. Do not blindly overwrite historical evidence.

## MEDIUM

### M1 — Name and XLSX exports omit members from later merged entries

1. **Description:** `memberLines` stops at the first narrative after a member block. A merged record concatenates multiple complete entries, but this exporter reads only the first block and does not fall back to combined `members_text` once it found any lines. A merged Marco Rossi example with Anna only in its second entry exported Marco alone in both formats.
2. **Location:** `catasto-name-index.js:250–258`, `:266–267`, `:369–381`; `catasto-xlsx-index.js:124–154`; `app.js:1900–1907`.
3. **Why it matters:** Exports advertised as including every person silently omit documented household members, although the Visualizer displays them.
4. **Recommended correction:** Enumerate all constituent member blocks, preserve their page provenance, and reconcile repeated appearances without losing distinct same-name people. Add merged-record fixtures for JSON/CSV/Markdown and XLSX.
5. **Automation:** **Partly automatic**: detecting and reporting omissions is safe; final reconciliation should follow **D10**.

### M2 — Failed rollback removes the journal needed to finish recovery

1. **Description:** `add_all` removes its journal in `finally`, even when a rollback unlink fails. Fault injection that failed the second write and then removal of the first project left a partial import with no journal.
2. **Location:** `project_store.py:481–495`.
3. **Why it matters:** The promised “every project or none” behavior is violated, and restarting cannot identify or undo the remaining partial import.
4. **Recommended correction:** Remove the journal only after the import completed or all rollback operations completed. Retain it and surface an actionable recovery error after any rollback failure; prevent conflicting operations on those IDs until recovery finishes. Test simultaneous write and rollback failures.
5. **Automation:** **Safe automatically** under the existing atomic-import requirement.

### M3 — Non-finite values and malformed stored data escape validation and error handling

1. **Description:** Python accepts JSON `NaN`/`Infinity`; `is_number` accepts them and serialization writes them back. A temporary-store probe persisted `NaN` in `source_pages`, producing JSON browsers cannot parse. Separately, a damaged file with `data.households: 5` raises uncaught `TypeError` from `list()`. Individual corrupt JSON reads can also raise errors outside the API's `ProjectError`/`OSError` handlers.
2. **Location:** `serve.py:137–159`, `:196–201`; `project_store.py:111–112`, `:131–133`, `:163–175`, `:178–188`, `:322–326`, `:333–369`.
3. **Why it matters:** An invalid import or API payload can create an unreadable project, and one malformed file can make the whole library fail to load rather than being isolated. The browser often reports a generic storage-unavailable message instead of the real cause.
4. **Recommended correction:** Reject nonstandard JSON constants and non-finite numbers; serialize with strict JSON semantics. Validate complete stored-file envelopes on read, isolate corrupt records as unavailable, and map expected parsing/shape failures to controlled JSON responses. Preserve corrupt originals for recovery.
5. **Automation:** **Safe automatically** for strict validation and error isolation. Deleting or irreversibly repairing existing damaged data requires the user's explicit decision for that data.

### M4 — Asynchronous project changes can leave the wrong project active

1. **Description:** `activateProject` has no request generation or cancellation check. A VM probe selected First and then Second, resolved Second first and First last, and ended with First active. Reparse review is also omitted from `isEditingProject`, allowing an Admin broadcast to replace the active project while its update dialog remains open. Save continuations assign `activeProject` after awaiting I/O without checking whether the user moved elsewhere.
2. **Location:** `app.js:1468–1497`, `:1635–1657`, `:1724–1750`, `:2013–2022`, `:2062–2066`.
3. **Why it matters:** The selector, displayed project, open review and eventual save result can disagree. A user may correct a record in a project other than the one they intended, or see an apparently unresponsive review action.
4. **Recommended correction:** Use a latest-request generation token for activation; bind each edit/review/save to project ID and revision; ignore stale display continuations. Include reparse review and pending saves in navigation/broadcast guards, and keep the selector consistent with the committed active state.
5. **Automation:** **Safe automatically** while preserving the existing rule that active edits are not replaced by library announcements.

### M5 — Unknown ages become zero in family-lead scoring

1. **Description:** `ageNumber` calls `Number(member?.age)`, turning `null` into `0`. A head with no age, compared with a same-surname 30-year-old, produced “age 30: old enough to be a parent” and increased the lead's score. The code treats the explicit string `infant` as unknown instead.
2. **Location:** `catasto-relations.js:724–727`, `:740–771`.
3. **Why it matters:** Missing evidence generates a positive genealogical clue and can promote a speculative lead's strength.
4. **Recommended correction:** Return null for missing/empty/invalid ages before conversion; treat an explicitly recorded infant consistently with the export's age-zero rule. Test missing ages for both subject and candidate.
5. **Automation:** **Safe automatically**; unknown age must not count as evidence.

### M6 — Locked development dependencies include a disclosed denial-of-service issue

1. **Description:** The lockfile pins `minimatch` 10.2.6 through ESLint. npm reports four moderate affected package entries (`minimatch`, `eslint`, `@eslint/js`, `@eslint/config-array`), all tracing to one advisory, not four independent vulnerabilities. The [maintainer advisory](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249) describes excessive CPU/memory from crafted glob patterns with optimization level 2; affected versions are 7.0.0 through versions below 11.0.1.
2. **Location:** `package-lock.json:779–796`; `package.json:10–14`; `eslint.config.mjs`.
3. **Why it matters:** Development tooling contains a vulnerable dependency. No runtime exposure or exploitation through this project's fixed lint patterns was demonstrated; npm dependencies are not shipped to the browser.
4. **Recommended correction:** Select a compatible supported lint dependency set that removes the advisory, regenerate the lockfile and rerun lint/tests/audit. Do not blindly apply npm's suggested major-version downgrade or force an incompatible transitive override.
5. **Automation:** **Safe automatically with compatibility verification**; no product behavior decision is needed.

### M7 — Atomic rename does not establish durable crash-safe transactions

1. **Description:** `atomic_write_text` closes a temporary file and renames it, with no file or directory synchronization. Paired commits depend on staged-file and journal ordering, but that ordering is not durably established before replacing files and removing journals.
2. **Location:** `project_store.py:98–108`, `:251–278`, `:481–495`; `ARCHITECTURE.md` storage/recovery guarantees.
3. **Why it matters:** Recovery tests simulate process-level exceptions, not OS crashes or power loss. After a system crash, acknowledged data or the journal/staging needed to recover it may be missing or reordered. This is a code-level durability gap, not a reproduced hardware-failure result.
4. **Recommended correction:** Decide the promised durability level. For power-loss-safe saves, synchronize file contents and directory metadata in the required order with platform-specific support, or use a transactional storage engine with explicit durability settings. Document the limits and test recovery accordingly.
5. **Automation:** **Requires human decision D11** on the durability contract and supported-platform tradeoffs.

### M8 — Test doubles miss browser behavior and important failure schedules

1. **Description:** UI tests use a minimal fake DOM and memory storage; they do not execute real browser rendering, modal behavior, CSP enforcement or WebGL. Their save stub does not model revision conflicts. The timestamp regression tests only an exact millisecond boundary. There are no subprocess recovery-interference tests, and the two larger transcription checks skip by default.
2. **Location:** `index-app.test.mjs:13–77`, `admin.test.mjs` test harness, `test_serve.py:132–148`, `catasto-name-index.test.mjs:202–205`, `catasto-xlsx-index.test.mjs:193–196`; repository root has no CI workflow.
3. **Why it matters:** All default tests and linters pass despite the independently reproduced defects. Passing fake-DOM tests cannot establish browser functionality or concurrency safety.
4. **Recommended correction:** Add focused regressions for these findings, deterministic deferred-I/O tests, subprocess recovery tests, and a real-browser smoke suite using temporary project storage. Include a distributable synthetic multilingual fixture so critical coverage is not dependent on a private source file. Run checks in CI on supported platforms.
5. **Automation:** **Safe automatically** for synthetic fixtures and targeted tests. Do not publish private transcription files to supply coverage.

## LOW

### L1 — Several storage errors have no visible recovery message

1. **Description:** Admin's initial `getProject` and export calls occur outside an encompassing error handler. Project-selection and broadcast failures in the Visualizer write to `filenameLine`, which is permanently `hidden` in the HTML. Automatic preparation failures are logged to the console while the modified in-memory project is still displayed.
2. **Location:** `admin.js:230–240`, `:261`; `app.js:1458–1464`, `:1753–1757`, `:2062–2066`; `index.html:56` (`filenameLine`).
3. **Why it matters:** Failed reads, exports or migrations can look like successful/no-op actions, leaving users unaware that changes were not persisted or why a project failed to open.
4. **Recommended correction:** Catch the entire async action, restore controls in `finally`, and show a visible status with a retry/reload path. Do not claim persisted preparation after its save failed.
5. **Automation:** **Safe automatically**.

### L2 — Duplicate parsing/display rules and stale documentation invite drift

1. **Description:** English landholding detection is duplicated between the Visualizer and relation reports with different inclusion rules. Name/title/surname helpers also diverge across parser, Visualizer and exports. Obsolete view coordinates and translation entries remain. README still says localhost and 127.0.0.1 have separate project libraries although current storage is server-side; the Adjacent Evidence plan still says “Planning only” despite the implemented feature.
2. **Location:** `app.js:238–245`, `:263–291`, `:409–507`; `catasto-relations.js:446–467`; `catasto-name-index.js:117–137`; `README.md:103–105`; `ADJACENT_EVIDENCE_PLAN.md:3`.
3. **Why it matters:** Different views can interpret the same source differently, and obsolete documentation sends maintainers/users toward the wrong mental model. Historical plans should not masquerade as current specifications.
4. **Recommended correction:** Extract shared facts while retaining deliberate presentation differences; add parity fixtures before refactoring. Remove verified unused state and update current documentation, clearly labeling historical material.
5. **Automation:** **Safe automatically** for dead state and documentation; shared-rule refactors must preserve documented semantics and pass parity tests.

### L3 — Source-page metadata can become stale after edits and merges

1. **Description:** Page breaks are located by searching for their old opening words. Editing those words invalidates the match; merging retains only the canonical record's break metadata while concatenating both entries. The exporter silently ignores unmatched breaks or falls back to every page in the entry.
2. **Location:** `catasto-name-index.js:193–201`; `app.js:1900–1906`, `:1984–2005`; `catasto-parser.js:577–585`.
3. **Why it matters:** Exported citations can become broader or misleading after ordinary corrections even though the text and page list appear preserved.
4. **Recommended correction:** Preserve page provenance per constituent source entry and track whether edits invalidate precise boundaries. Mark fallback citations as uncertain instead of silently presenting them as exact. Test changed opening lines and multi-page merges.
5. **Automation:** **Requires D10** for the source representation; uncertainty labeling can be implemented automatically.

## INFORMATIONAL

### I1 — Authentication relies on an explicitly accepted trusted-local-computer boundary

1. **Description:** The loopback API has no authentication token. Host/Origin checks defend against browser cross-origin use; they do not authenticate local clients, which can supply those headers. An unrelated local account can call the running API even though project files are private. This is an existing accepted decision, D1, not newly discovered remote access.
2. **Location:** `serve.py:24`, `:119–135`; `project_store.py:38–41`; `INSTALL.md:146–150`; `CLAUDE_RESPONSE_2.md:21–28`.
3. **Why it matters:** “Admin” is a workflow page, not a privileged role. Deployment on shared or untrusted machines would violate the documented threat model.
4. **Recommended correction:** Preserve the trusted-local-only deployment constraint. Revisit authentication and OS-user isolation before supporting shared computers, remote access or multi-user operation.
5. **Automation:** **No new decision required for the current deployment**. Expanding the trust boundary requires a human decision; do not silently add a new login system.

### I2 — Existing security controls are useful, with bounded assurance

1. **Description:** The server binds loopback, allowlists static assets, checks Host and write Origin, sends CSP and nosniff headers, limits request size/concurrency and uses private POSIX files. Rendered user strings generally pass through escaping or text nodes; XLSX text uses inline string cells. No hardcoded credentials, application SQL execution, dynamic code evaluation, or shell execution fed by application input were found in the inspected first-party runtime.
2. **Location:** `serve.py:24–79`, `:93–151`, `:222–245`; `project_store.py:93–108`, `:314–320`; `app.js:293–301`; `catasto-xlsx.js:76–91`.
3. **Why it matters:** These controls meaningfully reduce the exposed attack surface, but do not correct the integrity findings above. Vendored libraries, ignored local data and historical Git contents are not covered by a claim that no secrets exist anywhere.
4. **Recommended correction:** Retain these controls and their regression tests when fixing the reported issues. Do not use another generic static server that exposes the entire repository.
5. **Automation:** **No correction required for these observations**.

## Required human decisions

D10 (merged-source provenance) and D11 (durability contract) are detailed in `HUMAN_DECISIONS.md`. Existing decisions D1–D9 remain in force. No remediation was performed.

OVERALL STATUS: CHANGES_REQUIRED
