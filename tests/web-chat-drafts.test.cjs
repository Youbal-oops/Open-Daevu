const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {WebChatDrafts}=require('../electron/web-chat-drafts.cjs');
test('drafts restore text, attachment bytes and pane preferences across restart without crossing projects or plugins',async t=>{
 await fs.mkdir(path.resolve('.test-data'),{recursive:true});const root=await fs.mkdtemp(path.resolve('.test-data/web-drafts-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const drafts=new WebChatDrafts(root),value={text:'Keep this draft',attachments:[{name:'note.txt',type:'text/plain',base64:Buffer.from('exact bytes').toString('base64')}],selected:['gemini','chatgpt'],split:true,native:false,waitBusy:true,ratio:.6};
 await drafts.write('gemini','main','one',value);const reopened=new WebChatDrafts(root);assert.deepEqual(await reopened.read('gemini','main','one'),value);assert.equal(await reopened.read('gemini','main','two'),null);assert.equal(await reopened.read('chatgpt','main','one'),null);
 assert.throws(()=>drafts.write('gemini','main','one',{...value,attachments:[{name:'../private',type:'text/plain',base64:'eA=='}]}),/attachment/);assert.deepEqual(await drafts.read('gemini','main','one'),value);
 await drafts.write('gemini','main','one',{...value,text:'',attachments:[],selected:[]});assert.deepEqual((await reopened.read('gemini','main','one')).selected,[]);
});
test('conversation restoration strips transient tokens and keeps only provider conversation routes on the signed-in origin',async()=>{
 const {conversationURL}=await import('../shared/web-chat-session.mjs');
 assert.equal(conversationURL('chatgpt','https://chatgpt.com/g/g-p-example/c/abc-123?temporary=false',{url:'https://chatgpt.com/',origin:'https://chatgpt.com'}),'https://chatgpt.com/g/g-p-example/c/abc-123');
 for(const [provider,url,route] of [['chatgpt','https://chatgpt.com/','/c/abc-123'],['gemini','https://gemini.google.com/app','/app/abc_123'],['claude','https://claude.ai/new','/chat/abc-123']]){
  const service={url,origin:new URL(url).origin};assert.equal(conversationURL(provider,service.origin+route+'?token=private#secret',service),service.origin+route);assert.equal(conversationURL(provider,'https://unrelated.example'+route,service),null);assert.equal(conversationURL(provider,service.origin+'/auth/callback?code=private',service),null);
 }
});
