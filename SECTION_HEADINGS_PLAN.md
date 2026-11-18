# Section Headings in the Parser

**Status:** All steps built. Steps 1, 2 and 4 in parser version 8 (2026-11-13); step 3 (the Name Index reading
excluded sections) in parser version 9 (2026-11-18), with payee labels no longer taken for headings.

## Goal

Every person who lives in the village becomes an entry: citizens, absent citizens, clergy, widows, and foreigners
living there. People who live elsewhere (non-resident landholders, creditors, outside churches and monasteries)
never become entries. They stay names in residents' entries for the user to follow up. The closing tax summaries
are not entries at all.

## The problem

`splitEntries` starts an entry only at a member line with an age. The Catasto onciario's later sections list
owners without ages, so nothing after them starts an entry. In the saved Marano project, everything from page
416 to page 549 is read into Magnifica Cassandra Conte's entry (p. 415):
- non-resident lay landholders
- non-resident clergy
- non-resident churches and monasteries
- the village's chapels
- the Collettoria and tax tables

## Sections in the Marano source

Every Catasto onciario follows the 1741 instructions, so the same sections recur. The wording varies, even within
one transcript.

| Page | Italian heading | English translation | Kind |
|---|---|---|---|
| (start) | Cittadini | Citizens | resident |
| 349 | Cittadini assenti… | Absent citizens… | resident (already entries) |
| 352 | Cittadino cherico… | Clerical citizen… | resident |
| 353 | Donne vedove, Vergini in capillis… | Widows, Virgins as heads of households… | resident |
| 384 | Sacerdoti Secolari Cittadini e Diaconi | Secular Priests, Citizens, and Deacons | resident |
| 394 | Cappella di questa Terra | Chapel of this Land | excluded (an institution) |
| 396 | Forastieri abitanti — Laici | **Lay Non-Resident Inhabitants** (mistranslated) | resident |
| 416 | Forastieri Bonatenenti Laici | Foreign Lay Landowners (Non-residents) | excluded |
| 431 | Forastieri Bonatenenti Ecclesiastici risedenti fuori | Foreign Ecclesiastical Landowners residing elsewhere | excluded |
| 437 | Chiese e Monasteri per forastieri bonatenenti | Churches and Monasteries as non-resident property owners | excluded |
| 462 | Collettoria generale | (tables) | summary, to the end |
| 483–549 | Collettoria, Tassa…, Esentati | Tax Collection, Tax of "Bona Tenenza"…, Exempted Institutions | summary |

The English heading on page 396 calls resident foreigners "Non-Resident Inhabitants". The Italian, "Forastieri
abitanti", means they live there: they pay the habitation tax, as Cassandra Conte does. Classification therefore
reads the Italian heading first.

## Design

### 1. Recognizing a heading

A heading is a short line standing on its own (12 words or fewer), with or without bold. It has no age and none of
an entry's verbs (possiede/possesses, paga/pays, abita/lives, confina/bordering, esigge/collects). It must contain a
section word:

- **Summary**, which wins over the others: collettoria, tassa, esentati, laus deo; tax collection, exempt.
- **Excluded**, which wins over resident:
  - bonatenenti, non abitanti, risedenti fuori
  - forastieri/forestieri without "abitanti"
  - chiese, monasteri, cappelle, congregazioni
  - English: landowners, property owners, residing elsewhere, non-resident (unless "inhabitants"), churches,
    chapels, monasteries, congregations
- **Resident:**
  - cittadini (including "assenti"), vedove, vergini, sacerdoti, chierici/cherici, diaconi, forastieri abitanti
  - English: citizens, widows, maidens/virgins, priests, clerics, deacons, inhabitants, resident foreigners

These are words for the kinds of section the instructions prescribed, not Marano's names, so any village's Catasto
works.

### 2. Pairing the two languages (`extractTranscriptionSections`)

A first pass lists the headings on each page in each language. The nth English heading on a page takes the kind of
the nth Italian heading on the same page. Without an Italian counterpart, its own words decide. The English text
keeps a marker where the heading stands, such as `[[SECTION:excluded]]`, so mid-page headings (page 349) fall in the
right place. An Italian-only or English-only source uses its own headings.

### 3. Splitting entries (`splitEntries`)

- A section marker always ends the current entry.
- **resident:** entries start at member lines, as now. Text before the first member line is dropped, as
  entries without member lines already are.
