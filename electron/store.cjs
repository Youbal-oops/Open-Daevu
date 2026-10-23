const { replaceFile, retryTransient, isTransient } = require('./fs-utils.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const {appFiles,appPath}=require('../shared/app-project.mjs');
const {mergeDatabaseDraft}=require('../shared/database.mjs');
const { makeSeed, applyMutation } = require('../shared/domain.mjs');
class Store {
  constructor(root, onChange = () => {}, options = {}) { this.root = root; this.onChange = onChange; this.options = options; this.queue = Promise.resolve(); }
  async init() {
    await fs.mkdir(this.root, { recursive: true });
    if(this.options.shared){
      this.state=this.options.loaded(await this.options.shared.load());const previous=structuredClone(this.state);
      for(const p of this.state.projects)for(const t of p.tasks)if(t.deviceId===this.options.deviceId && ['running','queued'].includes(t.status)){t.status='interrupted';t.error='This device closed before its run finished.';}
      if(JSON.stringify(previous)!==JSON.stringify(this.state))await this.commit(previous);
      return this.state;
    }
    try { this.state = JSON.parse(await fs.readFile(path.join(this.root, 'workspace.json'), 'utf8')); this.fromDisk = true; }
    catch (error) {
      if (error.code !== 'ENOENT') {
        try { this.state = JSON.parse(await fs.readFile(path.join(this.root, 'workspace.backup.json'), 'utf8')); this.recovered = true; }
        catch { throw new Error('Workspace could not be read. Keep workspace.json and workspace.backup.json for recovery.'); }
      } else this.state = makeSeed();
    }
    if (this.state.version !== 1 || !Array.isArray(this.state.projects)) throw new Error('Unsupported workspace version.');
    this.state.schedules ||= [];
    this.state.trash ||= [];
    for (const p of this.state.projects) { p.parentId ??= null; p.status ||= 'active'; p.kpis ||= []; }
    this.state.settings = { launchAtLogin: false, keepRunning: true, allowAgentSchedules: true, ...this.state.settings };
    if (!this.options.writable || this.options.writable()) for (const p of this.state.projects) for (const t of p.tasks) if (t.status === 'running' || t.status === 'queued') { t.status = 'interrupted'; t.error = 'The app closed before this run finished.'; }
    if (this.options.loaded) this.state = this.options.loaded(this.state);
    // Opening a workspace that is already on disk only needs workspace.json refreshed; its readable copies are already there.
    if (!this.options.writable || this.options.writable()) await this.commit(this.fromDisk && !this.recovered ? this.state : undefined);
    return this.state;
  }
  projectDir(projectId) {
    if (!/^[a-zA-Z0-9-]+$/.test(projectId) || !this.state.projects.some(p => p.id === projectId)) throw new Error('Unknown project.');
    return path.join(this.root, 'projects', projectId);
  }
  async commit(previous,heads,action) {
    await this.options.guard?.();
    if(this.options.shared){
      const candidate=this.state,serialize=this.options.serialize || (s=>s);
      const merged=await this.options.shared.commit(serialize(previous || candidate),serialize(candidate),heads);
      await this.options.saved?.(candidate,'',{action});this.state=this.options.loaded(merged);
      for(const project of this.state.projects)try{await fs.mkdir(path.join(this.root,'projects',project.id,'files'),{recursive:true});}catch{ /* Data is durable locally; attachment folders can retry when Drive is available. */ }
      return;
    }
    const file = path.join(this.root, 'workspace.json');
    const data = this.options.serialize ? this.options.serialize(this.state) : this.state;
    let text = JSON.stringify(data);
    if (text.length < 1048576) text = JSON.stringify(data, null, 2);   // small workspaces stay easy to read; big ones skip the indentation
    const patient = Boolean(this.options.patient?.());
    await retryTransient(() => fs.writeFile(file + '.tmp', text, 'utf8'), patient);
    // The backup is a convenience: a busy Drive must not stop the real save.
    // Small workspaces keep the backup one save behind. A big one is copied at most once a minute: copying megabytes on every save is a lot of disk work for little protection.
    if (!this.recovered && (text.length < 1048576 || Date.now() - (this.lastBackup || 0) > 60000)) try { await retryTransient(() => fs.copyFile(file, path.join(this.root, 'workspace.backup.json')), patient); this.lastBackup = Date.now(); } catch (e) { if (!isTransient(e)) throw e; }
    await replaceFile(file + '.tmp', file, undefined, undefined, patient ? 14 : 6, patient ? 1500 : 300);
    await this.options.saved?.(this.state, text);
    this.recovered = false;
    // Readable copies of documents and apps mirror workspace.json. A transient Drive error must never undo a save.
    const mirror = async operation => { try { await retryTransient(operation, patient); } catch (e) { if (!isTransient(e)) throw e; console.error('Could not update a mirror file:', e.message); } };
    // Only projects that changed since the last save need their readable copies looked at.
    const before = new Map((previous?.projects || []).map(p => [p.id, p])), ensured = this.ensured ||= new Set();
    for (const p of this.state.projects) {
      const prior = before.get(p.id);
      if (prior === p) continue;
      const dir = this.projectDir(p.id);
      if (!ensured.has(p.id)) { await fs.mkdir(path.join(dir, 'notes'), { recursive: true }); await fs.mkdir(path.join(dir, 'files'), { recursive: true }); ensured.add(p.id); }
      const oldNotes = new Map((prior?.notes || []).map(n => [n.id, n])), oldApps = new Map((prior?.artifacts || []).map(a => [a.id, a]));
      for (const n of p.notes) {
        const old = oldNotes.get(n.id);
        if (!old || old.content !== n.content || old.title !== n.title) await mirror(() => fs.writeFile(path.join(dir, 'notes', `${n.id}.${n.kind === 'sheet' ? 'csv' : 'md'}`), n.content, 'utf8'));
      }
      if ((p.artifacts || []).some(a => a.kind === 'html')) await fs.mkdir(path.join(dir, 'apps'), { recursive: true });
      for (const a of p.artifacts || []) if (a.kind === 'html') { const old = oldApps.get(a.id); if (typeof a.data.html==='string' && (!old || old.data.html !== a.data.html)) await mirror(() => fs.writeFile(path.join(dir, 'apps', `${a.id}.html`), a.data.html, 'utf8')); }
      for(const a of p.artifacts || [])if(a.kind==='html' && a.data.files){
        const old=oldApps.get(a.id),folder=path.join(dir,'apps',a.id);
        for(const [name,content] of Object.entries(appFiles(a.data))){appPath(name);if(old?.data.files?.[name]===content)continue;const destination=path.join(folder,...name.split('/'));await fs.mkdir(path.dirname(destination),{recursive:true});await mirror(()=>fs.writeFile(destination,content,'utf8'));}
        for(const name of Object.keys(old?.data.files || {}))if(!Object.hasOwn(a.data.files,name)){appPath(name);await mirror(()=>fs.rm(path.join(folder,...name.split('/')),{force:true}));}
      }
      for (const old of prior?.artifacts || []) if (old.kind === 'html' && !(p.artifacts || []).some(x => x.id === old.id)) await mirror(() => fs.rm(path.join(dir, 'apps', `${old.id}.html`), { force: true }));
      const keptNotes = new Set(p.notes.map(n => n.id));
      for (const n of prior?.notes || []) if (!keptNotes.has(n.id)) await mirror(() => fs.rm(path.join(dir, 'notes', `${n.id}.${n.kind === 'sheet' ? 'csv' : 'md'}`), { force: true }));
    }
  }
  update(fn,context={}) {
    const operation = this.queue.then(async () => {
      const previous = this.state;
      const heads=context.heads&&this.options.shared?this.options.shared.rebaseHeads(context.heads):context.heads;
      const base=heads?this.options.loaded(this.options.shared.stateAt(heads)):this.state;
      // applyMutation makes its own copy; any other caller edits what it is given, so it gets a copy of the state.
      this.state = await (context.owned ? fn(base) : fn(structuredClone(base)));
      try { await this.commit(base,heads,context.action); } catch (e) { this.state = previous; throw e; }
      this.onChange(this.state);
      return context.owned ? this.state : structuredClone(this.state);
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  mutate(action) { if (['item:move', 'item:copy'].includes(action.type)) return require('./item-transfer.cjs').transferItem(this, action); const heads=this.options.shared && (action.value?._rwSyncHeads || action._rwSyncHeads);return this.update(state => {if(action.type==='artifact' && action.value?.kind==='database' && action.value._rwDatabaseBase){const { _rwDatabaseBase:base,...value}=action.value;const current=state.projects.find(p=>p.id===action.projectId)?.artifacts?.find(a=>a.id===value.id);return applyMutation(state,{...action,value:{...value,data:mergeDatabaseDraft(base,value.data,current?.data || value.data)}});}return applyMutation(state, action);},{...(heads?{heads}:{}),action,owned:true}); }
  refreshShared(){
    if(!this.options.shared)return this.queue;
    const operation=this.queue.then(async()=>{const before=this.options.shared.heads(),next=await this.options.shared.pull();if(this.options.shared.heads()!==before){this.state=this.options.loaded(next);this.onChange(structuredClone(this.state));}return this.state;});this.queue=operation.catch(()=>{});return operation;
  }
  resolveShared(id,version){
    const operation=this.queue.then(async()=>{this.state=this.options.loaded(await this.options.shared.resolve(id,version));this.onChange(structuredClone(this.state));return structuredClone(this.state);});this.queue=operation.catch(()=>{});return operation;
  }
}
module.exports = { Store };
