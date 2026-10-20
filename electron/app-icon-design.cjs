const {validateAppLogo}=require('../shared/app-logo.mjs');
function color(value,fallback){
 if(value===undefined)return fallback;
 if(typeof value!=='string'||!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)&&value!=='none')throw Error('Icon colors must be hex colors or none.');
 return value;
}
function normalizeIconDesign(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.paths)||!value.paths.length||value.paths.length>32)throw Error('Design an icon with 1 to 32 vector paths on a 256 by 256 canvas.');
 const radius=value.radius??48;
 if(!Number.isFinite(radius)||radius<0||radius>128)throw Error('Icon corner radius must be between 0 and 128.');
 let total=0;
 const paths=value.paths.map(path=>{
  if(!path||typeof path.d!=='string'||!/^\s*[Mm]/.test(path.d)||!/^[-+\d.eE,\sMmZzLlHhVvCcSsQqTtAa]+$/.test(path.d)||path.d.length>4096)throw Error('Provide a vector path using SVG path commands, under 4096 characters.');
  total+=path.d.length;
  if(total>32768||[...path.d.matchAll(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)].some(m=>!Number.isFinite(Number(m[0]))||Math.abs(Number(m[0]))>4096))throw Error('Keep icon paths within a 256 by 256 canvas.');
  const fill=color(path.fill,path.stroke?'none':'#ffffff'),stroke=color(path.stroke,'none'),strokeWidth=path.strokeWidth??8;
  if(fill==='none'&&stroke==='none')throw Error('Each icon path needs a fill or stroke color.');
  if(!Number.isFinite(strokeWidth)||strokeWidth<0||strokeWidth>32)throw Error('Icon stroke width must be between 0 and 32.');
  return {d:path.d,fill,stroke,strokeWidth};
 });
 return {background:color(value.background,'#238a79'),radius,paths};
}
let queue=Promise.resolve();
function renderIconDesign(BrowserWindow,input){
 const design=normalizeIconDesign(input);
 const job=queue.then(async()=>{
  const window=new BrowserWindow({show:false,width:256,height:256,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  let timer;
  try{
   const render=async()=>{
    await window.loadURL('data:text/html,'+encodeURIComponent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">'));
    return window.webContents.executeJavaScript(`(()=>{const design=${JSON.stringify(design)},canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');ctx.beginPath();ctx.roundRect(0,0,256,256,design.radius);if(design.background!=='none'){ctx.fillStyle=design.background;ctx.fill();}ctx.clip();ctx.lineCap=ctx.lineJoin='round';for(const shape of design.paths){const path=new Path2D(shape.d);if(shape.fill!=='none'){ctx.fillStyle=shape.fill;ctx.fill(path);}if(shape.stroke!=='none'){ctx.strokeStyle=shape.stroke;ctx.lineWidth=shape.strokeWidth;ctx.stroke(path);}}return canvas.toDataURL('image/png');})()`);
   };
   return validateAppLogo(await Promise.race([render(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Icon rendering timed out.')),8000);})]));
  }finally{clearTimeout(timer);if(!window.isDestroyed())window.destroy();}
 });
 queue=job.catch(()=>{});return job;
}
module.exports={normalizeIconDesign,renderIconDesign};
