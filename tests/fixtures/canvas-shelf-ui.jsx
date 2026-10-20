import {applyMutation} from '../../shared/domain.mjs';
let state=window.__canvasState;const listeners=new Set();window.canvasMutations=[];
window.workspace=new Proxy({
 load:async()=>state,onState:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
 mutate:async action=>{window.canvasMutations.push(action);state=applyMutation(structuredClone(state),action);window.__canvasState=state;for(const fn of listeners)fn(state);return state;},
 pluginsList:async()=>[{id:'fixture-plugin',name:'Fixture plugin',version:'1.0.0',description:'Native fixture website panel',permissions:['web'],enabled:true,panels:[{id:'web',title:'Fixture web',type:'web-app',url:'https://example.com'}]},...['chatgpt-web','gemini-web'].map(id=>({id,name:id==='chatgpt-web'?'ChatGPT':'Gemini',version:'1.0.0',description:'Fixture chat',permissions:['web'],enabled:true,panels:[{id:'chat',title:id==='chatgpt-web'?'ChatGPT':'Gemini',type:'web-chat',provider:id.replace('-web',''),url:id==='chatgpt-web'?'https://chatgpt.com':'https://gemini.google.com'}]}))],storageStatus:async()=>({mode:'local',readOnly:false}),accountsList:async()=>({accounts:[],pending:[]}),mcpPending:async()=>[],toolsList:async()=>({tools:[],warnings:[]}),
},{get:(target,name)=>name in target?target[name]:String(name).startsWith('on')?()=>()=>{}:async()=>({})});
import('../../src/main.jsx');
