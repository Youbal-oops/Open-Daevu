const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path');
const { Store } = require('../electron/store.cjs'), { makeFixture } = require('./fixture.cjs'), { workspaceTools } = require('../electron/workspace-tools.cjs');
const fence = '```';

async function setup(t) {
  const root = path.resolve(__dirname, '../.test-data'); await fs.mkdir(root, { recursive: true });
  const folder = await fs.mkdtemp(path.join(root, 'agent-files-')); t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const store = new Store(path.join(folder, 'workspace')); await store.init(); await store.update(() => makeFixture());
  const agent = { id: 'a1', name: 'Panacea' };
  return { store, tools: Object.fromEntries(workspaceTools(store, 'research-project', agent).map(f => [f.name, f])) };
}

test('an agent can create a document and a spreadsheet, and update one by title', async t => {
  const { store, tools } = await setup(t), notes = () => store.state.projects.find(p => p.id === 'research-project').notes;
  const before = notes().length;
  const made = await tools.save_document.call({ title: 'Plant structure', content: '# Purpose\n\nText' });
  assert.equal(made.saved.kind, 'document'); assert.equal(made.saved.updated, false);
  assert.equal(notes().length, before + 1);
  const note = notes().find(n => n.id === made.saved.id);
  assert.equal(note.title, 'Plant structure'); assert.match(note.content, /Purpose/); assert.equal(note.author, 'Panacea'); assert.equal(note.agentId, 'a1');
  const sheet = await tools.save_document.call({ title: 'Costs', kind: 'sheet', content: 'Item,Cost\nPen,2' });
  assert.equal(sheet.saved.kind, 'spreadsheet'); assert.equal(notes().find(n => n.id === sheet.saved.id).kind, 'sheet');
  const again = await tools.save_document.call({ title: 'plant STRUCTURE', content: 'Rewritten' });
  assert.equal(again.saved.updated, true); assert.equal(again.saved.id, made.saved.id);
  assert.equal(notes().length, before + 2, 'no duplicate was made');
  assert.equal(notes().find(n => n.id === made.saved.id).content, 'Rewritten');
});

test('save_document refuses empty titles and ids from elsewhere', async t => {
  const { tools } = await setup(t);
  await assert.rejects(tools.save_document.call({ title: '  ', content: 'x' }), /title/);
  await assert.rejects(tools.save_document.call({ title: 'X', content: 'x', id: 'not-here' }), /not a document in this project/);
});

test('notes in a plain json block are saved too, but ordinary json is left alone', async () => {
  const { parseActions } = await import('../shared/domain.mjs');
  const notes = { notes: [{ title: 'Plan', kind: 'note', content: '# Hi' }] };
  assert.equal(parseActions(`Here you go\n${fence}json\n${JSON.stringify(notes)}\n${fence}\n`).notes.length, 1);
  assert.equal(parseActions(`${fence}\n${JSON.stringify(notes)}\n${fence}`).notes.length, 1);
  assert.equal(parseActions(`${fence}research-actions\n${JSON.stringify(notes)}\n${fence}`).notes.length, 1);
  assert.equal(parseActions(`${fence}json\n{"name":"x","notes":[1]}\n${fence}`).notes.length, 0, 'not an actions block');
  assert.equal(parseActions(`${fence}json\n{"a":1}\n${fence}`).notes.length, 0);
  for (const key of ['databaseWrites', 'handoffs', 'schedules']) {
    const quoted = parseActions(`Example:\n${fence}json\n${JSON.stringify({ [key]: [{ op: 'drop', table: 't', agentId: 'x', task: 'y', name: 'n' }] })}\n${fence}`);
    assert.equal((quoted.databaseWrites || []).length + quoted.handoffs.length + quoted.schedules.length, 0, key + ' in a plain block is only an example');
  }
  assert.equal(parseActions(`${fence}json\n{"notes":[{"title":"t"}]}\n${fence}`).notes.length, 0, 'a note needs content');
});

