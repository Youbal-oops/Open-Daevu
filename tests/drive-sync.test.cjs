const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {DriveSync}=require('../electron/drive-sync.cjs');
const {makeFixture}=require('./fixture.cjs');
const {WorkspaceStorage}=require('../electron/storage.cjs');
const {Store}=require('../electron/store.cjs');
async function setup(t,state=makeFixture()){
 const root=path.resolve(__dirname,'../.test-data');await fs.mkdir(root,{recursive:true});const folder=await fs.mkdtemp(path.join(root,'shared-'));t.after(()=>{assert.equal(path.dirname(folder),root);return fs.rm(folder,{recursive:true,force:true});});
 const roots=[path.join(folder,'Drive-A'),path.join(folder,'Drive-B')];for(const root of roots)await fs.mkdir(root,{recursive:true});
 const marker=await DriveSync.enable(roots[0],state,'device-a');await fs.cp(path.join(roots[0],'.research-sync'),path.join(roots[1],'.research-sync'),{recursive:true});
 const engines=roots.map((root,i)=>new DriveSync(root,path.join(folder,'local-'+i),marker,{deviceId:'device-'+i}));await Promise.all(engines.map(e=>e.load()));
 const exchange=async()=>{await Promise.all(engines.map(e=>e.flushNow()));for(const [from,to]of [[0,1],[1,0]]){const directory=path.join(roots[from],'.research-sync','changes');let files=[];try{files=await fs.readdir(directory);}catch{}await fs.mkdir(path.join(roots[to],'.research-sync','changes'),{recursive:true});for(const file of files)if(file.endsWith('.change'))await fs.copyFile(path.join(directory,file),path.join(roots[to],'.research-sync','changes',file));}await engines[0].pull();await engines[1].pull();};
 return {folder,roots,marker,engines,exchange};
}
test('independent Drive replicas merge different notes and keep simultaneous collection additions',async t=>{
 const {engines:[a,b],exchange}=await setup(t),baseA=a.state(),baseB=b.state(),nextA=structuredClone(baseA),nextB=structuredClone(baseB);
 nextA.projects[0].notes[0].content='Research from computer A';nextB.projects[0].notes[1].content='Research from computer B';
 await a.commit(baseA,nextA);await b.commit(baseB,nextB);await exchange();
 assert.deepEqual(a.state(),b.state());assert.equal(a.state().projects[0].notes[0].content,'Research from computer A');assert.equal(a.state().projects[0].notes[1].content,'Research from computer B');
 const initialA=a.state(),initialB=b.state(),addA=structuredClone(initialA),addB=structuredClone(initialB);addA.projects[0].notes.push({id:'added-a',title:'A',kind:'note',content:'A'});addB.projects[0].notes.push({id:'added-b',title:'B',kind:'note',content:'B'});
 await a.commit(initialA,addA);await b.commit(initialB,addB);await exchange();assert.deepEqual(a.state(),b.state());assert.ok(a.state().projects[0].notes.some(n=>n.id==='added-a'));assert.ok(a.state().projects[0].notes.some(n=>n.id==='added-b'));
});

