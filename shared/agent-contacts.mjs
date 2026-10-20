import {agentChats,messageChatId} from './conversations.mjs';
export function showSavedEffort(storage){try{return storage?.getItem('rw-show-effort')==='yes';}catch{return false;}}
export function agentContacts(project,agents){
 return agents.map(agent=>{
  const messages=(project.messages||[]).filter(m=>(m.threadAgentId||m.agentId)===agent.id&&['user','assistant'].includes(m.role)&&m.audience!=='agent');
  let last;for(const message of messages)if(!last||String(message.createdAt||'')>=String(last.createdAt||''))last=message;
  const text=String(last?.text||'').replace(/```research-actions[\s\S]*?```/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/[#*`>]/g,'').replace(/\s+/g,' ').trim();
  return {agent,chatId:last?messageChatId(last):agentChats(project,agent.id)[0]?.id,updatedAt:last?.createdAt||'',preview:last?(last.role==='user'?'You: ':'')+(text||(last.refs?.length?'Attachment':'Message')):'Start a conversation'};
 }).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.agent.name.localeCompare(b.agent.name));
}
