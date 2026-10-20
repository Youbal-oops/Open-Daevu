const { makeFixture } = require('./fixture.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyMutation } = require('../shared/domain.mjs');
const { recognizeShape } = require('../shared/shape-recognize.mjs');
const { TEMPLATES, buildTemplate } = require('../shared/canvas-templates.mjs');

const along = (points, steps = 20) => points.flatMap((p, i) => { const q = points[(i + 1) % points.length]; return Array.from({ length: steps }, (_, k) => [p[0] + (q[0] - p[0]) * k / steps, p[1] + (q[1] - p[1]) * k / steps]); });

test('hand-drawn strokes become clean shapes, and wobbly scribbles stay as they are', () => {
  const circle = Array.from({ length: 60 }, (_, i) => [100 + 80 * Math.cos(i / 60 * 6.4), 100 + 80 * Math.sin(i / 60 * 6.4)]);
  assert.equal(recognizeShape(circle).type, 'ellipse');
  assert.equal(recognizeShape([...along([[0, 0], [200, 0], [200, 200], [0, 200]]), [0, 4]]).type, 'rect');
  assert.equal(recognizeShape([...along([[100, 0], [200, 170], [0, 170]]), [100, 3]]).type, 'triangle');
  assert.equal(recognizeShape([...along([[100, 0], [200, 100], [100, 200], [0, 100]]), [100, 2]]).type, 'diamond');
  const line = recognizeShape(Array.from({ length: 30 }, (_, i) => [i * 8, i * 4 + (i % 2)]));
  assert.equal(line.type, 'line');
  assert.equal(recognizeShape(Array.from({ length: 40 }, (_, i) => [i * 8, Math.sin(i / 3) * 40])), null, 'a wave is not a shape');
  assert.equal(recognizeShape([[0, 0], [1, 1]]), null, 'too short');
});

test('every template is valid and lands on the canvas in one step, with its connectors', () => {
  let n = 0;
  const uid = () => 't' + (n++);
  for (const template of TEMPLATES) {
    const built = buildTemplate(template.id, { x: 0, y: 0 }, uid);
    assert.ok(built.items.length >= 3, template.id + ' has blocks');
    const state = applyMutation(makeFixture(), { type: 'canvas:items', projectId: 'research-project', value: built });
    const project = state.projects[0];
    assert.equal(project.canvas.length, built.items.length, template.id + ' adds every block');
    assert.equal(project.edges.length, built.edges.length, template.id + ' adds every connector');
  }
  assert.deepEqual(buildTemplate('nope', { x: 0, y: 0 }, uid), { items: [], edges: [] });
});

test('blocks keep their formatting, links must be web addresses, and bad values are cleaned', () => {
  let state = makeFixture();
  const base = { id: 'b1', type: 'sticky', text: 'Hello', color: 'yellow', position: { x: 1, y: 2 }, size: { w: 200, h: 120 } };
  state = applyMutation(state, { type: 'canvas:item', projectId: 'research-project', value: { ...base, fs: 31.6, b: true, i: 1, al: 'right', tc: '#AA0000', bd: 'dashed', rot: 400, lock: true, z: 3 } });
  const saved = state.projects[0].canvas.find(c => c.id === 'b1');
  assert.deepEqual([saved.fs, saved.b, saved.i, saved.al, saved.tc, saved.bd, saved.rot, saved.lock, saved.z], [32, true, true, 'right', '#aa0000', 'dashed', 180, true, 3]);
  const plain = applyMutation(state, { type: 'canvas:item', projectId: 'research-project', value: { ...base, fs: 0, al: 'justify', tc: 'red', bd: 'wavy' } }).projects[0].canvas.find(c => c.id === 'b1');
  assert.deepEqual(Object.keys(plain).filter(k => ['fs', 'b', 'i', 'al', 'tc', 'bd', 'rot', 'lock', 'z'].includes(k)), [], 'unknown looks are dropped');
  const link = applyMutation(state, { type: 'canvas:item', projectId: 'research-project', value: { ...base, id: 'l1', type: 'link', text: 'Docs', url: 'https://example.org/a?b=1' } }).projects[0].canvas.find(c => c.id === 'l1');
  assert.equal(link.url, 'https://example.org/a?b=1');
  for (const url of ['javascript:alert(1)', 'file:///c:/x', 'not a url', 'https://user:pw@example.org', '']) assert.throws(() => applyMutation(state, { type: 'canvas:item', projectId: 'research-project', value: { ...base, id: 'l2', type: 'link', url } }), /web address/);
});

test('connectors keep their label, line style, arrowheads, colour and thickness', () => {
  let state = applyMutation(makeFixture(), { type: 'canvas:items', projectId: 'research-project', value: { items: [
    { id: 'a', type: 'rect', text: 'A', color: 'white', position: { x: 0, y: 0 }, size: { w: 100, h: 60 } },
    { id: 'b', type: 'rect', text: 'B', color: 'white', position: { x: 300, y: 0 }, size: { w: 100, h: 60 } }] } });
  state = applyMutation(state, { type: 'board', projectId: 'research-project', value: { edges: [{ id: 'e1', source: 'a', target: 'b', type: 'smoothstep', label: 'depends on', dash: 'dashed', ends: 'both', ecolor: '#FF0000', ew: 5 }, { id: 'e2', source: 'a', target: 'b', dash: 'zigzag', ends: 'sideways', ecolor: 'red', ew: 99 }] } });
  const [e1, e2] = state.projects[0].edges;
  assert.deepEqual([e1.type, e1.label, e1.dash, e1.ends, e1.ecolor, e1.ew], ['smoothstep', 'depends on', 'dashed', 'both', '#ff0000', 5]);
  assert.deepEqual(['dash', 'ends', 'ecolor', 'ew'].filter(k => k in e2), [], 'unknown connector looks are dropped');
  assert.throws(() => applyMutation(state, { type: 'board', projectId: 'research-project', value: { edges: [{ id: 'bad id', source: 'a', target: 'b' }] } }), /Invalid connector/);
  const added = applyMutation(state, { type: 'canvas:items', projectId: 'research-project', value: { items: [], edges: [{ id: 'e3', source: 'a', target: 'missing' }, { id: 'e4', source: 'b', target: 'a' }] } });
  assert.deepEqual(added.projects[0].edges.map(e => e.id), ['e1', 'e2', 'e4'], 'a connector to something that is not there is skipped');
});
