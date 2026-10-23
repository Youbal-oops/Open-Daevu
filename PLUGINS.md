# Workspace plugins

Plugins are optional extensions to Daevu. In local mode they are stored in the device profile; with a Drive workspace the package registry, settings and plugin SDK storage are stored in that workspace’s `plugins/` folder. Website cookies/sign-ins remain device-local. They are separate from agent profiles and MCP connections. Open **Plugins** from the profile menu to install either **ChatGPT** or **Gemini** independently, or install a custom folder/ZIP or public GitHub repository. Review its permissions before installation. The sidebar shows up to three enabled plugins; the Plugins menu lists everything installed. Disable closes its native web panels; uninstall removes its package and plugin settings, while project files and database records remain.

## ChatGPT and Gemini

These plugins show the providers' actual websites using native Chromium views. They use their normal website accounts and conversation lists. They do not call the workspace's API/Codex connection or impersonate personalized agent profiles. Sign in separately in each plugin; sessions persist locally and are not copied from Chrome, the provider's installed app, or another device.

The shared workspace composer is shown by default and hides the website’s composer. **Side by side** keeps ChatGPT and Gemini visible together. **Show website controls** restores the provider’s native composer when needed. Model, Attach & tools, Voice, and Stop shortcuts forward to the website’s controls; model/tool/voice shortcuts reveal the native composer so its menus remain usable. The shared composer sends the same message to the installed, enabled web plugins you select. Open each plugin and sign in first. Sending uses the visible website's composer and Send button; if a website changes its controls or blocks embedded sign-in, the UI reports that the operation needs manual action. It does not bypass provider restrictions or usage limits. Voice depends on the provider’s web support. Audio-only microphone requests from the provider origin require your permission; camera and other device permissions remain denied.

Press **Enter** to send to all checked chats; **Shift+Enter** inserts a new line. Use **Attach files & images**, paste images/files, or drop files on the shared composer. Review or remove attachments before sending. Up to eight files, 20 MB per file and 40 MB combined, can be sent through each selected website's normal upload control; each provider's supported formats and account limits still apply. Attachments can be sent without text. The sender waits for uploads and an enabled Send button and confirms submission. Results name each provider, and a partial failure leaves the draft with only failed providers selected for retry. Already staged files are reused on that retry. An unconfirmed submission asks you to check that conversation before retrying. Gemini's sidebar stays hidden in compact view without repeatedly clicking its menu; Show website controls restores it.

The local Gemini follow-up uses native Chromium text insertion and sends through one provider at a time to avoid competing for editor focus. Upload checks are limited to the message composer. Each provider's result appears as soon as it finishes, and a stalled send times out instead of leaving the shared composer permanently busy. These paths are implemented in source; signed-in website compatibility still needs live verification.

Select a project in the plugin toolbar. With **Save downloads** enabled, downloads initiated by that plugin are saved into that project’s **Files**. Generated images exposed in supported assistant-message elements are checked periodically while the plugin is visible. **Save images** checks immediately. Identical content from the same plugin is not repeatedly saved. Images protected from page access, documents that haven't been downloaded, and provider layout changes may require using the website's Download button. Saving inline images supports PNG/JPEG/WebP/GIF up to 3 MB each; downloads are capped at 100 MB. Auto-save off uses the normal download dialog. Project files participate in the existing Drive synchronization; website conversations remain at their provider.

## A custom panel

Install `plugin-examples/project-dice/` for a small working SDK example. It is not installed in fresh workspaces. A package contains `manifest.json` at its root and local source/assets:

```json
{
  "apiVersion": 1,
  "id": "my-panel",
  "name": "My panel",
  "version": "1.0.0",
  "permissions": ["storage", "database:read"],
  "panels": [
    { "id": "main", "title": "My panel", "type": "html", "entry": "index.html" }
  ]
}
```

Use module scripts, relative imports, CSS and JSON. Three.js (`three`, `three/addons/...`), Phaser (`phaser`) and React (`react`, `react-dom`) are bundled in the host and can be imported directly. Other browser libraries or emulator code can be included as ordinary local source files, within the package limits. Binary images, audio, fonts and model assets are converted to data URLs during installation. Include only assets/code/ROMs you have the right to use. Plugins can render games, character models, maps and custom controls within their panels; this version does not expose unrestricted Node/Electron access or replace arbitrary host UI internals.

Package a folder using the repository's Node runtime:

```powershell
node scripts/package-plugin.cjs plugin-examples/project-dice project-dice.zip
```

The folder and ZIP paths use the same validation: 128 files including the manifest, 2 MB per file, 12 MB source/assets total; ZIP input is capped at 16 MB. ZIP CRCs, duplicate case-insensitive paths, traversal, encryption and symbolic links are checked. A package must compile before its install review appears. Updating preserves plugin settings/state and asks you to review the new permission list. With Drive storage, wait for the plugin package and registry to sync before using them on another PC. Sign in separately on each device. Concurrent edits to plugin installation/settings are not merged through the shared document change log.

## Adding to the app

