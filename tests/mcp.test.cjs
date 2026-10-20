const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {McpRuntime,configValue}=require('../electron/mcp.cjs');
const {ToolApprovals}=require('../electron/tool-approvals.cjs');
const {ProviderRuntime,consumeResponses}=require('../electron/providers.cjs');
const {McpOAuth}=require('../electron/mcp-oauth.cjs');
const {searchRegistry}=require('../electron/mcp-registry.cjs');
const tool={name:'read_page',description:'Read a page',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id']},annotations:{readOnlyHint:true}};
function mockVault(){return {data:{mcpServers:{}},async update(fn){fn(this.data);}};}
function stream(output,text=''){return new Response('data: '+JSON.stringify({type:'response.completed',response:{output:output || [{type:'message',role:'assistant',content:[{type:'output_text',text}]}]}})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});}
function events(values){return new Response(values.map(v=>'data: '+JSON.stringify(v)+'\n\n').join(''),{headers:{'Content-Type':'text/event-stream'}});}

test('streamed MCP calls continue when completed has metadata but no repeated output array',async()=>{
 let called=0,requests=0;
 const accounts={async credential(){return {id:'a',provider:'chatgpt',accessToken:'fixture',scopes:['chatgpt.tokens.use.direct']};},async models(){return [{id:'model'}];}};
 const runtime=new ProviderRuntime(accounts,async(url,init)=>{
  const body=JSON.parse(init.body);
  if(++requests===1)return events([
   {type:'response.output_item.added',output_index:0,item:{id:'fc_1',type:'function_call',call_id:'call_1',name:'read_page',arguments:''}},
   {type:'response.function_call_arguments.delta',output_index:0,item_id:'fc_1',delta:'{"id":'},
   {type:'response.function_call_arguments.delta',output_index:0,item_id:'fc_1',delta:'"42"}'},
   {type:'response.function_call_arguments.done',output_index:0,item_id:'fc_1',arguments:'{"id":"42"}'},
   {type:'response.output_item.done',output_index:0,item:{id:'fc_1',type:'function_call',call_id:'call_1',name:'read_page',arguments:'{"id":"42"}',status:'completed'}},
   {type:'response.completed',response:{id:'response_1',status:'completed'}}
  ]);
  assert.equal(body.input.filter(x=>x.type==='function_call').length,1);assert.ok(body.input.some(x=>x.type==='function_call_output' && x.call_id==='call_1' && x.output==='Evidence from MCP'));
  return events([{type:'response.output_text.delta',delta:'Found your analytics.'},{type:'response.completed',response:{status:'completed'}}]);
 },{async open(){return {tools:[{name:'read_page',parameters:tool.inputSchema}],async call(name,args){called++;assert.deepEqual(args,{id:'42'});return 'Evidence from MCP';},async close(){}};}});
 assert.equal(await runtime.run({id:'agent',provider:'chatgpt',connectionId:'a',model:'model',webSearch:false,toolIds:['mcp:site']},'Read analytics'),'Found your analytics.');assert.equal(called,1);assert.equal(requests,2);
});

test('stream reconstruction preserves interleaved calls, reasoning, and text without duplicating final output',async()=>{
 const call={id:'fc',type:'function_call',call_id:'call',name:'read_page',arguments:'{"id":"42"}'};
 const result=await consumeResponses(events([
  {type:'response.output_item.added',output_index:0,item:{id:'reason',type:'reasoning'}},
  {type:'response.output_item.added',output_index:1,item:{...call,arguments:''}},
  {type:'response.output_item.added',output_index:2,item:{...call,id:'fc2',call_id:'call2',arguments:''}},
  {type:'response.function_call_arguments.delta',output_index:2,item_id:'fc2',delta:'{"id":'},
  {type:'response.function_call_arguments.done',output_index:1,item_id:'fc',arguments:'{"id":"42"}'},
  {type:'response.function_call_arguments.delta',output_index:2,item_id:'fc2',delta:'"43"}'},
  {type:'response.function_call_arguments.done',output_index:2,item_id:'fc2',arguments:'{"id":"43"}'},
  {type:'response.output_item.done',output_index:0,item:{id:'reason',type:'reasoning',encrypted_content:'preserved'}},
  {type:'response.completed'}
 ]),()=>{},true);
 assert.equal(result.output[0].encrypted_content,'preserved');assert.equal(result.calls.length,2);assert.deepEqual(result.calls.map(c=>JSON.parse(c.arguments).id),['42','43']);
 const canonical=await consumeResponses(events([{type:'response.output_item.done',output_index:0,item:call},{type:'response.completed',response:{output:[call]}}]),()=>{},true);assert.equal(canonical.calls.length,1);
 const text=await consumeResponses(events([{type:'response.output_item.done',output_index:0,item:{id:'message',type:'message',content:[{type:'output_text',text:'First'},{type:'output_text',text:'Second',annotations:[{type:'url_citation',url:'https://example.test',title:'Evidence'}]}]}},{type:'response.completed'}]));assert.match(text,/First\nSecond/);assert.match(text,/https:\/\/example.test/);
});

