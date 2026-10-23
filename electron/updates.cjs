// Finds a newer Daevu on this project's GitHub Releases and downloads it. Nothing about the workspace is sent.
const fs = require('node:fs'), path = require('node:path');
const { createHash } = require('node:crypto');
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
function pickAsset(assets, portable, version) {
  const wanted = new RegExp(`^Daevu-${version ? String(version).replace(/^v/i, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '\\d+\\.\\d+\\.\\d+'}-x64-${portable ? 'Portable' : 'Setup'}\\.exe$`, 'i');
  return (assets || []).find(a => wanted.test(a.name || '') && trusted(a.browser_download_url)) || null;
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
      const asset = pickAsset(release.assets, this.portable, tag);
      const newer = compareVersions(tag, this.version) > 0 && asset;
      const skipped = !manual && this.prefs.skipped === tag;
      const available = newer && !skipped ? { version: tag.replace(/^v/i, ''), notes: String(release.body || '').slice(0, 4000), page: String(release.html_url || ''), name: asset.name, size: asset.size || 0, url: asset.browser_download_url, digest: /^sha256:[a-f0-9]{64}$/i.test(asset.digest || '') ? asset.digest.toLowerCase().slice(7) : null } : null;
      // A download only counts for the release it came from; a newer release has to be downloaded again.
      const kept = available && this.downloadedVersion === available.version ? this.state.downloaded : null;
      if (!kept) this.downloadedVersion = null;
      this.set({ checking: false, available, downloaded: kept });
    } catch (error) { this.set({ checking: false, error: manual ? error.message : '' }); }
    return this.state;
  }
  skip() { if (this.state.available) { this.prefs.skipped = 'v' + this.state.available.version; this.save(); } this.set({ available: null }); }
  download() {
    if (this.downloading) return this.downloading;
    this.downloading = this.downloadAsset().finally(() => { this.downloading = null; });
    return this.downloading;
  }
  async verifyDownloaded() {
    const file = this.state.downloaded;
    if (!file || !this.downloadedDigest) throw Error('Download a verified update first.');
    const hash = createHash('sha256');
    try {
      for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
      if (hash.digest('hex') !== this.downloadedDigest) throw Error('The installer checksum changed. Download the update again.');
    } catch (error) { this.set({ downloaded: null, error: error.message }); throw error; }
    return file;
  }
  async downloadAsset() {
    const update = this.state.available;
    if (!update || !trusted(update.url)) throw new Error('There is no update to download.');
    if (!update.digest) { const error = 'This release has no SHA-256 digest. Use its GitHub release page to download and review it manually.'; this.set({ error }); throw Error(error); }
    fs.mkdirSync(this.downloads, { recursive: true });
    const target = path.join(this.downloads, path.basename(update.name)), partial = target + '.part';
    this.set({ progress: 0, error: '', downloaded: null });
    let out;
    try {
      const response = await this.fetch(update.url, { headers: { 'User-Agent': 'Daevu-updater' }, signal: AbortSignal.timeout(10 * 60 * 1000) });
      if (!response.ok || !response.body) throw new Error(`The download failed (${response.status}).`);
      if (response.url && !trusted(response.url)) throw Error('The download redirected outside GitHub.');
      const total = Number(response.headers.get('content-length')) || update.size || 0, hash = createHash('sha256');
      out = await fs.promises.open(partial, 'w');
      let done = 0;
      for await (const chunk of response.body) {
        done += chunk.length;
        if (done > (update.size || 1024 * 1024 * 1024)) throw Error('The download exceeds the expected installer size.');
        hash.update(chunk);
        for (let offset = 0; offset < chunk.length;) { const { bytesWritten } = await out.write(chunk, offset, chunk.length - offset); if (!bytesWritten) throw Error('Could not write the installer.'); offset += bytesWritten; }
        if (total) this.set({ progress: Math.min(1, done / total) });
      }
      await out.close(); out = null;
      if (update.size && done !== update.size) throw new Error('The download was cut short. Try again.');
      if (hash.digest('hex') !== update.digest) throw Error('The installer checksum does not match the release. Download it again.');
      fs.renameSync(partial, target);
      this.downloadedVersion = update.version;
      this.downloadedDigest = update.digest;
      this.set({ progress: null, downloaded: this.state.available?.version === update.version ? target : null });
      return target;
    } catch (error) { await out?.close().catch(() => {}); try { fs.rmSync(partial, { force: true }); } catch {} this.set({ progress: null, error: error.message }); throw error; }
  }
}
module.exports = { Updates, compareVersions, pickAsset, trusted };
