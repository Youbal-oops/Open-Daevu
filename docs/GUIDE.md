# Guide

This guide describes the public source version in [package.json](../package.json). Version labels retained in section headings identify when a capability was introduced, not the current release. Earlier test reports and private-development notes are preserved in [VALIDATION.md](../VALIDATION.md).

For installation, project status and a feature overview, start with the [README](../README.md). The core workspace is complete; new functionality should normally use [plugins](../PLUGINS.md) or project apps. Current core work focuses on bugs, performance, reliability and compatibility.

## Finding things

- Use the profile menu under your name for **Settings**, **Plugins**, **Tools & MCP** and **Connections**. Settings can also open with Ctrl+,.
- Projects and work folders have pages, Files, boards and optional tool tabs. A work folder has its own data and can belong to a top-level project; folders cannot be nested arbitrarily.
- The top tool controls open canvas, browser, apps and plugin pull-outs. The project list and agent chat can be moved or resized. The sidebar can be hidden from the toolbar or with Ctrl+\; Escape closes an active tool or toggles the sidebar when nothing else handles it.
- Documents use the block editor; Markdown is an import/export representation. Files also holds spreadsheets and uploads. Supported PDFs, EPUBs, text and media have built-in previews; images have annotations/crop. Preview support and import conversion have limits.
- Boards includes Kanban, basic charts, dashboards and databases. Statistics, business and science chart types are optional plugins.
- Agents, MCP, website chats, Drive and Python are optional integrations. See [account connections](../ACCOUNT-CONNECTIONS.md) and [security boundaries](../SECURITY.md).

New installations start empty. Example projects and provider replies in automated checks are fixtures, not preinstalled content or evidence of live service compatibility.

## Run from source

Use **Node.js 24 LTS** on Windows:

```powershell
npm ci
npm run dev
```

For a production app locally:

```powershell
npm run build
npm start
```

`npm run dev:web` opens an optional browser preview at `http://127.0.0.1:5173`. The browser preview saves to that browser's local storage; native files and agent execution require the desktop app.

## Build Windows packages

The Windows workflow runs only through **Actions → Build Windows app → Run workflow** (or an explicit workflow dispatch). It does not run automatically on branch/tag pushes. It uploads a `Daevu-Windows` artifact; its release-attachment step runs only for a tag ref.

For a local package, use `npm run dist:win`. Output goes to ignored `release/`. Follow [RELEASING.md](RELEASING.md) for checks, packaged-app verification and publishing. A build succeeding does not mean an installer has been launched or a provider sign-in tested.

## Connect your agents

For account-based agents, start in **Connections**, then select a saved account and an available model when creating the profile. ChatGPT plan access depends on the granted permissions and account eligibility; Gemini and direct API connections require the applicable API access and billing. CLI MCP tools and direct account capabilities differ; see [account connections](../ACCOUNT-CONNECTIONS.md).

For optional CLI profiles, install your chosen provider CLI separately and sign in using that provider's instructions. Then open the agent profile and use its CLI check control. This verifies the executable/version; it does not perform a paid model request or guarantee that every model or tool is available.

### Codex

The profile command defaults to `codex`; you can supply an absolute executable path. A blank model uses your CLI's configured default. Enter a model identifier supported by your account to override it. Use identifiers accepted by the installed CLI rather than assuming website labels are CLI model IDs.

The adapter sends the research prompt through stdin to `codex --search exec --json --skip-git-repo-check --sandbox workspace-write -c sandbox_workspace_write.network_access=true`. It reads final agent-message events, uses the project folder as its working directory, and inherits the CLI's MCP setup. Network access remains subject to your provider, operating system, and CLI configuration.

