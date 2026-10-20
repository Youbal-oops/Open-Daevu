const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {PluginWebViews}=require('../../electron/plugin-web.cjs');
app.setPath('userData',path.resolve('.test-data/web-chat-electron-profile'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function page(provider){return `<!doctype html><html><head><style>form,input-container{display:block;height:100px}bard-sidenav{display:block;width:300px;height:500px}mat-sidenav-content{display:block;margin-left:300px}</style></head><body><button aria-label="Main menu" onclick="window.toggles++">Menu</button><bard-sidenav>History</bard-sidenav><mat-sidenav-content>Conversation</mat-sidenav-content><button aria-label="Reasoning effort" hidden>Heavy</button><button aria-label="Show reasoning" onclick="window.traceOpens++">Show reasoning</button><button id="fixture-model" aria-label="Choose model" onclick="window.openModel()">Gemini Flash</button><form onsubmit="return false"><button type="button" id="fixture-effort" ${provider==='gemini'?'aria-label="Thinking level"':''} onclick="window.openEffort()">${provider==='gemini'?'Medium':'6 Medium'}</button><input type="file" multiple><${provider==='gemini'?'rich-textarea':'div'}><div ${provider==='chatgpt'?'id="prompt-textarea"':''} class="ql-editor ProseMirror" role="textbox" contenteditable="true"></div></${provider==='gemini'?'rich-textarea':'div'}><button type="button" class="send-button" data-testid="send-button" aria-label="Send message" disabled>Send</button></form><script>
window.toggles=0;window.uploads=0;window.sent=[];window.fileBytes=[];window.trustedInput=[];window.modelOpens=window.effortOpens=window.traceOpens=0;window.sentSettings=[];
window.settingsMenu=(button,values)=>{const menu=document.createElement('div');menu.role='menu';for(const value of values){const option=document.createElement('button');option.role='menuitemradio';option.textContent=value;option.onclick=()=>{button.textContent=value;menu.remove();};menu.append(option);}document.body.append(menu);};
window.openModel=()=>{window.modelOpens++;window.settingsMenu(document.querySelector('#fixture-model'),['Gemini Flash','Gemini Pro']);};
window.openEffort=()=>{window.effortOpens++;window.settingsMenu(document.querySelector('#fixture-effort'),['Medium','Extended']);};
const input=document.querySelector('[contenteditable]'),button=document.querySelector('.send-button');
// Gemini keeps unrelated progress and stale controls elsewhere in its page.
if('${provider}'==='gemini'){const progress=document.createElement('div');progress.role='progressbar';document.body.prepend(progress);const stale=button.cloneNode(true);stale.disabled=false;stale.hidden=true;document.body.prepend(stale);}
const bindUpload=el=>el.addEventListener('change',async e=>{window.uploads++;window.fileBytes=await Promise.all([...e.target.files].map(async file=>({name:file.name,bytes:[...new Uint8Array(await file.arrayBuffer())]})));const progress=document.createElement('div');progress.role='progressbar';document.querySelector('form').append(progress);setTimeout(()=>{progress.remove();button.disabled=false;},900);});
bindUpload(document.querySelector('input[type=file]'));
window.configureUploadMode=mode=>{
 document.querySelectorAll('input[type=file],.fixture-upload-menu,.fixture-upload-opener').forEach(el=>el.remove());window.menuOpens=window.menuSelections=window.driveSelections=0;
 const opener=document.createElement('button');opener.type='button';opener.className='fixture-upload-opener';opener.setAttribute('aria-label','Open upload file menu');opener.textContent='+';document.querySelector('form').append(opener);
 opener.onclick=()=>{window.menuOpens++;const menu=document.createElement('div');menu.role='menu';menu.className='fixture-upload-menu';
 const drive=document.createElement('button');drive.role='menuitem';drive.textContent='Add from Drive';drive.onclick=()=>window.driveSelections++;menu.append(drive);
 const local=document.createElement('button');local.role='menuitem';local.textContent='upload_file Upload files';menu.append(local);document.body.append(menu);
 local.onclick=()=>{window.menuSelections++;menu.remove();const upload=document.createElement('input');upload.type='file';upload.multiple=true;upload.accept=mode==='unsupported'?'application/pdf':'image/*';
 if(mode==='menu-input'){setTimeout(()=>{bindUpload(upload);document.querySelector('form').append(upload);},250);}else{if(mode==='detached-picker')upload.showPicker();else upload.click();bindUpload(upload);}
 };};
};
input.addEventListener('input',event=>{window.trustedInput.push(event.isTrusted);if('${provider}'==='gemini'&&(!event.isTrusted||!document.querySelector('form').getBoundingClientRect().height))return;setTimeout(()=>{button.disabled=false;},650);});
button.addEventListener('click',()=>{window.sent.push(input.innerText);window.sentSettings.push({model:document.querySelector('#fixture-model').textContent,effort:document.querySelector('#fixture-effort').textContent});input.textContent='';button.disabled=true;});
</script></body></html>`;}
app.whenReady().then(async()=>{
 let web,win,server;let checks=0;const shortcutEvents=[];
 try{
  const bundle=await require('esbuild').build({entryPoints:[path.resolve(__dirname,'web-chat-ui.jsx')],bundle:true,write:false,outfile:'ui.js',loader:{'.woff2':'dataurl'},logLevel:'silent'});
  server=http.createServer((req,res)=>{
   if(req.url==='/ui'){res.setHeader('Content-Type','text/html');res.end('<html><head><link rel="stylesheet" href="/ui.css"></head><body><div id="root"></div><script src="/ui.js"></script></body></html>');return;}
   if(req.url==='/ui.js'||req.url==='/ui.css'){res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/css');res.end(bundle.outputFiles.find(f=>f.path.endsWith(req.url.slice(1)))?.contents);return;}
   res.setHeader('Content-Type','text/html');res.end(page(req.url.includes('gemini')?'gemini':'chatgpt'));
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const records=Object.fromEntries(['chatgpt','gemini'].map(id=>[id,{manifest:{id,permissions:['web-chat']},settings:{autoSave:false},packageFile:id}]));
  const plugins={panel(id){return {record:records[id],panel:{id:'main',type:'web-chat',provider:id}};},project(){},permit(){},change:async fn=>fn({plugins:Object.values(records)}),enabled:id=>records[id]};
  records.chatgpt.webSessions={project:{main:origin+'/c/restored-chat'}};
  win=new BrowserWindow({show:false,webPreferences:{sandbox:true}});
  web=new PluginWebViews(win,plugins,(channel,value)=>{if(channel==='plugins:web-shortcut')shortcutEvents.push(value);},{services:Object.fromEntries(['chatgpt','gemini'].map(id=>[id,{name:id,origin,url:origin+'/'+id}]))});
  const entries=['chatgpt','gemini'].map(id=>web.ensure(id,'main','project'));
  await Promise.all(entries.map(e=>new Promise(resolve=>e.view.webContents.once('did-finish-load',resolve))));
  for(const entry of entries)await web.action(entry.pluginId,'main','project','layout',true);
  const gemini=entries[1].view.webContents,gpt=entries[0].view.webContents;
  assert.equal(gpt.getURL(),origin+'/c/restored-chat');await gpt.executeJavaScript("history.pushState({},'', '/c/latest-chat?token=private#hidden')");await pause(100);assert.equal(records.chatgpt.webSessions.project.main,origin+'/c/latest-chat');checks++;
  for(let i=0;i<10;i++){await gemini.executeJavaScript("document.body.append(document.createElement('div'))");await pause(20);}
  assert.deepEqual(await gemini.executeJavaScript("({toggles:window.toggles,display:getComputedStyle(document.querySelector('bard-sidenav')).display,margin:getComputedStyle(document.querySelector('mat-sidenav-content')).marginLeft})"),{toggles:0,display:'none',margin:'0px'});checks++;
  assert.equal(await gpt.executeJavaScript("getComputedStyle(document.querySelector('form')).opacity"),'0');checks++;
  await web.action('gemini','main','project','model');assert.equal(await gemini.executeJavaScript('window.modelOpens'),1);assert.equal(await gemini.executeJavaScript('window.effortOpens'),0);await gemini.executeJavaScript("[...document.querySelectorAll('[role=menuitemradio]')].find(b=>b.textContent==='Gemini Pro').click()");checks++;
  await web.action('gemini','main','project','effort');assert.equal(await gemini.executeJavaScript('window.effortOpens'),1);assert.equal(await gemini.executeJavaScript('window.modelOpens'),1);await gemini.executeJavaScript("[...document.querySelectorAll('[role=menuitemradio]')].find(b=>b.textContent==='Extended').click()");checks++;
  await web.action('chatgpt','main','project','effort');assert.equal(await gpt.executeJavaScript('window.effortOpens'),1);assert.equal(await gpt.executeJavaScript('window.modelOpens'),0);assert.equal(await gpt.executeJavaScript('window.traceOpens'),0);await gpt.executeJavaScript("[...document.querySelectorAll('[role=menuitemradio]')].find(b=>b.textContent==='Extended').click()");checks++;
  await gpt.executeJavaScript("document.querySelector('#fixture-effort').hidden=true");await assert.rejects(web.action('chatgpt','main','project','effort'),/does not expose an effort control/);assert.equal(await gpt.executeJavaScript('window.modelOpens'),0);await gpt.executeJavaScript("document.querySelector('#fixture-effort').hidden=false");checks++;
  for(const entry of entries)await web.action(entry.pluginId,'main','project','layout',true);
  const payload={text:'hello both',attachments:[{name:'notes.txt',type:'text/plain',base64:Buffer.from('exact bytes').toString('base64')},{name:'image.png',type:'image/png',base64:Buffer.from([137,80,78,71]).toString('base64')}]};
  const result=await Promise.all(entries.map(e=>web.action(e.pluginId,'main','project','send',payload)));
  assert.ok(result.every(r=>r.sent),JSON.stringify(result));checks++;
  for(const entry of entries){const state=await entry.view.webContents.executeJavaScript('({sent:window.sent,uploads:window.uploads,fileBytes:window.fileBytes})');assert.deepEqual(state.sent,['hello both']);assert.equal(state.uploads,1);assert.deepEqual(state.fileBytes[0],{name:'notes.txt',bytes:[...Buffer.from('exact bytes')]});assert.deepEqual(state.fileBytes[1].bytes,[137,80,78,71]);checks++;}
  assert.equal(await gpt.executeJavaScript("getComputedStyle(document.querySelector('form')).opacity"),'0');checks++;
  assert.deepEqual(await gemini.executeJavaScript('window.sentSettings[0]'),{model:'Gemini Pro',effort:'Extended'});assert.equal(await gpt.executeJavaScript('window.sentSettings[0].effort'),'Extended');checks++;
  await web.action('gemini','main','project','layout',false);assert.notEqual(await gemini.executeJavaScript("getComputedStyle(document.querySelector('bard-sidenav')).display"),'none');checks++;
  // A website error is returned with its real cause, not Electron's opaque script error.
  await gpt.executeJavaScript("window.originalSelection=window.getSelection;window.getSelection=()=>{throw Error('editor rejected selection')};true");
  const rejected=await web.action('chatgpt','main','project','send',payload);assert.equal(rejected.sent,false);assert.match(rejected.message,/editor rejected selection/);checks++;
  await gpt.executeJavaScript('window.getSelection=window.originalSelection;true');
  const retry=await web.action('chatgpt','main','project','send',payload);assert.equal(retry.sent,true);assert.equal(await gpt.executeJavaScript('window.uploads'),2);checks++;
  assert.equal((await web.action('gemini','main','project','send',{...payload,text:''})).sent,true);checks++;
  await web.action('gemini','main','project','layout',true);
  const solo=await web.action('gemini','main','project','send','Gemini only');assert.equal(solo.sent,true,JSON.stringify(solo));
  assert.ok((await gemini.executeJavaScript('window.trustedInput')).every(Boolean));assert.equal(await gemini.executeJavaScript("document.documentElement.hasAttribute('data-rw-sending')"),false);checks++;
  await gemini.executeJavaScript("(()=>{const stop=document.createElement('button');stop.setAttribute('aria-label','Stop response');stop.textContent='Stop';document.querySelector('form').append(stop);setTimeout(()=>stop.remove(),350);})()");assert.equal((await web.action('gemini','main','project','ready')).busy,true);
  let waiting=0;const queued=await require('../../shared/web-chat.mjs').sendWhenWebChatReady(()=>web.action('gemini','main','project','ready'),()=>web.action('gemini','main','project','send','queued native message'),{poll:20,onWait:()=>waiting++});assert.equal(queued.sent,true,JSON.stringify(queued));assert.ok(waiting>0);assert.equal(await gemini.executeJavaScript("window.sent.filter(text=>text==='queued native message').length"),1);checks++;
  // Gemini opens a menu first, and may create/click an input off-document.
  await gemini.executeJavaScript('window.savedFileClick=HTMLInputElement.prototype.click;window.savedFilePicker=HTMLInputElement.prototype.showPicker;true');
  const photo={text:'image through Gemini menu',attachments:[{name:'photo.png',type:'image/png',base64:Buffer.from([137,80,78,71]).toString('base64')}]};
  for(const mode of ['menu-input','detached-click','detached-picker']){
   await gemini.executeJavaScript('window.configureUploadMode('+JSON.stringify(mode)+')');
   const uploads=await gemini.executeJavaScript('window.uploads');
   const sent=await web.action('gemini','main','project','send',photo);assert.equal(sent.sent,true,mode+': '+JSON.stringify(sent));
   const state=await gemini.executeJavaScript('({uploads:window.uploads,files:window.fileBytes,opens:window.menuOpens,selections:window.menuSelections,drive:window.driveSelections,restored:HTMLInputElement.prototype.click===window.savedFileClick&&HTMLInputElement.prototype.showPicker===window.savedFilePicker})');
   assert.equal(state.uploads,uploads+1);assert.deepEqual(state.files,[{name:'photo.png',bytes:[137,80,78,71]}]);assert.equal(state.opens,1);assert.equal(state.selections,1);assert.equal(state.drive,0);assert.equal(state.restored,true);checks++;
  }
  await gemini.executeJavaScript("window.configureUploadMode('unsupported')");const sentBefore=await gemini.executeJavaScript('window.sent.length');
  const unsupported=await web.action('gemini','main','project','send',photo);assert.equal(unsupported.sent,false);assert.equal(unsupported.attached,false);assert.match(unsupported.message,/Upload control not available/);assert.equal(await gemini.executeJavaScript('window.sent.length'),sentBefore);assert.equal(await gemini.executeJavaScript('HTMLInputElement.prototype.click===window.savedFileClick&&HTMLInputElement.prototype.showPicker===window.savedFilePicker'),true);checks++;
  web.show('gemini','main','project',{x:0,y:0,width:600,height:500});
  const nativeKey=input=>{let prevented=false;gemini.emit('before-input-event',{preventDefault(){prevented=true;}},input);return prevented;};
  assert.equal(nativeKey({type:'keyDown',key:'1',control:true}),true);assert.equal(nativeKey({type:'keyDown',key:'2',control:true}),true);assert.deepEqual(shortcutEvents.map(e=>e.index),[0,1]);assert.ok(shortcutEvents.every(e=>e.projectId==='project'&&e.pluginId==='gemini'));checks++;
  assert.equal(nativeKey({type:'keyDown',key:'1',control:false}),false);assert.equal(nativeKey({type:'keyUp',key:'1',control:true}),false);web.hide();assert.equal(nativeKey({type:'keyDown',key:'1',control:true}),false);assert.equal(shortcutEvents.length,2);checks++;
  web.destroy();web=null;
  await win.loadURL(origin+'/ui');await pause(400);
  const ui=win.webContents;
  await ui.executeJavaScript("[...document.querySelectorAll('button')].find(b=>b.textContent==='Side by side').click()");await pause(100);
  assert.equal(await ui.executeJavaScript("!!document.querySelector('[aria-label=\"Change gemini model\"]')&&!!document.querySelector('[aria-label=\"Change gemini effort\"]')&&!!document.querySelector('[aria-label=\"Change chatgpt effort\"]')&&!document.querySelector('[aria-label=\"Change chatgpt model\"]')"),true);checks++;
  for(const name of ['Change gemini model','Change gemini effort','Change chatgpt effort']){await ui.executeJavaScript('document.querySelector('+JSON.stringify('[aria-label="'+name+'"]')+').click()');await pause(30);}
  assert.deepEqual(await ui.executeJavaScript('window.controlCalls'),[{id:'gemini',op:'model'},{id:'gemini',op:'effort'},{id:'chatgpt',op:'effort'}]);assert.equal(await ui.executeJavaScript("document.querySelector('.web-plugin-controls input').checked"),true);checks++;
  const selected=()=>ui.executeJavaScript("[...document.querySelectorAll('.web-send-targets input')].map(b=>b.checked)");
  const key=async(key,control=true,repeat=false)=>{await ui.executeJavaScript(`(()=>{const input=document.querySelector('textarea');input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},ctrlKey:${control},repeat:${repeat},bubbles:true,cancelable:true}));})()`);await pause(30);};
  assert.deepEqual(await selected(),[true,false]);await key('1');assert.deepEqual(await selected(),[false,false]);await key('1',true,true);assert.deepEqual(await selected(),[false,false]);await key('1');assert.deepEqual(await selected(),[true,false]);await key('2');assert.deepEqual(await selected(),[true,true]);await key('2');assert.deepEqual(await selected(),[true,false]);await key('1',false);assert.deepEqual(await selected(),[true,false]);checks++;
  await ui.executeJavaScript("window.shortcutListener({projectId:'qa',pluginId:'gemini',index:1})");await pause(30);assert.deepEqual(await selected(),[true,true]);await ui.executeJavaScript("window.shortcutListener({projectId:'qa',pluginId:'gemini',index:1});window.shortcutListener({projectId:'wrong-project',pluginId:'gemini',index:0});window.shortcutListener({projectId:'qa',pluginId:'not-visible',index:0})");await pause(30);assert.deepEqual(await selected(),[true,false]);checks++;
  await ui.executeJavaScript(`(()=>{const boxes=document.querySelectorAll('.web-send-targets input');boxes[1].click();const text=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(text,'send both with files');text.dispatchEvent(new Event('input',{bubbles:true}));const data=new DataTransfer();data.items.add(new File(['attachment bytes'],'example.txt',{type:'text/plain'}));const picker=document.querySelector('input[type=file]');picker.files=data.files;picker.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(200);
  assert.equal(await ui.executeJavaScript("document.querySelector('.web-attachments').textContent.includes('example.txt')"),true);checks++;
  await ui.executeJavaScript("document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}))");await pause(300);
  const failed=await ui.executeJavaScript("({calls:window.calls,text:document.querySelector('textarea').value,selected:[...document.querySelectorAll('.web-send-targets input')].map(b=>b.checked),notice:document.querySelector('[role=status]').textContent})");
  assert.deepEqual(failed.calls.map(c=>c.id),['gemini','chatgpt']);assert.equal(failed.calls[0].payload.attachments[0].base64,Buffer.from('attachment bytes').toString('base64'));assert.equal(failed.text,'send both with files');assert.deepEqual(failed.selected,[false,true]);assert.match(failed.notice,/chatgpt: fixture sign-in needed/);checks++;
  await ui.executeJavaScript("window.failChatGPT=false;document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));true");await pause(300);
  assert.deepEqual(await ui.executeJavaScript('window.calls.map(c=>c.id)'),['gemini','chatgpt','chatgpt']);assert.equal(await ui.executeJavaScript("document.querySelector('textarea').value"),'');assert.equal(await ui.executeJavaScript("document.querySelector('.web-attachments').textContent"),'');checks++;
  await ui.executeJavaScript("document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}));true");assert.equal(await ui.executeJavaScript('window.calls.length'),3);checks++;
  await ui.executeJavaScript(`(()=>{const files=new DataTransfer();files.items.add(new File([new Uint8Array([137,80,78,71])],'pasted.png',{type:'image/png'}));document.querySelector('textarea').dispatchEvent(new ClipboardEvent('paste',{clipboardData:files,bubbles:true}));})()`);await pause(150);
  assert.equal(await ui.executeJavaScript("document.querySelector('.web-attachments img').getAttribute('src')"),'data:image/png;base64,iVBORw==');await ui.executeJavaScript("document.querySelector('[aria-label=\"Remove pasted.png\"]').click()");checks++;
  await ui.executeJavaScript(`(()=>{const files=new DataTransfer();files.items.add(new File(['dropped'],'drop.txt',{type:'text/plain'}));document.querySelector('form').dispatchEvent(new DragEvent('drop',{dataTransfer:files,bubbles:true}));})()`);await pause(150);
  assert.equal(await ui.executeJavaScript("document.querySelector('.web-attachments').textContent.includes('drop.txt')"),true);checks++;
  await ui.executeJavaScript("(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'saved unsent draft');input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[aria-label=\"Resize chat panes\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));})()");await pause(450);
  await ui.executeJavaScript("window.switchProject('second')");await pause(150);assert.equal(await ui.executeJavaScript("document.querySelector('textarea').value"),'');assert.equal(await ui.executeJavaScript("document.querySelector('.web-attachments').textContent"),'');
  await ui.executeJavaScript("window.switchProject('qa')");await pause(150);assert.equal(await ui.executeJavaScript("document.querySelector('textarea').value"),'saved unsent draft');assert.equal(await ui.executeJavaScript("document.querySelector('.web-attachments').textContent.includes('drop.txt')"),true);assert.equal(await ui.executeJavaScript("document.querySelector('[aria-label=\"Resize chat panes\"]').getAttribute('aria-valuenow')"),'55');checks++;
  await ui.executeJavaScript("(()=>{const detail={pending:[]};window.dispatchEvent(new CustomEvent('research:flush-drafts',{detail}));return Promise.all(detail.pending);})()");
  await ui.reload();await pause(500);assert.equal(await ui.executeJavaScript("document.querySelector('textarea').value"),'saved unsent draft');assert.equal(await ui.executeJavaScript("document.querySelector('.web-attachments').textContent.includes('drop.txt')"),true);checks++;
  await ui.executeJavaScript("(()=>{const boxes=document.querySelectorAll('.web-send-targets input');if(!boxes[0].checked)boxes[0].click();if(boxes[1].checked)boxes[1].click();window.fixtureBusy={gemini:true};})()");await pause(40);await ui.executeJavaScript("document.querySelector('form').requestSubmit()");await pause(120);assert.equal(await ui.executeJavaScript("[...document.querySelectorAll('button')].some(b=>b.textContent==='Cancel queued send')"),true);assert.equal(await ui.executeJavaScript('window.calls.length'),0);
  await ui.executeJavaScript("[...document.querySelectorAll('button')].find(b=>b.textContent==='Cancel queued send').click()");await pause(120);assert.equal(await ui.executeJavaScript('window.calls.length'),0);assert.equal(await ui.executeJavaScript("document.querySelector('textarea').value"),'saved unsent draft');checks++;
  await ui.executeJavaScript("document.querySelector('form').requestSubmit()");await pause(100);await ui.executeJavaScript("window.fixtureBusy.gemini=false;window.failChatGPT=false");await pause(1200);assert.equal(await ui.executeJavaScript('window.calls.length'),1);assert.equal(await ui.executeJavaScript("document.querySelector('textarea').value"),'');checks++;
  await ui.executeJavaScript("(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'project queued draft');input.dispatchEvent(new Event('input',{bubbles:true}));window.fixtureBusy.gemini=true;})()");await pause(30);await ui.executeJavaScript("document.querySelector('form').requestSubmit()");await pause(100);await ui.executeJavaScript("window.switchProject('second')");await pause(150);await ui.executeJavaScript("window.fixtureBusy.gemini=false");await pause(1050);assert.equal(await ui.executeJavaScript('window.calls.length'),1);assert.equal(await ui.executeJavaScript("document.querySelector('textarea').value"),'');await ui.executeJavaScript("window.switchProject('qa')");await pause(150);assert.equal(await ui.executeJavaScript("document.querySelector('textarea').value"),'project queued draft');checks++;
  console.log(JSON.stringify({passed:checks,failed:0}));
 }catch(error){console.error(error.stack);process.exitCode=1;}
 finally{web?.destroy();win?.destroy();server?.close();app.exit(process.exitCode||0);}
});