- **excluded:** lines are skipped until the next resident heading.
- **summary:** everything after it is skipped to the end of the text. The Collettoria closes a Catasto, and
  its tables repeat names ("— Cittadini —", "Resident Foreigners") that must not reopen entries.
- Before the first heading, the text is resident. A source without headings parses as it does today.

### 4. Keeping excluded sections for the Name Index

Excluded sections are not entries, but their text is kept in the parsed data:
`data.excluded_sections: [{ heading, source_pages, source_page_breaks, source_entry }]`. Each item has the same
fields as a household record, so page splitting works unchanged. Summary sections are not kept: their tables
repeat names already indexed elsewhere.

`collectMentions` in `catasto-name-index.js` reads these sections as references. It uses the existing readers
(borders, "collects/esige") plus one more for the owner who opens a block: a standalone name line, or one ending
"possesses:/possiede:", as in "Magnifico Antonio La Piana of the Casale delle Piane". Their origin ("of the city of
Cosenza") becomes the residential location, so non-residents are indexed under where they live. Only the Name Index
reads these sections. The report, the 3D view, Landholdings, search and the XLSX Index (one row per household member)
do not.

### 5. Version and existing projects

`PARSER_VERSION` goes to 8 and `entry_boundary_version` to 6. Opening a project offers the existing reviewed
reparse, which keeps a snapshot and the user's edits.

## Effects on the Marano project (expected)

- Cassandra Conte's entry ends at page 415, with her own holding and her collection from Vincenzo Venturo.
  The 32 false land neighbors go away.
- 355 entries, the same as now. No resident is lost: the last resident entry is on page 415.
- Non-resident names (the Marchesa della Valle, Antonio La Piana…) remain only where residents' entries
  name them: as land or residence neighbors with "no household entry found", or as search results.
  They get no holdings of their own in the 3D view or Landholdings.
- Domenico Pellegrino's missing page is already fixed by the current parser (version 7). The saved project
  is version 6, and the reparse brings it up to date.

## Decision (2026-11-12)

The Name Index keeps people named only in excluded sections (design §4). The XLSX Index follows the entries.

## Tests

- **Parser:** heading recognition in both languages; the 396 mistranslation classed resident through its Italian
  pair; a mid-page heading ends the entry at the right line; excluded text is skipped; summary is skipped to the end;
  a source without headings parses unchanged.
- **Synthetic fixture:** a small two-language Catasto with each section kind and invented names.
- **Name Index:** an owner named only in an excluded section is indexed with their origin, and a name
  that is in both an entry and an excluded section appears once.
- **Validation:** reparse the saved Marano source. Conte ends at page 415, the entry count stays 355, and no resident
  entry changes except Conte's.

## Build order

1. Heading recognition and pairing, with tests. **Built** (`sectionHeadingKind`, markers in
   `extractTranscriptionSections`; `splitEntries` ignores them for now). On the Marano source the markers fall
   at pages 352–396 (resident and excluded), 416–461 (excluded), 477 (summary, from the Italian "Collettoria
   generale" on p. 462), and 483–538. Entries are unchanged. Two refinements: consecutive heading lines count
   as standalone ("Collettoria generale" over "— Cittadini —"), and a summary headed only in Italian starts at
   the next English text. Long headings with a verb (the absent citizens' "…who pay the hearth tax") are not
   recognized; that is harmless where the kind doesn't change.
2. Entry splitting by section, with tests and the synthetic fixture. **Built.** The heading line is left out of
   entries. On the Marano source, 350 entries are unchanged and 5 lose trailing text:
   - Nicolò Salerno, Cleric Lorenzo Aijello, Vittoria Scilla: only the heading that followed them.
   - Cleric Francesco Cimino: the village chapel's holdings, pp. 394–396.
   - Cassandra Conte: everything after p. 415.

   One household is recovered: Agostino Chiappetta's (p. 396), which had been inside Cimino's entry. Its head
   line reads "age — 40", which is not read as an age, so the parser takes his wife, Angela Russo, as head.
   That is for the transcript to fix.
3. Excluded sections kept in the data and read by the Name Index, with tests. **Built** (parser version 9). On the
   Marano source: 11 sections (pp. 394–396, 416–461), about 42,000 characters in English. The Name Index grows from
   1,744 to 1,771 people in English and 1,743 to 1,758 in Italian, with owners under their origin (Giacomo Giraldi,
   Cosenza; Gennaro Bartuccio, San Vincenzo). The XLSX Index is unchanged.
4. Validate on the Marano source; bump the parser version.
5. Bump the app version; update `HANDOFF.md` and the footers.
