export function sendsOnEnter(event){return event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent?.isComposing&&!event.isComposing&&event.keyCode!==229;}

export function webRecipientShortcut(event){
 if(!(event.ctrlKey??event.control)||event.altKey||event.alt||event.metaKey||event.meta||event.shiftKey||event.shift||event.repeat||event.isAutoRepeat||event.defaultPrevented||event.isComposing||event.nativeEvent?.isComposing||event.keyCode===229)return null;
 if(event.type&&!['keydown','keyDown'].includes(event.type))return null;
 return event.key==='1'?0:event.key==='2'?1:null;
}

export async function sendWhenWebChatReady(ready,send,{signal,onWait=()=>{},onReady=()=>{},poll=1000,timeout=600000}={}){
 let timer,abort,expired=false;
 const check=()=>{if(signal?.aborted)throw Error('Queued send cancelled.');if(expired)throw Error('Waited too long for this chat to finish.');};
 const waiting=async()=>{check();while((await ready()).busy){check();onWait();await new Promise(resolve=>setTimeout(resolve,poll));check();}check();};
 try{
  await Promise.race([waiting(),new Promise((_,reject)=>{abort=()=>reject(Error('Queued send cancelled.'));signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{expired=true;reject(Error('Waited too long for this chat to finish.'));},timeout);})]);
  check();onReady();return await send();
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

export async function sendWebChats(targets,selected,send,payload,onResult=()=>{}){
 return Promise.all(selected.map(async id=>{
  const target=targets.find(t=>t.id===id);
  try{
   if(!target)throw Error('Plugin is disabled.');
   const result=await send(id,target.panels.find(p=>p.type==='web-chat').id,payload);
   const value={id,name:target.name,...result};onResult(value);return value;
  }catch(error){const value={id,name:target?.name||id,sent:false,message:error.message};onResult(value);return value;}
 }));
}

export async function readWebAttachments(files,existing=[]){
 const list=[...files];
 if(existing.length+list.length>8)throw Error('Attach up to eight files.');
 let total=existing.reduce((sum,file)=>sum+file.size,0);
 for(const file of list){total+=file.size;if(!file.size||file.size>20*1024*1024||total>40*1024*1024)throw Error('Files must be nonempty, under 20 MB each and 40 MB combined.');}
 return Promise.all(list.map(async file=>{
  const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('Could not read '+file.name));reader.readAsDataURL(file);});
  return {id:crypto.randomUUID(),name:file.name,type:file.type||'application/octet-stream',size:file.size,base64};
 }));
}
