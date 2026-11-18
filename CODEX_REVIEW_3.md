# Independent review — round 3

Reviewed: 2026-11-18

Project: `/Users/stevecovello/Documents/Codex/Catasto Visualizer`

Reviewed HEAD: `ecbcad5d74b14d5b32d6fae42b520b8a79aecd62`

Comparison checkpoint: `88324866127a2a6cda977c9f3f7416232bcf067b`

## Scope and conclusion

Reviewed `CODEX_REVIEW_3_REQUEST.md`, `CODEX_REVIEW_2.md`, `CLAUDE_RESPONSE.md`, D1–D13 in `HUMAN_DECISIONS.md`, the section-heading plan, architecture, handoff and release instructions. Inspected the cumulative repair diff and the V0.10 changes, their current integrations and tests. Compared a reproduced parser regression directly with V0.09 (`1240c36`). Windows assessment is by code and platform documentation, not Windows execution.

The six outstanding round-two repairs are adequately implemented: M1, M2, M3, L2, L3 and round-two NEW-01. However, V0.10 introduces a HIGH parser regression and leaves the approved excluded-section Name Index behavior unfinished. The financial-reference filter is also incomplete. D12's upstream-update trigger has now occurred, so M6 requires action again.

**Actionable findings: 1 HIGH, 2 MEDIUM (including reopened M6), 1 LOW.** No CRITICAL finding was identified. Do not announce this revision as fully reviewed and ready without addressing the parser/export findings. Windows remains unverified; this review does not certify it.

The working tree was clean when review began. Contrary to the request's description, the API cache change is already committed in `ecbcad5`. No source, dependency, saved project, decision file, or other review was modified. Only this report was created.

## Independent diagnostics