Besides panels, a plugin can add to features the app already has. Declare what it adds under `contributes` (`boards`, `fileEditors`, `sheetFunctions`, `themes`, `browser`); a plugin with contributions needs no panel. Board and file-editor contributions ship pages with `window.workspacePlugin`. Spreadsheet functions and themes are declarative; browser contributions run in the research browser with their own permissions.

```json
{
  "apiVersion": 1,
  "id": "pdf-pen",
  "name": "PDF pen",
  "version": "1.0.0",
  "permissions": ["files:read", "files:edit"],
  "contributes": {
    "boards": [
      { "id": "sankey", "name": "Flow diagram", "hint": "Where things go", "group": "science", "entry": "sankey.html" }
    ],
    "fileEditors": [
      { "id": "pen", "name": "PDF pen", "extensions": ["pdf"], "entry": "pen.html" }
    ]
  },
  "panels": []
}
```

**Board types** appear in the New menu of Boards, in a page's `/` menu and on the canvas, under the group you name (`basic`, `stats`, `business`, `science` or `other`). The board's data comes from the picker the app already has, so it can draw a spreadsheet range or a document table. Inside the page:

```js
const { title, state, table } = await sdk.board.get(); // table: { rows, label, error }
await sdk.board.set({ zoom: 2 });                       // your own saved state, up to 200 KB
sdk.onChange(() => { /* the table changed; call board.get() again */ });
```

**File editors** add an Edit button to the viewer of files with those extensions, and open the page in place of the viewer until you press Done. They need `files:read` and `files:edit`.

```js
const { id, name } = await sdk.file.get();    // the file being edited
const { base64 } = await sdk.files.read(id);
await sdk.files.update(id, newBase64);        // replaces the file's contents, up to 12 MB
```

`files:edit` is shown in the install review because it lets a plugin replace existing file bytes. This source version has no file-version restore for those edits; keep a backup of important originals.

**Spreadsheet functions** are formulas defined by an expression over named arguments, so they run inside the sheet and need no code or permission. Names are capitals; the built-in functions always win.

```json
"sheetFunctions": [{ "name": "MARKUP", "args": ["price", "pct"], "expr": "price*(1+pct/100)", "hint": "Price plus a percentage" }]
```

`=MARKUP(200, 10)` gives `220`. Expressions can use the same maths as function plots (`sqrt`, `log`, `if(a,b,c)`, `pi` and so on) and only the names listed in `args`.

**Themes** lay colours over the light or dark base they name. They show up next to Light and Dark under Settings, Appearance. Values are plain colours and lengths; URLs are refused.

```json
"themes": [{ "id": "dusk", "name": "Dusk", "mode": "dark", "vars": { "--accent": "#7c5cff", "--bg": "#14121c" } }]
```

**Browser changes** restyle, block, script and add buttons to the research browser. Each needs a permission you review at install: `browser:modify` for styles and blocks, `browser:scripts` for scripts and tools. `matches` lists the websites a change applies to (`"*"` or patterns like `"https://*.example.com/*"`; the default is every site). Give `css` or `code` inline, or point `file` at a file in the package; each is up to 20 KB.

```json
"browser": {
  "styles":  [{ "id": "night", "name": "Night pages", "matches": ["https://*.example.com/*"], "css": "body{background:#14121c!important}" }],
  "scripts": [{ "id": "tidy", "name": "Hide banners", "code": "document.querySelector('.banner')?.remove()" }],
  "blocks":  ["*://ads.example.net/*"],
  "tools":   [{ "id": "count", "name": "Count words", "icon": "Search", "code": "document.body.innerText.split(/\s+/).length + ' words'" }]
}
```

Styles and scripts run when a page finishes loading. Scripts and toolbar tools execute in the page’s main JavaScript world: they can read matching page content and use its network capabilities. A `"*"` match applies broadly; this is different from an opaque HTML-plugin frame. Blocks stop matching requests before they are sent. A tool becomes a button in the browser's address bar row; it runs on the open page and shows what its code returns under the page.

The statistics, business and science charts are ordinary plugins of this kind, kept in `bundled-plugins/chart-*` and installed from Plugins, Discover. Their code lives only in those folders: with a plugin off, none of it runs, and boards made with it show a note in place of the chart until you turn it back on. Each board entry can carry a `sample` (starting CSV for a new board). Plugin pages can import `react` and `react-dom` as well as `three` and `phaser`, and `.mjs`, `.jsx` and `.css` files.

## Browser SDK

Every HTML panel receives `window.workspacePlugin`:

```js
const sdk = window.workspacePlugin;
const { plugin, project, theme } = await sdk.ready();
const rolls = await sdk.storage.get('rolls') ?? [];
await sdk.storage.set('rolls', [...rolls, 20]);
const stop = sdk.onChange(() => { /* project changed; refresh your data */ });
```

The host binds calls to the displayed plugin, panel and selected project. A plugin cannot choose another project through the SDK. Calls require the corresponding manifest permission:

