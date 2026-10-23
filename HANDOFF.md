# Catasto Visualizer — Project Handoff

Master project folder: this repository's root folder.

Do not search for or use another copy of this project. The current folder is the
authoritative working directory.

## Repository state

- Branch: `main`
- Latest pushed commit: `b9bc543 Advance footer version to V 0.03`
- GitHub: `https://github.com/weevie833/Catasto-Visualizer`
- Runtime: static HTML, JavaScript, CSS, and vendored Three.js; no build step.

## Run and verify

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/index.html`.

```bash
node --test *.test.mjs
```

The current suite contains 34 parser, building-style, storage, and visualizer-workflow tests. Browser-local
IndexedDB is origin-specific, so continue using port 8000 for the user's live
project library.

## Current application

- The default interface is an interactive Three.js household visualization.
- Household and landholding modes share the navigation toolbar.
- Household mode retains the schematic terrain and architectural models.
- Landholding mode removes the landscape and displays only the selected
  household head's parcels, clustered by named area. Each parcel uses its
  land-type model and displays adjacent landholders as relationship nodes.
- The landholding district selector remains visible but disabled and blank.
- The header Upload button was removed. Project creation and import belong in
  the Admin area.
- Admin provides project creation, import, export, and deletion.
- Projects and parsed records are stored in IndexedDB through
  `catasto-storage.js`.
- The source-entry editor can correct an individual stored entry. Saving
  recalculates residence links, identities, and search data.

## Source and parsing

The source of record is:

`MM 1754 Catasto Onciario Transcription 300.md`

Only English Translation sections are parsed into the active Marano project;
the paired Italian transcription remains in the source document.

The parser now uses a household-entry state machine:

- A household begins with an independent person-and-age line.
- Consecutive wife, husband, child, sibling, parent, in-law, niece, nephew, and
  servant lines remain household members.
- Narrative tax, residence, property, livestock, total, liability, and
  carry-forward language moves the parser into the entry body.
- After the narrative has begun, the next independent person-and-age line
  starts a new household.
- Page boundaries do not end entries, and dependent-member lists may continue
  across pages.
- Religious titles such as `Sister` are not mistaken for family relationships.
- Historical lines with missing commas or relationships placed before the
  comma are accommodated.

The current parse produces 362 household entries. Entry-boundary migration
version 5 rebuilt the browser database. The original 338-record dataset is
retained inside the project as `entryBoundaryMigrationBackup`.

## Identity resolution

- The first listed person is the household head and receives the household ID.
- Other people receive member IDs scoped to the household and list position.
- Same-name household heads receive separate IDs.
- Visible disambiguation prefers patronymic, then age, spouse, and source
  position.
- Landholdings belong to the household-head ID, never a member or name-only key.
- Ambiguous references retain every candidate ID instead of being assigned to
  the first matching name.
- Residence triangulation can resolve an ambiguous reference through a unique
  shared neighbor, reciprocal reference, and district evidence. Each inferred
  resolution stores its method, score, confidence, and evidence.
- Marco Todaro's Giacomo Covello reference resolves to Giacomo Covello, son of
  the late Antonio, using Ursula Salerno as the shared residence neighbor.

Identity-resolution migration version 4 is active.

## Name and reference parsing

- Search results display complete names for household heads, members, residence
  references, land references, and financial references.
- Partial searches such as `di rangho`, `covello`, and `magnif` return the full
  referenced name rather than the query fragment.
- Honorific searches preserve complete labels such as `Magnificent Gaetano
  Ferrari`, including longer names with `Don`, `Marchesa`, or surname particles.
- Result excerpts are centered on the matched text.
- Kinship phrases inside boundary descriptions are normalized. For example,
  `Lucrezia, daughter of Anna Capizzano` becomes `Lucrezia Capizzano`; the
  kinship phrase does not become a second neighbor.
- A person who already has a surname keeps it, as in `Giacomo Covello, son of
  the late Antonio`.

## Key files

- `index.html` — application shell, parsing pipeline, search, project migration,
  source editing, and visualization data preparation.
- `scene3d.js` / `scene3d.css` — Three.js household and landholding scenes.
- `catasto-parser.js` — reusable plain-text parser used by Admin.
- `catasto-parser.test.mjs` — parser regression tests.
- `index-app.test.mjs` — visualizer workflows (editing, merging, selection, malformed
  records, migrations) run from the inline `index.html` script with a stub DOM.
- `catasto-storage.test.mjs` — exchange format, stale-write refusal, and atomic import.
- `catasto-storage.js` — IndexedDB project persistence and exchange format.
- `admin.html` / `admin.js` — project library management.
- `building-types.js` / `building-types.test.mjs` — architectural source cues.
- `marano-residence-corrections.json` — versioned Marano residence corrections.
- `ARCHITECTURE.md` — architecture and identity rules.

## Requested next feature: dedicated record editor

Create a separate editor page for direct Catasto editing instead of expanding
the visualization's small entry modal. Suggested files are `editor.html` and
`editor.js`, opened from Admin or from the selected entry.

Required capabilities:

- Select a stored project and edit either its full source text or one parsed
  household entry.
- Find next/previous, match count, case-sensitive search, whole-word search,
  and optional regular expressions.
- Replace current, replace selected matches, and replace all.
- Preview replacements and show the affected entries before applying changes.
- Provide undo/redo during the editing session.
- Save a recoverable project snapshot before bulk replacement.
- Reparse the project after saving, rerun household IDs, member IDs,
  triangulation, adjacency, and search indexing, and report entries whose IDs or
  boundaries changed.
- Preserve the current project ID and selected project while updating its data.
- Never perform silent replacement across the source; require an explicit
  Apply/Save action.

Add regression coverage for replacements spanning one entry, multiple entries,
page boundaries, names, and narrative text.

## Requested next feature: likely spelling variants

Add a review system that locates likely variant spellings of the same person,
for example `Ritacchia` and `Rittachia`.

Recommended calculation:

1. Normalize case, accents, punctuation, repeated whitespace, and honorifics
   while retaining the original spelling for display.
2. Generate candidates using surname edit distance, doubled-letter changes,
   phonetic similarity, and matching given names.
3. Increase confidence when candidates share district, neighbors, relatives,
   occupation, patronymic, spouse, age, or reciprocal references.
4. Reduce confidence when both spellings occur as separate household heads with
   incompatible ages, families, patronymics, or simultaneous property links.
5. Present suggestions for review; do not automatically merge people.
6. Allow the user to mark `same person`, `different people`, or `undecided`.
7. Store accepted spellings as aliases of one canonical household identity and
   preserve rejected decisions so they are not repeatedly suggested.
8. Recalculate affected search and adjacency links after a decision.

The review UI should show both source excerpts, pages, household IDs, ages,
family members, districts, and graph evidence. Alias decisions must remain
separate from true duplicate-household merges.

## Known cautions

- Residence and landholding graphs are different relationship types and must
  not be combined during triangulation.
- A shared neighbor can identify an explicitly named ambiguous person; it must
  not create a new adjacency that the source never stated.
- Some same-name references remain unresolved because the record lacks enough
  evidence. Preserve that uncertainty.
- Project migrations run when the application loads. Keep migrations versioned
  and recoverable because the live data is stored in the browser, not Git.
