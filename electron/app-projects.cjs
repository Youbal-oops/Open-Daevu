const {randomUUID,createHash}=require('node:crypto');
const {appFiles,appSource,appPath,validateFiles}=require('../shared/app-project.mjs');
const {applyMutation}=require('../shared/domain.mjs');
const {buildApp}=require('./app-builder.cjs');
const revision=files=>createHash('sha256').update(JSON.stringify(files)).digest('hex');
class AppProjects {
 constructor(store,{renderIcon}={}){this.store=store;this.renderIcon=renderIcon;this.cache=new Map();this.diagnostics=new Map();}
 report(projectId,appId,entry){this.app(projectId,appId);const key=JSON.stringify([projectId,appId]),rows=this.diagnostics.get(key) || [];rows.push({at:new Date().toISOString(),level:['error','warn','log'].includes(entry?.level)?entry.level:'log',text:String(entry?.text || '').slice(0,4000)});this.diagnostics.set(key,rows.slice(-60));return true;}
 project(projectId){const p=this.store.state.projects.find(p=>p.id===projectId);if(!p)throw Error('Unknown project.');return p;}
 app(projectId,appId){const a=(this.project(projectId).artifacts || []).find(a=>a.id===appId&&a.kind==='html');if(!a)throw Error('Choose an app in this project.');return a;}
 list(projectId){return (this.project(projectId).artifacts || []).filter(a=>a.kind==='html').map(a=>({id:a.id,title:a.title,published:Boolean(a.data.published),customLogo:Boolean(a.data.logo),files:Object.keys(appFiles(a.data))}));}
 read(projectId,appId,file){const a=this.app(projectId,appId),files=appFiles(a.data);if(file){appPath(file);if(!Object.hasOwn(files,file))throw Error('App file not found.');return {file,content:files[file],revision:revision(files)};}return {id:a.id,title:a.title,customLogo:Boolean(a.data.logo),logoDesign:a.data.logoDesign,revision:revision(files),files:Object.entries(files).map(([name,content])=>({name,size:content.length})),publishedAt:a.data.published?.at,versions:(a.data.versions || []).map(v=>({id:v.id,at:v.at}))};}
 async create(projectId,title){const id=randomUUID();await this.store.mutate({type:'artifact',projectId,value:{id,title:title || 'Untitled app',kind:'html',data:{files:{'index.html':'<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><main id="app"></main><script type="module" src="main.js"></script></body></html>','style.css':'body{padding:24px}button,input{font:inherit}','main.js':'rw.onReady(() => { document.querySelector("#app").textContent = "Your app is ready to build."; });'},state:{}}}});return this.read(projectId,id);}
 async edit(projectId,appId,request){
  let generatedLogo,logoDesign;
  if(request.op==='logo'&&request.icon!==undefined){
   this.app(projectId,appId);
   if(request.file!==undefined||request.content!==undefined)throw Error('Use icon design, file, or content for a logo, one at a time.');
   await this.store.options?.guard?.();
   logoDesign=require('./app-icon-design.cjs').normalizeIconDesign(request.icon);
   if(!this.renderIcon)throw Error('Icon design rendering is unavailable.');
   generatedLogo=await this.renderIcon(logoDesign);
  }
  await this.store.update(state=>{
   const app=(state.projects.find(p=>p.id===projectId)?.artifacts || []).find(a=>a.id===appId&&a.kind==='html');if(!app)throw Error('Choose an app in this project.');
   const files={...appFiles(app.data)};
   if(request.op!=='batch' && request.revision && request.revision!==revision(files))throw Error('App files changed. Reload them before saving.');
   if(request.op==='logo'){
    const {validateAppLogo}=require('../shared/app-logo.mjs');
    app.data.logo=validateAppLogo(generatedLogo??(request.file?files[appPath(request.file)]:request.content));
    if(logoDesign)app.data.logoDesign=logoDesign;else delete app.data.logoDesign;
    if(request.file&&!Object.hasOwn(files,request.file))throw Error('App logo file not found.');
   }
   else if(request.op==='batch'){
    validateFiles(request.files);validateFiles(request.base);
    for(const file of new Set([...Object.keys(request.base),...Object.keys(request.files)]))if(request.base[file]!==request.files[file]){
     if(files[file]!==request.base[file])throw Error('This file changed: '+file+'. Reload saved files before editing it.');
     if(Object.hasOwn(request.files,file))files[file]=request.files[file];else delete files[file];
    }
    validateFiles(files);app.data.files=files;
    if(request.title)app.title=String(request.title).trim().slice(0,160);
   }
   else if(request.op==='restore') {const version=[app.data.published,...(app.data.versions || [])].find(v=>v?.id===request.version);if(!version)throw Error('Published version not found.');app.data.files=structuredClone(version.files);}
   else {
    const file=appPath(request.file);
    if(Object.hasOwn(request,'previous') && (files[file] ?? null)!==request.previous)throw Error('This file changed. Reload saved files before editing it.');
    if(request.op==='delete')delete files[file];
    else if(request.op==='patch'){
     if(typeof request.search!=='string'||!request.search || !Object.hasOwn(files,file) || files[file].split(request.search).length!==2)throw Error('Patch must match exactly once. Read the file again.');
     if(typeof request.content!=='string')throw Error('Provide replacement text.');files[file]=files[file].replace(request.search,()=>request.content);
    }else if(request.op==='write'){if(typeof request.content!=='string')throw Error('Provide file content.');files[file]=request.content;}
    else throw Error('Choose write, patch, delete, logo or restore.');
    validateFiles(files);app.data.files=files;
   }
   app.updatedAt=new Date().toISOString();return applyMutation(state,{type:'artifact',projectId,value:app});
  });return this.read(projectId,appId);
 }
 async compileFiles(files){const key=revision(files);if(this.cache.has(key))return this.cache.get(key);const output=await buildApp(files);this.cache.set(key,output);while(this.cache.size>12)this.cache.delete(this.cache.keys().next().value);return output;}
 async build(projectId,appId,{draft=false,files}={}){const app=this.app(projectId,appId);return this.compileFiles(files?validateFiles(files):appSource(app.data,draft));}
 async publish(projectId,appId){
  const files=structuredClone(appFiles(this.app(projectId,appId).data)),built=await this.compileFiles(files);
  const version={id:randomUUID(),at:new Date().toISOString(),files};
  await this.store.update(state=>{const app=state.projects.find(p=>p.id===projectId)?.artifacts?.find(a=>a.id===appId&&a.kind==='html');if(!app || revision(appFiles(app.data))!==revision(files))throw Error('App changed while building. Publish again.');app.data.versions=[...(app.data.published?[app.data.published]:[]),...(app.data.versions || [])].slice(0,3);app.data.published=version;app.updatedAt=version.at;return state;});return {id:version.id,at:version.at,warnings:built.warnings};
 }
 functions(projectId){return [
  {name:'app_preview',description:'Open the current draft in a separate preview window so it runs and reports runtime errors. Preview database writes use real project data.',parameters:{type:'object',properties:{appId:{type:'string'}},required:['appId'],additionalProperties:false},call:async r=>{await this.build(projectId,r.appId,{draft:true});if(!this.openPreview)throw Error('Preview windows are unavailable here.');await this.openPreview(projectId,r.appId);return {opened:true};}},
  {name:'app_errors',description:'Read recent runtime logs and errors from open previews and app windows.',parameters:{type:'object',properties:{appId:{type:'string'}},required:['appId'],additionalProperties:false},call:r=>{this.app(projectId,r.appId);return this.diagnostics.get(JSON.stringify([projectId,r.appId])) || [];}},
  {name:'app_list',description:'List apps and source files in the current project.',parameters:{type:'object',properties:{},additionalProperties:false},call:()=>this.list(projectId)},
  {name:'app_create',description:'Create a multi-file app draft in this project. Build with multiple small file edits, then check and publish.',parameters:{type:'object',properties:{title:{type:'string'}},required:['title'],additionalProperties:false},call:r=>this.create(projectId,r.title)},
  {name:'app_read',description:'Read a source file, or list files and versions when file is omitted.',parameters:{type:'object',properties:{appId:{type:'string'},file:{type:'string'}},required:['appId'],additionalProperties:false},call:r=>this.read(projectId,r.appId,r.file)},
  {name:'app_edit',description:'Write one file, patch exactly one match, delete a file, restore a version, or set the app logo. For op logo, create an icon directly with icon:{background,radius,paths:[{d,fill,stroke,strokeWidth}]}. Use SVG path commands on a 256x256 canvas, hex colors or none, up to 32 paths. It renders to PNG automatically. Or use content as a PNG data URL (at most 512px, under 256KB), or file for an embedded PNG asset in this app. Empty content restores its automatic icon. Use revision from app_read to prevent overwriting concurrent edits.',parameters:{type:'object',properties:{appId:{type:'string'},op:{type:'string',enum:['write','patch','delete','restore','logo']},icon:{type:'object',properties:{background:{type:'string'},radius:{type:'number',minimum:0,maximum:128},paths:{type:'array',minItems:1,maxItems:32,items:{type:'object',properties:{d:{type:'string',maxLength:4096},fill:{type:'string'},stroke:{type:'string'},strokeWidth:{type:'number',minimum:0,maximum:32}},required:['d'],additionalProperties:false}}},required:['background','paths'],additionalProperties:false},file:{type:'string'},content:{type:'string'},search:{type:'string'},revision:{type:'string'},version:{type:'string'}},required:['appId','op'],additionalProperties:false},call:r=>this.edit(projectId,r.appId,r)},
  {name:'app_check',description:'Compile app draft and return build errors or warnings. Does not publish. Runtime errors appear in the app editor console.',parameters:{type:'object',properties:{appId:{type:'string'}},required:['appId'],additionalProperties:false},call:async r=>({ok:true,warnings:(await this.build(projectId,r.appId,{draft:true})).warnings})},
  {name:'app_publish',description:'Build and publish current draft for the launcher and independent app windows. Keeps previous versions.',parameters:{type:'object',properties:{appId:{type:'string'}},required:['appId'],additionalProperties:false},call:r=>this.publish(projectId,r.appId)}
 ];}
}
module.exports={AppProjects,revision};
