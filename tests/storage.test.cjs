const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { WorkspaceStorage, readWorkspace } = require('../electron/storage.cjs');
const { Store } = require('../electron/store.cjs');
const { Scheduler } = require('../electron/scheduler.cjs');
const { makeFixture } = require('./fixture.cjs');
async function scope(t) { const base = path.resolve(__dirname, '../.test-data'); await fs.mkdir(base, {recursive:true}); const root = await fs.mkdtemp(path.join(base,'storage-')); t.after(() => { assert.ok(root.startsWith(base + path.sep)); return fs.rm(root,{recursive:true,force:true}); }); return root; }
async function open(userData, t) {
  const storage = new WorkspaceStorage(userData); const root = await storage.start();
  t.after(() => storage.close());
  const store = new Store(root, () => {}, { guard: () => storage.assertWritable(), writable: () => storage.writable, loaded: s => storage.loaded(s), serialize: s => storage.serialize(s), saved: (s,text) => storage.saved(s,text) }); await store.init(); return { storage, store };
}
async function shared(t) {
  const root = await scope(t), userA = path.join(root,'device-a'), userB = path.join(root,'device-b'), drive = path.join(root,'drive'); await fs.mkdir(drive);
  const first = await open(userA,t); await first.store.update(() => makeFixture());
  await fs.mkdir(path.join(userA,'auth'),{recursive:true}); await fs.writeFile(path.join(userA,'auth','credentials.bin'),'NEVER COPY');
  const p = first.store.state.projects[0]; const file = {id:'attached-file',name:'Evidence.txt',storedName:'attached-file.txt',size:8}; await fs.writeFile(path.join(first.store.projectDir(p.id),'files',file.storedName),'evidence');
  await first.store.update(s=>{s.projects[0].files.push(file);s.projects[0].notes[0].pythonScript='print("saved")';return s;});
  const plan = await first.storage.prepare('move-drive',drive,first.store); await first.storage.apply(plan.id,first.store); first.storage.close();
  return {root,userA,userB,drive:plan.destination,original:first.store.root};
}
test('Drive move copies the complete workspace and attachments, preserves originals, and excludes auth', async t => {
  const fixture = await shared(t); const saved = await readWorkspace(fixture.drive);
  assert.equal(saved.state.projects[0].notes[0].pythonScript,'print("saved")'); assert.equal(saved.state.projects.length,1);
  assert.equal(await fs.readFile(path.join(fixture.drive,'projects',saved.state.projects[0].id,'files','attached-file.txt'),'utf8'),'evidence');
  await assert.rejects(fs.access(path.join(fixture.drive,'auth'))); await fs.access(path.join(fixture.original,'workspace.json'));
  assert.equal(saved.state.settings.launchAtLogin,false);
  const active = await open(fixture.userA,t); assert.equal(active.store.root,fixture.drive); assert.equal(active.storage.cloud,true); assert.equal(active.storage.automaticSchedules,false);
  await active.store.mutate({type:'theme',value:'light'}); assert.equal((await readWorkspace(fixture.drive)).state.theme,'light');
});
test('second-device connection preserves its local work; a live session is read only', async t => {
  const fixture = await shared(t), first = await open(fixture.userA,t), other = await open(fixture.userB,t);
  await other.store.mutate({type:'theme',value:'light'});const local = other.store.root;
  const plan = await other.storage.prepare('open-drive',fixture.drive,other.store); await other.storage.apply(plan.id,other.store);
  const second = await open(fixture.userB,t); assert.equal(second.storage.writable,false); assert.ok(second.storage.status().sessionOwner); assert.equal((await readWorkspace(local)).state.theme,'light');
  const before = await fs.readFile(path.join(fixture.drive,'workspace.json'),'utf8'); await assert.rejects(second.store.mutate({type:'theme',value:'light'}),/open on/); assert.equal(await fs.readFile(path.join(fixture.drive,'workspace.json'),'utf8'),before);
  first.storage.close(); second.storage.close(); const reopened = await open(fixture.userB,t); assert.equal(reopened.storage.writable,true); assert.equal(reopened.storage.automaticSchedules,false);
});
test('Drive changes block overwrites and the open copy can be saved locally', async t => {
  const fixture = await shared(t), current = await open(fixture.userA,t); const file = path.join(fixture.drive,'workspace.json'); const external = JSON.parse(await fs.readFile(file,'utf8')); external.theme='light'; await fs.writeFile(file,JSON.stringify(external));
  await assert.rejects(current.store.mutate({type:'theme',value:'light'}),/different workspace version/);assert.equal(current.store.state.theme,'dark');assert.equal((await readWorkspace(fixture.drive)).state.theme,'light');
  const plan=await current.storage.prepare('local-copy','',current.store);await current.storage.apply(plan.id,current.store);assert.equal((await readWorkspace(plan.destination)).state.theme,'dark');assert.equal((await readWorkspace(fixture.drive)).state.theme,'light');
});
test('missing Drive never creates a replacement workspace or overwrites the device backup', async t => {
  const fixture = await shared(t);await fs.rename(fixture.drive,fixture.drive+'-unavailable');const current=await open(fixture.userA,t);
  assert.equal(current.storage.status().readOnly,true);assert.equal(current.storage.status().connected,false);await assert.rejects(current.store.mutate({type:'theme',value:'light'}),/unavailable/);await assert.rejects(fs.access(fixture.drive));
});
test('invalid, changed, nested, or nonempty destinations are rejected before switching', async t => {
  const root=await scope(t), current=await open(path.join(root,'device'),t);await fs.mkdir(path.join(root,'drive'));
  await assert.rejects(current.storage.prepare('move-drive',current.store.root,current.store),/outside/);
  await assert.rejects(current.storage.prepare('open-drive',path.join(root,'drive'),current.store));
  const plan=await current.storage.prepare('move-drive',path.join(root,'drive'),current.store);await current.store.mutate({type:'theme',value:'light'});await assert.rejects(current.storage.apply(plan.id,current.store),/changed after/);
  await fs.mkdir(plan.destination);await fs.writeFile(path.join(plan.destination,'unrelated.txt'),'keep');await assert.rejects(current.storage.prepare('move-drive',path.join(root,'drive'),current.store),/already contains/);assert.equal(await fs.readFile(path.join(plan.destination,'unrelated.txt'),'utf8'),'keep');
});
test('malicious attachment paths and missing streamed attachments are rejected', async t => {
  const fixture=await shared(t);const file=path.join(fixture.drive,'workspace.json');const state=JSON.parse(await fs.readFile(file,'utf8'));state.projects[0].files[0].storedName='../../auth/credentials.bin';await fs.writeFile(file,JSON.stringify(state));await assert.rejects(readWorkspace(fixture.drive),/invalid attachment/);
  state.projects[0].files[0].storedName='missing.txt';await fs.writeFile(file,JSON.stringify(state));const other=await open(fixture.userB,t);await assert.rejects(other.storage.prepare('open-drive',fixture.drive,other.store));assert.equal(other.storage.config.mode,'local');
});
test('startup settings and automatic schedules stay device-local in Drive', async t => {
  const fixture=await shared(t), current=await open(fixture.userA,t);await current.store.mutate({type:'settings',value:{launchAtLogin:true,keepRunning:false}});await current.storage.setSchedules(true);
  assert.equal(current.store.state.settings.launchAtLogin,true);assert.equal(current.storage.automaticSchedules,true);assert.equal((await readWorkspace(fixture.drive)).state.settings.launchAtLogin,false);current.storage.close();
  const other=await open(fixture.userB,t),plan=await other.storage.prepare('open-drive',fixture.drive,other.store);await other.storage.apply(plan.id,other.store);const connected=await open(fixture.userB,t);assert.equal(connected.store.state.settings.launchAtLogin,false);assert.equal(connected.storage.automaticSchedules,false);
  let starts=0;const scheduler=new Scheduler(connected.store,{groups:new Map(),start:()=>{starts++;}},()=>new Date(),()=>false);await scheduler.tick();assert.equal(starts,0);
});
test('confirmed session recovery blocks the old writer and reopens the new device', async t => {
  const fixture=await shared(t), first=await open(fixture.userA,t), other=await open(fixture.userB,t);const plan=await other.storage.prepare('open-drive',fixture.drive,other.store);await other.storage.apply(plan.id,other.store);const second=await open(fixture.userB,t);
  await second.storage.takeOver();assert.equal(second.storage.restartNeeded,true);await assert.rejects(first.store.mutate({type:'theme',value:'light'}),/Another device/);second.storage.close();const reopened=await open(fixture.userB,t);assert.equal(reopened.storage.writable,true);
});
test('an interrupted copy leaves active storage unchanged and can be retried', async t => {
  const root=await scope(t), current=await open(path.join(root,'device'),t), parent=path.join(root,'Drive');await fs.mkdir(parent);await current.store.update(()=>makeFixture());
  await current.store.update(s=>{s.projects[0].files.push({id:'missing',storedName:'missing.txt',name:'Missing.txt'});return s;});
  const plan=await current.storage.prepare('move-drive',parent,current.store);await assert.rejects(current.storage.apply(plan.id,current.store));assert.equal(current.storage.config.mode,'local');assert.equal(current.storage.writable,true);assert.deepEqual(await fs.readdir(parent),[]);
  await fs.writeFile(path.join(current.store.projectDir(current.store.state.projects[0].id),'files','missing.txt'),'now available');await current.storage.apply(plan.id,current.store);assert.equal(current.storage.restartNeeded,true);
});
test('attachments through a junction outside the workspace cannot be copied', async t => {
  const fixture=await shared(t);const p=(await readWorkspace(fixture.drive)).state.projects[0];const files=path.join(fixture.drive,'projects',p.id,'files'),external=path.join(fixture.root,'private-files');await fs.mkdir(external);await fs.writeFile(path.join(external,'attached-file.txt'),'private');await fs.rename(files,files+'-original');await fs.symlink(external,files,process.platform==='win32'?'junction':'dir');
  const other=await open(fixture.userB,t);await assert.rejects(other.storage.prepare('open-drive',fixture.drive,other.store),/outside this workspace/);
});
test('a missing session file heals itself, and a Drive hiccup never leaves the workspace stuck read-only', async t => {
  const fixture = await shared(t), active = await open(fixture.userA, t);
  await fs.unlink(active.storage.lockPath());
  await active.store.mutate({ type: 'theme', value: 'light' });
  await fs.access(active.storage.lockPath());
  const real = active.storage.lockPath.bind(active.storage);
  active.storage.lockPath = () => path.join(fixture.root, 'gone', 'lock.json');
  await assert.rejects(active.store.mutate({ type: 'theme', value: 'dark' }), /busy or still syncing/);
  assert.equal(active.storage.problem, ''); assert.equal(active.storage.writable, true);
  active.storage.lockPath = real;
  await active.store.mutate({ type: 'theme', value: 'dark' });
  assert.equal((await readWorkspace(fixture.drive)).state.theme, 'dark');
});
test('a real conflict still locks the workspace, so another device is never overwritten', async t => {
  const fixture = await shared(t), active = await open(fixture.userA, t);
  const lockFile = active.storage.lockPath();
  await fs.writeFile(lockFile, JSON.stringify({ version: 1, deviceId: 'other', session: 'someone-else', name: 'Other PC', pid: 1, openedAt: new Date().toISOString() }));
  await assert.rejects(active.store.mutate({ type: 'theme', value: 'light' }), /Another device owns/);
  assert.equal(active.storage.writable, false);
});
test('startup waits for Drive to finish mounting instead of giving up at once', async t => {
  const fixture = await shared(t), userC = path.join(fixture.root, 'device-c'), late = path.join(fixture.root, 'late-drive');
  await fs.mkdir(userC, { recursive: true });
  await fs.writeFile(path.join(userC, 'storage.json'), JSON.stringify({ mode: 'drive', root: late, deviceId: 'device-c', scheduleOnDevice: false, deviceSettings: { launchAtLogin: false, keepRunning: true } }));
  setTimeout(async () => { await fs.mkdir(late, { recursive: true }); await fs.copyFile(path.join(fixture.drive, 'workspace.json'), path.join(late, 'workspace.json')); }, 900);
  const storage = new WorkspaceStorage(userC); t.after(() => storage.close());
  const root = await storage.start();
  assert.equal(root, late); assert.equal(storage.unavailable, undefined); assert.equal(storage.problem || '', '');
});
