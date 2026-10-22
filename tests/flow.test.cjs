const test = require('node:test'), assert = require('node:assert/strict');
const flow = import('../src/flow.js');

// A stand-in for pretext: every character is 8px wide, so a width of 160px holds 20 characters.
const fakeFit = text => ({
  next: (cursor, width) => { const at = cursor?.at || 0; if (at >= text.length) return null; return { end: { at: Math.min(text.length, at + Math.max(1, Math.floor(width / 8))) } }; },
  rows: width => Math.max(1, Math.ceil(text.length / Math.floor(width / 8)))
});
const block = (id, top, text, extra = {}) => ({ id, solid: false, top, height: 0, wrapTop: top, rowsTop: top, left: 0, width: 600, lineHeight: 20, naturalRows: Math.ceil(text.length / 75), fit: fakeFit(text), ...extra });

test('text beside a left picture is narrower, and the picture is on its left', async () => {
  const { planFlow } = await flow;
  const text = 'x'.repeat(750);
  const { plan, extra } = planFlow([block('a', 0, text)], [{ id: 'i', x: 0, y: 0, w: 200, h: 100, wrap: 'around' }], 600);
  const float = plan.a.floats[0];
  assert.equal(float.side, 'left');
  assert.equal(float.w, 214);
  assert.equal(float.mt, 0);
  assert.ok(float.h >= 100 && float.h <= 140);
  assert.ok(extra > 0, 'the lines that were added push everything below down');
});

test('a picture on the right shortens the right side', async () => {
  const { planFlow } = await flow;
  const { plan } = planFlow([block('a', 0, 'x'.repeat(300))], [{ id: 'i', x: 400, y: 20, w: 200, h: 60, wrap: 'around' }], 600);
  assert.equal(plan.a.floats[0].side, 'right');
  assert.equal(plan.a.floats[0].w, 214);
  assert.equal(plan.a.floats[0].mt, 0, 'the first row already touches the picture margin');
});

test('blocks that do not reach the picture are left alone, later ones are shifted into it', async () => {
  const { planFlow } = await flow;
  const { plan } = planFlow([block('a', 0, 'short'), block('b', 300, 'x'.repeat(300))], [{ id: 'i', x: 0, y: 320, w: 200, h: 100, wrap: 'around' }], 600);
  assert.equal(plan.a, undefined);
  assert.equal(plan.b.floats[0].side, 'left');
});

test('a gap too narrow for text clears the block below the picture', async () => {
  const { planFlow } = await flow;
  const { plan } = planFlow([block('a', 0, 'x'.repeat(200))], [{ id: 'i', x: 20, y: 0, w: 520, h: 100, wrap: 'around' }], 600);
  assert.equal(plan.a.floats[0].w, 600, 'the spacer takes the whole width');
});

test('a picture over the text never moves it', async () => {
  const { planFlow } = await flow;
  for (const wrap of ['over']) {
    const { plan, extra } = planFlow([block('a', 0, 'x'.repeat(300))], [{ id: 'i', x: 0, y: 0, w: 200, h: 100, wrap }], 600);
    assert.deepEqual(plan, {}); assert.equal(extra, 0);
  }
});

test('blocks that cannot wrap are pushed below the picture', async () => {
  const { planFlow, GAP } = await flow;
  const { plan } = planFlow([block('t', 0, 'x'.repeat(10), { solid: true, height: 80 })], [{ id: 'i', x: 0, y: 10, w: 200, h: 100, wrap: 'around' }], 600);
  assert.equal(plan.t.push, 10 + 100 + GAP);
});

test('a block that ends above a picture is not stretched by rows with no room', async () => {
  const { planFlow } = await flow;
  const { plan } = planFlow([block('a', 0, 'x'.repeat(20))], [{ id: 'i', x: 0, y: 35, w: 600, h: 100, wrap: 'break' }], 600);
  assert.equal(plan.a, undefined, 'one row of text, nothing to wrap');
});
