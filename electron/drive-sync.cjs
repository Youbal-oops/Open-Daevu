const A=require('@automerge/automerge');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {randomUUID,createHash}=require('node:crypto');
const {replaceFile}=require('./fs-utils.cjs');
const hash=value=>createHash('sha256').update(value).digest('hex');
const clean=value=>JSON.parse(JSON.stringify(value));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
function visibleState(value){
  const projects=new Map(value.projects.map(p=>[p.id,p]));
  for(const project of projects.values()){
    if(project.parentId&&!projects.has(project.parentId))project.parentId=null;
    const visited=new Set();let cursor=project;
    while(cursor?.parentId){if(visited.has(cursor.id)){const first=[...visited].sort()[0];projects.get(first).parentId=null;break;}visited.add(cursor.id);cursor=projects.get(cursor.parentId);}
  }
  return value;
}
function members(values){
  const counts=new Map();return values.map(value=>{const stem=object(value)&&typeof value.id==='string'?'i:'+value.id:'v:'+hash(JSON.stringify(value));const n=counts.get(stem)||0;counts.set(stem,n+1);return [stem+(n?':'+n:''),value];});
}
// ID-addressed maps prevent stale whole-array UI drafts from replacing another device's rows.
// The separate order register can conflict without discarding the elements themselves.
function pack(value){
  if(typeof value==='string')return new A.RawString(value);
  if(Array.isArray(value)){const entries=members(value);return {t:'a',order:new A.RawString(JSON.stringify(entries.map(([key])=>key))),removed:{},v:Object.fromEntries(entries.map(([key,item])=>[key,pack(item)]))};}
  if(object(value))return {t:'o',v:Object.fromEntries(Object.entries(value).map(([key,item])=>['k:'+key,pack(item)]))};
  return value;
}
function unpack(value){
  if(value instanceof A.RawString)return String(value);
  if(!object(value))return value;
  if(value.t==='o')return Object.fromEntries(Object.entries(value.v).map(([key,item])=>[key.slice(2),unpack(item)]));
  if(value.t==='a'){
    const ordered=JSON.parse(String(value.order)),keys=[...new Set([...ordered,...Object.keys(value.v).sort()])];
    return keys.filter(key=>Object.hasOwn(value.v,key) && value.removed[key]!==true).map(key=>unpack(value.v[key]));
  }
  throw Error('Unsupported shared workspace data.');
}
function edit(parent,key,before,after){
  if(equal(before,after))return;
  const current=parent[key];
  if(object(before)&&object(after)&&current?.t==='o'){
    for(const field of new Set([...Object.keys(before),...Object.keys(after)])){
      const encoded='k:'+field;
      if(!Object.hasOwn(after,field))delete current.v[encoded];
      else if(!Object.hasOwn(before,field)||!Object.hasOwn(current.v,encoded))current.v[encoded]=pack(after[field]);
      else edit(current.v,encoded,before[field],after[field]);
    }
  }else if(Array.isArray(before)&&Array.isArray(after)&&current?.t==='a'){
    const old=new Map(members(before)),next=new Map(members(after));
    for(const item of old.keys())if(!next.has(item))current.removed[item]=true;
    for(const [item,value]of next){if(!old.has(item)||!Object.hasOwn(current.v,item)){current.v[item]=pack(value);current.removed[item]=false;}else edit(current.v,item,old.get(item),value);}
    if(!equal([...old.keys()],[...next.keys()]))current.order=new A.RawString(JSON.stringify([...next.keys()]));
  }else parent[key]=pack(after);
}
async function atomic(file,bytes){await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,bytes);try{await replaceFile(temp,file);}catch(e){await fs.unlink(temp).catch(()=>{});throw e;}}
class DriveSync {
  constructor(root,userData,marker,{deviceId,validate=()=>{}}={}){
    Object.assign(this,{root,userData,marker,deviceId,validate});this.directory=path.join(root,'.research-sync');this.cache=path.join(userData,'shared-cache',marker.id);this.outbox=path.join(this.cache,'outbox');this.seen=new Set();this.actor=randomUUID().replaceAll('-','');this.pending=0;this.error='';this.localHashes=new Set();this.needsScan=true;this.snapshotAt=0;this.snapshotDirty=false;
  }
  static async marker(root){
    try{const value=JSON.parse(await fs.readFile(path.join(root,'.research-sync','shared.json'),'utf8'));const baseOk=value.version===1?value.base===`base-${value.id}.automerge`:value.version===2&&Number.isInteger(value.epoch)&&value.epoch>=1&&value.base===`base-${value.id}-${value.epoch}.automerge`;if(![1,2].includes(value.version)||!/^[a-f0-9-]{36}$/.test(value.id)||!baseOk)throw Error('Unsupported shared editing format. Update Daevu on this device.');return value;}
    catch(e){if(e.code==='ENOENT')return null;throw e;}
  }
  static async enable(root,state,deviceId){
    const existing=await this.marker(root);if(existing)return existing;
    const marker={version:1,id:randomUUID(),schedulerDeviceId:deviceId,createdAt:new Date().toISOString(),deviceName:os.hostname()};marker.base=`base-${marker.id}.automerge`;
    const doc=A.from({workspace:new A.RawString(marker.id),model:pack(clean(state)),archives:{},resolved:{}});
    const directory=path.join(root,'.research-sync');await fs.mkdir(directory,{recursive:true});
    await atomic(path.join(directory,marker.base),A.save(doc));
    // The marker is the completion indicator, published after the immutable baseline exists.
    await fs.writeFile(path.join(directory,'shared.json'),JSON.stringify(marker),{flag:'wx'});
    return marker;
  }
  static async read(root,marker){
    const directory=path.join(root,'.research-sync');let doc=A.load(await fs.readFile(path.join(directory,marker.base)));
    let names=[];try{names=await fs.readdir(path.join(directory,'changes'));}catch(e){if(e.code!=='ENOENT')throw e;}
    for(const name of names.filter(n=>/^[a-f0-9]{64}\.change$/.test(n)).sort()){
      const bytes=await fs.readFile(path.join(directory,'changes',name));if(hash(bytes)!==name.slice(0,-7))throw Error('A shared change is incomplete. Wait for Drive to finish syncing.');doc=A.applyChanges(doc,[bytes])[0];
    }
    if(String(doc.workspace)!==marker.id||A.getMissingDeps(doc).length)throw Error('Shared changes are still arriving. Wait for Drive to finish syncing.');
    return unpack(doc.model);
  }
  async load(){
    const base=await fs.readFile(path.join(this.directory,this.marker.base));
    try{this.doc=A.load(await fs.readFile(path.join(this.cache,'snapshot.automerge')),{actor:this.actor});if(String(this.doc.workspace)!==this.marker.id)throw Error();}
    catch{this.doc=A.load(base,{actor:this.actor});}
    if(String(this.doc.workspace)!==this.marker.id)throw Error('The shared workspace baseline does not match its marker.');
    await fs.mkdir(this.outbox,{recursive:true});
    // Files whose changes the loaded document already contains need not be read and verified again.
    try{for(const bytes of A.getAllChanges(this.doc))this.seen.add(hash(bytes)+'.change');}catch{}
    await this.pull();return this.state();
  }
  state(){const value=visibleState(unpack(this.doc.model));this.validate(value);return value;}
  stateAt(heads){const value=visibleState(unpack(A.view(this.doc,heads).model));this.validate(value);return value;}
  revision(){return A.getHeads(this.doc);}
  // A save based on heads that only differ from the current document by this device's own earlier changes is rebased onto the
  // current heads. Otherwise two overlapping autosaves of one note would conflict, and the older text could win by chance.
  rebaseHeads(heads){
    const wanted=Array.isArray(heads)?heads:String(heads||'').split(',').filter(Boolean),current=this.revision();
    if(!wanted.length||[...wanted].sort().join(',')===[...current].sort().join(','))return wanted.length?wanted:current;
    try{const delta=A.getChanges(A.view(this.doc,wanted),this.doc);if(delta.length&&delta.every(bytes=>this.localHashes.has(hash(bytes))))return current;}catch{}
    return wanted;
  }
  heads(){return A.getHeads(this.doc).sort().join(',');}
  async pull(){
    this.error='';
    try{
      await this.adoptMarker();
      // Local outbox records survive a crash between saving an edit and updating the cache.
      const read=async folder=>{let names;try{names=await fs.readdir(folder);}catch(e){if(e.code==='ENOENT')return;throw e;}
        for(const name of names.filter(n=>/^[a-f0-9]{64}\.change$/.test(n)).sort()){
          if(this.seen.has(name))continue;const bytes=await fs.readFile(path.join(folder,name));
          if(bytes.length>50*1024*1024||hash(bytes)!==name.slice(0,-7))throw Error('A shared change is incomplete or corrupt. Keep the change files for recovery.');
          this.doc=A.applyChanges(this.doc,[bytes])[0];this.seen.add(name);applied++;if(!this.localHashes.has(name.slice(0,-7)))this.needsScan=true;
        }
      };
      let applied=0;
      await read(this.outbox);await read(path.join(this.directory,'changes'));
      this.state();await this.archiveCurrent();
      if(applied||!this.snapshotAt||(this.snapshotDirty&&Date.now()-this.snapshotAt>20000)){await atomic(path.join(this.cache,'snapshot.automerge'),A.save(this.doc));this.snapshotAt=Date.now();this.snapshotDirty=false;}
      await this.flush();this.lastMergedAt=new Date().toISOString();
    }catch(e){this.error=e.message;}
    return this.state();
  }
  // Another device compacted the change log into a new baseline: rebuild from it, then re-apply what is still in the outbox or the change folder.
  async adoptMarker(){
    const current=await DriveSync.marker(this.root);
    if(!current||(current.epoch||0)===(this.marker.epoch||0))return;
    const doc=A.load(await fs.readFile(path.join(this.directory,current.base)),{actor:this.actor});
    if(String(doc.workspace)!==current.id)throw Error('The compacted baseline does not match its marker.');
    this.marker=current;this.doc=doc;this.seen=new Set();
    for(const bytes of A.getAllChanges(doc))this.seen.add(hash(bytes)+'.change');
    this.needsScan=true;this.snapshotAt=0;
  }
  // Folds the whole change log into a new baseline. Only change files whose change is inside the baseline are removed, so a change
  // another device uploaded a moment ago is never lost. The removed files are kept in this device's cache folder.
  async compact({minFiles=0}={}){
    await this.flushNow();await this.pull();
    if(this.error)throw Error('Finish syncing before compacting: '+this.error);
    if(A.getMissingDeps(this.doc).length)throw Error('Shared changes are still arriving. Try again once Drive has finished syncing.');
    const changes=path.join(this.directory,'changes');let names=[];
    try{names=(await fs.readdir(changes)).filter(n=>/^[a-f0-9]{64}\.change$/.test(n));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(names.length<minFiles||!names.length)return {compacted:false,files:names.length};
    const have=new Set(A.getAllChanges(this.doc).map(bytes=>A.decodeChange(bytes).hash)),bytes=A.save(this.doc);
    if([...A.getHeads(A.load(bytes))].sort().join(',')!==this.heads())throw Error('The compacted copy did not match the live document, so nothing was changed.');
    const epoch=(this.marker.epoch||0)+1,base=`base-${this.marker.id}-${epoch}.automerge`,archive=path.join(this.cache,'archive-'+epoch),previous=this.marker.base;
    await fs.mkdir(archive,{recursive:true});
    await atomic(path.join(this.directory,base),bytes);
    const folded=[];
    for(const name of names){let data;try{data=await fs.readFile(path.join(changes,name));}catch{continue;}if(have.has(A.decodeChange(data).hash))folded.push([name,data]);}
    const marker={...this.marker,version:2,epoch,base,compactedAt:new Date().toISOString(),compactedBy:os.hostname()};
    await atomic(path.join(this.directory,'shared.json'),Buffer.from(JSON.stringify(marker)));
    this.marker=marker;
    for(const [name,data] of folded){await fs.writeFile(path.join(archive,name),data);await fs.unlink(path.join(changes,name)).catch(()=>{});}
    try{await fs.copyFile(path.join(this.directory,previous),path.join(archive,previous));await fs.unlink(path.join(this.directory,previous));}catch{}
    return {compacted:true,folded:folded.length,kept:names.length-folded.length,bytes:bytes.length,epoch};
  }
  async flush(){
    const names=(await fs.readdir(this.outbox)).filter(n=>/^[a-f0-9]{64}\.change$/.test(n));this.pending=names.length;
    try{
      await fs.access(path.join(this.directory,'shared.json'));const destination=path.join(this.directory,'changes');await fs.mkdir(destination,{recursive:true});
      for(const name of names){const file=path.join(this.outbox,name),bytes=await fs.readFile(file);await atomic(path.join(destination,name),bytes);await fs.unlink(file);this.seen.add(name);this.pending--;}
    }catch(e){this.error='Changes are saved on this PC and waiting for the Drive folder: '+e.message;}
  }
  async persist(next,base=this.doc){
    const changes=A.getChanges(base,next);
    for(const bytes of changes){this.localHashes.add(hash(bytes));await atomic(path.join(this.outbox,hash(bytes)+'.change'),bytes);}
    this.doc=A.applyChanges(this.doc,changes)[0];
    // The outbox and Drive hold the changes themselves, so the cache snapshot only needs refreshing now and then.
    if(Date.now()-this.snapshotAt>20000){try{await atomic(path.join(this.cache,'snapshot.automerge'),A.save(this.doc));this.snapshotAt=Date.now();this.snapshotDirty=false;}catch(e){this.error='The local change log is saved; its cache needs retrying: '+e.message;}}else this.snapshotDirty=true;
    this.pending+=changes.length;this.scheduleFlush();return this.state();
  }
  // Edits are kept on this PC at once and copied into the Drive folder after a pause, when the window is left, and on quit.
  scheduleFlush(){clearTimeout(this.flushTimer);this.flushTimer=setTimeout(()=>this.flush().catch(()=>{}),20000);this.flushTimer.unref?.();}
  flushNow(){clearTimeout(this.flushTimer);return this.flush();}
  async commit(before,after,heads=this.revision()){
    // The change is based on what the editor saw, not on unobserved incoming edits.
    // Otherwise a background refresh would falsely resolve a real concurrent conflict.
    if(equal(before,after))return this.state();await this.archiveCurrent();
    const base=A.view(this.doc,heads),fork=A.clone(base,{actor:randomUUID().replaceAll('-','')});
    const next=A.change(fork,{message:os.hostname()},draft=>edit(draft,'model',clean(before),clean(after)));
    return this.persist(next,base);
  }
  rawConflicts(){
    const names=new Map();const state=this.state();for(const agent of state.agents || [])names.set(agent.id,agent.name);
    for(const project of state.projects){names.set(project.id,project.name);for(const item of [...project.notes,...(project.artifacts || [])]){names.set(item.id,item.title);if(item.kind==='database'){const title=item.data.properties.find(p=>p.type==='title');for(const p of item.data.properties)names.set(p.id,p.name);for(const [index,row]of item.data.rows.entries())names.set(row.id,String(row.cells[title?.id] || 'Row '+(index+1)));}}}
    const records=[];const visit=(node,route,label)=>{
      if(!object(node)||node instanceof A.RawString)return;
      if(node.t==='o'||node.t==='a')for(const key of Object.keys(node.v)){
        const raw=key.startsWith('k:')||key.startsWith('i:')?key.slice(2):'item';const variants=A.getConflicts(node.v,key),nextRoute=[...route,'v',key],nextLabel=[...label,names.get(raw) || raw];
        if(key!=='k:updatedAt' && variants && Object.keys(variants).length>1){const id=hash(JSON.stringify([nextRoute,Object.keys(variants).sort()]));records.push({id,route:nextRoute,label:nextLabel.join(' / '),variants});}
        if(node.t==='a' && node.removed[key]===true){const id=hash(JSON.stringify([route,key,'deleted']));records.push({id,route,label:nextLabel.join(' / ')+' (deleted)',deletedKey:key,variants:{restore:node.v[key]}});}
        visit(node.v[key],nextRoute,nextLabel);
      }
    };visit(this.doc.model,['model'],[]);return records;
  }
  async archiveCurrent(){
    if(!this.needsScan)return;this.needsScan=false;
    const records=this.rawConflicts().filter(r=>!r.deletedKey&&!this.doc.archives[r.id]&&!this.doc.resolved[r.id]);if(!records.length)return;
    const fork=A.clone(this.doc,{actor:randomUUID().replaceAll('-','')});const next=A.change(fork,{message:'Preserve concurrent versions'},draft=>{for(const r of records)draft.archives[r.id]=pack({id:r.id,route:r.route,label:r.label,variants:Object.fromEntries(Object.entries(r.variants).map(([id,value])=>[id,unpack(value)]))});});await this.persist(next);
  }
  conflicts(){
    const records=new Map(this.rawConflicts().filter(r=>!this.doc.resolved[r.id]).map(r=>[r.id,r]));
    for(const [id,value]of Object.entries(this.doc.archives || {}))if(!this.doc.resolved[id])records.set(id,{...unpack(value),plain:true});
    this.conflictMap=records;return [...records.values()].map(({id,label,variants,deletedKey})=>({id,label,deleted:Boolean(deletedKey),versions:Object.keys(variants).length}));
  }
  conflict(id){this.conflicts();const record=this.conflictMap.get(id);if(!record)throw Error('This conflict has already changed or been resolved.');return {id,label:record.label,versions:Object.entries(record.variants).map(([version,value])=>({version,value:record.plain?value:unpack(value)}))};}
  async resolve(id,version){
    await this.pull();this.conflicts();const record=this.conflictMap.get(id);if(!record||!Object.hasOwn(record.variants,version))throw Error('This conflict changed. Review it again.');
    const value=record.plain?record.variants[version]:unpack(record.variants[version]),fork=A.clone(this.doc,{actor:randomUUID().replaceAll('-','')});
    const next=A.change(fork,{message:'Resolve shared editing conflict'},draft=>{let parent=draft;if(record.deletedKey){for(const key of record.route)parent=parent[key];parent.removed[record.deletedKey]=false;}else{for(const key of record.route.slice(0,-1))parent=parent[key];parent[record.route.at(-1)]=pack(value);draft.resolved[id]=true;}});
    return this.persist(next);
  }
  status(){const records=this.doc?this.conflicts():[];return {sharedEditing:true,pendingUploads:this.pending,syncProblem:this.error,lastMergedAt:this.lastMergedAt || '',conflicts:records.filter(r=>!r.deleted).length,deletedItems:records.filter(r=>r.deleted).length,missingChanges:this.doc?A.getMissingDeps(this.doc).length:0};}
}
module.exports={DriveSync,pack,unpack,edit};