test('simultaneous first chats on an older shared workspace preserve both chat histories',async t=>{
 const {engines:[a,b],exchange}=await setup(t),{applyMutation}=require('../shared/domain.mjs'),{agentChats,conversationMessages}=require('../shared/conversations.mjs');
 const beforeA=a.state(),beforeB=b.state(),afterA=applyMutation(beforeA,{type:'chat:create',projectId:'research-project',value:{id:'chat-a',agentId:'seo'}}),afterB=applyMutation(beforeB,{type:'chat:create',projectId:'research-project',value:{id:'chat-b',agentId:'seo'}});
 afterA.projects[0].messages.push({id:'message-a',agentId:'seo',chatId:'chat-a',role:'user',text:'Device A',createdAt:new Date().toISOString()});afterB.projects[0].messages.push({id:'message-b',agentId:'seo',chatId:'chat-b',role:'user',text:'Device B',createdAt:new Date().toISOString()});await a.commit(beforeA,afterA);await b.commit(beforeB,afterB);await exchange();assert.deepEqual(a.state(),b.state());const project=a.state().projects[0];assert.equal(agentChats(project,'seo').length,3);assert.equal(conversationMessages(project.messages,'seo','chat-a')[0].text,'Device A');assert.equal(conversationMessages(project.messages,'seo','chat-b')[0].text,'Device B');assert.equal(conversationMessages(project.messages,'seo').length,0);
});
test('empty collections are shared maps, so first projects created on both devices survive',async t=>{
 const state=makeFixture();state.projects=[];const {engines:[a,b],exchange}=await setup(t,state);const beforeA=a.state(),beforeB=b.state(),afterA=structuredClone(beforeA),afterB=structuredClone(beforeB);
 afterA.projects.push({id:'a',name:'Project A',notes:[],files:[]});afterB.projects.push({id:'b',name:'Project B',notes:[],files:[]});await a.commit(beforeA,afterA);await b.commit(beforeB,afterB);await exchange();assert.deepEqual(a.state(),b.state());assert.equal(a.state().projects.length,2);
});
test('conflicting text versions remain reviewable and resolving a version converges',async t=>{
 const {engines:[a,b],exchange}=await setup(t),beforeA=a.state(),beforeB=b.state(),afterA=structuredClone(beforeA),afterB=structuredClone(beforeB);
 afterA.projects[0].notes[0].content='Version A';afterB.projects[0].notes[0].content='Version B';await a.commit(beforeA,afterA);await b.commit(beforeB,afterB);await exchange();
 const conflict=a.conflicts().find(c=>c.label.endsWith('/ content'));assert.ok(conflict);const detail=a.conflict(conflict.id);assert.deepEqual(detail.versions.map(v=>v.value).sort(),['Version A','Version B']);
 await a.resolve(conflict.id,detail.versions.find(v=>v.value==='Version B').version);await exchange();assert.equal(a.state().projects[0].notes[0].content,'Version B');assert.deepEqual(a.state(),b.state());assert.equal(a.status().conflicts,0);
});
test('a stale UI draft does not overwrite another device’s unrelated changes',async t=>{
 const {engines:[a,b],exchange}=await setup(t),stale=a.state(),remote=b.state(),next=structuredClone(remote);next.projects[0].description='Remote description';await b.commit(remote,next);await exchange();
 const local=structuredClone(stale);local.projects[0].notes[0].content='Local note';await a.commit(stale,local);await exchange();assert.equal(a.state().projects[0].description,'Remote description');assert.equal(a.state().projects[0].notes[0].content,'Local note');assert.deepEqual(a.state(),b.state());
});
test('deletion retains concurrent edits in recoverable deleted items',async t=>{
 const {engines:[a,b],exchange}=await setup(t),beforeA=a.state(),beforeB=b.state(),afterA=structuredClone(beforeA),afterB=structuredClone(beforeB);afterA.projects[0].notes.splice(0,1);afterB.projects[0].notes[0].content='Concurrent edit retained';
 await a.commit(beforeA,afterA);await b.commit(beforeB,afterB);await exchange();assert.equal(a.state().projects[0].notes.some(n=>n.id==='brief'),false);
 const deleted=a.conflicts().find(c=>c.deleted && c.label.includes('brief'));assert.ok(deleted);assert.equal(a.conflict(deleted.id).versions[0].value.content,'Concurrent edit retained');await a.resolve(deleted.id,'restore');await exchange();assert.equal(a.state().projects[0].notes.find(n=>n.id==='brief').content,'Concurrent edit retained');assert.deepEqual(a.state(),b.state());
});
test('pending local edits survive an unavailable Drive folder and an app restart',async t=>{
 const {folder,roots,marker,engines:[a,b],exchange}=await setup(t);const markerFile=path.join(roots[0],'.research-sync','shared.json');await fs.rename(markerFile,markerFile+'.offline');
 const before=a.state(),after=structuredClone(before);after.projects[0].description='Saved offline';await a.commit(before,after);assert.ok(a.status().pendingUploads>0);await a.flushNow();assert.match(a.status().syncProblem,/saved on this PC/);await fs.rename(markerFile+'.offline',markerFile);
 const restart=new DriveSync(roots[0],path.join(folder,'local-0'),marker,{deviceId:'device-0'});await restart.load();assert.equal(restart.state().projects[0].description,'Saved offline');assert.equal(restart.status().pendingUploads,0);await exchange();assert.equal(b.state().projects[0].description,'Saved offline');
});

