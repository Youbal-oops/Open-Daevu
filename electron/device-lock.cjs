const fs = require('node:fs/promises');
const sync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const STALE_MS = 15 * 60 * 1000;

// One computer at a time: a small marker in the Drive folder says which computer has the app open.
// It is advisory, because Drive delivers files late. Shared editing underneath still merges any overlap.
class DeviceLock {
  constructor(directory, { deviceId, name = os.hostname(), staleMs = STALE_MS, now = () => Date.now() }) {
    Object.assign(this, { directory, deviceId, name, staleMs, now });
    this.file = path.join(directory, 'open-device.json');
    this.session = randomUUID();
    this.data = null;
  }
  async read() {
    try { const value = JSON.parse(await fs.readFile(this.file, 'utf8')); return value && typeof value === 'object' ? value : null; } catch { return null; }
  }
  async status() {
    const held = await this.read();
    if (!held) return { state: 'free' };
    if (held.session === this.session) return { state: 'mine', holder: held };
    const age = this.now() - Date.parse(held.heartbeat || held.openedAt);
    if (!(age < this.staleMs)) return { state: 'stale', holder: held };
    if (held.deviceId === this.deviceId && held.pid !== process.pid) {
      let alive = true;
      try { process.kill(held.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
      if (!alive) return { state: 'stale', holder: held };
    }
    return { state: 'other', holder: held };
  }
  async write() {
    const stamp = new Date(this.now()).toISOString();
    this.data = { version: 1, deviceId: this.deviceId, name: this.name, session: this.session, pid: process.pid, openedAt: this.data?.openedAt || stamp, heartbeat: stamp };
    await fs.mkdir(this.directory, { recursive: true });
    const temp = `${this.file}.${this.session}.tmp`;
    await fs.writeFile(temp, JSON.stringify(this.data));
    await fs.rename(temp, this.file);
  }
  async acquire({ force = false } = {}) {
    const status = await this.status();
    if (status.state === 'other' && !force) return status;
    await this.write();
    return { state: 'mine', holder: this.data };
  }
  async heartbeat() {
    const status = await this.status();
    if (status.state === 'other') return status;
    await this.write();
    return { state: 'mine', holder: this.data };
  }
  async release() {
    const held = await this.read();
    if (held?.session === this.session) await fs.unlink(this.file).catch(() => {});
  }
  releaseSync() {
    try { const held = JSON.parse(sync.readFileSync(this.file, 'utf8')); if (held.session === this.session) sync.unlinkSync(this.file); } catch {}
  }
}

module.exports = { DeviceLock, STALE_MS };
