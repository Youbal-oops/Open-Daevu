const {contextBridge,ipcRenderer}=require('electron');
const call=(op,value)=>ipcRenderer.invoke('app-window:request',op,value);
contextBridge.exposeInMainWorld('workspace',{
  appBuild:()=>call('build'),appReport:(_projectId,_appId,value)=>call('report',value),
  databaseSchema:()=>call('db-schema'),databaseQuery:(_projectId,sql,params)=>call('db-query',{sql,params}),appDatabaseWrite:(_projectId,_appId,value)=>call('db-write',value),appDatabaseCreate:(_projectId,_appId,name,properties)=>call('db-create',{name,properties}),
  load:()=>call('load'),mutate:value=>call('save',value),previewHtml:html=>call('preview',html),fileData:(_projectId,id)=>call('file',id),appSaveFile:(name,data)=>call('export',{name,data}),appOpenFile:options=>call('import',options),askApp:text=>call('ask',text),
  onState:callback=>{const listener=(_,state)=>callback(state);ipcRenderer.on('app-window:state',listener);return()=>ipcRenderer.removeListener('app-window:state',listener);}
});
