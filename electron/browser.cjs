const { WebContentsView, session } = require('electron');
const { id, normalizeBrowserURL } = require('../shared/domain.mjs');
class ResearchBrowser {
  constructor(window, store, send) {
    this.window = window; this.store = store; this.send = send; this.views = new Map();
    this.session = session.fromPartition('persist:research-browser');
    this.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    this.session.setPermissionCheckHandler(() => false);
    this.window.webContents.on('did-start-loading', () => this.hide());
    // Plugins can hide parts of pages: requests that match one of their block patterns never leave.
    this.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => { try { callback({ cancel: this.changes.blocked(details.url) }); } catch { callback({}); } });
    this.changes = { blocked: () => false, forUrl: () => ({ css: [], scripts: [] }), tool: () => null };
  }
  // The main process hands over a function that lists the enabled plugins.
  usePlugins(list) {
    const shared = import('../shared/browser-plugins.mjs');
    this.changes = {
      blocked: url => { try { return this.matcher?.blockedBy(list(), url) || false; } catch { return false; } },
      forUrl: url => { try { return this.matcher?.browserChanges(list(), url) || { css: [], scripts: [] }; } catch { return { css: [], scripts: [] }; } },
      tool: (pluginId, toolId) => list().find(p => p.enabled && p.id === pluginId)?.contributes?.browser?.tools?.find(t => t.id === toolId) || null
    };
    shared.then(m => { this.matcher = m; });
  }
  async apply(wc) {
    const url = wc.getURL(); if (!/^https?:/.test(url)) return;
    const { css, scripts } = this.changes.forUrl(url);
    for (const sheet of css) await wc.insertCSS(sheet).catch(() => {});
    for (const code of scripts) await wc.executeJavaScript(code, true).catch(() => {});
  }
  // A toolbar button from a plugin: run its script on the page and hand back what it returns.
  async runTool(projectId, tabId, pluginId, toolId) {
    const tool = this.changes.tool(pluginId, toolId); if (!tool) throw new Error('That tool is not available.');
    const entry = this.ensure(projectId, tabId), wc = entry.view.webContents, url = wc.getURL();
    if (!/^https?:/.test(url)) throw new Error('Open a website first.');
    const { anyMatch } = await import('../shared/browser-plugins.mjs');
    if (!anyMatch(tool.matches, url)) throw new Error('This tool is not made for this website.');
    const value = await wc.executeJavaScript(tool.code, true);
    return value == null ? '' : String(value).slice(0, 2000);
  }
  project(projectId) { const p = this.store.state.projects.find(p => p.id === projectId); if (!p) throw new Error('Unknown project.'); return p; }
  tab(projectId, tabId) { const tab = (this.project(projectId).browserTabs || []).find(t => t.id === tabId); if (!tab) throw new Error('Unknown browser tab.'); return tab; }
  async create(projectId, input = '') {
    const project = this.project(projectId), url = normalizeBrowserURL(input);
    if ((project.browserTabs || []).length >= 12) throw new Error('Keep up to 12 browser tabs per project.');
    const tab = { id: id(), url, title: url === 'about:blank' ? 'New tab' : new URL(url).hostname };
    await this.store.update(s => { const p=s.projects.find(p=>p.id===projectId); p.browserTabs ||= []; p.browserTabs.push(tab); p.browserActiveTab=tab.id; return s; });
    return tab;
  }
  ensure(projectId, tabId) {
    const tab = this.tab(projectId, tabId);
    if (this.views.has(tabId)) return this.views.get(tabId);
    const view = new WebContentsView({ webPreferences: { session: this.session, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, navigateOnDragDrop: false } });
    this.window.contentView.addChildView(view); view.setBorderRadius(10); view.setVisible(false);
    const entry = { view, projectId, tabId, error: '', loaded: false };
    this.views.set(tabId, entry);
    const wc = view.webContents;
    const emit = () => this.send('browser:state', this.snapshot(entry));
    const persist = () => {
      if (wc.isDestroyed()) return;
      const url=wc.getURL(),title=wc.getTitle();
      if (!url || url === 'about:blank') return emit();
      try { normalizeBrowserURL(url); } catch { return; }
      this.store.update(s => { const t=s.projects.find(p=>p.id===projectId)?.browserTabs?.find(t=>t.id===tabId); if(t) {t.url=url;t.title=(title||new URL(url).hostname).slice(0,200);} return s; }).catch(e=>console.error(e.message)); emit();
    };
    const navigation = (event, url) => { try { normalizeBrowserURL(url); } catch { event.preventDefault(); } };
    wc.on('will-navigate', navigation); wc.on('will-redirect', navigation);
    wc.setWindowOpenHandler(({url}) => { try { const safe=normalizeBrowserURL(url); this.create(projectId,safe).catch(e=>{entry.error=e.message;emit();}); } catch {} return {action:'deny'}; });
    wc.on('did-start-loading',()=>{entry.error='';emit();}); wc.on('did-stop-loading',emit);
    wc.on('dom-ready', () => this.apply(wc));
    wc.on('did-navigate',persist); wc.on('did-navigate-in-page',persist); wc.on('page-title-updated',persist);
    wc.on('did-fail-load',(_event,code,description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3){entry.error=`Could not load this page (${description}). Check the address or connection.`;emit();}});
    wc.on('render-process-gone',()=>{entry.error='This tab stopped responding. Reload to try again.';emit();});
    wc.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key==='Escape'&&!input.control&&!input.alt&&!input.meta)this.send('plugins:web-shortcut',{escape:true});if((input.control||input.meta)&&input.type==='keyDown'){const key=input.key.toLowerCase();if(key==='l'){event.preventDefault();this.send('browser:focus-address',{});}if(key==='t'){event.preventDefault();this.create(projectId).catch(()=>{});}if(key==='w'){event.preventDefault();this.close(projectId,tabId).catch(()=>{});}}});
    return entry;
  }
  snapshot(entry) {
    const wc=entry.view.webContents;
    if(wc.isDestroyed()) return {projectId:entry.projectId,tabId:entry.tabId,error:'This tab is closed.'};
    return { projectId:entry.projectId,tabId:entry.tabId,url:wc.getURL(),title:wc.getTitle(),loading:wc.isLoading(),canGoBack:wc.navigationHistory.canGoBack(),canGoForward:wc.navigationHistory.canGoForward(),error:entry.error };
  }
  async show(projectId, tabId, rect) {
    const entry=this.ensure(projectId,tabId),tab=this.tab(projectId,tabId),[width,height]=this.window.getContentSize();
    const x=Math.max(0,Math.min(width,Math.round(Number(rect.x)||0))),y=Math.max(0,Math.min(height,Math.round(Number(rect.y)||0)));
    const bounds={x,y,width:Math.max(0,Math.min(width-x,Math.round(Number(rect.width)||0))),height:Math.max(0,Math.min(height-y,Math.round(Number(rect.height)||0)))};
    this.hide(); entry.view.setBounds(bounds); entry.view.setVisible(tab.url!=='about:blank'&&bounds.width>20&&bounds.height>20); this.active=tabId;
    if(!entry.loaded){entry.loaded=true;if(tab.url!=='about:blank')entry.view.webContents.loadURL(tab.url).catch(()=>{});}
    return this.snapshot(entry);
  }
  hide(){for(const e of this.views.values())e.view.setVisible(false);this.active=null;}
  async navigate(projectId,tabId,input){const url=normalizeBrowserURL(input),entry=this.ensure(projectId,tabId);await this.store.update(s=>{const p=s.projects.find(p=>p.id===projectId),t=p.browserTabs.find(t=>t.id===tabId);t.url=url;t.title=url==='about:blank'?'New tab':new URL(url).hostname;return s;});entry.loaded=true;entry.error='';entry.view.setVisible(url!=='about:blank'&&this.active===tabId);entry.view.webContents.loadURL(url).catch(()=>{});return this.snapshot(entry);}
  action(projectId,tabId,action){const e=this.ensure(projectId,tabId),wc=e.view.webContents;if(action==='back'&&wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();else if(action==='forward'&&wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();else if(action==='reload')wc.reload();else if(action==='stop')wc.stop();else if(!['back','forward'].includes(action))throw new Error('Unsupported browser action.');return this.snapshot(e);}
  async activate(projectId,tabId){this.tab(projectId,tabId);return this.store.update(s=>{s.projects.find(p=>p.id===projectId).browserActiveTab=tabId;return s;});}
  async close(projectId,tabId){this.tab(projectId,tabId);const entry=this.views.get(tabId);if(entry){this.window.contentView.removeChildView(entry.view);entry.view.webContents.close();this.views.delete(tabId);}await this.store.update(s=>{const p=s.projects.find(p=>p.id===projectId);p.browserTabs=p.browserTabs.filter(t=>t.id!==tabId);if(p.browserActiveTab===tabId)p.browserActiveTab=p.browserTabs.at(-1)?.id||null;return s;});}
  async capture(projectId,tabId){const e=this.ensure(projectId,tabId),wc=e.view.webContents;const text=await wc.executeJavaScript('(document.querySelector("main,article,[role=main]")||document.body)?.innerText?.slice(0,20000)||""',true);return{url:wc.getURL(),title:wc.getTitle(),text};}
  async assistantCapture(projectId,tabId,withScreenshot){const entry=this.ensure(projectId,tabId);if(this.active!==tabId)throw Error('Select the browser tab before sharing it.');if(entry.view.webContents.isLoading())throw Error('Wait for the current page to finish loading before sharing it.');const page=await this.capture(projectId,tabId);if(!/^https?:/.test(page.url))throw Error('Open a website before sharing this tab.');if(withScreenshot){let image=await entry.view.webContents.capturePage();if(image.isEmpty())throw Error('The browser viewport could not be captured.');const size=image.getSize();if(size.width>1600)image=image.resize({width:1600});page.screenshot='data:image/jpeg;base64,'+image.toJPEG(75).toString('base64');}if(this.active!==tabId||entry.view.webContents.getURL()!==page.url)throw Error('The active page changed during capture. Send again to share the current tab.');return {...page,capturedAt:new Date().toISOString()};}
  destroy(){for(const e of this.views.values()){if(!e.view.webContents.isDestroyed())e.view.webContents.close();}this.views.clear();}
}
module.exports={ResearchBrowser};
