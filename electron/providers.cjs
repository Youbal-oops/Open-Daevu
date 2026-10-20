const {jsonRequest} = require('./accounts.cjs');
const DIRECT_PROVIDERS = new Set(['chatgpt','openai-api','claude-api','gemini','openrouter','compatible']);
async function consumeResponses(response,onProgress=()=>{}, structured=false) {
  if(!response.ok) {let code='';try{const body=await response.json();code=String(body.error?.code || '').replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,100);}catch{}
    const error=new Error(response.status===401 ? 'ChatGPT connection expired. Sign in again in Connections.' : response.status===429 || /(?:usage|rate)_limit|quota/.test(code) ? 'ChatGPT usage limit reached. Manage usage at https://chatgpt.com/settings/usage' : code.startsWith('subscription_sharing_') ? 'ChatGPT plan usage is unavailable. Check this app’s plan permission in Connections.' : `OpenAI request failed (${response.status}${code ? `: ${code}` : ''}).`);error.status=response.status;error.code=code;const retry=response.headers.get('retry-after');if(retry){const date=/^\d+$/.test(retry)?Date.now()+Number(retry)*1000:Date.parse(retry);if(Number.isFinite(date))error.retryAt=new Date(date).toISOString();}throw error;
  }
  if(!response.body)throw new Error('The provider returned an empty response stream.');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',text='',completed=false,bytes=0,citations=new Map(),output=[];
  const streamed=new Map();
  const slot=value=>{
    const id=value.item?.id || value.item_id;
    let entry=id && [...streamed.values()].find(v=>v.item.id===id);
    if(entry)return entry;
    const key=Number.isInteger(value.output_index)?value.output_index:id;
    if(key==null)throw new Error('The provider returned an output item without an identifier.');
    if(!streamed.has(key))streamed.set(key,{item:{},done:false,argumentsDone:false});
    return streamed.get(key);
  };
  const event = block => {
    const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(!data || data==='[DONE]')return;
    let value;try{value=JSON.parse(data);}catch{throw new Error('The provider returned an invalid stream event.');}
    if(value.type==='response.output_item.added' || value.type==='response.output_item.done'){
      const entry=slot(value);entry.item={...entry.item,...value.item};if(value.type.endsWith('.done'))entry.done=true;
    }
    if(value.type==='response.function_call_arguments.delta'){
      const entry=slot(value);entry.item.arguments=(entry.item.arguments || '')+String(value.delta || '');
    }
    if(value.type==='response.function_call_arguments.done'){
      const entry=slot(value);entry.item.arguments=value.arguments;entry.argumentsDone=true;
      if(value.name)entry.item.name=value.name;
    }
    if(value.type==='response.output_text.delta'){text+=value.delta || '';onProgress();}
    if(value.type==='response.output_text.annotation.added' && value.annotation?.type==='url_citation')citations.set(value.annotation.url,value.annotation.title || value.annotation.url);
    if(value.type==='response.completed') {
      completed=true; output=value.response?.output || [];
    }
    if(['response.failed','response.incomplete','error'].includes(value.type)){
      const code=String(value.response?.error?.code || value.error?.code || value.code || 'incomplete');
      throw new Error(/(?:usage|rate)_limit|quota/.test(code) ? 'ChatGPT usage limit reached. Manage usage at https://chatgpt.com/settings/usage' : code.startsWith('subscription_sharing_') ? 'ChatGPT plan usage is unavailable. Check this app’s plan permission in Connections.' : `The provider did not complete this response (${code.replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,100)}).`);
    }
  };
  try {
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>16*1024*1024)throw new Error('The provider response was too large. Narrow the request.');buffer=(buffer+decoder.decode(value,{stream:true})).replace(/\r\n/g,'\n');let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){event(buffer.slice(0,boundary));buffer=buffer.slice(boundary+2);}}
    buffer+=decoder.decode();if(buffer.trim())event(buffer);
    if(!completed)throw new Error('The connection ended before the provider completed its response. Please retry.');
    // Some streaming routes deliver final items only in output_item.done, and leave the
    // terminal response as metadata. Keep those items, including reasoning, for continuation.
    if(!output.length){
      const entries=[...streamed.values()];
      if(entries.some(v=>v.item.type==='function_call' && !v.done && !v.argumentsDone))throw new Error('The provider did not finish its tool-call arguments. Please retry.');
      output=entries.filter(v=>v.done || v.item.type==='function_call' && v.argumentsDone).map(v=>v.item);
    }
    const parts=output.flatMap(item=>item.content || []);
    if(!text)text=parts.filter(p=>p.type==='output_text').map(p=>p.text || '').join('\n');
    for(const part of parts)for(const a of part.annotations || [])if(a.type==='url_citation')citations.set(a.url,a.title || a.url);
    const calls=output.filter(x=>x.type==='function_call');
    if(calls.some(c=>!c.call_id || !c.name || typeof c.arguments!=='string' || c.status==='incomplete'))throw new Error('The provider returned an incomplete tool call. Please retry.');
    if(!text.trim() && !(structured && output.some(x=>x.type==='function_call')))throw new Error('The provider returned no text response.');
    const links=[...citations].filter(([url])=>/^https?:\/\//.test(url)).map(([url,title])=>`- [${String(title).replace(/[\[\]\n]/g,' ')}](<${url.replace(/[<>\n\r]/g,'')}>)`);
    const rendered=text+(links.length?'\n\nSources\n'+links.join('\n'):'');
    return structured ? {text:rendered,output,calls} : rendered;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
class ProviderRuntime {
  constructor(accounts,fetcher=fetch,mcp=null){this.accounts=accounts;this.fetch=fetcher;this.mcp=mcp;}
  async run(agent,prompt,signal,onProgress=()=>{},options={}){
    const images=options.images || [];if(images.length>4 || images.some(image=>!['image/png','image/jpeg','image/gif','image/webp'].includes(image.mime) || typeof image.data!=='string' || image.data.length>6800000))throw Error('Invalid image attachments.');
    let account=await this.accounts.credential(agent.connectionId);
    if(account.protocol==='systemone'||account.provider==='typesafe')throw Error('This is a decision connection. Select it under the agent’s Jev decision tool, and choose a chat connection for the agent itself.');
    if(account.provider!==agent.provider)throw new Error('The profile and account providers do not match. Choose a connection in the agent profile.');
    if(account.provider==='chatgpt' && !account.scopes?.includes('chatgpt.tokens.use.direct'))throw new Error('This account granted identity only. Reconnect and allow ChatGPT plan usage.');
    if(!agent.model?.trim())throw new Error('Select an available model in this agent profile.');
    // Re-read the selected account catalog so a removed or unavailable model is never silently substituted.
    const models=await this.accounts.models(account.id,signal);if(!models.some(m=>m.id===agent.model))throw new Error('The saved model is no longer available to this account. Choose another model in the agent profile.');
    account=await this.accounts.credential(account.id);
    if(signal?.aborted)throw new Error('Run stopped.');
    const session=this.mcp ? await this.mcp.open(options.tools ?? agent.toolIds ?? [],options.settings || {},signal,{agentId:agent.id,agentName:agent.name,onCall:options.onToolCall}) : {tools:[],close:async()=>{},call:async()=>{throw Error('MCP is not available.');}};
    if(!this.mcp && (options.tools ?? agent.toolIds ?? []).some(id=>id.startsWith('mcp:')))throw new Error('MCP connections are unavailable.');
    const functions=[...session.tools,...(options.functions || []).map(({name,description,parameters})=>({name,description,parameters}))];
    let callCount=0;
    const invoke=async(name,args)=>{
      if(signal?.aborted)throw new Error('Run stopped.');
      if(++callCount>128)throw new Error('Tool call limit reached. Narrow this request.');
      try {const parsed=typeof args==='string'?JSON.parse(args):args;const internal=options.functions?.find(t=>t.name===name);return internal ? JSON.stringify(await internal.call(parsed)) : await session.call(name,parsed);}
      catch(e){if(signal?.aborted)throw new Error('Run stopped.');return JSON.stringify({error:e.message});}
    };
    try {
    if(['openrouter','compatible'].includes(account.provider))return await require('./ai-services.cjs').compatibleChat(account,agent,prompt,images,functions,invoke,this.fetch,jsonRequest,signal,onProgress);
    if(account.provider==='chatgpt' || account.provider==='openai-api'){
      const input=[{role:'user',content:images.length?[...images.map(image=>({type:'input_image',image_url:`data:${image.mime};base64,${image.data}`,detail:'auto'})),{type:'input_text',text:prompt}]:prompt}];
      for(let round=0;round<48;round++) {
        const body={model:agent.model,input,stream:true,store:false};const tools=[];if(agent.webSearch !== false)tools.push({type:'web_search'});
        tools.push(...functions.map(t=>({type:'function',...t,strict:false})));if(tools.length)body.tools=tools;
        if(functions.length)body.include=['reasoning.encrypted_content'];
        const response=await this.fetch('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${account.accessToken || account.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal});
        const result=await consumeResponses(response,onProgress,true);
        if(!result.calls.length)return result.text;
        input.push(...result.output);
        for(const call of result.calls) input.push({type:'function_call_output',call_id:call.call_id,output:await invoke(call.name,call.arguments)});
      }
      throw new Error('Tool round limit reached. Narrow this request.');
    }
    if(account.provider==='claude-api'){
      const messages=[{role:'user',content:images.length?[...images.map(image=>({type:'image',source:{type:'base64',media_type:image.mime,data:image.data}})),{type:'text',text:prompt}]:prompt}];
      for(let round=0;round<48;round++) {
        const body={model:agent.model,max_tokens:8192,messages};if(functions.length)body.tools=functions.map(t=>({name:t.name,description:t.description,input_schema:t.parameters}));
        const result=await jsonRequest(this.fetch,'https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':account.apiKey,'anthropic-version':'2023-06-01','Content-Type':'application/json'},body:JSON.stringify(body),signal});
        if(result.stop_reason==='max_tokens')throw new Error('Claude reached its response limit. Narrow the question and retry.');
        const calls=(result.content || []).filter(c=>c.type==='tool_use');
        if(!calls.length){const text=(result.content || []).filter(c=>c.type==='text').map(c=>c.text).join('\n');if(!text.trim())throw new Error('Claude returned no text response.');onProgress();return text;}
        messages.push({role:'assistant',content:result.content});const content=[];
        for(const call of calls)content.push({type:'tool_result',tool_use_id:call.id,content:await invoke(call.name,call.input)});
        messages.push({role:'user',content});
      }
      throw new Error('Tool round limit reached. Narrow this request.');
    }
    if(account.provider==='gemini'){
      const headers={'Content-Type':'application/json',...(account.apiKey ? {'x-goog-api-key':account.apiKey} : {Authorization:`Bearer ${account.accessToken}`})};if(account.projectId)headers['x-goog-user-project']=account.projectId;
      const contents=[{role:'user',parts:[...images.map(image=>({inlineData:{mimeType:image.mime,data:image.data}})),{text:prompt}]}], searchWidgets=[];
      const geminiFunctions=[...functions];
      if(functions.length && agent.webSearch !== false) geminiFunctions.push({name:'provider_web_search',description:'Search the current web using Google grounding. Use this for internet research when other function tools are present.',parameters:{type:'object',properties:{query:{type:'string'}},required:['query']}});
      const geminiInvoke=async(name,args)=>{
        if(name!=='provider_web_search') return invoke(name,args);
        if(++callCount>128)throw new Error('Tool call limit reached.');
        if(typeof args?.query!=='string' || !args.query.trim() || args.query.length>4000)return JSON.stringify({error:'Use a search query under 4,000 characters.'});
        const response=await jsonRequest(this.fetch,`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(agent.model)}:generateContent`,{method:'POST',headers,body:JSON.stringify({contents:[{role:'user',parts:[{text:args.query}]}],tools:[{google_search:{}}]}),signal});
        const candidate=response.candidates?.[0];if(candidate?.finishReason!=='STOP')return JSON.stringify({error:'Web search did not complete.'});
        const widget=candidate.groundingMetadata?.searchEntryPoint?.renderedContent;if(typeof widget==='string' && widget.length<=200000)searchWidgets.push(widget);
        return JSON.stringify({text:(candidate.content?.parts||[]).filter(p=>!p.thought&&p.text).map(p=>p.text).join('\n'),sources:(candidate.groundingMetadata?.groundingChunks||[]).map(c=>c.web).filter(Boolean)});
      };
      for(let round=0;round<48;round++) {
        const body={contents};const tools=[];
        // Some Gemini models cannot mix grounded search and client function declarations.
        if(geminiFunctions.length)tools.push({functionDeclarations:geminiFunctions.map(t=>({name:t.name,description:t.description,parametersJsonSchema:t.parameters}))});else if(agent.webSearch !== false)tools.push({google_search:{}});
        if(tools.length)body.tools=tools;
        const result=await jsonRequest(this.fetch,`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(agent.model)}:generateContent`,{method:'POST',headers,body:JSON.stringify(body),signal});
        const candidate=result.candidates?.[0];if(!candidate || candidate.finishReason!=='STOP')throw new Error('Gemini did not complete this response. Review the question or model and retry.');
        const calls=(candidate.content?.parts || []).filter(p=>p.functionCall);
        if(calls.length){contents.push(candidate.content);const parts=[];for(const part of calls){const call=part.functionCall;parts.push({functionResponse:{name:call.name,...(call.id?{id:call.id}:{}),response:{result:await geminiInvoke(call.name,call.args || {})}}});}contents.push({role:'user',parts});continue;}
        const text=(candidate.content?.parts || []).filter(p=>!p.thought && typeof p.text==='string').map(p=>p.text).join('\n');if(!text.trim())throw new Error('Gemini returned no text response.');
        const sources=(candidate.groundingMetadata?.groundingChunks || []).filter(c=>/^https?:\/\//.test(c.web?.uri || '')).map(c=>`- [${String(c.web.title || 'Source').replace(/[\[\]\n]/g,' ')}](<${c.web.uri.replace(/[<>\n\r]/g,'')}>)`);onProgress();const rendered=text+(sources.length?'\n\nSources\n'+sources.join('\n'):'');const suggestions=candidate.groundingMetadata?.searchEntryPoint?.renderedContent;if(typeof suggestions==='string' && suggestions.length<=200000)searchWidgets.push(suggestions);return searchWidgets.length ? {text:rendered,searchSuggestions:searchWidgets.join('')} : rendered;
      }
      throw new Error('Tool round limit reached. Narrow this request.');
    }
    throw new Error('Unsupported direct provider.');
    } finally {await session.close();}
  }
}
module.exports={ProviderRuntime,DIRECT_PROVIDERS,consumeResponses};
