const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function withoutCode(text) {
  let fence = null;
  return text.split(/\r?\n/).map(line => {
    const mark = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (mark) {
      if (!fence) fence = mark[1];
      else if (mark[1][0] === fence[0] && mark[1].length >= fence.length) fence = null;
      return '';
    }
    return fence ? '' : line;
  }).join('\n');
}
function anchors(text) {
  const out = new Set(), seen = new Map();
  const slug = value => value.replace(/<[^>]*>/g, '').replace(/[`*_~]/g, '').toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
  for (const line of withoutCode(text).split('\n')) {
    const match = /^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?$/.exec(line);
    if (!match) continue;
    const base = slug(match[1]), count = seen.get(base) || 0;
    seen.set(base, count + 1); out.add(base + (count ? '-' + count : ''));
  }
  for (const match of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) out.add(match[1]);
  return out;
}
function checkDocs(root, files) {
  root = path.resolve(root);
  const errors = [], cache = new Map(); let links = 0;
  const read = file => { if (!cache.has(file)) cache.set(file, fs.readFileSync(file, 'utf8')); return cache.get(file); };
  function exactCase(file) {
    let folder = root;
    for (const part of path.relative(root, file).split(path.sep).filter(Boolean)) {
      if (!fs.readdirSync(folder).includes(part)) return false;
      folder = path.join(folder, part);
    }
    return true;
  }
  for (const file of files) {
    const full = path.resolve(root, file), source = withoutCode(read(full));
    const visible = source.replace(/(`+)[^\n]*?\1/g, '');
    const targets = [...visible.matchAll(/!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g)].map(m => m[1] || m[2]);
    targets.push(...[...visible.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)].map(m => m[1]));
    targets.push(...[...visible.matchAll(/^ {0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/gm)].map(m => m[1] || m[2]));
    for (const target of targets) {
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(target)) continue;
      links++;
      try {
        const [pathname, fragment] = target.split('#'), decoded = decodeURIComponent(pathname.split('?')[0]);
        const destination = decoded ? path.resolve(path.dirname(full), decoded) : full;
        const relative = path.relative(root, destination);
        if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw Error('outside repository');
        if (!fs.existsSync(destination)) throw Error('missing target');
        if (!exactCase(destination)) throw Error('path case does not match GitHub/Linux');
        if (fragment && /\.md$/i.test(destination) && !anchors(read(destination)).has(decodeURIComponent(fragment))) throw Error('missing heading fragment');
      } catch (error) { errors.push(`${file}: ${target}: ${error.message}`); }
    }
  }
  return { files: files.length, links, errors };
}
function main() {
  const root = path.resolve(__dirname, '..');
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.md'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const result = checkDocs(root, [...new Set(files)]);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  if (pkg.version !== lock.version || pkg.version !== lock.packages?.['']?.version) result.errors.push('package.json/package-lock.json versions differ');
  if (pkg.scripts['check:docs'] !== 'node scripts/check-docs.cjs') result.errors.push('check:docs script does not match documented command');
  console.log(`Checked ${result.files} Markdown files and ${result.links} local links. External URLs and GitHub settings were not checked.`);
  for (const error of result.errors) console.error(error);
  process.exitCode = result.errors.length ? 1 : 0;
}
if (require.main === module) main();
module.exports = { checkDocs, anchors, withoutCode };
