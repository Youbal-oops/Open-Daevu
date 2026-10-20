const {deflateSync}=require('node:zlib');
const {appLogoPattern,validateAppLogo}=require('../shared/app-logo.mjs');
const cache=new Map();
function crc32(buffer){let value=0xffffffff;for(const byte of buffer){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;}
function chunk(name,data){const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([length,type,data,crc]);}
function automaticIconPNG(artifact){
 const {color,cells}=appLogoPattern(artifact),rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)),size=256,rows=Buffer.alloc(size*(size*4+1));
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const cell=cells.some(([cx,cy])=>x>=28+cx*40&&x<64+cx*40&&y>=28+cy*40&&y<64+cy*40),pixel=cell?rgb:[237,241,245],offset=y*(size*4+1)+1+x*4;
  const dx=Math.max(48-x,0,x-207),dy=Math.max(48-y,0,y-207),alpha=dx&&dy&&dx*dx+dy*dy>48*48?0:255;
  rows[offset]=pixel[0];rows[offset+1]=pixel[1];rows[offset+2]=pixel[2];rows[offset+3]=alpha;
 }
 const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
function nativeAppIcon(artifact,nativeImage){
 const key=artifact.id+':'+(artifact.data?.logo||'');if(cache.has(key))return cache.get(key);
 let image;try{const logo=validateAppLogo(artifact.data?.logo);if(logo)image=nativeImage.createFromDataURL(logo);}catch{}
 if(!image||image.isEmpty())image=nativeImage.createFromBuffer(automaticIconPNG(artifact));
 image=image.resize({width:256,height:256});cache.set(key,image);while(cache.size>64)cache.delete(cache.keys().next().value);return image;
}
function iconFile(image){
 const png=image.resize({width:256,height:256}).toPNG(),header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);return Buffer.concat([header,png]);
}
module.exports={automaticIconPNG,nativeAppIcon,iconFile};