| Permission | SDK |
| --- | --- |
| `storage` | `storage.get(key)`, `storage.set(key,value)` — local state per project; total 2 MB per plugin |
| `project:read` | `project()` — selected project notes, description and KPIs |
| `files:read` | `files.list()`, `files.read(id)` — `{name,base64}`, up to 12 MB |
| `files:write` | `files.save(name,base64)` — adds a project file, up to 12 MB through the SDK |
| `files:edit` | `files.update(id,base64)` — replaces an existing project file, up to 12 MB |
| `database:read` | `db.schema()`, `db.query(sql,params)` — existing read-only SQL limits apply |
| `database:write` | `db.create(name,properties)`, `db.write({op,table,rowId,values})` — typed Boards operations |
| `browser:modify` | styles and request blocks in the research browser (see Adding to the app) |
| `browser:scripts` | scripts and toolbar tools that run on web pages in the research browser |
| `agents:read` | `agents.list()`, `agents.messages()` — assigned public profiles and this project's conversation messages |
| `agents:run` | `agents.send(agentId,text,chatId)` — runs an assigned agent and consumes its configured provider allowance |

Database read/write permissions are separate. These explicit plugin permissions govern plugin database operations; app-specific row permissions continue to govern app code. The agent SDK returns public profile fields, not provider credentials or CLI arguments. Agent runs retain the workspace's existing tool policies, offline handling and project scoping.

Plugin HTML runs in an opaque sandbox with no Node, direct host filesystem, external network or parent-page DOM access. Files and database records use the workspace's normal persistence; the plugin registry/settings and `storage` follow the workspace’s plugin folder in Drive mode. Browser cookies, website sign-ins and device UI preferences do not. Prefer database records or project files for data that needs the workspace’s shared-editing semantics. The initial SDK offers panels, project-change events, project data, agent access and local state; additional host capabilities can be added in later API versions.

## Sidebar

Use **Hide sidebar / Show sidebar** in the top toolbar, or **Ctrl+\** while the workspace UI has keyboard focus. The preference is remembered on this device. The restore control remains visible when the sidebar is hidden.

## Install from GitHub

Open **Plugins → Install from GitHub**, paste a public `https://github.com/owner/repository` URL, and choose **Download & review**. The installer downloads the default branch and validates the package before showing its permission review. The repository must contain `manifest.json` at its root; it must already be a workspace plugin, not an arbitrary source repository. Existing file count, archive size, traversal, symlink, and checksum checks apply. Installation does not run Git hooks, package managers, or install scripts. Private repositories and automatic updates are not supported yet. Reinstalling the same plugin ID opens the update review and preserves its settings.

## Project database workspace

**Workspace → Database** selects a project’s SQLite data. Schema visualizer shows real table names and column types with draggable cards, zoom, minimap, auto layout, and locally remembered positions. Table editor creates and edits tables, properties, and rows. SQL editor queries saved data and exports SQLite. Existing tables retain their IDs and app/agent access; databases no longer appear in the Boards collection. This version does not introduce foreign keys or draw inferred relationships between unrelated columns.


## Other AI websites

**Add AI website** creates a `web-app` panel from a name and an HTTPS URL, then shows the same plugin permission review. Web apps retain their own UI and separate device-local browser sessions; they do not use the shared ChatGPT/Gemini composer. Their downloads can be saved into the selected project. Normal API connections and agent access are configured independently in Connections.

A website panel uses `{"id":"main","title":"My AI tool","type":"web-app","url":"https://console.example.com/"}` in the manifest’s `panels` array and requires the `web-chat` permission. Add `files:write` to save downloads. It runs in a sandboxed native browser with no Node or workspace bridge.


## Browser assistants: contextual side panel

Install **Browser assistants** from Plugins, then open a project’s **Browser** tab and click **AI** beside its address bar. This is a native conversation panel with the active webpage left visible, rather than another copy of a chatbot website. Select one of the project’s configured agent/model profiles. Existing provider account/API/CLI connections supply the model and usage allowance; a Chrome Gemini session is not imported.

**Share current tab** sends its URL, title and visible text with each message. **Include screenshot** also captures the page’s current viewport, resizes it to at most 1,600 pixels wide, and attaches a JPEG through the existing image-input path. A vision-capable model is needed to interpret it. Screenshots are saved as project file attachments so the conversation can be reopened. Shared page content is labeled as untrusted evidence in the model prompt and kept outside the short user-visible question. It does not create a research note.

The sharing chip follows the selected browser tab. Turning sharing off prevents page and screenshot capture; sharing preferences stay on this device. Content is captured only when you send, with no background model calls. Switching tabs or navigating changes what the next message will share. The panel has separate browser conversations per project/profile, a new-chat control, a stop control, and the profile’s normal MCP/project tool capabilities. No profile is preinstalled or automatically created.

Browser assistant plugins declare `browserExtension: true`, a panel of type `browser-assistant`, and the `browser:read` and `agents:run` permissions. The bundled plugin also requests `files:write` for screenshots and `storage` for local preferences. Disabling or uninstalling the plugin removes its browser entry point while keeping saved conversations and project attachments.
