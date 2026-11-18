# Response to CODEX_REVIEW_3.md (round 3)

Reviewed 2026-11-18 against HEAD `ecbcad5`. I reproduced each finding before changing anything, and each fix has a
regression test that fails without it. All four actionable findings are fixed: R3-01, R3-02, M6 and R3-03. None
needed a new decision, and I disagree with no finding. Nothing is committed or pushed. The previous response is now
`CLAUDE_RESPONSE_8.md`.

Codex is right that the API cache change was already committed in `ecbcad5` when the request called it
uncommitted. I committed it after writing the request and did not update the request.

## Validation

- `node --test *.test.mjs`: **175 tests, 172 passed, 3 skipped, 0 failed** (171 before; 4 added).
- With `CATASTO_VALIDATION_MD` naming the saved Marano project: **175 passed, 0 failed.** This includes the
  English/Italian agreement check that failed in round 2. Two of these private-source checks held assumptions
  that V0.10 had made untrue, and I updated them (see "Private-source checks" below).
- `python3 -m unittest test_serve`: 55 passed. `npm run test:browser`: 1 passed. `npx eslint .` and
  `.venv/bin/ruff check .`: clean. `npm audit`: **0 vulnerabilities**.
- **Each new test was run without its fix:** the three parser and Name Index tests and the new relations test
  fail on the HEAD versions of `catasto-parser.js`, `catasto-name-index.js`, `catasto-relations.js` and `app.js`.
- **Parse of the current Marano source, before and after** (required by `CLAUDE.md` before a parser change).
  This compares each household's head, pages, residence place, residence neighbors and member lines, in English
  and in Italian. **No household, residence, neighbor or member line changes in either language; 367 households
  on both sides.** The only addition is `excluded_sections` (11 sections, pp. 394–396 and 416–461).
- **In the app**, on a copy of the saved project in a temporary library, the Visualizer offered the update. The
  review showed households 367 → 367, residences 350 → 350 and resolved neighbor links 368 → 368, with 0 changes,
  additions or removals. After the update the copy was at version 9 with 11 excluded sections. Admin loaded
  without console errors. Your saved library was only read.
- **Not tested:** Windows, a real Python 3.7, power loss (unchanged).

## CRITICAL

None reported.

## HIGH

### R3-01 — A creditor label switches the parser into an excluded section

**RESOLVED.**

Reproduced: Codex's example gives `["Bruno Ventrella", "Carlo Rossi"]` on V0.09 and `["Bruno Ventrella"]` on
HEAD, with `[[SECTION:excluded]]` placed before "To the Chapel of the Rosary".

- **What changed:** `sectionHeadingKind` returns no heading for a line that starts by naming a payee: English
  `to`, `unto`, `towards`, `due to`, `owed to`, `paid to`; Italian `al`, `alla`, `alle`, `allo`, `agli`, `ai`,
  `all'`, `a'`. A real heading such as "Chapels of this Land" is still one.
- **Version:** `PARSER_VERSION` 9 and `entry_boundary_version` 7. Saved projects are offered the reviewed update;
  nothing is reparsed on load.
- **Marano:** none of its 31 detected headings starts this way, so its parse is unchanged.
- **Test:** `catasto-parser.test.mjs`, "a payee label standing alone is not a heading, so the residents after it
  are kept". It uses Codex's example in English and an Italian counterpart, and checks that a true heading is
  still recognized.
- **Residual risk:** a standalone line naming one chapel *without* a payee word ("Chapel of the Rosary") inside a
  resident section is still read as an excluded heading. Marano needs that reading: "Chapel of this Land" (p. 394)
  and the chapels on pp. 459–461 are real headings. Telling these apart needs more context than one line gives,
  so I left it as it is.

## MEDIUM

### R3-02 — The approved Name Index coverage of excluded sections is absent

**RESOLVED — `SECTION_HEADINGS_PLAN.md` step 3 built as decided on 2026-11-12.**

Confirmed: `data.excluded_sections` was undefined, and the Name Index read households only.

- **Parser:**
  - `excludedSections` keeps each excluded section as `{ heading, source_pages, source_page_breaks, source_entry }`
    in `data.excluded_sections`. These are the same fields a household record has, so the existing page splitting
    and anchor checks (L3) apply unchanged.
  - The heading line is not part of the text. Summary sections are not kept, and nothing after a summary is.
  - Page-break code shared with households moved to `pagedText`. Household output is unchanged.
