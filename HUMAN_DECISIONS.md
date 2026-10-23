# Human Decisions Required

These decisions come from `CODEX_REVIEW.md` (review of commit `b9bc543`, 2026-10-23). Each one blocks or shapes a fix
that should not be made automatically. Every other finding in the review can be fixed automatically.

## D1. Which parser is canonical? (H1, M9)

The app's inline parser (`index.html:2245–2675`) and `catasto-parser.js` (used by Admin) give different results on the
same Marano source: 288 vs 20 blank residences, 14 different head names, and 218 vs 238 resolved links.

Decide:
- Should the `index.html` pipeline become the only parser, moved into `catasto-parser.js`? (Recommended.)
- Should existing projects created through Admin be reparsed automatically, offered a reparse, or left alone?
- Should `X of the Land of Y` stay part of the head name (Admin parser) or move into a residence/origin field (app parser)?
  This choice changes household IDs.

## D2. Migration and data-retention policy (H2, M6, M8)

Load-time migrations can replace parsed data, re-apply Marano corrections over manual edits, and reset neighbor lists.

Decide:
- Which fields are user-owned and must never be overwritten by a migration or corrections file? Candidates: edited
  `source_entry`, manual `residence.place`, merged `adjacent_to`, `aliases`, duplicate decisions.
- Before each migration, should a snapshot be kept inside the project (it grows over time), downloaded automatically as
  an export, or both? How many snapshots should be kept?
- How should the default Marano project be identified from now on? An explicit flag on the project, rather than the
  `sourceFile` name, is recommended. Should Marano corrections ever apply to an imported copy of that project?
- What retention limit applies to `merge_history` full-record copies?
- Should the app prompt for an export after edits, or show a "last exported" warning?

## D3. Permanent record identifiers (M2)

Household IDs are recalculated from names and record order, so duplicate decisions, merge history and links can point
at the wrong person after an edit.

Decide:
- Should records get permanent opaque IDs (UUIDs), with slugs kept for display only? (Recommended.)
- This requires a new exchange-format version (`EXCHANGE_VERSION` 2). Must the app still import older version-1 exports?

## D4. Keep or remove the upload, review and "LLM prompt" workflow? (L1)

The upload modal, review panel and LLM prompt generator in `index.html` can no longer be reached, because the Upload
button was removed. The prompt feature only builds text and calls no model.

Decide: remove it, or move the review step into Admin's project creation flow.

## D5. Page numbers by position (L5)

`backfillSourcePages` assigns page numbers from the household at the same position when no name matches. This conflicts
with the stated rule that ambiguous references are not assigned by guesswork.

Decide: keep the fallback (and label those pages "inferred"), or leave such records without page numbers.

## D6. Licensing, repository content and hosting (I1, I4, M1)

- Add a `LICENSE` file that matches the footer terms ("personal use; redistribution, hosting, and derivative works require
  permission")?
- May the `.docx` sources and the full transcription stay in the repository? This matters if the repo is ever made public
  (it is private now).
- Will the app only ever run on `127.0.0.1`? If it might be hosted, authentication and storage design need review,
  because the current design assumes a single local user.

OVERALL STATUS: HUMAN_DECISION_REQUIRED
