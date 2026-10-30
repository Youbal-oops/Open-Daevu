const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { cleanName, cleanExtensions } = require('../electron/app-transfer.cjs');

test('exported file names lose paths and unsafe characters', () => {
  assert.equal(cleanName('..\\..\\evil/report?.pdf'), '-..-evil-report-.pdf');
  assert.equal(cleanName('...'), 'export');
  assert.equal(cleanName(''), 'export');
});

test('import filters keep plain extensions only', () => {
  assert.deepEqual(cleanExtensions(['.CSV', '*.json', 'a/b', 'x'.repeat(20), 7]), ['csv', 'json', '7']);
  assert.deepEqual(cleanExtensions('csv'), []);
});

// Runs the injected SDK against a fake parent window and answers its requests like the host does.
async function sdk(answer) {
  const { withSdk } = await import('../src/rw-sdk.js');
  const script = withSdk('').match(/<script>([\s\S]*?)<\/script>/)[1], listeners = [], sent = [];
  const parent = { postMessage(message) { sent.push(message); if (message.id) Promise.resolve(answer(message)).then(value => listeners.forEach(fn => fn({ source: parent, data: { rw: 1, id: message.id, ok: true, value } }))); } };
  const context = { parent, addEventListener: (type, fn) => type === 'message' && listeners.push(fn), console, document: { documentElement: { style: { setProperty() {} } } }, setTimeout, clearTimeout, TextDecoder, Blob, ArrayBuffer, Uint8Array, Promise, btoa };
  context.window = context; vm.createContext(context); vm.runInContext(script, context);
  return { rw: context.rw, sent };
}

test('rw.export sends text and bytes to the host', async () => {
  const { rw, sent } = await sdk(() => true);
  assert.equal(await rw.export('a.csv', 'x,y'), true);
  assert.equal(await rw.export('a.pdf', new Uint8Array([37, 80, 68, 70])), true);
  const calls = sent.filter(m => m.op === 'export');
  assert.equal(calls[0].args[1], 'x,y');
  assert.equal(calls[1].args[0], 'a.pdf');
  await assert.rejects(() => rw.export('a.bin', 42), /rw.export needs/);
});

test('rw.import decodes the picked file and passes null when cancelled', async () => {
  const bytes = new TextEncoder().encode('héllo').buffer;
  const { rw } = await sdk(m => m.args[0].accept[0] === 'none' ? null : { name: 'n.txt', type: 'text/plain', size: 6, bytes });
  assert.deepEqual({ ...(await rw.import({ accept: ['txt'] })) }, { name: 'n.txt', type: 'text/plain', size: 6, data: 'héllo' });
  assert.equal((await rw.import({ accept: ['txt'], as: 'dataUrl' })).data, 'data:text/plain;base64,' + Buffer.from('héllo').toString('base64'));
  assert.equal((await rw.import({ accept: ['txt'], as: 'arrayBuffer' })).data, bytes);
  assert.equal(await rw.import({ accept: ['none'] }), null);
});
