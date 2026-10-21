# Catasto Visualizer — Session Handoff

Project folder: ``

## Current state

- The app is an interactive Three.js 3D visualization served locally over HTTP.
- Startup loads `MM 1754 Catasto Onciario Transcription 300.md` and extracts
  its English Translation sections for household data. The bilingual Markdown
  file is the current source of record.
- English and Italian interface controls are beside Upload. English is the
  first-visit default; the language choice is remembered in local storage.
- Italian mode translates the interface and Family-list descriptions
  (occupations, relationships, and ages). Personal names and original source
  excerpts remain unchanged; the detail/source panel still shows English text.
- Reset was removed because it cleared the active dataset. There is no Reset
  control or reset handler now.
- Multiple Catasto projects are stored locally in IndexedDB and selected from
  the sidebar. Admin opens in a new tab for creation, import, export, and deletion.
- The 2D view is gone. Drag pans, right-drag orbits; touch gestures pan and
  zoom. The environment, rural landscape, house styles, and boundaries are
  schematic and not geographic reconstruction.

## Run and verify

From the project folder:

```bash
python3 -m http.server 8000
```

Open `http://127.0.0.1:8000/`. Stop the server with Ctrl-C in its terminal.
Run the building-style regression checks with:

```bash
node --test building-types.test.mjs
```

No build step or network access is required at runtime; Three.js and controls
are vendored under `vendor/`.

## Multiple Catasto projects

- `catasto-storage.js` owns persistent project records and exchange files.
- `admin.html` opens in a new tab and manages the local project library.
- `index.html` selects a project and feeds only that project's namespaced records
  into the existing 3D renderer.
- The original Marano Markdown is seeded as the first local project when the
  library is empty.
