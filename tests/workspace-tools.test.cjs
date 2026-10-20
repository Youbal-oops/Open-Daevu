const { makeFixture } = require('./fixture.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyMutation } = require('../shared/domain.mjs');
const { workspaceTools, workspaceMap } = require('../electron/workspace-tools.cjs');

function setup() {
  let state = makeFixture();
  const add = (id, name, parentId) => { state = applyMutation(state, { type: 'project', value: { id, name, parentId: parentId || null, agentIds: ['seo'], tasks: [], notes: [], files: [], messages: [], edges: [] } }); };
  add('market', 'Market study');
  add('pricing', 'Pricing', 'market');
  const note = (projectId, id, title, content) => { state = applyMutation(state, { type: 'note', projectId, value: { id, title, kind: 'note', content, createdAt: 'x', updatedAt: 'x' } }); };
  note('market', 'n1', 'Competitor pricing', 'Rivals charge 20 dollars a month. Enterprise plans are custom.');
  note('market', 'n2', 'Interview notes', 'Maya said onboarding was confusing.');
  note('research-project', 'n3', 'Open questions', 'Which pricing page converts best?');
  const store = {
    get state() { return state; },
    async mutate(action) { state = applyMutation(state, action); return state; },
    async update(fn) { state = fn(structuredClone(state)); return state; }
  };
  const tools = Object.fromEntries(workspaceTools(store, 'research-project', { id: 'seo', name: 'Scout' }).map(t => [t.name, t.call]));
  return { store, tools, get state() { return state; } };
}

test('agents can find documents anywhere in the workspace and see what each project holds', async () => {
  const { tools } = setup();
  const found = await tools.workspace_search({ query: 'pricing' });
  assert.deepEqual(found.results.map(r => r.title).slice(0, 3), ['Competitor pricing', 'Pricing', 'Open questions'], 'title matches rank first, across projects');
  assert.equal(found.results[0].projectId, 'market');
  assert.match(found.results.find(r => r.id === 'n3').snippet, /pricing page/);
  assert.equal((await tools.workspace_search({ query: 'pricing', scope: 'project' })).results.length, 1, 'scope keeps it to the current project');
  assert.equal((await tools.workspace_search({ query: 'onboarding confusing' })).results[0].id, 'n2', 'every word has to match, anywhere in the text');
  await assert.rejects(async () => tools.workspace_search({ query: '  ' }), /few words/);
  const all = await tools.workspace_list({ projectId: 'all' });
  assert.ok(all.projects.some(p => p.id === 'pricing' && p.folderOf === 'market'));
  const market = await tools.workspace_list({ projectId: 'Market study' });
  assert.deepEqual([market.documents.length, market.folders.map(f => f.name)], [2, ['Pricing']]);
});

test('agents can read documents and pages, and everything they read is cut to a safe size', async () => {
  const { tools, store } = setup();
  const read = await tools.workspace_read({ projectId: 'market', document: 'competitor pricing' });
  assert.match(read.content, /20 dollars/);
  await store.mutate({ type: 'note', projectId: 'market', value: { id: 'big', title: 'Huge', kind: 'note', content: 'x'.repeat(90000), createdAt: 'x', updatedAt: 'x' } });
  assert.equal((await tools.workspace_read({ projectId: 'market', document: 'big' })).content.length, 30000);
  await assert.rejects(async () => tools.workspace_read({ projectId: 'market', document: 'nope' }), /no document/);
  await assert.rejects(async () => tools.workspace_read({ projectId: 'ghost', document: 'n1' }), /no project/);
});

test('agents can tidy up and link, and the one-level folder rule still holds', async () => {
  const ctx = setup();
  const { tools } = ctx;
  await tools.workspace_organize({ action: 'rename_document', fromProject: 'market', document: 'n2', newTitle: 'User interviews' });
  assert.equal(ctx.state.projects.find(p => p.id === 'market').notes.find(n => n.id === 'n2').title, 'User interviews');
  await tools.workspace_organize({ action: 'move_document', fromProject: 'market', document: 'User interviews', toProject: 'pricing' });
  assert.deepEqual([ctx.state.projects.find(p => p.id === 'market').notes.length, ctx.state.projects.find(p => p.id === 'pricing').notes.length], [1, 1]);
  const made = await tools.workspace_organize({ action: 'create_folder', parent: 'market', name: 'Surveys' });
  assert.equal(ctx.state.projects.find(p => p.id === made.created.id).parentId, 'market');
  await assert.rejects(async () => tools.workspace_organize({ action: 'create_folder', parent: 'pricing', name: 'Too deep' }), /not inside another folder/);
  const linked = await tools.workspace_link({ fromDocument: 'Open questions', toProject: 'market', toDocument: 'Competitor pricing', label: 'Evidence' });
  assert.deepEqual(linked, { linked: true });
  assert.match(ctx.state.projects.find(p => p.id === 'research-project').notes.find(n => n.id === 'n3').content, /Evidence: \[\[Competitor pricing\]\]/);
  const missed = await tools.workspace_link({ fromDocument: 'Open questions', toDocument: 'Does not exist' });
  assert.ok(missed.skipped?.length, 'a link to something missing is reported, not invented');
});

test('the workspace map lists projects and folders for the start of a prompt', () => {
  const { state } = setup();
  const text = workspaceMap(state);
  assert.match(text, /Market study \(market\): 2 documents, 0 files/);
  assert.match(text, /Pricing \(pricing\) · folder of Market study/);
});