test('late dependent change files wait and then converge when their dependency arrives',async t=>{
 const {roots,engines:[a,b]}=await setup(t);let before=a.state(),after=structuredClone(before);after.projects[0].description='First edit';await a.commit(before,after);await a.flushNow();
 const directory=path.join(roots[0],'.research-sync','changes'),first=(await fs.readdir(directory)).filter(n=>n.endsWith('.change'));
 before=a.state();after=structuredClone(before);after.projects[0].description='Second edit';await a.commit(before,after);await a.flushNow();const second=(await fs.readdir(directory)).filter(n=>n.endsWith('.change')&&!first.includes(n));
 const target=path.join(roots[1],'.research-sync','changes');await fs.mkdir(target,{recursive:true});for(const name of second)await fs.copyFile(path.join(directory,name),path.join(target,name));await b.pull();assert.ok(b.status().missingChanges>0);
 for(const name of first)await fs.copyFile(path.join(directory,name),path.join(target,name));await b.pull();assert.equal(b.status().missingChanges,0);assert.equal(b.state().projects[0].description,'Second edit');
});

async function openStore(userData,root){
 let storage=new WorkspaceStorage(userData);await storage.start();storage.config={...storage.config,root,mode:'drive'};await storage.saveConfig();storage=new WorkspaceStorage(userData);await storage.start();
 const store=new Store(storage.root,()=>{},{shared:storage.shared,deviceId:storage.config.deviceId,guard:()=>storage.assertWritable(true),writable:()=>storage.writable,loaded:s=>storage.loaded(s),serialize:s=>storage.serialize(s),saved:(s,text,context)=>storage.saved(s,text,context)});await store.init();storage.store=store;storage.settle=()=>store.queue;return {storage,store};
}
test('Store drafts merge across two devices; account bindings and current project stay local',async t=>{
 const {folder,roots}=await setup(t); // Replace the initial bare sync fixture with a real migration below.
 const first=path.join(folder,'legacy-drive');await fs.mkdir(first);const fixture=makeFixture();fixture.agents[0].connectionId='account-on-a';await fs.writeFile(path.join(first,'workspace.json'),JSON.stringify(fixture));
 let a=await openStore(path.join(folder,'client-a'),first);await a.storage.enableShared(a.store);a.storage.close();a=await openStore(path.join(folder,'client-a'),first);
 const second=path.join(folder,'replica-drive');await fs.cp(first,second,{recursive:true});const b=await openStore(path.join(folder,'client-b'),second);t.after(()=>{a.storage.close();b.storage.close();});
 assert.equal(a.storage.status().readOnly,false);assert.equal(b.storage.status().readOnly,false);assert.equal(a.store.state.agents[0].connectionId,'account-on-a');assert.equal(b.store.state.agents[0].connectionId,undefined);assert.equal(a.storage.shared.state().agents[0].connectionId,undefined);
 const exchange=async()=>{await a.storage.shared.flushNow();await b.storage.shared.flushNow();for(const [from,to]of [[first,second],[second,first]]){const source=path.join(from,'.research-sync','changes');let files=[];try{files=await fs.readdir(source);}catch{}await fs.mkdir(path.join(to,'.research-sync','changes'),{recursive:true});for(const file of files)if(file.endsWith('.change'))await fs.copyFile(path.join(source,file),path.join(to,'.research-sync','changes',file));}await a.store.refreshShared();await b.store.refreshShared();};
 const stale=structuredClone(a.store.state.projects[0].notes[0]);
 const remote=structuredClone(b.store.state.projects[0].notes[0]);remote.title='Remote title';await b.store.mutate({type:'note',projectId:'research-project',value:remote});await exchange();
 stale.content='Edited in old open draft';await a.store.mutate({type:'note',projectId:'research-project',value:stale});await exchange();assert.equal(a.store.state.projects[0].notes[0].title,'Remote title');assert.equal(b.store.state.projects[0].notes[0].content,'Edited in old open draft');
 const oldA=structuredClone(a.store.state.projects[0].notes[0]),oldB=structuredClone(b.store.state.projects[0].notes[0]);oldB.content='Concurrent B';await b.store.mutate({type:'note',projectId:'research-project',value:oldB});await exchange();oldA.content='Concurrent A';await a.store.mutate({type:'note',projectId:'research-project',value:oldA});await exchange();assert.ok(a.storage.shared.conflicts().some(c=>c.label.endsWith('/ content')));
 const profile={...b.store.state.agents[0],connectionId:'account-on-b'};await b.store.mutate({type:'agent',value:profile});await exchange();assert.equal(a.store.state.agents[0].connectionId,'account-on-a');assert.equal(b.store.state.agents[0].connectionId,'account-on-b');
 const staleDraft=structuredClone(a.store.state.projects[0].notes[0]);await a.store.mutate({type:'agent',value:{...a.store.state.agents[1],connectionId:'second-account-on-a'}});staleDraft.title='Saved after connecting another agent';await a.store.mutate({type:'note',projectId:'research-project',value:staleDraft});assert.equal(a.store.state.agents[1].connectionId,'second-account-on-a');
 await assert.rejects(b.storage.setSchedules(true),/PC that enabled/);assert.equal(b.storage.automaticSchedules,false);assert.ok(a.storage.sharedMarker.schedulerDeviceId===a.storage.config.deviceId);
 const unchanged=await fs.readFile(path.join(first,'workspace.json'),'utf8');assert.equal(JSON.parse(unchanged).projects[0].notes[0].content,fixture.projects[0].notes[0].content,'Shared saves do not overwrite the original workspace snapshot');
});

