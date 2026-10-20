import {useRef,useState} from 'react';
function read(key){try{const value=JSON.parse(localStorage.getItem(key));if(value&&typeof value.text==='string'&&Array.isArray(value.refs))return {text:value.text,refs:value.refs.slice(0,20)};}catch{}return {text:'',refs:[]};}
export function useAgentDraft(projectId,agentId,chatId){
 const key='rw-agent-draft:'+JSON.stringify([projectId,agentId,chatId]),cache=useRef(new Map()),[,render]=useState(0),[error,setError]=useState('');
 if(!cache.current.has(key))cache.current.set(key,read(key));
 const field=name=>value=>{const current=cache.current.get(key),next={...current,[name]:typeof value==='function'?value(current[name]):value};cache.current.set(key,next);try{localStorage.setItem(key,JSON.stringify(next));setError('');}catch{setError('This draft could not be saved on this device.');}render(version=>version+1);};
 return {...cache.current.get(key),setText:field('text'),setRefs:field('refs'),error};
}
