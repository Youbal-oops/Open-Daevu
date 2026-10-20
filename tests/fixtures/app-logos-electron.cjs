const {app,BrowserWindow,nativeImage,ipcMain,shell}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {AppProjects}=require('../../electron/app-projects.cjs'),{Store}=require('../../electron/store.cjs'),{makeFixture}=require('../fixture.cjs');
const {nativeAppIcon,automaticIconPNG,iconFile}=require('../../electron/app-icons.cjs');
app.setPath('userData',path.resolve('.test-data/app-logos-native-profile'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 let server,window;let checks=0;
 try{
  const root=path.resolve('.test-data/app-logos-native-data'),store=new Store(root);await store.init();await store.update(()=>makeFixture());const apps=new AppProjects(store);
  const first=await apps.create('research-project','Logo editor'),second=await apps.create('research-project','Another app');
  ipcMain.handle('logo-test:snapshot',()=>store.state);ipcMain.handle('logo-test:operation',(_,project,op,args)=>{const fn=apps.functions(project).find(f=>f.name==='app_'+op);return fn.call(args);});
  const bundle=await require('esbuild').build({entryPoints:[path.join(__dirname,'app-logos-ui.jsx')],outfile:'ui.js',bundle:true,write:false,loader:{'.woff2':'dataurl'},logLevel:'silent'});
  server=http.createServer((req,res)=>{if(req.url==='/preview'){res.setHeader('Content-Type','text/html');res.end('<main>Logo test app</main>');return;}const asset=['/ui.js','/ui.css'].includes(req.url)?bundle.outputFiles.find(f=>f.path.endsWith(req.url.slice(1))):null;if(asset){res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/css');res.end(asset.contents);}else{res.setHeader('Content-Type','text/html');res.end('<html data-theme="dark"><head><link rel="stylesheet" href="/ui.css"><style>html,body,#root{width:100%;height:100%;margin:0}#root{display:flex;flex-direction:column}</style></head><body><div id="root"></div><script src="/ui.js"></script></body></html>');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  window=new BrowserWindow({show:false,width:1200,height:850,icon:nativeAppIcon(apps.app('research-project',first.id),nativeImage),webPreferences:{preload:path.join(__dirname,'app-logos-preload.cjs'),sandbox:true,backgroundThrottling:false}});
  const wc=window.webContents;wc.on('console-message',event=>{if(event.level==='error')console.error(event.message);});await window.loadURL('http://127.0.0.1:'+server.address().port+'/');
  const wait=async expression=>{for(let i=0;i<50;i++){if(await wc.executeJavaScript(expression))return;await pause(100);}throw Error('UI did not become ready: '+expression);};
  await wait("document.querySelectorAll('.launcher-open img').length===2");
  const defaults=await wc.executeJavaScript("[...document.querySelectorAll('.launcher-open img')].map(i=>i.src)");assert.notEqual(defaults[0],defaults[1]);checks++;
  const firstIcon=nativeAppIcon(apps.app('research-project',first.id),nativeImage);assert.equal(firstIcon.isEmpty(),false);assert.deepEqual(firstIcon.getSize(),{width:256,height:256});checks++;
  await wc.executeJavaScript("[...document.querySelectorAll('button')].find(b=>b.textContent==='Desktop shortcut').click()");await wait("!!document.querySelector('[role=status]')");assert.deepEqual(await wc.executeJavaScript("window.shortcutCalls.at(-1)"),['research-project',first.id,'desktop']);checks++;
  await wc.executeJavaScript("[...document.querySelectorAll('button')].find(b=>b.textContent==='Edit app').click()");await wait("!!document.querySelector('.app-logo-picker input')");
  await wc.executeJavaScript("[...document.querySelectorAll('.editor-toolbar button')].find(b=>b.textContent.includes('Desktop shortcut')).click()");await wait("!!document.querySelector('.studio-notice')");assert.deepEqual(await wc.executeJavaScript("window.shortcutCalls.at(-1)"),['research-project',first.id,'desktop']);checks++;
  const png=automaticIconPNG({id:'custom-image'}),encoded=png.toString('base64');
  await wc.executeJavaScript(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(encoded)}),c=>c.charCodeAt(0)),transfer=new DataTransfer();transfer.items.add(new File([bytes],'custom.png',{type:'image/png'}));const picker=document.querySelector('.app-logo-picker input');picker.files=transfer.files;picker.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait("document.querySelector('.app-logo-picker img').src.startsWith('data:image/png;base64,')");assert.ok(apps.app('research-project',first.id).data.logo);assert.equal(apps.app('research-project',second.id).data.logo,undefined);checks++;
  const custom=nativeAppIcon(apps.app('research-project',first.id),nativeImage);assert.equal(custom.isEmpty(),false);assert.notDeepEqual(custom.toPNG(),firstIcon.toPNG());window.setIcon(custom);checks++;
  const icoPath=path.join(root,'logo.ico'),shortcutPath=path.join(root,'logo-test.lnk');await fs.writeFile(icoPath,iconFile(custom));
  assert.equal(nativeImage.createFromPath(icoPath).isEmpty(),false);assert.ok(shell.writeShortcutLink(shortcutPath,'create',{target:process.execPath,icon:icoPath,iconIndex:0}));assert.equal(shell.readShortcutLink(shortcutPath).icon,icoPath);checks++;
  await wc.executeJavaScript("[...document.querySelectorAll('button')].find(b=>b.textContent==='Reset logo').click()");await wait("!document.querySelector('.app-logo-picker img').src.startsWith('data:image/png;base64,')");assert.equal(apps.app('research-project',first.id).data.logo,'');checks++;
  await fs.writeFile(path.join(root,'logo-editor.png'),(await wc.capturePage()).toPNG());
  console.log(JSON.stringify({passed:checks,failed:0,screenshot:path.join(root,'logo-editor.png')}));
 }catch(error){console.error(error.stack);process.exitCode=1;}
 finally{window?.destroy();server?.close();app.exit(process.exitCode||0);}
});
