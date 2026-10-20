const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { DeviceLock, STALE_MS } = require('../electron/device-lock.cjs');

async function folder(t) {
  const root = path.resolve(__dirname, '../.test-data');
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, 'lock-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('only one computer can hold the workspace, and quitting releases it', async t => {
  const directory = await folder(t);
  let clock = Date.parse('2026-01-01T10:00:00Z');
  const now = () => clock;
  const pc = new DeviceLock(directory, { deviceId: 'pc', name: 'PC', now }), laptop = new DeviceLock(directory, { deviceId: 'laptop', name: 'Laptop', now });
  assert.equal((await pc.status()).state, 'free');
  assert.equal((await pc.acquire()).state, 'mine');
  const blocked = await laptop.acquire();
  assert.equal(blocked.state, 'other');
  assert.equal(blocked.holder.name, 'PC');
  await pc.release();
  assert.equal((await laptop.acquire()).state, 'mine');
  assert.equal((await pc.status()).state, 'other');
});

test('a lock that stopped beating expires, and a forced takeover wins', async t => {
  const directory = await folder(t);
  let clock = Date.parse('2026-01-01T10:00:00Z');
  const now = () => clock;
  const pc = new DeviceLock(directory, { deviceId: 'pc', now }), laptop = new DeviceLock(directory, { deviceId: 'laptop', now });
  await pc.acquire();
  clock += STALE_MS - 1000;
  assert.equal((await laptop.status()).state, 'other');
  await pc.heartbeat();
  clock += STALE_MS - 1000;
  assert.equal((await laptop.status()).state, 'other', 'a heartbeat keeps the lock alive');
  clock += 2000;
  assert.equal((await laptop.status()).state, 'stale');
  assert.equal((await laptop.acquire()).state, 'mine');
  assert.equal((await pc.heartbeat()).state, 'other', 'the old holder cannot take it back by beating');
  assert.equal((await pc.acquire()).state, 'other');
  assert.equal((await pc.acquire({ force: true })).state, 'mine');
});

test('an unreadable lock file counts as free and only the holder can release', async t => {
  const directory = await folder(t);
  const pc = new DeviceLock(directory, { deviceId: 'pc' }), laptop = new DeviceLock(directory, { deviceId: 'laptop' });
  await fs.writeFile(path.join(directory, 'open-device.json'), '{not json');
  assert.equal((await pc.status()).state, 'free');
  await pc.acquire();
  await laptop.release();
  assert.equal((await pc.status()).state, 'mine');
  pc.releaseSync();
  assert.equal((await laptop.status()).state, 'free');
});

test('a crashed run on the same computer is not treated as another computer', async t => {
  const directory = await folder(t);
  const first = new DeviceLock(directory, { deviceId: 'pc' });
  await first.acquire();
  const held = JSON.parse(await fs.readFile(first.file, 'utf8'));
  await fs.writeFile(first.file, JSON.stringify({ ...held, session: 'old-session', pid: 2 ** 22 + 12345 }));
  const again = new DeviceLock(directory, { deviceId: 'pc' });
  assert.equal((await again.status()).state, 'stale');
});