Reference: [official Codex CLI commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

### Claude Code

The profile command defaults to `claude`. `sonnet`, `opus`, and `haiku` are available as convenient inputs; actual model access depends on your account. You can type any supported model identifier.

The adapter uses `claude -p --output-format json` and sends the prompt on stdin. Read, Glob, Grep, WebSearch, and WebFetch are allowed for research. Select tools in the agent profile or chat Tools menu. Advanced CLI/tool configuration can include additional allowed tool names. Existing CLI MCP connections are inherited. An optional additional MCP JSON file path can be set in workspace Settings.

Reference: [Claude programmatic usage](https://code.claude.com/docs/en/headless) and [CLI flags](https://code.claude.com/docs/en/cli-reference).

### Other providers

Choose **Other · Custom CLI**, enter an executable path and arguments as a JSON array. `{model}` is replaced with the saved model. The provider must accept a prompt on stdin and write its final response as plain text on stdout. Custom CLIs retain their own tool, network, and MCP configuration.

## Agent collaboration

The app supplies project context and a roster of assigned specialists with every request. Agents can use the project function tools to save documents, boards, diagrams, tasks and page content. Structured action blocks remain supported; for example:

````text
```research-actions
{
  "notes": [
    { "title": "Competitor findings", "kind": "note", "content": "Evidence and source URLs" },
    { "title": "Comparison", "kind": "sheet", "content": "Competitor,Strength,Source\nExample,Clear messaging,https://example.com" }
  ],
  "handoffs": [
    { "agentId": "market", "task": "Compare the positioning of these competitors" }
  ]
}
```
````

The coordinator validates actions, saves notes, and routes handoffs to **assigned** agents only. Repeated recipients in one response are deduplicated, busy agents are not started twice, ancestor agents stay occupied while they wait, and a shared handoff budget limits recursive delegation. A parent receives the specialist reports in a synthesis call. Each call has its own visible task record.

Ordinary responses remain in chat and do not create notes. Agents save important findings through explicit note actions; you can also save a reply as a note. Include an existing note ID to update it, or reuse its title to consolidate a topic within the same folder. An ID from another folder is rejected. Chat history remains stored locally. KPIs can hold manually entered values or formulas over project references. Malformed actions produce a visible message and do not execute. Tool and provider failures remain visible in chat and task history. A Stop request cancels the whole related research run.

## Scheduled research and Windows startup

Open **Scheduled tasks → New scheduled task**. Choose a project and assigned agent, describe the task, and select one-time, daily at a local time, weekly on selected weekdays, or a repeating interval. Repeating tasks can run every 10 minutes or more. Daily tasks use the computer's current local timezone. The list shows next runs, last results, and who created each task. You can run, pause, edit, and delete tasks.

In **Settings → General → Startup**, enable **Open when I sign in to Windows** to register the packaged app as a login item. The app opens quietly in the tray. This is user sign-in startup, not a system service before login. For portable builds, keep the EXE in the same location; installing the Setup build is preferable for regular startup use.

**Keep running when the window closes** is enabled by default. Closing the window hides it in the system tray; double-click the icon to return, or select **Quit** from its menu to stop the app and its scheduler. Turning this setting off makes closing the window exit normally. Background scheduling requires the computer to be on and the app running. It does not wake a powered-off or sleeping computer. On startup or wake, an overdue task runs once, and its next occurrence is calculated without replaying every missed interval. Busy agents are allowed to finish before their pending scheduled work starts.

With **Let agents schedule their own follow-ups** enabled, agents can append a `schedules` array to their `research-actions` block:

```json
{
  "schedules": [
    {
      "name": "Weekly SEO review",
      "task": "Review the saved sources, research changes, and save a dated findings note.",
      "mode": "interval",
      "intervalMinutes": 10080
    }
  ]
}
```

Weekly schedules use `"mode": "weekly", "weekdays": [1,3,5], "time": "09:00"` (Sunday = 0 through Saturday = 6). Pick one or more days at your computer's local time. The task editor also supports custom intervals in minutes, hours, days, or weeks; for agent actions use `intervalMinutes` (for example, 20160 for every two weeks). Intervals count from each run, while weekly schedules keep their selected local weekdays and time. Other modes are `"daily"` with `"time": "09:00"`, or `"once"` with `"at"` set to a future ISO timestamp. Agents create follow-ups only for their own profiles in the current project. Their tasks appear in the same list, with limits and duplicate-name detection. User-paused follow-ups stay paused. Turn agent scheduling off in Settings whenever you want.

Startup registration uses [Electron's login item API](https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows).

## The research browser

Open a project's **Browser** tab. Create tabs with **+**, enter a URL or search query, and use the navigation controls as in a browser. Each project retains up to 12 tabs and its saved sources. Website sessions and cookies are stored locally in a separate browser partition. **Ctrl L**, **Ctrl T**, and **Ctrl W** are available while a webpage has focus. Site-requested popups open as app tabs for HTTP/HTTPS URLs.

Save the current page with the bookmark icon. Sources, project notes, and local attachments appear in the source pane. Notes open in the editor; attachments open in a supported in-app viewer or their associated desktop application. Use **Ask agent about this page** to put the page title, URL, and up to 20,000 characters of visible text into the chat draft. Review it and send when ready. The coordinator also supplies saved source URLs in project context.

This is a user-controlled browser. Ordinary agents use their configured provider/CLI and selected tools; they do not automatically inherit browser cookies. The optional browser assistant can receive explicitly shared tab text and a screenshot, and browser plugins can add scripts and tools. Page capture does not handle every complex document viewer, image-only page, or inaccessible content. Website camera/microphone/geolocation permission requests are disabled. Only HTTP/HTTPS navigation is accepted, and website renderers have no Node integration or workspace preload bridge. Modals hide the native page surface while displayed.

The browser uses Electron [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view), so normal websites are not limited by iframe embedding restrictions. Live pages require the desktop app; the web preview shows the browser layout and stored tabs.

## Local data

The desktop app stores files under:

```text
%APPDATA%/Daevu/workspace/
  workspace.json
  workspace.backup.json
  projects/<project-id>/
    notes/<note-id>.md or .csv
    files/<file-id>.<original-extension>
```

Back up the entire workspace folder while the app is closed. State writes are serialized and use a temporary file and rename; the previous JSON snapshot is retained as a recovery backup. Tasks left running after a crash or shutdown are marked interrupted on next launch.

Local storage does not mean offline AI: relevant project notes, recent conversation, and file paths are sent to the selected CLI. The CLI and its tools can send data to their configured AI providers and MCP services. The app does not bundle CLI credentials, expose them to the UI, or upload your workspace to an app server.

## Scope of this version

The core workspace is complete, with compatibility limits. Documents use block records and Markdown export; spreadsheets use CSV-backed cells with a bounded formula engine. PDFs and other supported files have in-app viewers. Word uploads keep their original file alongside an editable Markdown conversion; pictures remain in the original rather than the conversion. Spreadsheet imports preserve formula text and saved results where available, but do not preserve all formatting. Unsupported functions show their last saved value when one is available; that value does not recalculate. Mobile builds, character-level shared document editing, access to every private connector catalog and automatic website deployment are not provided.

Direct account adapters can call selected MCP servers through the app. CLI profiles use their CLI permissions; Codex/custom CLI profiles still use their existing CLI MCP configuration. No CLI sandbox or permission checks are bypassed. Research-only behavior is expressed in agent prompts; it is not a universal security boundary for arbitrary custom CLIs or powerful MCP servers. Imported content is labeled as untrusted context in the coordinator prompts.

Word and spreadsheet conversion runs in a worker with a 60-second deadline and a 256 MB JavaScript heap limit. Inputs must be under 50 MB; ZIP-based documents must also fit within 5,000 entries and 100 MB of expanded data. Adding a source file keeps the original even if its conversion fails, and reports the failure. These are resource limits, not a complete sandbox for untrusted file formats.

Moving or copying a document across projects copies its stored pictures and embedded charts with their direct data sources. Original dependencies remain available to other documents. When a board in the source project reads the moved document, a retained document titled "(chart source)" keeps that board usable. On local storage, hidden inline pictures with no saved references are reclaimed after a seven-day grace period; references in pages, documents, canvas, app state and Trash protect them. Automatic reclamation is disabled for shared Drive workspaces because another device may still have pending references.

Core and bundled chart views accept up to 20,000 source cells. Larger tables show a message asking for a smaller source range or a summary; the application does not silently sample the data.

## Architecture and checks

- `src/`: React UI, Markdown editor, CSV grid, React Flow canvas, browser preview adapter.
- `shared/domain.mjs`: provider argument builders, response/action parsing, CSV support, initial state, validated UI mutations.
- `electron/main.cjs`: native file dialogs and narrow IPC handlers; renderer context isolation, sandboxing, no Node integration, restricted navigation.
- `electron/store.cjs`: local persistence and materialized project files.
- `electron/runner.cjs`: CLI subprocesses, concurrency controls, delegation, cancellation, synthesis, and errors.
- `electron/scheduler.cjs`: persistent scheduled runs, catch-up, busy-agent handling, and completion tracking.
- `electron/browser.cjs`: isolated native browser tabs, navigation, page capture, and source persistence.
- `tests/`: persistence, action validation, provider parsing, CSV round trips, delegation, handoff limits, errors, cancellation, and literal stdin process execution. Provider tests use deterministic fixtures; no live model requests are made.

Electron bridge implementation follows [Electron context isolation guidance](https://www.electronjs.org/docs/latest/tutorial/context-isolation).

Inter is bundled locally under its SIL Open Font License; see [font license](../build/INTER-LICENSE.txt).

## Spreadsheet formulas and Python

Click a cell to select it, then type to replace its value. Double-click or press F2 to edit existing text; Escape cancels the edit. Enter moves down, Tab moves across, and arrow keys move between cells. Shift+arrows or dragging selects a range. Ctrl+C/V copies and pastes tabular data, including multiline cells. Ctrl+Z/Y undoes or redoes edits, and Fill down (Ctrl+D) copies the top selected row with relative formula references adjusted. The formula bar shows the selected cell source, and its name box jumps to addresses or ranges such as B12 or A1:C10. Formula cells show calculated results until editing. Addresses include the first row: A1 is the top-left cell. Edits autosave after a short pause, including while typing; Ctrl+S saves immediately. Drag column boundaries to resize them, or use Left/Right while a resize handle is focused. Column widths are remembered locally. Freeze row 1 keeps a header visible, and the footer shows selection count, sum, and average. The grid renders a moving window of rows rather than stopping at row 1,000, with up to 10,000 editable rows and 256 columns; spreadsheet-file import rejects workbooks beyond those bounds, 24 sheets or 2,000,000 characters per sheet instead of silently truncating them. Split oversized workbooks before importing. Supported formulas update when inputs change. Unsupported imported formulas retain the source workbook's last saved result where available, with a notice in the editor; editing the formula invalidates that saved result. Renaming a sheet rewrites references in its other tabs and in peer spreadsheets in the same project. Supported functions include SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, ROUND, ABS, IF and IFERROR, with additional lookup, text, date and statistical functions implemented in `shared/sheet.mjs`; arithmetic, percentages, comparisons, text concatenation, absolute references, and rectangular ranges are supported. Circular references and invalid formulas show cell errors. This is a basic calculation engine, not full Excel compatibility. CSV export preserves formula text; quote cells containing commas when editing CSV directly.

Open **Python** on a spreadsheet. Enter a Python executable (`python`, `py`, or its full executable path) and a script, then click **Run Python**. Python 3 must already be installed; the app does not bundle Python. The executable runs with `-I` (isolated Python startup) and a 30-second limit. Packages must be installed for that interpreter. This is local code execution with your Windows user permissions, including file and network access; it is not a sandbox. Scripts never run automatically on opening, importing, chat, or scheduling.

- `rows`: mutable list of rows containing the original CSV strings, including formulas. Replace `rows` or edit it to propose sheet changes.
- `values`: the calculated cell values at the start of the run. Non-formula CSV cells remain strings. This snapshot does not recalculate as the script modifies rows.
- `get_cell("B2")`: read the calculated snapshot by address.
- `set_cell("D2", value)`: propose a cell value or formula, expanding the grid as needed.
- `print(...)`: show script output in the panel.

For example:

```python
print("First campaign spend:", get_cell("B2"))
set_cell("D1", "Cost per lead")
set_cell("D2", "=IFERROR(ROUND(B2/C2,2),0)")
```

Review the proposed cells and choose **Apply to sheet** or **Discard**. Apply is disabled if the sheet changed after the run. File writes and other external side effects performed by Python happen during execution and are not undone by Discard. Sheets/scripts are saved locally; scripts are retained in the workspace JSON, while CSV export contains cells only. Script input and results are limited to 1 MB, 10,000 rows, and 256 columns. The grid virtualizes rows up to its 10,000-row editing limit; it does not display only the first 1,000 rows. Imported data is subject to the limits above.

## Google Drive workspace connection

Install and sign in to **Google Drive for desktop** on each Windows PC. In Daevu, open **Connections → Google Drive**:

1. **Move workspace to Drive**: choose a folder inside My Drive or a shared drive. The app previews a new `Daevu` destination and copies the workspace after confirmation. The previous folder is retained as a backup.
2. **Restart and open**: the app starts saving projects, chats, notes, spreadsheets, saved Python scripts, profiles, canvas layouts, schedules, and imported files to the selected folder.
3. On another PC, wait for Drive to finish syncing. Choose **Open existing Drive workspace**, select the `Daevu` folder, review, and restart. Existing local work is kept separately; workspaces are not merged.
4. **Keep a local copy** copies the open workspace back into device storage. **Reopen Drive workspace** reloads the shared version after a restart.

Keep the selected folder **Available offline**, or use Drive's mirror mode. The installed Drive app performs uploads/downloads; Daevu cannot confirm cloud synchronization or repair Drive authentication. This is a folder connection, without a separate Drive API login. Native Google Docs/Sheets remain links/attachments rather than editable CSV or Markdown files.

### Simultaneous editing (v0.8.0)

Upgrade **every device to v0.8.0 or newer** before enabling this format. Back up your workspace and finish syncing first. On the PC currently editing the Drive workspace:

1. Open **Connections → Google Drive → Enable shared editing** and confirm.
2. Choose **Restart and open**, then let Drive sync the complete folder.
3. On the other PC, choose **Open existing Drive workspace** and select that same folder, or restart if it is already connected there.
4. Keep the workspace folder **Available offline** on both PCs. Both apps can now stay open and edit simultaneously, without Supabase or another database service.

Each device saves independent, immutable change files in `.research-sync`. Separate notes, new items, and different database cells merge after Drive delivers the files. Changes to the same value preserve alternative versions: open **Review changes → Conflicts**, copy any text you want to combine, and select a version. Notes and CSV sheets resolve as whole saved text versions, rather than character-level collaboration. Deleted items retain their data under **Review changes → Deleted items** and can be restored, including concurrent edits.

While a document or spreadsheet is open, each PC records that in a small file of its own under `.research-sync/presence`. If another PC has the same item open, the editor shows "Also open on <PC>". Different documents on different PCs stay fully parallel, and nothing is locked: if both PCs change the same document, both versions are kept for you to compare under **Review changes → Conflicts**. The notice depends on Drive delivery and on the two clocks being roughly in step, so it can be late or missing, and it disappears a few minutes after the other PC closes the document.

Delivery follows Google Drive's sync speed; this app cannot confirm that a change has reached Google's cloud or another PC. The local pending count measures writes waiting for the Drive folder only. During an open shared session, edits are first saved in a device-local outbox and retried when that folder returns. On a fresh launch, a missing Drive folder shows the original local backup read only; keep the folder available offline for reliable startup.

Keep the entire `.research-sync` folder, its baseline, and all change files. The shared change log can be compacted into a new baseline; startup attempts this for sufficiently large logs. Keep the marker, baseline and remaining changes together so devices can reload after compaction. The original `workspace.json` remains a migration snapshot; subsequent shared edits live in the change log. Export or **Keep a local copy** for a current standalone snapshot. Old app versions cannot edit the shared format and must be upgraded.

Without enabling shared editing, the original format still allows **one PC at a time**. Quit from the tray, let Drive finish syncing, and then open on the next PC. Session markers and changed-file checks are advisory safeguards across asynchronous Drive replicas. Recover a stale session only after closing the other app.

AI credentials, encrypted API keys, MCP configuration, OAuth configuration, browser cookies, account assignments, theme, selected project, startup settings, and schedule execution preferences stay on each PC. Sign in and reconnect tools separately on each device. Shared automatic schedules can run only on the PC that enabled shared editing, with its local schedule opt-in enabled; manual research can run on every device. Profiles, chat history, notes, databases, apps, and saved Python scripts sync as workspace data.

During a storage switch, active research/Python runs must finish or be stopped. Existing local work is kept separately when opening another workspace; independent workspaces are not combined. Failed copies retain the active storage and clean their temporary staging folder.


## Connect tools and services (v0.7.0)

Open **Tools & MCP → Browse connections**, search for a service, and choose **Connect**. The directory uses the public [MCP Registry](https://registry.modelcontextprotocol.io/), not the private ChatGPT plugin catalog. Publisher IDs and endpoint setup are shown before connecting; a listing does not guarantee that the service accepts this app. Local-package listings require manual configuration and are never installed automatically.

Choose **Sign in with browser**, **API token**, or **No additional sign-in / access in URL**, as appropriate for that service. Browser OAuth uses the official MCP SDK with PKCE, a state-validated loopback callback, issuer-bound encrypted tokens, and refresh. It requires a provider that accepts public desktop clients and dynamic client registration. Providers restricted to approved apps require their own supported authorization; another app’s client IDs, cookies, and private connectors are not reused.

For your own website, choose **Custom connection**, paste its private MCP endpoint, and select **No additional sign-in / access in URL** if the endpoint already includes access. Use advanced JSON for local commands or HTTP headers. Test connection only initializes MCP and lists tools; it does not invoke them. Do not commit access URLs or tokens. Each device needs its own connection setup, including when projects are stored in Drive.

Select servers in the agent profile’s default MCP list or in the chat **Tools** menu. ChatGPT/OpenAI, Claude API, and Gemini adapters run function tools locally through the app and send results back to the selected model. Tool calls ask for approval by default; optional automatic reads trust the server’s read-only metadata. Write and unclassified operations ask unless that server has been explicitly set to **Always allow all tools**; see the approval section below. Cancellation clears pending approvals and closes sessions. Claude CLI receives only selected app-managed servers in a temporary private configuration; Codex/custom CLI profiles continue using their own configuration.

Services can impose their own restrictions. For example, [Indeed’s documented MCP access](https://docs.indeed.com/mcp) is scoped to its supported connector; seeing Indeed in another app does not authorize this standalone app. Marketplace availability may change independently of this release.

## Full-pane apps and separate windows (v0.7.1)

Apps open without the duplicated document title, icon, and creation-date block. A compact control strip keeps source editing, reload, export, and **Open app in new window** available; the app fills the remaining pane. The separate native window contains only the app, can be resized or maximized, and stays linked to the same project and saved app state. Reopening focuses the existing window. Closing the separate window keeps the embedded tab available.

Apps can read databases created in **Boards**, in the same project or work folder, using `await rw.table("Database name")` (or the database ID). `await rw.tables()` lists available databases and spreadsheets. Register a refresh function with `rw.onReady(refresh)` and `rw.onChange(refresh)` so changes in Boards appear in the app, including its separate window. This older read bridge remains supported; v0.10.0 automatically connects apps to the full row-storage API described below. `rw.state.set(key,value)` saves the app's own state. `rw.ask(text)` returns a request to the main workspace chat draft.


## Project databases and app storage (v0.9.0)

SQLite ships inside the Windows EXE: no separate database installer, login, service, or server is required. Each project/work folder has a separate SQLite database. Its Boards databases become physical tables with typed column affinities, primary row IDs, and indexes for number, select, and date properties. Existing Boards data is indexed automatically without replacing the original workspace files. Table, board, and gallery views remain available.

Open a Boards database and choose **SQL & storage**. The schema lists the exact SQL names, including disambiguation for repeated names. Run read-only SELECT queries, filters, joins between this project's tables, and aggregate calculations. Queries use an isolated process, a 4-second timeout, and a 1,000-row / 2 MB output cap. Only one statement is accepted; writes, attached databases, extension loading, and PRAGMA commands are blocked. `_id` is the stable record ID. **Export .sqlite** exports a standard snapshot of all Boards tables in the project for an external SQLite client.

### Persistent apps

Apps run inside their project's sandbox and can use the database API from both the embedded pane and separate window:

```js
const schema = await rw.db.schema();
let contacts = schema.tables.find(
  t => t.title === 'Contacts' && t.ownerAppId === schema.appId
);
if (!contacts) {
  contacts = await rw.db.create('Contacts', [
    { id: 'name', name: 'Name', type: 'title' },
    { id: 'score', name: 'Score', type: 'number' }
  ]);
}
// Run this in response to an action; do not seed a row on every page load.
const record = await rw.db.insert(contacts.id, { name: 'Ada', score: 10 });
await rw.db.update(contacts.id, record.id, { score: 20 });
const currentSchema = await rw.db.schema();
const table = currentSchema.tables.find(t => t.id === contacts.id);
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const result = await rw.db.query(
  `SELECT * FROM ${quote(table.sqlName)} WHERE "Score" > ?`, [5]
);
// result = { columns: ['_id', 'Name', 'Score'], rows: [[id, 'Ada', 20]], truncated: false }
// await rw.db.remove(contacts.id, record.id);
```

`rw.db.create(name,properties)` creates a Boards database owned by that app. Property IDs must be unique; exactly one property must have type `title`. Other types are `text`, `number`, `date`, `checkbox`, and `select` (with an `options` array). Rows use stable IDs. Insert/update values use property IDs or unambiguous names, with finite numbers, booleans, YYYY-MM-DD dates, and existing select options as appropriate. A table retains the current 2,000-row, 30-property limit; each project supports up to 100 app-created/managed database tables. This release does not provide arbitrary SQL schema changes, triggers, or a database server for outside apps.

Apps automatically read and edit all Boards tables in their project. **Allow apps in this project to edit rows** is enabled by default and can explicitly disable row edits for a table. Ownership records which app created a table; it does not prevent another app in the same project from using it. Backend IPC binds every call to the hosting app and project. `rw.onChange(refresh)` lets apps update when project data changes. Existing `rw.table(...)`, `rw.state`, and other SDK calls continue working.

### Agent access

Project database access is automatic for every agent working in the project. Account-connected agents receive schema, SQL query, table creation, validated row-write, and schema-management tools. Agents can alter a table’s name/properties and drop a table when requested. Codex and Claude CLIs also receive these tools through an ephemeral, project-scoped loopback MCP connection that closes after the run. Custom CLIs can return `databaseWrites` in research-actions, with create/insert/update/delete/alter/drop operations applied by the workspace. CLI agents must not edit SQLite files directly. These actions use the same typed validation and persistence as apps. No external MCP installation is needed for project data.

### Drive and backups

SQLite files stay in device-local app data under `databases/`, outside Drive. They are transactionally rebuilt from the current workspace records when data changes and before queries. Workspace JSON (local mode) or the shared change log (shared mode) remains the durable sync/recovery source. Apps and agents write through the workspace service so changes participate in Drive merging and deleted-item recovery. Each PC builds its own matching SQLite tables after Drive delivers changes; the active `.sqlite` file is never synced between writers. Original Boards data and the complete shared log must be retained. Direct external edits to the device-local SQLite copy are not imported and can be overwritten; use an exported snapshot for external tools.

Older Boards editor drafts apply only their own field changes, preserving newer app-created rows and unrelated record edits. Shared text/cell conflicts still follow the v0.8.0 review workflow. Credentials and service authorization remain local to each device.


## App studio and launcher (v0.10.0)

Apps are project-owned multi-file applications. **Home** lists saved apps across projects. Opening one launches its own native window; **Edit app** opens its studio in the owning project. Workspace search also opens apps directly. In a packaged Windows build, **Desktop shortcut** creates a desktop shortcut with the app's own icon. **Edit > Add to Windows search** also creates a Start menu shortcut. Keep a portable EXE in its original location. Shortcuts launch through Daevu; they are not separate exported EXEs. Closing the workspace window leaves independent app windows usable.

The studio has a file list, text editor with Tab/Ctrl+S support, asset import, live draft preview, and runtime console. **Save draft** persists source. **Preview** checks compilation and runs that saved draft. **Publish** compiles and promotes a working version for home/search/windows. Draft edits do not replace a published app until published; the three previous publications can be restored to the draft. Publishing checks compilation, not every behavior—use Preview to verify interactions. Runtime logs/errors are also visible to agents. Draft previews use real project data, so testing a write changes that data.

Entry file: `index.html`. Use relative module imports, separate CSS, JavaScript, TypeScript, JSX (with a provided JSX runtime), and JSON. The compiler bundles local files and the installed **Three.js** and **Phaser** libraries; no CDN or package install is needed per app. For example:

```html
<!-- index.html -->
<main id="app"></main>
<script type="module" src="main.js"></script>
```

```js
// main.js
import { makeGrid } from './grid.js';
import './style.css';
// Optional: import * as THREE from 'three';
// Optional: import Phaser from 'phaser';
rw.onReady(async () => {
  const schema = await rw.db.schema();
  makeGrid(document.querySelector('#app'), schema);
});
const unsubscribe = rw.db.onChange(() => { /* refresh displayed database records */ });
```

Image/audio/model assets can be imported into the studio as files containing data URLs. Use their path in HTML `src`, import their URL from JavaScript, or use `rw.files()` / `rw.file(id)` for existing project images. Maps, clickable grid sections, charts, WebGL scenes and canvas games can all use the same runtime and database. WebGL needs a working graphics driver. External network requests, arbitrary computer-file access, Node APIs and arbitrary npm packages remain unavailable to app code. Supported bundled imports are `three` and its addons, `phaser`, `react` and `react-dom`. Other browser libraries can be included as local source within the package limits; arbitrary package installation is not available. Apps are limited to 128 files, 2 MB per file, and 12 MB total source/assets. Asset uploads are limited to 1.4 MB before data-URL encoding. Existing database row/query limits still apply.

Apps run in a sandbox that cannot start downloads or read local files on its own. To export a generated file (for example a PDF built with a library), call `await rw.export("report.pdf", data)` from a click handler; `data` can be text, an `ArrayBuffer`, a typed array or a `Blob`, up to 50 MB. Daevu opens a save dialog and the app never sees the chosen path. To import, call `await rw.import({ accept: ["csv", "json"], as: "text" })`; it opens a file picker (up to 25 MB) and resolves `{ name, type, size, data }`, with `data` as `"text"`, `"arrayBuffer"` or `"dataUrl"`, or `null` if cancelled. Both work in the app window as well as in the project. Executable and script file types cannot be exported.

Agents automatically receive `app_list`, `app_create`, `app_read`, `app_edit`, `app_check`, `app_preview`, `app_errors`, and `app_publish`. They can build over many file edits and continue in later chat turns. Exact patches and revision checks avoid overwriting stale source. The UI saves file changes atomically and preserves unrelated changes from an agent/device. Account agents have a bounded 48 tool rounds / 128 calls per run, within the configured timeout; they can resume later. Codex/Claude use the same project tools through the local MCP connection. Custom CLIs retain the legacy single-HTML action format and do not receive a tool adapter automatically. Automated account/CLI routing tests use deterministic fixtures; this audit did not perform paid provider inference.

Source files and published versions are saved in workspace records and participate in shared Drive synchronization. Readable draft copies are mirrored under `projects/<project-id>/apps/<app-id>/`; editing those mirror files externally does not import changes. Each app uses only its current project's database. Copying app source into another project starts with that project's separate data. No example projects, agents, games or sample records ship in a fresh workspace.

## Separate agent chats (v0.10.1)

Use **New chat** below an agent's header to start a fresh conversation. **Chat history** switches between that agent's conversations in the project. Existing messages remain in **Original chat**. Each chat has its own model conversation and specialist handoffs; project notes, files, apps, and database access remain available. Starting a chat does not create a note. The selected chat is remembered on this device, and histories synchronize through the shared Drive workspace, including chats created simultaneously on different devices.

Starting a new chat leaves any running task active in its original conversation. **Open running chat** takes you back; another message can be sent after that agent finishes. Scheduled runs continue using Original chat.

Changing an agent's tool defaults no longer requires its account/model connection to be available on the current device. This changes only its selected tools; running that agent still requires a working provider connection. Claude CLI project tools now use a non-reserved MCP server name, load eagerly, and include discovery permissions. Claude reserves the name `workspace`, which prevented the earlier internal server from connecting; see the [official Claude MCP documentation](https://code.claude.com/docs/en/mcp).

## Offline agents and MCP permissions (v0.10.2)

A confirmed provider usage-limit error marks that agent **Offline** with a gray presence dot. The reset time appears when the provider supplies one. Claude's JSON diagnostic output is reduced to its useful error message. Ordinary authentication, tool-budget and timeout errors do not mark an agent offline.

Messages sent while offline stay saved as **Unread** without invoking the provider again. **Retry unread messages** checks again on request and processes the pending messages together in send order; successful replies mark them Read without adding duplicate user messages. Queues survive restarting and stay separate between chats. The app does not silently switch providers or enable paid extra usage. Offline status is bound to this device's provider/model/account configuration; unread messages and receipts participate in shared workspace synchronization. An explicit reset timestamp makes the agent available to try again after that time. When no timestamp can be resolved, use Retry. Scheduled tasks wait while the agent is known to be offline; a pending one-time schedule remains enabled. Failed scheduled runs remain visible in task history.

In **Tools & MCP → Connections**, choose **Ask every time**, **Allow read-only tools**, or **Always allow all tools** for a server. The last option includes writes and tools without read-only metadata. Approval dialogs also offer **Always allow this server**. Permissions persist in encrypted device-local credential storage, independently of the server's OAuth tokens; changing back to Ask applies to subsequent calls, including an open session. Only servers selected for the agent/message are exposed. Replacing a connection resets its permission, and an imported configuration with a changed fingerprint does not inherit its old permission. These settings govern app-managed account tool calls; CLI providers retain their own permission mechanisms.

The supported ChatGPT plan connection uses the Codex / ChatGPT Work allowance. It does not transfer the regular ChatGPT chat allowance or conversation history into this app; see [Sign in with ChatGPT](https://learn.chatgpt.com/docs/sign-in-with-chatgpt). Using a separately billed API connection is another option.

## Installable workspace plugins (v0.10.2)

The **Plugins** page installs optional panels from a folder or ZIP, with a permission review, enable/disable and uninstall controls. **ChatGPT** and **Gemini** are separate optional web-chat plugins. They display the actual provider websites and keep separate local browser sessions. Sign in within each; use their normal chat interfaces or send a shared message to selected web plugins. Supported generated images and downloads can be saved into the selected project automatically. **Ctrl+1** and **Ctrl+2** toggle the first and second recipients in **Send to**; press again to deselect. The shortcuts also work while an embedded chat has focus, and plain digits remain available for typing. Gemini has direct **Model** and **Effort** buttons in its pane header; ChatGPT has **Effort**. They open the signed-in website's actual settings menus, with available choices controlled by that service and account. These web plugins are separate from the ChatGPT/Codex account agent connection. Embedded sign-in, image access and composer automation depend on the provider's website; protected files may require its Download button. No usage limits are bypassed.

Custom plugins can render HTML/CSS/JS panels, including Three.js/Phaser experiences, and request scoped storage, project files, database and agent access. They run without unrestricted Node, host filesystem or external network access. See [plugin reference](../PLUGINS.md) for the manifest, SDK, package command and project-dice example. Plugin packages, registry/settings and SDK storage use the selected workspace when it is on Drive; cookies and sign-ins remain on each device. These plugin registry writes are separate from the shared document change log. No plugin is installed automatically in a fresh workspace.

The left sidebar can be hidden/restored from the top toolbar, with its setting remembered locally.

## Real image attachments (v0.10.2)

Use **Upload images** in the agent composer, paste a screenshot, or drag images into the chat. PNG, JPEG, WebP and GIF files are saved into the current project's Files and shown as thumbnails. Send images alone or with a message. Attaching an image through **File from this computer** also imports its real bytes instead of sending only its path.

ChatGPT/OpenAI, Claude API and Gemini receive native image content in their requests. Codex CLI receives `--image` paths; Claude CLI receives project image paths with its Read tool allowed. Custom CLIs need their own image-reading capability. The selected model must support vision. Up to four images, 5 MB each and 12 MB combined, are supported per request. Recent image references remain available for follow-up messages in that chat. Unread retries retain local image references; raw base64 is not stored in workspace messages. Image files follow normal project/Drive storage. Standard web plugins use each provider website's own upload controls.

Payload formats follow the official [OpenAI image-input guide](https://developers.openai.com/api/docs/guides/images-vision), [Claude vision guide](https://platform.claude.com/docs/en/build-with-claude/vision), and [Gemini image-understanding guide](https://ai.google.dev/gemini-api/docs/image-understanding). Validation uses deterministic provider fixtures rather than paid inference.

## Appearance

Daevu uses dark and light themes with glass-style panels and a compact tool strip. Browser chrome, canvas tools and cards, documents, spreadsheets, app development panels, menus and dialogs share the surface system. Apps using the workspace SDK theme variables follow the selected palette.

Hover, press, panel, dialog and content transitions use short, subtle motion. The system reduced-motion preference suppresses these effects. Glass is rendered inside the workspace; external webpages and apps with their own styles retain their own content appearance. This does not make the desktop window transparent to other Windows apps.


### Unified AI service connections

All provider accounts and API keys use **Connections → AI connections → Add connection**. Choose OpenAI, Claude, Gemini, OpenRouter, or Custom API from one dialog. Custom APIs support Chat Completions and System One formats, including a TypeSafe/Jev preset. Jev works as a structured decision tool in agent profiles, while chat-capable models remain the agent’s conversational provider. Optional AI website plugins can display the TypeSafe console or another HTTPS tool. See [account connections](../ACCOUNT-CONNECTIONS.md#unified-ai-connections-and-custom-services).


### Browser assistant plugin

The optional **Browser assistants** plugin adds an **AI** side panel to the Browser tab. It can send the current page’s text and viewport screenshot to a project’s selected model profile, so questions such as “what do you see?” have current tab context. Sharing can be switched off, and browser chats remain separate from the profile’s ordinary conversations. This uses the workspace’s configured model connection, not Chrome’s built-in Gemini session. See [browser assistant plugin](../PLUGINS.md#browser-assistants-contextual-side-panel).

### App logos

Each workspace app has its own automatic icon. Open an app, choose **Edit**, then use **App logo → Choose image** to upload a PNG, JPEG or WebP image (up to 5 MB). Images are fitted into a square PNG; **Reset logo** restores the automatic icon. Logos are saved with the app and shown in Home, the Apps list, open app tabs and independent app windows. Newly created Windows shortcuts use the app icon too; recreate an existing shortcut to update its icon. Agents can design an icon directly with `app_edit`, `op: "logo"`, and `icon: {background, radius, paths: [{d, fill, stroke, strokeWidth}]}`. Paths use SVG path commands on a 256 by 256 canvas; colors are hex values or `none`. The host renders a PNG and applies it to the workspace icon, native window, and newly created shortcuts. `app_read` returns `logoDesign` so agents can revise their work. Agents can also assign an embedded PNG app file or a bounded PNG data URL. For example: "Create a mint-and-lime icon for this app and apply it as the app logo."

### Agent chat menu

The effort bar is hidden by default; choose **Effort** in the message box to show it. An explicit show/hide choice is remembered. The **Agents** button in chat opens a contact menu over the workspace to the left of the conversation, with profile pictures, names, recent message previews and times. Search by name or role and select a contact to open its most recent conversation. Escape, the close button or a click outside dismisses the menu. The workspace keeps its width, and native browser views are hidden while the menu is open so they cannot cover it.


### Pull-down canvas and sticky notes

A connected workbench layout uses a full-height activity rail flush against the sidebar, with compact icon-only handles: Apps first, then Canvas, Browser, and installed plugin workspaces. The rail moves with the sidebar and keeps clear of headings and editor content. Opening any pull-out temporarily collapses the sidebar; closing it restores its previous state. Apps opens a workspace-wide launcher with app search, pinning, editing, desktop shortcuts, and New app for the selected project. Apps is no longer a project tab. Pull a notch slightly to the right to open its workspace over the current screen. Only one pull-out is open at a time; the underlying page stays in place. Keyboard users can focus a notch and press Right or End to open, Left or Home to close. The lower grip can still resize the panel. AI chat stays accessible alongside the overlay, with a Show/Hide chat control. Canvas and Browser no longer occupy project tabs. The canvas project selector keeps drawings, documents, attachments and sticky notes with the selected project. Use the Sticky note tool in the canvas palette, then click the canvas to place it. Connectors and arrowheads are white in dark mode. Workspace Settings remains in the sidebar profile controls.

Under **Plugins**, each installed standalone panel has a **Place in** option: Sidebar, Left pull-out notch, or Project tab bar. The setting is remembered per plugin. Pull-out plugins appear below Canvas and Browser; tab plugins appear beside Overview, Page, and Files. ChatGPT and Gemini share one **AI chats** notch by default, opening both installed providers side by side with the shared composer. Their placement setting moves the combined workspace together. Plugin pull-outs open with the built-in agent chat hidden and use the full work area; Show chat opens it explicitly, and closing the pull-out restores the underlying workspace chat. Browser assistant extensions remain integrated into the Browser.

### Drafts, continuation and quick access

Agent drafts are saved per project, agent and conversation, including references to already saved attachments. Plugin drafts keep the message, attachment bytes, selected recipients, website-control visibility, split view and pane widths in the local app profile. Drag the divider between web chats to resize them. Draft writes flush when switching projects and before quitting. Signed-in web chats remember their last conversation per project and panel; restored conversation addresses exclude transient URL tokens. Drafts and browser-session state stay on this device.

**Wait for busy chats** holds a requested send until each selected provider finishes its current response. Ready providers can receive their messages while another is still busy. Cancel queued send keeps the unsent draft; changing projects or leaving the plugin also cancels waiting sends. Already submitted messages continue normally. Use the star on a Home app card to pin it above other apps.

### Movable columns, pictures that text runs around, and agent formatting

**Layout.** The project list and the chat can each sit on either side of the window. Drag the grip in their header (or click the arrow button beside it) to move one; while you drag, both edges light up and the one under the pointer is where it will land. Pull a column's inner edge to resize it (the chat up to 900 px), use the arrow keys on the edge for fine steps, and double-click it to go back to the default width. The choice is remembered on this computer.

**Pictures.** Paste (Ctrl+V), drop or import (Image button, `/image`, Add image) a picture into a page, a document or the canvas. Pictures are stored as project files, marked so they do not appear as separate cards on the canvas, and sit at a free position: drag to move, drag a corner to resize (the shape is kept), arrow keys nudge, Delete removes. The bar above a selected picture on a page or document sets how text treats it: wraps around it, runs above and below only, or ignores it so the picture sits in front. Which side the text takes depends on which half of the column the picture is in. Text is laid out with [Pretext](https://github.com/chenglou/pretext), one row at a time, so every row can have its own width; `src/flow.js` turns that into the spacers the real text wraps around, and checks the result against what the page actually drew.

**Markdown formatting.** The current repair helper is used both for displayed Markdown and block conversion, including user text. It can change literal text and code (a known limitation in this public baseline). It attempts these repairs: a table squashed onto one line becomes a real table, `#Heading` gets its space, `•` becomes a bullet, `<br>` becomes a line break, and doubly escaped `\n` becomes real line breaks. In chat, tables, task lists and strikethrough render. On pages and documents a table is its own editable block, nested lists keep their levels (Tab and Shift+Tab change the level), and text shows its bold, italic, code and links until you click into it.
