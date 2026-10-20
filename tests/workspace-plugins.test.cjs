const {test}=require('node:test'),assert=require('node:assert/strict');
const {workspacePluginEntries,pluginPlacement}=require('../shared/workspace-plugins.mjs');
const chat=id=>({id,enabled:true,panels:[{id:'chat',type:'web-chat',title:id}]});
test('ChatGPT and Gemini share one default notch independently of plugin installation order',()=>{
 const entries=workspacePluginEntries([chat('other-web'),chat('gemini-web'),chat('chatgpt-web')]);
 const combined=entries.filter(e=>e.combined);assert.equal(combined.length,1);assert.equal(entries.length,2);
 assert.equal(combined[0].title,'AI chats');assert.equal(combined[0].placement,'pull-down');assert.deepEqual(combined[0].memberIds,['chatgpt-web','gemini-web']);
 const tab=workspacePluginEntries([chat('chatgpt-web'),chat('gemini-web')],{'gemini-web':'tab'});assert.equal(tab[0].placement,'tab');assert.equal(tab[0].key,'plugin:ai-chats');
 assert.equal(pluginPlacement('other-web'),'sidebar');
});
test('the shared chat notch handles a disabled or missing provider without ghost entries',()=>{
 const entries=workspacePluginEntries([{...chat('chatgpt-web'),enabled:false},chat('gemini-web')]);assert.equal(entries.length,1);assert.deepEqual(entries[0].memberIds,['gemini-web']);
 assert.equal(workspacePluginEntries([{...chat('chatgpt-web'),enabled:false}]).length,0);
});
