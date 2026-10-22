const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Updates, compareVersions, pickAsset, trusted } = require('../electron/updates.cjs');

test('versions compare numerically', () => {
  assert.equal(compareVersions('v1.0.2', '1.0.1'), 1);
  assert.equal(compareVersions('1.0.10', '1.0.9'), 1);
  assert.equal(compareVersions('1.0.1', 'v1.0.1'), 0);
  assert.equal(compareVersions('1.0', '1.0.1'), -1);
  assert.equal(compareVersions('2.0.0-beta', '1.9.9'), 1);
});

test('the right installer is chosen, and only GitHub downloads are trusted', () => {
  const assets = [{ name: 'Daevu-1.0.2-x64-Portable.exe', browser_download_url: 'https://github.com/a/p.exe' }, { name: 'Daevu-1.0.2-x64-Setup.exe', browser_download_url: 'https://github.com/a/s.exe' }, { name: 'notes.txt', browser_download_url: 'https://github.com/a/n.txt' }];
  assert.match(pickAsset(assets, false).name, /Setup/);
  assert.match(pickAsset(assets, true).name, /Portable/);
  assert.equal(trusted('https://github.com/a/s.exe'), true);
  assert.equal(trusted('https://objects.githubusercontent.com/x'), true);
  assert.equal(trusted('http://github.com/a'), false);
  assert.equal(trusted('https://evil.example/github.com'), false);
});

const release = (tag, size = 5) => ({ tag_name: tag, body: 'Notes', html_url: 'https://github.com/r', assets: [{ name: 'Daevu-Setup.exe', size, browser_download_url: 'https://github.com/a/Daevu-Setup.exe' }] });
const json = body => ({ ok: true, status: 200, json: async () => body });
const make = (version, fetch) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-')); return { updates: new Updates({ version, userData: dir, downloads: path.join(dir, 'dl'), fetch }), dir }; };
const file = (size, chunks) => async url => url.includes('api.github') ? json(release('v1.0.2', size)) : { ok: true, status: 200, headers: { get: () => String(size) }, body: (async function* () { yield* chunks; })() };

test('an older copy is told about a newer release, and a current one is not', async () => {
  assert.equal((await make('1.0.1', async () => json(release('v1.0.2'))).updates.check()).available.version, '1.0.2');
  assert.equal((await make('1.0.2', async () => json(release('v1.0.2'))).updates.check()).available, null);
  assert.equal((await make('1.0.1', async () => ({ ok: false, status: 500 })).updates.check()).error, '', 'a failed quiet check says nothing');
});

test('a skipped version stays quiet until a manual check', async () => {
  const { updates } = make('1.0.1', async () => json(release('v1.0.2')));
  await updates.check(); updates.skip();
  assert.equal(updates.state.available, null);
  assert.equal((await updates.check()).available, null);
  assert.equal((await updates.check({ manual: true })).available.version, '1.0.2');
});

test('the installer downloads to a file and its size is checked', async () => {
  const chunks = [Buffer.from('ab'), Buffer.from('cde')];
  const ok = make('1.0.1', file(5, chunks));
  await ok.updates.check();
  assert.equal(fs.readFileSync(await ok.updates.download(), 'utf8'), 'abcde');
  const short = make('1.0.1', file(9, chunks));
  await short.updates.check();
  await assert.rejects(() => short.updates.download(), /cut short/);
  assert.equal(fs.readdirSync(path.join(short.dir, 'dl')).length, 0, 'no partial file is left');
});
