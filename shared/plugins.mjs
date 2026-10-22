import {appPath,validateFiles} from './app-project.mjs';
import {compileExpr,RESERVED} from './mathexpr.mjs';
import {PLUGIN_ICONS} from './workspace-plugins.mjs';
export const PLUGIN_PERMISSIONS={'storage':'Save plugin settings and project-specific state','project:read':'Read the selected project’s notes and overview','files:read':'Read files in the selected project','files:write':'Save files into the selected project','files:edit':'Change files already in the selected project','browser:modify':'Change how websites look and which parts of them load in the research browser','browser:scripts':'Run scripts on the websites you open in the research browser','database:read':'Query the selected project’s database','database:write':'Create tables and edit records in the selected project','agents:read':'Read assigned agent profiles and this project’s chat messages','agents:run':'Send messages to project agents using their configured provider allowance','browser:read':'Read the current browser tab’s visible text when you share it','web-chat':'Open signed-in AI websites and send messages when you request it'};
export const BOARD_GROUPS=['basic','stats','business','science','other'];
const POINTS=['boards','fileEditors','sheetFunctions','themes','browser'],slug=/^[a-z][a-z0-9-]{0,39}$/;
// What a plugin adds to the app beyond its own panels: new board types and editors for existing file types.
function validateContributes(manifest,files){
 const c=manifest.contributes===undefined?{}:manifest.contributes;
 if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!POINTS.includes(k)))throw Error('A plugin can contribute boards, file editors, spreadsheet functions, themes and browser changes.');
 const boards=c.boards===undefined?[]:c.boards,editors=c.fileEditors===undefined?[]:c.fileEditors;
 if(!Array.isArray(boards)||boards.length>16||!Array.isArray(editors)||editors.length>8)throw Error('A plugin can add up to 16 board types and 8 file editors.');
 const page=entry=>{appPath(entry);if(!files[entry])throw Error('Missing entry: '+entry);validateFiles({...files,'index.html':files[entry]});};
 const text=(value,max,what)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(what+' needs a short name.');return value.trim();};
 const ids=new Set(),outBoards=boards.map(b=>{if(!b||!slug.test(b.id||'')||ids.has(b.id))throw Error('Each board type needs a unique ID.');ids.add(b.id);
  page(b.entry);if(b.group!==undefined&&!BOARD_GROUPS.includes(b.group))throw Error('Board group must be one of '+BOARD_GROUPS.join(', ')+'.');
  return {id:b.id,name:text(b.name,60,'A board type'),hint:String(b.hint||'').slice(0,120),group:b.group||'other',entry:b.entry,...(typeof b.sample==='string'&&b.sample.trim()?{sample:b.sample.slice(0,4000)}:{})};});
 const editorIds=new Set(),outEditors=editors.map(e=>{if(!e||!slug.test(e.id||'')||editorIds.has(e.id))throw Error('Each file editor needs a unique ID.');editorIds.add(e.id);
  if(!Array.isArray(e.extensions)||!e.extensions.length||e.extensions.length>12||e.extensions.some(x=>!/^[a-z0-9]{1,8}$/.test(x)))throw Error('List the file extensions an editor opens, like ["pdf"].');
  if(!manifest.permissions.includes('files:read')||!manifest.permissions.includes('files:edit'))throw Error('File editors need the files:read and files:edit permissions.');
  page(e.entry);return {id:e.id,name:text(e.name,60,'A file editor'),extensions:[...new Set(e.extensions)],entry:e.entry};});
 const sheetFunctions=c.sheetFunctions===undefined?[]:c.sheetFunctions,themes=c.themes===undefined?[]:c.themes;
 if(!Array.isArray(sheetFunctions)||sheetFunctions.length>40||!Array.isArray(themes)||themes.length>8)throw Error('A plugin can add up to 40 spreadsheet functions and 8 themes.');
 // A formula is a short expression over named arguments, so it runs inside the sheet with no code from the plugin.
 const names=new Set(),outFunctions=sheetFunctions.map(f=>{if(!f||!/^[A-Z][A-Z0-9_]{1,29}$/.test(f.name||'')||names.has(f.name))throw Error('Name each spreadsheet function in capitals, like MARKUP.');names.add(f.name);
  if(!Array.isArray(f.args)||f.args.length>8||f.args.some(a=>!/^[a-z][a-z0-9_]{0,19}$/.test(a)||RESERVED.has(a))||new Set(f.args).size!==f.args.length)throw Error(f.name+' needs up to 8 lowercase argument names.');
  if(typeof f.expr!=='string'||f.expr.length>400)throw Error(f.name+' needs a formula.');let compiled;try{compiled=compileExpr(f.expr);}catch(e){throw Error(f.name+': '+e.message);}
  if([...compiled.names].some(n=>!f.args.includes(n)))throw Error(f.name+' uses a name that is not one of its arguments.');
  return {name:f.name,args:[...f.args],expr:f.expr,hint:String(f.hint||'').slice(0,120)};});
 const themeIds=new Set(),outThemes=themes.map(t=>{if(!t||!slug.test(t.id||'')||themeIds.has(t.id))throw Error('Each theme needs a unique ID.');themeIds.add(t.id);
  if(!['light','dark'].includes(t.mode))throw Error('A theme is light or dark.');
  const vars=t.vars&&typeof t.vars==='object'&&!Array.isArray(t.vars)?Object.entries(t.vars):[];
  if(!vars.length||vars.length>40||vars.some(([k,v])=>!/^--[a-z0-9-]{1,40}$/.test(k)||typeof v!=='string'||!/^[#a-zA-Z0-9(),.%\s-]{1,60}$/.test(v)||/url|expression/i.test(v)))throw Error('A theme sets colours like {"--accent":"#7c5cff"}.');
  return {id:t.id,name:text(t.name,40,'A theme'),mode:t.mode,vars:Object.fromEntries(vars)};});
 // Browser changes: styles and request blocking need browser:modify, scripts and toolbar tools need browser:scripts.
 const b=c.browser===undefined?{}:c.browser;
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['styles','scripts','blocks','tools'].includes(k)))throw Error('Browser changes are styles, scripts, blocks and tools.');
 const need=(permission,what)=>{if(!manifest.permissions.includes(permission))throw Error(what+' need the '+permission+' permission.');};
 const items=(key,max=8)=>{const v=b[key]===undefined?[]:b[key];if(!Array.isArray(v)||v.length>max)throw Error('A plugin can add up to '+max+' browser '+key+'.');return v;};
 const sites=m=>{const a=m===undefined?['*']:m;if(!Array.isArray(a)||!a.length||a.length>8||a.some(p=>typeof p!=='string'||p.length>200||!(p==='*'||/^(\*|https?):\/\//.test(p))))throw Error('Match websites with patterns like "https://*.example.com/*".');return [...a];};
 const source=(item,key,what)=>{const value=typeof item[key]==='string'?item[key]:typeof item.file==='string'?(appPath(item.file),files[item.file]):undefined;if(typeof value!=='string'||!value.trim()||value.length>20000)throw Error(what+' needs "'+key+'" or a file under 20 KB.');return value;};
 const pageIds=new Set(),named=(item,what)=>{if(!item||!slug.test(item.id||'')||pageIds.has(what+item.id))throw Error('Each browser '+what+' needs a unique ID.');pageIds.add(what+item.id);return {id:item.id,name:text(item.name,60,'A browser '+what)};};
 const styles=items('styles'),scripts=items('scripts'),tools=items('tools'),blocks=items('blocks',100);
 if(styles.length||blocks.length)need('browser:modify','Browser styles and blocks');if(scripts.length||tools.length)need('browser:scripts','Browser scripts and tools');
 const outBrowser={styles:styles.map(s=>({...named(s,'style'),matches:sites(s.matches),css:source(s,'css','A style')})),scripts:scripts.map(s=>({...named(s,'script'),matches:sites(s.matches),code:source(s,'code','A script')})),blocks:blocks.map(p=>{if(typeof p!=='string'||p.length>200||!/^(\*|https?):\/\//.test(p))throw Error('Block requests with patterns like "*://ads.example.com/*".');return p;}),tools:tools.map(t=>({...named(t,'tool'),matches:sites(t.matches),code:source(t,'code','A tool'),...(PLUGIN_ICONS.includes(t.icon)?{icon:t.icon}:{})}))};
 return {boards:outBoards,fileEditors:outEditors,sheetFunctions:outFunctions,themes:outThemes,browser:outBrowser};
}
export function validatePlugin(manifest,files={}){
 if(!manifest || manifest.apiVersion!==1 || !/^[a-z][a-z0-9-]{1,59}$/.test(manifest.id || '') || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(manifest.version || '') || typeof manifest.name!=='string' || !manifest.name.trim() || manifest.name.length>80)throw Error('A plugin needs apiVersion 1, a lowercase ID, a name and a semantic version.');
 if(!Array.isArray(manifest.permissions) || manifest.permissions.some(p=>!Object.hasOwn(PLUGIN_PERMISSIONS,p)) || new Set(manifest.permissions).size!==manifest.permissions.length)throw Error('Declare supported plugin permissions without duplicates.');
 const contributes=validateContributes(manifest,files),count=v=>Array.isArray(v)?v.length:Object.values(v).reduce((n,list)=>n+list.length,0),adds=Object.values(contributes).reduce((n,v)=>n+count(v),0);
 if(!Array.isArray(manifest.panels) || manifest.panels.length>8 || (!manifest.panels.length && !adds))throw Error('Declare between one and eight plugin panels.');
 const ids=new Set();for(const p of manifest.panels){if(!/^[a-z][a-z0-9-]{0,49}$/.test(p.id || '') || ids.has(p.id) || typeof p.title!=='string' || !p.title.trim() || p.title.length>80)throw Error('Each panel needs a unique ID and a title.');ids.add(p.id);
  if(p.type==='web-chat'){if(!['chatgpt','gemini','claude'].includes(p.provider) || !manifest.permissions.includes('web-chat'))throw Error('Web chat panels support ChatGPT, Gemini or Claude and require the web-chat permission.');}
  else if(p.type==='browser-assistant'){if(!manifest.browserExtension||!manifest.permissions.includes('agents:run')||!manifest.permissions.includes('browser:read'))throw Error('Browser assistants require browser:read and agents:run.');}
  else if(p.type==='web-app'){let u;try{u=new URL(p.url);}catch{throw Error('Enter an AI website URL.');}if(u.protocol!=='https:'||u.username||u.password||!manifest.permissions.includes('web-chat'))throw Error('AI website panels require HTTPS and the web-chat permission.');}
  else if(p.type==='html'){appPath(p.entry);if(!files[p.entry])throw Error('Missing panel entry: '+p.entry);validateFiles({...files,'index.html':files[p.entry]});}
  else throw Error('Panel type must be html, web-chat, web-app or browser-assistant.');
 }
 for(const name of Object.keys(files))appPath(name);
 if(Object.keys(files).length){const html=manifest.panels.find(p=>p.type==='html'),first=html?.entry||contributes.boards.find(b=>b.entry)?.entry||contributes.fileEditors[0]?.entry;validateFiles({...files,'index.html':first?files[first]:'<main></main>'});}
 if(manifest.browserExtension&&(!manifest.permissions.includes('browser:read')||manifest.panels.some(p=>p.type!=='browser-assistant')))throw Error('Browser assistant plugins need browser:read and browser-assistant panels.');
 return {...(manifest.browserExtension?{browserExtension:true}:{}),apiVersion:1,id:manifest.id,name:manifest.name.trim(),version:manifest.version,description:String(manifest.description || '').slice(0,500),author:String(manifest.author || '').slice(0,100),permissions:[...manifest.permissions],...(adds?{contributes:Object.fromEntries(Object.entries(contributes).filter(([,v])=>count(v)))}:{}),panels:manifest.panels.map(p=>({id:p.id,title:p.title,type:p.type,...(p.type==='html'?{entry:p.entry}:p.type==='browser-assistant'?{}:p.type==='web-app'?{url:new URL(p.url).href,provider:'custom-'+manifest.id+'-'+p.id}:{provider:p.provider})}))};
}