| Check | Result |
| --- | --- |
| `npm test` | 171 tests: 168 passed, 3 skipped, 0 failed |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest test_serve` | 55 passed |
| `npm run test:browser` | 1 passed using Chromium and a temporary library/server |
| `npm run lint` | Passed |
| `.venv/bin/ruff check --no-cache .` | Passed |
| `npm audit --ignore-scripts --json` | 3 moderate affected-package entries; no high/critical entries |
| Registry metadata checks | ESLint 10.15.0 and config-array 0.23.6 now require minimatch `^11.0.5` |
| `git diff --check 8832486` | Reports two existing Markdown trailing-space lines in `CODEX_REVIEW_2.md:3–4`; no source whitespace error reported |
| Additional synthetic probes | Confirmed R3-01, R3-02 and R3-03 below; compared R3-01 with the pre-V0.10 parser |

Environment: macOS, Node v23.1.0, Python 3.12.0. No separate build or type-check command is configured. Python compatibility syntax checking is part of the suite; it does not execute Python 3.7.

The three skipped tests require the private `CATASTO_VALIDATION_MD`. I did not access the saved library or independently verify the reported 367-household count, private bilingual mismatch, or transcript corrections. No actual power-loss test, Windows test, or full browser interaction matrix was run. No CI was added or requested. The Git-history privacy assertion in the request was not independently audited across all historical blobs in this follow-up.

## Prior-finding dispositions

Status refers to the specific earlier defect, not a blanket guarantee for the subsystem. Round-two NEW-01 is distinct from the R3 identifiers below.

| Prior finding | Status | Verification / current location |
| --- | --- | --- |
| H1 — repeating revision tokens | RESOLVED | `project_store.py:139–150`: millisecond truncation precedes comparison; non-boundary/backward-clock stale-save tests pass. |
| H2 — recovery by a second server | RESOLVED | `project_store.py:84–109`, `serve.py:260–269`: lock precedes store construction; subprocess exclusion/release tests pass on macOS. Windows limits below. |
| H3 — later merge overwrites edits | RESOLVED | Merge actions remain removed under D10. Legacy records are retained without enabling a new merge. |
| M1 — later merged members missing from indexes | RESOLVED | `catasto-name-index.js:381–400`, `admin.js:152–199`: more than one constituent source entry causes a shared export refusal; Admin displays it and disables index exports. Test covers both Name/XLSX paths and retained project backup export. |
| M2 — retained rollback journal overwritten | RESOLVED | `project_store.py:649–659`: under the lock, settle the old import and refuse with 503 if its journal remains, before writing another. The two-import failure/restart regression passes. |
| M3 — overflowing numbers / invalid JSON replies | RESOLVED | `project_store.py:116–129,214–226`, `serve.py:162–169`: finite float parsing rejects exponent overflow; large page integers are checked without float conversion; replies use strict dumps. API tests cover huge integers, overflowing exponents, nested values and preserving damaged stored files. |
| M4 — out-of-order project activation/saves | RESOLVED | Activation-generation and active-project guards remain; deferred-I/O and edit/broadcast tests pass. |
| M5 — unknown age treated as zero | RESOLVED | Unknown/empty age guards remain in `catasto-relations.js`; unknown-age tests pass. |
| M6 — vulnerable development dependency | STILL_OPEN | Previously accepted pending an upstream release. That release is now available; see M6 below. |
| M7 — absent durability synchronization | RESOLVED on reviewed macOS path | File/directory flush ordering remains tested. Windows still skips directory flushes; no stronger platform guarantee is inferred. |
| M8 — browser/synthetic/failure-schedule coverage | RESOLVED for agreed work | Browser smoke, synthetic bilingual fixtures, lock/recovery and deferred-I/O tests pass. The new cases below need regression coverage. |
| L1 — hidden/unhandled storage errors | RESOLVED | Visible Visualizer storage alert and Admin outer action rejection handler remain; tests pass. |
| L2 — duplicate land rules / dead view state | RESOLVED | `view.x/y/scale` removed. D13 intentionally retains separate land-clause rules; architecture and a parity/difference test document their purposes. No new semantic decision is needed. |
| L3 — repeated/out-of-order page openings | RESOLVED | `catasto-name-index.js:197–214`: every anchor must be nonempty, unique and in recorded order; otherwise whole-entry pages are cited. Repeated and reversed-anchor tests pass. |
| I1 — accepted local-user trust model | RESOLVED / accepted under D1 | Loopback/private-file model retained. Authentication is not reopened. |
| I2 — existing defensive controls | RESOLVED / retained | Host/Origin, static allowlist, CSP/nosniff and request-limit tests pass; API cache policy strengthened as described below. |
| Round-two NEW-01 — unchanged parser version | RESOLVED | Parser is now version 8, entry boundaries version 6. Version-6 data is offered a reviewed update; regression preserves an edited household's ID/correction while adding the previously missed entry. |

## CRITICAL

None identified.

## HIGH

### R3-01 — NEW FINDING: a creditor label switches the parser into an excluded section

**Status: REGRESSION_INTRODUCED by V0.10.**

**Affected files:** `catasto-parser.js:300–323` (`sectionHeadingKind`, `headingLineKinds`), `catasto-parser.js:671–687` (section state in `splitEntries`).

**Description and technical reason:** Section detection accepts any short standalone line containing an institution word such as `Chapel`, unless a small set of articles/verbs excludes it. A normal creditor label beginning `To the ...` is not excluded. The parser inserts `[[SECTION:excluded]]`, ends the resident's entry and skips subsequent residents until another recognized resident section heading. This can omit the remainder of a transcription from the parsed dataset.

**Reproduction:** Parse this English source, preserving blank lines:

```text
Bruno Ventrella, farmer — age 40
He lives in his own house.

To the Chapel of the Rosary

Five ducats annually.