test('partial tool arguments and interrupted responses are never executable',async()=>{
 const added={type:'response.output_item.added',output_index:0,item:{id:'fc',type:'function_call',call_id:'call',name:'read_page',arguments:''}};
 await assert.rejects(consumeResponses(events([added,{type:'response.function_call_arguments.delta',output_index:0,item_id:'fc',delta:'{"id":'},{type:'response.completed'}]),()=>{},true),/did not finish.*arguments/);
 await assert.rejects(consumeResponses(events([{type:'response.output_item.done',output_index:0,item:{...added.item,arguments:'{}'}}]),()=>{},true),/before.*completed/);
});
test('MCP selection is enforced, aliases preserve tool identity, approvals gate calls, and configs stay private',async()=>{
 const vault=mockVault();let approved=0,called=0,closed=0;
 const runtime=new McpRuntime(vault,{approve:async()=>{approved++;return false;},connector:async()=>({async listTools(){return {tools:[tool]};},async callTool(){called++;return {content:[{type:'text',text:'Evidence'}]};},async close(){closed++;}})});
 await runtime.add('website',{url:'https://example.test/mcp/private-secret',headers:{Authorization:'Bearer private-secret'}},false);
 assert.ok(!JSON.stringify(await runtime.catalog({})).includes('private-secret'));
 const empty=await runtime.open([],{});assert.equal(empty.tools.length,0);await empty.close();
 const session=await runtime.open(['mcp:website'],{});const alias=session.tools[0].name;assert.ok(alias.includes('read_page'));assert.match(await session.call(alias,{id:'one'}),/declined/);assert.equal(approved,1);assert.equal(called,0);
 await assert.rejects(session.call('other',{}),/not selected/);await session.close();assert.equal(closed,1);
 await runtime.add('website',{url:'https://example.test/mcp/private-secret'},true);const trusted=await runtime.open(['mcp:website'],{});assert.match(await trusted.call(trusted.tools[0].name,{id:'one'}),/Evidence/);assert.equal(called,1);await trusted.close();
 await assert.rejects(runtime.open(['mcp:missing'],{}),/not configured/);assert.throws(()=>configValue({url:'http://public.example/mcp'}),/HTTPS/);
});
test('unknown and write tools require approval even when reads are trusted; cancellation clears pending approvals',async()=>{
 const approvals=new ToolApprovals();const vault=mockVault();const runtime=new McpRuntime(vault,{approve:r=>approvals.request(r),connector:async()=>({async listTools(){return {tools:[{...tool,name:'write_page',annotations:{readOnlyHint:false}}]};},async callTool(){throw Error('Must not call');},async close(){}})});
 await runtime.add('site',{url:'https://example.test/mcp'},true);const controller=new AbortController();const session=await runtime.open(['mcp:site'],{},controller.signal);const pending=session.call(session.tools[0].name,{id:'one'});await new Promise(r=>setImmediate(r));assert.equal(approvals.list().length,1);controller.abort();await assert.rejects(pending,/stopped/);assert.equal(approvals.list().length,0);await session.close();
});

