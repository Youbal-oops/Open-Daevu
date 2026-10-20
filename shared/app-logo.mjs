export const APP_LOGO_LIMIT=350000;
export function validateAppLogo(value){
 if(value==null||value==='')return '';
 if(typeof value!=='string'||value.length>APP_LOGO_LIMIT||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Choose a PNG app logo under 256 KB.');
 const encoded=value.slice(22);if(encoded.length%4)throw Error('Invalid app logo.');
 if(encoded.length/4*3-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0)>256*1024)throw Error('Choose a PNG app logo under 256 KB.');
 const head=Uint8Array.from(atob(encoded.slice(0,44)),c=>c.charCodeAt(0));
 if(head.length<24||[137,80,78,71,13,10,26,10].some((v,i)=>head[i]!==v)||String.fromCharCode(...head.slice(12,16))!=='IHDR')throw Error('Invalid PNG app logo.');
 const view=new DataView(head.buffer),width=view.getUint32(16),height=view.getUint32(20);
 if(!width||!height||width>512||height>512)throw Error('App logos must be at most 512 by 512 pixels.');
 return value;
}
export function appLogoPattern(artifact){
 let hash=2166136261;for(const c of String(artifact.id||artifact.title||'app'))hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 const colors=['#4187c9','#9962c7','#238a79','#c56e43','#b54e83','#6477c8','#7b8d39'];
 const color=colors[hash%colors.length],cells=[];
 for(let y=0;y<5;y++)for(let x=0;x<3;x++){hash=(Math.imul(hash,1664525)+1013904223)>>>0;if(hash&0x10000000){cells.push([x,y]);if(x!==2)cells.push([4-x,y]);}}
 if(!cells.length)cells.push([2,2]);return {color,cells};
}
export function automaticAppLogo(artifact){
 const {color,cells}=appLogoPattern(artifact);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="#edf1f5"/><g fill="${color}">${cells.map(([x,y])=>`<rect x="${28+x*40}" y="${28+y*40}" width="36" height="36" rx="7"/>`).join('')}</g></svg>`;
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
export function appLogoSource(artifact){try{return validateAppLogo(artifact.data?.logo)||automaticAppLogo(artifact);}catch{return automaticAppLogo(artifact);}}
