# Review of the most recent changes

Reviewed 2026-10-26. Scope: the current working tree changes since the preceding review, especially transaction settlement, atomic export, and snapshot listing. There is still no newer Git commit than `31557c2`, so the preceding review and current source identify this round. No application source code was changed.

## Diagnostics

- `npm test`: **77 passed**.
- `.venv/bin/python -m unittest -q test_serve`: **38 passed** with loopback access for the HTTP tests.
- `npm run lint` and `.venv/bin/ruff check .`: **passed**.
- Temporary-directory probes confirmed the stale-delete race, startup failure on an unrecoverable pending transaction, and listing of a project that individual reads refuse with 503.
- The preceding review's paired-update overwrite, mixed-version export, and snapshot-date defects have corresponding fixes and tests in the current tree.

## CRITICAL

No confirmed critical findings.

## HIGH

### H1. Delete can discard a newer save from another tab without a conflict warning

1. **Description:** Admin loads a project before asking for deletion, but `DELETE /api/projects/<id>` supplies only its ID. `ProjectStore.delete` has no version check. A temporary-store probe loaded version A, saved version B from another tab, then deleted using the original ID; the newer B disappeared and the delete succeeded. The same gap exists if a user exports a backup and another tab saves before the user confirms deletion.
2. **Files/location:** `admin.js:181-205`; `catasto-storage.js:203-205`; `serve.py:189-191`; `project_store.py:482-486`.
3. **Why it matters:** An acknowledged edit can be permanently erased by a deletion confirmed against an older view. The delete also removes the snapshot, so the app offers no recovery.
4. **Recommended correction:** Send the loaded `updatedAt` with the delete request and reject a stale deletion with 409. Refresh Admin and ask for a new confirmation when the version changes. Add a two-tab concurrency test, including export followed by a concurrent save and delete.
5. **Correction:** **Safe to implement automatically** under the existing stale-save protection policy.

## MEDIUM

### M1. An unrecoverable transaction for one project prevents the whole server from starting

1. **Description:** Startup calls `recover_interrupted_transactions`, which propagates a file-replacement error from any pending project. A temporary store with an unrelated healthy project failed construction when replacement for a different pending project raised `OSError`; the healthy project remained on disk but could not be served.
2. **Files/location:** `project_store.py:192-205,290-306`; `serve.py:234-237,247-251`.
3. **Why it matters:** A permission or I/O error in one recovery path can make every project unavailable until the failing file is repaired manually.
4. **Recommended correction:** Isolate recovery errors per project, retain its journal and staged files, and start the server with that project marked unavailable. Report the affected project and recovery error clearly while serving healthy projects. Test startup with one failing transaction and one healthy project.
5. **Correction:** **Safe to implement automatically**.

### M2. Project listing presents an unsettled project as available

1. **Description:** `list` catches and logs `ProjectError` when it cannot settle a pending transaction, then reads and returns that project's existing file anyway. In a temporary-store probe, `get('p')` returned 503 while `list()` returned a normal project summary. If the snapshot replacement already occurred, that summary can also pair an old project with a new snapshot date.
2. **Files/location:** `project_store.py:327-358`, especially `:332-339`.
3. **Why it matters:** Admin and the Visualizer can offer a project that cannot be opened or changed, without telling the user recovery is pending. The listing also conflicts with the intended rule that operations on an unsettled project are refused.
4. **Recommended correction:** Return explicit unavailable/recovery status for that project or omit it with a visible library-level error; do not silently return it as healthy. Add a test where replacement continues to fail during listing.
5. **Correction:** **Safe to implement automatically**.

## LOW

No additional low-severity findings in this change set.

## INFORMATIONAL

### I1. Recovery and deletion tests miss the above failure paths

1. **Description:** The new tests cover paired-update failure followed by save and delete, but not a stale delete after an independent successful save, startup with a persistently failing pending transaction and an unrelated project, or listing while settlement fails.
2. **Files/location:** `test_serve.py:326-385`; `admin.test.mjs`.
3. **Why it matters:** All current diagnostics pass while H1, M1, and M2 remain reproducible.
4. **Recommended correction:** Add targeted concurrency and fault-injection cases alongside the corrections.
5. **Correction:** **Safe to implement automatically**.

OVERALL STATUS: CHANGES_REQUIRED
