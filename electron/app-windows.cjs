const path=require('node:path');
const fs=require('node:fs/promises');
class AppWindows {
  constructor({BrowserWindow,ipcMain,store,url,preview,ask,database,apps,iconFor}) {
    Object.assign(this,{BrowserWindow,store,url,preview,ask,database,apps,iconFor});this.windows=new Map();
    ipcMain.handle('app-window:request',(event,op,value)=>this.request(event,op,value));
  }
  snapshot(record){return {theme:this.store.state.theme,projects:this.store.state.projects.filter(p=>p.id===record.projectId)};}
  async open(projectId,artifactId,{draft=false}={}){
    const artifact=this.store.state.projects.find(p=>p.id===projectId)?.artifacts?.find(a=>a.id===artifactId && a.kind==='html');
    if(!artifact)throw Error('Choose an existing app.');
    const key=JSON.stringify([projectId,artifactId,...(draft?['draft']:[])]),existing=this.windows.get(key);
    if(existing && !existing.window.isDestroyed()){existing.window.restore();existing.window.show();existing.window.focus();return;}
    const target=new URL(this.url);target.hash=new URLSearchParams({app:artifactId,project:projectId,...(draft?{draft:'1'}:{})}).toString();
    const window=new this.BrowserWindow({width:1200,height:800,minWidth:420,minHeight:320,title:artifact.title,...(this.iconFor?{icon:this.iconFor(artifact)}:{}),backgroundColor:'#111212',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'app-window-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
    const record={window,projectId,artifactId,draft,url:target.href,logo:artifact.data.logo};this.windows.set(key,record);
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',(event,url)=>{if(url!==record.url)event.preventDefault();});
    window.webContents.on('will-attach-webview',event=>event.preventDefault());
    window.webContents.on('page-title-updated',event=>event.preventDefault());
    window.on('closed',()=>this.windows.delete(key));
    try{await window.loadURL(record.url);window.setTitle(artifact.title);}catch(error){this.windows.delete(key);window.destroy();throw error;}
  }
  async request(event,op,value){
    const record=[...this.windows.values()].find(r=>r.window.webContents===event.sender && event.senderFrame===event.sender.mainFrame && event.senderFrame.url===r.url);
    if(!record)throw Error('Untrusted app window request.');
    const project=this.store.state.projects.find(p=>p.id===record.projectId),artifact=project?.artifacts?.find(a=>a.id===record.artifactId && a.kind==='html');
    if(!artifact)throw Error('This app was removed.');
    if(op==='load')return this.snapshot(record);
    if(op==='build')return this.apps.build(record.projectId,record.artifactId,{draft:record.draft});
    if(op==='report')return this.apps.report(record.projectId,record.artifactId,value);
    if(op==='preview')return this.preview(value);
    if(op==='save'){
      if(value?.type!=='artifact:state'||value.projectId!==record.projectId||value.value?.artifactId!==record.artifactId)throw Error('An app window may only save its own app data.');
      await this.store.mutate(value);return this.snapshot(record);
    }
    if(op==='ask'){await this.ask(record.projectId,String(value || '').slice(0,4000));return true;}
    if(op==='db-schema')return this.database.schema(record.projectId,{appId:record.artifactId});
    if(op==='db-query')return this.database.query(record.projectId,value.sql,value.params);
    if(op==='db-write')return this.database.write(record.projectId,value,{appId:record.artifactId});
    if(op==='db-create')return this.database.create(record.projectId,value.name,value.properties,{appId:record.artifactId});
    if(op==='file'){
      const file=project.files.find(f=>f.id===value),types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'};
      if(!file || path.basename(file.storedName)!==file.storedName || !types[path.extname(file.storedName).toLowerCase()])throw Error('Choose a project image.');
      const full=path.join(this.store.projectDir(project.id),'files',file.storedName);if((await fs.stat(full)).size>12*1024*1024)throw Error('Use an image under 12 MB.');
      return `data:${types[path.extname(file.storedName).toLowerCase()]};base64,${(await fs.readFile(full)).toString('base64')}`;
    }
    throw Error('This operation is unavailable in an app window.');
  }
  broadcast(){for(const record of this.windows.values()){
    const artifact=this.store.state.projects.find(p=>p.id===record.projectId)?.artifacts?.find(a=>a.id===record.artifactId && a.kind==='html');
    if(!artifact){record.window.destroy();continue;}
    record.window.setTitle(artifact.title);if(this.iconFor&&record.logo!==artifact.data.logo){record.window.setIcon(this.iconFor(artifact));record.logo=artifact.data.logo;}record.window.webContents.send('app-window:state',this.snapshot(record));
  }}
  destroy(){for(const record of this.windows.values())record.window.destroy();this.windows.clear();}
}
module.exports={AppWindows};