test('always-allow covers writes and unclassified tools, persists independently of OAuth, and can be revoked live',async()=>{
 const vault=mockVault();let asked=0,called=0;
 const runtime=new McpRuntime(vault,{approve:async()=>{asked++;return false;},connector:async()=>({async listTools(){return {tools:[{...tool,name:'write',annotations:{readOnlyHint:false}},{...tool,name:'unknown',annotations:undefined}]};},async callTool(){called++;return {content:[{type:'text',text:'Saved'}]};},async close(){}})});
 await runtime.add('site',{url:'https://example.test/mcp'},'ask');vault.data.mcpServers.site.oauth={tokens:{access_token:'private-token'}};await runtime.setPolicy('site','all');assert.equal((await runtime.catalog({})).find(t=>t.name==='site').approvalMode,'all');assert.equal(vault.data.mcpServers.site.oauth.tokens.access_token,'private-token');
 const session=await runtime.open(['mcp:site'],{});for(const item of session.tools)assert.match(await session.call(item.name,{id:'one'}),/Saved/);assert.equal(called,2);assert.equal(asked,0);
 const reopened=new McpRuntime(vault);assert.equal((await reopened.catalog({})).find(t=>t.name==='site').approvalMode,'all');await runtime.setPolicy('site','ask');assert.match(await session.call(session.tools[0].name,{id:'one'}),/declined/);assert.equal(asked,1);assert.equal(called,2);await session.close();
 await assert.rejects(runtime.setPolicy('site','arbitrary'),/approval mode/);await runtime.add('site',{url:'https://other.test/mcp'});assert.equal((await runtime.catalog({})).find(t=>t.name==='site').approvalMode,'ask');
});

