// Which websites a plugin's browser changes apply to. A pattern is "*" or a URL with * standing for anything.
const cache = new Map();
export function urlMatches(pattern, url) {
  if (pattern === '*') return true;
  let re = cache.get(pattern);
  if (!re) { re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); cache.set(pattern, re); }
  return re.test(url);
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
