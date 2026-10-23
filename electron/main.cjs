const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, powerMonitor, safeStorage, screen, protocol, utilityProcess, clipboard, globalShortcut, net } = require('electron');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const nodeFs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { BoardsDatabase } = require('./boards-db.cjs');
const { Store } = require('./store.cjs');
const { Updates } = require('./updates.cjs');
const { toIcs, parseIcs } = require('../shared/calendar.mjs');
const { Reminders } = require('./reminders.cjs');
const { DeviceLock } = require('./device-lock.cjs');
const { AppWindows } = require('./app-windows.cjs');
const { nativeAppIcon, iconFile } = require('./app-icons.cjs');
const { renderIconDesign } = require('./app-icon-design.cjs');
const { AppProjects } = require('./app-projects.cjs');
const { WorkspaceStorage } = require('./storage.cjs');
const { Runner, execute } = require('./runner.cjs');
const { CredentialVault, AccountConnections } = require('./accounts.cjs');
const { McpRuntime } = require('./mcp.cjs');
const { searchRegistry } = require('./mcp-registry.cjs');
const { ToolApprovals } = require('./tool-approvals.cjs');
const { ProviderRuntime, DIRECT_PROVIDERS } = require('./providers.cjs');
const { Scheduler } = require('./scheduler.cjs');
const {ChatImages,loadImage,IMAGE_EXT}=require('./chat-images.cjs');
const {WorkspacePlugins}=require('./plugins.cjs');
const {PluginWebViews}=require('./plugin-web.cjs');
const {WebChatDrafts}=require('./web-chat-drafts.cjs');
const { ResearchBrowser } = require('./browser.cjs');
const { SheetPython } = require('./sheet-python.cjs');
const { discoverTools } = require('./tools.cjs');
const sheetPython = new SheetPython();
const { id } = require('../shared/domain.mjs');
// Agent-made pages are served from their own scheme so they get a strict policy of their own instead of the app's.
protocol.registerSchemesAsPrivileged([{ scheme: 'rw-app', privileges: { standard: true, secure: true } }]);
const previews = new Map();
const PAGE_POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; form-action 'none'; base-uri 'none'";
let window, store, runner, scheduler, tray, browser, accounts, accountError, storage, mcp, appWindows, boardsDb, appProjects, plugins, pluginWeb, quitting = false;
let appAskReady=false,pendingAppAsk,launchArgs=process.argv;
let webChatDrafts;
const approvals = new ToolApprovals(requests => { send('mcp:approvals',requests); if (requests.length && window && !window.isDestroyed()) window.show(); });
app.setName('Daevu');
// An install from before the app was renamed keeps its data folder, so nothing is lost or left behind.
if (app.isPackaged) {
  const appData = app.getPath('appData'), legacy = path.join(appData, 'Research Workspace'), nodeFs = require('node:fs');
  if (nodeFs.existsSync(legacy) && !nodeFs.existsSync(path.join(appData, 'Daevu'))) app.setPath('userData', legacy);
  try { app.setLoginItemSettings({ openAtLogin: false, name: 'Research Workspace' }); } catch {}
}
const testData = process.argv.find(arg => arg.startsWith('--test-data='));
if (!app.isPackaged && testData) app.setPath('userData', path.resolve(testData.slice('--test-data='.length)));
const primary = Boolean(testData) || app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on('second-instance', (_event,args) => { const rwLink=args.find(a=>a.startsWith('rw://'));if(rwLink&&openDeepLink(rwLink))return;if(openLaunchApp(args))return;if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
function openLaunchApp(args){const projectId=args.find(a=>a.startsWith('--open-project='))?.slice(15),appId=args.find(a=>a.startsWith('--open-app='))?.slice(11);if(!appId || !projectId)return false;if(!appWindows){launchArgs=args;return true;}appWindows.open(projectId,appId).catch(e=>dialog.showErrorBox('Open app',e.message));return true;}
const dev = process.argv.includes('--dev');
const trustedURL = dev ? 'http://127.0.0.1:5173/' : pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
// The window keeps its own copy of the workspace. After each change it is sent only what differs (the projects that changed
// and the small top-level values), not the whole workspace again; a change that touches many projects sends everything.
const packedByState = new WeakMap();
let sentState = null, sentRev = 0;
const sameValue = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
function pack(next) {
  const from = sentRev, rev = ++sentRev;
  let packed;
  const known = sentState && new Map(sentState.projects.map(p => [p.id, p])), changed = {};
  let count = 0;
  if (known) for (const p of next.projects) if (known.get(p.id) !== p) { changed[p.id] = p; count++; }
  if (!known || count > 12) packed = { from, rev, full: next };
  else {
    const top = {}, gone = Object.keys(sentState).filter(k => k !== 'projects' && !(k in next));
    for (const key of Object.keys(next)) if (key !== 'projects' && !(key in sentState && sameValue(sentState[key], next[key]))) top[key] = next[key];
    packed = { from, rev, top, gone, ids: next.projects.map(p => p.id), projects: changed };
  }
  sentState = next;
  packedByState.set(next, packed);
  return packed;
}
function sendState(state) {
  const packed = pack(state);
  if (window && !window.isDestroyed()) window.webContents.send('workspace:patch', packed);
  appWindows?.broadcast();
}
function send(channel, payload) { if (window && !window.isDestroyed()) window.webContents.send(channel, payload); if(channel==='workspace:state')appWindows?.broadcast(); }
function previewHtml(html){
  if (typeof html !== 'string' || html.length > 20000000) throw new Error('Built apps must be under 20 MB.');
  const token=crypto.createHash('sha256').update(html).digest('hex').slice(0,40);previews.delete(token);previews.set(token,html);
  while(previews.size>60)previews.delete(previews.keys().next().value);
  return `rw-app://page/${token}`;
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url.split('#')[0] !== trustedURL) throw new Error('Untrusted workspace request.');
    return fn(...args);
  });
}
async function createWindow() {
  appAskReady=false;
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  window = new BrowserWindow({ width: Math.min(1520, workArea.width), height: Math.min(980, workArea.height), minWidth: 1024, minHeight: 720, show: !process.argv.includes('--background') && !process.argv.some(a=>a.startsWith('--open-app=')), backgroundColor: '#111212', title: 'Daevu', icon: path.join(__dirname, '../build/icon.png'), autoHideMenuBar: true, titleBarStyle: 'hidden', titleBarOverlay: { color: '#161717', symbolColor: '#e5e5e5', height: 40 }, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== trustedURL) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  // Text fields and selected text get the usual Cut / Copy / Paste menu.
  window.webContents.on('context-menu', (_, params) => {
    const flags = params.editFlags;
    if (!params.isEditable && !params.selectionText) return;
    const template = params.isEditable ? [{ role: 'undo', enabled: flags.canUndo }, { role: 'redo', enabled: flags.canRedo }, { type: 'separator' }, { role: 'cut', enabled: flags.canCut }, { role: 'copy', enabled: flags.canCopy }, { role: 'paste', enabled: flags.canPaste }, { role: 'delete', enabled: flags.canDelete }, { type: 'separator' }, { role: 'selectAll', enabled: flags.canSelectAll }] : [{ role: 'copy' }, { role: 'selectAll' }];
    Menu.buildFromTemplate(template).popup({ window });
  });
  window.on('focus', pullFromDrive); window.on('show', pullFromDrive); window.on('blur', pushToDrive); window.on('hide', pushToDrive); window.on('minimize', pushToDrive);
  window.on('close', event => { if (!quitting && store.state.settings.keepRunning && tray) { event.preventDefault(); window.hide(); } });
  window.on('closed',()=>{pluginWeb?.destroy();pluginWeb=null;browser?.destroy();browser=null;window=null;appAskReady=false;});
  await window.loadURL(trustedURL);
  browser = new ResearchBrowser(window,store,send);browser.usePlugins(()=>plugins?.list()||[]);
  pluginWeb=new PluginWebViews(window,plugins,send,{canWrite:()=>storage.writable});
  if (process.argv.includes('--background')) window.hide();
}
// Drive is checked when the app opens or you come back to it, not on a timer. Edits are handed to Drive when you leave.
let pendingLink = null;
function parseDeepLink(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'rw:') return null;
    const id = value => /^[a-zA-Z0-9-]{1,100}$/.test(value || '') ? value : undefined;
    if (url.searchParams.get('calendar') === '1') return { calendar: true, event: id(url.searchParams.get('event')), date: /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '') ? url.searchParams.get('date') : undefined };
    const link = { project: id(url.searchParams.get('project')), note: id(url.searchParams.get('note')), page: url.searchParams.get('page') === '1' };
    return link.project ? link : null;
  } catch { return null; }
}
function openDeepLink(raw) {
  const link = parseDeepLink(raw);
  if (!link) return false;
  if (window && !window.isDestroyed()) { window.show(); window.focus(); send('deeplink', link); } else pendingLink = link;
  return true;
}
let lastPull = 0, deviceLock = null, checkingDevice = false;
// Only one computer has the workspace open at a time. Quit (sidebar or tray) hands it over.
async function claimDevice() {
  for (;;) {
    const status = await deviceLock.status();
    if (status.state !== 'other') { await deviceLock.acquire(); return true; }
    const name = status.holder.name || 'another computer';
    const options = { type: 'warning', title: 'Daevu', message: `Open on ${name}`, detail: `This workspace is already open on ${name}.

Use Quit in the app there (the Quit button in the sidebar, or the tray icon menu), give Drive a moment to sync, then press Try again.

If you cannot reach that computer, take over here. Anything it has not synced yet will merge in when it does.`, buttons: ['Try again', 'Take over', 'Quit this app'], defaultId: 0, cancelId: 2, noLink: true };
    const { response } = await (window && !window.isDestroyed() && window.isVisible() ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options));
    if (response === 0) continue;
    if (response === 1) { await deviceLock.acquire({ force: true }); return true; }
    return false;
  }
}
async function pullFromDrive() {
  if (!storage || Date.now() - lastPull < 15000) return;
  lastPull = Date.now();
  if (deviceLock && !checkingDevice) {
    checkingDevice = true;
    try { const status = await deviceLock.status(); if (status.state === 'other') { if (!await claimDevice()) { app.quit(); return; } } else if (status.state !== 'mine') await deviceLock.acquire(); }
    catch (e) { console.error(e.message); } finally { checkingDevice = false; }
  }
  storage.refresh().then(() => plugins?.reload()).catch(e => console.error(e.message));
}
function pushToDrive() { storage?.shared?.flushNow?.().catch(() => {}); }
function applyStartup(settings) {
  if (process.platform !== 'win32' || testData) return;
  if (!app.isPackaged) { if (settings.launchAtLogin) throw new Error('Launch at login is available in the installed Windows build.'); return; }
  app.setLoginItemSettings({ openAtLogin: Boolean(settings.launchAtLogin), path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: ['--background'], name: 'Daevu' });
}
function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '../build/icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('Daevu · Local scheduled tasks');
  const show = () => { if (window && !window.isDestroyed()) { window.show(); window.focus(); } else createWindow(); };
  tray.on('double-click', show);
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open Daevu', click: show }, { label: 'Run due scheduled tasks', click: () => scheduler.tick() }, { type: 'separator' }, { label: 'Quit', click: () => app.quit() }]));
}
app.whenReady().then(async () => {
  // A cancelled uninstall must not decide the next one.
  for (const name of ['uninstall-keep', 'uninstall-wipe']) nodeFs.rmSync(path.join(app.getPath('appData'), 'Daevu', name), { force: true });
  if (!primary) return;
  protocol.handle('rw-app', request => {
    const url = new URL(request.url), html = url.host === 'page' ? previews.get(url.pathname.slice(1)) : undefined;
    if (html === undefined) return new Response('Not found', { status: 404 });
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PAGE_POLICY, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
  });
  storage = new WorkspaceStorage(app.getPath('userData'), status => send('storage:state', status));
  const workspaceRoot = await storage.start();
  if (!testData && storage.shared) {
    deviceLock = new DeviceLock(storage.shared.directory, { deviceId: storage.config.deviceId });
    if (!await claimDevice()) { app.exit(0); return; }
    const beat = setInterval(() => deviceLock.heartbeat().catch(() => {}), 5 * 60 * 1000); beat.unref?.();
    process.on('exit', () => deviceLock?.releaseSync());
  }
  store = new Store(workspaceRoot, state => {sendState(state);pluginWeb?.reconcile();boardsDb?.refresh().catch(e=>console.error(e.message));}, { shared:storage.shared,deviceId:storage.config.deviceId,guard: () => storage.assertWritable(true), patient: () => storage.cloud, writable: () => storage.writable, loaded: state => storage.loaded(state), serialize: state => storage.serialize(state), saved: (state, text, context) => storage.saved(state, text, context) });
  await store.init();
  boardsDb=new BoardsDatabase(store,path.join(app.getPath('userData'),'databases',crypto.createHash('sha256').update(workspaceRoot).digest('hex')),{spawnChild:file=>utilityProcess.fork(file,[],{stdio:'ignore',serviceName:'Boards SQLite query'})});
  await boardsDb.refresh().catch(e=>console.error(e.message));

  // Plugin installs, settings and data live in the workspace folder when it is on Drive, so a second computer has the same plugins.
  let pluginRoot = path.join(app.getPath('userData'), 'plugins');
  if (storage.cloud && !testData) {
    const shared = path.join(workspaceRoot, 'plugins');
    try { await fs.access(path.join(shared, 'registry.json')); }
    catch { try { await fs.cp(pluginRoot, shared, { recursive: true, force: false, errorOnExist: false }); } catch { await fs.mkdir(shared, { recursive: true }); } }
    pluginRoot = shared;
  }
  plugins=new WorkspacePlugins(pluginRoot,store,boardsDb,value=>{send('plugins:state',value);pluginWeb?.reconcile();});await plugins.init();
  handle('plugins:list',()=>plugins.list());
  handle('plugins:prepare',async (kind,repository)=>{
    if(kind==='website'){if(!repository||typeof repository.name!=='string'||typeof repository.url!=='string')throw Error('Name the AI website and enter its URL.');return plugins.prepare({manifest:{apiVersion:1,id:'web-'+require('node:crypto').randomUUID().slice(0,8),name:repository.name,version:'1.0.0',description:'AI website panel',permissions:['web-chat','files:write','storage'],panels:[{id:'main',title:repository.name,type:'web-app',url:repository.url}]},files:{}});}
    if(kind==='builtin:browser-assistants')return plugins.prepare(path.join(__dirname,'../bundled-plugins/browser-assistants'));
    if(kind==='github')return plugins.prepare(await require('./plugin-github.cjs').githubPackage(repository));
    if(['builtin:chatgpt-web','builtin:gemini-web','builtin:chart-statistics','builtin:chart-business','builtin:chart-science'].includes(kind))return plugins.prepare(path.join(__dirname,'../bundled-plugins',kind.slice(8)));
    if(!['folder','zip'].includes(kind))throw Error('Choose a folder or ZIP plugin package.');
    const selected=await dialog.showOpenDialog(window,{title:'Install workspace plugin',properties:[kind==='folder'?'openDirectory':'openFile'],...(kind==='zip'?{filters:[{name:'Workspace plugin',extensions:['zip']}]}:{})});
    return selected.canceled?null:plugins.prepare(selected.filePaths[0]);
  });
  handle('plugins:install',planId=>plugins.install(planId));
  handle('plugins:enable',(id,value)=>plugins.enable(id,value));
  handle('plugins:remove',id=>plugins.remove(id));
  handle('plugins:settings',(id,value)=>value===undefined?structuredClone(plugins.enabled(id).settings):plugins.settings(id,value));
  handle('plugins:build',(id,panelId)=>plugins.build(id,panelId));
  handle('plugins:request',(id,panelId,projectId,op,args)=>plugins.request(id,panelId,projectId,op,args));
  handle('plugins:web-show',(id,panelId,projectId,rect)=>pluginWeb?.show(id,panelId,projectId,rect));
  handle('plugins:web-hide',()=>pluginWeb?.hide());
  handle('plugins:web-action',(id,panelId,projectId,op,text)=>{if(!pluginWeb)throw Error('Open the workspace window first.');return pluginWeb.action(id,panelId,projectId,op,text);});
  webChatDrafts=new WebChatDrafts(path.join(app.getPath('userData'),'web-chat-drafts'));
  handle('plugins:web-draft',(id,panelId,projectId,value)=>{if(!pluginWeb)throw Error('Open the workspace window first.');pluginWeb.get(id,panelId,projectId);return value===undefined?webChatDrafts.read(id,panelId,projectId):webChatDrafts.write(id,panelId,projectId,value);});
  storage.settle = () => store.queue;storage.store=store;
  try {
    const vault = new CredentialVault(path.join(app.getPath('userData'), 'auth', 'credentials.bin'), safeStorage);
    await vault.init();
    mcp = new McpRuntime(vault, {approve: value => approvals.request(value),openExternal:url=>shell.openExternal(url)});
    accounts = new AccountConnections(vault, { openExternal: url => shell.openExternal(url), onChange: state => send('accounts:state', state), executeCLI: execute, cliRoot: path.join(app.getPath('userData'), 'auth', 'claude') });
  } catch (e) { accountError=e.message; }
  const requireAccounts=()=>{if(!accounts)throw new Error(accountError || 'Account connections are unavailable.');return accounts;};
  runner = new Runner(store, execute, event => send('run:progress', event), accounts ? new ProviderRuntime(accounts, fetch, mcp) : null);runner.database=boardsDb;plugins.runner=runner;appProjects=new AppProjects(store,{renderIcon:design=>renderIconDesign(BrowserWindow,design)});runner.apps=appProjects;
  handle('accounts:list', () => accounts ? accounts.list() : { accounts:[],pending:[],error:accountError });
  handle('accounts:start', (provider,id) => requireAccounts().start(provider,id));
  handle('accounts:cancel', id => requireAccounts().cancel(id));
  handle('accounts:models', id => requireAccounts().models(id));
  handle('accounts:key', (provider,key,label,config) => requireAccounts().addKey(provider,key,label,config));
  handle('accounts:decide',(id,value)=>requireAccounts().evaluate(id,value));
  handle('accounts:acknowledge', id => requireAccounts().acknowledge(id));
  handle('accounts:rename', (id,label) => requireAccounts().rename(id,label));
  const stopAccount=id=>{const agentIds=store.state.agents.filter(a=>a.connectionId===id||a.decisionConnectionId===id).map(a=>a.id);for(const p of store.state.projects)for(const t of p.tasks)if(t.status==='running' && agentIds.includes(t.agentId))runner.stop(t.groupId);};
  handle('accounts:disconnect', id => {stopAccount(id);return requireAccounts().disconnect(id);});
  handle('accounts:remove', id => {stopAccount(id);return requireAccounts().remove(id);});
  handle('accounts:google', async () => {
    const service=requireAccounts();
    const selected=await dialog.showOpenDialog(window,{title:'Google Desktop OAuth client',properties:['openFile'],filters:[{name:'Google OAuth configuration',extensions:['json']}]});
    if(selected.canceled)return service.list();const stat=await fs.stat(selected.filePaths[0]);if(stat.size>50000)throw new Error('Choose a Google Desktop OAuth JSON file under 50 KB.');
    return service.configureGoogle(await fs.readFile(selected.filePaths[0],'utf8'));
  });
  scheduler = new Scheduler(store, runner, () => new Date(), () => storage.automaticSchedules);
  handle('storage:status', () => storage.refresh());
  handle('links:pending', () => { const link = pendingLink; pendingLink = null; return link; });
  handle('app:title-bar', value => { if (!window || window.isDestroyed() || process.platform === 'darwin') return; const dark = value?.dark !== false; try { window.setTitleBarOverlay({ color: dark ? '#161717' : '#eceee9', symbolColor: dark ? '#e5e5e5' : '#252c28', height: 40 }); } catch {} });
  handle('workspace:file-image', async (projectId, fileId) => {
    const file = store.state.projects.find(p => p.id === projectId)?.files.find(f => f.id === fileId);
    if (!file || path.basename(file.storedName) !== file.storedName) throw new Error('Choose a file in this project.');
    const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml' };
    const type = types[path.extname(file.storedName).toLowerCase()];
    if (!type) throw new Error('This file is not an image.');
    const full = path.join(store.projectDir(projectId), 'files', file.storedName);
    if ((await fs.stat(full)).size > 40 * 1024 * 1024) throw new Error('Images over 40 MB open in your image app instead.');
    return `data:${type};base64,${(await fs.readFile(full)).toString('base64')}`;
  });
  handle('calendar:import', async () => {
    const picked = await dialog.showOpenDialog(window, { title: 'Import calendar', filters: [{ name: 'Calendar files', extensions: ['ics'] }], properties: ['openFile', 'multiSelections'] });
    if (picked.canceled) return { events: [], files: 0 };
    const events = [];
    for (const file of picked.filePaths.slice(0, 10)) { if ((await fs.stat(file)).size > 20 * 1024 * 1024) continue; events.push(...parseIcs(await fs.readFile(file, 'utf8'))); }
    return { events: events.slice(0, 2000), files: picked.filePaths.length };
  });
  handle('calendar:export', async calendarIds => {
    const wanted = Array.isArray(calendarIds) ? new Set(calendarIds.filter(i => typeof i === 'string')) : null;
    const events = (store.state.events || []).filter(e => !wanted || wanted.has(e.calendarId));
    const saved = await dialog.showSaveDialog(window, { title: 'Export calendar', defaultPath: 'calendar.ics', filters: [{ name: 'Calendar file', extensions: ['ics'] }] });
    if (saved.canceled || !saved.filePath) return -1;
    await fs.writeFile(saved.filePath, toIcs(events), 'utf8');
    return events.length;
  });
  handle('app:quit', () => { setImmediate(() => app.quit()); });
  const updates = new Updates({ version: app.getVersion(), fetch: (url, options) => net.fetch(url, options), userData: app.getPath('userData'), downloads: app.getPath('downloads'), portable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR), onChange: state => send('update:state', state) });
  handle('update:state', () => updates.state);
  handle('update:check', () => updates.check({ manual: true }));
  handle('update:skip', () => { updates.skip(); });
  handle('update:download', async () => { await updates.download(); return updates.state; });
  handle('update:page', () => { const page = updates.state.available?.page; if (/^https:\/\/github\.com\//.test(page || '')) return shell.openExternal(page); });
  // A setup program is started and Daevu closes so it can be replaced; a portable copy is shown in its folder instead.
  handle('update:install', async () => {
    const file = updates.state.downloaded;
    if (!file || !nodeFs.existsSync(file)) throw new Error('Download the update first.');
    if (updates.portable) { shell.showItemInFolder(file); return; }
    const failure = await shell.openPath(file);
    if (failure) throw new Error(failure);
    setTimeout(() => app.quit(), 1500);
  });
  if (app.isPackaged && !testData) { setTimeout(() => updates.check(), 8000); setInterval(() => updates.check(), 6 * 60 * 60 * 1000); }
  // Uninstall from inside the app: the choice about local data is left for the uninstaller to read, then the app steps aside.
  handle('app:uninstall', value => {
    const exe = path.join(path.dirname(process.execPath), `Uninstall ${app.getName()}.exe`);
    if (!app.isPackaged || !nodeFs.existsSync(exe)) throw new Error('Uninstalling from here works in the installed app. Use Windows Settings > Apps instead.');
    const dir = path.join(app.getPath('appData'), 'Daevu'), keep = path.join(dir, 'uninstall-keep'), wipe = path.join(dir, 'uninstall-wipe');
    nodeFs.mkdirSync(dir, { recursive: true }); nodeFs.rmSync(keep, { force: true }); nodeFs.rmSync(wipe, { force: true });
    nodeFs.writeFileSync(value?.wipe ? wipe : keep, '');
    require('child_process').spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 300);
    return { ok: true };
  });
  handle('storage:shared',async()=>{if(runner.groups.size||sheetPython.busy||scheduler.busy)throw Error('Finish or stop active runs before enabling shared editing.');scheduler.stop();try{return await storage.enableShared(store);}finally{if(!storage.restartNeeded)scheduler.start();}});
  handle('storage:conflicts',()=>storage.shared?.conflicts() || []);
  handle('storage:conflict',id=>{if(!storage.shared)throw Error('Open a shared Drive workspace.');return storage.shared.conflict(id);});
  handle('storage:resolve',async(id,version)=>{if(!storage.shared)throw Error('Open a shared Drive workspace.');await storage.assertWritable();const state=await store.resolveShared(id,version);storage.emit();return state;});
  handle('storage:prepare', async mode => {
    if (mode === 'reopen-drive') { if (!storage.cloud) throw new Error('Connect a Drive workspace first.'); return storage.prepare('open-drive', storage.config.root, store); }
    if (mode === 'local-copy') return storage.prepare(mode, '', store);
    if (!['move-drive', 'open-drive'].includes(mode)) throw new Error('Choose a storage action.');
    const result = await dialog.showOpenDialog(window, { title: mode === 'move-drive' ? 'Choose a Google Drive folder for your workspace' : 'Open an existing Daevu folder in Google Drive', properties: ['openDirectory', 'createDirectory'], defaultPath: storage.cloud ? storage.config.root : app.getPath('documents') });
    if (result.canceled) return null;
    return storage.prepare(mode, result.filePaths[0], store);
  });
  handle('storage:apply', async planId => {
    if (runner.groups.size || sheetPython.busy || scheduler.busy) throw new Error('Finish or stop active research and Python runs before switching workspace storage.');
    scheduler.stop();
    try { return await storage.apply(planId, store); } finally { if (!storage.restartNeeded) scheduler.start(); }
  });
  handle('storage:schedules', value => storage.setSchedules(value));
  handle('storage:takeover', async () => {
    const result = await dialog.showMessageBox(window, { type: 'warning', title: 'Recover workspace session', message: 'Have you closed Daevu on your other devices?', detail: 'Let Google Drive finish syncing first. Taking over an active session can create conflicting copies. This reopens the Drive version; copy this open workspace locally first if you need to keep unsaved work.', buttons: ['Cancel', 'Recover and reopen'], defaultId: 0, cancelId: 0 });
    return result.response === 1 ? storage.takeOver() : storage.status();
  });
  handle('storage:restart', () => { if (!storage.restartNeeded) throw new Error('No storage change is pending.'); app.relaunch(); app.quit(); });
  handle('workspace:load', () => store.state);
  handle('workspace:sync', () => { sentState ||= store.state; return { rev: sentRev, state: store.state }; });
  const mutateWorkspace = async action => {
    await storage.assertWritable();
    if (action.type === 'settings' && 'launchAtLogin' in action.value) applyStartup({ ...store.state.settings, ...action.value });
    if(action.type==='agent' && action.value.connectionId){const account=requireAccounts().account(action.value.connectionId);if(account.provider!==action.value.provider)throw new Error('Choose an account for this provider.');}
    const dirOf = projectId => path.join(store.root, 'projects', projectId);
    const trashBefore = store.state.trash || [];
    const moving = action.type === 'item:move' && action.value?.kind === 'file' ? store.state.projects.find(p => p.id === action.projectId)?.files.find(f => f.id === action.value.id) : null;
    const copying = action.type === 'item:copy' && action.value?.kind === 'file' ? store.state.projects.find(p => p.id === action.value.fromProjectId)?.files.find(f => f.id === action.value.id) : null;
    let copied = null;
    if (copying?.storedName && /^[a-zA-Z0-9-]+$/.test(action.value.newId || '')) {
      copied = path.join(store.projectDir(action.projectId), 'files', action.value.newId + path.extname(copying.storedName).toLowerCase());
      await fs.mkdir(path.dirname(copied), { recursive: true });
      await fs.copyFile(path.join(store.projectDir(action.value.fromProjectId), 'files', path.basename(copying.storedName)), copied);
    }
    let next;
    try { next = await store.mutate(action); } catch (error) { if (copied) fs.rm(copied, { force: true }).catch(() => {}); throw error; }
    const kept = new Set((store.state.trash || []).map(e => e.id));
    for (const gone of trashBefore) {
      if (kept.has(gone.id) || (action.type === 'trash:restore' && action.value === gone.id)) continue;
      if (gone.kind === 'file' && gone.item?.storedName) fs.rm(path.join(dirOf(gone.projectId), 'files', path.basename(gone.item.storedName)), { force: true }).catch(() => {});
      if (gone.kind === 'project') for (const p of gone.projects) if (/^[a-zA-Z0-9-]+$/.test(p.id) && !store.state.projects.some(x => x.id === p.id)) fs.rm(dirOf(p.id), { recursive: true, force: true }).catch(() => {});
    }
    if (moving?.storedName) {
      const name = path.basename(moving.storedName), from = path.join(dirOf(action.projectId), 'files', name), to = path.join(dirOf(action.value.toProjectId), 'files', name);
      try { await fs.mkdir(path.dirname(to), { recursive: true }); await fs.rename(from, to); } catch { try { await fs.copyFile(from, to); await fs.rm(from, { force: true }); } catch {} }
    }
    return next;
  };
  handle('workspace:mutate', mutateWorkspace);
  handle('workspace:mutate2', async action => { const next = await mutateWorkspace(action); return packedByState.get(next) || { from: sentRev, rev: sentRev, full: next }; });
  // Rich clipboard: the system clipboard gets plain text and HTML ending in a hidden marker,
  // while the structured reference stays in a local store under that id. Paste restores the real item when the id still matches.
  const richCopies = new Map();
  handle('clipboard:write', payload => {
    const ref = payload?.ref;
    if (typeof payload?.text !== 'string' || typeof payload?.html !== 'string' || payload.text.length > 2e6 || payload.html.length > 4e6) throw new Error('That is too large to copy.');
    if (!ref || !['note', 'file'].includes(ref.kind) || !/^[a-zA-Z0-9-]+$/.test(ref.id || '') || !/^[a-zA-Z0-9-]+$/.test(ref.fromProjectId || '')) throw new Error('Choose a document or file to copy.');
    const copyId = crypto.randomUUID();
    clipboard.write({ text: payload.text, html: `${payload.html}<!-- rwvc: ${copyId} -->` });
    richCopies.set(copyId, { kind: ref.kind, id: ref.id, fromProjectId: ref.fromProjectId });
    while (richCopies.size > 20) richCopies.delete(richCopies.keys().next().value);
    return copyId;
  });
  handle('clipboard:read', () => {
    const html = clipboard.readHTML(), marker = /<!-- rwvc: ([0-9a-f-]{36}) -->/.exec(html);
    return { text: clipboard.readText(), html, ref: (marker && richCopies.get(marker[1])) || null };
  });
  handle('apps:shortcut',async(projectId,appId,destination='start-menu')=>{
    if(process.platform!=='win32' || !app.isPackaged)throw Error('Windows shortcuts are available in the installed or portable release.');
    if(!['desktop','start-menu'].includes(destination))throw Error('Choose Desktop or Windows search for the shortcut.');
    const artifact=appProjects.app(projectId,appId),folder=destination==='desktop'?app.getPath('desktop'):path.join(app.getPath('appData'),'Microsoft','Windows','Start Menu','Programs','Daevu Apps');
    await fs.mkdir(folder,{recursive:true});
    const name=artifact.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,80) || 'App',suffix=crypto.createHash('sha256').update(projectId+':'+appId).digest('hex').slice(0,8);
    const target=process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    const image=iconFile(nativeAppIcon(artifact,nativeImage)),iconFolder=path.join(app.getPath('userData'),'app-icons');
    await fs.mkdir(iconFolder,{recursive:true});
    const icon=path.join(iconFolder,suffix+'-'+crypto.createHash('sha256').update(image).digest('hex').slice(0,12)+'.ico');await fs.writeFile(icon,image);
    if(!shell.writeShortcutLink(path.join(folder,name+' - '+suffix+'.lnk'),'create',{target,args:'--open-project='+projectId+' --open-app='+appId,description:'Open '+artifact.title+' in Daevu',icon,iconIndex:0}))throw Error('Could not create the Windows shortcut.');
    return true;
  });
  handle('apps:operation' ,async(projectId,op,args={})=>{
    const fn=appProjects.functions(projectId).find(f=>f.name==='app_'+op);if(!fn)throw Error('Unknown app operation.');return fn.call(args);
  });
  handle('apps:build',(projectId,appId,options)=>appProjects.build(projectId,appId,options));
  handle('apps:report',(projectId,appId,entry)=>appProjects.report(projectId,appId,entry));
  handle('database:schema',(projectId,appId)=>boardsDb.schema(projectId,{appId}));
  handle('database:query',(projectId,sql,params)=>boardsDb.query(projectId,sql,params));
  handle('database:write',async(projectId,request)=>{await storage.assertWritable();return boardsDb.write(projectId,request);});
  handle('database:app-write',async(projectId,appId,request)=>{await storage.assertWritable();return boardsDb.write(projectId,request,{appId});});
  handle('database:app-create',async(projectId,appId,name,properties)=>{await storage.assertWritable();return boardsDb.create(projectId,name,properties,{appId});});
  handle('database:export',async projectId=>{const selected=await dialog.showSaveDialog(window,{title:'Export project database',defaultPath:'research.sqlite',filters:[{name:'SQLite database',extensions:['sqlite','db']}]});if(!selected.canceled)return boardsDb.export(projectId,selected.filePath);});
  handle('sheet:python' , async (projectId, noteId, payload) => {
    await storage.assertWritable();
    const note = store.state.projects.find(p => p.id === projectId)?.notes.find(n => n.id === noteId);
    if (note?.kind !== 'sheet') throw new Error('Choose a spreadsheet.');
    return sheetPython.run(payload, store.projectDir(projectId));
  });
  handle('sheet:stop', () => sheetPython.stop());
  handle('schedule:run', id => scheduler.run(id, true));
  handle('schedule:tick', () => scheduler.tick());
  handle('browser:new', (projectId,url) => browser.create(projectId,url));
  handle('browser:tool', (projectId,tabId,pluginId,toolId) => browser.runTool(projectId,tabId,pluginId,toolId));
  handle('browser:show', (projectId,tabId,rect) => browser.show(projectId,tabId,rect));
  handle('browser:hide', () => browser.hide());
  handle('browser:navigate', (projectId,tabId,url) => browser.navigate(projectId,tabId,url));
  handle('browser:action', (projectId,tabId,action) => browser.action(projectId,tabId,action));
  handle('browser:activate', (projectId,tabId) => browser.activate(projectId,tabId));
  handle('browser:close', (projectId,tabId) => browser.close(projectId,tabId));
  handle('browser:capture', (projectId,tabId) => browser.capture(projectId,tabId));
  handle('workspace:folder', () => shell.openPath(store.root));
  handle('workspace:url', url => {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Only web links can be opened.');
    return shell.openExternal(parsed.href);
  });
  const chatImages=new ChatImages(store);
  handle('plugins:browser-ask',(...args)=>require('./browser-assistant.cjs').askBrowserAssistant({plugins,store,runner,browser,chatImages,assertWritable:()=>storage.assertWritable()},...args));
  handle('chat:images',(projectId,values)=>chatImages.add(projectId,values));
  handle('run:start', (projectId, agentId, text, options) => runner.start(projectId, agentId, text, options));
  handle('run:retry',(projectId,agentId,chatId)=>runner.retry(projectId,agentId,chatId));
  const toolCatalog = async () => { const catalog = await discoverTools(store.state.settings); if (mcp) catalog.tools = [...catalog.tools.filter(t=>t.kind!=='mcp'), ...await mcp.catalog(store.state.settings)]; return catalog; };
  handle('tools:list', toolCatalog);
  handle('mcp:add', async (name,config,allowReadOnly) => {if(!mcp)throw new Error('Secure account storage is unavailable.');await mcp.add(name,config,allowReadOnly);return toolCatalog();});
  handle('mcp:remove', async name => {if(!mcp)throw new Error('MCP is unavailable.');runner.stopAll();await mcp.remove(name);return toolCatalog();});
  handle('mcp:test', name => {if(!mcp)throw new Error('MCP is unavailable.');return mcp.test(name,store.state.settings);});
  handle('mcp:search', (query,cursor) => searchRegistry(query,cursor,(url,options) => net.fetch(url,options)));
  handle('mcp:signin', name => {if(!mcp)throw new Error('MCP is unavailable.');return mcp.oauth.signIn(name);});
  handle('mcp:cancel', name => mcp?.oauth.cancel(name));
  handle('mcp:pending', () => approvals.list());
  handle('mcp:policy',async(name,mode)=>{if(!mcp)throw Error('MCP is unavailable.');await mcp.setPolicy(name,mode,store.state.settings);if(mode==='all')for(const r of approvals.list())if(r.server===name)approvals.answer(r.id,true);return toolCatalog();});
  handle('mcp:answer',async(id,allowed,always=false)=>{if(always){const request=approvals.list().find(r=>r.id===id);if(!request || allowed!==true)throw Error('Choose an active tool request to always allow.');await mcp.setPolicy(request.server,'all',store.state.settings);for(const r of approvals.list())if(r.server===request.server)approvals.answer(r.id,true);return;}return approvals.answer(id,allowed);});
  handle('refs:pick', async (kind,projectId) => {
    const result = await dialog.showOpenDialog(window, { title: kind === 'folder' ? 'Link a folder from this computer' : 'Link a file from this computer', properties: kind === 'folder' ? ['openDirectory'] : ['openFile'] });
    if (result.canceled) return null;
    const picked = result.filePaths[0];
    if(projectId && kind==='file' && IMAGE_EXT.test(picked)){const image=await loadImage(picked,path.basename(picked));return (await chatImages.add(projectId,[{name:image.name,dataUrl:`data:${image.mime};base64,${image.data}`}]))[0];}
    runner.pickedPaths.add(picked);
    return { type: 'path', path: picked, name: path.basename(picked) || picked, dir: kind === 'folder' };
  });
  handle('run:stop', groupId => runner.stop(groupId));
  handle('cli:check', async agentId => {
    const agent = store.state.agents.find(a => a.id === agentId);
    if (!agent) throw new Error('Unknown agent.');
    if(DIRECT_PROVIDERS.has(agent.provider)){const models=await requireAccounts().models(agent.connectionId);return {ok:true,version:`Account connected · ${models.length} models`};}
    const output = await execute(agent.command || agent.provider, ['--version'], '', store.root, null, 15000);
    return { ok: true, version: output.trim().slice(0, 300) };
  });
  handle('files:import', async projectId => {
    await storage.assertWritable();
    const dir = store.projectDir(projectId);
    const selected = await dialog.showOpenDialog(window, { title: 'Add research files', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Research documents', extensions: ['pdf', 'epub', 'docx', 'doc', 'docm', 'xlsx', 'xls', 'xlsm', 'ods', 'csv', 'tsv', 'txt', 'md', 'json', 'png', 'jpg', 'jpeg'] }, { name: 'All files', extensions: ['*'] }] });
    if (selected.canceled) return;
    await storage.assertWritable();
    const files = [], notes = [];
    const existingNotes = store.state.projects.find(p => p.id === projectId).notes.length;
    const importedTextCount = selected.filePaths.filter(name => /\.(csv|md|txt)$/i.test(name)).length;
    const fileRow = 90 + Math.ceil((existingNotes + importedTextCount) / 3) * 280;
    for (const source of selected.filePaths) {
      const stat = await fs.stat(source);
      if (stat.size > 100 * 1024 * 1024) throw new Error('Import files under 100 MB each.');
      // Keep the original Word upload alongside its editable Markdown conversion.
      if (/\.(docx|docm|dotx|dotm|doc)$/i.test(source)) {
        try {
          const content = await require('./doc-convert.cjs').wordToMarkdown(source), at = existingNotes + notes.length, now = new Date().toISOString();
          notes.push({ id: id(), title: path.basename(source).replace(/\.[^.]+$/, '').slice(0, 160), content, kind: 'note', author: 'You', createdAt: now, updatedAt: now, position: { x: 80 + at % 3 * 350, y: 90 + Math.floor(at / 3) * 280 } });
        } catch {}
      }
      const fileId = id(), name = path.basename(source), storedName = fileId + path.extname(name).toLowerCase();
      await fs.copyFile(source, path.join(dir, 'files', storedName));
      files.push({ id: fileId, name, storedName, size: stat.size, createdAt: new Date().toISOString(), position: { x: 80 + files.length % 3 * 350, y: fileRow + Math.floor(files.length / 3) * 280 } });
      if (/\.(csv|md|txt)$/i.test(name) && stat.size <= 1024 * 1024) notes.push({ id: id(), title: name.replace(/\.[^.]+$/, ''), kind: /\.csv$/i.test(name) ? 'sheet' : 'note', content: await fs.readFile(source, 'utf8'), author: 'You', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), position: { x: 80 + (existingNotes + notes.length) % 3 * 350, y: 90 + Math.floor((existingNotes + notes.length) / 3) * 280 } });
      if (/\.(xlsx|xlsm|xlsb|xls|ods|fods|numbers)$/i.test(name) && stat.size <= 50 * 1024 * 1024) { try { notes.push(require('./sheet-files.cjs').importFile(source, { x: 80 + (existingNotes + notes.length) % 3 * 350, y: 90 + Math.floor((existingNotes + notes.length) / 3) * 280 })); } catch {} }
    }
    await store.update(s => { const p = s.projects.find(p => p.id === projectId); p.files.push(...files); p.notes.push(...notes); return s; });
  });
  handle('files:open', (projectId, fileId) => {
    const project = store.state.projects.find(p => p.id === projectId), file = project?.files.find(f => f.id === fileId);
    if (!file) throw new Error('Unknown file.');
    if (!/\.(pdf|docx|xlsx|csv|txt|md|json|png|jpg|jpeg)$/i.test(file.storedName)) throw new Error('Open this file from the workspace folder.');
    return shell.openPath(path.join(store.projectDir(projectId), 'files', file.storedName));
  });
  handle('files:data', async (projectId, fileId) => {
    const file = store.state.projects.find(p => p.id === projectId)?.files.find(f => f.id === fileId);
    if (!file) throw new Error('Unknown file.');
    const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
    const type = types[path.extname(file.storedName).toLowerCase()];
    if (!type) throw new Error('Only image files can be used here.');
    const full = path.join(store.projectDir(projectId), 'files', file.storedName);
    if ((await fs.stat(full)).size > 12 * 1024 * 1024) throw new Error('Use an image under 12 MB.');
    return `data:${type};base64,${(await fs.readFile(full)).toString('base64')}`;
  });
  // The raw bytes of an uploaded file, for the in-app viewers.
  handle('files:read', async (projectId, fileId) => {
    const file = store.state.projects.find(p => p.id === projectId)?.files.find(f => f.id === fileId);
    if (!file) throw new Error('Unknown file.');
    const full = path.join(store.projectDir(projectId), 'files', file.storedName);
    if ((await fs.stat(full)).size > 150 * 1024 * 1024) throw new Error('This file is too large to preview.');
    return fs.readFile(full);
  });
  handle('artifact:preview', previewHtml);
  handle('artifact:ready',()=>{appAskReady=true;if(pendingAppAsk){send('artifact:ask',pendingAppAsk);pendingAppAsk=null;}});
  appWindows=new AppWindows({BrowserWindow,ipcMain,store,iconFor:artifact=>nativeAppIcon(artifact,nativeImage),database:boardsDb,apps:appProjects,url:trustedURL,preview:previewHtml,ask:async(projectId,text)=>{pendingAppAsk={projectId,text};if(!window || window.isDestroyed())await createWindow();window.show();window.focus();if(appAskReady && pendingAppAsk){send('artifact:ask',pendingAppAsk);pendingAppAsk=null;}}});
  appProjects.openPreview=(projectId,appId)=>appWindows.open(projectId,appId,{draft:true});
  handle('artifact:window',(projectId,artifactId)=>appWindows.open(projectId,artifactId));
  handle('artifact:export', async (projectId, artifactId) => {
    const artifact = store.state.projects.find(p => p.id === projectId)?.artifacts?.find(a => a.id === artifactId);
    if (artifact?.kind !== 'html') throw new Error('Choose an interactive page.');
    const selected = await dialog.showSaveDialog(window, { defaultPath: `${artifact.title.replace(/[<>:"/\|?*]/g, '-')}.html`, filters: [{ name: 'Web page', extensions: ['html'] }] });
    if (!selected.canceled) await fs.writeFile(selected.filePath, artifact.data.html, 'utf8');
  });
  // Spreadsheets from other programs: every sheet of an Excel, OpenDocument, CSV or TSV file becomes one Daevu spreadsheet.
  handle('sheets:import', async projectId => {
    await storage.assertWritable();
    const selected = await dialog.showOpenDialog(window, { title: 'Import spreadsheets', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Spreadsheets', extensions: ['xlsx', 'xlsm', 'xlsb', 'xls', 'ods', 'fods', 'csv', 'tsv', 'numbers'] }, { name: 'All files', extensions: ['*'] }] });
    if (selected.canceled) return 0;
    const existing = store.state.projects.find(p => p.id === projectId)?.notes.length || 0, notes = [];
    for (const file of selected.filePaths) notes.push(require('./sheet-files.cjs').importFile(file, { x: 80 + (existing + notes.length) % 3 * 350, y: 90 + Math.floor((existing + notes.length) / 3) * 280 }));
    await store.update(s => { s.projects.find(p => p.id === projectId).notes.push(...notes); return s; });
    return notes.length;
  });
  handle('notes:export', async (projectId, noteId) => {
    const project = store.state.projects.find(p => p.id === projectId), note = project?.notes.find(n => n.id === noteId);
    if (!note) throw new Error('Unknown document.');
    if (note.kind === 'sheet') {
      const base = note.title.replace(/[<>:"/\\|?*]/g, '-'), picked = await dialog.showSaveDialog(window, { defaultPath: `${base}.xlsx`, filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }, { name: 'OpenDocument spreadsheet', extensions: ['ods'] }, { name: 'CSV (first sheet)', extensions: ['csv'] }] });
      if (picked.canceled) return;
      if (/\.csv$/i.test(picked.filePath)) await fs.writeFile(picked.filePath, note.content, 'utf8');
      else { const { projectFiles } = await import('../shared/workbook.mjs'), { csvParse } = await import('../shared/domain.mjs'); require('./sheet-files.cjs').writeNote(note, picked.filePath, projectFiles(project.notes, csvParse, note.id)); }
      return;
    }
    const selected = await dialog.showSaveDialog(window, { defaultPath: `${note.title.replace(/[<>:"/\\|?*]/g, '-')}.${note.kind === 'sheet' ? 'csv' : 'md'}` });
    if (!selected.canceled) await fs.writeFile(selected.filePath, note.content, 'utf8');
  });
  const launchLink = process.argv.find(a => a.startsWith('rw://'));
  if (launchLink) pendingLink = parseDeepLink(launchLink);
  // Links like rw://open?project=... open this app. In development they point at this checkout.
  if (!testData) { try { if (app.isPackaged) app.setAsDefaultProtocolClient('rw'); else app.setAsDefaultProtocolClient('rw', process.execPath, [path.resolve(process.argv[1] || '.')]); } catch {} }
  await createWindow();
  createTray();
  // System-wide quick capture: bring the app forward and start a new document, from anywhere.
  if (!testData) globalShortcut.register('CommandOrControl+Alt+N', async () => { if (!window || window.isDestroyed()) await createWindow(); window.show(); window.focus(); send('quick:capture'); });
  openLaunchApp(launchArgs);
  if (store.state.settings.launchAtLogin) { try { applyStartup(store.state.settings); } catch (e) { console.error(e.message); } }
  scheduler.start();
  // Event reminders arrive as system notifications, even while the window is closed to the tray.
  if (!testData) {
    if (process.platform === 'win32' && !app.isPackaged) app.setAppUserModelId(process.execPath);
    new Reminders(store, event => openDeepLink(`rw://open?calendar=1&event=${event.id}&date=${event.start.slice(0, 10)}`)).start();
  }
  // Keep the shared change log small: fold it into a fresh baseline once it grows.
  if (storage.shared && !testData) setTimeout(() => storage.shared.compact({ minFiles: 300 }).then(r => { if (r.compacted) console.log('Shared change log compacted:', JSON.stringify(r)); }).catch(e => console.error('Compaction skipped:', e.message)), 20000).unref?.();
  powerMonitor.on('resume', () => { scheduler.tick().catch(e => console.error(e.message)); pullFromDrive(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch(error => { dialog.showErrorBox('Daevu', error.message); app.quit(); });
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); quitting = true;
  globalShortcut.unregisterAll(); clearInterval(storage?.timer); approvals.destroy(); mcp?.destroy(); sheetPython.stop(); scheduler?.stop(); runner?.stopAll(); accounts?.destroy(); browser?.destroy(); pluginWeb?.destroy();tray?.destroy();
  (async () => { if(window&&!window.isDestroyed())try{await Promise.race([window.webContents.executeJavaScript("(()=>{const detail={pending:[]};window.dispatchEvent(new CustomEvent('research:flush-drafts',{detail}));return Promise.all(detail.pending);})()"),new Promise(resolve=>setTimeout(resolve,3000))]);}catch{} const deadline = Date.now() + 5000; while ((runner?.groups.size || scheduler?.busy || sheetPython.busy) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25)); await store?.queue; await webChatDrafts?.queue;await plugins?.queue; })()
    .catch(error => console.error(error.message)).finally(async () => { try { await storage?.shared?.flushNow?.(); } catch {} try { await deviceLock?.release(); } catch {} storage?.close(); app.quit(); });
});
app.on('window-all-closed', () => { if (!store?.state.settings.keepRunning && process.platform !== 'darwin') app.quit(); });
