const {compatibleBase,serviceModels,decide}=require('./ai-services.cjs');
const { replaceFile } = require('./fs-utils.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { randomUUID, randomBytes, createHash, timingSafeEqual } = crypto;
const CHATGPT_SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const GOOGLE_SCOPE = 'openid email profile https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/generative-language.retriever';
const ENDPOINTS = Object.freeze({
  chatgpt: { authorize: 'https://auth.openai.com/api/accounts/authorize', token: 'https://auth.openai.com/api/accounts/oauth/token', issuer: 'https://auth.openai.com', jwks: 'https://auth.openai.com/.well-known/jwks.json', discovery: 'https://auth.openai.com/.well-known/openid-configuration' },
  gemini: { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', issuer: 'https://accounts.google.com', jwks: 'https://www.googleapis.com/oauth2/v3/certs', revoke: 'https://oauth2.googleapis.com/revoke' }
});
const safeEqual = (a,b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const publicAccount = a => ({ id:a.id, provider:a.provider, method:a.method, label:a.label, email:a.email || '', clientLabel:a.clientId ? a.clientId.slice(-10) : '', connected:Boolean(a.apiKey || a.accessToken || a.method === 'cli' && a.connected), planEnabled:a.provider === 'chatgpt' ? Boolean(a.scopes?.includes('chatgpt.tokens.use.direct')) : false, baseUrl:a.baseUrl || '',protocol:a.protocol || (a.provider==='typesafe'?'systemone':'chat-completions'),models:a.models || [], welcomePending:Boolean(a.welcomePending), updatedAt:a.updatedAt });
class CredentialVault {
  constructor(file, protection) { this.file=file;this.protection=protection;this.queue=Promise.resolve(); }
  available() { return this.protection.isEncryptionAvailable() && this.protection.getSelectedStorageBackend?.() !== 'basic_text'; }
  async init() {
    if (!this.available()) throw new Error('Secure OS credential storage is unavailable. Account connections are disabled.');
    try { this.data=JSON.parse(this.protection.decryptString(await fs.readFile(this.file))); }
    catch(e) { if(e.code !== 'ENOENT') throw new Error('Account credentials could not be unlocked. Restore this Windows user profile to access them.'); this.data={version:1,hostId:`urn:uuid:${randomUUID()}`,accounts:[],googleClient:null};await this.save(); }
    if(this.data.version !== 1 || !Array.isArray(this.data.accounts) || !this.data.hostId) throw new Error('Unsupported credential vault.');
  }
  async save() {
    if(!this.available()) throw new Error('Secure OS credential storage is unavailable.');
    await fs.mkdir(path.dirname(this.file),{recursive:true});
    await fs.writeFile(this.file+'.tmp',this.protection.encryptString(JSON.stringify(this.data)),{mode:0o600});await replaceFile(this.file+'.tmp',this.file);
  }
  update(fn) {
    const operation=this.queue.then(async()=>{const old=structuredClone(this.data);try { const result=fn(this.data);await this.save();return result; } catch(e){this.data=old;throw e;} });this.queue=operation.catch(()=>{});return operation;
  }
}
async function jsonRequest(fetcher,url,options={}) {
  const response=await fetcher(url,{...options,redirect:'error',signal:options.signal || AbortSignal.timeout(30000)});
  if(!response.ok) { let code='';try {const body=await response.json();code=String(body.error?.code || body.error?.status || body.error || '').replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,100);}catch{}
    const error=new Error(response.status === 401 || code === 'invalid_grant' ? 'This connection needs sign-in again.' : response.status === 429 ? 'Provider usage limit reached. Review your plan or API billing.' : `Provider request failed (${response.status}${code ? `: ${code}` : ''}).`);error.status=response.status;error.code=code;throw error;
  }
  return response.json();
}
async function verifyIdentity(token, provider, clientId, nonce, fetcher=fetch) {
  if(typeof token !== 'string') throw new Error('The provider did not return a verifiable identity.');
  const {jwtVerify,createLocalJWKSet}=await import('jose');
  const keys=await jsonRequest(fetcher,ENDPOINTS[provider].jwks);
  const {payload}=await jwtVerify(token,createLocalJWKSet(keys),{issuer:ENDPOINTS[provider].issuer,audience:clientId,requiredClaims:['sub','exp','iat'],algorithms:['RS256','ES256'],clockTolerance:5});
  if(typeof payload.sub !== 'string' || !payload.sub)throw new Error('The provider identity has no subject.');
  if(nonce != null && !safeEqual(payload.nonce,nonce)) throw new Error('The sign-in identity could not be verified.');
  if(payload.azp && payload.azp !== clientId) throw new Error('The sign-in client did not match.');
  return {subject:payload.sub,email:typeof payload.email === 'string' ? payload.email : '',name:typeof payload.name === 'string' ? payload.name : ''};
}
class AccountConnections {
  constructor(vault,{fetcher=fetch,openExternal=async()=>{},onChange=()=>{},executeCLI,cliRoot,timeoutMs=600000}={}) {
    this.vault=vault;this.fetch=fetcher;this.openExternal=openExternal;this.onChange=onChange;this.executeCLI=executeCLI;this.cliRoot=cliRoot;this.timeoutMs=timeoutMs;this.pending=new Map();this.refreshes=new Map();this.disconnects=new Map();this.signingOut=new Set();this.epochs=new Map();
  }
  list() { return {accounts:this.vault.data.accounts.map(publicAccount),googleConfigured:Boolean(this.vault.data.googleClient),pending:[...this.pending.values()].map(p=>({id:p.id,provider:p.provider,accountId:p.accountId,phase:p.phase,error:p.error || ''}))}; }
  emit(){this.onChange(this.list());}
  account(id){const a=this.vault.data.accounts.find(a=>a.id===id);if(!a)throw new Error('Unknown account connection.');return a;}
  async configureGoogle(json) {
    let value;try {value=JSON.parse(json).installed;}catch{}
    if(!value || !/^[a-zA-Z0-9_.-]+\.apps\.googleusercontent\.com$/.test(value.client_id || '') || typeof value.client_secret !== 'string' || value.client_secret.length > 1000) throw new Error('Choose the Google OAuth JSON for an application of type Desktop app.');
    await this.vault.update(data=>{data.googleClient={clientId:value.client_id,clientSecret:value.client_secret,projectId:typeof value.project_id === 'string' ? value.project_id : undefined};});this.emit();return this.list();
  }
  async acknowledge(id){await this.vault.update(data=>{const a=data.accounts.find(a=>a.id===id);if(a)a.welcomePending=false;});this.emit();return this.list();}
  async rename(id,label){if(typeof label !== 'string' || !label.trim() || label.length>100)throw new Error('Enter an account label under 100 characters.');await this.vault.update(data=>{const a=data.accounts.find(a=>a.id===id);if(!a)throw new Error('Unknown connection.');a.label=label.trim();});this.emit();return this.list();}
  async start(provider,accountId) {
    if(!['chatgpt','gemini','claude'].includes(provider))throw new Error('Choose a supported sign-in provider.');
    const previous=accountId ? this.account(accountId) : null;
    if(previous && previous.provider !== provider)throw new Error('The account provider did not match.');
    if([...this.pending.values()].some(p=>p.phase==='waiting' || p.phase==='verifying'))throw new Error('Finish or cancel the current sign-in first.');
    const pending={id:randomUUID(),provider,accountId,phase:'waiting',controller:new AbortController()};this.pending.set(pending.id,pending);
    try {
      if(provider==='claude') { this.startClaude(pending,previous).catch(()=>{});this.emit();return {attemptId:pending.id}; }
      const client=provider==='chatgpt' ? {clientId:previous?.clientId || 'dynamic_agent_client'} : previous ? {clientId:previous.clientId,clientSecret:previous.clientSecret,projectId:previous.projectId} : this.vault.data.googleClient;
      if(!client)throw new Error('Configure your Google Desktop OAuth client before connecting Gemini.');
      const verifier=randomBytes(48).toString('base64url'),state=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url');
      const server=http.createServer((request,response)=>this.callback(request,response,pending).catch(()=>{}));pending.server=server;
      server.headersTimeout=10000;server.requestTimeout=10000;
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
      const redirect=`http://127.0.0.1:${server.address().port}/auth/callback`;
      Object.assign(pending,{state,nonce,verifier,redirect,client,previous:previous ? structuredClone(previous) : null});
      const url=new URL(ENDPOINTS[provider].authorize);
      const params={client_id:client.clientId,response_type:'code',redirect_uri:redirect,scope:provider==='chatgpt' ? CHATGPT_SCOPE : GOOGLE_SCOPE,state,nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')};
      if(provider==='chatgpt') {params.resource='https://api.openai.com/v1';params.ext_agent_host_id=this.vault.data.hostId;if(previous){if(previous.idToken)params.id_token_hint=previous.idToken;if(previous.email)params.login_hint=previous.email;}else params.agent_name_hint='Daevu';}
      else {params.access_type='offline';params.prompt='consent select_account';if(previous?.email)params.login_hint=previous.email;}
      url.search=new URLSearchParams(params).toString();pending.timer=setTimeout(()=>this.fail(pending,'Sign-in timed out. Please try again.'),this.timeoutMs);pending.timer.unref?.();
      await this.openExternal(url.href);this.emit();return {attemptId:pending.id};
    }catch(e){this.fail(pending,e.message);throw e;}
  }
  respond(response,status,message){response.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});response.end(`<!doctype html><html><head><title>Daevu</title></head><body style="font:16px system-ui;background:#171919;color:#eeeae2;padding:60px"><h1>Daevu</h1><p>${message}</p><p>You can close this tab and return to the app.</p></body></html>`);}
  close(p){clearTimeout(p.timer);p.server?.close();p.server?.closeIdleConnections?.();}
  fail(p,message){if(!this.pending.has(p.id))return;this.close(p);p.controller.abort();p.phase='error';p.error=message;this.emit();}
  cancel(id){const p=this.pending.get(id);if(p){this.close(p);p.controller.abort();this.pending.delete(id);this.emit();}return this.list();}
  async callback(request,response,p) {
    const url=new URL(request.url,'http://127.0.0.1');
    if(request.method!=='GET' || url.pathname!=='/auth/callback'){response.writeHead(404);response.end();return;}
    if(!this.pending.has(p.id) || p.phase!=='waiting'){this.respond(response,409,'This sign-in attempt is no longer active.');return;}
    if(url.searchParams.getAll('state').length!==1 || !safeEqual(url.searchParams.get('state'),p.state)){this.respond(response,400,'Sign-in could not be verified. Start again in the app.');return;}
    p.phase='verifying';this.emit();
    if(url.searchParams.has('error')){this.respond(response,400,'Sign-in was declined.');this.fail(p,'Sign-in was declined. You can try again.');return;}
    try {
      const code=url.searchParams.get('code');if(!code || code.length>10000)throw new Error('The sign-in callback was incomplete.');
      let clientId=p.client.clientId;
      const issued=url.searchParams.get('client_id');
      if(p.provider==='chatgpt' && clientId==='dynamic_agent_client'){if(!/^oaiapp_[a-zA-Z0-9_-]+$/.test(issued || ''))throw new Error('The provider did not issue an application registration.');clientId=issued;}
      else if(issued && issued!==clientId)throw new Error('The sign-in client did not match this account.');
      const fields={grant_type:'authorization_code',client_id:clientId,code,code_verifier:p.verifier,redirect_uri:p.redirect};
      if(p.provider==='chatgpt')fields.resource='https://api.openai.com/v1';else fields.client_secret=p.client.clientSecret;
      const tokens=await jsonRequest(this.fetch,ENDPOINTS[p.provider].token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields),signal:p.controller.signal});
      const identity=await verifyIdentity(tokens.id_token,p.provider,clientId,p.nonce,this.fetch);
      if(p.previous && identity.subject!==p.previous.subject)throw new Error('A different account signed in. Add it as a new connection instead.');
      if(!tokens.access_token || !Number.isFinite(Number(tokens.expires_in)))throw new Error('The provider returned an incomplete token response.');
      if(p.controller.signal.aborted)throw new Error('Sign-in was cancelled.');
      await this.vault.update(data=>{
        if(p.controller.signal.aborted)throw new Error('Sign-in was cancelled.');
        const existing=p.previous || data.accounts.find(a=>a.provider===p.provider && a.clientId===clientId && a.subject===identity.subject);
        const scopes=String(tokens.scope || '').split(/\s+/).filter(Boolean);
        const account={...existing,id:existing?.id || randomUUID(),provider:p.provider,method:'oauth',...identity,clientId,clientSecret:p.provider==='gemini' ? p.client.clientSecret : undefined,projectId:p.client.projectId,label:existing?.label || `${identity.email || identity.name || 'Account'} · ${clientId.slice(-6)}`,accessToken:tokens.access_token,refreshToken:tokens.refresh_token || existing?.refreshToken,idToken:tokens.id_token,expiresAt:Date.now()+Number(tokens.expires_in)*1000,scopes,models:[],updatedAt:new Date().toISOString(),welcomePending:p.provider==='chatgpt' && scopes.includes('chatgpt.tokens.use.direct') && !existing?.planWelcomed,planWelcomed:existing?.planWelcomed || p.provider==='chatgpt' && scopes.includes('chatgpt.tokens.use.direct')};
        const index=data.accounts.findIndex(a=>a.id===account.id);if(index<0)data.accounts.push(account);else data.accounts[index]=account;
      });
      this.respond(response,200,'Your account is connected.');this.close(p);this.pending.delete(p.id);this.emit();
    }catch(e){this.respond(response,400,'Sign-in could not be completed. Check the app for details.');this.fail(p, e.message.startsWith('Provider') || /different account|incomplete|registration|client did not match|cancelled/.test(e.message) ? e.message : 'Sign-in identity validation failed. Please try again.');}
  }
  async startClaude(p,previous) {
    try {
      if(!this.executeCLI)throw new Error('The Claude CLI adapter is unavailable.');
      const id=previous?.id || randomUUID(),dir=path.join(this.cliRoot,id);await fs.mkdir(dir,{recursive:true});
      const env={CLAUDE_CONFIG_DIR:dir,ANTHROPIC_API_KEY:undefined,ANTHROPIC_AUTH_TOKEN:undefined,CLAUDE_CODE_OAUTH_TOKEN:undefined};
      await this.executeCLI('claude',['auth','login'],'',dir,p.controller.signal,this.timeoutMs,()=>{},env);
      const result=JSON.parse(await this.executeCLI('claude',['auth','status'],'',dir,p.controller.signal,15000,()=>{},env));
      if(!result.loggedIn)throw new Error('Claude did not confirm a signed-in account.');
      if(p.controller.signal.aborted)return;
      await this.vault.update(data=>{if(p.controller.signal.aborted)throw new Error('Sign-in was cancelled.');const account={id,provider:'claude',method:'cli',connected:true,email:result.email || '',label:previous?.label || result.email || 'Claude account',models:[],updatedAt:new Date().toISOString()};const i=data.accounts.findIndex(a=>a.id===id);if(i<0)data.accounts.push(account);else data.accounts[i]=account;});this.pending.delete(p.id);this.emit();
    }catch(e){this.fail(p,/Could not find/.test(e.message) ? 'Install Claude Code to use its browser sign-in, or connect a Claude API key.' : p.controller.signal.aborted ? 'Sign-in cancelled.' : 'Claude sign-in did not complete. Check your Claude installation and try again.');}
  }
  async credential(id) {
    if(this.signingOut.has(id))throw new Error('This account is signing out.');
    const account=this.account(id);
    if(account.apiKey || account.method==='cli')return account;
    if(!account.accessToken)throw new Error('Sign in to this account again in Connections.');
    if(account.expiresAt>Date.now()+60000)return account;
    if(!this.refreshes.has(id)){
      const epoch=this.epochs.get(id)||0;
      const refresh=(async()=>{
        const current=structuredClone(this.account(id));if(!current.refreshToken)throw new Error('Sign in again to renew this account.');
        const fields={grant_type:'refresh_token',client_id:current.clientId,refresh_token:current.refreshToken};if(current.provider==='chatgpt')fields.resource='https://api.openai.com/v1';else fields.client_secret=current.clientSecret;
        const tokens=await jsonRequest(this.fetch,ENDPOINTS[current.provider].token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields)});
        if(!tokens.access_token || !Number.isFinite(Number(tokens.expires_in)) || current.provider==='chatgpt' && !tokens.refresh_token)throw new Error('The provider returned incomplete refreshed credentials. Sign in again.');
        if(tokens.id_token){const identity=await verifyIdentity(tokens.id_token,current.provider,current.clientId,null,this.fetch);if(identity.subject!==current.subject)throw new Error('The renewed identity did not match this account.');}
        await this.vault.update(data=>{const a=data.accounts.find(a=>a.id===id);if(!a || (this.epochs.get(id)||0)!==epoch || !a.accessToken)throw new Error('The account was disconnected.');Object.assign(a,{accessToken:tokens.access_token,refreshToken:tokens.refresh_token || a.refreshToken,idToken:tokens.id_token || a.idToken,expiresAt:Date.now()+Number(tokens.expires_in)*1000,scopes:tokens.scope ? tokens.scope.split(/\s+/) : a.scopes});});this.emit();return this.account(id);
      })().finally(()=>this.refreshes.delete(id));this.refreshes.set(id,refresh);
    }
    return this.refreshes.get(id);
  }
  async models(id,signal) {
    const a=await this.credential(id);let models=[];
    if(a.provider==='claude')return [];
    if(['openrouter','compatible','typesafe'].includes(a.provider))models=await serviceModels(a,this.fetch,jsonRequest,signal);
    if(a.provider==='chatgpt' || a.provider==='openai-api'){
      const result=await jsonRequest(this.fetch,'https://api.openai.com/v1/models',{headers:{Authorization:`Bearer ${a.accessToken || a.apiKey}`},signal});
      models=a.provider==='chatgpt' ? (result.models || []).filter(m=>m.visibility==='list').map(m=>({id:m.slug,name:m.display_name || m.slug})) : (result.data || []).filter(m=>/^(gpt-|o\d|chatgpt-)/.test(m.id) && !/audio|realtime|image|transcrib|tts/.test(m.id)).map(m=>({id:m.id,name:m.id}));
    }else if(a.provider==='claude-api'){
      const result=await jsonRequest(this.fetch,'https://api.anthropic.com/v1/models',{headers:{'x-api-key':a.apiKey,'anthropic-version':'2023-06-01'},signal});models=(result.data || []).map(m=>({id:m.id,name:m.display_name || m.id}));
    }else if(a.provider==='gemini'){
      const headers=a.apiKey ? {'x-goog-api-key':a.apiKey} : {Authorization:`Bearer ${a.accessToken}`};if(a.projectId)headers['x-goog-user-project']=a.projectId;let next='';
      for(let page=0;page<10;page++){
        const url=new URL('https://generativelanguage.googleapis.com/v1beta/models');url.searchParams.set('pageSize','100');if(next)url.searchParams.set('pageToken',next);
        const result=await jsonRequest(this.fetch,url.href,{headers,signal});models.push(...(result.models || []).filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>({id:m.name.replace(/^models\//,''),name:m.displayName || m.name})));next=result.nextPageToken;if(!next)break;
      }
    }
    models=models.filter(m=>typeof m.id==='string' && m.id).slice(0,500);
    if(!models.length)throw new Error('No compatible models are available for this connection.');
    await this.vault.update(data=>{const target=data.accounts.find(x=>x.id===id);if(target && (target.accessToken || target.apiKey)){target.models=models;target.updatedAt=new Date().toISOString();}});this.emit();return models;
  }
  async evaluate(id,value,signal){return decide(await this.credential(id),value,this.fetch,jsonRequest,signal);}
  async addKey(provider,key,label,config={}) {
    if(!['claude-api','openai-api','gemini','openrouter','compatible','typesafe'].includes(provider) || typeof key !== 'string' || !key.trim() || key.length>1000 || /[\r\n]/.test(key))throw new Error('Choose a provider and enter a valid API key.');
    const account={id:randomUUID(),provider,method:'api-key',label:String(label || `${provider} API`).slice(0,100),apiKey:key.trim(),models:[],updatedAt:new Date().toISOString()};
    if(provider==='compatible'){if(config.protocol&&!['chat-completions','systemone'].includes(config.protocol))throw Error('Choose a supported API format.');account.protocol=config.protocol||'chat-completions';account.baseUrl=compatibleBase(config.baseUrl);if(config.models){if(typeof config.models!=='string'||config.models.length>5000)throw Error('Enter model IDs separated by commas or new lines.');account.configuredModels=[...new Set(config.models.split(/[,\n]/).map(x=>x.trim()).filter(Boolean))];if(account.configuredModels.length>100)throw Error('Configure up to 100 model IDs.');}}
    if(provider==='openrouter')await jsonRequest(this.fetch,'https://openrouter.ai/api/v1/key',{headers:{Authorization:`Bearer ${account.apiKey}`}});
    await this.vault.update(data=>{data.accounts.push(account);});
    try {await this.models(account.id);}catch(e){await this.vault.update(data=>{data.accounts=data.accounts.filter(a=>a.id!==account.id);});this.emit();throw e;}
    this.emit();return this.list();
  }
  disconnect(id) {
    if(this.disconnects.has(id))return this.disconnects.get(id);
    const operation=this.endSession(id).finally(()=>{this.disconnects.delete(id);this.signingOut.delete(id);});this.disconnects.set(id,operation);return operation;
  }
  async endSession(id) {
    this.account(id);this.signingOut.add(id);
    // Stop new requests, then revoke the latest token if an in-flight rotation completes.
    await this.refreshes.get(id)?.catch(()=>{});
    const account=structuredClone(this.account(id));this.epochs.set(id,(this.epochs.get(id)||0)+1);
    for(const p of this.pending.values())if(p.accountId===id)this.cancel(p.id);
    let warning='';
    try {
      if(account.method==='cli'){
        await this.executeCLI('claude',['auth','logout'],'',path.join(this.cliRoot,id),null,15000,()=>{},{CLAUDE_CONFIG_DIR:path.join(this.cliRoot,id),ANTHROPIC_API_KEY:undefined,ANTHROPIC_AUTH_TOKEN:undefined,CLAUDE_CODE_OAUTH_TOKEN:undefined});
      }else if(account.refreshToken || account.accessToken){
        let endpoint=ENDPOINTS[account.provider].revoke;
        if(account.provider==='chatgpt'){const config=await jsonRequest(this.fetch,ENDPOINTS.chatgpt.discovery);const url=new URL(config.revocation_endpoint);if(url.origin!=='https://auth.openai.com')throw new Error('Invalid revocation endpoint.');endpoint=url.href;}
        const fields={token:account.refreshToken || account.accessToken};if(account.provider==='chatgpt'){fields.client_id=account.clientId;fields.token_type_hint='refresh_token';}
        const response=await this.fetch(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields),signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Revocation not confirmed.');
      }
    }catch {warning='Signed out locally. Remote sign-out was not confirmed; disconnect the app in your provider account settings.';}
    await this.vault.update(data=>{const a=data.accounts.find(a=>a.id===id);if(!a)return;delete a.accessToken;delete a.refreshToken;delete a.idToken;delete a.apiKey;a.connected=false;a.models=[];});this.emit();return {...this.list(),warning};
  }
  async remove(id){const result=await this.disconnect(id);await this.vault.update(data=>{data.accounts=data.accounts.filter(a=>a.id!==id);});this.emit();return {...this.list(),warning:result.warning};}
  destroy(){for(const p of this.pending.values()){this.close(p);p.controller.abort();}this.pending.clear();}
}
module.exports={CredentialVault,AccountConnections,verifyIdentity,jsonRequest,ENDPOINTS,publicAccount};
