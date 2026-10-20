export const legacyChatId = agentId => `legacy-${agentId}`;
export const messageChatId = message => message.chatId || legacyChatId(message.threadAgentId || message.agentId);
export const conversationMessages = (messages, agentId, chatId = legacyChatId(agentId)) => messages.filter(m => m.role!=='chat-created' && (m.threadAgentId || m.agentId) === agentId && messageChatId(m) === chatId);
export const conversationParticipants = (messages, agentId, chatId) => [...new Set(conversationMessages(messages, agentId, chatId).filter(m => m.audience === 'agent' || m.role === 'handoff').map(m => m.agentId))].filter(id => id !== agentId);
export function agentChats(project,agentId){
 // Creation records use the existing ID-addressed messages collection, so simultaneous
 // first chats on old Drive workspaces merge without competing new metadata arrays.
 const chats=[...(project.chats || []).filter(c=>c.agentId===agentId),...project.messages.filter(m=>m.role==='chat-created'&&m.agentId===agentId).map(m=>({id:m.chatId,agentId,title:m.text,createdAt:m.createdAt}))].map(chat=>{
  const messages=conversationMessages(project.messages,agentId,chat.id),first=messages.find(m=>m.role==='user');return {...chat,title:chat.title==='New chat'&&first?first.text.trim().replace(/\s+/g,' ').slice(0,60):chat.title,updatedAt:messages.at(-1)?.createdAt || chat.updatedAt || chat.createdAt};
 }),original=conversationMessages(project.messages,agentId);
 return [...chats,{id:legacyChatId(agentId),agentId,title:'Original chat',createdAt:original[0]?.createdAt || '',updatedAt:original.at(-1)?.createdAt || ''}].sort((a,b)=>(b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
}
