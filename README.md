# Catasto Visualizer

Prototype for visualizing household proximity in Catasto Onciario tax records,
developed with the 1754 Catasto of Marano Marchesato, Cosenza, Italy. The app
contains no record data; each user loads their own transcription or project
backup.

**New users:** see [INSTALL.md](INSTALL.md) for step-by-step installation on Mac and Windows.

## Current Prototype

The default view is an interactive 3D environment. Choose a district, pan with a
drag, orbit with a right drag, and scroll to zoom. Touch supports one-finger pan
and two-finger pan/zoom. Click a building or choose a household in the list
to inspect its members, source entry, and recorded neighbors. Neighbor buttons
jump directly to the corresponding record. Names, boundary links, and figures
can be toggled independently. Overview fits the visible district; Focus moves to
the selected unit; Top view switches to an overhead camera. Expand opens an
uncluttered scene (Escape exits), and Details toggles the household card. With the canvas
focused, use arrow keys to pan, +/− to zoom, F to focus, H for overview, and T for
the overhead view.

At startup, the app opens the last selected Catasto project from the local
project folder. The app ships with no data: on first use the library is empty, and
the Admin page creates a project from a transcription file or imports a
`.catasto.json` backup. Admin creates, imports, exports, and deletes projects
without coupling user data to app files.
Admin's Transcription Language setting chooses ENG (English Translation) or IT
(Italian Transcription); ENG is used unless IT is saved as the default. A
bilingual file is parsed from the sections in the chosen language, and an
Italian-only transcription needs IT. Italian projects display the source's
Italian terms, such as `bracciale`, `castagneto`, and `moggio mezzo`.
The Source tax entry panel can edit a household's transcription and residence;
saving updates that project's file and the visualization immediately.
Leaving and returning to the browser does not reload the project or reset the
selected household and camera; Focus and Overview reposition the view only when
the user requests it.
Search covers household heads, surname-inferred household members, residence and
land references, financial references, and full source-entry text. Results show
the matching person or reference and open the household entry where it appears.
Search results can be filtered to household heads, family members, or references;
district labels remain in the normal household list but are omitted from results.

