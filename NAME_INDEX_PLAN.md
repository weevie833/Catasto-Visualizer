# Name Index / Indice Onomastico: Plan

**Status:** Built in V 0.08 (2026-11-09). This file records the rules the export follows.

## Goal

Admin exports every person named in a Catasto project as a lexicon for other projects, chiefly as the name lexicon in a Customizable Transcriber prompt profile. The same index is exported as JSON, CSV (for Excel), and Markdown.

## Scope

- Admin only. The index is built from the stored project when exported and is never saved; project files, the server API, and `parser_version` do not change.
- It reads the stored source entries, so it reflects the user's corrections. It reports names as the scribe wrote them (including errors such as `GiovanniBattista`); fixing them is done by correcting the entry.
- Spelling variants stay separate (`Paolo` and `Paulo` are two entries).

## Fields

In this order:

| Field | Content |
|---|---|
| `honorific` | `Don`, `Reverend Don`, `Magnificent`, `Lady`, `Marchesa`, … or empty. When one person is called differently, the fullest form used is kept. |
| `given_name` | As written, compounds kept whole (`Giovanni Battista`). |
| `surname` | As written, with particles (`di Rangho`, `de Amato`), never annotated. Empty when the source does not establish it. |
| `surname_derived` | Empty when the surname is written in the source or follows clearly from the listing. Otherwise a short note on how an uncertain surname was assigned, such as `Stepchild: head's surname` (see below). |
| `qualifier` | How the scribe tells same-named people apart: `son of Santo`, `son of the late Francesco`, `widow of the late Domenico Covello`. Empty otherwise. |
| `residential_location` | The village or city the person is from. |

No frequency field: the Transcriber's lexicon has no weighting, so a count would not change the prompt.

## Who is included

- Household heads and members.
- Parents named in a patronymic (`son of the late Antonio`), deceased or not.
- A widow head's late husband (`widow of the late Francesco Marino`).
- People named as residence neighbors, land borders, and in payment clauses (`pays to`, `paid to`, `is owed by`).
- Not included: institutions and public anchors (`the Chapel of the Purgatory of this Land`, `the Reverend Clergy of the Land of Rende`, the public road, the river).

## Surnames for people listed without one

Anyone listed with a surname keeps it as written. Wives are listed under their maiden surname, and so are in-laws (in the corrected transcription, 260 of 265 wives and every daughter-, son-, sister-, and mother-in-law; the 5 wives without a comma still carry a surname, as in `Caterina Cimino wife`).

A surname written in the source always wins, for any relation: `Carlo Storino, son-in-law` and `Giulio Storino, nephew` keep Storino.

| Person listed without a surname | Surname | `surname_derived` |
|---|---|---|
| Son or daughter, male head | Head's surname | Empty |
| Son or daughter, widow head | Late husband's surname; empty if he is not named | Empty |
| Brother or sister of the head | Head's surname (a widow head's own surname) | Empty |
| Parent from a patronymic | Child's surname | Empty |
| Grandchild or nephew/niece listed after a son-in-law or brother-in-law | That in-law's surname | Empty |
| Grandchild or nephew/niece listed after a son or brother of the head | Head's surname (the late husband's, under a widow head) | Empty |
| Brother-, sister-, father-, or mother-in-law | The head's spouse's surname: the wife's maiden surname, or a widow head's late husband's surname | `In-law: spouse's surname` |
| Stepchild | Head's surname | `Stepchild: head's surname` |
| Nephew/niece with no clear surname connection | Head's surname | `No parent listed: head's surname` |
| Child listed after a man whose relation is not stated | That man's surname | `Relation of preceding man not stated` |

Children take the surname of the nearest man listed before them who is an in-law, son, or brother. A daughter-in-law or sister-in-law between them changes nothing: she keeps her maiden surname, and the children carry her husband's.

A son- or daughter-in-law without a surname gets none: their surname comes from their own family, not the head's spouse. The corrected transcription has none.

Only men aged 15 or over (or of unstated age) count as the man before a child, so a young son listed earlier does not give a niece his surname. A member listed with two given names and no surname (`Francesco Antonio, his son`) keeps both as one given name when each is listed alone elsewhere in the project.

Examples from the corrected transcription:

- Agostino Spizzirri: `Tomaso, stepson` becomes Spizzirri, noted `Stepchild: head's surname`.
- Gennaro Belmonte: `Giovanni Belmonte, brother`, `Lucrezia Covello, cousin`, then `Innocenza, niece`, who becomes Belmonte from the brother, with no note.
- Ignazio Zupo: `Teresa, sister, married`, `Paulo Serpe, brother-in-law`, then `Marco, nephew` and `Cicilia, niece`, who become Serpe.
- Domenico Aijello: `Marco di Bartolo, son-in-law`, then Francesco, Vincenzo, Annunziata, and Angela, who become di Bartolo.
- Diego di Bartolo: `Michele Belmonte, son-in-law`, then `Dianora, granddaughter`, who becomes Belmonte.
- Gaspare di Filippis, brother, and `Caterina Morrone, sister-in-law`, then `Giuseppe, nephew`, who becomes di Filippis, not Morrone.
- Francesco Puccio: `Antonio, son` and `Ursula Circhisa, daughter-in-law`, then five nephews and nieces (the Italian `nipote`, here grandchildren), who become Puccio.
- Leonardo Coscarello: `Barbara, daughter, married`, then `Nicolò Guido, miller`, with no stated relation, then `Carlo, grandson`, who becomes Guido, noted `Relation of preceding man not stated`, because the source does not call Nicolò a son-in-law.

