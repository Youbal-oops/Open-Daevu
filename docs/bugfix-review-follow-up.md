# Remaining bug fixes: source review, 23 October 2026

This batch starts from public `main` at `1dc5e61`, after PR #60 merged. It is prepared on `fix/remaining-workspace-bugs` for manual review before commit. It changes source and documentation; it does not publish installers, change versions or rewrite history.

## Changes

| Issue | Behavior in this branch |
| --- | --- |
| #21 | The updater selects the expected versioned Setup/Portable asset, requires its GitHub SHA-256 digest, verifies bytes before accepting a download and rechecks before installation. Concurrent download requests share one writer. Missing digests require a manual download. |
| #26, #27 | Imports reject excess rows, columns, sheets or per-sheet character counts instead of silently truncating or creating unsaveable workbooks. Formula text and available cached results survive import, save and export. Unsupported formulas can display their last saved result, with a notice that it does not recalculate. |
| #29 | Renaming a sheet rewrites local and peer-workbook formula references in the project, preserves quoted string literals and updates chart source tabs. |
| #35 | Cross-project document transfers copy picture bytes, embedded charts and their source documents/workbooks. Linked workbook dependencies use remapped IDs, and auxiliary titles avoid existing workbook names. Missing dependencies abort the transfer and partial file copies are removed. Cyclic dependencies are copied once rather than recursively duplicated. |
| #36, local storage | Unreferenced hidden inline pictures are marked, retained for seven days, then reclaimed. Saved references in documents, pages, canvas, app state, history and Trash protect them. Failed deletions keep metadata for retry. Shared Drive cleanup remains deferred. |
| #41 | Core and bundled chart views reject more than 20,000 source cells with a smaller-range/summary message before constructing large SVG trees. Data is not silently sampled. Existing render boundaries and iterative extrema remain. |
| #50 | Picture-layout measurement waits for a 140 ms typing pause; unchanged text fitting is reused. Full block positions are still measured after the pause and on relevant width/font changes. This is not complete incremental layout. |
| #56 | Word and spreadsheet parsing runs in a worker with a 60-second deadline and a 256 MB JavaScript heap limit. ZIP inputs have expanded-byte and entry-count budgets. Parsing uses the same bounded input snapshot that passed validation. Preview files cross IPC in 1 MB chunks with change detection. |

The file-transfer path is shared by UI mutations and agent workspace organization. Async store callbacks keep file copying and metadata updates serialized. Ordinary file moves remove the old physical copy only after the destination and metadata succeed; document dependencies retain their originals for other references. If a board in the source project reads the moved document, a clearly titled chart-source snapshot remains there and source references follow it, keeping that board usable.

The README now includes security hardening, the maintainer-reported private start date of 4 September 2026, the public release context and the maintainer's statement that AI-written code was extensively reviewed and tested. Public history still starts on 20 October 2026. The personal review statement comes from the maintainer; it is not an independent certification by this source check.

## Changed files

- Documentation: `README.md`, `docs/GUIDE.md`, `docs/RELEASE-NOTES.md`, `docs/RELEASING.md`, this report.
- Desktop: `electron/main.cjs`, `electron/preload.cjs`, `electron/store.cjs`, `electron/updates.cjs`, `electron/sheet-files.cjs`, `electron/doc-convert.cjs`.
- New desktop helpers: `electron/file-chunks.cjs`, `electron/import-worker.cjs`, `electron/imports.cjs`, `electron/inline-cleanup.cjs`, `electron/item-transfer.cjs`.
- Shared logic: `shared/domain.mjs`, `shared/sheet.mjs`, `shared/workbook.mjs`; new `shared/chart-limits.mjs`, `shared/note-dependencies.mjs`, `shared/sheet-rename.mjs`.
- Renderer: `src/charts.jsx`, `src/float-images.jsx`, `src/plugin-board.jsx`, `src/sheet-book.jsx`.
- Tests: `tests/doc-convert.test.cjs`, `tests/updates.test.cjs`, `tests/fixtures/ui-smoke-electron.cjs`; new `tests/remaining-bugs.test.cjs`.

Dependencies, the lockfile, licensing, visual assets and generated distribution files are unchanged.

## Verification

- `node --test --test-concurrency=2 tests/*.test.cjs`: **336 passed**, no failures. Includes 13 follow-up regressions, three updater regressions and worker coverage in the Word conversion test.
- `npm run build`: passed; the final build completed in 29.79 seconds. The existing large-chunk advisory remains.
- `npm run test:ui`: passed against a temporary profile using the real Electron main process and renderer. Added checks exercise native preview reads, worker imports under Electron and the absence of synchronous picture-layout row measurement during a typing burst.
- `npm run check:docs`: passed for 17 Markdown files and 111 local links. `git diff --check`: passed, with checkout line-ending advisories only.

Intermediate checks failed before correction: four updater fixtures used old, unversioned asset names; an edited-formula fixture needed CSV quoting; a cyclic-copy test asserted calculator error classification rather than transfer graph preservation. UI instrumentation initially returned an unclonable function across IPC, then counted caret geometry as picture-layout work. The fixtures and instrumentation were corrected; these failures are not represented as application passes. A shell quoting attempt to edit instrumentation also failed without changing the file.

No packaged Setup/Portable build, live provider session, signed release or cross-version Windows test was performed. This is source/test validation, not evidence that an older published binary contains the changes.

## Remaining limits and issues

- SHA-256 verification trusts GitHub release metadata; it is not Authenticode signing or protection against a compromised release publisher. Old binaries retain their old updater behavior.
- Unsupported formulas use historical saved values, not a new implementation of those functions. Missing saved values still show cell errors. Formatting compatibility remains limited.
- Imports allow at most 50 MB of input, 100 MB of expanded ZIP data, 5,000 ZIP entries, 24 sheets, 10,000 rows, 256 columns and 2,000,000 CSV characters per sheet. The worker heap limit is not a limit on all native/external process memory or a complete file-format sandbox.
- Document transfers have a 200-dependency budget. They do not migrate arbitrary application databases or resolve every Markdown link. Retained chart-source snapshots are visible documents and can be reviewed or removed when their source boards are no longer needed.
- Inline reclamation is local-only. The grace period protects ordinary undo/use, not indefinite recovery of unsaved references; visible uploads are never reclaimed by this mechanism.
- Large chart sampling/virtualization and fully incremental picture layout remain separate work; this batch uses explicit render bounds and deferred measurement.
- #12–16, #22 and #23 remain open for installer validation, optional functionality, extension maintenance and isolation work. #58 retains compatibility handling for historical chart kinds rather than deleting saved-work support.

Issues #17–20, #24, #25, #33 and #46 already had source fixes in merged PR #60; their existing regression tests passed and their GitHub issues were closed with resolution comments. The new fixes above remain open on GitHub until review, commit and merge. No issue is closed on the strength of an uncommitted change.