test('HTTP usage limits carry retry timing without classifying authentication failures as quota',async()=>{
 const {usageLimit}=require('../shared/agent-status.mjs');
 await assert.rejects(consumeResponses(new Response('{"error":{"code":"rate_limit_exceeded"}}',{status:429,headers:{'retry-after':'60'}})),error=>{assert.equal(error.status,429);assert.ok(Date.parse(error.retryAt)>Date.now()+50000);assert.ok(usageLimit(error));return true;});
 await assert.rejects(consumeResponses(new Response('{}',{status:401})),error=>{assert.equal(usageLimit(error),null);return true;});
});
test('Claude CLI receives selected MCP config outside project storage and cleans it afterward',async()=>{
 const vault=mockVault(),runtime=new McpRuntime(vault);await runtime.add('site',{url:'https://example.test/mcp/secret-url',headers:{Authorization:'secret-token'}});
 const file=await runtime.cliFile(['mcp:site'],{});const data=JSON.parse(await fs.readFile(file.path,'utf8'));assert.equal(data.mcpServers.site.headers.Authorization,'secret-token');assert.ok(!file.path.includes('projects'));await file.close();await assert.rejects(fs.access(file.path));
});
test('official MCP client performs a real stdio handshake and tool round trip',async t=>{
 const root=path.resolve(__dirname,'../.test-data');await fs.mkdir(root,{recursive:true});const folder=await fs.mkdtemp(path.join(root,'mcp-'));t.after(()=>{assert.ok(folder.startsWith(root+path.sep));return fs.rm(folder,{recursive:true,force:true});});
 const fixture=path.join(folder,'server.cjs');await fs.writeFile(fixture,`const readline=require('node:readline');readline.createInterface({input:process.stdin}).on('line',line=>{const v=JSON.parse(line);if(v.id==null)return;let result;if(v.method==='initialize')result={protocolVersion:v.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};else if(v.method==='tools/list')result={tools:[${JSON.stringify(tool)}]};else if(v.method==='tools/call')result={content:[{type:'text',text:'Page '+v.params.arguments.id}]};else result={};console.log(JSON.stringify({jsonrpc:'2.0',id:v.id,result}));});`);
 const vault=mockVault(),runtime=new McpRuntime(vault);await runtime.add('fixture',{command:process.execPath,args:[fixture]},true);const session=await runtime.open(['mcp:fixture'],{},AbortSignal.timeout(5000));assert.match(await session.call(session.tools[0].name,{id:'42'}),/Page 42/);await session.close();
});
for(const provider of ['chatgpt','openai-api','claude-api','gemini'])test(`${provider} executes function tools and sends results back before its final answer`,async()=>{
 let executed=0,requests=[];const account={id:'one',provider,apiKey:'private-key',accessToken:'private-token',scopes:['chatgpt.tokens.use.direct']};const accounts={async credential(){return account;},async models(){return [{id:'model'}];}};
 const mcp={async open(selected){assert.deepEqual(selected,['mcp:site']);return {tools:[{name:'read_page',description:'Read',parameters:tool.inputSchema}],async call(name,args){assert.equal(name,'read_page');assert.deepEqual(args,{id:'42'});executed++;return 'Verified evidence';},async close(){}};}};
 const runtime=new ProviderRuntime(accounts,async(url,options)=>{const body=JSON.parse(options.body);requests.push(body);const first=requests.length===1;
  if(provider==='claude-api')return Response.json(first?{stop_reason:'tool_use',content:[{type:'tool_use',id:'call',name:'read_page',input:{id:'42'}}]}:{stop_reason:'end_turn',content:[{type:'text',text:'Final evidence'}]});
  if(provider==='gemini')return Response.json({candidates:[{finishReason:'STOP',content:{role:'model',parts:first?[{functionCall:{id:'call',name:'read_page',args:{id:'42'}},thoughtSignature:'keep-signature'}]:[{text:'Final evidence'}]}}]});
  return first?stream([{type:'function_call',call_id:'call',name:'read_page',arguments:'{"id":"42"}'},{type:'reasoning',encrypted_content:'keep-encrypted'}]):stream(null,'Final evidence');
 },mcp);
 assert.equal(await runtime.run({id:'agent',provider,connectionId:'one',model:'model',toolIds:['mcp:site'],webSearch:false},'Research',AbortSignal.timeout(5000)),'Final evidence');assert.equal(executed,1);assert.equal(requests.length,2);
 const serialized=JSON.stringify(requests[1]);assert.ok(serialized.includes('Verified evidence'));if(provider==='gemini')assert.ok(serialized.includes('keep-signature'));if(provider==='chatgpt'||provider==='openai-api')assert.ok(serialized.includes('keep-encrypted'));
});
test('a model cannot execute an MCP function that was not selected',async()=>{
 let count=0;const accounts={async credential(){return {id:'one',provider:'openai-api',apiKey:'key'};},async models(){return [{id:'model'}];}};
 const runtime=new ProviderRuntime(accounts,async(_url,options)=>{const body=JSON.parse(options.body);if(++count===1)return stream([{type:'function_call',call_id:'x',name:'not_allowed',arguments:'{}'}]);assert.match(JSON.stringify(body),/not selected/);return stream(null,'Denied');},{async open(){return {tools:[],async call(){throw Error('Tool not selected');},async close(){}};}});
 assert.equal(await runtime.run({provider:'openai-api',connectionId:'one',model:'model'},'Research'),'Denied');
});

test('directory search filters unsafe endpoints and retains publisher identity and pagination',async()=>{
 const result=await searchRegistry('research','',async(url)=>{assert.equal(url.hostname,'registry.modelcontextprotocol.io');assert.equal(url.searchParams.get('search'),'research');return Response.json({servers:[{server:{name:'com.example/research',title:'Research',remotes:[{type:'streamable-http',url:'https://example.test/mcp'},{type:'streamable-http',url:'http://unsafe.test/mcp'},{type:'sse',url:'https://example.test/{token}'}]}},{server:{name:'com.example/local',packages:[{}]}}],metadata:{nextCursor:'next'}});});
 assert.equal(result.servers.length,2);assert.equal(result.servers[0].remotes.length,1);assert.equal(result.servers[0].id,'com.example/research');assert.equal(result.servers[1].remotes.length,0);assert.equal(result.cursor,'next');
});

