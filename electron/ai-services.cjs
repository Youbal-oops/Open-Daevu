function compatibleBase(value){
 let u;try{u=new URL(value);}catch{throw Error('Enter an API base URL, including https://.');}
 if(u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('Use an HTTPS API base URL, or HTTP on localhost, without credentials or query parameters.');
 return u.href.replace(/\/+$/,'');
}
const apiBase=a=>a.provider==='openrouter'?'https://openrouter.ai/api/v1':a.provider==='typesafe'?'https://api.typesafe.ai/v1':compatibleBase(a.baseUrl);
async function serviceModels(account,fetcher,request,signal){
 if(account.provider==='compatible'&&account.configuredModels?.length)return account.configuredModels.map(id=>({id,name:id}));
 const result=await request(fetcher,apiBase(account)+'/models',{headers:{Authorization:`Bearer ${account.apiKey}`},signal});
 if(account.provider==='typesafe'||account.protocol==='systemone')return (result.models||[]).map(m=>({id:m.name,name:m.name}));
 return (result.data||[]).filter(m=>!m.architecture?.output_modalities||m.architecture.output_modalities.includes('text')).filter(m=>m.id==='typesafe/jev-router'||!/(?:^|\/)(?:jev(?:-|$)|.*-decisions$)/i.test(m.id||'')).map(m=>({id:m.id,name:m.name||m.id}));
}
function decisionBody(value,provider){
 if(!value||!['string','object'].includes(typeof value.state)||value.state===null||!value.questions||typeof value.questions!=='object'||Array.isArray(value.questions))throw Error('Provide state and a map of typed questions.');
 const questions=Object.entries(value.questions);if(!questions.length||questions.length>64)throw Error('Use between 1 and 64 questions per evaluation.');
 for(const [name,q] of questions){if(!name||name.length>100||!q||!['choice','score','noul','box'].includes(q.type)||!['string','object'].includes(typeof q.instructions)||q.instructions===null)throw Error('Each question needs a type and instructions.');
  if(q.type==='choice'&&(!q.criteria||Array.isArray(q.criteria)||typeof q.criteria!=='object'||!Object.keys(q.criteria).length||Object.keys(q.criteria).length>255))throw Error('Choice questions need a map of options in criteria.');
  if(q.type==='score'&&(!Array.isArray(q.criteria)||q.criteria.length<2||q.criteria.length>10))throw Error('Score questions need 2–10 ordered criteria.');
 }
 const model=value.model||(provider==='typesafe'?'jev-latest':'~typesafe/jev-latest');if(typeof model!=='string'||!model.trim()||model.length>200)throw Error('Enter a decision model ID.');
 const body={model,state:value.state,questions:value.questions};if(Buffer.byteLength(JSON.stringify(body))>2000000)throw Error('Keep decision requests under 2 MB.');return body;
}
async function decide(account,value,fetcher,request,signal){
 if(!['typesafe','openrouter'].includes(account.provider)&&!(account.provider==='compatible'&&account.protocol==='systemone'))throw Error('Select a TypeSafe or OpenRouter connection for decisions.');
 const body=decisionBody(value,account.provider==='compatible'?'typesafe':account.provider),result=await request(fetcher,apiBase(account)+'/systemone',{method:'POST',headers:{Authorization:`Bearer ${account.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 if(!result.answers||typeof result.answers!=='object'||Array.isArray(result.answers)||Object.keys(body.questions).some(id=>!Object.hasOwn(result.answers,id)))throw Error('The decision service returned incomplete answers.');return result;
}
async function compatibleChat(account,agent,prompt,images,functions,invoke,fetcher,request,signal,onProgress){
 const messages=[{role:'user',content:images.length?[{type:'text',text:prompt},...images.map(image=>({type:'image_url',image_url:{url:`data:${image.mime};base64,${image.data}`}}))]:prompt}];
 for(let round=0;round<48;round++){
  const body={model:agent.model,messages,stream:false};if(agent.functionCalling!==false&&functions.length)body.tools=functions.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}}));
  const result=await request(fetcher,apiBase(account)+'/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${account.apiKey}`,'Content-Type':'application/json',...(account.provider==='openrouter'?{'X-Title':'Daevu'}:{})},body:JSON.stringify(body),signal});
  if(result.error)throw Error('The AI service returned an error. Check the selected model and API account.');const choice=result.choices?.[0],message=choice?.message;if(!message)throw Error('The AI service returned no chat message. Decision models such as Jev belong in the decision tool.');
  if(choice.finish_reason==='length')throw Error('The model reached its response limit. Narrow the request and retry.');
  const calls=message.tool_calls||[];if(agent.functionCalling===false&&calls.length)throw Error('The model requested tools while agent tools are disabled.');if(!calls.length){const text=typeof message.content==='string'?message.content:(message.content||[]).filter(p=>p.type==='text').map(p=>p.text).join('\n');if(!text.trim())throw Error('The AI service returned no text response.');onProgress();return text;}
  if(calls.some(c=>!c.id||c.type!=='function'||!c.function?.name||typeof c.function.arguments!=='string'))throw Error('The model returned an incomplete tool call.');
  messages.push(message);for(const call of calls){onProgress();messages.push({role:'tool',tool_call_id:call.id,content:await invoke(call.function.name,call.function.arguments)});}
 }
 throw Error('Tool round limit reached. Narrow this request.');
}
module.exports={compatibleBase,apiBase,serviceModels,decisionBody,decide,compatibleChat};
