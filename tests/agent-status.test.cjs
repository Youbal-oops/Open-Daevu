const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {agentBinding,agentOffline,usageLimit,cliFailure}=require('../shared/agent-status.mjs');
const {Store}=require('../electron/store.cjs'),{Runner,execute}=require('../electron/runner.cjs'),{Scheduler}=require('../electron/scheduler.cjs');
const {WorkspaceStorage}=require('../electron/storage.cjs');
const {makeFixture}=require('./fixture.cjs');
async function setup(t){const root=path.resolve(__dirname,'../.test-data');await fs.mkdir(root,{recursive:true});const folder=await fs.mkdtemp(path.join(root,'presence-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));const store=new Store(folder);await store.init();await store.update(()=>makeFixture());return store;}
async function done(runner){for(let i=0;runner.groups.size && i<200;i++)await new Promise(r=>setTimeout(r,10));assert.equal(runner.groups.size,0);}
test('Claude nonzero JSON becomes a concise usage error and preserves timezone reset evidence',async t=>{
 const store=await setup(t),message="You've hit your weekly limit · resets Oct 19, 6:30pm (Asia/Kolkata)",payload={type:'result',subtype:'success',is_error:true,api_error_status:429,result:message,session_id:'not-for-chat'};
 const error=cliFailure(1,JSON.stringify(payload),'warning');assert.equal(error.message,message);assert.equal(error.status,429);const status=usageLimit(error,Date.parse('2026-10-18T12:00:00Z'));assert.equal(status.retryAt,'2026-10-19T13:00:00.000Z');assert.equal(status.resetLabel,'Oct 19, 6:30pm (Asia/Kolkata)');
 await assert.rejects(execute(process.execPath,['-e',`console.log(${JSON.stringify(JSON.stringify(payload))});process.exitCode=1`],'',store.root,null,5000),e=>e.message===message && e.status===429);
 assert.equal(usageLimit(Error('Run reached the configured time limit.')),null);assert.equal(usageLimit(Error('Tool round limit reached.')),null);assert.equal(usageLimit(Error('Not authenticated')),null);
 assert.ok(usageLimit(Error("You've hit your limit · resets 7pm")));assert.ok(usageLimit(Error("You're out of extra usage")));
});
test('offline messages remain unread across restart, do not run, and retry without duplicate user messages',async t=>{
 const store=await setup(t);let calls=0,received='';const runner=new Runner(store,async(_cmd,_args,prompt)=>{calls++;received=prompt;if(calls===1)throw Error('Weekly limit reached');return JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Both requests handled'}});});
 await runner.start('research-project','seo','First request');await done(runner);assert.equal(store.state.projects[0].tasks[0].status,'blocked');assert.ok(agentOffline(store.state,store.state.agents[0]));assert.equal(store.state.projects[0].messages.length,1);assert.equal(store.state.projects[0].messages[0].delivery,'unread');
 const result=await runner.start('research-project','seo','Second request');assert.equal(result.queued,true);assert.equal(calls,1);assert.equal(store.state.projects[0].tasks.length,1);
 const reloaded=new Store(store.root);await reloaded.init();assert.ok(agentOffline(reloaded.state,reloaded.state.agents[0]));assert.equal(reloaded.state.projects[0].messages.filter(m=>m.delivery==='unread').length,2);
 const resumed=new Runner(reloaded,async(_cmd,_args,prompt)=>{calls++;received=prompt;return JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Both requests handled'}});});await resumed.retry('research-project','seo','legacy-seo');await done(resumed);assert.equal(calls,2);assert.match(received,/1\. First request/);assert.match(received,/2\. Second request/);assert.equal(reloaded.state.projects[0].messages.filter(m=>m.role==='user').length,2);assert.ok(reloaded.state.projects[0].messages.filter(m=>m.role==='user').every(m=>m.delivery==='read'));assert.equal(agentOffline(reloaded.state,reloaded.state.agents[0]),null);
});
test('availability is bound to provider/model/account and expires only at a known reset',()=>{
 const agent=makeFixture().agents[0],record={binding:agentBinding(agent),retryAt:'2026-10-19T13:00:00Z'},state={agentAvailability:{seo:record}};
 assert.equal(agentOffline(state,agent,Date.parse('2026-10-18T00:00Z')),record);assert.equal(agentOffline(state,agent,Date.parse('2026-10-20T00:00Z')),null);assert.equal(agentOffline(state,{...agent,model:'different'},0),null);assert.equal(agentOffline(state,{...agent,connectionId:'other'},0),null);
});
test('offline schedules wait without consuming a one-time schedule',async t=>{
 const store=await setup(t),agent=store.state.agents[0];await store.update(s=>{s.agentAvailability={seo:{binding:agentBinding(agent)}};s.schedules=[{id:'once',projectId:s.projects[0].id,agentId:'seo',enabled:true,mode:'once',nextRunAt:'2020-01-01T00:00:00Z'}];return s;});let calls=0;const scheduler=new Scheduler(store,{groups:new Map(),lanes:new Set(),async start(){calls++;return{groupId:'run'};}});await scheduler.tick();await scheduler.tick();assert.equal(calls,0);assert.equal(store.state.schedules[0].enabled,true);assert.equal(store.state.schedules[0].nextRunAt,'2020-01-01T00:00:00Z');
});
test('Drive availability stays device-local while unread receipts remain shared',()=>{
 const storage=new WorkspaceStorage('unused'),state=makeFixture();state.agentAvailability={seo:{binding:agentBinding(state.agents[0]),reason:'Quota'}};state.projects[0].messages=[{id:'queued',role:'user',delivery:'unread',text:'Waiting'}];storage.config={mode:'drive',agentAvailability:{market:{reason:'Other device binding'}},deviceSettings:{}};storage.root='unused';storage.sharedMarker={};const serialized=storage.sharedState(state);assert.ok(!serialized.agentAvailability);assert.equal(serialized.projects[0].messages[0].delivery,'unread');assert.deepEqual(storage.loaded(serialized).agentAvailability,storage.config.agentAvailability);
});
