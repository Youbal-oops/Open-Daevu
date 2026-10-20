import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
window.calls=[];window.controlCalls=[];window.failChatGPT=true;
window.workspace={
 pluginWebDraft:async(id,panel,project,value)=>{const key='test-draft:'+JSON.stringify([id,panel,project]);if(value===undefined)return JSON.parse(localStorage.getItem(key)||'null');localStorage.setItem(key,JSON.stringify(value));return true;},
 pluginsSettings:async()=>({}),pluginWebHide:async()=>{},pluginWebShow:async()=>{},onPluginWebState:()=>()=>{},onPluginWebShortcut:callback=>{window.shortcutListener=callback;return()=>{window.shortcutListener=null;};},onPluginSaved:()=>()=>{},
 async pluginWebAction(id,panel,project,op,payload){if(op==='ready')return {busy:!!window.fixtureBusy?.[id]};if(['model','effort'].includes(op)){window.controlCalls.push({id,op});return {message:'Opened fixture menu.'};}if(op==='send'){window.calls.push({id,payload});await new Promise(r=>setTimeout(r,100));if(id==='chatgpt'&&window.failChatGPT)throw Error('fixture sign-in needed');return {sent:true};}return {};}
};
const plugins=['gemini','chatgpt'].map(id=>({id,name:id,enabled:true,panels:[{id:'main',type:'web-chat'}]}));
import('../../src/plugins.jsx').then(({WebChatPanel})=>{function Test(){const [project,setProject]=useState('qa');window.switchProject=setProject;return <WebChatPanel plugin={plugins[0]} panel={plugins[0].panels[0]} plugins={plugins} project={{id:project,name:project}} perform={fn=>fn()}/>;}createRoot(document.getElementById('root')).render(<Test/>);});
