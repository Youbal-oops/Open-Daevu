# Verification - 19 October 2026

## v0.11.3 - 19 October 2026

The full automated suite passes **193 tests** and the production frontend build passes. Isolated Electron checks pass for native web chat (**39**), the connected workbench and activity rail (**34**), spreadsheet editing (**20**), and detached app windows, generated icons, and Windows shortcuts (**7**). The release adds a VS Code-style activity rail with Apps at the top, connected editor panes, and pull-outs that collapse and restore the project sidebar; it also includes the usable spreadsheet grid, weekly agent schedules, shared ChatGPT/Gemini composer and uploads, and app icon and shortcut improvements. These checks use local fixtures; signed-in provider behavior is not covered. Pushing tag `v0.11.3` runs the Windows installer and portable-app workflow.

## Local pull-down canvas and workspace continuity - unreleased

The topbar board handle replaces its Settings button; Settings remains in the sidebar. The existing project canvas opens as a draggable shelf with a full-work-area mode, project selector, sticky-note shortcut, accessible AI chat and white dark-theme connector paths and arrowheads. The Canvas project tab is removed. Home app cards can be pinned. Agent drafts persist per project, agent and conversation; web drafts persist attachment bytes and per-project pane/recipient preferences. Web chat continuation uses origin-checked, token-free conversation routes. Busy-chat sends can wait independently and be cancelled; switching project cancels waiting sends and retains their draft.

185 automated tests pass. Eleven isolated full-workspace UI checks cover actual board dragging, expansion, sticky creation and reopening, agent draft restoration, pinned app ordering, dark connector color, chat clearance, and covering the project tabs. Thirty-nine native web-chat checks cover upload menus, model and effort controls, Ctrl+1/2, byte-preserving draft restore across project changes and reload, pane-width persistence, queue cancellation, real native busy detection, and cancelling on a project switch. Seven additional real-main-process checks verify app windows, desktop/Start menu shortcuts and agent icon rendering. No production build or push was performed. Signed-in provider behavior still needs live confirmation.

## Local web recipient shortcuts - unreleased

Ctrl+1 and Ctrl+2 toggle the first two Send to recipients. Recipient labels show shortcuts and selected panes are highlighted. The shared composer handles these shortcuts directly; visible native provider views relay them through a scoped preload event. Hidden views, unrelated projects, held-key repeats, composition and extra modifiers do not toggle recipients. Six focused web-chat tests and 32 isolated Electron checks pass, including composer-focus toggle/deselect, native event forwarding, project scoping, and unchanged plain-digit behavior. No production build or push was performed for this change.

## Local web model and effort controls - unreleased

Gemini pane headers expose Model and Effort; ChatGPT exposes Effort. Buttons reveal the website controls and open its own settings menu. The 28 isolated native web-chat checks pass, including correct menu routing, ChatGPT composer effort labels, hidden controls and reasoning-trace decoys, preserved selections on subsequent sends, unavailable-setting feedback, and the real shared-composer buttons. No choices are fabricated or changed through private provider APIs. Signed-in website compatibility still needs live confirmation. No production build or push was performed for this change.

## Local Gemini image uploads - unreleased

The sender now follows the Add files / Upload files menu and handles file inputs created off-document through click or showPicker. File selection is delivered after the site installs its listeners, and temporary picker interception is restored on success and failure. The 21 isolated native web-chat checks pass, including delayed menu-created inputs, detached inputs, byte-preserving image transfer, incompatible-file rejection without message submission, dual-provider sending, and attachment retries. Five focused web-chat tests also pass. Signed-in Gemini upload behavior remains to be confirmed in the updated local or installed app. No production build or push was performed for this fix.

## Local app launch and desktop shortcuts - unreleased

