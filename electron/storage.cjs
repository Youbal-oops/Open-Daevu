const { replaceFile, isTransient } = require('./fs-utils.cjs');
// The shared-folder engine is only loaded when a workspace actually uses it, which keeps start-up quick and memory low.
let driveSync;
const drive = () => (driveSync ||= require('./drive-sync.cjs').DriveSync);
const fs = require('node:fs/promises');
const sync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID, createHash } = require('node:crypto');
const digest = text => createHash('sha256').update(text).digest('hex');
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9-]+$/.test(value);
const inside = (root, file) => { const relative = path.relative(root, file); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); };
async function readWorkspace(root) {
  const shared=await drive().marker(root);if(shared){const state=await drive().read(root,shared);validateWorkspace(state);const text=JSON.stringify(state);return {state,text,hash:digest(text)};}
  const file = path.join(root, 'workspace.json');
  const stat = await fs.stat(file); if (stat.size > 50 * 1024 * 1024) throw Error('Workspace metadata must be under 50 MB.');
  const text = await fs.readFile(file, 'utf8'), state = JSON.parse(text);
  validateWorkspace(state);
  return { state, text, hash: digest(text) };
}
function validateWorkspace(state) {
  if (state.version !== 1 || !Array.isArray(state.projects) || !Array.isArray(state.agents) || !Array.isArray(state.schedules) || !state.settings) throw Error('Choose a Daevu folder containing workspace.json.');
  const ids = new Set();
  for (const p of state.projects) {
    if (!safeId(p.id) || ids.has(p.id) || !['notes','files','tasks','messages','edges','agentIds'].every(key => Array.isArray(p[key]))) throw Error('This workspace contains an invalid project.');
    ids.add(p.id); const notes = new Set(), files = new Set();
    for (const n of p.notes) { if (!safeId(n.id) || notes.has(n.id) || !['note','sheet'].includes(n.kind) || typeof n.content !== 'string') throw Error('This workspace contains an invalid document.'); notes.add(n.id); }
    for (const f of p.files) { if (!safeId(f.id) || files.has(f.id) || typeof f.storedName !== 'string' || !/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9]+)?$/.test(f.storedName)) throw Error('This workspace contains an invalid attachment path.'); files.add(f.id); }
  }
  return state;
}
async function attachment(root, p, f) {
  const file = path.join(root, 'projects', p.id, 'files', f.storedName);
  const actual = await fs.realpath(file), base = await fs.realpath(root);
  if (!inside(base, actual) || !(await fs.stat(actual)).isFile()) throw Error('An attachment points outside this workspace.');
  return actual;
}
class WorkspaceStorage {
  constructor(userData, onChange = () => {}) { this.userData = userData; this.localRoot = path.join(userData, 'workspace'); this.onChange = onChange; this.session = randomUUID(); this.plans = new Map(); this.switching = false; this.restartNeeded = false; }
  saveConfig() {
    const text = JSON.stringify(this.config, null, 2);
    const operation = (this.configQueue || Promise.resolve()).then(async () => {
      await fs.mkdir(this.userData, { recursive: true }); const file = path.join(this.userData, 'storage.json');
      await fs.writeFile(file + '.tmp', text, 'utf8'); await replaceFile(file + '.tmp', file);
    });
    this.configQueue = operation.catch(() => {}); return operation;
  }
  async start() {
    try { this.config = JSON.parse(await fs.readFile(path.join(this.userData, 'storage.json'), 'utf8')); if (!['local','drive'].includes(this.config.mode) || !path.isAbsolute(this.config.root) || !safeId(this.config.deviceId)) throw Error('Invalid storage settings.'); }
    catch (e) { if (e.code !== 'ENOENT') throw Error('Storage settings could not be read. Keep storage.json for recovery.'); this.config = { mode: 'local', root: this.localRoot, deviceId: randomUUID(), scheduleOnDevice: false, deviceSettings: { launchAtLogin: false, keepRunning: true } }; await this.saveConfig(); }
    this.root = this.config.root;
    if (this.config.mode === 'drive') {
      // Drive for desktop can take a while to mount at sign-in, so wait for it before giving up.
      let failure;
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          this.sharedMarker=await drive().marker(this.root);this.problem='';
          if(this.sharedMarker){this.shared=new (drive())(this.root,this.userData,this.sharedMarker,{deviceId:this.config.deviceId,validate:validateWorkspace});await this.shared.load();}
          else{this.expected=(await readWorkspace(this.root)).hash;await this.acquire();}
          failure=null;break;
        }
        catch (e) { failure = e; if (attempt < 7) await new Promise(resolve => setTimeout(resolve, Math.min(500 * 2 ** attempt, 4000))); }
      }
      if (failure) { this.shared=null; this.problem = `Drive workspace is unavailable: ${failure.message}`; this.root = this.localRoot; this.unavailable = true; }
    }
    return this.root;
  }
  get cloud() { return this.config.mode === 'drive'; }
  get writable() { return !this.problem && !this.switching && !this.restartNeeded; }
  get automaticSchedules() { return this.writable && (!this.cloud || Boolean(this.config.scheduleOnDevice) && (!this.sharedMarker || this.sharedMarker.schedulerDeviceId===this.config.deviceId)); }
  status() { return { mode: this.config.mode, path: this.config.root, activePath: this.root, unavailable: Boolean(this.unavailable), problem: this.problem || '', readOnly: !this.writable, restartNeeded: this.restartNeeded, nextPath: this.nextPath, scheduleOnDevice: Boolean(this.config.scheduleOnDevice), sessionOwner: this.owner?.name || '',sharedEditing:Boolean(this.sharedMarker),schedulesAllowed:!this.sharedMarker || this.sharedMarker.schedulerDeviceId===this.config.deviceId,...this.shared?.status(),syncProblem:this.preferenceProblem || this.shared?.status().syncProblem || '', connected: this.cloud && !this.unavailable, note: this.unavailable ? 'Drive is unavailable. Showing the original local backup read only.' : this.sharedMarker ? 'Shared editing is enabled. Each device saves separate changes; Google Drive controls delivery.' : this.cloud ? 'Files are saved to this folder. Google Drive for desktop handles cloud syncing.' : 'Files are saved on this computer.' }; }
  emit() { this.onChange(this.status()); }
  async refresh() { if(this.shared && this.store){await this.store.refreshShared();this.emit();}else if (this.cloud && this.writable) { try { await this.assertWritable(); } catch {} } return this.status(); }
  async writeLock(flag = 'wx') { await fs.writeFile(this.lockPath(), JSON.stringify(this.lockData), { flag }); }
  lockPath() { return path.join(this.root, '.research-session.json'); }
  async acquire() {
    let existing;
    try { existing = JSON.parse(await fs.readFile(this.lockPath(), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') { this.problem = 'The workspace session file needs recovery before editing.'; return; } }
    if (existing?.deviceId === this.config.deviceId && existing.pid !== process.pid) {
      let alive = true; try { process.kill(existing.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
      if (!alive) { await fs.unlink(this.lockPath()); existing = null; }
    }
    if (existing) { if (existing.session === this.session) return; this.owner = existing; this.problem = `This workspace is open on ${existing.name || 'another computer'}. Close it there and let Drive finish syncing, then reopen it here.`; return; }
    this.lockData = { version: 1, deviceId: this.config.deviceId, session: this.session, name: os.hostname(), pid: process.pid, openedAt: new Date().toISOString() };
    try { await this.writeLock('wx'); this.ownsSession = true; }
    catch (e) { if (e.code === 'EEXIST') { this.problem = 'Another session opened this workspace. Close it before editing here.'; } else throw e; }
  }
  close() {
    if (!this.ownsSession) return;
    try { const lock = JSON.parse(sync.readFileSync(this.lockPath(), 'utf8')); if (lock.session === this.session) sync.unlinkSync(this.lockPath()); } catch {}
    this.ownsSession = false;
  }
  // inQueue is true for the save that is already running, which must not wait for itself.
  async assertWritable(inQueue = false) {
    if (!inQueue) await this.settle?.();
    if (!this.writable) throw Error(this.restartNeeded ? 'Restart the app to finish changing workspace storage.' : this.problem || 'Workspace storage is changing. Try again after the switch.');
    if (!this.cloud) return;
    if(this.shared)return;
    if(await drive().marker(this.root)){this.restartNeeded=true;this.nextPath=this.root;this.problem='Shared editing was enabled on another device. Restart to join the shared workspace.';this.emit();throw Error(this.problem);}
    let last;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        let lock;
        try { lock = JSON.parse(await fs.readFile(this.lockPath(), 'utf8')); }
        catch (e) { if (e.code === 'ENOENT' && this.ownsSession && this.lockData) { await this.writeLock('w'); lock = this.lockData; } else throw e; }
        if (lock.session !== this.session) { const conflict = Error('Another device owns this workspace session.'); conflict.conflict = true; throw conflict; }
        if ((await readWorkspace(this.root)).hash === this.expected) return;
        last = Error('Drive delivered a different workspace version. Your open copy has been preserved; reopen the Drive workspace to load the new version.'); last.conflict = attempt >= 3;
      } catch (e) { last = e; if (e.conflict) break; }
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
    }
    // A real conflict locks the workspace. A momentary Drive hiccup must not: the next attempt can succeed.
    if (last.conflict) { this.problem = last.message; this.emit(); throw Error(this.problem); }
    throw Error(isTransient(last) || last instanceof SyntaxError ? 'Google Drive is busy or still syncing (' + (last.code || 'unreadable file') + '). Nothing was lost; try again in a few seconds.' : last.message);
  }
  serialize(state) {
    if (!this.cloud) return state;
    if(this.sharedMarker)return this.sharedState(state);
    return { ...state,agentAvailability:undefined, settings: { ...state.settings, launchAtLogin: false, keepRunning: true } };
  }
  sharedState(state){return JSON.parse(JSON.stringify({...state,agentAvailability:undefined,selectedProject:null,theme:'dark',agents:state.agents.map(({connectionId,...agent})=>agent),settings:{...state.settings,launchAtLogin:false,keepRunning:true,claudeMcpPath:''}},(key,value)=>key==='_rwSyncHeads'?undefined:value));}
  loaded(state) {
    if(!this.cloud)return state;
    const next={...state,agentAvailability:this.config.agentAvailability || {},settings:{...state.settings,...this.config.deviceSettings}};
    if(this.sharedMarker){next.agents=state.agents.map(agent=>({...agent,connectionId:this.config.agentConnections?.[agent.id]?.provider===agent.provider?this.config.agentConnections[agent.id].connectionId:undefined}));next.selectedProject=state.projects.some(p=>p.id===this.config.selectedProject)?this.config.selectedProject:state.projects[0]?.id || null;next.theme=this.config.deviceTheme || 'dark';next.settings.claudeMcpPath=this.config.claudeMcpPath || '';if(this.shared?.doc){const heads=this.shared.revision();next._rwSyncHeads=heads;const annotate=value=>({...value,_rwSyncHeads:heads});next.projects=next.projects.map(p=>({...annotate(p),notes:p.notes.map(annotate),artifacts:(p.artifacts || []).map(annotate)}));next.agents=next.agents.map(annotate);next.schedules=next.schedules.map(annotate);}}
    return next;
  }
  async saved(state, text,context={}) {
    if (!this.cloud) return;
    if(!this.sharedMarker)this.expected = digest(text);
    const values = { launchAtLogin: Boolean(state.settings.launchAtLogin), keepRunning: Boolean(state.settings.keepRunning) };
    const previous=JSON.stringify(this.config);this.config.deviceSettings=values;this.config.agentAvailability=state.agentAvailability || {};
    if(this.sharedMarker){
      const action=context.action;
      if(this.config.selectedProject==null || ['select','project','project:delete'].includes(action?.type))this.config.selectedProject=state.selectedProject;
      if(!this.config.deviceTheme || action?.type==='theme')this.config.deviceTheme=state.theme;
      if(this.config.claudeMcpPath==null || action?.type==='settings')this.config.claudeMcpPath=state.settings.claudeMcpPath || '';
      this.config.agentConnections ||= {};
      for(const agent of state.agents)if(agent.connectionId)this.config.agentConnections[agent.id]={provider:agent.provider,connectionId:agent.connectionId};
      if(action?.type==='agent' && !action.value.connectionId)delete this.config.agentConnections[action.value.id];
    }
    if(JSON.stringify(this.config)!==previous){try{await this.saveConfig();this.preferenceProblem='';}catch(e){if(!this.sharedMarker)throw e;this.preferenceProblem='Research changes are saved, but local device preferences need retrying: '+e.message;}}
  }
  async setSchedules(value) { if (typeof value !== 'boolean') throw Error('Choose whether schedules run on this computer.');if(value && this.sharedMarker && this.sharedMarker.schedulerDeviceId!==this.config.deviceId)throw Error('Automatic schedules run on the PC that enabled shared editing. Manual research can run on every device.'); this.config.scheduleOnDevice = value; await this.saveConfig(); this.emit(); return this.status(); }
  async enableShared(store){
    if(!this.cloud||this.sharedMarker||this.unavailable)throw Error('Open a writable Drive workspace first.');
    const operation=store.queue.then(async()=>{
      await this.assertWritable(true);this.switching=true;this.emit();
      try{
        this.sharedMarker=await drive().enable(this.root,this.sharedState(store.state),this.config.deviceId);
        this.restartNeeded=true;this.nextPath=this.root;
        await this.saved(store.state,'');
        await fs.writeFile(this.lockPath(),JSON.stringify({version:2,deviceId:'shared-editing',session:'shared-editing',name:'Shared editing — update Daevu on this device'}));this.ownsSession=false;
        return this.status();
      }finally{this.switching=false;this.emit();}
    });
    store.queue=operation.catch(()=>{});return operation;
  }
  async prepare(mode, selected, store) {
    if (!['move-drive','open-drive','local-copy'].includes(mode)) throw Error('Choose a storage connection.');
    if (this.restartNeeded || this.switching) throw Error('Restart the app before changing storage again.');
    const destination = mode === 'move-drive' ? path.join(path.resolve(selected), 'Daevu') : mode === 'local-copy' ? path.join(this.userData, 'workspaces', randomUUID()) : path.resolve(selected);
    if (mode !== 'open-drive' && (inside(store.root, destination) || inside(destination, store.root))) throw Error('Choose a folder outside the current workspace.');
    let data;
    if (mode === 'open-drive') {
      data = await readWorkspace(destination);
      // Confirm referenced files are available before changing the active workspace.
      for (const p of data.state.projects) for (const f of p.files) await attachment(destination, p, f);
    } else {
      try { if ((await fs.readdir(destination)).length) throw Error('This folder already contains files. Use Open existing Drive workspace, or choose another folder.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      validateWorkspace(store.state);
      data = { state: structuredClone(store.state), hash: digest(JSON.stringify(store.state)) };
    }
    const summary = { id: randomUUID(), mode, destination, source: store.root, projects: data.state.projects.length, documents: data.state.projects.reduce((n,p) => n + p.notes.length, 0), files: data.state.projects.reduce((n,p) => n + p.files.length, 0) };
    this.plans.set(summary.id, { ...summary, hash: data.hash }); return summary;
  }
  async apply(planId, store) {
    const plan = this.plans.get(planId); if (!plan || plan.source !== store.root || this.restartNeeded) throw Error('Choose the storage folder again.');
    await store.queue;
    const sourceState = structuredClone(store.state);
    validateWorkspace(sourceState);
    this.switching = true; this.emit();
    let staging;
    try {
      if (plan.mode !== 'open-drive' && digest(JSON.stringify(sourceState)) !== plan.hash) throw Error('The workspace changed after the preview. Choose the folder again.');
      if (plan.mode === 'open-drive' && (await readWorkspace(plan.destination)).hash !== plan.hash) throw Error('The Drive workspace changed after the preview. Choose it again.');
      if (plan.mode !== 'open-drive') {
        try { if ((await fs.readdir(plan.destination)).length) throw Error('The destination is no longer empty. Choose another folder.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        const parent = path.dirname(plan.destination);
        await fs.mkdir(parent, { recursive: true });
        staging = await fs.mkdtemp(path.join(parent, '.research-copy-'));
        // Write only workspace data and referenced attachments; never the auth folder or browser profile.
        for (const p of sourceState.projects) {
          const dir = path.join(staging, 'projects', p.id); if (!safeId(p.id)) throw Error('Invalid project path.');
          await fs.mkdir(path.join(dir, 'notes'), { recursive: true }); await fs.mkdir(path.join(dir, 'files'), { recursive: true });
          for (const n of p.notes) { if (!safeId(n.id)) throw Error('Invalid document path.'); await fs.writeFile(path.join(dir, 'notes', `${n.id}.${n.kind === 'sheet' ? 'csv' : 'md'}`), n.content, 'utf8'); }
          for (const f of p.files) await fs.copyFile(await attachment(store.root, p, f), path.join(dir, 'files', f.storedName));
        }
        const data = plan.mode === 'local-copy' ? sourceState : { ...sourceState, settings: { ...sourceState.settings, launchAtLogin: false, keepRunning: true } };
        // workspace.json is the completion marker, written only after every attachment succeeds.
        await fs.writeFile(path.join(staging, 'workspace.json'), JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'wx' });
        // rmdir removes only an empty target; unrelated files can never be replaced.
        try { await fs.rmdir(plan.destination); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        await fs.rename(staging, plan.destination); staging = null;
      }
      const next = { ...this.config, root: plan.destination, mode: plan.mode === 'local-copy' ? 'local' : 'drive', scheduleOnDevice: false, deviceSettings: { launchAtLogin: Boolean(sourceState.settings.launchAtLogin), keepRunning: Boolean(sourceState.settings.keepRunning) } };
      const previous = this.config; this.config = next;
      try { await this.saveConfig(); } catch (e) { this.config = previous; throw e; }
      this.nextPath = plan.destination; this.restartNeeded = true; this.plans.clear(); return this.status();
    } finally {
      if (staging) { const checked = path.resolve(staging), parent = path.dirname(plan.destination); if (path.dirname(checked) === parent && path.basename(checked).startsWith('.research-copy-')) await fs.rm(checked, { recursive: true, force: true }); }
      this.switching = false; this.emit();
    }
  }
  async takeOver() {
    if (!this.cloud || this.unavailable || this.restartNeeded) throw Error('Open an available Drive workspace first.');
    // The caller obtains explicit confirmation before recovering a stale session.
    try { await fs.unlink(this.lockPath()); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    this.problem = ''; this.owner = null; await this.acquire(); this.restartNeeded = true; this.nextPath = this.root; this.emit(); return this.status();
  }
}
module.exports = { WorkspaceStorage, readWorkspace, digest };
