# Adjacent Evidence Report: Plan

**Status:** Historical design record. The report was implemented in V 0.07 (see `HANDOFF.md` and `catasto-relations.js`, which are the current specification). The fourth degree (institutions) and connections through a third party were dropped in V 0.10: they gave more noise than insight. Payments are not evidence of proximity. The planning text below is kept as written on 2026-11-03.

## Goal

When a person is selected, assemble the data around them so that, in its totality, it shows patterns pointing to family relations a plain text index would not reveal. The Visualizer makes associations material through location; the report goes further into blood lines and institutional ties.

Speculative links are the purpose of the report. They are leads for the user to investigate, not conclusions.

## Scope

- The Visualizer informs decisions made in other systems, such as Ancestry.com, FamilySearch.org, or an Excel index.
- The report is computed and read-only. It has no tools to accept, reject, annotate, or save relationships.
- Correcting a Catasto entry remains the only user edit. A correction changes the next report generated from it.
- No changes to the project file format, exports, or server are expected.

## Degrees of association

| Degree | Covers |
|---|---|
| First | Parents, siblings, spouse, children |
| Second | Cousins, uncles, extended family by blood or marriage |
| Third | Neighbors by household and landownership |
| Fourth | Churches and other institutions |

The degree says what kind of tie it is. A separate label says how firm the evidence is:

- **Stated:** written in the record ("Pietro, son").
- **Derived:** follows logically from the record (Pietro and Giulia are siblings).
- **Lead:** speculation from combined clues.

## Interface

- Split the lower text panel in half: Source Tax Entry on the left, Adjacent Evidence on the right, with the same text formatting and scrolling.
- The report appears automatically on selection. There is no button, icon, pop-up, or new tab.
- The Edit button stays with the source entry.
- On narrow windows, stack the source entry above the report.
- Expand mode covers the report, as it covers the source entry today.

### Draggable divider

A draggable horizontal border between the 3D view and the text panels sets how much space each gets, as in Camtasia's canvas and timeline. Drag up for more text, or down for more 3D view.

- **Layout change:** the 3D view and text panels share the window height exactly. The page stops scrolling, and each text panel scrolls on its own. This replaces the 3D view's fixed height (`.scene3d` in `scene3d.css`) and the 150px text height (`.evidence-block p`).
- **3D view:** it already re-fits through its `ResizeObserver` in `scene3d.js`, so the drawing should need little work.
- **Handle:** a thin bar with a small grip, and a resize cursor on hover.
- **Limits:** minimum heights keep the 3D toolbar and controls and a few lines of text visible.
- **Reset:** double-clicking the bar restores the default split.
- **Remembered size:** the split is stored in the browser's `localStorage` as a display preference, not in project files. The app must still work if storage is unavailable.
- **Accessibility:** arrow keys move the bar when it has keyboard focus, and dragging also works on touch screens.
- **Narrow windows:** the divider turns off, and the panels stack.
- **Possible later addition:** a similar handle between Source Tax Entry and Adjacent Evidence, only if the even split feels limiting.

### Who the report is about

Selection records only a household today. It also needs to carry the person clicked.

| Clicked | Report is about |
|---|---|
| Household head or 3D building | The household head |
| Family member result | That member |
| Reference result | The person named, with whatever is known about them |
| Landholdings view | The owner, with the selected parcel listed first |

The heading names the person: "Adjacent Evidence: Pietro, son in Angelo Chiappetta's household".

### Clickable names

Clicking a name moves the Visualizer to that person and replaces the report with theirs.

| Person | Click result |
|---|---|
| Household head | Selects the household and highlights the name in the source entry |
| Household member | Same, matching their full source line so the highlight lands on the right person |
| Named only in another entry | Opens the entry that mentions them; if there are several, the report lists them |
| Could be more than one household | Lists the candidates rather than choosing one |
| Landholding | Switches to the Landholdings view and selects that parcel |

- Names in the Source Tax Entry are links too: the head, each member (matched within their own line), and residence and land neighbors. The person already shown is left as plain text.
- A small Back link in the report heading retraces the trail. It lasts only for the session and is never saved.
- Member search results currently highlight only the first name at its first appearance, which can mark the wrong person. Matching the full source line fixes this for report links; use the same approach for search results.

### Carrying findings elsewhere

- Every fact and lead shows its source page, such as "Marano Marchesato 1754, p. 355".
- Leads stay labeled in the text itself, so a guess does not look like a recorded fact once pasted elsewhere.
- Optional: a small Copy button that copies the report as plain text, with citations and labels.

## Report layout

Every section stays visible when empty, so "nothing recorded" is distinct from a missing section. Headings and sentence templates need English and Italian versions.

