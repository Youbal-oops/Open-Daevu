const {test}=require('node:test'),assert=require('node:assert/strict');
const {agentContacts,showSavedEffort}=require('../shared/agent-contacts.mjs');
test('effort is hidden unless the user explicitly enabled it',()=>{
 assert.equal(showSavedEffort({getItem:()=>null}),false);assert.equal(showSavedEffort({getItem:()=> 'no'}),false);assert.equal(showSavedEffort({getItem:()=> 'yes'}),true);assert.equal(showSavedEffort({getItem(){throw Error('disabled');}}),false);
});
test('contact previews use each agent own latest user conversation and open its matching chat',()=>{
 const agents=[{id:'a',name:'Ada',role:'Research'},{id:'b',name:'Ben',role:'Design'},{id:'c',name:'Cara',role:'Planning'}];
 const project={messages:[
  {agentId:'a',role:'assistant',text:'**First** answer',createdAt:'2026-10-18T10:00:00Z'},
  {agentId:'b',role:'user',chatId:'new-b',text:'Review the mockup',createdAt:'2026-10-18T11:00:00Z'},
  {agentId:'b',threadAgentId:'a',role:'assistant',audience:'agent',text:'Private specialist report',createdAt:'2026-10-18T12:00:00Z'},
  {agentId:'b',role:'chat-created',chatId:'new-b',text:'New chat',createdAt:'2026-10-18T12:30:00Z'},
  {agentId:'a',role:'system',text:'Tool output',createdAt:'2026-10-18T13:00:00Z'}
 ]};
 const rows=agentContacts(project,agents);assert.deepEqual(rows.map(r=>r.agent.id),['b','a','c']);assert.equal(rows[0].preview,'You: Review the mockup');assert.equal(rows[0].chatId,'new-b');assert.equal(rows[1].preview,'First answer');assert.equal(rows[1].chatId,'legacy-a');assert.equal(rows[2].preview,'Start a conversation');
 assert.ok(rows.every(r=>!r.preview.includes('Private specialist')));
});
