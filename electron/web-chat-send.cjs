const {composeInPage}=require('./web-chat-page.cjs');

// Focus and native insertion must finish for one provider before another takes focus.
async function sendInWebContents(wc,payload,provider,{timeout=payload.hasAttachments||payload.attachments.length?65000:30000}={}){
 const expiresAt=Date.now()+timeout,throttled=wc.getBackgroundThrottling();let timer,expired=false,submitting=false,attached=false;
 const check=()=>{if(expired||Date.now()>=expiresAt)throw Error('Sending timed out. Check this conversation before retrying.');};
 const invoke=async phase=>{check();return wc.executeJavaScript('('+composeInPage.toString()+')('+JSON.stringify({...payload,phase,expiresAt,hasAttachments:payload.hasAttachments||payload.attachments.length>0,attachments:phase==='prepare'?payload.attachments:[]})+','+JSON.stringify(provider)+')',true);};
 const work=async()=>{
  wc.setBackgroundThrottling(false);
  try{
   await wc.executeJavaScript("document.documentElement.setAttribute('data-rw-sending','');true",true);
   check();wc.focus();
   const prepared=await invoke('prepare');attached=Boolean(prepared.attached);
   if(!prepared.prepared)return prepared;
   check();await wc.insertText(payload.text);check();submitting=true;
   return {...await invoke('submit'),attached};
  }catch(error){return {sent:false,attached,uncertain:submitting,message:error.message};}
 };
 try{
  return await Promise.race([work(),new Promise(resolve=>{timer=setTimeout(()=>{expired=true;resolve({sent:false,attached,uncertain:submitting,message:'Sending timed out. Check this conversation before retrying.'});},timeout);})]);
 }finally{
  clearTimeout(timer);
  if(!wc.isDestroyed()){
   wc.setBackgroundThrottling(throttled);
   wc.executeJavaScript("document.documentElement.removeAttribute('data-rw-sending');true",true).catch(()=>{});
  }
 }
}

module.exports={sendInWebContents};
