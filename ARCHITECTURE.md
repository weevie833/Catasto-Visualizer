# Catasto Visualizer Architecture

## Boundaries

- `index.html` contains the visualization and project selector.
- `admin.html` and `admin.js` contain project-management workflows.
- `catasto-parser.js` owns plain-text parsing used during project creation.
- `catasto-storage.js` owns local persistence and the portable exchange format.
- User projects live in the browser's IndexedDB database, not in application files.
- Household source-entry edits and residence corrections are written directly to the active IndexedDB project and are included in project exports.
- JSON and text files in the repository are source/test material and are not required by the runtime.

## Upgrade Safety

Application updates may replace `index.html` and `catasto-storage.js` without changing saved projects. The app must continue to be served from the same browser origin because IndexedDB is isolated by origin. Exported `.catasto.json` files provide backups and allow projects to move between users or origins.

## Project Record

Each stored project contains an ID, display name, source filename, timestamps, and a parsed Catasto data object with a `households` array. Exchange files include an explicit format name and version so future migrations can be added without coupling data to a particular app release.

## Person Identity

- A household entry is the primary identity boundary. Its first listed person is the household head and uses the household ID.
- Other listed people receive stable member IDs scoped to that household and their recorded position.
- Landholdings use the owning household head's ID, never a name-only key.
- Same-name household heads remain separate. Patronymics are the preferred visible qualifier, followed by age, spouse, and source position.
- References with multiple plausible household heads retain candidate IDs and remain unresolved unless reciprocal, district, or shared-neighbor evidence identifies one candidate uniquely. Shared-neighbor triangulation is limited to the same relationship type and stores its score, confidence, method, and evidence for review.