The main process now imports its native app icon helpers, fixing the ReferenceError that blocked detached windows and shortcut creation. Desktop shortcut buttons are available in Home and the app toolbar; the editor retains Windows search shortcuts. 37 focused app, icon and runner tests, eight native UI checks, and seven checks through the real main-process handlers pass. The handler check opens an actual app window and verifies Windows Desktop and Start menu links, their launch arguments, the custom icon bytes, and rejected destinations. The agent icon tool accepts bounded vector paths and hex colors, produces a 256-square PNG, preserves its design for revisions, and applies the result through the real app-edit handler. Pixel checks confirm the chosen background and stroke colors in the resulting desktop icon; rendering leaves no hidden window behind. Test shortcuts are redirected into an isolated profile. This check uses the existing renderer build (`node scripts/test-app-launch.cjs`); no production build or push was performed for this follow-up.

## v0.11.2 UI updates - 18 October 2026

The 179-test automated suite passes. The production frontend build passes. Six native Electron checks cover app logo uploads and reset, generated icons, and Windows shortcut icons. The canvas minimap now fits its frame, leaving zoom controls and the bottom status visible. Connections cards and the project-scoped agent picker were visually reviewed. Windows installer packaging runs in the tagged GitHub Actions release workflow.

## v0.11.2 agent menu - 18 October 2026

179 automated tests pass, including explicit effort-visibility preferences and project-scoped contact previews that exclude internal specialist reports. An isolated Electron preview verifies that the top contact strip and default effort slider are absent, the agent drawer sits to the left without changing the work area width, search filters contacts, selecting an agent opens the conversation matching its preview, and Escape closes the drawer and restores focus. The menu was visually inspected in light and dark themes. Included in the v0.11.2 release.

## v0.11.2 app logos - 18 October 2026

The full suite passes 177 automated tests. App logo checks cover stable distinct automatic icons, bounded PNG validation, application/project isolation, restart persistence, resetting without changing app source, native window creation and icon updates, and Windows ICO structure. Six isolated Electron checks exercise the real app editor's upload/reset controls and launcher icons, PNG decoding and native window icons, plus creating and reading a temporary Windows shortcut using the generated ICO. No Start menu entries or installed apps are changed by these checks. The editor layout was visually inspected. Included in the v0.11.2 release.

## v0.11.2 Gemini composer follow-up - 18 October 2026

The plugin sender now uses native Chromium text insertion with serialized focus, restores a hidden composer's editing geometry during submission, ignores unrelated page progress bars and hidden stale Send buttons, and reports each provider's result independently. A host-side deadline prevents indefinite waiting, restores throttling, and prevents an expired operation from submitting later. Regression checks include Gemini-only and dual-provider sends with native input events, a collapsed composer and an unrelated permanent progress indicator, plus per-provider completion and a stalled renderer. The full suite passes 173 tests, and 17 isolated Electron checks pass. Tests use isolated local fixtures; live signed-in Gemini remains unverified. Included in the v0.11.2 release.

The web plugin layout also uses slimmer headers and a compact shared composer, with secondary website tools collapsed under Website tools, giving the conversation panes more vertical room. The updated layout passes the same 17 Electron checks. The separate local manual-test instance received a Gemini reply; the ChatGPT website error was deferred at the user's request.

## v0.11.1 shared web composer — 18 October 2026

171 automated tests pass. The new shared-composer tests cover independent multi-provider results, retrying only failed selections, Enter versus Shift+Enter and IME composition, attachment payload validation, and size/count/path restrictions. The production frontend build passes.

`npm run test:web-chat` runs 16 checks in an isolated Electron profile against local provider fixtures and the real React composer. These verify a stable hidden Gemini sidebar during DOM updates, hiding/restoring website controls, sending to two native web views while their composers remain hidden, delayed Send readiness, matching file/image bytes, preserving already staged uploads on retry, attachment-only submission, real composer Enter submission and partial-failure recovery, image paste/preview/removal, and file drop. No user sessions, live provider uploads, or paid inference are used. Signed-in ChatGPT/Gemini website compatibility still needs live confirmation; unsupported upload/composer controls return a visible provider-specific error.

Tested on Windows x64 with Node.js 24 and Electron 42.

