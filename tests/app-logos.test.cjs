const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {automaticAppLogo,appLogoSource,validateAppLogo}=require('../shared/app-logo.mjs');
const {automaticIconPNG,iconFile}=require('../electron/app-icons.cjs');
const {AppProjects}=require('../electron/app-projects.cjs'),{Store}=require('../electron/store.cjs'),{makeFixture}=require('./fixture.cjs');
const logo='data:image/png;base64,'+automaticIconPNG({id:'logo-source'}).toString('base64');
test('apps get stable distinct automatic logos and only bounded PNGs become custom logos',()=>{
 const first={id:'first',data:{}},second={id:'second',data:{}};
 assert.equal(appLogoSource(first),automaticAppLogo(first));assert.notEqual(appLogoSource(first),appLogoSource(second));
 assert.equal(validateAppLogo(logo),logo);assert.equal(appLogoSource({...first,data:{logo}}),logo);
 assert.equal(appLogoSource({...first,data:{logo:'javascript:alert(1)'}}),automaticAppLogo(first));
 const huge=Buffer.from(logo.slice(22),'base64');huge.writeUInt32BE(100000,16);
 for(const value of ['https://example.com/logo.png','data:image/svg+xml,<svg/>','data:image/png;base64,AAAA','data:image/png;base64,'+huge.toString('base64'),'data:image/png;base64,'+Buffer.alloc(262145).toString('base64')])assert.throws(()=>validateAppLogo(value),/logo|PNG/);
});
test('custom logos persist, stay scoped to their app and project, and reset without changing app source',async t=>{
 const parent=path.resolve('.test-data');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'app-logo-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new Store(root);await store.init();await store.update(()=>makeFixture());const apps=new AppProjects(store);
 const first=await apps.create('research-project','First'),second=await apps.create('research-project','Second'),before=structuredClone(apps.app('research-project',first.id).data.files);
 await apps.edit('research-project',first.id,{op:'logo',content:logo});
 assert.equal(apps.app('research-project',first.id).data.logo,logo);assert.equal(apps.app('research-project',second.id).data.logo,undefined);
 await assert.rejects(apps.edit('wrong-project',first.id,{op:'logo',content:logo}));
 await assert.rejects(apps.edit('research-project',first.id,{op:'logo',content:'https://invalid/'}));assert.equal(apps.app('research-project',first.id).data.logo,logo);
 const reopened=new Store(root);await reopened.init();assert.equal(new AppProjects(reopened).app('research-project',first.id).data.logo,logo);
 await apps.edit('research-project',first.id,{op:'logo',content:''});assert.equal(apps.app('research-project',first.id).data.logo,'');assert.deepEqual(apps.app('research-project',first.id).data.files,before);
});
test('Windows icon containers reference the app PNG with the expected image size and offset',()=>{
 const png=automaticIconPNG({id:'shortcut'}),ico=iconFile({resize(){return this;},toPNG:()=>png});
 assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),1);assert.equal(ico.readUInt32LE(14),png.length);assert.equal(ico.readUInt32LE(18),22);assert.deepEqual(ico.subarray(22),png);
});

test('agent icon designs are bounded vector data, with no markup or external references',()=>{
 const {normalizeIconDesign}=require('../electron/app-icon-design.cjs');
 const icon={background:'#10281d',paths:[{d:'M64 176 L112 128 L192 80',stroke:'#b9e47a'}]};
 assert.deepEqual(normalizeIconDesign(icon),{...icon,radius:48,paths:[{...icon.paths[0],fill:'none',strokeWidth:8}]});
 for(const invalid of [{...icon,background:'url(https://example.org)'},{...icon,radius:129},{...icon,paths:Array(33).fill(icon.paths[0])},{...icon,paths:[{d:'<script>alert(1)</script>'}]},{...icon,paths:[{d:'M1e99 0'}]},{...icon,paths:[{d:'M0 0L20 20',fill:'none',stroke:'none'}]}])assert.throws(()=>normalizeIconDesign(invalid),/Icon|icon|vector/);
});

test('agents create and revise icon metadata without changing app files, with scoped and atomic failures',async t=>{
 const root=await fs.mkdtemp(path.resolve('.test-data/agent-icon-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new Store(root);await store.init();await store.update(()=>makeFixture());
 const calls=[],apps=new AppProjects(store,{renderIcon:async design=>{calls.push(design);return logo;}});
 const first=await apps.create('research-project','Agent icon'),second=await apps.create('research-project','Other app'),before=structuredClone(apps.app('research-project',first.id).data.files);
 const icon={background:'#10281d',paths:[{d:'M64 176 L192 80',stroke:'#b9e47a'}]},tool=apps.functions('research-project').find(f=>f.name==='app_edit');
 assert.ok(tool.parameters.properties.icon);
 await tool.call({appId:first.id,op:'logo',icon});
 assert.equal(apps.app('research-project',first.id).data.logo,logo);assert.deepEqual(apps.read('research-project',first.id).logoDesign,calls[0]);
 assert.equal(apps.app('research-project',second.id).data.logo,undefined);assert.deepEqual(apps.app('research-project',first.id).data.files,before);
 await assert.rejects(apps.edit('wrong-project',first.id,{op:'logo',icon}));assert.equal(calls.length,1);
 await assert.rejects(tool.call({appId:first.id,op:'logo',icon,content:''}),/one at a time/);
 apps.renderIcon=async()=>{throw Error('render failed');};await assert.rejects(tool.call({appId:first.id,op:'logo',icon}),/render failed/);assert.equal(apps.app('research-project',first.id).data.logo,logo);
 const reopened=new Store(root);await reopened.init();assert.deepEqual(new AppProjects(reopened).read('research-project',first.id).logoDesign,calls[0]);
 await tool.call({appId:first.id,op:'logo',content:''});assert.equal(apps.read('research-project',first.id).logoDesign,undefined);
});
