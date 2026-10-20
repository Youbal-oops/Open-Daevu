const { makeFixture } = require('./fixture.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {Store}=require('../electron/store.cjs');
const {Runner}=require('../electron/runner.cjs');
const {Scheduler}=require('../electron/scheduler.cjs');
const {applyMutation,makeSeed,nextOccurrence,normalizeSchedule}=require('../shared/domain.mjs');
async function setup(t){const root=path.resolve(__dirname,'../.test-data');await fs.mkdir(root,{recursive:true});const dir=await fs.mkdtemp(path.join(root,'schedule-'));const store=new Store(dir);await store.init(); await store.update(() => makeFixture());t.after(()=>fs.rm(dir,{recursive:true,force:true}));return store;}
const base={id:'daily',projectId:'research-project',agentId:'seo',name:'SEO check',task:'Research and save findings',mode:'daily',time:'09:00',enabled:true};
test('schedule validation, daily rollover and interval arithmetic',()=>{
 const seed=makeFixture(), morning=new Date(2026,9,17,8,30);
 const daily=normalizeSchedule(seed,base,null,morning);
 assert.equal(new Date(daily.nextRunAt).getHours(),9);assert.equal(new Date(daily.nextRunAt).getDate(),17);
 assert.equal(new Date(nextOccurrence(daily,new Date(2026,9,17,10))).getDate(),18);
 assert.equal(new Date(nextOccurrence({...base,mode:'interval',intervalMinutes:60},morning)).getTime()-morning.getTime(),3600000);
 assert.throws(()=>normalizeSchedule(seed,{...base,mode:'interval',intervalMinutes:1}),/10 minutes/);
 assert.throws(()=>normalizeSchedule(seed,{...base,agentId:'unknown'}),/Assign/);
 assert.throws(()=>normalizeSchedule(seed,{...base,mode:'once',at:'2020-01-01T00:00:00Z'}),/future/);
 const paused=applyMutation(seed,{type:'schedule',value:{...base,enabled:false}});assert.equal(paused.schedules.length,1);
});
test('due schedules run once, catch up after sleep, and record completion',async t=>{
 const store=await setup(t), groups=new Map(),lanes=new Set(),calls=[];
 await store.mutate({type:'schedule',value:{...base,mode:'interval',intervalMinutes:60}});
 await store.update(s=>{s.schedules[0].nextRunAt='2020-01-01T00:00:00Z';return s;});
 const runner={groups,lanes,async start(project,agent,text){calls.push(text);groups.set('group',{});await store.update(s=>{s.projects[0].tasks.push({id:'task',groupId:'group',status:'running'});return s;});return{groupId:'group'};}};
 const clock=()=>new Date('2026-10-17T10:00:00Z'),scheduler=new Scheduler(store,runner,clock);
 await scheduler.tick();await scheduler.tick();assert.equal(calls.length,1);assert.equal(store.state.schedules[0].lastStatus,'running');
 assert.equal(store.state.schedules[0].nextRunAt,'2026-10-17T11:00:00.000Z');
 groups.delete('group');await store.update(s=>{s.projects[0].tasks[0].status='done';return s;});await scheduler.tick();assert.equal(store.state.schedules[0].lastStatus,'done');
});
test('busy agents wait without duplicate runs; one-time schedules disable after firing',async t=>{
 const store=await setup(t);await store.mutate({type:'schedule',value:{...base,mode:'once',at:new Date(Date.now()+3600000).toISOString()}});
 await store.update(s=>{s.schedules[0].nextRunAt='2020-01-01T00:00:00Z';return s;});
 let count=0;const lanes=new Set(['research-project:seo']);const runner={groups:new Map(),lanes,async start(){count++;return{groupId:'once'}}};const scheduler=new Scheduler(store,runner);
 await scheduler.tick();assert.equal(count,0);lanes.clear();await scheduler.tick();assert.equal(count,1);assert.equal(store.state.schedules[0].enabled,false);await scheduler.tick();assert.equal(count,1);
});
test('agents can create their own follow-up schedules, but cannot schedule another profile',async t=>{
 const store=await setup(t);const reply='Follow-up planned.\n```research-actions\n'+JSON.stringify({schedules:[{name:'My check',task:'Review evidence',mode:'interval',intervalMinutes:60},{name:'Other agent',task:'Not allowed',agentId:'market',mode:'interval',intervalMinutes:60}]})+'\n```';
 const runner=new Runner(store,async()=>JSON.stringify({type:'item.completed',item:{type:'agent_message',text:reply}}));
 await runner.start('research-project','seo','Plan a follow-up');while(runner.groups.size)await new Promise(r=>setTimeout(r,15));
 assert.equal(store.state.schedules.length,1);assert.equal(store.state.schedules[0].agentId,'seo');assert.equal(store.state.schedules[0].createdBy,'Scout');assert.ok(store.state.projects[0].messages.some(m=>m.text.includes('only for themselves')));
 await store.mutate({type:'settings',value:{allowAgentSchedules:false}});await runner.start('research-project','seo','Check again');while(runner.groups.size)await new Promise(r=>setTimeout(r,15));assert.equal(store.state.schedules.length,1);
});

test('weekly schedules select local weekdays, roll over weeks, validate and reschedule edits',()=>{
 const seed=makeFixture(), monday=new Date(2026,9,19,8,30);
 const weekly=normalizeSchedule(seed,{...base,mode:'weekly',weekdays:[3,1,3]},null,monday);
 assert.deepEqual(weekly.weekdays,[1,3]);
 assert.equal(new Date(weekly.nextRunAt).getTime(),new Date(2026,9,19,9).getTime());
 assert.equal(new Date(nextOccurrence(weekly,new Date(2026,9,19,9))).getTime(),new Date(2026,9,21,9).getTime());
 assert.equal(new Date(nextOccurrence(weekly,new Date(2026,9,21,10))).getTime(),new Date(2026,9,26,9).getTime());
 const changed=normalizeSchedule(seed,{...weekly,weekdays:[5]},weekly,monday);
 assert.equal(new Date(changed.nextRunAt).getTime(),new Date(2026,9,23,9).getTime());
 const unchanged=normalizeSchedule(seed,{...weekly,name:'Renamed'},weekly,new Date(2026,9,19,8,45));
 assert.equal(unchanged.nextRunAt,weekly.nextRunAt);
 for(const weekdays of [[],[-1],[7],['1'],null]) assert.throws(()=>normalizeSchedule(seed,{...base,mode:'weekly',weekdays}),/weekday/);
 assert.throws(()=>normalizeSchedule(seed,{...base,mode:'weekly',weekdays:[1],time:'25:00'}),/local time/);
 const interval=normalizeSchedule(seed,{...base,mode:'interval',intervalMinutes:20160},null,monday);
 assert.equal(Date.parse(interval.nextRunAt)-monday.getTime(),14*86400000);
});
test('agent weekly actions persist selected days and preserve paused schedules',async t=>{
 const store=await setup(t);
 const weekly={name:'Weekly review',task:'Review evidence',mode:'weekly',weekdays:[1,5],time:'10:30'};
 const reply='```research-actions\n'+JSON.stringify({schedules:[weekly]})+'\n```';
 const runner=new Runner(store,async()=>JSON.stringify({type:'item.completed',item:{type:'agent_message',text:reply}}));
 await runner.start('research-project','seo','Schedule weekly');while(runner.groups.size)await new Promise(r=>setTimeout(r,15));
 assert.equal(store.state.schedules.length,1);assert.deepEqual(store.state.schedules[0].weekdays,[1,5]);
 assert.ok([1,5].includes(new Date(store.state.schedules[0].nextRunAt).getDay()));
 await store.mutate({type:'schedule',value:{...store.state.schedules[0],enabled:false}});
 await runner.start('research-project','seo','Schedule again');while(runner.groups.size)await new Promise(r=>setTimeout(r,15));
 assert.equal(store.state.schedules.length,1);assert.equal(store.state.schedules[0].enabled,false);
});
