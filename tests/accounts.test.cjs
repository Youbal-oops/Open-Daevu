const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {CredentialVault,AccountConnections,verifyIdentity}=require('../electron/accounts.cjs');
const {ProviderRuntime,consumeResponses}=require('../electron/providers.cjs');
let keysPromise;
async function signing(){return keysPromise ||= (async()=>{const jose=await import('jose');const pair=await jose.generateKeyPair('RS256');const jwk=await jose.exportJWK(pair.publicKey);jwk.kid='test-key';return {jose,...pair,jwks:{keys:[jwk]}};})();}
async function identity({nonce='nonce',client='oaiapp_test',subject='person',issuer='https://auth.openai.com',expired=false}={}){
 const {jose,privateKey}=await signing();return new jose.SignJWT({nonce,email:'person@example.test',name:'Researcher'}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject(subject).setIssuer(issuer).setAudience(client).setIssuedAt().setExpirationTime(expired ? Math.floor(Date.now()/1000)-60 : '5m').sign(privateKey);
}
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
async function setup(t){
 const root=path.resolve(__dirname,'../.test-data');await fs.mkdir(root,{recursive:true});const dir=await fs.mkdtemp(path.join(root,'auth-'));t.after(()=>{assert.ok(dir.startsWith(root+path.sep));return fs.rm(dir,{recursive:true,force:true});});
 const secret=crypto.randomBytes(32),protection={isEncryptionAvailable:()=>true,encryptString(text){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',secret,iv);const bytes=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]);},decryptString(bytes){const decipher=crypto.createDecipheriv('aes-256-gcm',secret,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString();}};
 const vault=new CredentialVault(path.join(dir,'credentials.bin'),protection);await vault.init();return {vault,dir,protection};
}
async function oauth(t,{provider='chatgpt',scope='openid email offline_access resource.invoke chatgpt.tokens.use.direct',subject='person'}={}){
 const {vault,dir,protection}=await setup(t);let url,exchanges=0;
 const account=new AccountConnections(vault,{cliRoot:path.join(dir,'claude'),openExternal:async value=>{url=new URL(value);},fetcher:async(value,options)=>{
  if(value.endsWith('jwks.json') || value.endsWith('/certs'))return response((await signing()).jwks);
  if(value.includes('oauth/token') || value==='https://oauth2.googleapis.com/token'){
   exchanges++;const form=options.body;assert.equal(form.get('code'),'test-code');assert.equal(form.get('redirect_uri'),url.searchParams.get('redirect_uri'));assert.equal(crypto.createHash('sha256').update(form.get('code_verifier')).digest('base64url'),url.searchParams.get('code_challenge'));
   return response({access_token:'access-secret',refresh_token:'refresh-secret',id_token:await identity({nonce:url.searchParams.get('nonce'),client:provider==='chatgpt'?'oaiapp_test':'123.apps.googleusercontent.com',issuer:provider==='chatgpt'?'https://auth.openai.com':'https://accounts.google.com',subject}),expires_in:3600,scope});
  }
  throw new Error('Unexpected endpoint '+value);
 }});t.after(()=>account.destroy());
 if(provider==='gemini')await account.configureGoogle(JSON.stringify({installed:{client_id:'123.apps.googleusercontent.com',client_secret:'desktop-secret',project_id:'research-project'}}));
 return {account,vault,dir,protection,getUrl:()=>url,exchanges:()=>exchanges};
}
async function callback(ctx,extra={}){const url=new URL(ctx.getUrl().searchParams.get('redirect_uri'));url.search=new URLSearchParams({state:ctx.getUrl().searchParams.get('state'),code:'test-code',client_id:'oaiapp_test',...extra});return fetch(url);}
test('vault encrypts credentials, persists host identity, and refuses unavailable OS protection',async t=>{
 const {vault,dir,protection}=await setup(t);await vault.update(data=>data.accounts.push({id:'one',accessToken:'very-sensitive-token'}));const raw=await fs.readFile(vault.file);assert.ok(!raw.includes(Buffer.from('very-sensitive-token')));const reload=new CredentialVault(vault.file,protection);await reload.init();assert.equal(reload.data.hostId,vault.data.hostId);assert.equal(reload.data.accounts[0].accessToken,'very-sensitive-token');
 const unavailable=new CredentialVault(path.join(dir,'unsafe.bin'),{isEncryptionAvailable:()=>false});await assert.rejects(unavailable.init(),/Secure OS/);const insecure=new CredentialVault(path.join(dir,'basic.bin'),{isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'basic_text'});await assert.rejects(insecure.init(),/Secure OS/);
});
test('OIDC validates signature, issuer, audience, expiry, and nonce',async()=>{
 const fetcher=async()=>response((await signing()).jwks);assert.equal((await verifyIdentity(await identity(),'chatgpt','oaiapp_test','nonce',fetcher)).subject,'person');
 for(const opts of [{client:'wrong'},{issuer:'https://attacker.test'},{expired:true},{nonce:'wrong'}])await assert.rejects(verifyIdentity(await identity(opts),'chatgpt','oaiapp_test','nonce',fetcher));
 const token=(await identity()).split('.');token[2]=(token[2][0]==='a'?'b':'a')+token[2].slice(1);await assert.rejects(verifyIdentity(token.join('.'),'chatgpt','oaiapp_test','nonce',fetcher));
});
test('ChatGPT browser sign-in uses PKCE, rejects bad state, validates identity, and redacts credentials',async t=>{
 const ctx=await oauth(t);const {attemptId}=await ctx.account.start('chatgpt');const url=ctx.getUrl();assert.equal(url.origin,'https://auth.openai.com');assert.equal(url.searchParams.get('client_id'),'dynamic_agent_client');assert.equal(url.searchParams.get('ext_agent_host_id'),ctx.vault.data.hostId);assert.equal(url.searchParams.get('agent_name_hint'),'Daevu');assert.equal(new URL(url.searchParams.get('redirect_uri')).hostname,'127.0.0.1');
 assert.equal((await callback(ctx,{state:'wrong'})).status,400);assert.equal(ctx.exchanges(),0);assert.equal((await callback(ctx,{state:'é'.repeat(64)})).status,400);assert.equal((await callback(ctx)).status,200);assert.equal(ctx.exchanges(),1);assert.equal(ctx.account.pending.size,0);
 const publicState=ctx.account.list(),account=ctx.vault.data.accounts[0];assert.equal(account.clientId,'oaiapp_test');assert.equal(publicState.accounts[0].planEnabled,true);assert.equal(publicState.accounts[0].welcomePending,true);for(const secret of ['access-secret','refresh-secret',account.idToken])assert.ok(!JSON.stringify(publicState).includes(secret));await ctx.account.acknowledge(account.id);assert.equal(ctx.account.list().accounts[0].welcomePending,false);
 await ctx.account.start('chatgpt',account.id);assert.equal(ctx.getUrl().searchParams.get('client_id'),'oaiapp_test');assert.equal(ctx.getUrl().searchParams.has('agent_name_hint'),false);assert.ok(ctx.getUrl().searchParams.get('id_token_hint'));assert.notEqual(ctx.getUrl().searchParams.get('state'),url.searchParams.get('state'));assert.equal((await callback(ctx,{client_id:'oaiapp_other'})).status,400);assert.equal(ctx.vault.data.accounts[0].accessToken,'access-secret');ctx.account.cancel([...ctx.account.pending.keys()][0]);
});
test('identity-only ChatGPT login cannot run inference; cancellation closes the loopback listener',async t=>{
 const ctx=await oauth(t,{scope:'openid profile email'});await ctx.account.start('chatgpt');await callback(ctx);const account=ctx.vault.data.accounts[0];assert.equal(ctx.account.list().accounts[0].planEnabled,false);const runtime=new ProviderRuntime(ctx.account,async()=>{throw new Error('Must not call inference');});await assert.rejects(runtime.run({provider:'chatgpt',connectionId:account.id,model:'available'},'Hello'),/identity only/);
 const pending=await ctx.account.start('chatgpt');const redirect=ctx.getUrl().searchParams.get('redirect_uri');ctx.account.cancel(pending.attemptId);await assert.rejects(fetch(redirect));
});
test('Google desktop configuration and account OAuth keep project, identity, and credentials separate',async t=>{
 const ctx=await oauth(t,{provider:'gemini',scope:'openid email https://www.googleapis.com/auth/generative-language.retriever'});assert.equal(ctx.account.list().googleConfigured,true);await assert.rejects(ctx.account.configureGoogle('{"web":{"client_id":"no"}}'),/Desktop/);await ctx.account.start('gemini');assert.equal(ctx.getUrl().origin,'https://accounts.google.com');assert.ok(ctx.getUrl().searchParams.get('scope').includes('cloud-platform'));assert.equal((await callback(ctx,{client_id:'123.apps.googleusercontent.com'})).status,200);assert.equal(ctx.vault.data.accounts[0].projectId,'research-project');assert.ok(!JSON.stringify(ctx.account.list()).includes('desktop-secret'));
});
test('refresh is serialized, uses issued client ID, and persists rotating refresh tokens atomically',async t=>{
 const {vault}=await setup(t);await vault.update(data=>data.accounts.push({id:'one',provider:'chatgpt',clientId:'oaiapp_saved',subject:'person',accessToken:'old',refreshToken:'old-refresh',expiresAt:0,scopes:['chatgpt.tokens.use.direct']}));let calls=0;
 const accounts=new AccountConnections(vault,{fetcher:async(url,options)=>{calls++;assert.equal(options.body.get('client_id'),'oaiapp_saved');assert.equal(options.body.get('refresh_token'),'old-refresh');assert.equal(options.body.get('scope'),null);await new Promise(r=>setTimeout(r,15));return response({access_token:'new',refresh_token:'new-refresh',expires_in:3600});}});
 const [a,b]=await Promise.all([accounts.credential('one'),accounts.credential('one')]);assert.equal(calls,1);assert.equal(a.accessToken,'new');assert.equal(b.refreshToken,'new-refresh');assert.equal(vault.data.accounts[0].refreshToken,'new-refresh');
});
test('sign-out removes credentials while retaining ChatGPT registration and reports remote failure',async t=>{
 const {vault}=await setup(t);await vault.update(data=>data.accounts.push({id:'one',provider:'chatgpt',method:'oauth',clientId:'oaiapp_saved',subject:'person',accessToken:'access',refreshToken:'refresh',idToken:'id',models:[]}));
 const accounts=new AccountConnections(vault,{fetcher:async()=>{throw new Error('offline');}});const result=await accounts.disconnect('one');assert.match(result.warning,/not confirmed/);assert.equal(vault.data.accounts[0].clientId,'oaiapp_saved');assert.equal(vault.data.accounts[0].accessToken,undefined);assert.equal(vault.data.accounts[0].refreshToken,undefined);assert.equal(vault.data.accounts[0].idToken,undefined);assert.equal(result.accounts[0].connected,false);await assert.rejects(accounts.credential('one'),/Sign in/);
});
function stream(events){return new Response(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''),{headers:{'Content-Type':'text/event-stream'}});}
test('Responses streaming requires completion, preserves citations, and surfaces plan-limit failures',async()=>{
 const text=await consumeResponses(stream([{type:'response.output_text.delta',delta:'Evidence.'},{type:'response.output_text.annotation.added',annotation:{type:'url_citation',url:'https://example.test',title:'Source'}},{type:'response.completed',response:{}}]));assert.match(text,/Evidence/);assert.match(text,/https:\/\/example.test/);
 await assert.rejects(consumeResponses(stream([{type:'response.output_text.delta',delta:'Partial'}])),/before.*completed/);
 await assert.rejects(consumeResponses(stream([{type:'response.output_text.delta',delta:'Partial'},{type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded'}}}])),/Manage usage/);
 await assert.rejects(consumeResponses(stream([{type:'response.incomplete'}])),/did not complete/);
});
test('direct ChatGPT runtime uses account models, public Responses, stream=true and store=false',async()=>{
 let request;const account={id:'one',provider:'chatgpt',accessToken:'secret',scopes:['chatgpt.tokens.use.direct']},accounts={async credential(){return account;},async models(){return [{id:'allowed'}];}};
 const runtime=new ProviderRuntime(accounts,async(url,options)=>{request={url,options};return stream([{type:'response.output_text.delta',delta:'Done'},{type:'response.completed'}]);});assert.equal(await runtime.run({provider:'chatgpt',connectionId:'one',model:'allowed',webSearch:true},'Research'), 'Done');assert.equal(request.url,'https://api.openai.com/v1/responses');const body=JSON.parse(request.options.body);assert.equal(body.store,false);assert.equal(body.stream,true);assert.deepEqual(body.input,[{role:'user',content:'Research'}]);assert.deepEqual(body.tools,[{type:'web_search'}]);assert.equal(body.previous_response_id,undefined);await assert.rejects(runtime.run({provider:'chatgpt',connectionId:'one',model:'removed'},'Research'),/no longer available/);await assert.rejects(runtime.run({provider:'gemini',connectionId:'one',model:'allowed'},'Research'),/do not match/);
});
test('API connections validate keys through model listing and never expose their secrets',async t=>{
 const {vault}=await setup(t);let key;
 const accounts=new AccountConnections(vault,{fetcher:async(url,options)=>{assert.equal(url,'https://api.anthropic.com/v1/models');key=options.headers['x-api-key'];return response({data:[{id:'model-id',display_name:'Model'}]});}});
 const result=await accounts.addKey('claude-api','private-key','Research API');assert.equal(key,'private-key');assert.equal(result.accounts[0].models[0].id,'model-id');assert.ok(!JSON.stringify(result).includes('private-key'));
});
test('Claude browser login is isolated and cancellation never marks an account connected',async t=>{
 const {vault,dir}=await setup(t);let calls=[];
 const accounts=new AccountConnections(vault,{cliRoot:path.join(dir,'claude'),executeCLI:async(command,args,prompt,cwd,signal,timeout,progress,env)=>{calls.push({command,args,cwd,env});return args[1]==='status'?JSON.stringify({loggedIn:true,email:'claude@example.test'}):'';}});t.after(()=>accounts.destroy());await accounts.start('claude');while(accounts.pending.size)await new Promise(r=>setTimeout(r,5));assert.equal(accounts.list().accounts[0].connected,true);assert.ok(calls[0].env.CLAUDE_CONFIG_DIR.startsWith(dir));assert.equal(calls[0].env.ANTHROPIC_API_KEY,undefined);assert.deepEqual(calls[0].args,['auth','login']);await accounts.disconnect(vault.data.accounts[0].id);assert.deepEqual(calls.at(-1).args,['auth','logout']);
});

test('a sign-out waits for token rotation, revokes the replacement, and blocks new requests',async t=>{
 const {vault}=await setup(t);await vault.update(data=>data.accounts.push({id:'one',provider:'chatgpt',method:'oauth',clientId:'oaiapp_saved',subject:'person',accessToken:'old',refreshToken:'old-refresh',expiresAt:0,scopes:['chatgpt.tokens.use.direct']}));let release,revoked;const gate=new Promise(r=>release=r);
 const accounts=new AccountConnections(vault,{fetcher:async(url,options)=>{
  if(url.includes('oauth/token')){await gate;return response({access_token:'new',refresh_token:'rotated-refresh',expires_in:3600});}
  if(url.includes('openid-configuration'))return response({revocation_endpoint:'https://auth.openai.com/revoke'});
  revoked=options.body.get('token');return new Response(null,{status:200});
 }});
 const refresh=accounts.credential('one');await new Promise(r=>setTimeout(r,5));const disconnect=accounts.disconnect('one');await assert.rejects(accounts.credential('one'),/signing out/);release();await refresh;await disconnect;assert.equal(revoked,'rotated-refresh');assert.equal(vault.data.accounts[0].accessToken,undefined);
});
test('failed API key validation leaves no connected account behind',async t=>{
 const {vault}=await setup(t);const accounts=new AccountConnections(vault,{fetcher:async()=>response({error:{code:'invalid_api_key'}},401)});await assert.rejects(accounts.addKey('openai-api','invalid','Invalid'),/sign-in/);assert.equal(vault.data.accounts.length,0);
});
test('direct Gemini and Claude adapters authenticate correctly and reject partial output',async()=>{
 let captured;const account={id:'one',provider:'gemini',accessToken:'google-token',projectId:'project',scopes:[]},accounts={async credential(){return account;},async models(){return [{id:'allowed'}];}};
 const runtime=new ProviderRuntime(accounts,async(url,options)=>{captured={url,options};return response({candidates:[{finishReason:'STOP',content:{parts:[{text:'Evidence'}]},groundingMetadata:{groundingChunks:[{web:{title:'Reference',uri:'https://example.test'}}]}}]});});const text=await runtime.run({provider:'gemini',connectionId:'one',model:'allowed',webSearch:true},'Question');assert.match(text,/Reference/);assert.equal(captured.options.headers.Authorization,'Bearer google-token');assert.equal(captured.options.headers['x-goog-user-project'],'project');assert.deepEqual(JSON.parse(captured.options.body).tools,[{google_search:{}}]);
 account.provider='claude-api';account.apiKey='anthropic-key';const claude=new ProviderRuntime(accounts,async(url,options)=>{captured={url,options};return response({stop_reason:'end_turn',content:[{type:'text',text:'Claude finding'}]});});assert.equal(await claude.run({provider:'claude-api',connectionId:'one',model:'allowed'},'Question'),'Claude finding');assert.equal(captured.options.headers['x-api-key'],'anthropic-key');assert.equal(captured.url,'https://api.anthropic.com/v1/messages');const partial=new ProviderRuntime(accounts,async()=>response({stop_reason:'max_tokens',content:[{type:'text',text:'Partial'}]}));await assert.rejects(partial.run({provider:'claude-api',connectionId:'one',model:'allowed'},'Question'),/response limit/);
});

test('reauthorization cannot replace a saved account with a different validated subject',async t=>{
 const ctx=await oauth(t);await ctx.account.start('chatgpt');await callback(ctx);const previous=structuredClone(ctx.vault.data.accounts[0]);await ctx.account.start('chatgpt',previous.id);const original=ctx.account.fetch;
 ctx.account.fetch=async(url,options)=>String(url).includes('oauth/token') ? response({access_token:'wrong-person-token',refresh_token:'wrong-refresh',expires_in:3600,scope:'openid chatgpt.tokens.use.direct',id_token:await identity({nonce:ctx.getUrl().searchParams.get('nonce'),subject:'different-person'})}) : original(url,options);
 assert.equal((await callback(ctx)).status,400);assert.equal(ctx.vault.data.accounts[0].subject,'person');assert.equal(ctx.vault.data.accounts[0].accessToken,previous.accessToken);assert.match(ctx.account.list().pending[0].error,/different account/);
});
