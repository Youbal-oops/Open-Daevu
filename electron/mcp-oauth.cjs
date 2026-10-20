const http=require('node:http');
const {randomBytes,timingSafeEqual}=require('node:crypto');
const {auth}=require('@modelcontextprotocol/sdk/client/auth.js');
const equal=(a,b)=>typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
class McpOAuth {
  constructor(vault,{openExternal=async()=>{},timeoutMs=300000,fetcher=fetch}={}){this.vault=vault;this.openExternal=openExternal;this.timeoutMs=timeoutMs;this.fetcher=fetcher;this.pending=new Map();}
  provider(name,interactive) {
    const current=()=>this.vault.data.mcpServers?.[name]?.oauth || {};
    const save=async(key,value)=>this.vault.update(data=>{const record=data.mcpServers?.[name];if(!record)throw Error('This connection was removed.');record.oauth ||= {};if(value===undefined)delete record.oauth[key];else record.oauth[key]=value;});
    let verifier;
    return {
      get redirectUrl(){return interactive?.redirect || current().redirect;},
      get clientMetadata(){return {client_name:'Daevu',redirect_uris:[this.redirectUrl],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'};},
      state:()=>interactive?.state,
      clientInformation:()=>current().client,
      saveClientInformation:value=>save('client',value),
      tokens:()=>current().tokens,
      saveTokens:value=>save('tokens',value),
      saveCodeVerifier:value=>{verifier=value;},
      codeVerifier:()=>{if(!verifier)throw Error('Start sign-in again.');return verifier;},
      redirectToAuthorization:async value=>{
        if(!interactive)throw Error('Sign in from Connections before using this server.');
        const url=new URL(value);if(url.protocol!=='https:' || url.username || url.password)throw Error('The service returned an unsafe sign-in URL.');
        interactive.redirected=true;await this.openExternal(url.href);
      },
      invalidateCredentials:async scope=>{if(scope==='all'||scope==='client')await save('client',undefined);if(scope==='all'||scope==='tokens')await save('tokens',undefined);if(scope==='all'||scope==='verifier')verifier=undefined;}
    };
  }
  async signIn(name) {
    const record=this.vault.data.mcpServers?.[name];
    if(!record?.config?.url)throw Error('Browser sign-in requires an app-managed remote MCP connection.');
    if(this.pending.has(name))throw Error('Sign-in is already open for this connection.');
    const controller=new AbortController(),state=randomBytes(32).toString('hex');
    let resolveCode,rejectCode;
    const code=new Promise((resolve,reject)=>{resolveCode=resolve;rejectCode=reject;});code.catch(()=>{});
    const server=http.createServer((req,res)=>{
      res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
      const url=new URL(req.url,'http://127.0.0.1');
      if(req.method!=='GET'||url.pathname!=='/mcp/callback'||!equal(url.searchParams.get('state'),state)){res.writeHead(400);res.end('Invalid sign-in callback.');return;}
      const value=url.searchParams.get('code');
      if(url.searchParams.has('error')||!value||value.length>10000){res.writeHead(400);res.end('Authorization was declined. Return to Daevu.');rejectCode(Error('Authorization was declined.'));return;}
      res.end('Authorization received. Return to Daevu to finish connecting.');resolveCode(value);
    });
    const stop=()=>{controller.abort();rejectCode(Error('Sign-in cancelled.'));server.closeAllConnections();server.close();};
    this.pending.set(name,stop);
    const timer=setTimeout(stop,this.timeoutMs);timer.unref?.();
    try {
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
      const redirect=`http://127.0.0.1:${server.address().port}/mcp/callback`;
      // Dynamic registrations bind a redirect URI. Obtain a fresh registration for this loopback port.
      await this.vault.update(data=>{const r=data.mcpServers?.[name];if(!r)throw Error();r.oauth={redirect};});
      const context={redirect,state,redirected:false},provider=this.provider(name,context);
      const fetchFn=(url,init)=>this.fetcher(url,{...init,redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
      const options={serverUrl:record.config.url,fetchFn};
      const result=await auth(provider,options);
      if(result==='REDIRECT'){
        if(!context.redirected)throw Error();
        const authorizationCode=await code;
        if(controller.signal.aborted)throw Error();
        if(await auth(provider,{...options,authorizationCode})!=='AUTHORIZED')throw Error();
      }
      return {name,authorized:true};
    } catch {throw Error('MCP sign-in did not complete. The service must support public desktop clients and dynamic registration. Otherwise use its API-token setup or approved integration.');}
    finally {clearTimeout(timer);this.pending.delete(name);server.closeAllConnections();server.close();}
  }
  cancel(name){this.pending.get(name)?.();}
  async token(name,serverUrl){
    const fetchFn=(url,init)=>this.fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)});
    try{if(await auth(this.provider(name),{serverUrl,fetchFn})!=='AUTHORIZED')throw Error();return this.vault.data.mcpServers?.[name]?.oauth?.tokens?.access_token;}
    catch{throw Error('Sign in to this MCP connection again before using it with Claude CLI.');}
  }
  destroy(){for(const stop of this.pending.values())stop();}
}
module.exports={McpOAuth,equal};
