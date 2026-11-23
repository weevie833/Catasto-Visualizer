# Catasto Visualizer

@AGENTS.md

Read `HANDOFF.md` for the project's state and `ARCHITECTURE.md` for its rules.

## Commands

- Run: `python3 serve.py`, then open `http://127.0.0.1:8000/index.html`.
- Test: `node --test *.test.mjs` and `python3 -m unittest test_serve.py test_update_check.py test_mac_release.py`. Browser check: `npm run test:browser` (Playwright's Chromium; runs the server on a temporary project folder).
- Lint: `npx eslint .` and `.venv/bin/ruff check .`.

## Rules

- No inline scripts or styles: the server sends `script-src 'self'; style-src 'self'`.
- A new app file must be added to `APP_FILES` in `serve.py`, or the server returns 404 for it.
- Bump the stylesheet query (`scene3d.css?v=N`) in `index.html` after changing it.
- The version is in `VERSION` (`0.13.0`) and shows in the footers of `index.html` and `admin.html` (`V 0.13.0`); `INSTALL.md` quotes it.
- Mac release: tag `v` + `VERSION` and push the tag; `.github/workflows/mac-release.yml` builds, signs, notarizes, and attaches the disk image. See ARCHITECTURE.md.
- In `vm`-based tests, copy arrays made inside the context (`Array.from`, or JSON) before `deepEqual`.
- The XLSX Index layout is written in `LAYOUT` in `catasto-xlsx-index.js`, copied from the Customizable
  Transcriber's "Catasto Onciario Index - Template.xlsx" (kept outside this repo). Update it and its test when the template changes.
- The Visualizer informs decisions made elsewhere. Do not add tools to save or manage relationships;
  correcting a Catasto entry is the limit.
- Bump `PARSER_VERSION` in `catasto-parser.js` when the parse of an existing source changes; saved projects
  are then offered the reviewed reparse. Before a parser change, compare the old and new parse of the current
  Marano transcription (kept outside the repo) and report every household, residence, or neighbor that changes.
- Commit or push only when asked.
