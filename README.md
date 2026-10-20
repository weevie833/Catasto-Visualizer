# Catasto Visualizer

Prototype for visualizing household proximity from the 1754 Catasto Onciario of Marano Marchesato, Cosenza, Italy.

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

At startup, the app reads `MM 1754 Catasto Onciario Transcription 300.md`,
extracts the English Translation sections, and builds the household view from
those records. The matching Italian transcription stays in the Markdown source;
the current detail panel displays the English source text. The Upload dialog
accepts `.txt` and `.md` files for review.

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
Landholdings retain the existing owner-level aggregation: each field represents
an owner's parsed holdings, not a separately geolocated parcel.

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

Open `index.html` in a browser or serve the folder locally:

```bash
python3 -m http.server 8000
```

Then visit:

```text
http://127.0.0.1:8000/index.html
```

## Visualization Rules

- One polygon represents one household unit from the tax record.
- A polygon represents the household's lived/property unit, not every parcel or landholding mentioned in the entry.
- Household members appear inside the polygon.
- Assets are decorative annotations inside the polygon.
- Polygons touch only when the residence/property-unit description in the tax record indicates adjacency.
- Landholding boundary names remain in the source text and do not create touching household polygons in this view.
- Genealogical inference comes from the user observing names and proximity, not from the layout engine forcing kinship relationships.

## Current Files

- `index.html` - single-file interactive prototype
- `scene3d.js` / `scene3d.css` - interactive 3D environment and controls
- `building-types.js` - source-cue rules for dwelling, manor, and parish styles
- `building-types.test.mjs` - style-rule regression checks (`node --test building-types.test.mjs`)
- `vendor/` - pinned local Three.js renderer, controls, and license
- `MM 1754 Catasto Onciario Transcription 300.md` - bilingual transcription and translation used as the active source
- `households_pages_5_13.json` - earlier extracted English sample
- `extract_page_5_13_households.py` - earlier DOCX-to-JSON extraction script
- `README.md` - project notes and visualization rules
- `requirements.txt` - currently empty; reserved for future tooling
- `MM 1754 Catasto Onciario Transcription EDIT.docx` - earlier transcription source document
- `MM 1754 Catasto Onciario Transcription.docx` - earlier transcription source document

## Future Direction

The next major step is multi-Catasto project management. Each imported Catasto
should be saved as its own project, with a project picker to switch datasets
without replacing or losing the current one. Use IndexedDB for persistent local
storage and namespace record IDs by project. The current Upload flow replaces
the active dataset; Reset has been removed to avoid accidental data loss.
