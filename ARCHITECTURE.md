# Catasto Visualizer Architecture

## Boundaries

- `index.html` contains the visualization and project selector.
- `admin.html` and `admin.js` contain project-management workflows.
- `catasto-parser.js` parses text in Admin; `index.html` has a separate parser for source migration of stored projects. Section selection, entry-boundary rules, and all Italian-language rules are defined once in `catasto-parser.js` and used by both.
- A project's `data.source_language` (`en` or `it`) records which side of the transcription was parsed.
- `catasto-storage.js` owns local persistence and the portable exchange format.
- User projects live in the browser's IndexedDB database, not in application files.
- Household source-entry edits and residence corrections are written directly to the active IndexedDB project and are included in project exports.
- The repository contains no project data. A new installation starts with an empty library; source transcriptions and backups stay on the user's computer and are excluded by `.gitignore`.

## Upgrade Safety

Application updates may replace `index.html` and `catasto-storage.js` without changing saved projects. The app must continue to be served from the same browser origin because IndexedDB is isolated by origin. Exported `.catasto.json` files provide backups and allow projects to move between users or origins.

A save is refused when the stored project changed or was deleted after the saving tab loaded it, so one tab or window cannot silently overwrite another. New projects are saved with `{ create: true }`.

Admin announces imports, creations, and deletions on the `catasto-projects` `BroadcastChannel`. Open Visualizer tabs reload their project list and open a newly imported or created project, unless a source edit or duplicate review is open there.

## Project Record

Each stored project contains an ID, display name, source filename, timestamps, and a parsed Catasto data object with a `households` array. Exchange files include an explicit format name and version so future migrations can be added without coupling data to a particular app release.

## Person Identity

- A household entry is the primary identity boundary. Its first listed person is the household head and uses the household ID.
- Other listed people receive stable member IDs scoped to that household and their recorded position.
- Landholdings use the owning household head's ID, never a name-only key.
- Same-name household heads remain separate. Patronymics are the preferred visible qualifier, followed by age, spouse, and source position.
- References with multiple plausible household heads retain candidate IDs and remain unresolved unless reciprocal, district, or shared-neighbor evidence identifies one candidate uniquely. Shared-neighbor triangulation is limited to the same relationship type and stores its score, confidence, method, and evidence for review.
