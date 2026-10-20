const REGISTRY = 'https://registry.modelcontextprotocol.io/v0.1/servers';
function remoteEntry(entry) {
  const server = entry?.server;
  if (!server || typeof server.name !== 'string') return null;
  if (entry._meta?.['io.modelcontextprotocol.registry/official']?.status === 'deleted') return null;
  const remotes = (server.remotes || []).flatMap(remote => {
    try {
      const url = new URL(remote.url);
      if (url.protocol !== 'https:' || url.username || url.password || /[{}]/.test(remote.url) || !['streamable-http','sse'].includes(remote.type)) return [];
      return [{ url: url.href, type: remote.type, headers: (remote.headers || []).map(h => ({name:String(h.name),description:String(h.description || ''),required:h.isRequired === true,value:typeof h.value === 'string' ? h.value : ''})) }];
    } catch { return []; }
  });
  return {id:server.name, name:String(server.title || server.name), description:String(server.description || '').slice(0,700), version:String(server.version || ''), remotes};
}
// A server's own logo, fetched here (the window may not load remote images) and handed over as a small data URL.
const PRIVATE_HOST = /^(localhost|.*\.local|127\.|10\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i;
function iconCandidates(server) {
  const out = [];
  for (const icon of server?.icons || []) if (typeof icon?.src === 'string') out.push(icon.src);
  for (const base of [server?.websiteUrl, server?.remotes?.[0]?.url]) {
    try { const url = new URL(base); out.push(url.origin + '/favicon.ico'); } catch {}
  }
  return out.filter(src => { try { const url = new URL(src); return url.protocol === 'https:' && !url.username && !PRIVATE_HOST.test(url.hostname); } catch { return false; } });
}
async function fetchIcon(server, fetcher) {
  for (const src of iconCandidates(server).slice(0, 3)) {
    try {
      const response = await fetcher(src, { signal: AbortSignal.timeout(3500), redirect: 'follow' });
      if (!response.ok || new URL(response.url || src).protocol !== 'https:') continue;
      const type = String(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon'].includes(type)) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 80 || bytes.length > 150000) continue;
      return `data:${type};base64,${bytes.toString('base64')}`;
    } catch {}
  }
  return '';
}
// The public registry can take 10-20 seconds to answer a search, so wait longer and remember recent answers.
const recent = new Map();
async function searchRegistry(query = '', cursor = '', fetcher = fetch) {
  if (typeof query !== 'string' || query.length > 100 || typeof cursor !== 'string' || cursor.length > 2000) throw Error('Use a search under 100 characters.');
  const url = new URL(REGISTRY);url.searchParams.set('search',query.trim());url.searchParams.set('version','latest');url.searchParams.set('limit','24');if(cursor)url.searchParams.set('cursor',cursor);
  const cacheKey = url.href, hit = recent.get(cacheKey);
  if (hit && Date.now() - hit.at < 600000) return hit.value;
  // The registry is sometimes slow or drops a connection, so try up to three times before giving up.
  let body = null;
  for (let attempt = 0; attempt < 3 && !body; attempt++) {
    try {
      const response=await fetcher(url,{signal:AbortSignal.timeout(20000),redirect:'error'});
      if(!response.ok)throw Error();
      const raw=await response.text();if(raw.length>2000000)throw Error();
      body=JSON.parse(raw);
    } catch {}
  }
  try {
    if(!body)throw Error();
    const found = (body.servers || []).map(entry => ({ entry: remoteEntry(entry), server: entry?.server })).filter(item => item.entry);
    const icons = await Promise.all(found.map(item => fetchIcon(item.server, fetcher)));
    const value = {servers:found.map((item, index) => icons[index] ? { ...item.entry, icon: icons[index] } : item.entry),cursor:body.metadata?.nextCursor || ''};
    recent.set(cacheKey, {at: Date.now(), value});if (recent.size > 40) recent.delete(recent.keys().next().value);
    return value;
  } catch {throw Error('The public MCP Registry is unavailable. Try again or add a custom connection.');}
}
module.exports={searchRegistry,remoteEntry};