test('an agent can make a kanban board and a chart, and updating one keeps a single copy', async t => {
  const { store, tools } = await setup(t), project = () => store.state.projects.find(p => p.id === 'research-project');
  const before = (project().artifacts || []).length;
  const board = await tools.save_board.call({ title: 'Launch', kind: 'kanban', columns: [{ title: 'To do', cards: ['Spec', 'Build'] }, { title: 'Done', cards: [] }] });
  const saved = project().artifacts.find(a => a.id === board.saved.id);
  assert.equal(saved.kind, 'kanban'); assert.deepEqual(saved.data.columns.map(c => c.title), ['To do', 'Done']); assert.equal(saved.data.columns[0].cards.length, 2);
  const chart = await tools.save_board.call({ title: 'Traffic', kind: 'area', csv: 'Month,Visits\nJan,120\nFeb,150' });
  assert.equal(project().artifacts.find(a => a.id === chart.saved.id).kind, 'area');
  const again = await tools.save_board.call({ title: 'traffic', kind: 'area', csv: 'Month,Visits\nJan,1' });
  assert.equal(again.saved.updated, true); assert.equal(again.saved.id, chart.saved.id);
  assert.equal(project().artifacts.length, before + 2);
  await assert.rejects(tools.save_board.call({ title: 'X', kind: 'scatter', csv: 'a' }), /kanban, bar, line, area or pie/);
  await assert.rejects(tools.save_board.call({ title: 'X', kind: 'kanban' }), /columns/);
});

test('an agent can add calendar tasks without duplicating them, and draw a diagram', async t => {
  const { store, tools } = await setup(t);
  const added = await tools.add_calendar_tasks.call({ tasks: [{ title: 'Send brief', date: '2026-11-02', time: '09:30' }, { title: 'Review', date: '2026-11-03' }] });
  assert.equal(added.added.length, 2);
  assert.equal(store.state.todos.filter(t => t.projectId === 'research-project' && t.title === 'Send brief').length, 1);
  const repeat = await tools.add_calendar_tasks.call({ tasks: [{ title: 'send brief', date: '2026-11-02' }] });
  assert.equal(repeat.added.length, 0); assert.equal(repeat.skipped, 1);
  await assert.rejects(tools.add_calendar_tasks.call({ tasks: [{ title: 'Bad', date: 'tomorrow' }] }));
  const project = store.state.projects.find(p => p.id === 'research-project'), items = (project.canvas || []).length;
  const drawn = await tools.draw_diagram.call({ title: 'Funnel', nodes: [{ id: 'a', label: 'Click' }, { id: 'b', label: 'Buy', shape: 'diamond' }], edges: [{ from: 'a', to: 'b', label: 'visits' }] });
  assert.equal(drawn.drawn.shapes, 2);
  assert.ok(store.state.projects.find(p => p.id === 'research-project').canvas.length > items);
  await assert.rejects(tools.draw_diagram.call({ title: 'Empty', nodes: [] }), /nodes/);
});

test('an agent can add to the project page', async t => {
  const { store, tools } = await setup(t);
  const result = await tools.edit_project_page.call({ markdown: '## Findings\nText linking [[Another document]]' });
  assert.equal(result.mode, 'append');
  const page = store.state.projects.find(p => p.id === 'research-project').page;
  assert.ok(page.blocks.some(b => /Findings/.test(b.text)), 'the heading is on the page');
  await assert.rejects(tools.edit_project_page.call({ markdown: 'x', project: 'no such project' }), /not found/);
});

test('an agent never overwrites a document the user wrote, or a spreadsheet with a note', async t => {
  const { store, tools } = await setup(t), project = () => store.state.projects.find(p => p.id === 'research-project');
  const first = project().notes[0];
  await assert.rejects(tools.save_document.call({ title: first.title, content: 'Replaced' }), /did not write/);
  assert.notEqual(project().notes.find(n => n.id === first.id).content, 'Replaced');
  const viaId = await tools.save_document.call({ title: first.title, content: 'Replaced on purpose', id: first.id });
  assert.equal(viaId.saved.updated, true); assert.equal(project().notes.find(n => n.id === first.id).content, 'Replaced on purpose');
  const sheet = await tools.save_document.call({ title: 'Budget plan', kind: 'sheet', content: 'a,b\n1,2' });
  const note = await tools.save_document.call({ title: 'Budget plan', kind: 'note', content: 'Prose' });
  assert.notEqual(note.saved.id, sheet.saved.id, 'a note does not replace a spreadsheet of the same name');
  assert.equal(project().notes.find(n => n.id === sheet.saved.id).content, 'a,b\n1,2');
  const mine = await tools.save_document.call({ title: 'Budget plan', kind: 'note', content: 'Prose v2' });
  assert.equal(mine.saved.id, note.saved.id, 'an agent can update its own document by title');
});