The v0.3 account suite verifies PKCE callbacks, signed OIDC claims, wrong state/client/identity rejection, credential redaction, encrypted vault persistence, identity-only grants, Google configuration, serialized refresh rotation, sign-out during renewal, API-key validation, SSE completion and usage-limit errors, Gemini/Claude direct adapters, isolated Claude CLI sign-in, and account-backed research orchestration. Eight native desktop account checks passed with no renderer errors, using mocked network responses and Windows safeStorage encryption. Seven additional packaged-app checks passed: v0.3 launch, fresh blank state, Windows encryption, bundled JWT verification, packaged modules matching source, Connections UI, and empty credential IPC. Live provider consent and paid inference were not performed.

- Production frontend build: passed.
- Automated core tests: **36 passed, 0 failed**.
- The prior v0.1 native suite passed 40 checks. The v0.2 rework passed **13 native desktop checks**, with no renderer errors, covering blank onboarding, profiles before projects, folder hierarchy, isolated documents, parent summaries, KPI editing, persistence, themes, team assignment, and folder schedules.
- Prior v0.1 packaged Windows executable: launches successfully with an isolated local profile; the native bridge, browser navigation, and scheduled-task navigation are present. Packaged browser, scheduler, main-process, and domain modules match the source files byte for byte.

New tests verify empty defaults, nested ancestry and cycle rejection, folder data isolation, optional KPIs, ordinary replies creating no notes, malformed actions creating no notes, consolidation by title/ID, and rejecting note IDs outside the current folder.

Core tests cover CSV quoting and multiline cells, structured agent actions, provider CLI arguments, provider errors, workspace mutations, persistent state, interruption recovery, backup recovery, specialist handoffs and synthesis, delegation limits, cancellation, and literal prompt delivery through subprocess stdin.

Native checks cover the isolated IPC bridge, both themes, saving a note across reload, saving when navigating immediately, CSV editing, hiding/showing chat, profile creation, role prompt creation, running a local CLI, saving agent findings, workspace search, deleting a document, and creating a project. Additional checks cover native import/export with deterministic dialog selection, CSV export round trips, canvas dragging/connections/reload, minimum window size, schedule creation/pause/run/completion/persistence, and closing to the tray.

Browser checks use a deterministic local HTTP website and cover live rendering, absence of the workspace bridge and Node integration in website contexts, source saving, visible page text in a chat draft, history navigation, multiple tabs, hiding the native webpage behind modals, tab reload persistence, closing a tab, and leaving the browser view. Native webpage visibility and bounds were checked directly.

Schedule tests also cover time calculation, validation, missed-run catch-up, busy-agent handling, one-time completion, and agent-created self-schedules. The startup preference was tested in an isolated test workspace; the user's actual Windows startup registry was not modified during testing.

The native CLI check uses a deterministic local Node.js fixture. Provider orchestration tests use deterministic Codex and Claude response fixtures. **No live paid AI requests were made.** Actual model access, provider authentication, web tools, and account-specific MCP connections must be checked with the user's installed and authenticated CLIs.

The supplied UI screenshots show the running Electron renderer. Every third-party document format and live website was not exhaustively tested. DOCX, PDF, and XLSX imports are attachments; Markdown and CSV are the editable formats in this version. Native child webpage surfaces are captured and verified independently from the main renderer.

The v0.3.1 visual rework passed 12 native desktop checks with no renderer errors: right-hand agent layout, Context/Sources/Tasks inspectors, both themes, browser source-rail toggling, native webpage capture into chat, task history, a full-window capture including the live webpage, closing/restoring chat, minimum-window sizing, and Connections navigation. Initial window dimensions are clamped to the monitor work area. Screenshots use temporary QA data; new installations remain empty.

The v0.3.2 typography and corner refinement retains the compact layout. Its 12 native UI checks passed with no renderer errors, covering the same inspector, theme, browser, chat, and sizing behavior.

The v0.3.3 spreadsheet update passes 41 automated tests, including real installed Python execution, result validation, cancellation, formula dependencies, lazy IF/IFERROR, circular references, and bounded expression evaluation. Nine native desktop checks pass with no renderer errors: calculated totals, formula editing/bar, dependent recalculation, real Python output preview, applying output, stale-result protection, error feedback, cancellation, and persistence after reload. QA uses temporary workspace data only. Python runs with the user's permissions; it is not sandboxed.

