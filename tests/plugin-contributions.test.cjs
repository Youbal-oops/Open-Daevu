const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {WorkspacePlugins}=require('../electron/plugins.cjs'),{Store}=require('../electron/store.cjs'),{makeFixture}=require('./fixture.cjs');
async function setup(t){const root=path.resolve(__dirname,'../.test-data');await fs.mkdir(root,{recursive:true});const folder=await fs.mkdtemp(path.join(root,'contrib-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));const store=new Store(path.join(folder,'workspace'));await store.init();await store.update(()=>makeFixture());const plugins=new WorkspacePlugins(path.join(folder,'plugins'),store,null);await plugins.init();return {store,plugins};}
const base={apiVersion:1,version:'1.0.0',panels:[]};
const page='<main>chart</main><script>window.workspacePlugin.board.get()</script>';

test('the chart plugins that ship with the app switch on built-in charts without any code',async t=>{
 const {plugins}=await setup(t);
 for(const id of ['chart-statistics','chart-business','chart-science']){const plan=await plugins.prepare(path.resolve(__dirname,'../bundled-plugins',id));assert.equal(plan.panels.length,0);await plugins.install(plan.planId);}
 const boards=plugins.list().flatMap(p=>p.contributes.boards.map(b=>b.id));
 assert.deepEqual(boards.sort(),['box','function','funnel','gauge','heatmap','histogram','radar','scatter','waterfall']);
});
test('a plugin can bring its own board type, drawn by a page it ships',async t=>{
 const {plugins}=await setup(t),manifest={...base,id:'sankey',name:'Sankey',permissions:[],contributes:{boards:[{id:'flow',name:'Flow diagram',hint:'Where things go',group:'science',entry:'flow.html'}]}};
 const plan=await plugins.prepare({manifest,files:{'flow.html':page}});await plugins.install(plan.planId);
 assert.equal(plugins.list()[0].contributes.boards[0].name,'Flow diagram');
 assert.match((await plugins.build('sankey','board:flow')).html,/chart/);
 await assert.rejects(plugins.build('sankey','board:nope'),/Unknown/);
 await plugins.enable('sankey',false);await assert.rejects(plugins.build('sankey','board:flow'),/Enable/);
});
test('contributions are checked: unknown charts, missing pages and duplicate IDs are refused',async t=>{
 const {plugins}=await setup(t),make=contributes=>plugins.prepare({manifest:{...base,id:'bad',name:'Bad',permissions:['files:read','files:edit'],contributes},files:{'a.html':page}});
 await assert.rejects(make({boards:[{id:'flow',name:'Flow',entry:'missing.html'}]}),/Missing/);
 await assert.rejects(make({boards:[{id:'flow',name:'A',entry:'a.html'},{id:'flow',name:'B',entry:'a.html'}]}),/unique/);
 await assert.rejects(make({widgets:[]}),/contribute/);
 await assert.rejects(make({fileEditors:[{id:'e',name:'E',extensions:['pdf','../x'],entry:'a.html'}]}),/extensions/);
 await assert.rejects(plugins.prepare({manifest:{...base,id:'bad',name:'Bad',permissions:[],contributes:{fileEditors:[{id:'e',name:'E',extensions:['pdf'],entry:'a.html'}]}},files:{'a.html':page}}),/files:edit/);
 await assert.rejects(plugins.prepare({manifest:{...base,id:'empty',name:'Empty',permissions:[]},files:{}}),/panel/);
});
test('a file editor plugin can read and replace a project file, and only with the files:edit permission',async t=>{
 const {store,plugins}=await setup(t),manifest={...base,id:'pdf-pen',name:'PDF pen',permissions:['files:read','files:write','files:edit'],contributes:{fileEditors:[{id:'pen',name:'PDF pen',extensions:['pdf'],entry:'pen.html'}]}};
 const plan=await plugins.prepare({manifest,files:{'pen.html':page}});await plugins.install(plan.planId);
 const saved=await plugins.request('pdf-pen','editor:pen','research-project','files:save',['scan.pdf',Buffer.from('one').toString('base64')]),id=saved.file.id;
 const before=store.state.projects[0].files.find(f=>f.id===id).contentHash;
 await plugins.request('pdf-pen','editor:pen','research-project','files:update',[id,Buffer.from('second version').toString('base64')]);
 const file=store.state.projects[0].files.find(f=>f.id===id);
 assert.equal(file.name,'scan.pdf');assert.equal(file.size,14);assert.notEqual(file.contentHash,before);
 assert.equal((await plugins.request('pdf-pen','editor:pen','research-project','files:read',[id])).base64,Buffer.from('second version').toString('base64'));
 await assert.rejects(plugins.request('pdf-pen','editor:pen','research-project','files:update',['no-such-file',Buffer.from('x').toString('base64')]),/Choose a file/);
 const limited=await plugins.prepare({manifest:{...manifest,id:'reader',permissions:['files:read'],contributes:undefined,panels:[{id:'main',title:'Reader',type:'html',entry:'pen.html'}]},files:{'pen.html':page}});await plugins.install(limited.planId);
 await assert.rejects(plugins.request('reader','main','research-project','files:update',[id,Buffer.from('x').toString('base64')]),/permission/);
});
test('plugins can add spreadsheet formulas and colour themes, and bad ones are refused', async t => {
 const {plugins}=await setup(t),{calculateSheet,setSheetFunctions}=await import('../shared/sheet.mjs');
 const manifest={...base,id:'finance',name:'Finance',permissions:[],contributes:{sheetFunctions:[{name:'MARKUP',args:['price','pct'],expr:'price*(1+pct/100)'}],themes:[{id:'dusk',name:'Dusk',mode:'dark',vars:{'--accent':'#7c5cff'}}]}};
 const plan=await plugins.prepare({manifest,files:{}});await plugins.install(plan.planId);
 const {sheetFunctions,themes}=plugins.list()[0].contributes;
 assert.equal(calculateSheet([['=MARKUP(200,10)']])[0][0],'#NAME?');
 setSheetFunctions(sheetFunctions);
 assert.equal(calculateSheet([['=MARKUP(200,10)','=MARKUP(1)','=SUM(1,2)']])[0].join('|'),'220|#VALUE!|3');
 setSheetFunctions([]);assert.equal(themes[0].vars['--accent'],'#7c5cff');
 const make=contributes=>plugins.prepare({manifest:{...manifest,id:'bad',contributes},files:{}});
 await assert.rejects(make({sheetFunctions:[{name:'lower',args:[],expr:'1'}]}),/capitals/);
 await assert.rejects(make({sheetFunctions:[{name:'LEAK',args:['a'],expr:'a+secret'}]}),/not one of its arguments/);
 await assert.rejects(make({sheetFunctions:[{name:'BROKEN',args:['a'],expr:'a +* 2'}]}),/BROKEN/);
 await assert.rejects(make({themes:[{id:'x',name:'X',mode:'dark',vars:{'--bg':'url(http://evil)'}}]}),/colours/);
 await assert.rejects(make({themes:[{id:'x',name:'X',mode:'dark',vars:{'color':'red'}}]}),/colours/);
});
test('a document keeps charts as floating items next to its pictures', async () => {
 const {cleanImages}=await import('../shared/blocks.mjs');
 const items=cleanImages([{id:'a',chartId:'art-1',x:10,y:20,w:380,h:270,wrap:'around'}]);
 assert.equal(items[0].chartId,'art-1');assert.equal(items[0].w,380);
 assert.throws(()=>cleanImages([{id:'b',chartId:'../bad'}]),/stored file/);
});
test('browser plugins: styles, scripts, blocks and tools are matched per site and need their permissions', async t => {
 const {plugins}=await setup(t),{browserChanges,blockedBy,urlMatches}=await import('../shared/browser-plugins.mjs');
 const manifest={...base,id:'tweaks',name:'Tweaks',permissions:['browser:modify','browser:scripts'],contributes:{browser:{styles:[{id:'wide',name:'Wide',matches:['https://*.example.com/*'],css:'body{max-width:none}'}],scripts:[{id:'hello',name:'Hello',code:'1+1'}],blocks:['*://ads.example.net/*'],tools:[{id:'count',name:'Count',code:'2'}]}}};
 const plan=await plugins.prepare({manifest,files:{}});await plugins.install(plan.planId);
 const list=plugins.list();
 assert.deepEqual(browserChanges(list,'https://docs.example.com/page').css,['body{max-width:none}']);
 assert.deepEqual(browserChanges(list,'https://other.org/').css,[]);assert.deepEqual(browserChanges(list,'https://other.org/').scripts,['1+1']);
 assert.ok(blockedBy(list,'https://ads.example.net/x.js'));assert.ok(!blockedBy(list,'https://example.net/'));
 assert.ok(urlMatches('https://a.com/*','https://a.com/b?c=1'));assert.ok(!urlMatches('https://a.com/*','https://a.com.evil.io/'));
 const off=[{...list[0],enabled:false}];assert.deepEqual(browserChanges(off,'https://other.org/').scripts,[]);assert.ok(!blockedBy(off,'https://ads.example.net/x.js'));
 const make=(permissions,browser)=>plugins.prepare({manifest:{...manifest,id:'bad',permissions,contributes:{browser}},files:{}});
 await assert.rejects(make([],{styles:[{id:'a',name:'A',css:'x{}'}]}),/browser:modify/);
 await assert.rejects(make(['browser:modify'],{scripts:[{id:'a',name:'A',code:'1'}]}),/browser:scripts/);
 await assert.rejects(make(['browser:scripts'],{scripts:[{id:'a',name:'A',code:'1',matches:['file:///etc/*']}]}),/Match websites/);
});
test('the chart plugins carry their own copies of the shared maths, kept identical to the app', async () => {
 const read=file=>fs.readFile(path.resolve(__dirname,'..',file),'utf8');
 const core=await read('shared/mathexpr.mjs');
 assert.equal(await read('bundled-plugins/chart-science/mathexpr.mjs'),core);
 const scale=(await read('shared/scale.mjs')).replace(/^\/\/.*\r?\n/,'').trim();
 for(const id of ['chart-statistics','chart-business','chart-science'])assert.ok((await read('bundled-plugins/'+id+'/stats.mjs')).includes(scale),id+' has the same axis maths');
 const common=await read('bundled-plugins/chart-statistics/common.jsx');
 for(const id of ['chart-business','chart-science'])assert.equal(await read('bundled-plugins/'+id+'/common.jsx'),common);
});
test('chart plugins ship no code in the app: the app has none of their chart types', async () => {
 const kinds=await fs.readFile(path.resolve(__dirname,'../src/chart-kinds.js'),'utf8');
 for(const word of ['scatter','histogram','waterfall','funnel','heatmap','radar'])assert.ok(!kinds.includes("'"+word+"'"),word+' should live in its plugin');
});
