// Ephemeral, loopback-only MCP tools scoped to one agent run and one project.
const http=require('node:http'),crypto=require('node:crypto');
const PROJECT_MCP_NAME='research_workspace_internal';
async function projectToolServer(functions,signal){
 const token=crypto.randomBytes(32).toString('hex');
 const server=http.createServer(async(req,res)=>{
  const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(value===undefined?'':JSON.stringify(value));};
  if(req.url!=='/'+token || req.headers.origin || signal?.aborted)return reply(403,{error:'Unavailable'});
  if(req.method!=='POST')return reply(405);
  let raw='';try{for await(const chunk of req){raw+=chunk;if(raw.length>2500000)throw Error('Request too large.');}
   const message=JSON.parse(raw),{id,method,params}=message;
   if(id===undefined)return reply(202);
   let result;
   if(method==='initialize')result={protocolVersion:params?.protocolVersion || '2024-11-05',capabilities:{tools:{}},serverInfo:{name:'Daevu project tools',version:'1.0.0'}};
   else if(method==='ping')result={};
   else if(method==='tools/list')result={tools:functions.map(f=>({name:f.name,description:f.description,inputSchema:f.parameters}))};
   else if(method==='tools/call'){
    const fn=functions.find(f=>f.name===params?.name);if(!fn)throw Error('Unknown project tool.');
    try{result={content:[{type:'text',text:JSON.stringify(await fn.call(params.arguments || {}))}]};}
    catch(e){result={isError:true,content:[{type:'text',text:e.message}]};}
   }else return reply(200,{jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});
   reply(200,{jsonrpc:'2.0',id,result});
  }catch(e){reply(400,{error:e.message});}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const close=()=>{server.close();server.closeAllConnections();};signal?.addEventListener('abort',close,{once:true});
 return {url:'http://127.0.0.1:'+server.address().port+'/'+token,close:()=>{signal?.removeEventListener('abort',close);close();}};
}
module.exports={projectToolServer,PROJECT_MCP_NAME};
