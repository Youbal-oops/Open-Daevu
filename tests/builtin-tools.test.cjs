const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const http = require('node:http');
const { builtinTools, privateAddress, safeUrl, pinnedGet } = require('../electron/builtin-tools.cjs');

async function project() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bt-')); await fs.mkdir(path.join(dir, 'files'));
  await fs.writeFile(path.join(dir, 'files', 'a.txt'), 'Rent is 1200\nFood is 450\n'); await fs.writeFile(path.join(dir, 'files', 'b.pdf'), '%PDF');
  const store = { state: { projects: [{ id: 'p', files: [{ id: 'f1', name: 'budget.txt', storedName: 'a.txt', size: 24 }, { id: 'f2', name: 'scan.pdf', storedName: 'b.pdf', size: 4 }, { id: 'f3', name: 'evil.txt', storedName: '../x.txt', size: 1 }] }] }, projectDir: () => dir };
  return store;
}
const named = list => Object.fromEntries(list.map(t => [t.name, t]));

test('only the tools that were switched on are offered', async () => {
  const store = await project();
  assert.deepEqual(builtinTools(store, 'p', []).map(t => t.name), []);
  assert.deepEqual(builtinTools(store, 'p', ['builtin:Read', 'builtin:Grep']).map(t => t.name).sort(), ['read_project_file', 'search_project_files']);
  assert.equal(builtinTools(store, 'p', ['builtin:WebSearch']).length, 0, 'web search is not a function; it belongs to the connection');
});

test('files are found, read and searched inside the project only', async () => {
  const t = named(builtinTools(await project(), 'p', ['builtin:Read', 'builtin:Glob', 'builtin:Grep']));
  assert.deepEqual((await t.find_project_files.call({ name: 'budg' })).files.map(f => f.name), ['budget.txt']);
  assert.match((await t.read_project_file.call({ file: 'budget.txt' })).text, /Rent is 1200/);
  await assert.rejects(t.read_project_file.call({ file: 'scan.pdf' }), /text files/);
  await assert.rejects(t.read_project_file.call({ file: 'evil.txt' }), /Choose a file in this project/);
  await assert.rejects(t.read_project_file.call({ file: 'missing.txt' }), /No file/);
  const found = (await t.search_project_files.call({ text: 'food' })).matches;
  assert.deepEqual(found.map(m => [m.file, m.line]), [['budget.txt', 2]]);
});

test('web fetch refuses this computer and its network, and checks every redirect', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.20.0.1', '169.254.1.1', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', 'fe90::1', 'febf::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '0:0:0:0:0:ffff:7f00:1', '64:ff9b::7f00:1', '2002:7f00:1::1']) assert.ok(privateAddress(ip), ip);
  for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111', '::ffff:808:808']) assert.ok(!privateAddress(ip), ip);
  await assert.rejects(safeUrl('http://[::ffff:127.0.0.1]/'), /not fetched/);
  await assert.rejects(safeUrl('http://[::ffff:a9fe:a9fe]/'), /not fetched/);
  await assert.rejects(safeUrl('http://100.64.0.1/'), /not fetched/);
  await assert.rejects(safeUrl('http://127.0.0.1:8080/'), /not fetched/);
  await assert.rejects(safeUrl('file:///etc/passwd'), /http and https/);
  await assert.rejects(safeUrl('https://user:pw@8.8.8.8/'), /plain/);
  const redirect = async () => ({ status: 302, ok: false, headers: { get: () => 'http://192.168.1.1/admin' } });
  const t = named(builtinTools(await project(), 'p', ['builtin:WebFetch'], redirect));
  await assert.rejects(t.fetch_web_page.call({ url: 'https://8.8.8.8/' }), /not fetched/);
  const page = async () => ({ status: 200, ok: true, headers: { get: () => 'text/html' }, text: async () => '<html><script>x()</script><p>Hello &amp; welcome</p></html>' });
  assert.equal((await named(builtinTools(await project(), 'p', ['builtin:WebFetch'], page)).fetch_web_page.call({ url: 'https://8.8.8.8/' })).text, 'Hello & welcome');
});

test('which tools an agent can be given, and why not', async () => {
  const { toolBlock } = await import('../shared/domain.mjs');
  const read = { id: 'builtin:Read', kind: 'builtin' }, search = { id: 'builtin:WebSearch', kind: 'builtin' }, mcp = { id: 'mcp:x', kind: 'mcp' }, custom = { id: 'custom:c', kind: 'custom' };
  for (const provider of ['chatgpt', 'gemini', 'openai-api', 'claude-api', 'openrouter', 'compatible']) {
    assert.equal(toolBlock(read, { provider }), '', provider + ' can read files'); assert.equal(toolBlock(mcp, { provider }), '');
    assert.match(toolBlock(search, { provider }), /agent profile/); assert.match(toolBlock(custom, { provider }), /Claude/);
  }
  assert.equal(toolBlock(read, { provider: 'claude' }), ''); assert.equal(toolBlock(search, { provider: 'codex' }), '');
  assert.match(toolBlock({ ...mcp, managed: true }, { provider: 'codex' }), /Claude only/);
});

test('the pinned connection refuses a name that points inside, and stops reading at the cap', async () => {
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('x'.repeat(5000)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  try {
    await assert.rejects(pinnedGet(`http://localhost:${port}/`), /not fetched/);
    await assert.rejects(pinnedGet(`http://127.0.0.1:${port}/`), /not fetched/);
  } finally { server.close(); }
});
