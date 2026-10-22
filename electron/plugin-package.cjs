const fs=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib');
const {appPath}=require('../shared/app-project.mjs');
const {validatePlugin}=require('../shared/plugins.mjs');
const TEXT=/\.(html?|css|js|mjs|jsx|ts|tsx|json|txt|md|csv|glsl|vert|frag)$/i;
const MIMES={svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',glb:'model/gltf-binary',woff2:'font/woff2'};
function decodePackage(entries){
 if(!entries.has('manifest.json'))throw Error('Place manifest.json at the root of the plugin folder or ZIP.');
 let manifest;try{manifest=JSON.parse(entries.get('manifest.json').toString('utf8'));}catch{throw Error('Plugin manifest.json is invalid.');}
 const files={};for(const [name,bytes] of entries){if(name==='manifest.json')continue;appPath(name);files[name]=TEXT.test(name)?bytes.toString('utf8'):`data:${MIMES[path.extname(name).slice(1).toLowerCase()] || 'application/octet-stream'};base64,${bytes.toString('base64')}`;}
 return {manifest:validatePlugin(manifest,files),files};
}
async function readFolder(folder){
 const entries=new Map();let total=0;
 async function visit(relative=''){for(const item of await fs.readdir(path.join(folder,relative),{withFileTypes:true})){const name=relative?relative+'/'+item.name:item.name;appPath(name);const full=path.join(folder,...name.split('/')),stat=await fs.lstat(full);if(stat.isSymbolicLink())throw Error('Plugin packages cannot contain symbolic links.');if(stat.isDirectory())await visit(name);else if(stat.isFile()){if(entries.size>=128 || stat.size>2000000 || (total+=stat.size)>12000000)throw Error('Plugin packages support 128 files, 2 MB per file and 12 MB total.');entries.set(name,await fs.readFile(full));}else throw Error('Plugin packages may contain only ordinary files.');}}
 await visit();return decodePackage(entries);
}
function readZip(bytes,unwrap=false){
 if(bytes.length>16000000)throw Error('Choose a plugin ZIP under 16 MB.');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0 || bytes.readUInt16LE(end+4)!==0 || bytes.readUInt16LE(end+6)!==0 || bytes.readUInt16LE(end+8)!==bytes.readUInt16LE(end+10))throw Error('Use a standard single-disk plugin ZIP.');
 const count=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16),directoryEnd=offset+bytes.readUInt32LE(end+12);if(count>256 || directoryEnd>end)throw Error('Invalid or oversized plugin ZIP.');
 const entries=new Map(),names=new Set();let cursor=offset,total=0;
 for(let i=0;i<count;i++){
  if(cursor+46>directoryEnd || bytes.readUInt32LE(cursor)!==0x02014b50)throw Error('Invalid ZIP directory.');
  const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),crc=bytes.readUInt32LE(cursor+16),compressed=bytes.readUInt32LE(cursor+20),size=bytes.readUInt32LE(cursor+24),nameLength=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),attributes=bytes.readUInt32LE(cursor+38),local=bytes.readUInt32LE(cursor+42);
  const next=cursor+46+nameLength+extra+comment;if(next>directoryEnd)throw Error('Invalid ZIP entry.');const name=bytes.subarray(cursor+46,cursor+46+nameLength).toString('utf8');cursor=next;
  if(flags&1 || ![0,8].includes(method) || ((attributes>>>16)&0xf000)===0xa000)throw Error('Encrypted, linked or unsupported ZIP entries are not allowed.');
  appPath(name.endsWith('/')?name.slice(0,-1):name);if(names.has(name.toLowerCase()))throw Error('Duplicate plugin paths are not allowed.');names.add(name.toLowerCase());if(name.endsWith('/'))continue;
  if(entries.size>=128 || size>2000000 || (total+=size)>12000000 || local+30>offset || bytes.readUInt32LE(local)!==0x04034b50)throw Error('Invalid or oversized plugin ZIP entry.');
  const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);if(start+compressed>offset)throw Error('Invalid ZIP contents.');const data=bytes.subarray(start,start+compressed),output=method===0?Buffer.from(data):zlib.inflateRawSync(data,{maxOutputLength:2000000});if(output.length!==size || zlib.crc32(output)!==crc)throw Error('Plugin ZIP checksum failed.');entries.set(name,output);
 }
 if(unwrap&&!entries.has('manifest.json')){const roots=new Set([...entries.keys()].map(name=>name.split('/')[0]));if(roots.size!==1)throw Error('The repository must contain a plugin manifest.json at its root.');const prefix=[...roots][0]+'/';const files=new Map([...entries].map(([name,data])=>[name.slice(prefix.length),data]));return decodePackage(files);}
 return decodePackage(entries);
}
module.exports={readFolder,readZip,decodePackage};