The v0.4.0 Drive-folder integration passes **53 automated tests** and **10 native desktop checks** with no renderer errors. The desktop checks use two isolated device profiles and temporary folders to verify preview/cancel, attachment and Python-script migration, credential exclusion, restart loading, a second session becoming read only, session release on quit, device handoff, local schedule opt-in, device-local startup preferences, external-change detection, and preserving both versions through a local recovery copy. Automated checks additionally cover missing Drive paths, unsafe attachment paths and junctions, interrupted-copy cleanup and retry, stale-session recovery, and bounded retries of Windows file locks without deleting the old file. Actual Google Drive cloud replication, shared-drive access, offline sync, and simultaneous distributed edits were not tested. The desktop Drive app owns syncing; folder session markers and hash checks are advisory across asynchronously synced devices.

## v0.7.0 MCP and delegation

86 automated tests pass, including a real official-SDK stdio handshake and tool round trip; all four direct provider adapters returning function outputs to the model; unknown-tool rejection; approval denial and cancellation; registry endpoint filtering and publisher identity; and browser OAuth with PKCE, a real loopback callback, rejection of incorrect state, encrypted issuer-bound credentials, and cancellation. Native handoff tests check reservation of both agents, reports scoped to the original chat, parent synthesis, and no automatic note creation.

An isolated Electron instance passed the searchable directory UI, Windows-encrypted MCP configuration, real local SDK tools/list and tool call, native approval IPC, deterministic model continuation, visible specialist report, and lead synthesis with no renderer errors. Directory and model responses were fixtures in that UI check. A separate read-only request checked the live public registry format. The user-supplied website endpoint passed real initialize/tools-list without invoking any website tools; its private URL is excluded from the source and artifacts. Live third-party OAuth consent, paid inference, and universal provider compatibility have not been verified.

## v0.7.1 app windows

88 automated tests pass, including window IPC restrictions, project-scoped snapshots, own-state-only writes, singleton window behavior, live title updates, and closing deleted apps. Native Electron checks verify the app fills its pane without a duplicated title block; the popout fills its client area; a real Boards database edit reaches both views; app state persists; privileged workspace mutations are rejected; iframe pages have no Node/preload access; repeated opening focuses the same window; and app requests return to the main chat.

## v0.7.2 streamed MCP calls

Regression tests reproduce the exact “provider returned no text response” failure when function calls arrive through item/argument streaming events and the terminal completion event does not repeat the output array. The parser now retains completed streamed items, interleaved function arguments, encrypted reasoning, and message parts for tool execution and continuation. Canonical final output is used when present, preventing duplicate tool execution. Incomplete tool arguments and interrupted streams cannot execute. The 30 focused account/MCP tests pass with deterministic provider responses and real local callback/stdio fixtures; no paid inference was performed.


## v0.8.0 shared Drive editing

104 automated tests pass, including 13 shared-editing tests. These exercise two separate folder replicas: independent edits and simultaneous additions, empty collections, conflicting text and explicit resolution, stale editor snapshots, deletion concurrent with editing and recovery, durable local outbox across restart, out-of-order change dependencies, actual Store/Storage migration, device-local account bindings, preserved historical conflict versions after later edits, independent cells within the same database row, cyclic folder moves, live-app state from stale revisions, and task ownership during startup.

Native Electron checks use two independent user-data profiles and separate Drive-folder replicas, exchanging change files to simulate Drive delivery. Checks cover opt-in migration and restart, both apps remaining writable, automatic scheduling disabled on the secondary device, independent edits converging, version-review UI, restoring a deleted note with a concurrent edit, and a remote database change reaching a detached live app. No paid model inference is used. Actual Google cloud delivery, sync latency, and two physical computers are not tested. Drive provides eventual file transport; this is not Google Docs-style realtime text collaboration. Keep all shared change files and upgrade every client.


## v0.9.0 project SQLite databases

