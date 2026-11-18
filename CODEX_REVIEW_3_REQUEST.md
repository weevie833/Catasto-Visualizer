# Request for a third independent review

Prepared 2026-11-18. The app is about to be announced for public use on GitHub, by Mac and Windows users
who run it on their own computers. Please write the result as `CODEX_REVIEW_3.md`.

## What to review

1. **Claude's fixes to `CODEX_REVIEW_2.md`**, described in `CLAUDE_RESPONSE.md`: M1 (index refusal for
   legacy merged records), M2 (import refused while an earlier journal remains), M3 (number overflow and
   strict replies), L2 (unused view state removed; D13 keeps land-clause rules separate), L3 (unique,
   ordered page openings), and NEW-01 (parser version advanced). These have not been independently checked.
2. **V 0.10** (`eacac50`): parser version 8 (section headings end entries, dashed ages, exempt heads,
   capitalized `Padre`, origins and patronymics, neighbor splitting, page-break rejoining, `Cleric` ignored
   in name comparison) and the Adjacent Evidence report (institutions degree removed; payments never count
   as proximity). Details are in the commit message, `HANDOFF.md` and `SECTION_HEADINGS_PLAN.md`.
3. **One working-tree change (uncommitted):** `/api/` replies now send `Cache-Control: no-store` instead of
   `no-cache`, so the browser keeps no copy of a project in its cache. App files still send `no-cache`.
   `test_serve.py` checks it; the test fails without the change.
4. **Release readiness for Windows**, read from the code since it has not been run there (see below).

Comparison checkpoint: `8832486` (the same as round 2). Round 2's fixes and V 0.10 are in `0537031`,
`1240c36` and `eacac50`. `HUMAN_DECISIONS.md` (D1–D13) records the decisions that bound the review;
please do not reopen them without a new reason.

## Checked before this request (2026-11-18, macOS, Node v23.1.0, Python 3.12.0)

| Check | Result |
| --- | --- |
| `node --test *.test.mjs` | 171 tests: 168 passed, 3 skipped (private Marano source not set), 0 failed |
| `python3 -m unittest test_serve` | 55 passed |
| `npm run test:browser` | 1 passed |
| `npx eslint .`, `.venv/bin/ruff check .` | Clean |
| `npm audit --ignore-scripts` | 3 moderate entries, all from GHSA-g3hv-75wg-m249 (minimatch under ESLint); accepted under D12. Round 2 counted 4. |
| Live server on a temporary data folder | Foreign Host 403; POST without Origin, with a foreign Origin, or as `text/plain` 403; foreign DELETE 403; `project_store.py`, `.git/config` and `HANDOFF.md` 404; CSP, `nosniff` present |
| Git history | No private transcription, project or `.docx` file has ever been committed |

## Limits we already know about

- **Windows has not been run.** Specifically untested: the `msvcrt` server lock (`project_store.py:88`),
  the Windows launcher (`Start Catasto Visualizer (Windows).bat`), `py serve.py`, and the content-type
  override for `.js`. Folder flushes are skipped on Windows (`sync_dir`), so D11's crash guarantee covers
  file contents only there; ARCHITECTURE.md says so.
- **File permissions on Windows:** the `0700`/`0600` tightening applies only on macOS and Linux. On
  Windows the data folder under `%APPDATA%` relies on the user profile's default permissions.
- **Python 3.7**, the oldest version the launchers accept, has not been run.
- **Power loss** has not been tested on any platform; the flush-order tests check call order.
- **Private-source checks:** the three skipped tests need `CATASTO_VALIDATION_MD`. With the current
  Marano source, Claude reported the English/Italian agreement check failing until transcript corrections
  are re-imported. Not rerun for this request.
- **Stale figure:** `HANDOFF.md` still quotes the parser version 7 bilingual figures (362 households);
  version 8 parses the current transcription to 367. To be updated with this round's response.
- The repository includes the working documents (review and response files, plans, `HUMAN_DECISIONS.md`,
  `CLAUDE.md`, `AGENTS.md`). Whether they stay public is the owner's choice, not a review finding.

## Out of scope

- Authentication: D1 keeps one trusted local user and loopback only.
- Saving relationship decisions or correction tools beyond the single-entry source editor (project rules
  in `CLAUDE.md`).
- CI (declined by the owner).
