const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeFixture } = require('./fixture.cjs');
const { applyMutation, saveNoteRecord } = require('../shared/domain.mjs');
const modules = Promise.all([import('../shared/markdown-fix.mjs'), import('../shared/blocks.mjs')]);

const SQUASHED = "Rent by offer:\n| Offer | In-hand | Fits? | |---|---|---| | 12 LPA | ₹85,000 | Tight | | 15 LPA | ₹99,000 | Yes |\n\n- **Item**";

test('a table squashed onto one line becomes one row per line', async () => {
  const [{ fixMarkdown }] = await modules;
  const lines = fixMarkdown(SQUASHED).split('\n');
  assert.equal(lines[0], 'Rent by offer:');
  assert.equal(lines[1], '');
  assert.deepEqual(lines.slice(2, 6), ['| Offer | In-hand | Fits? |', '| --- | --- | --- |', '| 12 LPA | ₹85,000 | Tight |', '| 15 LPA | ₹99,000 | Yes |']);
  assert.equal(lines.at(-1), '- **Item**');
});

test('empty cells keep their place when a table is rebuilt', async () => {
  const [{ fixMarkdown }] = await modules;
  assert.deepEqual(fixMarkdown('| A | B | |---|---| | 1 | | | | 4 |').split('\n'), ['| A | B |', '| --- | --- |', '| 1 |  |', '|  | 4 |']);
});

test('headings and bullets are repaired, and code is left alone', async () => {
  const [{ fixMarkdown }] = await modules;
  assert.equal(fixMarkdown('#Title\n• one\n•  two'), '# Title\n- one\n- two');
  assert.equal(fixMarkdown('```\n#not a heading\n• nor a bullet\n```'), '```\n#not a heading\n• nor a bullet\n```');
});

test('Markdown tables become table blocks and back', async () => {
  const [, { markdownToBlocks, blocksToMarkdown, cleanBlocks }] = await modules;
  const blocks = markdownToBlocks(SQUASHED, (() => { let n = 0; return () => 'b' + ++n; })());
  assert.deepEqual(blocks.map(b => b.type), ['p', 'table', 'bullet']);
  assert.equal(blocks[1].text.split('\n').length, 4);
  assert.match(blocksToMarkdown(blocks), /\| 15 LPA \| ₹99,000 \| Yes \|/);
  assert.doesNotThrow(() => cleanBlocks(blocks));
});

test('a page keeps its pictures, and rejects ones that are not stored files', () => {
  const state = makeFixture(), image = { id: 'img-1', fileId: 'file-1', name: 'Plan.png', x: 400, y: 90, w: 300, h: 200, wrap: 'around' };
  let next = applyMutation(state, { type: 'page', projectId: 'research-project', value: { blocks: [{ id: 'b1', type: 'p', text: 'Hello' }, { id: 'b2', type: 'table', text: '| A |\n| --- |\n| 1 |' }], images: [image] } });
  assert.deepEqual(next.projects[0].page.images, [image]);
  next = applyMutation(next, { type: 'page', projectId: 'research-project', value: { blocks: [{ id: 'b1', type: 'p', text: 'Edited' }] } });
  assert.deepEqual(next.projects[0].page.images, [image], 'a save that says nothing about pictures keeps them');
  next = applyMutation(next, { type: 'page', projectId: 'research-project', value: { blocks: [{ id: 'b1', type: 'p', text: 'Edited' }], images: [{ ...image, wrap: 'nonsense', x: -50, w: 99999 }] } });
  assert.equal(next.projects[0].page.images[0].wrap, 'around');
  assert.equal(next.projects[0].page.images[0].x, 0);
  assert.equal(next.projects[0].page.images[0].w, 6000);
  assert.throws(() => applyMutation(next, { type: 'page', projectId: 'research-project', value: { blocks: [{ id: 'b1', type: 'p' }], images: [{ id: 'bad', x: 0, y: 0, w: 10, h: 10 }] } }), /stored file/);
  assert.throws(() => applyMutation(next, { type: 'page', projectId: 'research-project', value: { blocks: [{ id: 'b1', type: 'p' }], images: [{ ...image, src: 'javascript:alert(1)', fileId: undefined }] } }), /stored file/);
  next = applyMutation(next, { type: 'page', projectId: 'research-project', value: { blocks: [{ id: 'b1', type: 'p' }], images: [] } });
  assert.equal(next.projects[0].page.images, undefined);
});

test('a document keeps its pictures across saves', () => {
  const image = { id: 'img-1', fileId: 'file-1', name: 'a.png', x: 0, y: 0, w: 200, h: 100, wrap: 'break' };
  const first = saveNoteRecord(null, { id: 'n1', title: 'T', content: '', format: 'blocks', blocks: [{ id: 'b1', type: 'p', text: 'x' }], images: [image] });
  assert.deepEqual(first.images, [image]);
  const again = saveNoteRecord(first, { id: 'n1', title: 'T', content: 'x', format: 'blocks', blocks: [{ id: 'b1', type: 'p', text: 'y' }] });
  assert.deepEqual(again.images, [image]);
  const plain = saveNoteRecord(first, { id: 'n1', title: 'T', content: 'y', format: 'markdown' });
  assert.equal(plain.images, undefined);
});

test('a canvas can hold a picture block', () => {
  const state = makeFixture();
  const next = applyMutation(state, { type: 'canvas:item', projectId: 'research-project', value: { id: 'c1', type: 'image', refId: 'file-1', text: 'Plan', position: { x: 10, y: 20 }, size: { w: 300, h: 200 } } });
  assert.equal(next.projects[0].canvas[0].type, 'image');
  assert.equal(next.projects[0].canvas[0].refId, 'file-1');
});

test('doubly escaped line breaks and <br> tags are repaired, but a Windows path is not', async () => {
  const [{ fixMarkdown }] = await modules;
  assert.equal(fixMarkdown('# Plan\\n\\n- one\\n- two'), '# Plan\n\n- one\n- two');
  assert.equal(fixMarkdown('Saved to C:\\new\\notes.txt'), 'Saved to C:\\new\\notes.txt');
  assert.equal(fixMarkdown('Line one<br>Line two'), 'Line one\nLine two');
  assert.equal(fixMarkdown('| a | b |\n|---|---|\n| x<br>y | z |'), '| a | b |\n|---|---|\n| x / y | z |');
});

test('nested lists keep their levels, whether they are indented by two spaces or four', async () => {
  const [, { markdownToBlocks, blocksToMarkdown, listNumbers }] = await modules;
  for (const pad of ['  ', '    ']) {
    const md = `- Top\n${pad}- Child\n${pad}${pad}- Grandchild\n- Next\n\n1. One\n${pad}1. Sub one\n${pad}2. Sub two\n2. Two`;
    const blocks = markdownToBlocks(md);
    assert.deepEqual(blocks.map(b => b.indent || 0), [0, 1, 2, 0, 0, 1, 1, 0]);
    assert.deepEqual(listNumbers(blocks), [0, 0, 0, 0, 1, 1, 2, 2]);
    const again = markdownToBlocks(blocksToMarkdown(blocks));
    assert.deepEqual(again.map(b => [b.type, b.indent || 0, b.text]), blocks.map(b => [b.type, b.indent || 0, b.text]));
  }
});
