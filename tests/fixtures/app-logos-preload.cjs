const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('logoTest',{snapshot:()=>ipcRenderer.invoke('logo-test:snapshot'),operation:(...args)=>ipcRenderer.invoke('logo-test:operation',...args)});