116 automated tests cover persisted SQLite files and exports, indexes, bound query values and quoted identifiers, SQL write/attachment/extension denial, project isolation, ownership and permission revocation, typed record writes, restart persistence, schema renames and repeated names, killed long-running queries, bounded output with duplicate column names, old editor drafts preserving app-created rows, backend-bound detached app identity, both account and CLI agent access, and matching SQLite databases after concurrent Drive record updates. All existing tests remain included.

Eight native Electron checks use an isolated QA workspace: an app creates its own table, inserts and updates records, fails to query another project's table, reloads records after a full desktop restart, runs an aggregate through the SQL console and isolated utility process, receives backend rejection after app-write permission is revoked and saved, deletes after permission is restored, and exports a standard SQLite file. User accounts, live services, and paid inference are not used. These checks do not claim external server access or measured performance beyond the current row limits. Drive delivery is simulated through the separate-replica tests; actual Google cloud transport is not tested.

### Custom agent schedules (2026-10-18)

- Weekly schedules support multiple local weekdays and a time, with validation and next-week rollover. Agent-created weekly schedules persist and retain user-paused status.
- The schedule editor accepts interval units of minutes, hours, days, or weeks; a native Electron UI check saved Monday/Friday at 11:15 and an every-two-weeks interval. Calendar projections include selected weekdays.
- Removed the duplicate canvas header Sticky note button. The native UI check places a sticky note using the canvas palette.
- Six scheduling tests and 14 native workspace UI checks passed. No production build or push.

### Left-edge workspace pull-outs and plugin placement (2026-10-19)

- 22 isolated native UI checks pass, including a 35px horizontal pull opening Browser fully, canvas/browser exclusivity, overlay coverage, accessible AI chat, close/reopen, canvas palette sticky placement, scheduling controls, and plugin placement through the actual Plugins settings UI.
- The plugin fixture opens as a left-edge pull-out and as a project tab. A domain test validates and preserves per-plugin destination settings. The fixture uses mocked browser/plugin host APIs; it does not claim external website navigation or real provider sessions.
- Inspected the dark canvas screenshot with the stacked left-edge notches. No production build or push.

### Shared AI chats notch and reserved rail (2026-10-19)

- 25 native workspace UI checks pass, including a reserved notch strip clear of the project heading and one AI chats notch opening ChatGPT/Gemini together with both recipients selected on a fresh draft.
- Two grouping tests cover unrelated plugin ordering, shared placement, and missing/disabled providers. The grouped panel reuses provider sessions and the shared composer; external provider responses are not exercised by this fixture.

- 28 native workspace checks now pass after hiding the built-in agent chat by default for plugin pull-outs. Checks cover full work-area width, explicit Show/Hide chat, and restoring the underlying project chat on close.

### Spreadsheet grid (2026-10-19)

- Replaced the document-sized spreadsheet heading with a compact editable title and a dense scrollable grid. Blank cells are available without appending CSV rows first. Column/row headers stay visible and row 1 can be frozen.
- Three editing helper tests cover quoted/multiline TSV, expanding paste without mutating the source, atomic grid-bound rejection, fill-down, quoted strings, relative/absolute formula references, and REF errors. All 193 automated tests passed.
- Native Electron checks use the real workspace document editor: keyboard entry, Enter/Tab/arrows, Escape, paste, range summaries, copy, clear, fill-down, undo/redo, resize, navigation/editing at row 1,200, raw CSV, autosave while typing, close/reopen persistence, actual Electron text insertion, and one-step undo of multiple keystrokes.
- Inspected dark and light screenshots in .test-data/sheet-grid-dark.png and .test-data/sheet-grid-light.png. No production build or push.

### Connected workbench and activity rail (2026-10-19)

- 34 native workspace UI checks pass. Apps is first in the rail; the rail touches the sidebar and moves to the window edge when collapsed. Apps opens its launcher with project apps and closes cleanly.
- Opening pull-outs temporarily collapses the sidebar while preserving the stored user preference. Closing restores an expanded sidebar and also respects one that was already collapsed. Canvas, Browser, plugin placement, and shared AI chat checks remain included.
- Layout uses attached sidebar/editor/chat panes, compact editor tabs and a full-height activity rail. No production build or push.
