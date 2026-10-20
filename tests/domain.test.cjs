const { makeFixture } = require('./fixture.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeSeed, parseActions, buildArgs, extractReply, csvParse, csvStringify, applyMutation, normalizeBrowserURL } = require('../shared/domain.mjs');
test('tool defaults can change for an unlinked account profile without replacing its identity',()=>{
 const state=makeFixture();state.agents[0]={...state.agents[0],provider:'chatgpt',model:'',connectionId:undefined};assert.throws(()=>applyMutation(state,{type:'agent',value:state.agents[0]}),/account connection/);
 const next=applyMutation(state,{type:'agent:tools',value:{id:'seo',toolIds:['mcp:fixture'],connectionId:'must-not-change',provider:'custom'}});assert.deepEqual(next.agents[0].toolIds,['mcp:fixture']);assert.equal(next.agents[0].provider,'chatgpt');assert.equal(next.agents[0].connectionId,undefined);assert.throws(()=>applyMutation(state,{type:'agent:tools',value:{id:'missing',toolIds:[]}}),/existing agent/);
});
test('chat metadata is scoped to assigned agents and keeps existing messages',()=>{
 const state=makeFixture();state.projects[0].messages=[{id:'old',agentId:'seo',role:'user',text:'Preserved'}];const next=applyMutation(state,{type:'chat:create',projectId:'research-project',value:{id:'chat-one',agentId:'seo'}});assert.equal(next.projects[0].messages[0].text,'Preserved');assert.equal(require('../shared/conversations.mjs').agentChats(next.projects[0],'seo').find(c=>c.id==='chat-one').title,'New chat');assert.throws(()=>applyMutation(next,{type:'chat:create',projectId:'research-project',value:{id:'chat-one',agentId:'seo'}}),/already exists/);assert.throws(()=>applyMutation(state,{type:'chat:create',projectId:'research-project',value:{id:'legacy-seo',agentId:'seo'}}));assert.throws(()=>applyMutation(state,{type:'chat:create',projectId:'research-project',value:{id:'outside',agentId:'unassigned'}}));
});
test('CSV round trips quotes, commas, multiline cells, empty values, and Unicode', () => {
  const rows = [['Query', 'Finding', 'Source'], ['"best", tools', 'First line\nSecond line', 'https://example.com/नमस्ते'], ['', 'x', '']];
  assert.deepEqual(csvParse(csvStringify(rows)), rows);
  assert.deepEqual(csvParse('\uFEFFA,B\r\n1,2\r\n'), [['A','B'],['1','2']]);
  assert.throws(() => csvParse('"unfinished'), /unclosed/);
});
test('agent actions preserve ordinary Markdown and validate action payloads', () => {
  assert.deepEqual(parseActions('No actions requested.'), { notes: [], handoffs: [], schedules: [], todos: [], apps: [], boards: [], diagrams: [], pages: [], comments: [], links: [], events: [] });
  const result = parseActions('A finding.\n```research-actions\n{"notes":[{"title":"Facts","kind":"sheet","content":"A,B"}],"handoffs":[{"agentId":"market","task":"Compare competitors"}]}\n```');
  assert.equal(result.notes[0].kind, 'sheet'); assert.equal(result.handoffs[0].agentId, 'market');
  assert.throws(() => parseActions('```research-actions\n{"notes": {}}\n```'), /array/);
  assert.throws(() => parseActions('```research-actions\nnot json\n```'), /invalid/);
});
test('CLI invocations use stdin and keep provider tools and model settings', () => {
  const codex = buildArgs({ provider:'codex', model:'my-model' });
  assert.equal(codex.at(-1), '-'); assert.ok(codex.includes('--search')); assert.ok(codex.includes('my-model')); assert.ok(codex.includes('workspace-write'));
  assert.ok(!codex.some(a => a.includes('bypass')));
  const claude = buildArgs({ provider:'claude', model:'opus', allowedTools:'mcp__search__query' }, { claudeMcpPath:'C:\\local\\mcp.json' });
  assert.equal(claude.filter(a => a === '--allowedTools').length, 1);
  assert.ok(claude[claude.indexOf('--allowedTools') + 1].includes('WebSearch'));
  assert.ok(claude.includes('C:\\local\\mcp.json'));
  assert.deepEqual(buildArgs({ provider:'custom', model:'model-a', args:'["--model","{model}"]' }), ['--model', 'model-a']);
  assert.throws(() => buildArgs({ provider:'custom', args:'{"bad":true}' }), /array/);
});
test('provider responses report failures rather than inventing findings', () => {
  assert.equal(extractReply('codex', '{"type":"item.completed","item":{"type":"agent_message","text":"Found it"}}\n'), 'Found it');
  assert.throws(() => extractReply('codex','{"type":"turn.failed","error":{"message":"No access"}}'), /No access/);
  assert.equal(extractReply('claude','{"result":"Research complete","is_error":false}'), 'Research complete');
  assert.throws(() => extractReply('claude','{"result":"Not authenticated","is_error":true}'), /Not authenticated/);
});
test('workspace mutations preserve unrelated project data and reject unsafe IDs', () => {
  const seed = makeFixture();
  const result = applyMutation(seed, { type:'theme', value:'light' });
  assert.equal(result.theme, 'light'); assert.equal(seed.theme, 'dark'); assert.equal(result.projects[0].notes.length, 2);
  assert.throws(() => applyMutation(seed,{ type:'note', projectId:'research-project', value:{id:'../escape',kind:'note'} }), /Invalid/);
  assert.throws(() => applyMutation(seed,{ type:'project', value:{id:'../../escape', name:'Bad'} }), /Invalid/);
});
test('browser addresses allow websites and searches, and reject local or executable schemes',()=>{
  assert.equal(normalizeBrowserURL('example.com'),'https://example.com/');
  assert.equal(normalizeBrowserURL('localhost:5173'),'http://localhost:5173/');
  assert.equal(normalizeBrowserURL('127.0.0.1:8080'),'http://127.0.0.1:8080/');
  assert.ok(normalizeBrowserURL('research methods').startsWith('https://duckduckgo.com/'));
  for(const url of ['file:///C:/secret.txt','javascript:alert(1)','data:text/html,hello','ftp://example.com','https://user:secret@example.com'])assert.throws(()=>normalizeBrowserURL(url));
  const next=applyMutation(makeFixture(),{type:'source',projectId:'research-project',value:{url:'example.com',title:'Example source'}});
  assert.equal(next.projects[0].sources[0].url,'https://example.com/');
  assert.equal(applyMutation(next,{type:'source',projectId:'research-project',value:{url:'example.com'}}).projects[0].sources.length,1);
});
test('effort and selected tools shape Claude and Codex invocations', () => {
  const { toolPatterns, effortGuidance } = require('../shared/domain.mjs');
  const claude = buildArgs({ provider:'claude', model:'opus', toolIds:['builtin:Read'] }, { customTools:[{ id:'git', name:'Git', pattern:'Bash(git log:*)' }] }, { effort:'high', tools:['mcp:my server','custom:git','builtin:Nope'], addDirs:['C:\data'] });
  const allowed = claude[claude.indexOf('--allowedTools') + 1];
  assert.ok(allowed.includes('mcp__my_server') && allowed.includes('Bash(git log:*)') && !allowed.includes('Nope'));
  assert.equal(claude[claude.indexOf('--effort') + 1], 'high'); assert.equal(claude[claude.indexOf('--add-dir') + 1], 'C:\data');
  assert.ok(!buildArgs({ provider:'claude' }).includes('--effort'));
  const codex = buildArgs({ provider:'codex' }, {}, { effort:'max' });
  assert.ok(codex.includes('model_reasoning_effort="high"')); assert.equal(codex.at(-1), '-');
  assert.deepEqual(toolPatterns(['builtin:Grep','builtin:Grep']), ['Grep']);
  assert.ok(effortGuidance('low').includes('low')); assert.equal(effortGuidance('auto'), '');
});
test('agents accept small profile pictures and reject other image payloads', () => {
  const agent = { id:'a', name:'A', role:'r', provider:'codex', command:'codex', args:'[]', prompt:'p' };
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(applyMutation(makeFixture(), { type:'agent', value:{ ...agent, avatar:png, toolIds:['builtin:Read'], effort:'high' } }).agents.at(-1).avatar, png);
  for (const avatar of ['https://example.com/x.png','data:image/svg+xml;base64,AAAA','data:text/html;base64,AAAA']) assert.throws(() => applyMutation(makeFixture(), { type:'agent', value:{ ...agent, avatar } }), /PNG/);
  assert.throws(() => applyMutation(makeFixture(), { type:'agent', value:{ ...agent, effort:'extreme' } }), /effort/);
  assert.throws(() => applyMutation(makeFixture(), { type:'settings', value:{ userAvatar:'javascript:alert(1)' } }), /PNG/);
});
test('calendar tasks, canvas items, kanban boards and charts are validated and cleaned up together', () => {
  let s = makeFixture();
  s = applyMutation(s, { type:'todo', value:{ id:'t1', title:'Call supplier', date:'2026-11-02', time:'09:30' } });
  assert.equal(s.todos[0].done, false);
  s = applyMutation(s, { type:'todo', value:{ ...s.todos[0], done:true } }); assert.equal(s.todos.length, 1); assert.equal(s.todos[0].done, true);
  assert.throws(() => applyMutation(s, { type:'todo', value:{ id:'t2', title:'x', date:'tomorrow' } }), /date/);
  s = applyMutation(s, { type:'todo:delete', value:'t1' }); assert.equal(s.todos.length, 0);
  const kanban = { id:'k1', kind:'kanban', title:'Plan', data:{ columns:[{ id:'c1', title:'To do', cards:[{ id:'x', text:'Draft' }] }] } };
  s = applyMutation(s, { type:'artifact', projectId:'research-project', value:kanban });
  s = applyMutation(s, { type:'canvas:item', projectId:'research-project', value:{ id:'i1', type:'artifact', refId:'k1', position:{ x:10, y:20 }, size:{ w:9999, h:200 } } });
  s = applyMutation(s, { type:'canvas:item', projectId:'research-project', value:{ id:'i2', type:'sticky', text:'Idea', color:'yellow', position:{ x:0, y:0 } } });
  assert.equal(s.projects[0].canvas.find(c => c.id === 'i1').size.w, 4000);
  assert.throws(() => applyMutation(s, { type:'canvas:item', projectId:'research-project', value:{ id:'i3', type:'script' } }), /Invalid/);
  assert.throws(() => applyMutation(s, { type:'artifact', projectId:'research-project', value:{ id:'bad', kind:'bar', title:'Chart', data:{} } }), /data/);
  s = applyMutation(s, { type:'board', projectId:'research-project', value:{ layout:[{ id:'brief', size:{ w:400, h:300 }, embed:true }], positions:[{ id:'i2', position:{ x:50, y:60 } }] } });
  assert.equal(s.projects[0].notes[0].embed, true); assert.equal(s.projects[0].canvas.find(c => c.id === 'i2').position.x, 50);
  s = applyMutation(s, { type:'artifact:delete', projectId:'research-project', value:'k1' });
  assert.equal(s.projects[0].artifacts.length, 0); assert.deepEqual(s.projects[0].canvas.map(c => c.id), ['i2']);
});
test('agents can propose calendar tasks in structured actions', () => {
  const result = parseActions('Plan ready.\n```research-actions\n{"todos":[{"title":"Review competitors","date":"2026-12-01","time":"14:00","notes":"Focus on pricing"}]}\n```');
  assert.deepEqual(result.todos, [{ title:'Review competitors', date:'2026-12-01', time:'14:00', notes:'Focus on pricing' }]);
  assert.throws(() => parseActions('```research-actions\n{"todos":[{"title":"x","date":"soon"}]}\n```'), /date/);
});
test('pages, starting views and freehand drawings are validated', () => {
  let s = makeFixture();
  s = applyMutation(s, { type:'page', projectId:'research-project', value:{ blocks:[{ id:'b1', type:'h1', text:'Plan' }, { id:'b2', type:'todo', text:'Ship', checked:true }, { id:'b3', type:'embed', refType:'note', refId:'brief' }] } });
  assert.equal(s.projects[0].page.blocks.length, 3); assert.equal(s.projects[0].page.blocks[1].checked, true);
  assert.throws(() => applyMutation(s, { type:'page', projectId:'research-project', value:{ blocks:[{ id:'x', type:'script' }] } }), /Invalid/);
  assert.throws(() => applyMutation(s, { type:'page', projectId:'research-project', value:{ blocks:[{ id:'x', type:'embed', refType:'url', refId:'a' }] } }), /embedded/);
  s = applyMutation(s, { type:'project:update', projectId:'research-project', value:{ home:'canvas' } }); assert.equal(s.projects[0].home, 'canvas');
  assert.throws(() => applyMutation(s, { type:'project:update', projectId:'research-project', value:{ home:'settings' } }), /starting view/);
  s = applyMutation(s, { type:'canvas:item', projectId:'research-project', value:{ id:'d1', type:'draw', color:'blue', position:{ x:0, y:0 }, size:{ w:100, h:60 }, points:[0,0,10.55,12,50,60] } });
  assert.deepEqual(s.projects[0].canvas[0].points, [0, 0, 10.6, 12, 50, 60]);
  s = applyMutation(s, { type:'artifact', projectId:'research-project', value:{ id:'h1', kind:'html', title:'Calc', data:{ html:'<p>x</p>' } } });
  assert.throws(() => applyMutation(s, { type:'artifact', projectId:'research-project', value:{ id:'h2', kind:'html', title:'Bad', data:{ html:5 } } }), /HTML/);
});
test('diagram layout places a flowchart left to right inside a titled frame with connectors', () => {
  const { layoutDiagram } = require('../shared/domain.mjs');
  let n = 0; const make = () => `n${++n}`;
  const out = layoutDiagram({ title: 'Funnel', nodes: [{ id: 'a', label: 'Start', shape: 'roundrect' }, { id: 'b', label: 'Qualified?', shape: 'diamond' }, { id: 'c', label: 'Nurture', shape: 'hexagon' }, { id: 'd', label: 'Sale', shape: 'rect' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'no' }, { from: 'b', to: 'd', label: 'yes' }, { from: 'c', to: 'b' }, { from: 'x', to: 'a' }] }, { x: 0, y: 0 }, make);
  assert.equal(out.items[0].type, 'frame'); assert.equal(out.items[0].text, 'Funnel');
  const byText = Object.fromEntries(out.items.slice(1).map(i => [i.text, i]));
  assert.ok(byText.Start.position.x < byText['Qualified?'].position.x && byText['Qualified?'].position.x < byText.Sale.position.x);
  assert.equal(out.edges.length, 4);
  assert.equal(out.edges.find(e => e.label === 'no').sourceHandle, 'right');
  assert.equal(out.edges.find(e => e.source === byText.Nurture.id).sourceHandle, 'bottom');
  for (const item of out.items.slice(1)) assert.ok(item.position.x >= out.items[0].position.x && item.position.x + item.size.w <= out.items[0].position.x + out.items[0].size.w);
  let s = makeFixture();
  for (const item of out.items) s = applyMutation(s, { type:'canvas:item', projectId:'research-project', value:item });
  assert.equal(s.projects[0].canvas.length, 5);
  assert.deepEqual(parseActions('```research-actions\n{"diagrams":[{"title":"T","nodes":[{"id":"a","label":"A","shape":"hexagon"},{"id":"b","label":"B","shape":"nope"}],"edges":[{"from":"a","to":"b"},{"from":"a","to":"zzz"}]}]}\n```').diagrams[0].edges, [{ from:'a', to:'b', label:'' }]);
});
test('canvas undo restores items, connectors, and card layout; self-loop connectors are supported', () => {
  const { layoutDiagram } = require('../shared/domain.mjs');
  let s = makeFixture();
  s = applyMutation(s, { type:'canvas:item', projectId:'research-project', value:{ id:'a1', type:'rect', color:'white', text:'One', position:{ x:10, y:10 }, size:{ w:120, h:60 } } });
  const before = { canvas: structuredClone(s.projects[0].canvas), edges: [], layout: s.projects[0].notes.map(n => ({ id:n.id, position:n.position, size:n.size, embed:n.embed })) };
  s = applyMutation(s, { type:'canvas:item', projectId:'research-project', value:{ id:'a2', type:'diamond', color:'white', position:{ x:200, y:10 } } });
  s = applyMutation(s, { type:'board', projectId:'research-project', value:{ positions:[{ id:'brief', position:{ x:999, y:999 } }] } });
  s = { ...s, projects:[{ ...s.projects[0], edges:[{ id:'e1', source:'a1', target:'a2', type:'default' }] }, ...s.projects.slice(1)] };
  s = applyMutation(s, { type:'canvas:restore', projectId:'research-project', value:before });
  assert.deepEqual(s.projects[0].canvas.map(c => c.id), ['a1']); assert.equal(s.projects[0].edges.length, 0);
  assert.notEqual(s.projects[0].notes[0].position.x, 999);
  assert.throws(() => applyMutation(s, { type:'canvas:restore', projectId:'research-project', value:{ canvas:[{ id:'x', type:'nope' }], edges:[] } }), /Invalid/);
  assert.throws(() => applyMutation(s, { type:'canvas:restore', projectId:'research-project', value:{ canvas:[], edges:[{ id:'../x', source:'a', target:'b' }] } }), /connector/);
  const out = layoutDiagram({ title:'Loop', nodes:[{ id:'a', label:'Call', shape:'diamond' }, { id:'b', label:'Done', shape:'rect' }], edges:[{ from:'a', to:'b' }, { from:'a', to:'a' }] }, { x:0, y:0 }, (() => { let n = 0; return () => `i${++n}`; })());
  assert.equal(out.edges.length, 2); const loop = out.edges.find(e => e.type === 'loop'); assert.equal(loop.source, loop.target);
  assert.ok(out.items.slice(1).every(i => i.color === 'white'));
});
test('databases, page icons and covers, and new block types are validated', () => {
  const db = { id:'d1', kind:'database', title:'Tasks', data:{ properties:[{ id:'p-name', name:'Name', type:'title' }, { id:'p-status', name:'Status', type:'select', options:['To do','Done'] }, { id:'p-due', name:'Due', type:'date' }], rows:[{ id:'r1', cells:{ 'p-name':'Write', 'p-status':'To do' } }], views:[{ id:'v1', type:'table' }, { id:'v2', type:'board', groupBy:'p-status' }] } };
  let s = applyMutation(makeFixture(), { type:'artifact', projectId:'research-project', value:db });
  assert.equal(s.projects[0].artifacts[0].data.rows.length, 1);
  const bad = patch => { const copy = structuredClone(db); patch(copy.data); return applyMutation(makeFixture(), { type:'artifact', projectId:'research-project', value:copy }); };
  assert.throws(() => bad(d => { d.properties.push({ id:'p2', name:'Another', type:'title' }); }), /exactly one title/);
  assert.throws(() => bad(d => { d.properties[1].type = 'formula'; }), /supported types/);
  assert.throws(() => bad(d => { d.views[0].type = 'timeline'; }), /view/);
  assert.throws(() => bad(d => { d.rows[0].id = '../x'; }), /rows/);
  s = applyMutation(s, { type:'page', projectId:'research-project', value:{ icon:'📚', cover:'sage', blocks:[{ id:'b1', type:'numbered', text:'One' }, { id:'b2', type:'toggle', text:'More', body:'Hidden', open:true }, { id:'b3', type:'code', text:'const a = 1;' }] } });
  assert.equal(s.projects[0].page.icon, '📚'); assert.equal(s.projects[0].page.cover, 'sage'); assert.equal(s.projects[0].page.blocks[1].body, 'Hidden');
  assert.throws(() => applyMutation(s, { type:'page', projectId:'research-project', value:{ cover:'neon', blocks:[{ id:'b1', type:'p' }] } }), /cover/);
  s = applyMutation(s, { type:'page', projectId:'research-project', value:{ blocks:[{ id:'b1', type:'p', text:'x' }] } });
  assert.equal(s.projects[0].page.cover, 'sage');
});
test('references resolve cells, ranges, database values, text blocks and KPIs, and KPI formulas call them', () => {
  const { resolveRef, kpiValue, evaluateExpression, referencedValues, listReferences, newRefId } = require('../shared/domain.mjs');
  let s = makeFixture(); const pid = 'research-project';
  s = applyMutation(s, { type:'note', projectId:pid, value:{ id:'sheet1', title:'Budget', kind:'sheet', content:'Item,Cost\nAds,100\nTools,50\nTotal,=SUM(B2:B3)', author:'You', createdAt:'x', updatedAt:'x' } });
  s = applyMutation(s, { type:'artifact', projectId:pid, value:{ id:'db1', kind:'database', title:'Leads', data:{ properties:[{ id:'pn', name:'Name', type:'title' }, { id:'pv', name:'Value', type:'number' }], rows:[{ id:'r1', cells:{ pn:'A', pv:30 } }, { id:'r2', cells:{ pn:'B', pv:70 } }], views:[{ id:'v', type:'table' }] } } });
  s = applyMutation(s, { type:'page', projectId:pid, value:{ blocks:[{ id:'blk1', type:'p', text:'Launch date is Friday' }] } });
  const add = (id, name, target) => { s = applyMutation(s, { type:'ref', projectId:pid, value:{ id, name, target } }); };
  add('r_cost', 'cost', { type:'cell', noteId:'sheet1', range:'B4' });
  add('r_costs', 'costs', { type:'cell', noteId:'sheet1', range:'B2:B3' });
  add('r_lead', '', { type:'dbcell', artifactId:'db1', rowId:'r2', propId:'pv' });
  add('r_leads', 'leads', { type:'dbcol', artifactId:'db1', propId:'pv' });
  add('r_text', 'launch', { type:'block', blockId:'blk1' });
  const p = () => s.projects[0];
  assert.equal(resolveRef(p(), 'cost').value, 150); assert.deepEqual(resolveRef(p(), 'costs').list, ['100', '50']);
  assert.equal(resolveRef(p(), 'r_lead').value, 70); assert.deepEqual(resolveRef(p(), 'leads').list, [30, 70]);
  assert.equal(resolveRef(p(), 'launch').value, 'Launch date is Friday');
  assert.equal(resolveRef(p(), 'nope').ok, false);
  s = applyMutation(s, { type:'project:update', projectId:pid, value:{ kpis:[{ id:'k1', label:'Revenue', value:'', target:'', unit:'$', formula:'=SUM({{leads}}) * 2' }, { id:'k2', label:'Margin', value:'', formula:'={{leads}}' }] } });
  assert.equal(kpiValue(p(), p().kpis[0]), '200');
  s = applyMutation(s, { type:'ref', projectId:pid, value:{ id:'r_kpi1', name:'revenue', target:{ type:'kpi', kpiId:'k1' } } });
  s = applyMutation(s, { type:'project:update', projectId:pid, value:{ kpis:[...p().kpis, { id:'k3', label:'Profit', value:'', formula:'={{revenue}} - {{cost}}' }] } });
  assert.equal(kpiValue(p(), p().kpis[2]), '50');
  assert.equal(evaluateExpression(p(), 'Cost is {{cost}} of {{revenue}}'), 'Cost is 150 of 200'); assert.equal(evaluateExpression(p(), '=ROUND({{cost}}/3,1)'), '50');
  s = applyMutation(s, { type:'ref', projectId:pid, value:{ id:'r_self', name:'loop', target:{ type:'kpi', kpiId:'k4' } } });
  s = applyMutation(s, { type:'project:update', projectId:pid, value:{ kpis:[...p().kpis, { id:'k4', label:'Loop', value:'', formula:'={{loop}} + 1' }] } });
  assert.match(kpiValue(p(), p().kpis[3]), /^#/);
  assert.equal(kpiValue(p(), { id:'z', formula:'={{missing}}' }), '#REF!');
  const lines = referencedValues(p(), 'Compare {{cost}} with {{ghost}}'); assert.ok(lines[0].startsWith('{{cost}} = 150 (Budget!B4')); assert.ok(lines[1].startsWith('{{ghost}} could not be read'));
  assert.ok(listReferences(p()).some(r => r.name === 'leads' && r.value.length === 2));
  assert.match(newRefId(), /^r_[a-z0-9]{6}$/);
  assert.throws(() => add('r_bad1', 'Bad Name', { type:'kpi', kpiId:'k1' }), /Names use/);
  assert.throws(() => add('r_dup1', 'cost', { type:'kpi', kpiId:'k1' }), /already used/);
  assert.throws(() => add('r_bad2', '', { type:'cell', noteId:'sheet1', range:'B2:' }), /valid thing/);
  assert.throws(() => add('nope', '', { type:'kpi', kpiId:'k1' }), /Invalid reference/);
  s = applyMutation(s, { type:'ref:delete', projectId:pid, value:'r_cost' }); assert.equal(resolveRef(p(), 'cost').ok, false);
  assert.throws(() => applyMutation(s, { type:'project:update', projectId:pid, value:{ kpis:[{ id:'k9', label:'x', value:'', formula:'x'.repeat(501) }] } }), /KPIs/);
});
test('live apps keep their own saved data without touching their code', () => {
  let s = applyMutation(makeFixture(), { type:'artifact', projectId:'research-project', value:{ id:'app1', kind:'html', title:'Map', data:{ html:'<p>x</p>' } } });
  s = applyMutation(s, { type:'artifact:state', projectId:'research-project', value:{ artifactId:'app1', state:{ tokens:[{ x:1, y:2 }] } } });
  const app = s.projects[0].artifacts[0]; assert.equal(app.data.html, '<p>x</p>'); assert.deepEqual(app.data.state.tokens, [{ x:1, y:2 }]);
  assert.throws(() => applyMutation(s, { type:'artifact:state', projectId:'research-project', value:{ artifactId:'app1', state:{ big:'x'.repeat(200001) } } }), /200 KB/);
  assert.throws(() => applyMutation(s, { type:'artifact:state', projectId:'research-project', value:{ artifactId:'missing', state:{} } }), /live app/);
  s = applyMutation(s, { type:'page', projectId:'research-project', value:{ blocks:[{ id:'m1', type:'metric', text:'Revenue', body:'={{revenue}}' }] } });
  assert.equal(s.projects[0].page.blocks[0].body, '={{revenue}}');
});

test('plugin placements persist one destination per plugin and reject invalid maps',()=>{
 const placements={'chatgpt-web':'pull-down','gemini-web':'tab'};
 const state=applyMutation(makeFixture(),{type:'settings',value:{pluginPlacements:placements}});
 assert.deepEqual(state.settings.pluginPlacements,placements);
 for(const pluginPlacements of [null,[],{'fixture':'floating'},Object.fromEntries(Array.from({length:101},(_,i)=>['p'+i,'tab']))]) assert.throws(()=>applyMutation(state,{type:'settings',value:{pluginPlacements}}),/placement/);
});
test('diagram sheets keep their own shapes and connectors, and drop anything invalid', () => {
  let s = makeFixture();
  const node = (id, type = 'rect') => ({ id, type, text: id, color: 'blue', position: { x: 0, y: 0 }, size: { w: 120, h: 60 } });
  s = applyMutation(s, { type:'canvas:item', projectId:'research-project', value:{ id:'g1', type:'diagram', text:'Flow', position:{ x:0, y:0 }, size:{ w:520, h:340 }, nodes:[node('a'), node('b', 'diamond'), node('f', 'frame'), { id:'bad id', type:'rect' }, null], edges:[{ id:'e1', source:'a', target:'b', type:'smoothstep' }, { id:'e2', source:'a', target:'gone' }] } });
  const d = s.projects[0].canvas.find(c => c.id === 'g1');
  assert.deepEqual(d.nodes.map(n => n.id), ['a', 'b']);
  assert.deepEqual(d.edges.map(e => e.id), ['e1']);
  assert.equal(d.edges[0].type, 'smoothstep');
});
test('plugins can be locked to one project and the lock is validated', () => {
  const state = applyMutation(makeFixture(), { type:'settings', value:{ pluginLocks:{ fixture:'research-project' } } });
  assert.deepEqual(state.settings.pluginLocks, { fixture:'research-project' });
  for (const pluginLocks of [null, [], { fixture:5 }, { fixture:'bad id!' }]) assert.throws(() => applyMutation(state, { type:'settings', value:{ pluginLocks } }), /Lock/);
});
test('uploaded files can be renamed and deleted, taking their canvas connectors with them', () => {
  let s = makeFixture();
  s.projects[0].files = [{ id:'f1', name:'a.pdf', storedName:'f1.pdf', size:1, createdAt:'x' }];
  s.projects[0].edges = [{ id:'e1', source:'f1', target:'n1' }];
  s = applyMutation(s, { type:'file:rename', projectId:'research-project', value:{ id:'f1', name:'  b.pdf ' } });
  assert.equal(s.projects[0].files[0].name, 'b.pdf');
  assert.throws(() => applyMutation(s, { type:'file:rename', projectId:'research-project', value:{ id:'f1', name:'a/b' } }), /file name/);
  s = applyMutation(s, { type:'file:delete', projectId:'research-project', value:'f1' });
  assert.deepEqual([s.projects[0].files.length, s.projects[0].edges.length], [0, 0]);
});

test('documents and files can be moved or copied between projects and folders, and projects and agents can be deleted', () => {
  let s = makeFixture();
  s.projects.push({ ...structuredClone(s.projects[0]), id:'second', name:'Second', parentId:'research-project', notes:[], files:[], edges:[], tasks:[], messages:[] });
  s.projects[0].notes = [{ id:'n9', title:'Doc', content:'hello', kind:'note', author:'You', createdAt:'x', updatedAt:'x', position:{ x:1, y:1 } }];
  s.projects[0].files = [{ id:'f9', name:'a.pdf', storedName:'f9.pdf', size:1, createdAt:'x' }];
  s.projects[0].edges = [{ id:'e9', source:'n9', target:'f9' }];
  let m = applyMutation(s, { type:'item:copy', projectId:'second', value:{ kind:'note', id:'n9', fromProjectId:'research-project', newId:'n10' } });
  assert.deepEqual([m.projects[1].notes[0].title, m.projects[0].notes.length], ['Doc', 1]);
  m = applyMutation(m, { type:'item:copy', projectId:'second', value:{ kind:'file', id:'f9', fromProjectId:'research-project', newId:'f10' } });
  assert.equal(m.projects[1].files[0].storedName, 'f10.pdf');
  assert.throws(() => applyMutation(m, { type:'item:copy', projectId:'second', value:{ kind:'note', id:'gone', fromProjectId:'research-project', newId:'n11' } }), /no longer exists/);
  m = applyMutation(m, { type:'item:move', projectId:'research-project', value:{ kind:'note', id:'n9', toProjectId:'second' } });
  assert.deepEqual([m.projects[0].notes.length, m.projects[1].notes.length, m.projects[0].edges.length], [0, 2, 0]);
  assert.throws(() => applyMutation(m, { type:'item:move', projectId:'research-project', value:{ kind:'file', id:'f9', toProjectId:'research-project' } }), /another project/);
  const agent = m.agents[0].id;
  const gone = applyMutation(m, { type:'agent:delete', value:agent });
  assert.ok(!gone.agents.some(a => a.id === agent) && gone.projects.every(p => !p.agentIds.includes(agent)));
  assert.throws(() => applyMutation(m, { type:'project:delete', value:'research-project' }), /Keep at least one/);
  const removed = applyMutation(m, { type:'project:delete', value:'second' });
  assert.deepEqual(removed.projects.map(p => p.id), ['research-project']);
});
test('deleted documents, files, folders and agents go to Trash and can be restored or purged', () => {
  let s = makeFixture();
  s.projects.push({ ...structuredClone(s.projects[0]), id:'second', name:'Second', parentId:'research-project', notes:[], files:[], edges:[], tasks:[], messages:[] });
  s.projects[0].notes = [{ id:'n1', title:'Doc', content:'hi', kind:'note', author:'You', createdAt:'x', updatedAt:'x', position:{ x:1, y:1 } }];
  s.projects[0].files = [{ id:'f1', name:'a.pdf', storedName:'f1.pdf', size:1, createdAt:'x' }];
  s.projects[0].edges = [{ id:'e1', source:'n1', target:'f1' }];
  let m = applyMutation(s, { type:'note:delete', projectId:'research-project', value:'n1' });
  assert.deepEqual([m.projects[0].notes.length, m.projects[0].edges.length, m.trash.length, m.trash[0].kind], [0, 0, 1, 'note']);
  m = applyMutation(m, { type:'trash:restore', value:m.trash[0].id });
  assert.deepEqual([m.projects[0].notes.length, m.trash.length], [1, 0]);
  m = applyMutation(m, { type:'file:delete', projectId:'research-project', value:'f1' });
  m = applyMutation(m, { type:'trash:restore', value:m.trash[0].id });
  assert.deepEqual([m.projects[0].files.length, m.projects[0].edges.length], [1, 1]);
  const agent = m.agents[0].id, before = m.projects.map(p => p.agentIds.length);
  let a = applyMutation(m, { type:'agent:delete', value:agent });
  assert.equal(a.trash[0].kind, 'agent');
  a = applyMutation(a, { type:'trash:restore', value:a.trash[0].id });
  assert.deepEqual(a.projects.map(p => p.agentIds.length), before);
  let p = applyMutation(m, { type:'project:delete', value:'second' });
  assert.deepEqual([p.projects.length, p.trash[0].kind], [1, 'project']);
  p = applyMutation(p, { type:'trash:restore', value:p.trash[0].id });
  assert.deepEqual(p.projects.map(x => x.id), ['research-project', 'second']);
  p = applyMutation(p, { type:'note:delete', projectId:'research-project', value:'n1' });
  assert.equal(applyMutation(p, { type:'trash:purge', value:p.trash[0].id }).trash.length, 0);
  assert.equal(applyMutation(p, { type:'trash:empty' }).trash.length, 0);
  assert.throws(() => applyMutation(p, { type:'trash:restore', value:'nope' }), /no longer in Trash/);
});

test('documents keep a throttled version history that can be restored', () => {
  const pid = 'research-project', base = { id:'h1', title:'T', content:'one', kind:'note', author:'You', createdAt:'x', updatedAt:'2026-01-01T00:00:00.000Z', position:{ x:1, y:1 } };
  let s = applyMutation(makeFixture(), { type:'note', projectId:pid, value:base });
  s = applyMutation(s, { type:'note', projectId:pid, value:{ ...base, content:'two' } });
  const read = () => s.projects[0].notes.find(n => n.id === 'h1');
  assert.deepEqual(read().history.map(h => h.content), ['one']);
  s = applyMutation(s, { type:'note', projectId:pid, value:{ ...base, content:'three', history:[{ bad:1 }] } });
  assert.deepEqual(read().history.map(h => h.content), ['one']);
  s = applyMutation(s, { type:'note:restore', projectId:pid, value:{ id:'h1', at:read().history[0].at } });
  assert.deepEqual([read().content, read().history[0].content], ['one', 'three']);
  assert.throws(() => applyMutation(s, { type:'note:restore', projectId:pid, value:{ id:'h1', at:'nope' } }), /no longer available/);
});

test('Markdown and blocks convert both ways, and block documents keep their Markdown in step', () => {
  const { markdownToBlocks, blocksToMarkdown } = require('../shared/blocks.mjs');
  let n = 0; const makeId = () => 'b' + (++n);
  const md = '# Title\n\nA paragraph\nover two lines\n\n- one\n- two\n\n1. first\n2. second\n\n- [x] done\n- [ ] todo\n\n> quoted\n\n```\ncode here\n```\n\n---';
  const blocks = markdownToBlocks(md, makeId);
  assert.deepEqual(blocks.map(b => b.type), ['h1', 'p', 'bullet', 'bullet', 'numbered', 'numbered', 'todo', 'todo', 'quote', 'code', 'divider']);
  assert.equal(blocks[1].text, 'A paragraph\nover two lines');
  assert.deepEqual([blocks[6].checked, blocks[7].checked], [true, false]);
  assert.equal(blocksToMarkdown(blocks), md);
  const pid = 'research-project';
  let s = applyMutation(makeFixture(), { type:'note', projectId:pid, value:{ id:'bd', title:'Blocks', content:'', kind:'note', author:'You', createdAt:'x', updatedAt:'x', position:{ x:1, y:1 }, format:'blocks', blocks:[{ id:'a', type:'h1', text:'Hi' }, { id:'b', type:'bullet', text:'item' }] } });
  const note = () => s.projects[0].notes.find(x => x.id === 'bd');
  assert.equal(note().content, '# Hi\n\n- item');
  assert.throws(() => applyMutation(s, { type:'note', projectId:pid, value:{ ...note(), blocks:[{ id:'a', type:'embed', text:'x' }] } }), /Invalid document block/);
  assert.throws(() => applyMutation(s, { type:'note', projectId:pid, value:{ ...note(), format:'rich' } }), /format/);
  s = applyMutation(s, { type:'note', projectId:pid, value:{ ...note(), format:'markdown', content:'plain now' } });
  assert.deepEqual([note().format, note().blocks, note().content], [undefined, undefined, 'plain now']);
});

test('comments on documents and the page are validated, kept across saves, and removed with their replies', () => {
  const pid = 'research-project';
  let s = applyMutation(makeFixture(), { type:'note', projectId:pid, value:{ id:'cn', title:'Doc', content:'text', kind:'note', author:'You', createdAt:'x', updatedAt:'x', position:{ x:1, y:1 } } });
  const note = () => s.projects[0].notes.find(x => x.id === 'cn');
  s = applyMutation(s, { type:'comment:add', projectId:pid, value:{ scope:'note', noteId:'cn', id:'c1', text:'  First  ', author:'You', blockId:'blk' } });
  s = applyMutation(s, { type:'comment:add', projectId:pid, value:{ scope:'note', noteId:'cn', id:'c2', text:'Reply', replyTo:'c1' } });
  s = applyMutation(s, { type:'comment:add', projectId:pid, value:{ scope:'page', id:'p1', text:'On the page', author:'Agent' } });
  assert.deepEqual(note().comments.map(c => [c.id, c.text, c.blockId, c.replyTo]), [['c1', 'First', 'blk', undefined], ['c2', 'Reply', undefined, 'c1']]);
  assert.equal(s.projects[0].page.comments[0].author, 'Agent');
  s = applyMutation(s, { type:'note', projectId:pid, value:{ ...note(), content:'edited', comments:[] } });
  assert.equal(note().comments.length, 2, 'an editor save cannot wipe comments');
  s = applyMutation(s, { type:'page', projectId:pid, value:{ blocks:[{ id:'x', type:'p', text:'hello' }] } });
  assert.equal(s.projects[0].page.comments.length, 1, 'saving the page keeps its comments');
  s = applyMutation(s, { type:'comment:update', projectId:pid, value:{ scope:'note', noteId:'cn', id:'c1', resolved:true } });
  assert.equal(note().comments[0].resolved, true);
  assert.throws(() => applyMutation(s, { type:'comment:add', projectId:pid, value:{ scope:'note', noteId:'cn', id:'c3', text:'   ' } }), /Write a comment/);
  assert.throws(() => applyMutation(s, { type:'comment:add', projectId:pid, value:{ scope:'note', noteId:'nope', id:'c3', text:'x' } }), /Unknown document/);
  assert.throws(() => applyMutation(s, { type:'comment:add', projectId:pid, value:{ scope:'note', noteId:'cn', id:'c3', text:'x', replyTo:'gone' } }), /gone/);
  s = applyMutation(s, { type:'comment:delete', projectId:pid, value:{ scope:'note', noteId:'cn', id:'c1' } });
  assert.equal(note().comments, undefined, 'deleting a comment deletes its replies');
});

test('agents can edit pages, comment, and link documents and projects across projects', async () => {
  const { applyAgentWork } = await import('../shared/agent-pages.mjs');
  const { parseActions } = await import('../shared/domain.mjs');
  const s = makeFixture();
  s.projects.push({ ...structuredClone(s.projects[0]), id:'other', name:'Other project', notes:[{ id:'on', title:'Other doc', content:'x', kind:'note', author:'You', createdAt:'x', updatedAt:'x', position:{ x:1, y:1 } }], files:[], edges:[], messages:[], page:undefined });
  const home = s.projects[0];
  home.notes = [{ id:'hn', title:'Home doc', content:'Intro', kind:'note', author:'You', createdAt:'x', updatedAt:'x', position:{ x:1, y:1 } }];
  const actions = parseActions('```research-actions\n' + JSON.stringify({
    pages:[{ markdown:'## Plan\n- step one', mode:'append' }, { markdown:'Seen from home', project:'Other project' }],
    comments:[{ on:'note', note:'Home doc', text:'Needs sources' }, { on:'page', text:'Looks good', block:'step one' }],
    links:[{ from:{ note:'Home doc' }, to:{ project:'Other project' } }, { from:{ page:true }, to:{ project:'Other project' } }, { from:{ page:true }, to:{ note:'Other doc' } }, { from:{ note:'Missing' }, to:{ note:'Other doc' } }]
  }) + '\n```');
  const said = []; let n = 0;
  applyAgentWork(s, home, actions, { id:'a1', name:'Atlas' }, () => 'g' + (++n), t => said.push(t));
  assert.deepEqual(home.page.blocks.slice(0, 2).map(b => b.type), ['h2', 'bullet']);
  assert.equal(s.projects[1].page.blocks[0].text, 'Seen from home');
  assert.equal(home.notes[0].comments[0].author, 'Atlas');
  assert.equal(home.page.comments[0].blockId, home.page.blocks[1].id);
  assert.ok(home.notes[0].content.endsWith('Related: [[@Other project]]\n'));
  assert.ok(home.page.blocks.some(b => b.type === 'embed' && b.refType === 'folder' && b.refId === 'other'));
  assert.ok(home.page.blocks.some(b => b.type === 'p' && b.text === 'Related: [[Other doc]]'), 'a document in another project is linked by title');
  assert.ok(said.some(t => /no document "Missing"/.test(t)));
  assert.equal(home.notes[0].history.length, 1, 'link edits are kept as a version');
  assert.throws(() => parseActions('```research-actions\n{"comments":[{"on":"folder","text":"x"}]}\n```'), /on: note or page/);
});

test('projects can be reordered and nested by position, and archived with their folders', () => {
  const blank = (id, parentId = null) => ({ id, name: id.toUpperCase(), parentId, status: 'active', kpis: [], agentIds: [], notes: [], files: [], edges: [], tasks: [], messages: [], viewport: { x: 0, y: 0, zoom: 1 } });
  let s = makeFixture();
  s.projects = [blank('a'), blank('b'), blank('c'), blank('a1', 'a')];
  s.selectedProject = 'b';
  const order = () => s.projects.map(p => `${p.id}>${p.parentId || '-'}`).join(' ');
  s = applyMutation(s, { type:'project:move', value:{ id:'c', parentId:null, beforeId:'a' } });
  assert.equal(order(), 'c>- a>- b>- a1>a');
  s = applyMutation(s, { type:'project:move', value:{ id:'c', parentId:'b', beforeId:null } });
  assert.equal(order(), 'a>- b>- a1>a c>b');
  s = applyMutation(s, { type:'project:move', value:{ id:'a1', parentId:null, beforeId:'b' } });
  assert.equal(order(), 'a>- a1>- b>- c>b');
  assert.throws(() => applyMutation(s, { type:'project:move', value:{ id:'b', parentId:'c', beforeId:null } }), /inside itself/);
  assert.throws(() => applyMutation(s, { type:'project:move', value:{ id:'b', parentId:null, beforeId:'b' } }), /beside another/);
  assert.throws(() => applyMutation(s, { type:'project:move', value:{ id:'nope', parentId:null } }), /Unknown project/);
  s = applyMutation(s, { type:'project:update', projectId:'b', value:{ archived:true } });
  const { isArchived } = require('../shared/domain.mjs');
  assert.deepEqual(['b', 'c', 'a'].map(id => isArchived(s.projects, id)), [true, true, false], 'a folder is archived with its parent');
  assert.equal(s.selectedProject, 'a', 'archiving the open project opens another');
  assert.ok(s.projects.find(p => p.id === 'b').archivedAt);
  s = applyMutation(s, { type:'project:update', projectId:'b', value:{ archived:false } });
  assert.deepEqual([isArchived(s.projects, 'b'), 'archivedAt' in s.projects.find(p => p.id === 'b')], [false, false]);
  const lone = applyMutation(s, { type:'project:update', projectId:'a', value:{ archived:true } });
  assert.throws(() => applyMutation(applyMutation(lone, { type:'project:update', projectId:'b', value:{ archived:true } }), { type:'project:update', projectId:'a1', value:{ archived:true } }), /at least one active/);
});

test('image annotations are saved beside the file as vector data and never touch the file itself', () => {
  const pid = 'research-project';
  let s = makeFixture();
  s.projects[0].files = [{ id:'img1', name:'Photo.png', storedName:'img1.png', size:10, createdAt:'x' }];
  const marks = { strokes:[{ id:'s1', t:'pen', c:'#EF4444', w:6, d:'1,2 3,4 5,6' }, { id:'s2', t:'highlight', c:'#facc15', w:18, d:'10,10' }], texts:[{ id:'t1', x:5, y:7, s:30, c:'#ffffff', v:'Look here' }] };
  s = applyMutation(s, { type:'file:annotate', projectId:pid, value:{ id:'img1', annotations:marks } });
  const file = () => s.projects[0].files[0];
  assert.deepEqual([file().annotations.strokes.length, file().annotations.texts[0].v, file().annotations.strokes[0].c, file().storedName, s.projects[0].files.length], [2, 'Look here', '#ef4444', 'img1.png', 1]);
  assert.ok(file().annotatedAt);
  for (const bad of [{ strokes:[{ id:'x', t:'pen', c:'red', w:1, d:'1,2' }] }, { strokes:[{ id:'x', t:'pen', c:'#ffffff', w:1, d:'<script>' }] }, { strokes:[{ id:'x y', t:'pen', c:'#ffffff', w:1, d:'1,2' }] }, { strokes:Array.from({ length:401 }, (_, i) => ({ id:'a' + i, t:'pen', c:'#ffffff', w:1, d:'1,2' })) }, { texts:[{ id:'t', c:'#fff', v:'x' }] }, [], null])
    assert.throws(() => applyMutation(s, { type:'file:annotate', projectId:pid, value:{ id:'img1', annotations:bad } }), /Invalid|Keep up to/);
  assert.throws(() => applyMutation(s, { type:'file:annotate', projectId:pid, value:{ id:'nope', annotations:marks } }), /Unknown file/);
  const cropped = applyMutation(s, { type:'file:annotate', projectId:pid, value:{ id:'img1', annotations:{ ...marks, crop:{ x:10.4, y:20, w:300, h:200 } } } });
  assert.deepEqual(cropped.projects[0].files[0].annotations.crop, { x:10, y:20, w:300, h:200 }, 'a crop is stored as whole pixels beside the marks');
  const cropOnly = applyMutation(s, { type:'file:annotate', projectId:pid, value:{ id:'img1', annotations:{ strokes:[], texts:[], crop:{ x:0, y:0, w:50, h:50 } } } });
  assert.equal(cropOnly.projects[0].files[0].annotations.crop.w, 50, 'a crop alone is kept even with no marks');
  for (const bad of [{ crop:{ x:'a', y:0, w:5, h:5 } }, { crop:5 }])
    assert.throws(() => applyMutation(s, { type:'file:annotate', projectId:pid, value:{ id:'img1', annotations:{ strokes:[], texts:[], ...bad } } }), /Invalid/);
  const copied = applyMutation(s, { type:'item:copy', projectId:pid, value:{ kind:'file', id:'img1', fromProjectId:pid, newId:'img2' } });
  assert.equal(copied.projects[0].files.find(f => f.id === 'img2').annotations.texts.length, 1, 'a copied file keeps its marks');
  s = applyMutation(s, { type:'file:annotate', projectId:pid, value:{ id:'img1', annotations:{ strokes:[], texts:[] } } });
  assert.deepEqual(['annotations' in file(), 'annotatedAt' in file()], [false, false], 'erasing every mark removes the data');
});

test('calendar events, repeats, calendars and preferences are validated and kept in step', () => {
  let s = makeFixture();
  const pid = 'research-project';
  const event = { id: 'ev1', title: 'Standup', start: '2026-10-20T09:00', end: '2026-10-20T09:15', allDay: false, recurrence: { freq: 'daily', interval: 1 }, reminders: [5] };
  s = applyMutation(s, { type: 'event', value: event });
  assert.deepEqual([s.calendars.map(c => c.id), s.events[0].calendarId, s.events[0].createdBy], [['personal'], 'personal', 'You']);
  s = applyMutation(s, { type: 'event:occurrence', value: { id: 'ev1', date: '2026-10-22', event: { ...event, id: 'ev2', title: 'Standup (moved)', start: '2026-10-22T11:00', end: '2026-10-22T11:15' } } });
  assert.deepEqual([s.events.find(e => e.id === 'ev1').exceptions, s.events.find(e => e.id === 'ev2').recurrence], [['2026-10-22'], undefined]);
  s = applyMutation(s, { type: 'event:following', value: { id: 'ev1', date: '2026-10-25' } });
  assert.equal(s.events.find(e => e.id === 'ev1').recurrence.until, '2026-10-24');
  s = applyMutation(s, { type: 'event:following', value: { id: 'ev1', date: '2026-10-20' } });
  assert.equal(s.events.some(e => e.id === 'ev1'), false, 'ending a series on its first day removes it');
  assert.throws(() => applyMutation(s, { type: 'event', value: { ...event, id: 'ev3', calendarId: 'ghost' } }), /calendars/);
  s = applyMutation(s, { type: 'calendar', value: { id: 'work', name: 'Work', color: '#E5484D' } });
  s = applyMutation(s, { type: 'event', value: { ...event, id: 'ev4', calendarId: 'work', recurrence: null, projectId: 'ghost-project' } });
  assert.deepEqual([s.calendars[1].color, s.events.find(e => e.id === 'ev4').projectId], ['#e5484d', undefined]);
  assert.throws(() => applyMutation(s, { type: 'calendar', value: { id: 'x y', name: 'Bad', color: '#ffffff' } }), /name and a colour/);
  const imported = applyMutation(s, { type: 'events:import', value: { calendarId: 'work', events: [{ title: 'From file', start: '2026-12-01', end: '2026-12-01', allDay: true }, { title: '', start: 'nonsense' }] } });
  assert.deepEqual(imported.events.filter(e => e.createdBy === 'Imported').map(e => [e.title, e.calendarId]), [['From file', 'work']]);
  const moved = applyMutation(s, { type: 'calendar:delete', value: { id: 'work', moveTo: 'personal' } });
  assert.deepEqual([moved.calendars.length, moved.events.find(e => e.id === 'ev4').calendarId], [1, 'personal']);
  assert.equal(applyMutation(s, { type: 'calendar:delete', value: { id: 'work' } }).events.some(e => e.id === 'ev4'), false, 'deleting a calendar can delete its events');
  assert.throws(() => applyMutation(moved, { type: 'calendar:delete', value: { id: 'personal' } }), /at least one calendar/);
  s = applyMutation(s, { type: 'settings', value: { calendar: { weekStart: 1, defaultDuration: 45 } } });
  s = applyMutation(s, { type: 'settings', value: { calendar: { showTasks: false } } });
  assert.deepEqual(s.settings.calendar, { weekStart: 1, defaultDuration: 45, showTasks: false }, 'preferences merge instead of replacing each other');
  for (const bad of [{ weekStart: 3 }, { defaultDuration: 2 }, { surprise: true }, []]) assert.throws(() => applyMutation(s, { type: 'settings', value: { calendar: bad } }), /calendar preferences/);
  s = applyMutation(s, { type: 'event:delete', value: 'ev4' });
  assert.equal(s.events.some(e => e.id === 'ev4'), false);
  assert.equal(parseActions('```research-actions\n{"events":[{"title":"Review","start":"2026-11-04T14:00","end":"2026-11-04T15:00"},{"title":"Launch","allDay":true,"start":"2026-11-05"}]}\n```').events.length, 2);
  assert.throws(() => parseActions('```research-actions\n{"events":[{"title":"x","start":"tomorrow"}]}\n```'), /agent event needs/);
});
test('a project can hold any number of folders, but a folder cannot hold another folder', () => {
  const add = (state, id, parentId) => applyMutation(state, { type: 'project', value: { id, name: id, parentId: parentId || null, agentIds: [], tasks: [], notes: [], files: [], messages: [], edges: [] } });
  let s = makeFixture();
  for (const id of ['a', 'b']) s = add(s, id);
  for (const id of ['f1', 'f2', 'f3']) s = add(s, id, 'a');
  assert.equal(s.projects.filter(p => p.parentId === 'a').length, 3, 'any number of folders in a project');
  assert.throws(() => add(s, 'deep', 'f1'), /not inside another folder/);
  assert.throws(() => applyMutation(s, { type: 'project:move', value: { id: 'f2', parentId: 'f1' } }), /not inside another folder/);
  assert.throws(() => applyMutation(s, { type: 'project:move', value: { id: 'a', parentId: 'b' } }), /has folders cannot become a folder/);
  assert.throws(() => applyMutation(s, { type: 'project:update', projectId: 'a', value: { parentId: 'b' } }), /has folders cannot become a folder/);
  const moved = applyMutation(s, { type: 'project:move', value: { id: 'f2', parentId: 'b' } });
  assert.equal(moved.projects.find(p => p.id === 'f2').parentId, 'b', 'a folder can move to another project');
  const renamed = applyMutation(s, { type: 'project:update', projectId: 'f1', value: { name: 'Renamed' } });
  assert.equal(renamed.projects.find(p => p.id === 'f1').name, 'Renamed', 'editing a folder still works');
});
