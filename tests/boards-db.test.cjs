const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {BoardsDatabase}=require('../electron/boards-db.cjs');const {Store}=require('../electron/store.cjs');const {makeFixture}=require('./fixture.cjs');
async function setup(t,options={}){
 const parent=path.resolve(__dirname,'../.test-data');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'sqlite-'));t.after(()=>{assert.equal(path.dirname(root),parent);return fs.rm(root,{recursive:true,force:true});});
 const state=makeFixture();state.projects[0].artifacts=[{id:'app',title:'Contacts app',kind:'html',data:{html:'<p>App</p>'}},{id:'other-app',title:'Other app',kind:'html',data:{html:'<p>Other</p>'}},{id:'leads',title:'Leads',kind:'database',data:{properties:[{id:'name',name:'Name',type:'title'},{id:'value',name:'Value',type:'number'},{id:'active',name:'Active',type:'checkbox'}],rows:[{id:'r1',cells:{name:"O'Brien",value:10,active:true}},{id:'r2',cells:{name:'Second',value:20,active:false}}],views:[{id:'view',type:'table'}]}}];
 state.projects.push({...structuredClone(state.projects[0]),id:'second',name:'Second',artifacts:[]});await fs.writeFile(path.join(root,'workspace.json'),JSON.stringify(state));const store=new Store(root);await store.init();return {root,store,db:new BoardsDatabase(store,path.join(root,'local-database'),options)};
}
test('Boards creates real SQLite tables, indexes, parameterized queries and portable exports',async t=>{
 const {root,db}=await setup(t),schema=await db.schema('research-project');assert.equal(schema.engine,'SQLite');assert.equal(schema.tables[0].sqlName,'Leads');
 const total=await db.query('research-project','SELECT SUM("Value") AS total FROM "Leads"');assert.deepEqual(total.rows,[[30]]);
 assert.deepEqual((await db.query('research-project','SELECT "Name","Active" FROM "Leads" WHERE "Name" = ?',["O'Brien"])).rows,[["O'Brien",1]]);
 const exported=path.join(root,'export.sqlite');await db.export('research-project',exported);assert.equal((await fs.readFile(exported)).subarray(0,16).toString(),'SQLite format 3\0');const connection=new DatabaseSync(exported,{readOnly:true});assert.equal(connection.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='index'").get().n>=2,true);connection.close();
});
test('SQLite queries cannot change schema, write data, attach files, or escape project scope',async t=>{
 const {db}=await setup(t);for(const sql of ['DELETE FROM "Leads"','DROP TABLE "Leads"',"ATTACH DATABASE ':memory:' AS outside",'PRAGMA writable_schema=ON',"SELECT load_extension('other')",'SELECT * FROM _rw_schema'])await assert.rejects(db.query('research-project',sql));
 await assert.rejects(db.query('research-project','SELECT 1; SELECT 2;'),/one SQL statement/);assert.deepEqual((await db.query('research-project',"SELECT ';' AS punctuation; -- comment")).rows,[[';']]);
 await assert.rejects(db.query('second','SELECT * FROM "Leads"'),/no such table/);assert.deepEqual((await db.query('research-project','SELECT count(*) FROM "Leads"')).rows,[[2]]);
});
test('all project apps access tables automatically while explicit permission revocation is enforced',async t=>{
 const {store,db}=await setup(t),table=await db.create('research-project','Contacts',[{id:'name',name:'Name',type:'title'},{id:'score',name:'Score',type:'number'}],{appId:'app'});
 const row=await db.write('research-project',{op:'insert',table:table.id,values:{Name:'Ada',Score:4}},{appId:'app'});await db.write('research-project',{op:'update',table:table.id,rowId:row.id,values:{score:7}},{appId:'app'});
 assert.deepEqual((await db.query('research-project','SELECT "Name","Score" FROM "Contacts"')).rows,[['Ada',7]]);assert.equal(store.state.projects[0].artifacts.find(a=>a.id===table.id).data.rows[0].cells.score,7);
 await db.write('research-project',{op:'update',table:table.id,rowId:row.id,values:{score:9}},{appId:'other-app'});assert.deepEqual((await db.query('research-project','SELECT \"Score\" FROM \"Contacts\"')).rows,[[9]]);
 const artifact=structuredClone(store.state.projects[0].artifacts.find(a=>a.id===table.id));artifact.data.allowAppWrites=false;await store.mutate({type:'artifact',projectId:'research-project',value:artifact});await assert.rejects(db.write('research-project',{op:'delete',table:table.id,rowId:row.id},{appId:'app'}),/Allow app row edits/);
 await db.write('research-project',{op:'delete',table:table.id,rowId:row.id});assert.deepEqual((await db.query('research-project','SELECT * FROM "Contacts"')).rows,[]);
});
test('database edits validate values and preserve records after app and store restart',async t=>{
 const {root,store,db}=await setup(t);await assert.rejects(db.write('research-project',{op:'update',table:'leads',rowId:'r1',values:{value:'not a number'}}),/Invalid value/);
 await assert.rejects(db.write('research-project',{op:'insert',table:'leads',values:{unknown:'value'}}),/Unknown/);await db.write('research-project',{op:'update',table:'leads',rowId:'r1',values:{value:42}});
 const reopened=new Store(root);await reopened.init();const next=new BoardsDatabase(reopened,path.join(root,'local-database'));assert.deepEqual((await next.query('research-project','SELECT "Value" FROM "Leads" WHERE _id=?',['r1'])).rows,[[42]]);assert.equal(store.state.projects[0].artifacts[2].data.rows.length,2);
});
test('renames, duplicate names, reserved identifiers and SQL quoting retain distinct tables and columns',async t=>{
 const {store,db}=await setup(t);await db.create('research-project','A "quoted" table',[{id:'name',name:'Name',type:'title'},{id:'other',name:'Name',type:'text'},{id:'reserved',name:'_id',type:'text'}]);const schema=await db.schema('research-project');const table=schema.tables.find(t=>t.title.includes('quoted'));assert.equal(new Set(table.columns.map(c=>c.sqlName.toLowerCase())).size,3);
 const artifact=structuredClone(store.state.projects[0].artifacts[2]);artifact.title='Renamed';await store.mutate({type:'artifact',projectId:'research-project',value:artifact});await assert.rejects(db.query('research-project','SELECT * FROM "Leads"'),/no such table/);assert.equal((await db.query('research-project','SELECT * FROM "Renamed"')).rows.length,2);
});
test('long-running SQL is killed and the next query still works',async t=>{
 const {db}=await setup(t,{timeout:600});await assert.rejects(db.query('research-project','WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n) SELECT SUM(x) FROM n'),/time limit/);assert.deepEqual((await db.query('research-project','SELECT 1')).rows,[[1]]);
});
test('queries return duplicate column names without losing data and cap large results',async t=>{
 const {db}=await setup(t);assert.deepEqual((await db.query('research-project','SELECT 1 AS same,2 AS same')).rows,[[1,2]]);
 const result=await db.query('research-project','WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<2000) SELECT x FROM n');assert.equal(result.rows.length,1000);assert.equal(result.truncated,true);
});

test('saving an older Boards editor preserves app-created rows and updates to other cells',async t=>{
 const {db,store}=await setup(t),old=structuredClone(store.state.projects[0].artifacts.find(a=>a.id==='leads'));
 await db.write('research-project',{op:'insert',table:'leads',values:{name:'New app record',value:99}});await db.write('research-project',{op:'update',table:'leads',rowId:'r1',values:{value:42}});
 const value={...old,_rwDatabaseBase:structuredClone(old.data),data:{...old.data,allowAppWrites:false,rows:old.data.rows.map(r=>r.id==='r2'?{...r,cells:{...r.cells,name:'Edited in Boards'}}:r)}};
 await store.mutate({type:'artifact',projectId:'research-project',value});const current=store.state.projects[0].artifacts.find(a=>a.id==='leads');assert.equal(current.data.rows.length,3);assert.equal(current.data.rows.find(r=>r.id==='r1').cells.value,42);assert.equal(current.data.rows.find(r=>r.id==='r2').cells.name,'Edited in Boards');assert.equal(current.data.allowAppWrites,false);assert.equal(current._rwDatabaseBase,undefined);
});