test('preserved conflict versions remain reviewable after subsequent ordinary edits',async t=>{
 const {engines:[a,b],exchange}=await setup(t),oldA=a.state(),oldB=b.state(),nextA=structuredClone(oldA),nextB=structuredClone(oldB);nextA.projects[0].notes[0].content='A';nextB.projects[0].notes[0].content='B';await a.commit(oldA,nextA);await b.commit(oldB,nextB);await exchange();
 const conflict=a.conflicts().find(c=>c.label.endsWith('/ content'));assert.ok(conflict);const current=a.state(),edited=structuredClone(current);edited.projects[0].notes[0].content='Later draft';await a.commit(current,edited);await exchange();assert.ok(a.conflicts().some(c=>c.id===conflict.id));assert.deepEqual(a.conflict(conflict.id).versions.map(v=>v.value).sort(),['A','B']);
});

test('database rows and cells merge granularly, including independent changes to the same row',async t=>{
 const state=makeFixture();state.projects[0].artifacts=[{id:'leads',kind:'database',title:'Leads',data:{properties:[{id:'name',name:'Name',type:'title'},{id:'value',name:'Value',type:'number'},{id:'status',name:'Status',type:'text'}],rows:[{id:'row',cells:{name:'Lead',value:10,status:'New'}}],views:[{id:'view',type:'table'}]}}];
 const {engines:[a,b],exchange}=await setup(t,state),oldA=a.state(),oldB=b.state(),nextA=structuredClone(oldA),nextB=structuredClone(oldB);nextA.projects[0].artifacts[0].data.rows[0].cells.value=25;nextB.projects[0].artifacts[0].data.rows[0].cells.status='Qualified';await a.commit(oldA,nextA);await b.commit(oldB,nextB);await exchange();
 assert.deepEqual(a.state(),b.state());assert.deepEqual(a.state().projects[0].artifacts[0].data.rows[0].cells,{name:'Lead',value:25,status:'Qualified'});assert.equal(a.status().conflicts,0);
});

