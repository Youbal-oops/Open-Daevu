// Self-contained functions executed in the provider's sandboxed renderer.
function layoutInPage(provider,compact){
 window.__rwLayoutObserver?.disconnect();
 let style=document.getElementById('rw-web-layout');
 if(!style){style=document.createElement('style');style.id='rw-web-layout';(document.head||document.documentElement).append(style);}
 style.textContent=compact?`
 [data-rw-composer]{opacity:0!important;pointer-events:none!important;max-height:0!important;min-height:0!important;height:0!important;overflow:hidden!important;margin:0!important;padding:0!important}
 html[data-rw-sending] [data-rw-composer]{position:fixed!important;bottom:0!important;left:0!important;width:100%!important;max-height:none!important;min-height:initial!important;height:auto!important;overflow:visible!important}
 ${provider==='gemini'?`bard-sidenav,mat-sidenav,.mat-drawer-backdrop{display:none!important}mat-sidenav-content,.mat-drawer-content{margin-left:0!important;margin-right:0!important}`:''}`:'';
 if(!compact)return {compact:false};
 const mark=()=>{
  const selector=provider==='gemini'?'input-container,.input-area-container,rich-textarea':provider==='chatgpt'?'#prompt-textarea,textarea[data-id="root"],[data-testid="composer"],.ProseMirror[contenteditable="true"],[contenteditable="true"][role="textbox"],textarea[placeholder*="Ask" i]':'.ProseMirror[contenteditable="true"]';
  for(const input of document.querySelectorAll(selector)){
   const container=input.closest('form,[data-testid="composer"],input-container,.input-area-container,.composer-parent,.composer-container')||input.parentElement;
   if(container&&!container.hasAttribute('data-rw-composer')&&!container.parentElement?.closest('[data-rw-composer]'))container.setAttribute('data-rw-composer','');
  }
  for(const nested of document.querySelectorAll('[data-rw-composer] [data-rw-composer]'))nested.removeAttribute('data-rw-composer');
 };
 mark();let scheduled=false;
 window.__rwLayoutObserver=new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;if(style.textContent)mark();});}});
 window.__rwLayoutObserver.observe(document.body,{childList:true,subtree:true});
 return {compact:true};
}

