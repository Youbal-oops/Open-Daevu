// The workspace SDK injected into every live app. Apps run in a sandbox with no network; this is their only
// window onto the project, and it can read project values, save its own state, and use scoped persistent database records.
const SDK = [
  '(function(){',
  'var pending={},seq=0,changeFns=[],readyFns=[],ready=false,state={},heads,saveTimer=0,themeFns=[];',
  'function call(op,args){return new Promise(function(resolve,reject){var id=++seq;pending[id]={resolve:resolve,reject:reject};',
  'parent.postMessage({rw:1,id:id,op:op,args:args||[]},"*");',
  'setTimeout(function(){if(pending[id]){delete pending[id];reject(new Error("rw."+op+" timed out"))}},20000)})}',
  'function theme(vars){var root=document.documentElement;for(var k in vars)root.style.setProperty(k,vars[k]);root.style.colorScheme=vars["--rw-scheme"]||"dark";themeFns.slice().forEach(function(f){try{f(vars)}catch(e){console.error(e)}})}',
  'addEventListener("message",function(e){var m=e.data;if(e.source!==parent||!m||m.rw!==1)return;',
  'if(m.id&&pending[m.id]){var p=pending[m.id];delete pending[m.id];if(m.ok)p.resolve(m.value);else p.reject(new Error(m.error||"failed"));return}',
  'if(m.push==="init"){state=m.state||{};heads=m.heads;theme(m.theme||{});if(!ready){ready=true;readyFns.splice(0).forEach(function(f){try{f()}catch(e){console.error(e)}})}}',
  'else if(m.push==="theme")theme(m.theme||{});',
  'else if(m.push==="state"&&!saveTimer){state=m.state||{};heads=m.heads;}',
  'else if(m.push==="update")changeFns.slice().forEach(function(f){try{f()}catch(e){console.error(e)}})});',
  'function report(level,text){parent.postMessage({rw:1,op:"diagnostic",entry:{level:level,text:String(text).slice(0,4000)}},"*")}',
  'addEventListener("error",function(e){report("error",e.message+" ("+e.filename+":"+e.lineno+")")});addEventListener("unhandledrejection",function(e){report("error",e.reason&&e.reason.message||e.reason)});',
  '["log","warn","error"].forEach(function(level){var original=console[level];console[level]=function(){original.apply(console,arguments);report(level,Array.from(arguments).map(function(v){try{return typeof v==="string"?v:JSON.stringify(v)}catch(e){return String(v)}}).join(" "))}});',
  'window.rw={',
  'get:function(t){return call("get",[t])},refs:function(){return call("refs")},kpis:function(){return call("kpis")},',
  'tables:function(){return call("tables")},table:function(n){return call("table",[n])},',
  'export:function(name,data,type){var blob=data instanceof Blob?data:null;return(blob?blob.arrayBuffer():Promise.resolve(data)).then(function(d){if(typeof d==="string"||d instanceof ArrayBuffer||ArrayBuffer.isView(d))return call("export",[name,d]);throw new Error("rw.export needs text, an ArrayBuffer, a typed array or a Blob.")})},',
  'import:function(o){o=o||{};return call("import",[{accept:o.accept||[]}]).then(function(f){if(!f)return null;var as=o.as||"text",out={name:f.name,type:f.type,size:f.size};if(as==="arrayBuffer")out.data=f.bytes;else if(as==="text")out.data=new TextDecoder().decode(f.bytes);else if(as==="dataUrl"){var s="",u=new Uint8Array(f.bytes);for(var i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));out.data="data:"+f.type+";base64,"+btoa(s)}else throw new Error("rw.import as must be text, arrayBuffer or dataUrl");return out})},',
  'files:function(){return call("files")},file:function(id){return call("file",[id])},ask:function(t){return call("ask",[t])},',
  'db:{onChange:function(f){changeFns.push(f);return function(){changeFns=changeFns.filter(function(x){return x!==f})}},schema:function(){return call("db-schema")},query:function(sql,params){return call("db-query",[sql,params||[]])},create:function(name,properties){return call("db-create",[name,properties])},insert:function(table,values){return call("db-write",[{op:"insert",table:table,values:values}])},update:function(table,rowId,values){return call("db-write",[{op:"update",table:table,rowId:rowId,values:values}])},remove:function(table,rowId){return call("db-write",[{op:"delete",table:table,rowId:rowId}])}},',
  'state:{get:function(k,d){return Object.prototype.hasOwnProperty.call(state,k)?state[k]:d},',
  'set:function(k,v){state[k]=v;clearTimeout(saveTimer);saveTimer=setTimeout(function(){saveTimer=0;call("save",[state,heads]).catch(function(e){console.error(e)})},400)},',
  'all:function(){return state}},',
  'onReady:function(f){if(ready)f();else readyFns.push(f)},onChange:function(f){changeFns.push(f);return function(){changeFns=changeFns.filter(function(x){return x!==f})}},onTheme:function(f){themeFns.push(f)}};',
  'parent.postMessage({rw:1,op:"hello"},"*");',
  '})();'
].join('\n').replace('var readyFns=readyFns||[];', '');
// "readyFns" is declared above as readyFns; keep a single declaration.
const FIXED = SDK.replace('readyFns=[],ready=false', 'readyFns=[],ready=false').replace(/readyFns/g, 'readyFns');
const BASE = '<style>:root{--rw-bg:#222323;--rw-fg:#efefed;--rw-muted:#b8bab8;--rw-accent:#bdcfd7;--rw-card:#2d2e2e;--rw-border:#414343;color-scheme:dark}html,body{background:var(--rw-bg);color:var(--rw-fg);font-family:Inter,"Segoe UI",system-ui,sans-serif;margin:0}*{box-sizing:border-box}</style>';
export const THEMES = {
  dark: { '--rw-bg': '#222323', '--rw-fg': '#efefed', '--rw-muted': '#b8bab8', '--rw-accent': '#bdcfd7', '--rw-card': '#2d2e2e', '--rw-border': '#414343', '--rw-scheme': 'dark' },
  light: { '--rw-bg': '#eeefed', '--rw-fg': '#2b302d', '--rw-muted': '#59635e', '--rw-accent': '#4d6e7c', '--rw-card': '#ffffff', '--rw-border': '#cbd2cc', '--rw-scheme': 'light' }
};
// Our doctype comes first so the page renders in standards mode; the app's own doctype is dropped.
export const withSdk = html => '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + BASE + '<script>' + SDK + '</script>' + String(html).replace(/<!doctype[^>]*>/i, '');