test('concurrent folder moves cannot leave a project cycle hidden in the sidebar',async t=>{
 const state=makeFixture();state.projects.push({...structuredClone(state.projects[0]),id:'second-project',name:'Second',parentId:null});const {engines:[a,b],exchange}=await setup(t,state),beforeA=a.state(),beforeB=b.state(),nextA=structuredClone(beforeA),nextB=structuredClone(beforeB);nextA.projects[0].parentId='second-project';nextB.projects[1].parentId='research-project';await a.commit(beforeA,nextA);await b.commit(beforeB,nextB);await exchange();assert.deepEqual(a.state(),b.state());assert.ok(a.state().projects.some(p=>!p.parentId));assert.equal(a.state().projects.length,2);
});

test('live app state saved from an older revision preserves the other device’s keys',async t=>{
 const state=makeFixture();state.projects[0].artifacts=[{id:'app',kind:'html',title:'App',data:{html:'<p>App</p>',state:{left:0,right:0}}}];
 const {roots,engines:[a,b],exchange}=await setup(t,state),store=new Store(roots[0],()=>{},{shared:a,deviceId:'device-0',loaded:s=>s});await store.init();const heads=a.revision();
 const before=b.state(),after=structuredClone(before);after.projects[0].artifacts[0].data.state.right=2;await b.commit(before,after);await exchange();await store.refreshShared();
 await store.mutate({type:'artifact:state',projectId:'research-project',_rwSyncHeads:heads,value:{artifactId:'app',state:{left:1,right:0}}});await exchange();assert.deepEqual(a.state().projects[0].artifacts[0].data.state,{left:1,right:2});assert.deepEqual(a.state(),b.state());
});

test('opening a second device does not interrupt a run owned by the first device',async t=>{
 const state=makeFixture();state.projects[0].tasks=[{id:'task',agentId:'seo',deviceId:'device-0',status:'running',title:'Research'}];const {roots,engines:[a,b],exchange}=await setup(t,state);
 const secondary=new Store(roots[1],()=>{},{shared:b,deviceId:'device-1',loaded:s=>s});await secondary.init();assert.equal(secondary.state.projects[0].tasks[0].status,'running');
 const restarted=new Store(roots[0],()=>{},{shared:a,deviceId:'device-0',loaded:s=>s});await restarted.init();await exchange();assert.equal(b.state().projects[0].tasks[0].status,'interrupted');
});

test('both devices rebuild matching SQLite databases after concurrent app record updates',async t=>{
 const {BoardsDatabase}=require('../electron/boards-db.cjs'),state=makeFixture();state.projects[0].artifacts=[{id:'db',kind:'database',title:'App records',data:{properties:[{id:'name',name:'Name',type:'title'},{id:'value',name:'Value',type:'number'}],rows:[{id:'row-a',cells:{name:'A',value:1}},{id:'row-b',cells:{name:'B',value:2}}],views:[{id:'view',type:'table'}]}}];const {folder,roots,engines:[a,b],exchange}=await setup(t,state);
 const stores=[a,b].map((engine,i)=>new Store(roots[i],()=>{},{shared:engine,deviceId:'device-'+i,loaded:s=>s}));await Promise.all(stores.map(s=>s.init()));const databases=stores.map((s,i)=>new BoardsDatabase(s,path.join(folder,'sqlite-'+i)));
 await databases[0].write('research-project',{op:'update',table:'db',rowId:'row-a',values:{value:10}});await databases[1].write('research-project',{op:'update',table:'db',rowId:'row-b',values:{value:20}});await Promise.all([a,b].map(e=>e.flushNow()));for(const [from,to]of [[roots[0],roots[1]],[roots[1],roots[0]]]){await fs.mkdir(path.join(to,'.research-sync','changes'),{recursive:true});for(const name of await fs.readdir(path.join(from,'.research-sync','changes')))if(name.endsWith('.change'))await fs.copyFile(path.join(from,'.research-sync','changes',name),path.join(to,'.research-sync','changes',name));}await Promise.all(stores.map(s=>s.refreshShared()));
 for(const db of databases)assert.deepEqual((await db.query('research-project','SELECT "Name","Value" FROM "App records" ORDER BY "Name"')).rows,[['A',10],['B',20]]);
});
test('overlapping saves on one device rebase onto the latest heads, while another device’s edits still count as concurrent',async t=>{
 const {engines:[a,b],exchange}=await setup(t);
 const stale=a.revision(),base=a.stateAt(stale),one=structuredClone(base);one.projects[0].notes[0].content='one';await a.commit(base,one,stale);
 const heads=a.rebaseHeads(stale);assert.deepEqual(heads,a.revision());
 const base2=a.stateAt(heads),two=structuredClone(base2);two.projects[0].notes[0].content='two';await a.commit(base2,two,heads);
 assert.equal(a.state().projects[0].notes[0].content,'two');assert.equal(a.conflicts().filter(c=>c.label.endsWith('/ content')).length,0);
 const mine=a.revision(),remote=b.state(),edited=structuredClone(remote);edited.projects[0].description='Remote description';await b.commit(remote,edited);await exchange();
 assert.deepEqual(a.rebaseHeads(mine),mine);
});