async function composeInPage(payload,provider){
 let clicked=false,attached=false;
 try{
  const {text,attachments=[],phase='all',expiresAt=Date.now()+65000,hasAttachments=attachments.length>0}=typeof payload==='string'?{text:payload}:payload;
  const check=()=>{if(Date.now()>=expiresAt)throw Error('Sending timed out. Check this conversation before retrying.');};
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async(fn,ms)=>{const until=Date.now()+ms;do{check();const result=fn();if(result)return result;await pause(100);}while(Date.now()<until);return null;};
  check();
  const selector=provider==='claude'?'.ProseMirror[contenteditable="true"],[contenteditable="true"][role="textbox"]':provider==='chatgpt'?'#prompt-textarea,textarea[data-id="root"],.ProseMirror[contenteditable="true"],[contenteditable="true"][role="textbox"],textarea[placeholder*="Ask" i],textarea[placeholder*="Message" i]':'rich-textarea [contenteditable="true"],.ql-editor[contenteditable="true"],textarea[placeholder]';
  const available=el=>!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&!el.closest('[hidden],[aria-hidden="true"]')&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
  const editor=()=>[...document.querySelectorAll(selector)].find(el=>available(el)&&el.getAttribute('contenteditable')!=='false');
  const sendSelector=provider==='claude'?'button[aria-label="Send message" i],button[data-testid="send-button"]':provider==='chatgpt'?'button[data-testid="send-button"],button[aria-label="Send prompt" i],button[aria-label="Send message" i],button[aria-label="Send" i]':'button.send-button,button[data-test-id="send-button"],button[aria-label="Send message" i],button[aria-label="Send" i]';
  const busy=()=>[...document.querySelectorAll('button[data-testid="stop-button"],button[data-test-id="stop-button"],button[aria-label="Stop generating" i],button[aria-label="Stop response" i],button.send-button[aria-label="Stop" i]')].some(available);
  if(phase==='ready')return {busy:busy()};
  if(busy())throw Error('A response is still running. Wait or press Stop before sending another message.');
  let input=await wait(editor,8000);
  if(!input)throw Error('Message box not found. Sign in and open a conversation, or show website controls.');
  if(phase!=='submit'&&attachments.length){
   const transfer=new DataTransfer();
   for(const file of attachments){const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));transfer.items.add(new File([bytes],file.name,{type:file.type||'application/octet-stream'}));}
   // Use the site's real upload input, so its normal file validation still runs.
   const accepts=(el,file)=>!el.accept||el.accept.split(',').some(rule=>{rule=rule.trim().toLowerCase();const type=file.type.toLowerCase();return rule==='*/*'||rule.startsWith('.')&&file.name.toLowerCase().endsWith(rule)||rule.endsWith('/*')&&type.startsWith(rule.slice(0,-1))||rule===type;});
   const compatible=el=>!el.disabled&&!el.webkitdirectory&&!el.hasAttribute('webkitdirectory')&&(attachments.length===1||el.multiple)&&attachments.every(file=>accepts(el,file));
   const composer=input.closest('[data-rw-composer],form,input-container')||input.parentElement;
   const findUpload=()=>[...composer.querySelectorAll('input[type="file"]'),...document.querySelectorAll('input[type="file"]')].find(compatible);
   let upload=findUpload();
   if(!upload){
    const label=el=>[el.getAttribute('aria-label'),el.getAttribute('title'),el.getAttribute('data-testid'),el.getAttribute('data-test-id'),el.textContent].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    const candidates='button,[role="button"],[role="menuitem"]';
    const opener=/add\s+files?|attach\s+(?:files?|and|&)|upload\s+(?:files?|and|&)|open.*upload|add.*more/i;
    const tools=[...composer.querySelectorAll(candidates),...document.querySelectorAll(candidates)].find(el=>available(el)&&opener.test(label(el)));
    // Some sites create the input only when Upload files is selected, and may
    // click it while it is still detached. Capture that input instead of opening
    // an OS picker, then deliver files after the site's click handler finishes.
    let captured,menuClicked=false;
    const prototype=HTMLInputElement.prototype,restore=[];
    const intercept=event=>{if(event.target instanceof HTMLInputElement&&event.target.type==='file'){event.preventDefault();captured=event.target;}};
    try{
     for(const method of ['click','showPicker']){
      const original=prototype[method],descriptor=Object.getOwnPropertyDescriptor(prototype,method);
      if(typeof original!=='function')continue;
      const replacement=function(...args){if(this.type==='file'){captured=this;return;}return original.apply(this,args);};
      Object.defineProperty(prototype,method,{configurable:true,writable:true,value:replacement});
      restore.push(()=>{if(prototype[method]===replacement){if(descriptor)Object.defineProperty(prototype,method,descriptor);else delete prototype[method];}});
     }
     document.addEventListener('click',intercept,true);
     tools?.click();
     upload=await wait(()=>{
      if(captured)return compatible(captured)?captured:null;
      const ready=findUpload();if(ready)return ready;
      if(!menuClicked){
       const item=[...document.querySelectorAll('[role="menuitem"], [role="menu"] button, .mat-mdc-menu-panel button, .mat-menu-panel button')].find(el=>available(el)&&/upload\s+files?|from\s+(?:computer|device)|^files$/i.test(label(el))&&!/drive|folder|github|notebook/i.test(label(el)));
       if(item){menuClicked=true;item.click();return captured&&compatible(captured)?captured:findUpload();}
      }
      return null;
     },4500);
    }finally{document.removeEventListener('click',intercept,true);for(const undo of restore.reverse())undo();}
   }
   if(!upload)throw Error('Upload control not available for these files. Show website controls and use Attach & tools to upload them.');
   upload.files=transfer.files;attached=true;upload.dispatchEvent(new Event('input',{bubbles:true}));upload.dispatchEvent(new Event('change',{bubbles:true}));
   await pause(350);
  }
  input=editor()||input;
  if(phase!=='submit'){
  input.focus({preventScroll:true});
  if(input instanceof HTMLTextAreaElement)input.select();else{
   const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(input);selection.removeAllRanges();selection.addRange(range);
  }
  if(phase==='prepare')return {prepared:true,attached};
  if(input instanceof HTMLTextAreaElement){
   Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,text);
   input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
  }else{
   const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(input);selection.removeAllRanges();selection.addRange(range);
   if(!document.execCommand('insertText',false,text)){input.textContent=text;input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));}
  }
  }
  const read=el=>el instanceof HTMLTextAreaElement?el.value:el.innerText;
  if((read(editor()||input)||'').trim()!==text.trim())throw Error('The website did not accept the message. Show website controls to review it.');
  const button=await wait(()=>{
   const composer=input.closest('[data-rw-composer],form,input-container')||input.parentElement;
   if(hasAttachments&&composer.querySelector('[role="progressbar"], [aria-label*="Uploading" i], [data-testid="file-upload-spinner"]'))return null;
   const buttons=[...document.querySelectorAll(sendSelector)].filter(available);
   return buttons.find(b=>composer.contains(b))||buttons[0];
  },hasAttachments?45000:10000);
  if(!button)throw Error('Send is unavailable. Check sign-in, upload status or usage limits with Show website controls.');
  check();
  button.click();clicked=true;
  const sent=await wait(()=>{const current=editor();return busy()||current&&!(read(current)||'').trim();},8000);
  if(!sent)return {sent:false,uncertain:true,attached,message:'Send was clicked, but submission could not be confirmed. Check this chat before retrying.'};
  return {sent:true,message:'Sent to the website.'};
 }catch(error){return {sent:false,uncertain:clicked,attached,message:error.message||'The website could not accept the message. Show website controls to review it.'};}
}

module.exports={layoutInPage,composeInPage};
