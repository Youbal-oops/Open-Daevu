import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Search,X,Users,Settings2} from 'lucide-react';
import {Avatar,IconButton} from './ui';
import {agentContacts} from '../shared/agent-contacts.mjs';
import './agent-picker.css';

function contactTime(value){if(!value)return '';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';return date.toDateString()===new Date().toDateString()?date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}):date.toLocaleDateString(undefined,{month:'short',day:'numeric'});}
export default function AgentPicker({project,agents,activeId,anchor,statusFor,onSelect,onClose,onManage}){
 const [query,setQuery]=useState(''),[position,setPosition]=useState({right:12}),root=useRef(null),search=useRef(null);
 const handlers=useRef({onClose});handlers.current={onClose};
 const rows=agentContacts(project,agents).filter(({agent})=>(agent.name+' '+agent.role).toLowerCase().includes(query.toLowerCase()));
 useEffect(()=>{
  const old=anchor.current?.querySelector('.agent-picker-toggle')||document.activeElement;
  const place=()=>{const box=anchor.current?.getBoundingClientRect(),width=Math.min(360,innerWidth-24);setPosition({right:box&&box.left>=width+24?innerWidth-box.left+10:12,width,top:Math.max(12,box?.top||12),bottom:Math.max(12,box?innerHeight-box.bottom:12)});};
  place();search.current?.focus();window.addEventListener('resize',place);
  const key=e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();handlers.current.onClose();}
   if(e.key==='Tab'){
    const controls=[...root.current.querySelectorAll('button,input')].filter(el=>!el.disabled&&el.offsetParent!==null),first=controls[0],last=controls.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
  };
  document.addEventListener('keydown',key,true);
  return()=>{window.removeEventListener('resize',place);document.removeEventListener('keydown',key,true);requestAnimationFrame(()=>{if(old?.isConnected)old.focus();});};
 },[anchor]);
 return createPortal(<div className="agent-picker-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section id="agent-contact-drawer" className="agent-contact-drawer" role="dialog" aria-modal="true" aria-label="Choose an agent" style={position} ref={root}>
  <header><div><Users size={19}/><h2>Agents</h2><span>{agents.length}</span></div><IconButton icon={X} label="Close agent menu" onClick={onClose}/></header>
  <p className="agent-picker-project">{project.name}</p>
  <label className="agent-picker-search"><Search size={16}/><input ref={search} aria-label="Search agents" placeholder="Search agents" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" aria-label="Clear agent search" onClick={()=>{setQuery('');search.current?.focus();}}><X size={13}/></button>}</label>
  <div className="agent-picker-list">{rows.map(row=><button type="button" key={row.agent.id} className={'agent-picker-contact '+(row.agent.id===activeId?'selected':'')} aria-label={'Chat with '+row.agent.name} aria-current={row.agent.id===activeId?'true':undefined} onClick={()=>onSelect(row)}>
   <Avatar agent={row.agent} status={statusFor(row.agent)}/><span className="agent-picker-copy"><span><strong>{row.agent.name}</strong><time dateTime={row.updatedAt||undefined}>{contactTime(row.updatedAt)}</time></span><span className="agent-picker-preview">{row.preview}</span><small>{statusFor(row.agent)==='working'?'Working on a reply':statusFor(row.agent)==='offline'?'Offline · usage limit':row.agent.role}</small></span>
  </button>)}{!rows.length&&<div className="agent-picker-empty"><Users size={28}/><strong>{query?'No agents found':'No agents assigned yet'}</strong><p>{query?'Try another name or role.':'Assign agents to this project to start a conversation.'}</p></div>}</div>
  <footer><button type="button" onClick={onManage}><Settings2 size={15}/>Manage agent profiles</button></footer>
 </section></div>,document.body);
}
