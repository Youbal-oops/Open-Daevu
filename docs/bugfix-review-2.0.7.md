# GitHub bug and performance fixes — 23 October 2026

This batch builds on the existing uncommitted import/export and agent-tool fixes. It does not close GitHub issues automatically.

## Changes in this batch

- **#45:** Files badge, kind counts, header and upload grid share one inventory excluding inline pictures. Covered for empty projects, projects with only hidden pictures, and mixed files.
- **#28, #30:** Secondary sheets retain the real document ID for Python and carry a separate sheet ID in cell references. Canvas/page spreadsheet embeds and the app bridge include cross-workbook context.
- **#31, #32, #34:** Agent function arguments use direct validation, including fenced code. Kanban updates retain moved cards and IDs. Calendar batches deduplicate within the batch and commit atomically.
- **#37, #38:** EPUB HTML is sanitized before inserting generated picture URLs, which are released on chapter changes. Word imports retain the source upload beside the editable conversion.
- **#39, #40:** Ordinary user Markdown is preserved; formatting repair is explicit for agent replies and agent save_document calls and protects inline code. Legacy note blocks and empty image arrays retain stable identities between unrelated renders.
- **#42, #43:** Combinations validate integer arguments, use symmetry and bound work. Polynomial fits solve with centered/scaled x values, with stable evaluation for years and timestamps.
- **#44, #47:** Escape cancels a dock drag without toggling the sidebar. File editor saves serialize disk writes and metadata per project/file.
- **#48, #49, #51:** Conversion libraries and the file viewer load on demand. Spreadsheet peer sources retain identity across unrelated workspace snapshots. Resizing changes CSS live and persists once on release.
- **#52, #53, #54, #57:** Offscreen PDF canvases/text layers are released and visible-page tracking uses IntersectionObserver. Plot hover renders independently of paths, roots, integrals and derivatives. Plugin chart option changes do not invalidate table calculation. Shared plugin entry files build once, including concurrent requests, and replacement clears the cache.
- **#41 (partial):** Chart extrema use iterable loops, avoiding argument-limit crashes; board previews/editors have local render boundaries. Large chart data is not yet sampled or virtualized.
- **#50 (partial):** Undo history caches structural and picture signatures; incremental/debounced floating-picture layout measurement remains outstanding.
- **#58 (partial):** Removed unused UpdateRow/style, page icon list/prop, chart kind export, sheet lazy map, duplicate grouped formatting and duplicate undo CSS. Legacy artifact kind validation remains for compatibility with older saved work.

## Verification

- All 318 automated tests passed with `node --test --test-concurrency=2 tests/*.test.cjs`.
- Added regressions for Files inventories, bounded combinations, timestamp polynomial fits, large extrema, Markdown preservation, cross-workbook calculations, secondary-sheet references, stable sheet peers, fenced agent arguments, atomic task batches, Kanban moves, concurrent file saves and shared plugin builds.
- An initial fully parallel run had one MCP subprocess handshake timeout; the isolated MCP test and the complete run with concurrency 2 passed.
- Production build passed (`npm run build`); Vite still reports the existing large-chunk advisory. The PDF/EPUB viewer is emitted as a separate lazy chunk.
- Real Electron smoke test passed (`npm run test:ui`) against a temporary profile, including Files counts with hidden inline images, resize persistence, Escape drag cancellation, legacy-note undo, document editing, comments, image annotations, calendar, navigation and canvas operations.

## Still open beyond this batch

- #12–16: Installer release validation, plugin thumbnails, browser-script isolation/permission wording, file version restore, and generation of shared chart plugin sources.
- #21–23: Verified updater downloads, an automatic-update toggle, and PDF-specific WebAssembly/CSP isolation.
- #27, #29: Import/save size alignment and formula rewriting when sheets are renamed.
- #35, #36: Carry picture/chart dependencies when moving or copying notes and safely reclaim unreferenced inline files.
- #50, #56: Incremental picture layout measurements, worker-based document imports, decompression budgets and large file IPC transport.
- The remaining parts of #41 and #58 described above.
