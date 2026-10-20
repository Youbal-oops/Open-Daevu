import React from 'react';
import {appLogoSource,automaticAppLogo,validateAppLogo} from '../shared/app-logo.mjs';
import './app-logo.css';
export function AppLogo({artifact,size=32}){return <img className="app-logo" src={appLogoSource(artifact)} width={size} height={size} alt="" onError={e=>{const fallback=automaticAppLogo(artifact);if(e.currentTarget.getAttribute('src')!==fallback)e.currentTarget.src=fallback;}}/>;}
export async function readAppLogo(file){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG or WebP image.');
 if(file.size>5*1024*1024)throw Error('Choose an image under 5 MB.');
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();image.src=url;await image.decode();
  if(image.naturalWidth*image.naturalHeight>16000000)throw Error('Choose an image under 16 megapixels.');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const scale=Math.min(256/image.naturalWidth,256/image.naturalHeight),width=image.naturalWidth*scale,height=image.naturalHeight*scale;
  canvas.getContext('2d').drawImage(image,(256-width)/2,(256-height)/2,width,height);
  let logo=canvas.toDataURL('image/png');
  if(logo.length>349000){const smaller=document.createElement('canvas');smaller.width=smaller.height=192;smaller.getContext('2d').drawImage(canvas,0,0,192,192);logo=smaller.toDataURL('image/png');}
  return validateAppLogo(logo);
 }finally{URL.revokeObjectURL(url);}
}