Carlo Rossi, farmer — age 50
He lives in his own house.
```

V0.09 (`1240c36`) returns `["Bruno Ventrella", "Carlo Rossi"]`. Current code returns `["Bruno Ventrella"]`. `extractTranscriptionSections` inserts the excluded marker immediately before `To the Chapel of the Rosary`. The existing “lines inside an entry are never headings” test does not cover creditor labels.

**Why it matters:** A financial subheading is not a population section. New imports silently lose household records; a reviewed upgrade may propose removing legitimate records because of the same false classification. Original `sourceText` remains available, so this is derived-data omission rather than destruction of the original transcript.

**Recommended correction:** Distinguish category headings from creditor/payee labels and individual institutional narrative. At minimum exclude payment-direction prefixes in both supported languages; add positive and negative boundary fixtures so a broad institutional keyword cannot suppress later residents. Preserve true resident/excluded/summary behavior. Bump the parser version and use the established reviewed update/snapshot flow when fixing parse output.

**Can Claude safely address automatically?** Yes, through a constrained parser correction and regression tests under existing rules.

**Human judgment required?** No new product decision. The existing section policy already excludes narrative creditor labels from section headings.

## MEDIUM

### R3-02 — NEW FINDING: the approved Name Index coverage of excluded sections is absent

**Status: STILL_OPEN — unfinished V0.10 integration.**

**Affected files:** `catasto-parser.js:671–687,917–948`; `catasto-name-index.js:397–414`; `SECTION_HEADINGS_PLAN.md:87–99,117–119`; Name Index coverage described in `README.md:28–35`.

**Description and technical reason:** Section splitting now discards excluded-section lines, and parsed data has no `excluded_sections`. Name collection traverses only `data.households`. The plan explicitly records the decision that the Name Index retains people named only in excluded sections, while XLSX follows the entries. Its heading also acknowledges that the excluded-section Name Index work is not built. This review confirms the omission in code, rather than treating the plan as an implemented feature.

**Reproduction:** A source containing resident Bruno Ventrella, then the standalone heading `Foreign Lay Landowners`, then `Antonio La Piana of the city of Montefinto` and `He possesses a vineyard, bordering Paolo Serra.` yields only Bruno in the Name Index. `data.excluded_sections` is undefined. Antonio and Paolo have no alternate resident mention in this fixture and disappear from that export.

**Why it matters:** Keeping nonresidents out of household/proximity views is correct, but it does not satisfy the separate approved lexicon export requirement. The exported Name Index looks complete despite omitting a whole class of source material. Raw project source remains intact.

**Recommended correction:** Implement the recorded design: retain excluded sections with original text/page evidence; include their owners and referenced people in Name Index JSON/CSV/Markdown, deduplicating with resident mentions and retaining origins. Keep summaries excluded. Do not accidentally add these sections to the household dataset, 3D/report/search or XLSX paths: Name Index and XLSX currently share `collectMentions`, so this needs an explicit mode or separate collection path. Add bilingual tests proving inclusion in Name Index and exclusion from the other outputs. Advance the parser version for stored-data changes and preserve reviewed reparsing.

**Can Claude safely address automatically?** Yes; the scope and intended output separation were already decided in `SECTION_HEADINGS_PLAN.md`.

**Human judgment required?** No to implement the recorded choice. Shipping a deliberately reduced Name Index instead would require a new explicit scope decision and clear user-facing coverage disclosure.

### M6 — Existing finding reopened: D12's compatible-upstream-release trigger has occurred

**Status: STILL_OPEN.**

**Affected files:** `package.json:12–16`, `package-lock.json`, D12 in `HUMAN_DECISIONS.md`, dependency caution in `HANDOFF.md`.

**Description and evidence:** The installed lockfile still produces three moderate package entries for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): minimatch, ESLint and config-array. These are one underlying advisory, not three independent vulnerabilities. D12 accepted waiting until upstream ESLint adopted fixed minimatch; it did not accept indefinite retention after that event.

Independent `npm view` checks on 2026-11-18 returned:

```text
eslint 10.15.0:
  minimatch ^11.0.5
  @eslint/config-array ^0.23.6
