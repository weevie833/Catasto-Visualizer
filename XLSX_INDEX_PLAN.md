# XLSX Index: Plan

The Name Index dialog in Admin has an **Export XLSX Index** button. It writes `<project>-index.xlsx` in the layout of
the Customizable Transcriber's "Catasto Onciario Index" template, so a Catasto can be compared with the other
indexes a user keeps (parish registers, other villages' Catasti) to find the same people: landowners, nobles,
families. Like the Name Index, it is built from the stored source entries when exported and never saved.

## Layout

One sheet, `Nati`, with the template's single header row (frozen), its fills, and its column widths:

| Column | Heading | Contents |
|---|---|---|
| A | Image Number | The page or pages of the person's household entry ("5, 6"); for a person named only in other entries, the page of the first mention |
| B | Honorific | Titles as written: Don, Donna, Magnificent, Master, Reverend, Sister |
| C | Given Name | |
| D | Last Name | Assigned as in the Name Index (children take the father's surname, a widow's children the late husband's) |
| E | Age | As written; an infant listed without an age is 0; blank when no age is given |
| F | Birth Year (est.) | The Catasto's year (from the project title) minus the age |
| G | Occupation | As written beside the name (shepherd, day laborer, student, domestic nun). Magnificent or Illustrious makes a Noble; Priest, Cleric, and Deacon move here from the titles; Sister also makes a Nun |
| H–I | Father Given Name, Father Last Name | See Parents |
| J–K | Mother Given Name, Mother Last Name | See Parents |
| L | Resident Village | The residential location, as in the Name Index |
| M | Resident District | The district of the household's house as the record writes it ("Pasolani", "San Nicola"); blank for people not in a household. Spelling variants are left for the user to merge with Find/Replace |
| N | Notes | The relation to the head, the scribe's qualifier, conditions (married, unmarried, decrepit), the derived-surname note, anything to check, and every page that mentions the person |

## Who gets a row

Everyone the Name Index finds: household members, fathers named in patronymics, a widow's late husband, and people
named as neighbors, landlords, creditors, or debtors. Parents have their own rows as well as appearing beside their
children, so their own ages and occupations are kept.

- Each household member is a row of their own, even when another person has the same name: their ages and
  households tell them apart.
- A mention elsewhere joins the one person of that name. A qualifier tells same-named people apart ("son of Santo"
  joins the Gennaro Belmonte whose father is Santo).
- A mention that could be several people ("bordering Gennaro Belmonte") adds its page to each of them, noted
  "another person has the same name; check the source".
- A deceased person ("the late", a widow's husband) is never joined to a living household member.
- People named only in other entries are one row per name, with "Not listed in a household".

## Parents

- Head: the father named in a patronymic, if any.
- Son or daughter: the head and his wife; under a widow, her late husband and the widow. A head with no wife:
  "Mother not listed". A woman head who is not a widow: she is the mother, "Father not stated; check the source".
- Brother or sister of the head: the head's father, if named.
- Grandchild, nephew, niece: the preceding son or son-in-law (grandchild), or brother, brother-in-law, son, or
  son-in-law (nephew, niece), noted "Father taken as the preceding …; check the source". Without one: "Parents not
  stated in the record; check the source".
- Stepchild: blank, "Stepchild: parents not stated in the record; check the source".
- Others (in-laws, cousins, members with no stated relation): blank; the relation is in Notes.

## Pages

The parser records where each page begins inside an entry (`source_page_breaks`: page and the opening words), so a
mention is placed on its own page even in an entry that runs over many pages. An entry that starts mid-page now also
records the page it starts on. Projects created before this change have neither: their mentions take all of the
entry's pages, and entries that started mid-page lack their first page until the project is created again from the
transcription.

## Code

- `catasto-xlsx-index.js`: `buildXlsxIndex(data, { village, projectName })` returns `{ village, year, rows }`;
  `toXlsx(index)` returns the file's bytes; `LAYOUT` is the template's layout. It reads the Name Index's
  `collectMentions` and `CatastoRelations.descriptionOf`.
- `catasto-xlsx.js`: a small writer for one styled sheet in an uncompressed ZIP (`workbook`, `zip`, `crc32`).
- Both are loaded only by `admin.html` and listed in `APP_FILES`.
- A change to the template means changing `LAYOUT` and the row order in `buildXlsxIndex`.

## Tests

`catasto-xlsx-index.test.mjs` covers the layout, ages and infants, parents (household, widow, uncertain cases), a
patronymic father joining his household row, ambiguous mentions, pages and districts, titles and occupations, and the
package itself (unzipped, CRCs checked). With `CATASTO_VALIDATION_MD` set it also checks the current Marano
source (the saved project's stored source text, an export, or a transcription). `catasto-parser.test.mjs` covers the start page and page breaks; `admin.test.mjs` the button.
