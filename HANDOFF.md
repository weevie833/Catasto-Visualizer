# Catasto Visualizer — Project Handoff

Master project folder: this repository's root folder.

Do not search for or use another copy of this project. The current folder is the
authoritative working directory.

## Repository state

- Branch: `main`, at V 0.09 (the Codex review fixes: durable storage, merging removed, browser and fixture tests; V 0.08 added the Name Index and XLSX Index exports in Admin)
- GitHub: `https://github.com/weevie833/Catasto-Visualizer`
- Runtime: static HTML, JavaScript, CSS, and vendored Three.js; no build step.

## Run and verify

```bash
python3 serve.py
```

Open `http://127.0.0.1:8000/index.html`. On Windows, run `py serve.py`; see the
README's Windows section. `serve.py` sends fixed file types because Python's
built-in server can label `.js` as `text/plain` on Windows, which stops the 3D modules.

```bash
node --test *.test.mjs
python3 -m unittest test_serve.py
npx eslint .
.venv/bin/ruff check .
npm run test:browser
```

The Node suite contains 153 parser, records, relations, name-index, XLSX-index, building-style, storage, Admin,
visualizer-workflow, and synthetic-fixture tests (three run only when `CATASTO_VALIDATION_MD` names the current Marano source: the saved project's `.json` file, whose stored source text is used, an Admin export, or a `.md` transcription; earlier source files are ignored); `test_serve.py` contains 55 server and project-storage tests.
`npm run test:browser` (`smoke.browser.mjs`, about 10 seconds) starts the real server on a free port with a temporary
project folder, creates a project in Admin from `test-fixtures/synthetic-catasto.md`, and checks in Chromium that the
Visualizer loads with no console or security-policy errors, draws the 3D view, and keeps a source edit across a
reload. It needs Playwright's browser once per machine: `npx playwright install chromium`. It is not part of `npm test`.
`test-fixtures/synthetic-catasto.md` is invented (names, places, figures) and safe to commit; never replace it with
or derive it from a private transcription. Lint tools install with
`npm install` and `python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt`. Projects
live in the per-user data folder (`~/Library/Application Support/Catasto
Visualizer/projects/` on this Mac), not in browser storage, so the port no
longer selects the library. Keep port 8000 only so projects still in an old
browser's IndexedDB at that address are migrated.

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
- Projects and parsed records are JSON files in the per-user data folder,
  written by `project_store.py` through `serve.py`'s `/api/` and reached from
  the pages through `catasto-storage.js`. Projects from IndexedDB (V 0.05 and
  earlier) are copied once on first load.
- The source-entry editor can correct an individual stored entry. Saving
  recalculates residence links, identities, and search data.
- The lower panel is split: Source Tax Entry on the left, Adjacent Evidence on
  the right. The report is built by `catasto-relations.js` for the person
  selected (head, member, or a name known only from references) and is never
  saved. It lists stated and derived family, residence and land neighbors, and
  ranked family leads (Strong, Moderate, Weak) with their clues. Institutions
  and connections through a third party are not built yet; see
  `ADJACENT_EVIDENCE_PLAN.md`.
- Names in the report and in the source entry are links that select that person;
  Back retraces the trail for the session.
- On wide windows a draggable divider sets the split between the 3D view and the
  text panels; its position is kept in `localStorage` (`catasto-evidence-height`).
- Admin's **Export Name Index** button exports every person named in a project (honorific, given name, surname, a note when the surname is uncertain, qualifier, residential location; one entry per given name and surname) as JSON, CSV, or Markdown,
  for use as a lexicon elsewhere, such as the Customizable Transcriber's name lexicon. It is built
  by `catasto-name-index.js` when exported and never saved.
- The same dialog's **Export XLSX Index** writes one row per person in the Customizable Transcriber's Catasto Onciario Index layout (ages, birth years, occupations, parents, village and district, pages); see `XLSX_INDEX_PLAN.md`.
- The parser now reads infants listed without an age as household members, records the page an entry starts on when it starts mid-page, and records where each later page begins (`source_page_breaks`). Projects created earlier keep their old pages until created again.
- The Visualizer is a reading tool: relationship conclusions are made in other
  systems (Ancestry, FamilySearch, a spreadsheet). Correcting a Catasto entry is
  the only edit it offers. Merging duplicate households was removed on
  2026-11-12: to audit entries, export an index, correct the source transcript,
  and import it again. The app is not an authoring or correction platform.

## Source and parsing

The source of record is the bilingual Marano transcription, kept on the
developer's computer and not in the repository. The app ships with no project
data: a new installation opens an empty library, and projects are created or
imported in Admin. Admin's Transcription Language selector parses either the
English Translation sections (ENG, the default) or the Italian Transcription
sections (IT); a checkbox saves the choice as the default in that browser. An
Italian-only transcription is parsed with IT. If the chosen language does not
match the text, Admin refuses the import and names the language to choose.
The project records `source_language`, and later re-parses of stored source
text use it.

Italian rules live in `catasto-parser.js` and are used by both Admin and the
Visualizer: `anni N` member lines, names ending before occupations or a
patronymic (`Antonio Conforto di Giuseppe pecoraro`), origins (`della Terra di
Castelfranco`), `Abita in casa propria sita in ...` residences, neighbors after
`giusta li beni di` / `confina` / `contiguo`, and landholdings with `detta`,
`di capacità`, and `stimata la rendita`. Italian projects display the source's
Italian terms.

On the bilingual Marano transcription, the Italian side yields the same 362
households as the English side; 70 of 71 districts and 538 of 567 residence
neighbors agree, and 622 Italian landholdings are found against 603 English.
39 Italian landholdings have no district, mostly clauses with no place name.
`catasto-parser.test.mjs` repeats the household and neighbor comparison when the
transcription is present and skips it otherwise.

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

The current parse produces 362 household entries.

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

- `index.html` / `index.css` — Visualizer page and styles.
- `app.js` — Visualizer code: search, project activation, the reparse offer,
  source editing, and visualization data preparation.
- `catasto-records.js` / `catasto-records.test.mjs` — permanent ids, import repair, reparse planning.
- `catasto-relations.js` / `catasto-relations.test.mjs` — the Adjacent Evidence report and source-entry links.
- `catasto-name-index.js` / `catasto-name-index.test.mjs` — the Name Index / Indice Onomastico export; see `NAME_INDEX_PLAN.md`.
- `catasto-xlsx-index.js`, `catasto-xlsx.js` / `catasto-xlsx-index.test.mjs` — the XLSX Index export; see `XLSX_INDEX_PLAN.md`.
- `ADJACENT_EVIDENCE_PLAN.md` — the report's plan and remaining build steps.
- `scene3d.js` / `scene3d.css` — Three.js household and landholding scenes.
- `catasto-parser.js` — the single parser, used by Admin and by reparsing.
- `catasto-parser.test.mjs` — parser regression tests.
- `synthetic-fixture.test.mjs` / `test-fixtures/synthetic-catasto.md` — parser and both exports on an invented bilingual transcription.
- `smoke.browser.mjs` — real-browser check (`npm run test:browser`).
- `index-app.test.mjs` — visualizer workflows (editing, selection, malformed
  records, id conversion, reparsing) run from `app.js` with a stub DOM.
- `catasto-storage.test.mjs` — exchange format, storage requests, no-server message, and IndexedDB migration.
- `admin.test.mjs` — Admin announces imports, creations, and deletions to open Visualizer tabs.
- `serve.py` / `test_serve.py` — local server with fixed file types and the project API, bound to 127.0.0.1.
- `project_store.py` — project files, stale-write refusal, atomic import, and migration record.
- `catasto-storage.js` — browser side of project storage, IndexedDB migration, and exchange format.
- `admin.html` / `admin.js` — project library management.
- `building-types.js` / `building-types.test.mjs` — architectural source cues.
- `INSTALL.md` — step-by-step installation guide for Mac and Windows users.
- `ARCHITECTURE.md` — architecture and identity rules.

## Updating the vendored Three.js

`vendor/three.module.js` and `vendor/OrbitControls.js` are Three.js r170 (MIT, `vendor/THREE-LICENSE.txt`).
`npm audit` does not cover them. To update:

1. Check the Three.js release notes and GitHub security advisories for the new release.
2. Copy `build/three.module.js` and `examples/jsm/controls/OrbitControls.js` from that release into `vendor/`,
   with its `LICENSE` as `THREE-LICENSE.txt`.
3. In `vendor/OrbitControls.js`, change `from 'three'` to `from './three.module.js'`; the CSP blocks
   import maps, so this one line is the only local change.
4. Run the tests, then check the 3D view, both layers, and navigation in a browser.

## Withdrawn features

Withdrawn 2026-11-12, when merging was removed. The Visualizer is not an authoring or
correction platform: corrections are made in the source transcript, which is then
imported again. Two features previously requested here are therefore not planned:

- A dedicated record editor (find/replace across the source, bulk replacement).
- A spelling-variant review that stores same-person/different-person decisions as
  aliases. Suggesting likely variants in a report, without saving decisions, would
  still fit the reading-tool scope if it is asked for again.

## Known cautions

- `npm audit` reports 4 moderate entries from one minimatch advisory under ESLint 10. This is
  accepted (decision D12 in `HUMAN_DECISIONS.md`). When an ESLint release depends on minimatch
  11.0.1 or later, update `eslint` and `@eslint/js`, then rerun `npm audit`, lint and the tests.
  Do not downgrade ESLint or force minimatch with an override.
- Residence and landholding graphs are different relationship types and must
  not be combined during triangulation.
- A shared neighbor can identify an explicitly named ambiguous person; it must
  not create a new adjacency that the source never stated.
- Some same-name references remain unresolved because the record lacks enough
  evidence. Preserve that uncertainty.
- Projects live in the per-user data folder, not Git. Changes to stored data go
  through a reviewed update that keeps the previous version as a snapshot.
- Family leads are speculation. Keep them labeled with their clues, and do not
  match spelling variants (`Paolo`/`Paulo`) silently.
- The updated Marano database, with more neighbor and institution detail, is
  expected; re-measure the report's evidence on it before building institutions.
