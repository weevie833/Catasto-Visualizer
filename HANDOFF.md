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
- Upload currently replaces the active dataset. Multiple Catasto projects are
  not implemented yet, so uploading Castelfranco would replace Marano in the
  current session.
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

## Suggested next work: multiple Catasto projects

1. Change Upload into an “Add Catasto” flow. Each file should create a distinct
   project rather than overwrite the active dataset.
2. Store project metadata and data separately in IndexedDB: stable project ID,
   display name/locality/year, original filename and source text, parsed records,
   and any project-specific review or view state.
3. Add a project picker near the filename. Switching projects should reload its
   saved data and view state without deleting or mutating other projects.
4. Namespace record IDs with the project ID so the same person/record IDs in
   different Catasti never collide.
5. Keep destructive project deletion separate from switching, with an explicit
   confirmation and no global “reset everything” action.
6. Test the workflow by importing Castelfranco, switching back to Marano, and
   confirming both datasets and their counts remain intact after a reload.

The project picker should display the active Catasto clearly (for example,
“Marano Marchesato · 1754” or “Castelfranco · 1754”). Existing 3D rendering and
parsing should consume the selected project's records, not a shared global
dataset.
