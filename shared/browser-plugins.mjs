// Which websites a plugin's browser changes apply to. A pattern is "*" or scheme://host/path with * as a wildcard:
// the scheme may be * (http or https), the host may be *, *.example.com (the site and every subdomain) or an exact name
// with an optional port (or :*), and * in the path stands for anything. The address is taken apart first, so a wildcard can
// never reach across the host into the path or the query, and matching never backtracks badly.
const parsed = new Map();
function parsePattern(pattern) {
  if (parsed.has(pattern)) return parsed.get(pattern);
  const m = /^(\*|https?):\/\/([^/]*)(\/.*)?$/.exec(pattern);
  let out = null;
  if (m) {
    const hostPart = m[2].toLowerCase(), at = hostPart.lastIndexOf(':'), hasPort = at > -1 && /^(\d+|\*)$/.test(hostPart.slice(at + 1));
    out = { scheme: m[1], host: hasPort ? hostPart.slice(0, at) : hostPart, port: hasPort ? hostPart.slice(at + 1) : null, path: m[3] || '/*' };
  }
  parsed.set(pattern, out); return out;
}
// * matches any run of characters. Two pointers, no recursion: the work is at most pattern length times text length.
function globMatch(pattern, text) {
  let p = 0, t = 0, star = -1, mark = 0;
  while (t < text.length) {
    if (p < pattern.length && pattern[p] === '*') { star = p++; mark = t; }
    else if (p < pattern.length && pattern[p] === text[t]) { p++; t++; }
    else if (star >= 0) { p = star + 1; t = ++mark; }
    else return false;
  }
  while (p < pattern.length && pattern[p] === '*') p++;
  return p === pattern.length;
}
export function urlMatches(pattern, url) {
  if (pattern === '*') return true;
  const want = parsePattern(pattern); if (!want) return false;
  let u; try { u = new URL(url); } catch { return false; }
  const scheme = u.protocol.slice(0, -1);
  if (!['http', 'https'].includes(scheme) || (want.scheme !== '*' && want.scheme !== scheme)) return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const hostOk = want.host === '*' || (want.host.startsWith('*.') ? host === want.host.slice(2) || host.endsWith(want.host.slice(1)) : host === want.host);
  if (!hostOk) return false;
  if (want.port !== null && want.port !== '*' && want.port !== (u.port || (scheme === 'https' ? '443' : '80'))) return false;
  return globMatch(want.path, u.pathname + u.search);
}
export const anyMatch = (patterns, url) => (patterns || []).some(p => urlMatches(p, url));

// What the enabled plugins change in the browser, for one address.
export function browserChanges(plugins, url) {
  const out = { css: [], scripts: [] };
  for (const plugin of plugins) {
    if (!plugin.enabled) continue;
    const b = plugin.contributes?.browser || {};
    for (const s of b.styles || []) if (anyMatch(s.matches, url)) out.css.push(s.css);
    for (const s of b.scripts || []) if (anyMatch(s.matches, url)) out.scripts.push(s.code);
  }
  return out;
}
export const blockedBy = (plugins, url) => plugins.some(p => p.enabled && (p.contributes?.browser?.blocks || []).some(pattern => urlMatches(pattern, url)));
