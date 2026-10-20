const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {AppWindows}=require('../electron/app-windows.cjs');
class Window extends EventEmitter{
 constructor(options){super();this.options=options;this.webContents=new EventEmitter();this.webContents.mainFrame={url:''};this.webContents.setWindowOpenHandler=fn=>{this.openHandler=fn;};this.messages=[];this.webContents.send=(...args)=>this.messages.push(args);}
 async loadURL(url){this.webContents.mainFrame.url=url;}setTitle(title){this.title=title;}isDestroyed(){return Boolean(this.destroyed);}restore(){}show(){}focus(){this.focused=true;}destroy(){this.destroyed=true;this.emit('closed');}
}
function setup(){
 const store={state:{theme:'dark',projects:[{id:'project',artifacts:[{id:'app',title:'Dashboard',kind:'html',data:{html:'<h1>App</h1>'}}],files:[]},{id:'other',artifacts:[]}]},async mutate(action){this.saved=action;}};
 const manager=new AppWindows({BrowserWindow:Window,ipcMain:{handle(){}},store,url:'file:///workspace/index.html',preview:html=>'preview:'+html,ask(){}});return {manager,store};
}
test('detached app IPC is scoped to its window, project, and own saved state',async()=>{
 const {manager,store}=setup();await manager.open('project','app');const record=[...manager.windows.values()][0],event={sender:record.window.webContents,senderFrame:record.window.webContents.mainFrame};
 assert.deepEqual((await manager.request(event,'load')).projects.map(p=>p.id),['project']);
 await manager.request(event,'save',{type:'artifact:state',projectId:'project',value:{artifactId:'app',state:{count:1}}});assert.equal(store.saved.value.state.count,1);
 await assert.rejects(manager.request(event,'save',{type:'artifact:delete',projectId:'project',value:'app'}),/only save/);
 await assert.rejects(manager.request(event,'save',{type:'artifact:state',projectId:'other',value:{artifactId:'app',state:{}}}),/only save/);
 await assert.rejects(manager.request(event,'save',{type:'artifact:state',projectId:'project',value:{artifactId:'other-app',state:{}}}),/only save/);
 await assert.rejects(manager.request({...event,senderFrame:{url:record.url}},'load'),/Untrusted/);
 await assert.rejects(manager.request(event,'accounts:list'),/unavailable/);assert.equal(record.window.openHandler().action,'deny');assert.equal(record.window.options.webPreferences.nodeIntegration,false);assert.equal(record.window.options.webPreferences.sandbox,true);
});
test('one window per app stays current, and deletion closes its window',async()=>{
 const {manager,store}=setup();await manager.open('project','app');await manager.open('project','app');assert.equal(manager.windows.size,1);const record=[...manager.windows.values()][0];assert.ok(record.window.focused);
 store.state.projects[0].artifacts[0].title='Renamed';manager.broadcast();assert.equal(record.window.title,'Renamed');assert.equal(record.window.messages[0][0],'app-window:state');
 store.state.projects[0].artifacts=[];manager.broadcast();assert.equal(record.window.isDestroyed(),true);assert.equal(manager.windows.size,0);await assert.rejects(manager.open('project','app'),/existing app/);
});

test('app windows receive their own icon and update it when the logo changes',async()=>{
 const {manager,store}=setup();manager.iconFor=app=>'icon:'+(app.data.logo||app.id);await manager.open('project','app');
 const record=[...manager.windows.values()][0];assert.equal(record.window.options.icon,'icon:app');
 record.window.setIcon=value=>{record.window.icon=value;};store.state.projects[0].artifacts[0].data.logo='new-logo';manager.broadcast();assert.equal(record.window.icon,'icon:new-logo');
});

test('detached database calls bind project and app identity in the main process',async()=>{
 const {manager}=setup(),calls=[];manager.database={schema:(...args)=>calls.push(['schema',...args]),query:(...args)=>calls.push(['query',...args]),write:(...args)=>calls.push(['write',...args]),create:(...args)=>calls.push(['create',...args])};await manager.open('project','app');const record=[...manager.windows.values()][0],event={sender:record.window.webContents,senderFrame:record.window.webContents.mainFrame};
 await manager.request(event,'db-query',{projectId:'other',sql:'SELECT 1',params:[]});assert.deepEqual(calls[0],['query','project','SELECT 1',[]]);
 await manager.request(event,'db-write',{projectId:'other',appId:'other-app',op:'insert',table:'db',values:{name:'Test'}});assert.equal(calls[1][1],'project');assert.deepEqual(calls[1][3],{appId:'app'});
 await manager.request(event,'db-create',{name:'Owned storage',properties:[]});assert.equal(calls[2][1],'project');assert.deepEqual(calls[2][4],{appId:'app'});
});

test('draft previews have separate windows and cannot select another app when requesting builds or logs',async()=>{
 const {manager}=setup(),calls=[];manager.apps={build:(...args)=>calls.push(['build',...args]),report:(...args)=>calls.push(['report',...args])};await manager.open('project','app');await manager.open('project','app',{draft:true});assert.equal(manager.windows.size,2);
 for(const record of manager.windows.values()){const event={sender:record.window.webContents,senderFrame:record.window.webContents.mainFrame};await manager.request(event,'build',{projectId:'other',appId:'other-app',draft:!record.draft});assert.deepEqual(calls.at(-1),['build','project','app',{draft:record.draft}]);await manager.request(event,'report',{text:'runtime error'});assert.deepEqual(calls.at(-1),['report','project','app',{text:'runtime error'}]);}
});
