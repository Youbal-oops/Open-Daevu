const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs/promises'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {fork}=require('node:child_process');
const q=value=>'"'+String(value).replaceAll('"','""')+'"';
const hash=value=>createHash('sha256').update(value).digest('hex');
function unique(name,used,suffix){let next=String(name || 'Untitled');if(used.has(next.toLowerCase()) || next.toLowerCase().startsWith('sqlite_') || next.toLowerCase().startsWith('_rw_'))next+='_'+suffix;while(used.has(next.toLowerCase()))next+='_';used.add(next.toLowerCase());return next;}
function schemaFor(project){
 const used=new Set();return (project.artifacts || []).filter(a=>a.kind==='database').map(a=>{
  const names=new Set(['_id']);return {id:a.id,title:a.title,table:'_rw_'+hash(a.id).slice(0,20),sqlName:unique(a.title,used,hash(a.id).slice(0,6)),ownerAppId:a.data.ownerAppId || null,allowAppWrites:a.data.allowAppWrites!==false,columns:a.data.properties.map(p=>({...p,sqlName:unique(p.name,names,hash(p.id).slice(0,6))}))};
 });
}
function queryProcess(file,sql,params,spawnChild,timeout=4000){return new Promise((resolve,reject)=>{
 const child=spawnChild?spawnChild(path.join(__dirname,'boards-query.cjs')):fork(path.join(__dirname,'boards-query.cjs'),[],{stdio:['ignore','ignore','ignore','ipc']});let ended=false;
 const finish=(error,value)=>{if(ended)return;ended=true;clearTimeout(timer);child.kill();error?reject(error):resolve(value);};
 const timer=setTimeout(()=>finish(Error('Query exceeded the 4-second time limit. Narrow the query.')),timeout);
 child.on('error',e=>finish(e));child.on('exit',()=>{if(!ended)finish(Error('The database query process closed unexpectedly.'));});
 child.on('message',m=>m.ok?finish(null,m.value):finish(Error(m.error || 'Database query failed.')));
 const message={file,sql,params};if(child.postMessage)child.postMessage(message);else child.send(message);
});}
class BoardsDatabase {
 constructor(store,directory,{spawnChild,timeout}={}){Object.assign(this,{store,directory,spawnChild,timeout});this.queue=Promise.resolve();this.signatures=new Map();}
 serial(fn){const pending=this.queue.then(fn);this.queue=pending.catch(()=>{});return pending;}
 project(id){const p=this.store.state.projects.find(p=>p.id===id);if(!p)throw Error('Unknown project.');return p;}
 async ensure(projectId){
  const project=this.project(projectId),schema=schemaFor(project),signature=hash(JSON.stringify((project.artifacts || []).filter(a=>a.kind==='database').map(a=>[a.id,a.title,a.data]))),file=path.join(this.directory,hash(projectId)+'.sqlite');
  if(this.signatures.get(projectId)===signature)return {file,schema};await fs.mkdir(this.directory,{recursive:true});
  let db;try{
   db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=DELETE; BEGIN IMMEDIATE');
   const old=db.prepare("SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
   for(const item of old.filter(x=>x.type==='view'))db.exec('DROP VIEW '+q(item.name));for(const item of old.filter(x=>x.type==='table'))db.exec('DROP TABLE '+q(item.name));
   db.exec('CREATE TABLE _rw_schema (id TEXT PRIMARY KEY, definition TEXT NOT NULL) STRICT');
   for(const table of schema){
    const artifact=project.artifacts.find(a=>a.id===table.id);
    const columns=table.columns.map(c=>q(c.sqlName)+' '+(c.type==='number'?'REAL':c.type==='checkbox'?'INTEGER':'TEXT'));
    db.exec('CREATE TABLE '+q(table.table)+' (_id TEXT PRIMARY KEY NOT NULL'+(columns.length?', '+columns.join(', '):'')+')');
    const insert=db.prepare('INSERT INTO '+q(table.table)+' VALUES ('+Array(table.columns.length+1).fill('?').join(',')+')');
    for(const row of artifact.data.rows)insert.run(row.id,...table.columns.map(c=>{const v=row.cells[c.id];if(v==null || v==='')return null;if(c.type==='checkbox')return v?1:0;if(typeof v==='number')return Number.isFinite(v)?v:null;if(typeof v==='object')return JSON.stringify(v);return String(v);}));
    for(const c of table.columns.filter(c=>['number','select','date'].includes(c.type)))db.exec('CREATE INDEX '+q('_rw_idx_'+hash(table.id+c.id).slice(0,24))+' ON '+q(table.table)+' ('+q(c.sqlName)+')');
    db.exec('CREATE VIEW '+q(table.sqlName)+' AS SELECT * FROM '+q(table.table));db.prepare('INSERT INTO _rw_schema VALUES (?,?)').run(table.id,JSON.stringify(table));
   }
   db.exec('COMMIT');this.signatures.set(projectId,signature);
  }catch(e){try{db?.exec('ROLLBACK');}catch{}throw Error('Could not prepare the Boards database: '+e.message);}finally{db?.close();}
  return {file,schema};
 }
 schema(projectId,{appId}={}){return this.serial(async()=>{const {schema}=await this.ensure(projectId);return {engine:'SQLite',...(appId?{appId}:{}),tables:schema};});}
 refresh(){return this.serial(async()=>{for(const project of this.store.state.projects)if((project.artifacts || []).some(a=>a.kind==='database'))await this.ensure(project.id);});}
 async create(projectId,name,properties,{appId}={}){
  if(!Array.isArray(properties)||new Set(properties.map(p=>p?.id)).size!==properties.length)throw Error('Use unique property IDs.');
  const {applyMutation}=require('../shared/domain.mjs');const record={id:randomUUID(),title:String(name || '').trim(),kind:'database',createdAt:new Date().toISOString(),data:{properties,rows:[],views:[{id:randomUUID(),type:'table'}],...(appId?{ownerAppId:appId,allowAppWrites:true}:{})}};
  if(!record.title || record.title.length>160)throw Error('Name the database using up to 160 characters.');
  await this.store.update(state=>{
   const project=state.projects.find(p=>p.id===projectId);if(!project)throw Error('Unknown project.');
   if(appId && !(project.artifacts || []).some(a=>a.id===appId&&a.kind==='html'))throw Error('This app no longer exists.');
   if((project.artifacts || []).filter(a=>a.kind==='database').length>=100)throw Error('A project can contain up to 100 databases.');
   if((project.artifacts || []).some(a=>a.kind==='database' && a.title===record.title && (a.data.ownerAppId || '')===(appId || '')))throw Error('That database already exists. Use its table ID.');
   return applyMutation(state,{type:'artifact',projectId,value:record});
  });await this.schema(projectId);return {id:record.id,name:record.title};
 }
 async manage(projectId,request){
  const {applyMutation}=require('../shared/domain.mjs');
  await this.store.update(state=>{
   const project=state.projects.find(p=>p.id===projectId),table=project?.artifacts?.find(a=>a.kind==='database'&&(a.id===request.table || a.title===request.table));if(!table)throw Error('Choose a database in this project.');
   if(request.op==='drop')return applyMutation(state,{type:'artifact:delete',projectId,value:table.id});
   if(request.op!=='alter')throw Error('Choose alter or drop.');
   if(request.name)table.title=request.name;
   if(request.properties){if(!Array.isArray(request.properties)||new Set(request.properties.map(p=>p.id)).size!==request.properties.length)throw Error('Use unique property IDs.');table.data.properties=request.properties;const keys=new Set(request.properties.map(p=>p.id));for(const row of table.data.rows)for(const key of Object.keys(row.cells))if(!keys.has(key))delete row.cells[key];}
   return applyMutation(state,{type:'artifact',projectId,value:table});
  });return this.schema(projectId);
 }
 query(projectId,sql,params=[]){return this.serial(async()=>{
  if(typeof sql!=='string'||!sql.trim()||sql.length>20000)throw Error('Enter a query under 20,000 characters.');
  if(!Array.isArray(params)||params.length>100||params.some(v=>v!==null && !['string','number'].includes(typeof v)))throw Error('Use up to 100 text, number, or null query parameters.');
  await this.store.queue;const {file}=await this.ensure(projectId);return queryProcess(file,sql,params,this.spawnChild,this.timeout);
 });}
 export(projectId,destination){return this.serial(async()=>{await this.store.queue;const {file}=await this.ensure(projectId);await fs.copyFile(file,destination);return destination;});}
 async write(projectId,request,{appId}={}){
  if(!request || !['insert','update','delete'].includes(request.op))throw Error('Choose insert, update, or delete.');
  let result;await this.store.update(state=>{
   const project=state.projects.find(p=>p.id===projectId);if(!project)throw Error('Unknown project.');
   const table=(project.artifacts || []).find(a=>a.kind==='database'&&(a.id===request.table || a.title===request.table));if(!table)throw Error('Choose a Boards database by ID or exact name.');
   if(appId && (!(project.artifacts || []).some(a=>a.id===appId && a.kind==='html') || table.data.allowAppWrites===false))throw Error('Allow app row edits on this database before an app can change it.');
   const row=table.data.rows.find(r=>r.id===request.rowId);
   if(request.op!=='insert' && !row)throw Error('The database row no longer exists.');
   if(request.op==='delete'){table.data.rows=table.data.rows.filter(r=>r.id!==request.rowId);result={id:request.rowId,deleted:true};}
   else{
    const values=request.values;if(!values||typeof values!=='object'||Array.isArray(values)||JSON.stringify(values).length>200000)throw Error('Provide row values under 200 KB.');const cells={};
    for(const [key,value]of Object.entries(values)){
     const props=table.data.properties.filter(p=>p.id===key||p.name===key);if(props.length!==1)throw Error('Unknown or ambiguous property: '+key);const p=props[0];
     if(value!==null && value!=='' && (p.type==='number'?typeof value!=='number'||!Number.isFinite(value):p.type==='checkbox'?typeof value!=='boolean':typeof value!=='string'))throw Error('Invalid value for '+p.name);
     if(p.type==='select'&&value && !p.options.includes(value))throw Error('Choose an existing option for '+p.name);
     if(p.type==='date'&&value && (!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw Error('Use YYYY-MM-DD for '+p.name);cells[p.id]=value;
    }
    if(request.op==='insert'){if(table.data.rows.length>=2000)throw Error('A database can hold up to 2,000 rows.');const next={id:randomUUID(),cells};table.data.rows.push(next);result=next;}
    else{Object.assign(row.cells,cells);result=row;}
   }
   table.updatedAt=new Date().toISOString();return state;
  });
  await this.schema(projectId);return structuredClone(result);
 }
}
module.exports={BoardsDatabase,schemaFor,queryProcess};