@eslint/config-array 0.23.6:
  minimatch ^11.0.5
@eslint/js latest: 10.0.1
```

These are registry metadata results, not an installed or compatibility-tested upgrade. The pinned ESLint is still 10.13.0. The advisory's affected range ends before 11.0.1. Primary metadata is available at the [ESLint 10.15.0 registry record](https://registry.npmjs.org/eslint/10.15.0) and [config-array 0.23.6 registry record](https://registry.npmjs.org/@eslint%2fconfig-array/0.23.6).

**Why it matters:** The exposure remains development-only with fixed repository globs; no new production attack path was found. However, the agreed reason for deferral has expired and there is now a same-major upstream upgrade to validate.

**Recommended correction:** Update ESLint and regenerate the lockfile using supported upstream dependencies, without a forced minimatch override or major ESLint downgrade. Check `@eslint/js` compatibility; its current latest version is already the pinned 10.0.1. Run audit, lint and regression tests before claiming resolution.

**Can Claude safely address automatically?** Yes, subject to compatibility checks already required by D12. No packages were changed during this review.

**Human judgment required?** No. This executes the existing decision rather than reopening it.

## LOW

### R3-03 — NEW FINDING: payment-only references still appear as report mentions

**Status: STILL_OPEN — incomplete V0.10 payment filtering.**

**Affected files:** `catasto-relations.js:883–887,910–915`; contrast `app.js:861–868` and `HANDOFF.md:72–74`.

**Description and technical reason:** `isPaymentSentence` recognizes `pays`, `paid`, debt/rent words and directional prefixes, but omits the literal `payment` and collection/receipt verbs recognized by search. The generic report-mention fallback therefore includes monetary-only evidence.

**Reproduction:** Give Bruno Ventrella a normal head/residence entry followed by `He makes a payment to Carlo Rossi.` Build `CatastoRelations.buildPersonReport(data, {name: "Carlo Rossi"})`. Its summary includes `Mentioned in Bruno Ventrella's entry` with a link to Bruno. `He collects from Carlo Rossi five ducats.` and `He receives from Carlo Rossi five ducats.` produce the same result.

**Why it matters:** The report's documented contract explicitly excludes payment-only connections/mentions. Search already understands `payment`, `collects` and `receives` as financial vocabulary, so search and report disagree. The reproduced output is a generic mention, **not** an explicit third-degree neighbor; severity is LOW accordingly.

**Recommended correction:** Align the financial classification used by report filtering and search, including payment/collection/receipt forms and Italian equivalents. Test pure financial references and a separate genuine border clause involving the same person, so legitimate proximity is retained when independently supported.

**Can Claude safely address automatically?** Yes, with targeted fixtures.

**Human judgment required?** No; the no-payment-connections policy is already recorded.

## INFORMATIONAL

### I3 — Windows release readiness is not established by the macOS tests

**Affected files:** `Start Catasto Visualizer (Windows).bat:1–13`, `project_store.py:49–57,84–109,177–184,190–220`, `serve.py` static MIME handling/server construction, `INSTALL.md`, `ARCHITECTURE.md:16,28`.

The code review found no definite Windows-only startup failure:

