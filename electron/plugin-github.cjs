const {readZip}=require('./plugin-package.cjs');
async function download(url,host,limit){
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{'User-Agent':'Research-Workspace','Accept':host==='api.github.com'?'application/vnd.github+json':'application/zip'}});
 if(!response.ok)throw Error(response.status===404?'Public repository not found. Check the repository URL.':`GitHub download failed (${response.status}). Try again later.`);
 if(Number(response.headers.get('content-length'))>limit){await response.body.cancel();throw Error('Plugin download exceeds the size limit.');}
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Plugin download exceeds the size limit.');chunks.push(chunk);}return Buffer.concat(chunks);
}
async function githubPackage(value){
 let url;try{url=new URL(value);}catch{throw Error('Enter a GitHub repository URL.');}
 const parts=url.pathname.replace(/\/$/,'').split('/').slice(1);if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password||url.search||url.hash||parts.length!==2||parts.some(p=>! /^[\w.-]+$/.test(p)||['.','..'].includes(p)))throw Error('Use https://github.com/owner/repository for a public plugin repository.');
 const [owner,name]=parts,repo=name.replace(/\.git$/,'');
 const metadata=JSON.parse((await download(`https://api.github.com/repos/${owner}/${repo}`,'api.github.com',1000000)).toString());
 if(metadata.private||!metadata.default_branch)throw Error('Choose a public repository with a default branch.');
 const ref=encodeURIComponent(metadata.default_branch),bytes=await download(`https://codeload.github.com/${owner}/${repo}/zip/${ref}`,'codeload.github.com',16000000);
 return readZip(bytes,true);
}
module.exports={githubPackage};
