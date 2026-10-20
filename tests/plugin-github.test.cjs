const {test}=require('node:test'),assert=require('node:assert/strict');
const {githubPackage}=require('../electron/plugin-github.cjs');
const {readZip}=require('../electron/plugin-package.cjs');
const {zipFiles}=require('../scripts/package-plugin.cjs');
const manifest={apiVersion:1,id:'repo-plugin',name:'Repository plugin',version:'1.0.0',permissions:['storage'],panels:[{id:'main',title:'Main',type:'html',entry:'index.html'}]};
const entries={'example-main/manifest.json':JSON.stringify(manifest),'example-main/index.html':'<main>Repository plugin</main>'};
test('GitHub archives unwrap one directory and preserve package validation',()=>{
 assert.equal(readZip(zipFiles(entries),true).manifest.id,'repo-plugin');
 assert.throws(()=>readZip(zipFiles({...entries,'outside.txt':'unexpected'}),true),/root/);
 assert.throws(()=>readZip(zipFiles({'example-main/nested/manifest.json':JSON.stringify(manifest)}),true),/root/);
 assert.throws(()=>readZip(zipFiles({...entries,'example-main/../outside.txt':'bad'}),true),/path/);
});
test('repository installer downloads the default branch without credentials or scripts',async t=>{
 const urls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{urls.push(url);assert.equal(options.redirect,'error');return urls.length===1?new Response(JSON.stringify({default_branch:'main'})):new Response(zipFiles(entries));});
 assert.equal((await githubPackage('https://github.com/example/plugin.git')).manifest.id,'repo-plugin');
 assert.deepEqual(urls,['https://api.github.com/repos/example/plugin','https://codeload.github.com/example/plugin/zip/main']);
});
test('repository installer rejects arbitrary hosts, credentials and oversized downloads',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('too large',{headers:{'content-length':'20000000'}}));
 for(const url of ['http://github.com/a/b','https://localhost/a/b','https://github.com.evil.example/a/b','https://token@github.com/a/b','https://github.com/a/b/tree/main','https://github.com/a/b?token=secret'])await assert.rejects(githubPackage(url),/public plugin repository/);
 await assert.rejects(githubPackage('https://github.com/a/b'),/size limit/);
});