test('compacting folds the change log into a new baseline that another device adopts without losing edits',async t=>{
 const {roots,engines:[a,b],exchange}=await setup(t);
 for(const text of ['one','two','three']){const before=a.state(),after=structuredClone(before);after.projects[0].description=text;await a.commit(before,after);}
 await exchange();
 const pending=b.state(),edited=structuredClone(pending);edited.projects[0].notes[0].content='From B, not uploaded yet';await b.commit(pending,edited);
 assert.deepEqual(await a.compact({minFiles:1000}),{compacted:false,files:(await fs.readdir(path.join(roots[0],'.research-sync','changes'))).filter(n=>n.endsWith('.change')).length});
 const result=await a.compact();
 assert.equal(result.compacted,true);assert.ok(result.folded>=3);assert.equal(result.epoch,1);
 const from=path.join(roots[0],'.research-sync'),to=path.join(roots[1],'.research-sync'),changes=path.join(from,'changes');
 assert.equal((await fs.readdir(changes)).filter(n=>n.endsWith('.change')).length,result.kept);
 const marker=JSON.parse(await fs.readFile(path.join(from,'shared.json'),'utf8'));assert.deepEqual([marker.version,marker.epoch],[2,1]);
 assert.equal((await DriveSync.read(roots[0],await DriveSync.marker(roots[0]))).projects[0].description,'three');
 // Drive delivers the new baseline and marker to b and removes the folded change files.
 await fs.copyFile(path.join(from,marker.base),path.join(to,marker.base));await fs.copyFile(path.join(from,'shared.json'),path.join(to,'shared.json'));
 const kept=new Set(await fs.readdir(changes));for(const name of await fs.readdir(path.join(to,'changes')))if(!kept.has(name))await fs.unlink(path.join(to,'changes',name));
 await b.pull();
 assert.equal(b.state().projects[0].description,'three');assert.equal(b.state().projects[0].notes[0].content,'From B, not uploaded yet');
 await exchange();assert.deepEqual(a.state(),b.state());assert.equal(a.state().projects[0].notes[0].content,'From B, not uploaded yet');
 const after=a.state(),next=structuredClone(after);next.projects[0].description='after compaction';await a.commit(after,next);await exchange();assert.equal(b.state().projects[0].description,'after compaction');
});
test('compacted baselines are recognised, and a malformed marker is refused',async t=>{
 const {roots,engines:[a]}=await setup(t),file=path.join(roots[0],'.research-sync','shared.json'),original=JSON.parse(await fs.readFile(file,'utf8'));
 await a.commit(a.state(),(()=>{const s=structuredClone(a.state());s.projects[0].description='x';return s;})());await a.compact();
 assert.equal((await DriveSync.marker(roots[0])).version,2);
 await fs.writeFile(file,JSON.stringify({...original,version:2,epoch:1,base:'base-elsewhere.automerge'}));await assert.rejects(DriveSync.marker(roots[0]),/Unsupported shared editing format/);
 await fs.writeFile(file,JSON.stringify({...original,version:3}));await assert.rejects(DriveSync.marker(roots[0]),/Unsupported shared editing format/);
});