Architecture, terrain, plot size, and placement are schematic, not a geographic
or architectural reconstruction. Building styles follow illustrative source cues:
household heads titled Illustrious or Magnificent receive a two-storey manor with
a stone portal, cornices, shutters, and an iron balcony. Explicit parish-church
mentions in a household's source entry receive a parish-style model with a nave,
oculus, cross, and bell tower. A parish mention takes priority over an honorific.
This includes payments to a parish church; it does not establish that the person
lived in a church. The details card identifies the cue behind the style. Honorifics
belonging only to neighbors or creditors do not turn an ordinary household into
a manor. Names and styles are case-insensitive; boundary-only references remain
translucent markers. Dimensions are symbolic, not measurements or wealth values.
Manor visual references include [Calabrian stone portals](https://beniabbandonati.cultura.gov.it/beni/palazzo-trua/)
and [historic iron balconies](https://dati.cultura.gov.it/lodview-arco/resource/ArchitecturalOrLandscapeHeritage/1800177766.html).
Figures represent
up to twelve listed members of the selected household. Translucent buildings
represent people named as boundary neighbors without full extracted records.
The landholding view is a selected-owner relationship network rather than a
geographic reconstruction. Each parsed parcel belongs to the unique household
head record that owns it, and adjacent properties are connected around it.
Same-name household heads remain separate; patronymics or ages distinguish them
where available. References that cannot identify one same-name household remain
explicitly unresolved instead of being assigned by guesswork.

The visual style evokes modest rural dwellings: low stone-and-plaster walls,
small shuttered openings, plank doors, and weathered terracotta coppi roofs.
Procedural textures and instanced roof tiles provide detail without external
image files. The ground is gently rolling, with cultivated patches, olive and
chestnut trees, earth tracks, and short dry-stone terrace edges. These landscape
details are scenery and do not establish historical crops, routes, structures,
or parcel boundaries. Regional landscape cues are informed by the Sila National
Park's description of [terraced olive groves, vineyards, and chestnut landscapes](https://archivio.parcosila.it/it/la-natura/flora/fascia-mediterranea.html).

The 3D renderer (Three.js 0.170.0) and orbit controls are vendored locally, with
their MIT license in `vendor/THREE-LICENSE.txt`. No CDN access or build step is
needed at runtime. Serve the folder over HTTP for ES module loading; opening the
HTML directly from the filesystem does not enable 3D. Browsers without WebGL 2
show an initialization error.

Non-technical users can double-click `Start Catasto Visualizer (Mac).command` or
`Start Catasto Visualizer (Windows).bat`, which run the server and open the
browser; see [INSTALL.md](INSTALL.md). From a terminal, start the included
server from the project folder. It needs only Python 3.7 or later, listens on
this computer only, and sends the correct file types for the 3D modules:

```bash
python3 serve.py
```

Then visit:

```text
http://127.0.0.1:8000/index.html
```

Stop the server with Ctrl+C. Keep port 8000 and the same address: projects are
stored separately for each address, so `http://localhost:8000` and
`http://127.0.0.1:8000` do not share a library.

### Windows (manual start)

The Windows launcher does the following for you. To start the server by hand:

1. Install Python from [python.org](https://www.python.org/downloads/windows/).
   If typing `python3` opens the Microsoft Store, use the `py` command instead.
2. In File Explorer, open the project folder, type `cmd` in the address bar, and
   press Enter.
3. Run `py serve.py` (or `python serve.py`) and leave that window open.
4. Open `http://127.0.0.1:8000/index.html` in Edge, Chrome, or Firefox.

Do not double-click `index.html` or `admin.html`. Pages opened as files cannot
load the 3D view, and projects imported there are stored separately from the
server's library. Use `serve.py` rather than `python -m http.server`: on many
Windows computers the built-in server labels JavaScript as plain text, and the
browser then refuses to start the 3D view.

## Visualization Rules

- One polygon represents one household unit from the tax record.
- A polygon represents the household's lived/property unit, not every parcel or landholding mentioned in the entry.
- Household members appear inside the polygon.
- Assets are decorative annotations inside the polygon.
- Polygons touch only when the residence/property-unit description in the tax record indicates adjacency.
- Landholding boundary names remain in the source text and do not create touching household polygons in this view.
- Genealogical inference comes from the user observing names and proximity, not from the layout engine forcing kinship relationships.

## Current Files

- `index.html` / `index.css` / `app.js` - interactive visualization and project selector
- `admin.html` / `admin.css` / `admin.js` - project administration opened in a new tab
- `catasto-storage.js` - browser side of project storage, IndexedDB migration, and portable project exchange
- `project_store.py` - project files in the per-user data folder
- `catasto-parser.js` - the single plain-text parser, used by Admin and by reparsing
- `catasto-records.js` - permanent household ids, import repair, and reparse planning
- `scene3d.js` / `scene3d.css` / `scene3d-boot.js` - interactive 3D environment and controls
- `building-types.js` - source-cue rules for dwelling, manor, and parish styles
- `serve.py` - local server with fixed file types and the project-storage API (`python3 serve.py`; `--open` also opens the browser)
- `Start Catasto Visualizer (Mac).command` / `(Windows).bat` - double-click launchers for `serve.py --open`
- `*.test.mjs` - parser, style-rule, storage, Admin, and visualizer-workflow regression checks (`node --test *.test.mjs`)
- `test_serve.py` - local-server checks (`python3 -m unittest test_serve.py`)
- `eslint.config.mjs`, `package.json`, `ruff.toml`, `requirements-dev.txt` - development linting only (`npm install && npx eslint .`; `python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/ruff check .`). The app itself needs no packages.
- `vendor/` - pinned local Three.js renderer, controls, and license
- `README.md` - project notes and visualization rules
- `INSTALL.md` - step-by-step installation guide for Mac and Windows
- `ARCHITECTURE.md` - storage boundaries, upgrade safety, and identity rules
- `HANDOFF.md`, `HUMAN_DECISIONS.md`, `CODEX_REVIEW*.md`, `CLAUDE_RESPONSE.md`, `AGENTS.md` - development notes, review history, and agent instructions
- `.gitignore` - keeps transcriptions, source documents, and project backups out of the repository

## Project Data

Projects are saved as JSON files in a per-user folder outside the app folder
(`%APPDATA%\Catasto Visualizer\projects\` on Windows,
`~/Library/Application Support/Catasto Visualizer/projects/` on macOS), so
updates and clearing browser data leave them in place. The app must be started
with `serve.py` (or a launcher) to reach them. Export a `.catasto.json` file for backup or exchange with another user.
Use Admin's **Import Project JSON** button to restore that file;
the **Source text file** picker in **Create Project from Catasto Text** accepts `.md` and `.txt`
transcriptions, which are parsed into new projects. A transcription file does
not preserve corrections made to a saved project. An open Visualizer tab
switches to a newly imported or created project automatically, unless a source
edit is open there; then only its project list is updated.
Projects saved in the browser by versions up to V 0.05 are copied into the
folder the first time this version opens in that browser at the same address.

The repository contains no project data, and `.gitignore` excludes transcription
files (`MM *.md`, `MM *.txt`), `.docx` sources, `.catasto.json` backups, and
local correction files. Keep these in a folder outside the app so the app folder
can be replaced on update. Projects created by earlier versions, which built the
Marano project automatically, are copied into the folder and continue to open.