**Noted surnames.** The JSON, CSV, and Markdown table all carry the `surname_derived` column, so the user can filter, exclude, or correct those people. The Transcriber lists include them like any other name: a noted surname is always one already attested in the project.

People with an empty surname still contribute their given name to the Transcriber lists.

## Residential location

1. Default: the project's village, set in the export dialog. It is suggested from the page heading without its year (`Marano Marchesato 1754` gives Marano Marchesato). `Marano` alone is kept apart: in the source, `the Land of Marano` is always Marano Principato, a different village.
2. A named place overrides the default: `of the Land of Rende`, `of the City of Cosenza`, `della Terra di Castelfranco`, `Città di`, `Casale di`. City, Land, and Casale are dropped, so `Land of Cosenza` and `City of Cosenza` are both Cosenza.
3. `of this Land`, `of this City`, `di questa Terra/Città` mean the village. When the phrase also names a place (`of this Land of Rende`), the named place wins.
4. Household members, parents from patronymics, and a widow's late husband take the head's location.
5. Districts within the village (San Nicola, Pasolani) are not locations. A household's stored residence counts only when it is a town named elsewhere in the project (Rende, Cosenza), as residence corrections set.
6. `of Rende` without Land or City counts when Rende is named elsewhere with one.
7. A person mentioned without any origin is of the village, unless the same name appears only with one other origin and never as a village household: `bordering Gaetano Ferrari` joins `the Magnificent Gaetano Ferrari of the city of Castelfranco`.

## One entry per person

- De-duplication is by given name and surname only, across places. Achille Covello, mentioned many times, appears once.
- Where a name has a version with a qualifier, that version is kept and the plain mentions join it: `Angela di Bartolo` and `Angela di Bartolo, widow of Gaetano Molinaro` give one entry, with the qualifier. Gennaro Belmonte appears once, as `son of Santo`, although the source also lists an unqualified head of that name.
- A name with two different qualifiers keeps both (Antonio Chiappetta `son of Paulo` and `son of Tomaso`); plain mentions of it are dropped, since they could be either.
- Without a qualifier, a name keeps the place written for it in a household entry; otherwise the place most mentions give.
- A title without a given name (`Most Illustrious Lady Marchesa della Valle`, `Donna Ruffulo`) is not a name and is left out.
- When one person is given several honorifics, the longest is kept. A surname written anywhere for a person clears a `surname_derived` note.

## Exports

Both come from one index, sorted with the village first, then by location, surname, and given name.

- **JSON** (`<project>-name-index.json`): `format: "catasto-name-index"`, `version: 1`, project name, village, source language, parser version, export time, and `people` with the fields above.
- **CSV** (`<project>-name-index.csv`): the table only, one person per row with the six fields as columns. It starts with a UTF-8 byte-order mark so Excel shows accented names correctly, quotes every field, and uses Windows line endings. A value beginning with `=`, `+`, `-`, or `@` gets a leading apostrophe so Excel never runs it as a formula.
- **Markdown** (`<project>-name-index.md`): a heading with the same details, the full table, then a section **For the Customizable Transcriber** with three one-per-line lists matching its three lexicon boxes: Surnames, Given names, and Full names (`Given Surname`, no honorifics). Each list holds unique values.