- **Name Index:**
  - `collectMentions(data, { excludedSections: true })`, which `buildNameIndex` uses, reads each section in two
    ways:
    - the owner who opens each block: a line that is only a name, with or without an origin, or one ending
      "possesses:" / "possiede:", indexed under the place it names
    - the people the text names, read as references with the existing readers
  - The owner reader skips lines that open with a verb or a preposition ("Esigge da …"), lines with digits, and
    sentences.
  - People named both in an entry and in a section appear once, through the existing grouping.
- **XLSX Index:** `buildXlsxIndex` calls `collectMentions` without the option, so it follows the entries as
  decided. Its output on the Marano project is byte-identical in English. In Italian it changes only through the
  `esigge` fix below.
- **Not added to:** households, the 3D view, Landholdings, search or the Adjacent Evidence report. None of them
  reads `excluded_sections`.
- **Reader fixes found while checking Marano** (each removed a false or garbled name the new sections exposed):
  - "Magnifici" (plural) is a title, as "Magnifico" is. Without it, "per li Magnifici Maurizio e Don Gaetano
    Cusinelli" gave a person named "Magnifici Maurizio".
  - "Monte familiare" (a family fund) is an institution, as "Monte di …" already was.
  - `Esigge da` with a double g is read like `Esige da`. In Italian resident entries this adds two real references
    the old spelling missed: Giacomo Passarello (p. 199, in Lorenzo di Filippis's entry) and Paulo di Carlo of
    Marano Principato (in Marzio di Luca's entry).
- **Effect on the Marano Name Index:**
  - English grows from 1,744 to 1,771 people; Italian from 1,743 to 1,758.
  - New people are mostly non-resident owners under their origin (Giacomo Giraldi, Cosenza; Gennaro Bartuccio,
    San Vincenzo; Saverio Arture, Montalto; the Matalone, Vericillo and Chiodi collectors, Rende), plus residents
    named only in those sections.
  - Several people already indexed gain a fuller title or a different place, because a section says where they
    live. Giacomo Giraldi moves from Marano Marchesato to Cosenza ("of the city of Cosenza"). Gregorio Cajra moves
    from Marano Principato to Marano Marchesato, because a section names him "of this Land" where before his place
    came only from one other mention.
  - Magnifico Antonio La Piana is placed at "Piane", from "of the Casale delle Piane": the place is the name after
    the locality word, as for "Land of Rende".
- **Tests:**
  - `catasto-parser.test.mjs`, "excluded sections are kept with their heading and pages, apart from the entries;
    summaries are not"
  - `catasto-name-index.test.mjs`, "the Name Index reads excluded sections: owners under their origin, once each;
    the XLSX rows do not". It covers English and Italian, an owner with an origin, a "collects the following"
    owner, an institution, an "Esigge da" line, a "Montefamiliare" line, and a resident named in both.
  - The Marano Name Index check now asserts Giraldi (Cosenza), Bartuccio (San Vincenzo) and Maurizio Cusinelli.

### M6 — D12's upstream-release trigger has occurred

**RESOLVED.**

Confirmed with `npm view`: ESLint 10.15.0 and `@eslint/config-array` 0.23.6 depend on minimatch `^11.0.5`.

- **What changed:** `eslint` 10.13.0 → 10.15.0 (exact pin; `npm install --save-dev --save-exact
  --ignore-scripts`). The lockfile resolves minimatch 11.0.9, deduplicated. `@eslint/js` stays at 10.0.1, its
  latest version. No override and no downgrade.
- **Validation:** `npm audit` reports 0 vulnerabilities. Lint is clean, and it still reports a deliberate unused
  variable and an undefined name. All tests pass.
- **Docs:** D12 in `HUMAN_DECISIONS.md` is marked resolved, and the caution in `HANDOFF.md` is updated.

## LOW

### R3-03 — Payment-only references still appear as report mentions

**RESOLVED.**

Reproduced: "He makes a payment to Carlo Rossi.", "He collects from Carlo Rossi five ducats." and "He receives
from Carlo Rossi five ducats." each gave Carlo Rossi a "Mentioned in Bruno Ventrella's entry" line. So did
"Esigge da Carlo Rossi …".

- **What changed:** one word list, `FINANCIAL` in `catasto-relations.js`, now serves both the report
  (`isPaymentSentence`) and search (`sourceReferenceType` in `app.js` calls `CatastoRelations.isPaymentSentence`).
  The list combines the words each one had and adds `payment(s)`, `collect…`, `receiv…`, `debtor`, `pagamento`,
  `debitore`, `creditore`, `esig…` (both spellings) and `riscuot…`.
- **Marano:** the reports for all 367 household heads are identical before and after. The filter affects only
  reports on people known from references alone.
- **Test:** `catasto-relations.test.mjs`, "payments, collections and receipts are never mentions; a border with
  the same person still counts". It also checks that a non-financial sentence ("She sold a field to Lucia Serra.")
  is still a mention. Land and residence borders are read separately and are unaffected.

## INFORMATIONAL

### I3 — Windows release readiness

**Acknowledged; no code change this round.** I agree with Codex's reading. Two of its suggestions are mine to
offer and yours to choose:

- **A Python version check in the Windows launcher**, as the Mac launcher has. It is a small change, but it needs
  a Windows machine to verify, so I have not made it.
- **The manual Windows checklist** Codex lists (non-administrator account, a path with spaces and non-ASCII
  characters, launcher and manual start, create/edit/reload, backup/import, reviewed reparse/restore, delete,
  duplicate launch, restart after interrupted work, and the profile permissions). It needs a Windows machine.

How to describe Windows support in the release is your decision.

### I4 — API caching change

**Acknowledged.** No change needed.

### I5 — Documentation and test boundaries

**RESOLVED.** `HANDOFF.md` now gives the bilingual figures measured on 2026-11-18 with parser version 9: 367
households on both sides, 363 heads paired, and 369 of 378 English residence neighbors found on the Italian side.
The stale version 7 figures (362 households) are removed.

## Private-source checks

Two checks that run only with `CATASTO_VALIDATION_MD` failed on HEAD before any change in this round. In both,
the check's assumption no longer held:

- **`catasto-xlsx-index.test.mjs`, Michele Marino:** it expected one row. There are two people: Barbara Caputo's
  son (age 10, p. 361) and Pietro Morrone's nephew (age 14, pp. 281–282). The check now picks the age-10 row, as
  it already does for Andrea Orrico.
- **`catasto-xlsx-index.test.mjs`, Maurizio Cusinelli:** it expected one row. Since V0.10 his only mention, a mass
  legacy, is in the excluded "Churches and Monasteries" section, so by the recorded decision the XLSX Index leaves
  him out. The check now expects none, and the Name Index check expects him once.

## Summary of files changed

- `catasto-parser.js`:
  - the payee rule in `sectionHeadingKind`
  - `pagedText` (shared) and `excludedSections`
  - `data.excluded_sections`
  - `PARSER_VERSION` 9, `entry_boundary_version` 7
- `catasto-name-index.js`:
  - `sectionOwners` and the `excludedSections` option in `collectMentions`, used by `buildNameIndex`
  - `Magnifici`, `Monte familiare`, `Esigge da`
- `catasto-relations.js`: the shared `FINANCIAL` list; `isPaymentSentence` exported.
- `app.js`: search's financial classification uses `CatastoRelations.isPaymentSentence`.
- `package.json`, `package-lock.json`: ESLint 10.15.0.
- Tests:
  - `catasto-parser.test.mjs`: 2 tests
  - `catasto-name-index.test.mjs`: 1 test, plus Marano assertions
  - `catasto-relations.test.mjs`: 1 test
  - `catasto-xlsx-index.test.mjs`: 2 Marano assertions corrected
- Docs:
  - `ARCHITECTURE.md`: parser version, excluded sections, Name Index
  - `HANDOFF.md`: test count, bilingual figures, parser version 9, ESLint, money words
  - `SECTION_HEADINGS_PLAN.md`: step 3 built
  - `HUMAN_DECISIONS.md`: D12 resolved
- `CLAUDE_RESPONSE_8.md`: the previous response, kept for history.

App version: V 0.11 in the footers of `index.html` and `admin.html`, in `INSTALL.md` and in `HANDOFF.md`.

STATUS: READY_FOR_REVIEW
