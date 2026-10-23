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