test('updating a board keeps its link, settings and position; a linked board is changed at its source', async t => {
  const { store, tools } = await setup(t), project = () => store.state.projects.find(p => p.id === 'research-project');
  const made = await tools.save_board.call({ title: 'Traffic', kind: 'bar', csv: 'Month,Visits\nJan,1' });
  const record = project().artifacts.find(a => a.id === made.saved.id);
  await store.mutate({ type: 'artifact', projectId: 'research-project', value: { ...record, data: { ...record.data, options: { stacked: true }, place: { x: 5, y: 6, w: 300, h: 200 }, transpose: true } } });
  await tools.save_board.call({ title: 'Traffic', kind: 'bar', csv: 'Month,Visits\nJan,9' });
  const after = project().artifacts.find(a => a.id === made.saved.id);
  assert.equal(after.data.csv, 'Month,Visits\nJan,9'); assert.deepEqual(after.data.options, { stacked: true }); assert.deepEqual(after.data.place, { x: 5, y: 6, w: 300, h: 200 }); assert.equal(after.data.transpose, true);
  await store.mutate({ type: 'artifact', projectId: 'research-project', value: { ...after, data: { ...after.data, source: { type: 'sheet', sheetId: 'x' } } } });
  await assert.rejects(tools.save_board.call({ title: 'Traffic', kind: 'bar', csv: 'a,b\n1,2' }), /draws its numbers from a spreadsheet/);
  assert.equal(project().artifacts.find(a => a.id === made.saved.id).data.source.sheetId, 'x', 'the link is untouched');
});


test('agent tool arguments preserve fenced code in pages, tasks and diagram labels (#31)', async t => {
 const {store,tools}=await setup(t), code='```js\nconsole.log("hello");\n```';
 await tools.edit_project_page.call({markdown:code});
 assert.ok(store.state.projects[0].page.blocks.some(b=>b.type==='code' && b.text.includes('console.log')));
 await tools.add_calendar_tasks.call({tasks:[{title:'Read code',date:'2026-10-23',notes:code}]});
 assert.equal(store.state.todos[0].notes,code);
 await tools.draw_diagram.call({title:'Code',nodes:[{id:'code',label:code}]});
 assert.ok(store.state.projects[0].canvas.some(item=>item.text===code));
});

test('calendar task batches deduplicate themselves and roll back when the task cap is exceeded (#34)', async t => {
 const {store,tools}=await setup(t),task={title:'One task',date:'2026-10-23'};
 const result=await tools.add_calendar_tasks.call({tasks:[task,{...task,title:'ONE TASK'}]});
 assert.equal(result.added.length,1);assert.equal(result.skipped,1);
 await store.update(s=>{s.todos=Array.from({length:499},(_,i)=>({id:'task-'+i,title:'Existing '+i,date:'2026-10-23'}));return s;});
 await assert.rejects(tools.add_calendar_tasks.call({tasks:[{title:'New one',date:'2026-10-23'},{title:'New two',date:'2026-10-23'}]}),/500/);
 assert.equal(store.state.todos.length,499);assert.ok(store.state.todos.every(t=>!t.title.startsWith('New')));
});

test('updating a Kanban keeps moved cards and appends only new ones (#32)', async t => {
 const {store,tools}=await setup(t),args={title:'Pipeline',kind:'kanban',columns:[{title:'Todo',cards:['Write']},{title:'Done',cards:[]}]};
 const saved=await tools.save_board.call(args),id=saved.saved.id;
 await store.update(s=>{const b=s.projects[0].artifacts.find(a=>a.id===id),card=b.data.columns[0].cards.pop();b.data.columns[1].cards.push(card);return s;});
 const before=structuredClone(store.state.projects[0].artifacts.find(a=>a.id===id));
 await tools.save_board.call({...args,columns:[{title:'Todo',cards:['Write','Review']},{title:'Done',cards:[]}]});
 const after=store.state.projects[0].artifacts.find(a=>a.id===id);
 assert.deepEqual(after.data.columns[1],before.data.columns[1]);assert.equal(after.data.columns[0].id,before.data.columns[0].id);
 assert.deepEqual(after.data.columns[0].cards.map(c=>c.text),['Review']);
});
