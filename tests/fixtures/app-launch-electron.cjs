// Exercise the real main-process handlers, with every Windows shortcut redirected
// to a temporary test profile. Requires an existing frontend build in dist/.
const {app,BrowserWindow,shell,nativeImage,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {makeFixture}=require('../fixture.cjs');
const {automaticIconPNG,iconFile,nativeAppIcon}=require('../../electron/app-icons.cjs');
const root=fs.mkdtempSync(path.resolve('.test-data/app-launch-'));
for(const folder of ['desktop','appData','workspace'])fs.mkdirSync(path.join(root,folder));
app.setPath('userData',root);app.setPath('desktop',path.join(root,'desktop'));app.setPath('appData',path.join(root,'appData'));
// Enable the packaged shortcut route without installing an app on this computer.
Object.defineProperty(app,'isPackaged',{get:()=>true});
process.argv.push('--test-data='+root);delete process.env.PORTABLE_EXECUTABLE_FILE;
const state=makeFixture();state.agents=[];state.projects[0].agentIds=[];
const artifact={id:'launch-test',kind:'html',title:'Separate app',data:{html:'<h1>Separate app</h1>',logo:'data:image/png;base64,'+automaticIconPNG({id:'custom-launch-logo'}).toString('base64')}};
state.projects[0].artifacts=[artifact];state.settings.keepRunning=false;
fs.writeFileSync(path.join(root,'workspace','workspace.json'),JSON.stringify(state));
const timer=setTimeout(()=>{console.error('Main-process app launch check timed out');app.exit(1);},45000);
dialog.showErrorBox=(title,message)=>{console.error(title+': '+message);app.exit(1);};
app.once('browser-window-created',(_event,window)=>{
 window.hide();window.webContents.once('did-finish-load',async()=>{
  try{
   await window.webContents.executeJavaScript("window.workspace.openAppWindow('research-project','launch-test')");
   const detached=BrowserWindow.getAllWindows().find(w=>w!==window);
   assert.ok(detached,'The real artifact:window handler must open a native app window');
   assert.equal(detached.getTitle(),artifact.title);
   await window.webContents.executeJavaScript("window.workspace.openAppWindow('research-project','launch-test')");
   assert.equal(BrowserWindow.getAllWindows().length,2,'Reopening focuses the existing app');
   const create=destination=>window.webContents.executeJavaScript(`window.workspace.appShortcut('research-project','launch-test',${JSON.stringify(destination)})`);
   await create('desktop');
   const link=fs.readdirSync(path.join(root,'desktop')).find(n=>n.endsWith('.lnk'));assert.ok(link);
   const shortcut=shell.readShortcutLink(path.join(root,'desktop',link));
   assert.equal(shortcut.target,process.execPath);assert.equal(shortcut.args,'--open-project=research-project --open-app=launch-test');
   assert.ok(shortcut.icon.startsWith(path.join(root,'app-icons')));
   assert.equal(nativeImage.createFromPath(shortcut.icon).isEmpty(),false);
   assert.deepEqual(fs.readFileSync(shortcut.icon),iconFile(nativeAppIcon(artifact,nativeImage)));
   await window.webContents.executeJavaScript("window.workspace.appShortcut('research-project','launch-test')");
   const start=path.join(root,'appData','Microsoft','Windows','Start Menu','Programs','Daevu Apps');
   assert.equal(fs.readdirSync(start).filter(n=>n.endsWith('.lnk')).length,1);
   await assert.rejects(create('../escape'),/Choose Desktop or Windows search/);
   const design={background:'#10281d',radius:48,paths:[{d:'M64 176 L112 128 L144 152 L192 80',fill:'none',stroke:'#b9e47a',strokeWidth:14}]};
   const edited=await window.webContents.executeJavaScript(`window.workspace.appOperation('research-project','edit',{appId:'launch-test',op:'logo',icon:${JSON.stringify(design)}})`);
   assert.equal(edited.customLogo,true);assert.deepEqual(edited.logoDesign,design);
   await create('desktop');
   const generated=shell.readShortcutLink(path.join(root,'desktop',link));assert.notEqual(generated.icon,shortcut.icon);
   const image=nativeImage.createFromPath(generated.icon);assert.deepEqual(image.getSize(),{width:256,height:256});
   const pixels=image.toBitmap(),pixel=(x,y)=>[...pixels.subarray((y*256+x)*4,(y*256+x)*4+4)];
   assert.deepEqual(pixel(128,200),[29,40,16,255]);assert.deepEqual(pixel(64,176),[122,228,185,255]);
   assert.equal(BrowserWindow.getAllWindows().length,2,'The icon renderer must close its hidden window');
   console.log(JSON.stringify({passed:7,window:'real main-process handler',shortcut:'desktop and Start menu',customIcon:'verified',agentDesign:'rendered and applied',profile:root}));
   clearTimeout(timer);app.exit(0);
  }catch(error){console.error(error.stack);clearTimeout(timer);app.exit(1);}
 });
});
require('../../electron/main.cjs');
