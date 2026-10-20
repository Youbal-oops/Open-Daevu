const {test} = require('node:test');
const assert = require('node:assert/strict');
const {makeSeed,applyMutation,projectPath,projectBranch} = require('../shared/domain.mjs');
const project = (id,parentId=null) => ({id,parentId,name:id,status:'active',kpis:[],agentIds:[],notes:[],files:[],tasks:[],messages:[],edges:[]});
test('new installations start with no projects, agents, documents, or schedules',()=>{
 const seed=makeSeed();assert.deepEqual(seed.projects,[]);assert.deepEqual(seed.agents,[]);assert.deepEqual(seed.schedules,[]);assert.equal(seed.selectedProject,null);
});
test('nested work has independent data, valid ancestry, and optional metrics',()=>{
 let state=makeSeed();for(const p of [project('main'),project('campaign','main'),project('keywords','main'),project('other')])state=applyMutation(state,{type:'project',value:p});
 assert.deepEqual(projectPath(state.projects,'keywords').map(p=>p.id),['main','keywords']);assert.equal(projectBranch(state.projects,'main').length,3);
 state=applyMutation(state,{type:'project:update',projectId:'campaign',value:{status:'planned',kpis:[{id:'visits',label:'Organic visits',value:'2400',target:'3000',unit:'visits'}]}});
 assert.equal(state.projects[1].kpis[0].value,'2400');assert.equal(state.projects[0].kpis.length,0);
 state=applyMutation(state,{type:'note',projectId:'keywords',value:{id:'finding',kind:'note',title:'Evidence',content:'Kept here'}});
 assert.equal(state.projects[0].notes.length,0);assert.equal(state.projects[2].notes.length,1);
 assert.throws(()=>applyMutation(state,{type:'project:update',projectId:'main',value:{parentId:'keywords'}}),/parent/);
 assert.throws(()=>applyMutation(state,{type:'project',value:project('orphan','missing')}),/parent/);
 assert.throws(()=>applyMutation(state,{type:'project:update',projectId:'main',value:{kpis:[{id:'bad',label:''}]}}),/KPI/);
});
