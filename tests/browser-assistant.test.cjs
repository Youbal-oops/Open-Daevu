const {test}=require('node:test'),assert=require('node:assert/strict');
const {askBrowserAssistant}=require('../electron/browser-assistant.cjs');
const {validatePlugin}=require('../shared/plugins.mjs');
function setup(permissions=['browser:read','agents:run','files:write']){
 const calls={capture:[],images:[],run:[],mutations:[]},project={id:'project',agentIds:['agent']};
 const deps={async assertWritable(){},plugins:{enabled:()=>({manifest:{browserExtension:true,permissions}}),permit(record,permission){if(!record.manifest.permissions.includes(permission))throw Error('Permission required: '+permission);},project:()=>project},store:{async mutate(value){calls.mutations.push(value);}},runner:{lanes:new Set(),async start(...args){calls.run.push(args);return {groupId:'group'};}},browser:{async assistantCapture(...args){calls.capture.push(args);return {url:'https://example.com/page',title:'Example page',text:'Visible page evidence',capturedAt:'now',...(args[2]?{screenshot:'data:image/jpeg;base64,example'}:{})};}},chatImages:{async add(...args){calls.images.push(args);return [{type:'file',id:'image-id',name:'Browser viewport.jpg'}];}}};return {deps,calls};
}
test('browser assistant captures the active tab at send time and keeps the user question separate from page evidence',async()=>{
 const {deps,calls}=setup(),result=await askBrowserAssistant(deps,'plugin','project','tab','agent','What do you see?');assert.equal(result.groupId,'group');assert.equal(result.chatId,calls.mutations[0].value.id);assert.equal(calls.mutations[0].value.title,'Browser assistant');assert.deepEqual(calls.capture,[['project','tab',true]]);assert.equal(calls.images.length,1);assert.equal(calls.run[0][2],'What do you see?');const options=calls.run[0][3];assert.equal(options.browserContext.text,'Visible page evidence');assert.equal(options.browserContext.screenshot,undefined);assert.equal(options.refs[0].id,'image-id');
});
test('turning tab sharing off prevents all page and screenshot access',async()=>{
 const {deps,calls}=setup(['agents:run']);await askBrowserAssistant(deps,'plugin','project','tab','agent','Hello',{chatId:'existing',sharePage:false,screenshot:true});assert.equal(calls.capture.length,0);assert.equal(calls.images.length,0);assert.equal(calls.mutations.length,0);assert.equal(calls.run[0][3].browserContext,undefined);assert.equal(calls.run[0][3].chatId,'existing');
});
test('text-only sharing does not capture or store a screenshot',async()=>{
 const {deps,calls}=setup(['browser:read','agents:run']);await askBrowserAssistant(deps,'plugin','project','tab','agent','Summarize',{screenshot:false});assert.equal(calls.capture[0][2],false);assert.equal(calls.images.length,0);assert.equal(calls.run[0][3].browserContext.url,'https://example.com/page');
});
test('browser permissions, project assignment and busy lanes are checked before capturing private page content',async()=>{
 let {deps,calls}=setup(['agents:run']);await assert.rejects(askBrowserAssistant(deps,'plugin','project','tab','agent','Question'),/browser:read/);assert.equal(calls.capture.length,0);
 ({deps,calls}=setup());await assert.rejects(askBrowserAssistant(deps,'plugin','project','tab','other-agent','Question'),/assigned/);assert.equal(calls.capture.length,0);deps.runner.lanes.add('project:agent');await assert.rejects(askBrowserAssistant(deps,'plugin','project','tab','agent','Question'),/already working/);assert.equal(calls.capture.length,0);
});
test('contextual browser plugins are distinct from web-chat panels and require declared capabilities',()=>{
 const manifest=require('../bundled-plugins/browser-assistants/manifest.json');assert.equal(validatePlugin(manifest).browserExtension,true);assert.equal(validatePlugin(manifest).panels[0].type,'browser-assistant');assert.throws(()=>validatePlugin({...manifest,permissions:['browser:read']}),/agents:run/);assert.throws(()=>validatePlugin({...manifest,browserExtension:false}),/require/);
});
