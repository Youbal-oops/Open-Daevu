const path = require('node:path');
const fs = require('node:fs');
if(__dirname.includes('app.asar') && process.platform==='win32')process.env.ESBUILD_BINARY_PATH=require.resolve('@esbuild/win32-x64/esbuild.exe').replace('app.asar','app.asar.unpacked');
const esbuild = require('esbuild');
const {parse,serialize,parseFragment}=require('parse5');
const {validateFiles, appPath} = require('../shared/app-project.mjs');
const libs = ['three', 'phaser'];
const escaped = text => text.replace(/<\/script/gi, '<\\/script');
function localPath(specifier, from = 'index.html') {
  if (/^[a-z]+:|^\/|[?#]/i.test(specifier)) throw Error('Use a local file path: ' + specifier);
  return appPath(path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier)));
}
async function buildApp(input) {
  const files = {...validateFiles(input)};
  const libraryPath=(specifier,importer)=>specifier==='three'?path.join(path.dirname(require.resolve('three')),'three.module.js'):specifier==='phaser'?path.join(path.dirname(require.resolve('phaser')),'phaser.esm.js'):require.resolve(specifier,{paths:[importer?path.dirname(importer):__dirname]});
  const plugin = {name:'workspace-app', setup(build) {
    build.onResolve({filter:/.*/},args=>args.kind==='entry-point'?{path:args.path,namespace:'app'}:undefined);
    // esbuild's native process cannot inspect ASAR archives. Resolve package internals in
    // Electron, whose module loader understands ASAR, and supply every file via onLoad.
    build.onResolve({filter:/.*/,namespace:'file'},args=>({path:libraryPath(args.path,args.importer),namespace:'file'}));
    build.onResolve({filter:/.*/,namespace:'app'}, args => {
      if(args.kind==='url-token'){
        if(args.path.startsWith('data:'))return {path:args.path,external:true};
        const content=files[localPath(args.path,args.importer)];if(!content?.startsWith('data:'))throw Error('CSS assets need a local data URL file.');return {path:content,external:true};
      }
      if (libs.some(lib => args.path===lib || args.path.startsWith(lib + '/'))) return {path:libraryPath(args.path),namespace:'file'};
      if (!args.path.startsWith('.') && args.importer && !Object.hasOwn(files,args.path)) throw Error('Bundled libraries: three, phaser. Use relative imports for app files.');
      const base = args.importer || 'index.html', resolved = localPath(args.path, base);
      const name = [resolved, resolved+'.js', resolved+'.ts', resolved+'.jsx', resolved+'/index.js'].find(p => Object.hasOwn(files,p));
      if (!name) throw Error('Missing app file: ' + resolved);
      return {path:name,namespace:'app'};
    });
    build.onLoad({filter:/.*/,namespace:'app'}, args => {
      const ext = path.extname(args.path).slice(1);
      if (ext === 'css') return {contents:files[args.path],loader:'css'};
      if (['js','jsx','ts','tsx','json'].includes(ext)) return {contents:files[args.path],loader:ext};
      // Asset files contain a data URL; text files can also be imported as strings.
      return {contents:'export default ' + JSON.stringify(files[args.path]),loader:'js'};
    });
    // Package internals may read only installed library files, never user-supplied host paths.
    build.onLoad({filter:/.*/,namespace:'file'}, args => {
      const normalized=args.path.replaceAll('\\','/');
      if (!/\/node_modules\/(three|phaser|eventemitter3)\//.test(normalized)) throw Error('App imports cannot read computer files.');
      return {contents:fs.readFileSync(args.path),loader:path.extname(args.path)==='.json'?'json':'js',resolveDir:path.dirname(args.path)};
    });
  }};
  let entry=0, warnings=[];
  const bundle = async (source, isPath) => {
    const virtual='__entry'+entry+++'.js';
    files[virtual]=isPath?'import '+JSON.stringify('./'+localPath(source))+';':source;
    try {
      const result=await esbuild.build({entryPoints:[virtual],bundle:true,write:false,outdir:'out',format:'esm',platform:'browser',target:'chrome120',minify:true,logLevel:'silent',plugins:[plugin],define:{'process.env.NODE_ENV':'"production"'},legalComments:'inline'});
      warnings.push(...result.warnings.map(w=>w.text));
      return result.outputFiles.map(f=>f.path.endsWith('.css')?'<style>'+f.text.replace(/<\/style/gi,'<\\/style')+'</style>':'<script type="module">'+escaped(f.text)+'</script>').join('\n');
    } finally {delete files[virtual];}
  };
  const document=parse(files['index.html']);
  const attr=(node,key)=>node.attrs?.find(a=>a.name===key)?.value;
  async function visit(parent){
    for(const node of [...(parent.childNodes || [])]){
      let replacement;
      if(node.tagName==='script'){
        const type=attr(node,'type'),src=attr(node,'src'),text=node.childNodes.map(c=>c.value || '').join('');
        if(!src && (!type || ['text/javascript','application/javascript'].includes(type)))await esbuild.transform(text,{loader:'js',target:'chrome120',logLevel:'silent'});
        else if(!type || ['module','text/javascript','application/javascript'].includes(type))replacement=await bundle(src || text,Boolean(src));
      }else if(node.tagName==='link' && attr(node,'rel')==='stylesheet'){
        const href=localPath(attr(node,'href') || '');if(!Object.hasOwn(files,href))throw Error('Missing stylesheet: '+href);
        replacement=await bundle('import '+JSON.stringify('./'+href)+';',false);
      }
      if(replacement!==undefined){const nodes=parseFragment(replacement).childNodes;for(const n of nodes)n.parentNode=parent;parent.childNodes.splice(parent.childNodes.indexOf(node),1,...nodes);continue;}
      for(const attribute of node.attrs || [])if(['src','poster'].includes(attribute.name)){
        if(/^(data:|blob:|#)/.test(attribute.value))continue;
        const content=files[localPath(attribute.value)];if(!content?.startsWith('data:'))throw Error('Assets must be app files containing data URLs: '+attribute.value);attribute.value=content;
      }
      await visit(node);if(node.content)await visit(node.content);
    }
  }
  await visit(document);return {html:serialize(document),warnings};
}
module.exports={buildApp,localPath};
