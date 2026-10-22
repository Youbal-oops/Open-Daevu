// Finds a newer Daevu on this project's GitHub Releases and downloads it. Nothing about the workspace is sent.
const fs = require('node:fs'), path = require('node:path');
const REPO = 'Youbal-oops/Open-Daevu';
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const DOWNLOAD_HOSTS = ['github.com', 'githubusercontent.com'];

const parts = v => String(v || '').replace(/^v/i, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
// 1 when a is newer than b, -1 when older, 0 when the same.
function compareVersions(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length, 3); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}
// Setup for an installed copy, Portable for a portable one.
function pickAsset(assets, portable) {
  const exes = (assets || []).filter(a => /\.exe$/i.test(a.name || '') && typeof a.browser_download_url === 'string');
  const wanted = portable ? /portable/i : /setup/i;
  return exes.find(a => wanted.test(a.name)) || exes[0] || null;
}
const trusted = url => { try { const u = new URL(url); return u.protocol === 'https:' && DOWNLOAD_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h)); } catch { return false; } };

class Updates {
  constructor({ version, fetch, userData, downloads, portable = false, onChange }) {
    Object.assign(this, { version, fetch, downloads, portable, onChange });
    this.file = path.join(userData, 'updates.json');
    this.state = { current: version, checking: false, available: null, progress: null, downloaded: null, error: '' };
    try { this.prefs = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.prefs = {}; }
  }
  save() { try { fs.writeFileSync(this.file, JSON.stringify(this.prefs)); } catch {} }
  set(patch) { this.state = { ...this.state, ...patch }; this.onChange?.(this.state); }
  async check({ manual = false } = {}) {
    if (this.state.checking) return this.state;
    this.set({ checking: true, error: '' });
    try {
      const response = await this.fetch(LATEST, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Daevu-updater' } });
      if (!response.ok) throw new Error(response.status === 404 ? 'No release has been published yet.' : `GitHub answered ${response.status}.`);
      const release = await response.json(), tag = String(release.tag_name || '');
      const asset = pickAsset(release.assets, this.portable);
      const newer = compareVersions(tag, this.version) > 0 && asset;
      const skipped = !manual && this.prefs.skipped === tag;
      const available = newer && !skipped ? { version: tag.replace(/^v/i, ''), notes: String(release.body || '').slice(0, 4000), page: String(release.html_url || ''), name: asset.name, size: asset.size || 0, url: asset.browser_download_url } : null;
      // A download only counts for the release it came from; a newer release has to be downloaded again.
      const kept = available && this.downloadedVersion === available.version ? this.state.downloaded : null;
      if (!kept) this.downloadedVersion = null;
      this.set({ checking: false, available, downloaded: kept });
    } catch (error) { this.set({ checking: false, error: manual ? error.message : '' }); }
    return this.state;
  }
  skip() { if (this.state.available) { this.prefs.skipped = 'v' + this.state.available.version; this.save(); } this.set({ available: null }); }
  async download() {
    const update = this.state.available;
    if (!update || !trusted(update.url)) throw new Error('There is no update to download.');
    fs.mkdirSync(this.downloads, { recursive: true });
    const target = path.join(this.downloads, path.basename(update.name)), partial = target + '.part';
    this.set({ progress: 0, error: '' });
    try {
      const response = await this.fetch(update.url, { headers: { 'User-Agent': 'Daevu-updater' } });
      if (!response.ok || !response.body) throw new Error(`The download failed (${response.status}).`);
      const total = Number(response.headers.get('content-length')) || update.size || 0, out = fs.createWriteStream(partial);
      let done = 0;
      for await (const chunk of response.body) { if (!out.write(chunk)) await new Promise(r => out.once('drain', r)); done += chunk.length; if (total) this.set({ progress: Math.min(1, done / total) }); }
      await new Promise((resolve, reject) => { out.end(error => error ? reject(error) : resolve()); });
      if (update.size && done !== update.size) throw new Error('The download was cut short. Try again.');
      fs.renameSync(partial, target);
      this.downloadedVersion = update.version;
      this.set({ progress: null, downloaded: target });
      return target;
    } catch (error) { try { fs.rmSync(partial, { force: true }); } catch {} this.set({ progress: null, error: error.message }); throw error; }
  }
}
module.exports = { Updates, compareVersions, pickAsset, trusted };
