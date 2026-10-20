import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/styles.css';
import '../../src/studio.css';
import '../../src/soft.css';
window.workspace={
 async appOperation(project,op,args){const result=await window.logoTest.operation(project,op,args);window.dispatchEvent(new Event('logo-refresh'));return result;},
 appBuild:async()=>({html:'<main>Logo test app</main>'}),previewHtml:async()=>window.location.origin+'/preview',appReport:async()=>{},openAppWindow:async()=>{},appShortcut:async(...args)=>{window.shortcutCalls||=[];window.shortcutCalls.push(args);}
};
import('../../src/app-studio.jsx').then(({AppStudio,AppHome})=>{
 function Test(){
  const [state,setState]=useState(null),[active,setActive]=useState(null);
  useEffect(()=>{const refresh=()=>window.logoTest.snapshot().then(setState);refresh();window.addEventListener('logo-refresh',refresh);return()=>window.removeEventListener('logo-refresh',refresh);},[]);
  if(!state)return null;const project=state.projects[0],artifact=project.artifacts.find(a=>a.id===active);
  return artifact?<AppStudio artifact={artifact} project={project} onClose={()=>setActive(null)} onDelete={()=>{}}/>:<AppHome state={state} onEdit={(_,id)=>setActive(id)} onProject={()=>{}} onNew={()=>{}}/>;
 }
 createRoot(document.getElementById('root')).render(<Test/>);
});
