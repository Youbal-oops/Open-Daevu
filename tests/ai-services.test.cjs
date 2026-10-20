const {test}=require('node:test'),assert=require('node:assert/strict');
const {AccountConnections}=require('../electron/accounts.cjs');
const {ProviderRuntime}=require('../electron/providers.cjs');
const {compatibleBase,decisionBody}=require('../electron/ai-services.cjs');
const {validatePlugin}=require('../shared/plugins.mjs');
const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
function setup(fetcher){const vault={data:{accounts:[]},async update(fn){return fn(this.data);}};return new AccountConnections(vault,{fetcher});}
test('TypeSafe console keys discover real aliases and evaluate typed decisions without exposing secrets',async()=>{
 const calls=[],accounts=setup(async(url,options)=>{calls.push({url,options});assert.equal(options.headers.Authorization,'Bearer secret-typesafe');return response(url.endsWith('/models')?{models:[{name:'jev-latest'}]}:{model:'jev-1.13.0',answers:{supported:{type:'noul',noul:.94}},usage:{input_tokens:25}});});
 const connected=await accounts.addKey('typesafe','secret-typesafe','Jev console key'),id=connected.accounts[0].id;assert.equal(JSON.stringify(connected).includes('secret-typesafe'),false);assert.equal(connected.accounts[0].models[0].id,'jev-latest');
 const result=await accounts.evaluate(id,{state:'The source supports this claim.',questions:{supported:{type:'noul',instructions:'Is this claim supported?'}}});assert.equal(result.answers.supported.noul,.94);assert.equal(calls[1].url,'https://api.typesafe.ai/v1/systemone');assert.equal(JSON.parse(calls[1].options.body).model,'jev-latest');assert.equal(calls[1].options.redirect,'error');
});
test('OpenRouter validates its key, keeps chat models distinct and routes Jev to System One',async()=>{
 const calls=[],accounts=setup(async(url,options)=>{calls.push({url,options});if(url.endsWith('/key'))return response({data:{label:'Test'}});if(url.endsWith('/models'))return response({data:[{id:'vendor/chat',name:'Chat',architecture:{output_modalities:['text']}},{id:'typesafe/jev-1.14',architecture:{output_modalities:['decisions']}},{id:'typesafe/jev-router',architecture:{output_modalities:['text']}}]});return response({model:'typesafe/jev-1.14',answers:{route:{type:'choice',choice:'research',probabilities:{research:1},confidence:1}}});});
 const connected=await accounts.addKey('openrouter','secret-router','Router');assert.equal(calls[0].url,'https://openrouter.ai/api/v1/key');assert.deepEqual(connected.accounts[0].models.map(m=>m.id),['vendor/chat','typesafe/jev-router']);await accounts.evaluate(connected.accounts[0].id,{state:'Find sources',questions:{route:{type:'choice',instructions:'Pick a team',criteria:{research:null}}}});assert.equal(calls.at(-1).url,'https://openrouter.ai/api/v1/systemone');assert.equal(JSON.parse(calls.at(-1).options.body).model,'~typesafe/jev-latest');
});
test('compatible chat preserves assistant tool calls and returns project tool results to the same model',async()=>{
 const requests=[],accounts=setup(async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return response(requests.length===1?{choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'call-1',type:'function',function:{name:'project_database_schema',arguments:'{}'}}]}}]}:{choices:[{message:{role:'assistant',content:'Found the project table.'}}]});});
 const connected=await accounts.addKey('compatible','custom-key','Custom',{baseUrl:'https://ai.example/v1/',models:'test-model'});assert.equal(requests.length,0);const runtime=new ProviderRuntime(accounts,accounts.fetch);let invoked=0;const result=await runtime.run({provider:'compatible',connectionId:connected.accounts[0].id,model:'test-model'},'List tables',new AbortController().signal,()=>{},{functions:[{name:'project_database_schema',description:'List tables',parameters:{type:'object',properties:{}},call:()=>{invoked++;return {tables:['metrics']};}}]});assert.equal(result,'Found the project table.');assert.equal(invoked,1);assert.equal(requests[0].url,'https://ai.example/v1/chat/completions');assert.equal(requests[1].body.messages.at(-1).tool_call_id,'call-1');assert.deepEqual(JSON.parse(requests[1].body.messages.at(-1).content),{tables:['metrics']});
});
test('text-only compatible models can run with agent tools disabled',async()=>{
 const accounts=setup(async(_url,options)=>{assert.equal(JSON.parse(options.body).tools,undefined);return response({choices:[{message:{role:'assistant',content:'Hello'}}]});});const connected=await accounts.addKey('compatible','key','Local',{baseUrl:'http://localhost:11434/v1',models:'local-model'});assert.equal(await new ProviderRuntime(accounts,accounts.fetch).run({provider:'compatible',connectionId:connected.accounts[0].id,model:'local-model',functionCalling:false},'Hi',new AbortController().signal,()=>{},{functions:[{name:'unused',parameters:{type:'object'},call:()=>assert.fail('must not run')}]}),'Hello');
});
test('invalid decision questions and unsafe connection URLs are rejected before network calls',()=>{
 for(const url of ['https://secret@ai.example/v1','http://remote.example/v1','https://ai.example/v1?key=secret','file:///tmp/model'])assert.throws(()=>compatibleBase(url));
 assert.throws(()=>decisionBody({state:'data',questions:{}},'typesafe'),/questions/);assert.throws(()=>decisionBody({state:'data',questions:{x:{type:'choice',instructions:'Pick'}}},'typesafe'),/options/);assert.throws(()=>decisionBody({state:'data',questions:{x:{type:'score',instructions:'Rate',criteria:['one']}}},'typesafe'),/2–10/);
});
test('Jev uses the shared custom connector with System One format and stays separate from chat inference',async()=>{
 const urls=[],accounts=setup(async(url,options)=>{urls.push(url);return response(url.endsWith('/models')?{models:[{name:'jev-latest'}]}:{answers:{check:{type:'noul',noul:.8}}});});
 const result=await accounts.addKey('compatible','console-key','Jev',{baseUrl:'https://api.typesafe.ai/v1',protocol:'systemone'}),account=result.accounts[0];assert.equal(account.provider,'compatible');assert.equal(account.protocol,'systemone');assert.equal(account.models[0].id,'jev-latest');
 await accounts.evaluate(account.id,{state:'Evidence',questions:{check:{type:'noul',instructions:'Is this relevant?'}}});assert.equal(urls.at(-1),'https://api.typesafe.ai/v1/systemone');
 await assert.rejects(new ProviderRuntime(accounts,accounts.fetch).run({provider:'compatible',connectionId:account.id,model:'jev-latest'},'Hello',new AbortController().signal),/decision connection/);
});
test('generic AI website plugins require HTTPS and an explicit web permission',()=>{
 const manifest={apiVersion:1,id:'console-panel',name:'Console',version:'1.0.0',permissions:['web-chat'],panels:[{id:'main',title:'Console',type:'web-app',url:'https://console.typesafe.ai/'}]};assert.equal(validatePlugin(manifest).panels[0].provider,'custom-console-panel-main');assert.throws(()=>validatePlugin({...manifest,permissions:[]}));assert.throws(()=>validatePlugin({...manifest,panels:[{...manifest.panels[0],url:'javascript:alert(1)'}]}));
});