test('Gemini can use grounded search alongside MCP without mixing incompatible tool types',async()=>{
 let requests=0;
 const accounts={async credential(){return {id:'gemini-account',provider:'gemini',apiKey:'fixture'};},async models(){return [{id:'model'}];}};
 const runtime=new ProviderRuntime(accounts,async(url,init)=>{
  const body=JSON.parse(init.body);requests++;
  if(body.tools?.some(t=>t.google_search)){
   assert.equal(body.tools.length,1);return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'Grounded evidence'}]},groundingMetadata:{searchEntryPoint:{renderedContent:'<div>Search suggestions</div>'},groundingChunks:[{web:{title:'Source',uri:'https://example.test'}}]}}]});
  }
  assert.ok(body.tools[0].functionDeclarations.some(f=>f.name==='provider_web_search'));
  if(requests===1)return Response.json({candidates:[{finishReason:'STOP',content:{role:'model',parts:[{functionCall:{name:'provider_web_search',args:{query:'Current evidence'}}}]}}]});
  assert.match(JSON.stringify(body),/Grounded evidence/);return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'Final grounded synthesis'}]}}]});
 },{async open(){return {tools:[{name:'read_page',parameters:tool.inputSchema}],async close(){},async call(){throw Error('No MCP call expected');}};}});
 const result=await runtime.run({id:'a',provider:'gemini',connectionId:'gemini-account',model:'model',toolIds:['mcp:site']},'Research');assert.equal(result.text,'Final grounded synthesis');assert.match(result.searchSuggestions,/Search suggestions/);assert.equal(requests,3);
});

test('MCP browser OAuth validates state, uses PKCE, stores issuer-bound tokens privately, and supports cancellation',async()=>{
 const vault=mockVault();vault.data.mcpServers.site={config:{url:'https://service.test/mcp'}};
 let registration,authURL;
 const oauth=new McpOAuth(vault,{timeoutMs:5000,fetcher:async(url,init)=>{
   const u=new URL(url);
   if(u.pathname.includes('oauth-protected-resource'))return Response.json({resource:'https://service.test/mcp',authorization_servers:['https://auth.test']});
   if(u.pathname.includes('.well-known'))return Response.json({issuer:'https://auth.test',authorization_endpoint:'https://auth.test/authorize',token_endpoint:'https://auth.test/token',registration_endpoint:'https://auth.test/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']});
   if(u.pathname==='/register'){registration=JSON.parse(init.body);return Response.json({...registration,client_id:'desktop-fixture'});}
   if(u.pathname==='/token'){assert.ok(init.body.get('code_verifier'));assert.equal(init.body.get('code'),'approved-code');return Response.json({access_token:'secret-token',refresh_token:'secret-refresh',token_type:'Bearer',expires_in:3600});}
   throw Error('Unexpected auth request');
 },openExternal:async url=>{
   authURL=new URL(url);assert.equal(authURL.origin,'https://auth.test');assert.equal(authURL.searchParams.get('code_challenge_method'),'S256');
   const callback=new URL(authURL.searchParams.get('redirect_uri'));callback.searchParams.set('state','wrong');callback.searchParams.set('code','evil');assert.equal((await fetch(callback)).status,400);
   callback.searchParams.set('state',authURL.searchParams.get('state'));callback.searchParams.set('code','approved-code');assert.equal((await fetch(callback)).status,200);
 }});
 assert.equal((await oauth.signIn('site')).authorized,true);assert.ok(registration.redirect_uris[0].startsWith('http://127.0.0.1:'));assert.equal(vault.data.mcpServers.site.oauth.tokens.access_token,'secret-token');assert.equal(vault.data.mcpServers.site.oauth.tokens.issuer,'https://auth.test');assert.equal(oauth.pending.size,0);
 const privateProvider=oauth.provider('site');await assert.rejects(privateProvider.redirectToAuthorization(new URL('https://auth.test/authorize')),/Sign in from Connections/);
 const cancelled=new McpOAuth(vault,{timeoutMs:5000,fetcher:oauth.fetcher,openExternal:async()=>cancelled.cancel('site')});await assert.rejects(cancelled.signIn('site'),/did not complete/);assert.equal(cancelled.pending.size,0);
});
