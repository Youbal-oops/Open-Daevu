import { makeSeed, applyMutation, normalizeBrowserURL, BUILTIN_TOOLS } from '../shared/domain.mjs';
const KEY = 'research-workspace-preview-v1';
const listeners = new Set();
function previewUpdate(fn){const state=fn(read());localStorage.setItem(KEY,JSON.stringify(state));for(const callback of listeners)callback(state);return state;}
function read() { try { const defaults=makeSeed(); const state=JSON.parse(localStorage.getItem(KEY))||defaults; return {...state,schedules:state.schedules||[],settings:{...defaults.settings,...state.settings}}; } catch { return makeSeed(); } }
const desktopOnly=async()=>{throw new Error('Account connections require the desktop app.');};
const preview = {
  attachImages:desktopOnly,
  pluginBrowserAsk:desktopOnly,pluginsList:async()=>[],pluginsPrepare:desktopOnly,pluginsInstall:desktopOnly,pluginsEnable:desktopOnly,pluginsRemove:desktopOnly,pluginsSettings:desktopOnly,pluginsBuild:desktopOnly,pluginRequest:desktopOnly,pluginWebShow:desktopOnly,pluginWebHide:async()=>{},pluginWebAction:desktopOnly,onPlugins:()=>()=>{},onPluginWebState:()=>()=>{},onPluginWebShortcut:()=>()=>{},onPluginSaved:()=>()=>{},
  appOperation:desktopOnly,appBuild:desktopOnly,appReport:async()=>{},appShortcut:desktopOnly,
  databaseSchema:desktopOnly,databaseQuery:desktopOnly,databaseWrite:desktopOnly,appDatabaseWrite:desktopOnly,appDatabaseCreate:desktopOnly,databaseExport:desktopOnly,
  openAppWindow:async()=>{throw Error('Separate app windows require the desktop app.');},onAppAsk:()=>()=>{},
  mcpPolicy:desktopOnly,mcpAdd:desktopOnly,mcpRemove:desktopOnly,mcpTest:desktopOnly,mcpAnswer:desktopOnly,mcpSearch:desktopOnly,mcpSignIn:desktopOnly,mcpCancel:desktopOnly,async mcpPending(){return [];},onMcpApprovals(){return ()=>{};},
  async storageStatus() { return {mode:'local',path:'Browser preview',connected:false,readOnly:false}; },
  onStorage() { return () => {}; },
  updateState: async () => null, updateCheck: async () => null, updateDownload: desktopOnly, updateInstall: desktopOnly, updateSkip: async () => {}, updatePage: async () => {}, onUpdate() { return () => {}; },
  async storagePrepare() { throw new Error('Drive folder connections require the desktop app and Google Drive for desktop.'); },
  storageShared:desktopOnly,storageConflicts:async()=>[],storageConflict:desktopOnly,storageResolve:desktopOnly,
  storageApply: desktopOnly, storageSchedules: desktopOnly, storageTakeover: desktopOnly, storageRestart: desktopOnly,
  async sheetPython() { throw new Error('Python scripts require the desktop app and an installed Python 3.'); },
  async sheetStop() {},
  async accountsList(){return {accounts:[],pending:[],googleConfigured:false,error:'Use the desktop app to connect provider accounts.'};},
  accountsDecide:desktopOnly,accountsStart:desktopOnly,accountsCancel:desktopOnly,accountsModels:desktopOnly,accountsKey:desktopOnly,accountsAcknowledge:desktopOnly,accountsRename:desktopOnly,accountsDisconnect:desktopOnly,accountsRemove:desktopOnly,accountsGoogle:desktopOnly,
  onAccounts(){return ()=>{};},
  async clipboardWrite({ text }) { try { await navigator.clipboard.writeText(text); } catch {} return null; },
  async clipboardRead() { let text = ''; try { text = await navigator.clipboard.readText(); } catch {} return { text, html: '', ref: null }; },
  async load() { return read(); },
  async mutate(action) { const next = applyMutation(read(), action); localStorage.setItem(KEY, JSON.stringify(next)); for (const fn of listeners) fn(next); return next; },
  onState(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  onProgress() { return () => {}; },
  retry:desktopOnly,
  async start() { throw new Error('Agent runs are available in the desktop app. Install and sign in to your provider CLI, then open Daevu.'); },
  async stop() {},
  async runSchedule() { throw new Error('Scheduled agent runs require the desktop app.'); },
  async tickSchedules() {},
  async browserNew(projectId,url=''){let tab;previewUpdate(s=>{const p=s.projects.find(p=>p.id===projectId);tab={id:crypto.randomUUID(),url:normalizeBrowserURL(url),title:'New tab'};p.browserTabs||=[];p.browserTabs.push(tab);p.browserActiveTab=tab.id;return s;});return tab;},
  async browserActivate(projectId,tabId){return previewUpdate(s=>{s.projects.find(p=>p.id===projectId).browserActiveTab=tabId;return s;});},
  async browserClose(projectId,tabId){return previewUpdate(s=>{const p=s.projects.find(p=>p.id===projectId);p.browserTabs=p.browserTabs.filter(t=>t.id!==tabId);p.browserActiveTab=p.browserTabs.at(-1)?.id;return s;});},
  async browserNavigate(projectId,tabId,url){return previewUpdate(s=>{const t=s.projects.find(p=>p.id===projectId).browserTabs.find(t=>t.id===tabId);t.url=normalizeBrowserURL(url);return s;});},
  async browserShow(){return null;},async browserHide(){},async browserAction(){},
  async browserCapture(){throw new Error('Page capture requires the native desktop browser.');},
  onBrowserState(){return()=>{};},onQuickCapture(){return()=>{};},async calendarImport(){throw new Error('Importing calendars needs the desktop app.');},async calendarExport(){throw new Error('Exporting calendars needs the desktop app.');},async fileImage(){throw new Error('Opening images in the app needs the desktop app.');},setTitleBar(){},onDeepLink(){return()=>{};},async pendingLink(){return null;},onBrowserFocus(){return()=>{};},
  async toolsList() { return { tools: BUILTIN_TOOLS.map(t => ({ id: t.id, kind: 'builtin', name: t.name, source: 'Built in', detail: t.detail })), warnings: ['MCP server discovery requires the desktop app.'] }; },
  async pickRef() { throw new Error('Linking computer files requires the desktop app.'); },
  async checkCLI() { throw new Error('CLI connections can be checked in the desktop app.'); },
  async openFolder() { throw new Error('Local folders are available in the desktop app.'); },
  async openFile() { throw new Error('Open attached files in the desktop app.'); },
  async openURL(url) { if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer'); },
  async readFile() { throw new Error('Previews need the desktop app.'); },
  async importSheets() { throw new Error('Importing spreadsheets needs the desktop app.'); },
  async importFiles() { throw new Error('Use the desktop app to import documents into your local workspace.'); },
  async fileData() { throw new Error('Map images need the desktop app.'); },
  async previewHtml() { throw new Error('Previews use the desktop app.'); },
  async exportArtifact(projectId, artifactId) {
    const artifact = read().projects.find(p => p.id === projectId)?.artifacts?.find(x => x.id === artifactId);
    if (!artifact) return;
    const url = URL.createObjectURL(new Blob([artifact.data.html], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${artifact.title}.html`; link.click(); URL.revokeObjectURL(url);
  },
  async exportNote(projectId, noteId) {
    const note = read().projects.find(p => p.id === projectId)?.notes.find(n => n.id === noteId);
    if (!note) return;
    const url = URL.createObjectURL(new Blob([note.content], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${note.title}.${note.kind === 'sheet' ? 'csv' : 'md'}`; a.click(); URL.revokeObjectURL(url);
  }
};
export const desktop = Boolean(window.workspace);
// In the desktop app the window keeps its own copy of the workspace and the main process sends only what changed.
function withPatches(bridge) {
  const listeners = new Set(), pending = new Map();
  let current = null, rev = -1, waiters = [], resyncing = null;
  const publish = () => {
    for (const fn of listeners) fn(current);
    const ready = waiters.filter(w => w.rev <= rev);
    waiters = waiters.filter(w => w.rev > rev);
    for (const w of ready) w.resolve(current);
  };
  function drain() { for (let next = pending.get(rev); next; next = pending.get(rev)) { pending.delete(rev); if (!step(next)) return; } }
  function adopt(state, at) { current = state; rev = at; for (const [from, p] of pending) if (p.rev <= rev) pending.delete(from); publish(); drain(); }
  function step(p) {
    const known = new Map(current.projects.map(x => [x.id, x])), projects = p.ids.map(id => p.projects[id] || known.get(id));
    if (projects.some(x => !x)) { resync(); return false; }
    const next = { ...current, ...p.top };
    for (const key of p.gone || []) delete next[key];
    next.projects = projects; current = next; rev = p.rev; publish();
    return true;
  }
  function resync() { resyncing ||= bridge.sync().then(r => adopt(r.state, r.rev)).finally(() => { resyncing = null; }); return resyncing; }
  function receive(p) {
    if (!p || p.rev <= rev) return;
    if (p.full) { adopt(p.full, p.rev); return; }
    if (current && p.from === rev) { step(p); drain(); return; }
    pending.set(p.from, p);
    setTimeout(() => { if (pending.has(p.from) && p.rev > rev) resync().catch(() => {}); }, 1500);
  }
  bridge.onPatch(receive);
  return {
    ...bridge,
    async load() { if (current) return current; const r = await bridge.sync(); adopt(r.state, r.rev); return current; },
    async mutate(action) {
      const p = await bridge.mutatePatch(action);
      receive(p);
      if (rev >= p.rev) return current;
      return new Promise(resolve => { waiters.push({ rev: p.rev, resolve }); setTimeout(() => { if (rev < p.rev) resync().catch(() => {}); }, 2500); });
    },
    onState(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}
export const api = window.workspace?.patches === true ? withPatches(window.workspace) : (window.workspace || preview);