- The batch file quotes its own directory, changes drive/directory with `cd /d`, prefers `py -3`, falls back to `python`, and leaves the console open. Unlike the Mac launcher, it does **not** explicitly verify Python >=3.7 or retry another interpreter after the selected command fails. A Python-only incompatible installation can therefore get a traceback rather than the intended installation guidance. A clear version probe/failure message would be a safe usability improvement.
- `msvcrt.locking(..., LK_NBLCK, 1)` operates at offset zero of an open read/write handle retained for the server lifetime. A zero-length `server.lock` is not itself an error: the official [Python msvcrt documentation](https://docs.python.org/3/library/msvcrt.html#msvcrt.locking) explicitly permits locking beyond EOF. This was inspected, not executed on Windows.
- The `%APPDATA%` path has a fallback to the profile's Roaming directory. POSIX mode bits are not Windows ACL enforcement; the implementation depends on profile permissions, as already disclosed. D1 is unchanged.
- The fixed JavaScript MIME mapping does not depend on registry MIME guesses, and its regression passes on macOS. Actual Windows browser/module loading is still untested.
- Windows skips directory synchronization. File flushing does not by itself certify durable directory entries, paired rename ordering, or journal deletion after power loss. Microsoft separately documents file flushing and write-through metadata behavior in [FlushFileBuffers](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers). The architectural caveat is real; do not market the Windows implementation as having a verified full D11 guarantee.
- The Python 3.7 grammar test passes on Python 3.12. It does not establish runtime support for the advertised minimum version. I did not find a confirmed incompatible runtime call in the reviewed server paths.

**Recommended validation before claiming tested Windows support:** Use a standard, non-administrator Windows account and a path with spaces/non-ASCII characters. Exercise launcher and manual startup, real Chromium/Edge rendering, create/edit/reload, backup/import, reviewed reparse/restore, delete, duplicate launch on both same and different ports, and restart after interrupted work. Confirm the profile ACL assumption. A second-server test must demonstrate the first server's in-progress work is untouched. This is a manual validation recommendation, not a request to add declined CI.

**Automatic versus human:** A version-check improvement and ordinary tests can be implemented automatically. Actual Windows validation requires a Windows environment; release wording/acceptance of an untested platform belongs to the owner. This known limitation is not presented as a newly reproduced Windows vulnerability or a reopening of D1/D11.

### I4 — API caching change is correct; it does not purge historical cache entries

**Affected files:** `serve.py:113–120`; `test_serve.py:63–72`.

`end_headers` sends `Cache-Control: no-store` for paths classified by `is_api`, including normal API responses and API errors; application assets retain `no-cache`. The independent Python suite passes the new assertion, and real-browser creation/edit/reload still works. No new functional regression was found in this change. The header applies to new responses, not a retroactive erasure of previously cached data; no cache-purge feature is requested or inferred here.

### I5 — Documentation/test boundaries

The older bilingual counts and the admitted private-source test failure remain unverified. Update release/handoff figures with their parser/source version when authoritative validation is available; do not replace them with invented counts. The prior review's two Markdown hard-break whitespace warnings are not an application defect. Decisions about publishing internal planning/review documents remain out of scope, as requested.

## Decision compliance and release assessment

- **D1–D10:** No new reason to reopen their accepted policies. Legacy merged-index refusal now implements D10's protective behavior without discarding backup data. The ordinary repair, permanent-ID, snapshot, restore and export regression suites pass.
- **D11:** macOS synchronization remains implemented; known Windows and physical-power-loss limits remain explicit. No stronger cross-platform promise is made by this review.
- **D12:** Update trigger reached; perform the compatible upstream update and revalidate.
- **D13:** Separate land-clause semantics are intentional and tested, so L2 is closed.
- **Section-heading plan:** The decided Name Index treatment of excluded sections remains unimplemented. R3-02 is a missing implementation of an existing choice, not a new choice imposed by this review.
- **V0.10:** Versioning, dashed ages, exempt heads, origins/patronymics, neighbor splitting, page rejoining, and removal of the institutional report degree have passing targeted tests. Independent exempt-head and English/Italian `Carlo Padre` export probes also produced the expected names. Those successes do not cover the creditor-heading regression or the missing export integration.

Correct R3-01 and R3-02 before treating V0.10's parsing/index behavior as release-ready; address R3-03 and execute D12's now-available update. Add regression coverage for the reproduced cases. No new product decision is needed for these fixes. Preserve reviewed parser upgrades and snapshots; do not silently reparse the user's library.

OVERALL STATUS: CHANGES_REQUIRED
