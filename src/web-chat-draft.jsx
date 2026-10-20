import {useEffect,useRef,useState} from 'react';
import {api} from './api';
const defaults=(id,initial={})=>({text:'',attachments:[],selected:[id],split:false,native:false,waitBusy:true,ratio:.5,...initial});
const saved=data=>({...data,attachments:data.attachments.map(({name,type,base64})=>({name,type,base64}))});
export function useWebChatDraft(pluginId,panelId,projectId,initial={}){
 const scope=JSON.stringify([pluginId,panelId,projectId]),active=useRef(null),[view,setView]=useState(()=>({scope,data:defaults(pluginId,initial),ready:false})),[error,setError]=useState('');
 useEffect(()=>{
  const session={scope,data:defaults(pluginId,initial),ready:false,closed:false,timer:null};active.current=session;setError('');setView({scope,data:session.data,ready:false});
  const store=()=>{if(!session.ready)return;return api.pluginWebDraft?.(pluginId,panelId,projectId,saved(session.data)).catch(e=>{if(!session.closed)setError('Draft could not be saved: '+e.message);});};session.store=store;
  Promise.resolve(api.pluginWebDraft?.(pluginId,panelId,projectId)).then(value=>{
   if(session.closed)return;
   if(value)session.data={...defaults(pluginId,initial),...value,attachments:(value.attachments||[]).map(file=>({...file,id:crypto.randomUUID(),size:file.base64.length/4*3-(file.base64.endsWith('==')?2:file.base64.endsWith('=')?1:0)}))};
   session.ready=true;setView({scope,data:session.data,ready:true});
  }).catch(e=>{if(!session.closed){session.ready=true;setError('Draft could not be restored: '+e.message);setView({scope,data:session.data,ready:true});}});
  const flush=event=>{const pending=store();if(pending)event.detail?.pending?.push(pending);};
  window.addEventListener('research:flush-drafts',flush);
  window.addEventListener('beforeunload',store);
  return()=>{session.closed=true;window.removeEventListener('research:flush-drafts',flush);window.removeEventListener('beforeunload',store);clearTimeout(session.timer);store();};
 },[scope]);
 const field=name=>value=>{const session=active.current;if(!session||session.scope!==scope||!session.ready||session.closed)return;session.data={...session.data,[name]:typeof value==='function'?value(session.data[name]):value};setView({scope,data:session.data,ready:true});clearTimeout(session.timer);session.timer=setTimeout(session.store,350);};
 return {...(view.scope===scope?view.data:defaults(pluginId,initial)),ready:view.scope===scope&&view.ready,error,setText:field('text'),setAttachments:field('attachments'),setSelected:field('selected'),setSplit:field('split'),setNative:field('native'),setRatio:field('ratio'),setWaitBusy:field('waitBusy')};
}
