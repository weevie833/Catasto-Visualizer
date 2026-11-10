# Catasto Visualizer

@AGENTS.md

Read `HANDOFF.md` for the project's state and `ARCHITECTURE.md` for its rules.

## Commands

- Run: `python3 serve.py`, then open `http://127.0.0.1:8000/index.html`.
- Test: `node --test *.test.mjs` and `python3 -m unittest test_serve.py`.
- Lint: `npx eslint .` and `.venv/bin/ruff check .`.

## Rules

- No inline scripts or styles: the server sends `script-src 'self'; style-src 'self'`.
- A new app file must be added to `APP_FILES` in `serve.py`, or the server returns 404 for it.
- Bump the stylesheet query (`scene3d.css?v=N`) in `index.html` after changing it.
- The version shows in the footers of `index.html` and `admin.html`; `INSTALL.md` quotes it.
- In `vm`-based tests, copy arrays made inside the context (`Array.from`, or JSON) before `deepEqual`.
- The XLSX Index layout is written in `LAYOUT` in `catasto-xlsx-index.js`, copied from the Customizable
  Transcriber's "Catasto Onciario Index - Template.xlsx" (kept outside this repo). Update it and its test when the template changes.
- The Visualizer informs decisions made elsewhere. Do not add tools to save or manage relationships;
  correcting a Catasto entry is the limit.
- Commit or push only when asked.
