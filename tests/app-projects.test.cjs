const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {AppProjects}=require('../electron/app-projects.cjs'),{buildApp}=require('../electron/app-builder.cjs'),{projectToolServer}=require('../electron/project-tool-server.cjs');
const {Store}=require('../electron/store.cjs'),{makeFixture}=require('./fixture.cjs');
async function setup(t){const parent=path.resolve(__dirname,'../.test-data');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'apps-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const state=makeFixture();state.projects.push({...structuredClone(state.projects[0]),id:'other',artifacts:[]});await fs.writeFile(path.join(root,'workspace.json'),JSON.stringify(state));const store=new Store(root);await store.init();return {root,store,apps:new AppProjects(store)};}
const files={'index.html':'<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><output id="answer"></output><script type="module" src="src/main.ts"></script></body></html>','styles.css':'body { color: red; }','src/main.ts':'import { answer } from "./answer.js"; document.querySelector("#answer").textContent = String(answer);','src/answer.js':'export const answer = 42;'};
test('app compiler bundles relative modules, TypeScript, imported CSS, JSON and local assets',async()=>{
 const output=await buildApp({...files,'assets/pixel.png':'data:image/png;base64,aGVsbG8=','index.html':files['index.html'].replace('<output','<img src="assets/pixel.png"><output')});assert.match(output.html,/42/);assert.match(output.html,/color:red/);assert.match(output.html,/data:image\/png/);assert.doesNotMatch(output.html,/src="src\/main/);
 const json=await buildApp({'index.html':'<script type="module" src="main.js"></script>','main.js':'import value from "./data.json"; import "./style.css"; console.log(value);','data.json':'{"answer":42}','style.css':'body{background:blue}'});assert.match(json.html,/answer:42/);assert.match(json.html,/background:#00f/);
});
test('compiler includes installed 3D and game libraries without CDNs',async()=>{
 for(const lib of ['three','phaser']){const result=await buildApp({'index.html':'<script type="module" src="main.js"></script>','main.js':lib==='three'?'import {Vector3} from "three"; console.log(new Vector3(1,2,3));':'import Phaser from "phaser"; console.log(Phaser.VERSION);'});assert.ok(result.html.length>1000);assert.equal(result.warnings.length,0);}
});
test('compiler rejects host file imports, unknown packages, missing files and invalid source',async()=>{
 for(const source of ['import "../../electron/accounts.cjs"','import "node:fs"','import "unknown-package"','import "/secret.js"','import "three/../../electron/accounts.cjs"','import "./missing.js"','const = nope'])await assert.rejects(buildApp({'index.html':'<script type="module" src="main.js"></script>','main.js':source}));
 await assert.rejects(buildApp({'index.html':'<script src="https://evil.invalid/a.js"></script>'}));
});
test('legacy classic scripts preserve globals and HTML strings without misidentifying attributes',async()=>{
 const result=await buildApp({'index.html':'<button onclick="answer()">Go</button><script>function answer(){document.body.innerHTML=\'<img src="a.png">\';}</script>'});assert.match(result.html,/function answer\(\)/);assert.match(result.html,/onclick="answer\(\)"/);
});
test('apps edit incremental drafts, reject stale patches and publish restart-safe versions',async t=>{
 const {root,store,apps}=await setup(t),created=await apps.create('research-project','Map explorer');
 for(const [file,content]of Object.entries(files))await apps.edit('research-project',created.id,{op:'write',file,content});
 await apps.publish('research-project',created.id);const original=await apps.build('research-project',created.id);
 const read=apps.read('research-project',created.id,'src/answer.js');await apps.edit('research-project',created.id,{op:'patch',file:read.file,search:'42',content:'99',revision:read.revision});
 await assert.rejects(apps.edit('research-project',created.id,{op:'write',file:'src/answer.js',content:'wrong',revision:read.revision}),/changed/);
 assert.equal((await apps.build('research-project',created.id)).html,original.html);assert.match((await apps.build('research-project',created.id,{draft:true})).html,/99/);
 const reloaded=new Store(root);await reloaded.init();const reopened=new AppProjects(reloaded);assert.match(reopened.read('research-project',created.id,'src/answer.js').content,/99/);assert.equal((await reopened.build('research-project',created.id)).html,original.html);
 const old=apps.app('research-project',created.id).data.published.id;await apps.publish('research-project',created.id);await apps.edit('research-project',created.id,{op:'restore',version:old});assert.match(apps.read('research-project',created.id,'src/answer.js').content,/42/);
 assert.equal(await fs.readFile(path.join(root,'projects/research-project/apps',created.id,'src/answer.js'),'utf8'),'export const answer = 42;');assert.ok(store.state.projects[0].artifacts.length);
});
test('app file limits, traversal, project isolation, and failed publish leave saved version intact',async t=>{
 const {apps}=await setup(t),created=await apps.create('research-project','Safe app');await apps.publish('research-project',created.id);const before=await apps.build('research-project',created.id);
 for(const file of ['../outside.js','/root.js','x\\y.js','constructor','folder/../outside','CON.js','nul','folder/name.'])await assert.rejects(apps.edit('research-project',created.id,{op:'write',file,content:'x'}));
 await assert.rejects(apps.edit('research-project',created.id,{op:'delete',file:'index.html'}));await assert.rejects(apps.edit('research-project',created.id,{op:'write',file:'huge.js',content:'x'.repeat(2000001)}));
 assert.throws(()=>apps.read('other',created.id),/this project/);await apps.edit('research-project',created.id,{op:'write',file:'main.js',content:'const = broken'});await assert.rejects(apps.publish('research-project',created.id));assert.equal((await apps.build('research-project',created.id)).html,before.html);
});
test('editor batch saves preserve remote unrelated files and fail atomically on conflicting files',async t=>{
 const {apps}=await setup(t),app=await apps.create('research-project','Shared editor');const original=structuredClone(apps.app('research-project',app.id).data.files);
 await apps.edit('research-project',app.id,{op:'write',file:'agent.js',content:'// From another device'});
 await apps.edit('research-project',app.id,{op:'batch',base:original,files:{...original,'main.js':'console.log("local edit")'}});assert.equal(apps.read('research-project',app.id,'agent.js').content,'// From another device');
 const base=structuredClone(apps.app('research-project',app.id).data.files);await apps.edit('research-project',app.id,{op:'write',file:'main.js',content:'console.log("remote edit")'});
 await assert.rejects(apps.edit('research-project',app.id,{op:'batch',base,files:{...base,'new.js':'must not partially save','main.js':'local conflict'}}),/file changed/);assert.throws(()=>apps.read('research-project',app.id,'new.js'),/not found/);assert.match(apps.read('research-project',app.id,'main.js').content,/remote edit/);
});
test('project MCP transport exposes only scoped tools and closes after cancellation',async t=>{
 const controller=new AbortController(),server=await projectToolServer([{name:'fixture',description:'Scoped',parameters:{type:'object',properties:{}},call:async()=>({project:'fixed'})}],controller.signal);t.after(()=>server.close());
 async function rpc(method,params={},headers={}){return fetch(server.url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});}
 assert.equal((await (await rpc('initialize',{protocolVersion:'2025-03-26'})).json()).result.protocolVersion,'2025-03-26');assert.equal((await (await rpc('tools/list')).json()).result.tools[0].name,'fixture');assert.match((await (await rpc('tools/call',{name:'fixture'})).json()).result.content[0].text,/fixed/);
 assert.equal((await rpc('tools/list',{}, {Origin:'https://outside.invalid'})).status,403);assert.equal((await fetch(server.url+'bad',{method:'POST'})).status,403);controller.abort();await assert.rejects(rpc('tools/list'));
});
