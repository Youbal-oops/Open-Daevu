const {WebContentsView,session,shell,dialog}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const SERVICES={claude:{name:'Claude',url:'https://claude.ai/new',origin:'https://claude.ai'},chatgpt:{name:'ChatGPT',url:'https://chatgpt.com/',origin:'https://chatgpt.com'},gemini:{name:'Gemini',url:'https://gemini.google.com/app',origin:'https://gemini.google.com'}};
const {layoutInPage,composeInPage}=require('./web-chat-page.cjs');
const {sendInWebContents}=require('./web-chat-send.cjs');
const {webRecipientShortcut}=require('../shared/web-chat.mjs');
const {conversationURL}=require('../shared/web-chat-session.mjs');
function controlInPage(provider,op){
 const patterns={model:/model/i,effort:/effort|reasoning|thinking\s*(?:level|time|budget)/i,tools:/tools|add files|upload|attach/i,voice:/voice|microphone|dictate/i,stop:/stop response|stop generating|stop streaming|stop/i};
 const pattern=patterns[op];if(!pattern)throw Error('Unknown website control.');
 const available=b=>!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&!b.closest('[hidden],[aria-hidden="true"]')&&b.getClientRects().length>0&&getComputedStyle(b).visibility!=='hidden';
 const editor=[...document.querySelectorAll('#prompt-textarea,rich-textarea,[contenteditable="true"],textarea[placeholder]')].find(available);
 const composer=editor?.closest('[data-rw-composer],form,input-container,.input-area-container,.composer-parent,.composer-container')||editor?.parentElement;
 const buttons=[...document.querySelectorAll('button,[role="button"]')].filter(available);
 const effort=/effort|reasoning|thinking\s*(?:level|time|budget)/i;
 const score=b=>{
  const hints=[b.getAttribute('aria-label'),b.getAttribute('title'),b.getAttribute('data-testid'),b.getAttribute('data-test-id')].filter(Boolean).join(' '),text=(b.textContent||'').trim(),label=hints+' '+text;
  if(op==='effort'){
   if(/effort|(?:thinking|reasoning)\s*(?:level|time|budget)/i.test(hints)||/^(?:effort|reasoning effort|thinking level|thinking time)$/i.test(text))return composer?.contains(b)?130:100;
   if(composer?.contains(b)&&effort.test(label))return 90;
   // Current effort labels can be shown without an accessible description.
   if(composer?.contains(b)&&!patterns.model.test(hints)&&/^(?:\d+(?:\.\d+)?\s+)?(?:light|standard|extended|heavy|low|medium|high|max(?:imum)?)$/i.test(text))return 60;
   return 0;
  }
  if(op==='model'){
   if(effort.test(label))return 0;
   if(pattern.test(hints))return 100;
   if(provider==='gemini'&&/^(?:gemini\b.*|fast|thinking|pro|flash)$/i.test(text))return 70;
   if(provider==='chatgpt'&&/^(?:chatgpt\b.*|gpt[-\s]?\d.*)$/i.test(text))return 70;
   if(provider==='claude'&&/^(?:claude\b.*|sonnet\b.*|opus\b.*|haiku\b.*)$/i.test(text))return 70;
   return 0;
  }
  return pattern.test(label)?50:0;
 };
 const button=buttons.map(b=>({b,score:score(b)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)[0]?.b;
 if(!button)return {error:'This chat does not expose '+(op==='effort'?'an ':'a ')+op+' control. Use Show website controls to check the available settings.'};button.click();return {message:'Opened the website '+op+' menu.'};
}
async function imagesInPage(provider){
 const selector=provider==='chatgpt'?'[data-message-author-role="assistant"] img':'model-response generated-image img,model-response .generated-image-container img,model-response img[alt*="generated" i]';
 const images=[...document.querySelectorAll(selector)].filter(img=>img.complete && img.naturalWidth>=256 && img.naturalHeight>=256 && img.getBoundingClientRect().width>0).slice(-4),result=[];
 for(const img of images)try{let data;try{const response=await fetch(img.currentSrc || img.src,{credentials:'include',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error();const blob=await response.blob();if(blob.size>3000000 || !/^image\/(png|jpeg|webp|gif)$/.test(blob.type))throw Error();data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}catch{const canvas=document.createElement('canvas');if(img.naturalWidth*img.naturalHeight>16000000)continue;canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext('2d').drawImage(img,0,0);data=canvas.toDataURL('image/png');}if(data.length<=4100000)result.push(data);}catch{}
 return result;
}
function validateWebMessage(value){
 const payload=typeof value==='string'?{text:value,attachments:[]}:value;
 if(!payload||typeof payload.text!=='string'||payload.text.length>30000||(!payload.text.trim()&&!payload.attachments?.length))throw Error('Enter a message under 30,000 characters.');
 if(!Array.isArray(payload.attachments)||payload.attachments.length>8)throw Error('Attach up to eight files.');
 let total=0;
 const attachments=payload.attachments.map(file=>{
  if(!file||typeof file.name!=='string'||!file.name||file.name.length>255||/[\\/\x00-\x1f]/.test(file.name)||typeof file.base64!=='string'||!file.base64.length||file.base64.length>28*1024*1024||file.base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64))throw Error('Invalid attachment. Choose the file again.');
  const bytes=Buffer.byteLength(file.base64,'base64');total+=bytes;
  if(bytes>20*1024*1024||total>40*1024*1024)throw Error('Files must be under 20 MB each and 40 MB combined.');
  return {name:file.name,type:typeof file.type==='string'&&/^[\w.+-]+\/[\w.+-]+$/.test(file.type)?file.type:'application/octet-stream',base64:file.base64};
 });
 return {text:payload.text,attachments};
}
class PluginWebViews{
 constructor(window,plugins,send,{services=SERVICES,canWrite=()=>true}={}){Object.assign(this,{window,plugins,send,services,canWrite});this.views=new Map();this.sessions=new Map();this.popupOwners=new Map();this.downloads=new Set();this.timer=setInterval(()=>this.scan().catch(()=>{}),10000);this.timer.unref?.();window.webContents.on('did-start-loading',()=>this.hide());}
 service(entry){return this.services[entry.provider]||{name:entry.panel.title,url:entry.panel.url,origin:new URL(entry.panel.url).origin};}
 get(pluginId,panelId,projectId){const {record,panel}=this.plugins.panel(pluginId,panelId);this.plugins.project(projectId);if(!['web-chat','web-app'].includes(panel.type))throw Error('Choose a web chat panel.');this.plugins.permit(record,'web-chat');return {record,panel};}
 ensure(pluginId,panelId,projectId){const {record,panel}=this.get(pluginId,panelId,projectId),key=JSON.stringify([pluginId,panelId,projectId]);if(this.views.has(key))return this.views.get(key);if(this.views.size>=12)throw Error('Keep up to twelve open web chat panels. Disable a plugin to close its panels.');
  const provider=panel.provider,service=this.services[provider]||{name:panel.title,url:panel.url,origin:new URL(panel.url).origin};let partition=this.sessions.get(provider);if(!partition){const ses=session.fromPartition('persist:workspace-plugin-'+provider);ses.setPermissionRequestHandler((wc,permission,callback,details)=>{let trusted=false;try{trusted=new URL(details.requestingUrl||wc.getURL()).origin===service.origin;}catch{}if(permission!=='media'||!trusted||!details.mediaTypes?.length||details.mediaTypes.some(type=>type!=='audio'))return callback(false);dialog.showMessageBox(this.window,{type:'question',title:'Microphone access',message:`Allow ${service.name} to use your microphone?`,detail:'Requested by the signed-in website for voice input.',buttons:['Cancel','Allow microphone'],defaultId:0,cancelId:0}).then(r=>callback(r.response===1)).catch(()=>callback(false));});ses.setPermissionCheckHandler((_wc,permission,origin)=>permission==='media'&&origin===service.origin);const download=(event,item,wc)=>this.download(event,item,wc);ses.on('will-download',download);partition={ses,download};this.sessions.set(provider,partition);}
  const view=new WebContentsView({webPreferences:{session:partition.ses,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,navigateOnDragDrop:false}});this.window.contentView.addChildView(view);view.setVisible(false);
  let restored=conversationURL(provider,record.webSessions?.[projectId]?.[panelId]||record.settings.lastUrls?.[projectId]||'',service)||service.url;
  if(panel.type!=='web-chat')try{const old=record.settings.lastUrls?.[projectId];if(old&&new URL(old).origin===service.origin)restored=old;}catch{}
  const entry={key,pluginId,panelId,projectId,provider,panel,packageFile:record.packageFile,view,visible:false,error:'',captureBusy:false,lastConversation:restored};this.views.set(key,entry);const wc=view.webContents,emit=()=>this.send('plugins:web-state',this.snapshot(entry));
  const remember=(_event,url)=>{if(panel.type!=='web-chat')return;const value=conversationURL(provider,url,service);if(!value||value===entry.lastConversation)return;entry.lastConversation=value;this.plugins.change(data=>{const item=data.plugins.find(p=>p.manifest.id===pluginId);if(!item)return;item.webSessions||={};item.webSessions[projectId]||={};item.webSessions[projectId][panelId]=value;}).catch(()=>{});};
  wc.on('did-navigate',remember);wc.on('did-navigate-in-page',remember);
  wc.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key==='Escape'&&entry.visible){this.send('plugins:web-shortcut',{pluginId,panelId,projectId,escape:true});return;}const index=webRecipientShortcut(input);if(index===null||!entry.visible)return;event.preventDefault();this.send('plugins:web-shortcut',{pluginId,panelId,projectId,index});});
  const safe=url=>{const u=new URL(url);return u.protocol==='https:' || u.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname);};
  wc.on('will-navigate',(e,url)=>{try{if(!safe(url))e.preventDefault();}catch{e.preventDefault();}});wc.on('will-redirect',(e,url)=>{try{if(!safe(url))e.preventDefault();}catch{e.preventDefault();}});
  wc.setWindowOpenHandler(({url})=>{try{if(!safe(url))return {action:'deny'};const host=new URL(url).hostname;if(new URL(url).origin!==service.origin&&!/(^|\.)(google\.com|anthropic\.com|claude\.ai|openai\.com|chatgpt\.com|microsoftonline\.com|live\.com)$/.test(host)){shell.openExternal(url);return {action:'deny'};}return {action:'allow',overrideBrowserWindowOptions:{width:720,height:820,autoHideMenuBar:true,webPreferences:{session:partition.ses,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}}};}catch{return {action:'deny'};}});
  wc.on('did-create-window',popup=>{const popupId=popup.webContents.id;this.popupOwners.set(popupId,{entry,window:popup});popup.on('closed',()=>this.popupOwners.delete(popupId));popup.webContents.setWindowOpenHandler(()=>({action:'deny'}));});
  wc.on('did-start-loading',()=>{entry.error='';emit();});wc.on('did-stop-loading',()=>{emit();if(panel.type==='web-chat'&&entry.compact&&wc.getURL().startsWith(service.origin+'/'))wc.executeJavaScript('('+layoutInPage.toString()+')('+JSON.stringify(entry.provider)+',true)',true).catch(()=>{});});wc.on('page-title-updated',emit);
  const persist=()=>{if(wc.isDestroyed())return;if(panel.type==='web-chat'){emit();return;}try{const url=new URL(wc.getURL());if(url.origin===service.origin){this.plugins.change(data=>{const current=data.plugins.find(p=>p.manifest.id===pluginId);if(current){current.settings.lastUrls={...current.settings.lastUrls,[projectId]:url.href};}}).catch(()=>{});}}catch{}emit();};wc.on('did-navigate',persist);wc.on('did-navigate-in-page',persist);
  wc.on('did-fail-load',(_e,code,description,_url,main)=>{if(main && code!==-3){entry.error=`Could not open ${service.name}: ${description}. You can try Open externally.`;emit();}});
  wc.on('render-process-gone',()=>{entry.error='This web chat stopped responding. Reload it to continue.';emit();});
  wc.loadURL(restored).catch(()=>{});return entry;
 }
 snapshot(entry){const wc=entry.view.webContents;return {pluginId:entry.pluginId,panelId:entry.panelId,projectId:entry.projectId,url:wc.isDestroyed()?'':wc.getURL(),loading:!wc.isDestroyed()&&wc.isLoading(),error:entry.error};}
 show(pluginId,panelId,projectId,rect){const entry=this.ensure(pluginId,panelId,projectId),[width,height]=this.window.getContentSize(),x=Math.max(0,Math.min(width,Math.round(Number(rect?.x)||0))),y=Math.max(0,Math.min(height,Math.round(Number(rect?.y)||0)));if(!rect?.group)this.hide();entry.view.setBounds({x,y,width:Math.max(0,Math.min(width-x,Math.round(Number(rect?.width)||0))),height:Math.max(0,Math.min(height-y,Math.round(Number(rect?.height)||0)))});entry.visible=true;entry.view.setVisible(true);return this.snapshot(entry);}
 hide(){for(const entry of this.views.values()){entry.visible=false;entry.view.setVisible(false);}}
 async action(pluginId,panelId,projectId,op,text){const entry=this.ensure(pluginId,panelId,projectId),wc=entry.view.webContents,service=this.service(entry);
  if(op==='layout'){entry.compact=Boolean(text);if(wc.getURL()&&new URL(wc.getURL()).origin===service.origin)await wc.executeJavaScript('('+layoutInPage.toString()+')('+JSON.stringify(entry.provider)+','+entry.compact+')',true);return this.snapshot(entry);}
  if(op==='ready'){if(new URL(wc.getURL()).origin!==service.origin)throw Error('Finish signing in first.');return wc.executeJavaScript('('+composeInPage.toString()+')('+JSON.stringify({text:'',phase:'ready'})+','+JSON.stringify(entry.provider)+')',true);}
  if(['model','effort','tools','voice','stop'].includes(op)){if(new URL(wc.getURL()).origin!==service.origin)throw Error('Finish signing in first.');if(op!=='stop')await wc.executeJavaScript('('+layoutInPage.toString()+')('+JSON.stringify(entry.provider)+',false)',true);const result=await wc.executeJavaScript('('+controlInPage.toString()+')('+JSON.stringify(entry.provider)+','+JSON.stringify(op)+')',true);if(result.error)throw Error(result.error);return result;}
  if(op==='send'){
   if(entry.sending)throw Error('A message is already being sent to this chat.');
   const payload=validateWebMessage(text);
   if(new URL(wc.getURL()).origin!==service.origin)throw Error('Finish signing in and open the chat first.');
   entry.sending=true;
   const signature=payload.attachments.length?require('node:crypto').createHash('sha256').update(JSON.stringify(payload.attachments)).digest('hex'):'';
   try{
    if(entry.stagedUpload&&entry.stagedUpload!==signature)throw Error('Files from the previous attempt are still attached. Send that draft first or start a new chat.');
    const pending=(this.sendQueue||Promise.resolve()).then(()=>{
     this.get(pluginId,panelId,projectId);
     return sendInWebContents(wc,{...payload,hasAttachments:payload.attachments.length>0,attachments:entry.stagedUpload?[]:payload.attachments},entry.provider);
    });
    this.sendQueue=pending.catch(()=>{});
    const result=await pending;
    if(result.sent)entry.stagedUpload=null;else if(result.attached)entry.stagedUpload=signature;
    return result;
   }catch(error){throw Error('Could not send to '+service.name+': '+error.message);}
   finally{entry.sending=false;}
  }
  if(op==='reload'){entry.stagedUpload=null;wc.reload();}else if(op==='new'){entry.stagedUpload=null;await wc.loadURL(service.url);}else if(op==='external')await shell.openExternal(wc.getURL() || service.url);else if(op==='capture')return this.capture(entry);else throw Error('Unknown web chat action.');return this.snapshot(entry);
 }
 async capture(entry){this.get(entry.pluginId,entry.panelId,entry.projectId);const record=this.plugins.enabled(entry.pluginId);this.plugins.permit(record,'files:write');if(!this.canWrite())throw Error('Project storage is read only.');if(entry.captureBusy)return {saved:0};const wc=entry.view.webContents;if(new URL(wc.getURL()).origin!==this.service(entry).origin)return {saved:0};entry.captureBusy=true;let saved=0;try{const images=await wc.executeJavaScript('('+imagesInPage.toString()+')('+JSON.stringify(entry.provider)+')',true);for(const image of images){const match=String(image).match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);if(!match || match[2].length>4100000)continue;const result=await this.plugins.saveFile(entry.projectId,`${this.service(entry).name} image.${match[1].split('/')[1]==='jpeg'?'jpg':match[1].split('/')[1]}`,Buffer.from(match[2],'base64'),entry.pluginId);if(!result.existing)saved++;}if(saved)this.send('plugins:saved',{pluginId:entry.pluginId,projectId:entry.projectId,count:saved});return {saved};}finally{entry.captureBusy=false;}}
 async scan(){for(const entry of this.views.values())try{const record=this.plugins.enabled(entry.pluginId);if(entry.panel.type==='web-chat'&&entry.visible && record.settings.autoSave!==false)await this.capture(entry);}catch{}}
 download(event,item,wc){const entry=[...this.views.values()].find(e=>e.view.webContents.id===wc?.id) || this.popupOwners.get(wc?.id)?.entry;if(!entry)return;
  try{const {record}=this.get(entry.pluginId,entry.panelId,entry.projectId);this.plugins.permit(record,'files:write');if(!this.canWrite() || item.getTotalBytes()>100*1024*1024)throw Error('Download cannot be saved to this project.');if(record.settings.autoSave===false)return;const temporary=path.join(this.plugins.root,randomUUID()+'.download');item.setSavePath(temporary);this.downloads.add(item);item.on('updated',()=>{if(item.getReceivedBytes()>100*1024*1024)item.cancel();});item.once('done',(_e,state)=>{this.downloads.delete(item);(async()=>{try{if(state==='completed'){this.get(entry.pluginId,entry.panelId,entry.projectId);const result=await this.plugins.saveFile(entry.projectId,item.getFilename(),await fs.readFile(temporary),entry.pluginId);if(!result.existing)this.send('plugins:saved',{pluginId:entry.pluginId,projectId:entry.projectId,count:1});}}catch(e){this.send('plugins:saved',{pluginId:entry.pluginId,projectId:entry.projectId,error:e.message});}finally{await fs.rm(temporary,{force:true});}})().catch(()=>{});});}catch{event.preventDefault();}
 }
 reconcile(){for(const {entry,window} of this.popupOwners.values())if(!this.plugins.list().some(p=>p.id===entry.pluginId && p.enabled) && !window.isDestroyed())window.destroy();for(const [key,entry] of this.views)if(!this.plugins.list().some(p=>p.id===entry.pluginId && p.enabled && this.plugins.record(p.id).packageFile===entry.packageFile) || !this.plugins.store.state.projects.some(p=>p.id===entry.projectId)){this.window.contentView.removeChildView(entry.view);entry.view.webContents.close();this.views.delete(key);}}
 destroy(){clearInterval(this.timer);for(const {window} of this.popupOwners.values())if(!window.isDestroyed())window.destroy();this.popupOwners.clear();for(const item of this.downloads)item.cancel();for(const entry of this.views.values())if(!entry.view.webContents.isDestroyed())entry.view.webContents.close();this.views.clear();for(const {ses,download} of this.sessions.values())ses.removeListener('will-download',download);this.sessions.clear();}
}
module.exports={PluginWebViews,SERVICES,composeInPage,imagesInPage,validateWebMessage};