The sample below uses current transcription data. `[Brackets]` mark clickable names.

```text
ANGELO CHIAPPETTA
Shepherd, age 30. Head of a household of four.
Lives in his own house in the Pajoli neighborhood.
Source: Marano Marchesato 1754, page 5

FIRST DEGREE: IMMEDIATE FAMILY
Wife: [Rosolia Bruno], age 26
Son: [Pietro], age 3
Daughter: [Giulia], age 1

SECOND DEGREE: EXTENDED FAMILY
None stated in this entry.

THIRD DEGREE: NEIGHBORS AND LAND
Household: borders [Isabella Orrico]
"Persano Lento" (chestnuts): borders [Gioacchino Venturo]
  and [Giovanni Battista Passarello]

FOURTH DEGREE: INSTITUTIONS
None recorded.
```

Leads appear within each degree, after what the record states. Each shows its reasoning:

```text
LEAD: [Achille Covello] may be close kin of Domenico Covello
- Domenico's widow, [Anna Ruffulo], lives next to Achille (p. 12, p. 355)
- One of her parcels also borders Achille (p. 355)
- Her age (60) fits brother or cousin better than son (Achille is 65)
```

## Lead rules

- **Combined evidence:** a lead strengthens as independent clues add up: surname, adjacency, shared land borders, age fit, shared institution.
- **Strength labels:** Strong, Moderate, or Weak, always with the clues shown. No percentages; the records cannot support that precision.
- **Surname rarity:** a shared rare surname counts for more. Chiappetta heads about 21 households, so a match there means little alone.
- **Women's surnames:** wives are recorded under their own surnames, so a wife's surname can point to her birth family's household.
- **Age plausibility:** rank possible relationships by age, and say when the ages argue against one.
- **Connections through a third party:** show each step, such as person > church > person. Limit to two steps at first, or nearly everyone connects to everyone.
- **Same-name warnings:** leads built on a name match must say so. "Pietro Spizzirri" appears in 15 entries and covers at least two men: Don Pietro, 42, and a 20-year-old brother-in-law in Gennaro Gabriele's household.
- **Institution wording:** report what the record shows ("pays the Convento di San Domenico"). The current transcription has payments and shared borders, not membership; "Parrocchia" never appears in it.

## Technical approach

- No semantic engine is required. Rules can find the evidence, check ages, and build leads.
- AI could be an optional later layer that suggests patterns the rules missed. Its output must be marked as speculation and tied to source entries.
- Add a new module, such as `catasto-relations.js`, with a function like `buildPersonReport(data, personRef)` that returns structured sections. Keep it separate from the display, so the new database mainly affects this module.
- `personRef` holds the household id plus a member id, or a name for people known only from references.
- Build any lookup tables once per loaded project, and rebuild them after a source edit.
- Add new files to `APP_FILES` in `serve.py`. Build all report markup without inline scripts or styles, as the Content-Security-Policy requires.
- Add tests alongside the existing `.test.mjs` files.

## Evidence in the current transcription

Measured with rough pattern matching on the Italian side of the 300-page transcription (362 households). Approximate, and to be re-measured on the new database.

| Evidence | Count |
|---|---|
| Non-head member lines | 1,524; 36 have no kin term matched |
| Stated extended kin | *nipote* 58, *cognato/a* 34, *nuora/genero* 20, *cugino/a* 3 |
| Links to named neighbors | 393: 250 matched to a household, 133 unmatched, 10 ambiguous |
| Landholding clauses recognized | 627; neighbor matching not yet measured |
| Households sharing a surname with another head | 291 |
| Wives with a surname | 261; 209 match some head's surname, 33 match exactly one household |
| Heads stating a patronymic | 25; no sibling pairs found from these |
| Households mentioning an institution | 96; about 53 pay one, about 29 border one |

*Nipote* is ambiguous: it can mean niece, nephew, or grandchild. Institution names vary and need a list merging their variants, such as the forms of "Convento di San Domenico".

## Before building

1. Re-measure the evidence above on the new database.
2. Find out whether the new data keeps the current format or adds structured fields for neighbors and institutions.
3. Check what happens when a linked person is outside the district being shown. The view should switch to their district.
4. Decide whether to include the Copy button.

## Build order

1. Split panel, draggable divider, person selection, and the report for stated kin and household neighbors. **Built.**
2. Derived kin, land neighbors, and clickable names with Back. **Built.**
3. Family leads from other entries, moved ahead of institutions. **Built:** households of the same surname ranked by neighbors, two-step neighbors, land borders, district, age fit, and surname rarity; women of the surname in other households; widows' late husbands' families; in-laws who share the wife's surname.
4. Institutions, including the merged name list.
5. Connections through a third party, such as a shared church.
