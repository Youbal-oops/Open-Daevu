import React,{useEffect,useState} from 'react';
import {api} from './api';
import {AppBridge,LiveApp} from './liveapp';
export function DetachedApp(){
  const [state,setState]=useState(null),[error,setError]=useState('');
  const params=new URLSearchParams(window.location.hash.slice(1));
  useEffect(()=>{api.load().then(setState).catch(e=>setError(e.message));return api.onState(setState);},[]);
  useEffect(()=>{if(state)document.documentElement.dataset.theme=state.theme;},[state?.theme]);
  const project=state?.projects.find(p=>p.id===params.get('project')),artifact=project?.artifacts?.find(a=>a.id===params.get('app'));
  return <AppBridge.Provider value={{theme:state?.theme || 'dark',act:async action=>{const next=await api.mutate(action);setState(next);return next;},ask:text=>api.askApp(text).catch(e=>setError(e.message))}}><main className="detached-app">{error?<p role="alert">{error}</p>:artifact?<LiveApp artifact={artifact} project={project} draft={params.get('draft')==='1'} className="full"/>:<p>{state?'This app was removed.':'Opening app…'}</p>}</main></AppBridge.Provider>;
}
