# Catasto Visualizer — Project Handoff

Master project folder: this repository's root folder.

Do not search for or use another copy of this project. The current folder is the
authoritative working directory.

## Repository state

- Branch: `main`, at V 0.12.2 (American flag on the ENG button; V 0.12.1 Windows desktop shortcut, drawn language flags, village app icon; V 0.12 parser versions 10 and 11: the English and Italian parses of the Marano document give the same figures; V 0.11, Codex round 3 fixes: payee labels are not headings, the Name Index reads excluded sections, payments never count as mentions, ESLint 10.15.0; V 0.10 removed the fourth degree and kept payments out of the report)
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
python3 -m unittest test_serve.py test_update_check.py test_mac_release.py
npx eslint .
.venv/bin/ruff check .
npm run test:browser
```

The Node suite contains 175 parser, records, relations, name-index, XLSX-index, building-style, storage, Admin,
visualizer-workflow, and synthetic-fixture tests (three run only when `CATASTO_VALIDATION_MD` names the current Marano source: the saved project's `.json` file, whose stored source text is used, an Admin export, or a `.md` transcription; earlier source files are ignored); `test_serve.py` contains 56 server and project-storage tests; `test_update_check.py` and `test_mac_release.py` contain 33 update-check, Mac-release and Windows-shortcut tests.
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

## Mac release (prepared 2026-11-18, not yet run)

Same process as the Customizable Transcriber: `mac/` (launcher app, `build.sh`, icon),
`.github/workflows/mac-release.yml` (signs and notarizes on `v*` tags), `VERSION` (`0.12.2`),
a pinned standalone Python in the Mac start file on Apple silicon, and an update notice
(`update_check.py`, `update-banner.js`). Details are in ARCHITECTURE.md, "Release and update check".
No one-line Terminal installer (the user chose not to add one).

Before the first release: add the five secrets the workflow names (the same Developer ID
certificate and App Store Connect key as the Transcriber) to this repository, run the workflow
by hand (Actions > Mac release > Run workflow) to check signing, then tag `v` + `VERSION` and push the tag (v0.12.0 to v0.12.2 are released).
`mac/build.sh build/mac` makes an ad-hoc-signed local build for testing.

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
  ranked family leads (Strong, Moderate, Weak) with their clues. It has three
  degrees: the fourth (institutions) was built and then removed in V 0.10 as
  more noise than insight. A church or convent named in a border appears in the
  third degree like any neighbor.
- Money is not proximity. A person paid, owed, collected from or received from
  (rent, interest, a deduction; `esige`/`esigge`) is never listed as a neighbor or a
  mention of the payer, and search labels them a financial reference even when the
  same clause lists borders. The report and search share one word list
  (`isPaymentSentence` in `catasto-relations.js`).
- Names in the report and in the source entry are links that select that person;
  Back retraces the trail for the session.
- On wide windows a draggable divider sets the split between the 3D view and the
  text panels; its position is kept in `localStorage` (`catasto-evidence-height`).
- Admin's **Export Name Index** button exports every person named in a project (honorific, given name, surname, a note when the surname is uncertain, qualifier, residential location; one entry per given name and surname) as JSON, CSV, or Markdown,
  for use as a lexicon elsewhere, such as the Customizable Transcriber's name lexicon. It is built
  by `catasto-name-index.js` when exported and never saved.
- The same dialog's **Export XLSX Index** writes one row per person in the Customizable Transcriber's Catasto Onciario Index layout (ages, birth years, occupations, parents, village and district, pages); see `XLSX_INDEX_PLAN.md` (kept locally).
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

On the current bilingual Marano source (the saved project's text, measured 2026-11-18 with parser version 10),
both sides yield 368 households, all paired by head, with 1,922 people, 361 located residences, and 621
parcels in the Landholdings view on each side. The one residence neighbor that differed, a "vico" in the Italian
for Angelo Chiappetta (pp. 4–5), was a transcription error and has been deleted from the source.
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
  across pages. A sentence cut by a page break (no closing punctuation, the next
  page starting in lowercase, often with `[continued on next page]`) is rejoined
  before the residence is read; the stored source text is left as written.
- Section headings (`[[SECTION:resident|excluded|summary]]` markers, see
  `SECTION_HEADINGS_PLAN.md` (kept locally)) end entries. Only resident sections hold entries;
  an English heading takes its kind from the Italian heading in the same place.
  "Lay Residents from Outside the Area" and other plain "residents" headings are
  resident; "non-resident" ones are excluded.
- An age set off by a dash (`age — 48`, `di anni — 48`) is read as an age.
- A head exempt by privilege, entered in one sentence without ages ("Andrea
  Belmonte, a shepherd, is not taxed…"; "…non si tassano…"), is a household.
- Religious titles such as `Sister` are not mistaken for family relationships.
- A capitalized `Padre` after a name is a surname (Carlo Padre); a lowercase
  `padre` is the relation. Other relation words (`Madre`, `Figlio`, `Nipote`)
  occur capitalized in real member lines and stay relations.
- Historical lines with missing commas or relationships placed before the
  comma are accommodated.

Parser version 8 (2026-11-13) added the section, dashed-age, exemption, page-break, `Padre`,
origin, patronymic, and neighbor-splitting rules in this file. The current Marano transcription
(Desktop, 2026-11-13) parses to 367 households. Saved projects made with version 7 are offered the
reviewed reparse when opened.

Parser version 9 (2026-11-18, Codex round 3): a standalone payee label ("To the Chapel of the Rosary") is no
longer taken for a section heading, so residents after it are kept; and excluded sections are kept in
`data.excluded_sections` for the Name Index. On the saved Marano project nothing else changes: the same 367
households, residences, members and neighbors in both languages, and the same XLSX Index.

Parser version 10 (2026-11-18) makes the English and Italian sides of the same entry agree. Households: a
"Parish Priest in the Mother Church" is not a mother (Don Ignazio Carvello, p. 387, now heads his own household),
and a swaddled infant ("nella fascia", "nelle fascie", "in fasce") is a member. Residences: a placeholder ("He
lives...", "Abita...") gives way to the next residence sentence; English sentences without a subject ("Lives in
his own house") and boundaries written "adjacent to", "next to", "contiguous to" or "confining with" are read;
"a house owned by" or rented is "Not Listed"; "quarter" and "area" are dropped from place names; Italian houses
without "sita" ("casa propria li Malvitani", "casaggio detto li Malvitani", "casaggio proprio di Santo Nicola",
"casaggio del San Nicola") are placed, "casa d'essa Matrice Chiesa" is another's house, and "Possiede la casa
propria locata ..." is a residence, as "She possesses her own house ..." is in English. Origins set off by commas ("Agostino Chiappetta, from the Land of
Castelfranco", "Antonio di Rangho, puglia della Terra di Marano Principato", "della città di Cosenza") give the
residence when none is named, and leave the member line. A town ("the Land of Rende", "Terra di Rende") is not a
neighbor. The document title "Italian Transcription and English Translation of the ..." no longer opens an
Italian section, so the opening notes stay out of the first Italian household. In the Landholdings view, the
English land rule now matches the Italian one (see D13 in `ARCHITECTURE.md`), and "castaneto" is a chestnut
grove. Against version 9 on the saved Marano project, English gains Carvello's household, neighbors for 16
residences, 9 residences, and 41 parcels ("A portion of ...", "A property in ...", "An arable plot ..."), tidies
5 place names, and loses 20 parcels that were the house the owner lives in; Italian gains 22 residences,
neighbors for 6, 4 infants and one parcel, corrects the place for Biasi Santanna (San Nicola) and Don Ignazio
Carvello ("Not Listed"), and loses the "Terra di Rende" neighbor.

Parser version 11 (2026-11-18) removes words before a neighbor's name that do not name the neighbor, in both
languages: crafts ("mastro", "maestro"), "said"/"detto"/"sudetto", "on (all) sides", "late"/"quondam", "those",
"assets", "lands", an empty "[]", a leading "a"/"l'"/"li", and titles of honor before a noble title ("Lady",
"Lord", "Most Excellent", "Illustrissima Signora" before Marchesa, Principe, Conte). A title alone ("the
Princess") takes no surname from the next name. An endowment clause ("assigned as his Sacred Patrimony",
"assegnata ad titulum Patrimonij") and a "perché" clause end the neighbor list. On the saved Marano project, 29
English and 41 Italian parcels change their neighbor names (all of them these words), 6 neighbors that were
clause text are dropped (Don Lorenzo Santanna, Don Pietro Spizzirri, Diego di Bartolo parcel 7), and one
residence neighbor becomes "public road" (Domenico Chiappetta). No household, member or residence place
changes. Parcels whose neighbor names still differ between the languages are translated institutions and
nobles ("Convent San Domenico City Cosenza" / "Convento di San Domenico della Città di Cosenza") and rivers,
which the parser does not translate.

Residence neighbors that still match no household entry are listed by comparing each
`residence_links` entry that has no `household_id` against the heads. On the current transcription
8 names remain, among them Giacomo Loizzo (p. 340), whom the manuscript names but who has no
entry. Most of the rest are named by a head with the same surname and are probably relatives
with no entry of their own.

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
- A father named without a comma is not part of the head's name: `Giovanni di
  Rangho son of Paulo, day laborer` heads the household `Giovanni di Rangho`, and
  same-name heads are labeled by their fathers.
- A head's origin is not part of the name: `of the Land/City/Town/Casale of …`
  and Italian `della/del/di Terra/Città/Casale di …` become the residential
  location.
- In border clauses, names joined by `and`, or by an Italian `e`/`ed` kept in the
  translation, are separate people; a lone first name takes the next surname
  with its particle (`Giacomo e Rafaele di Bartolo` → Giacomo di Bartolo and
  Rafaele di Bartolo). A relation before a name (`his sister Anna di Bartolo`,
  `e sorella Anna di Bartolo`) is dropped.
- Titles are ignored when names are compared, including `Cleric`.

## Key files

- `index.html` / `index.css` — Visualizer page and styles.
- `app.js` — Visualizer code: search, project activation, the reparse offer,
  source editing, and visualization data preparation.
- `catasto-records.js` / `catasto-records.test.mjs` — permanent ids, import repair, reparse planning.
- `catasto-relations.js` / `catasto-relations.test.mjs` — the Adjacent Evidence report and source-entry links.
- `catasto-name-index.js` / `catasto-name-index.test.mjs` — the Name Index / Indice Onomastico export; see `NAME_INDEX_PLAN.md` (kept locally).
- `catasto-xlsx-index.js`, `catasto-xlsx.js` / `catasto-xlsx-index.test.mjs` — the XLSX Index export; see `XLSX_INDEX_PLAN.md` (kept locally).
- `ADJACENT_EVIDENCE_PLAN.md` (kept locally) — the report's plan and remaining build steps.
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

- ESLint is 10.15.0, which uses minimatch 11.0.9; `npm audit` reports no vulnerabilities (2026-11-18).
  D12's wait ended there. Do not downgrade ESLint or force a dependency with an override.
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
- Do not bring back institution links or payment-based connections; the report
  is about physical proximity and stated family.