## Code layout

The feature is rarely used, so it stays out of the core files.

- **New `catasto-name-index.js`**: `buildNameIndex(data, { village, projectName })`, `toJson`, `toMarkdown`, `suggestedVillage`. It holds the honorific and institution lists, location phrases (English and Italian), the clauses that name people (borders, payments, collections, landlords), surname inheritance, and de-duplication. It reads the member lines and narrative of each stored source entry and uses the parser's exported helpers (`isMemberLine`, `isHouseholdNarrativeLine`, `memberPersonName`, `isItalianMemberLine`, `splitItalianMemberLine`, `surnamePhrase`, `isPublicAnchor`) and `CatastoRelations.roleOf`. Only `admin.html` loads it.
- **`catasto-relations.js`**: unchanged. Its `landNeighborNames` normalizes away honorifics and origins, so the index reads border clauses itself; Admin loads the file for `roleOf`.
- **`app.js`**: unchanged. Its `splitHonorificName` stays where it is; the index keeps its own honorific list, since sharing it would mean moving code out of the Visualizer for one export.
- **`admin.html` / `admin.js` / `admin.css`**: a Name Index button on each project row opens a small dialog with the village and three buttons: Export JSON, Export CSV (Excel), and Export Markdown. About 30 lines in `admin.js`; the dialog is in `admin.html`.
- **`serve.py`**: `catasto-name-index.js` is in `APP_FILES`. `eslint.config.mjs` declares `CatastoNameIndex`.

## Known limits

- Names are read only after the words that introduce them (bordering, pays to, collects from, the house of, giusta li beni di, confina, paga a, esige da). A person named elsewhere in the narrative is not indexed.
- Some scribal or translation errors pass through as written, such as `Merano Principato` or `Carlo Padre`; correct the entry to change them.
- The corrected bilingual file puts `Italian Transcription` on the page-heading line, which the parser does not yet read as an Italian section, so an IT project from that file has one household. ENG is unaffected.

## Tests

`catasto-name-index.test.mjs`:

- Children of a male head and of a widow head (`Anna Belmonte, widow of Natale Cosentino`: Saverio and Antonio Cosentino).
- A widow head's sister keeps the head's surname.
- Compound given names, a typed village, and the Admin dialog's two exports, which save nothing.
- Patronymic parents, including `the late`.
- Written surnames winning over every derived one, in-laws taking the head's spouse's surname, and each example above, with `surname_derived` filled only for in-laws, stepchildren, unclear nephews and nieces, and children after a man of unstated relation, and surnames never annotated.
- `of this Land`, a named place, `of this Land of Rende`, the Italian forms, and the village default.
- Same-name heads kept apart by their qualifier; repeated mentions collapsed; an unqualified mention adding no entry.
- Institutions and public anchors left out; honorifics kept in their own field.
- Markdown lists unique and honorific-free; JSON field order.

A fixture test runs on the corrected bilingual Marano transcription (`MM 1754 Catasto Onciario Transcription-CORRECTED-ENG.md`) when `CATASTO_VALIDATION_MD` points to it, and is skipped otherwise. The file stays outside the repository.

## Release

V 0.08 in the footers of `index.html` and `admin.html` and in `INSTALL.md`. Update `HANDOFF.md` and `ARCHITECTURE.md`.

## Measured on the corrected transcription (English-only file of 2026-11-08)

- 32 widow-headed households, most `widow of [the late] Given Surname`.
- 39 `son/daughter of [the late] X` patronymics.
- Locations: `of this Land` 128, `of the Land of Rende` 113, `of the City/city of Cosenza` 88, `of the Land of Castelfranco` 23, `of the Land of Marano` 12, plus Cerisano, Scigliano, Aijello, Figline, and others.
- Honorifics: Don 94, Magnificent 64, Reverend 49, Lady 21, Reverend Don 14, Magnificent Don 10, Marchesa 6, Donna 6.
