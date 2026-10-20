const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { BUILTIN_TOOLS } = require('../shared/domain.mjs');
const { parse: parseToml } = require('smol-toml');
async function readText(file) { try { return await fs.readFile(file, 'utf8'); } catch { return ''; } }
function readJson(text) { try { return JSON.parse(text); } catch { return null; } }
// Only a command name or server origin is shown. Arguments, environment values, and headers can hold secrets.
function summarize(config) {
  const url = config.url || config.serverUrl || config.httpUrl;
  if (url) { try { return { transport: 'http', detail: new URL(url).origin }; } catch { return { transport: 'http', detail: 'Remote server' }; } }
  const command = String(config.command || '').split(/[\\/]/).pop();
  return { transport: 'stdio', detail: command || 'Local server' };
}
function parseCodexServers(text) {
  try { return parseToml(text).mcp_servers || {}; } catch {}
  const servers = {};
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      const match = /^mcp_servers\.(?:"([^"]+)"|([A-Za-z0-9_-]+))$/.exec(header[1]);
      current = match ? (match[1] || match[2]) : null;
      if (current) servers[current] ||= {};
      continue;
    }
    if (!current) continue;
    const pair = /^(command|url)\s*=\s*"([^"]*)"/.exec(line);
    if (pair) servers[current][pair[1]] = pair[2];
  }
  return servers;
}
async function serverConfigs(settings = {}, home = os.homedir()) {
  const found = new Map();
  const add = (servers, source) => { for (const [name, config] of Object.entries(servers || {})) if (config && typeof config === 'object' && config.enabled !== false) { const old = found.get(name); found.set(name, { config: old?.config || config, source: old ? old.source + ' + ' + source : source }); } };
  add(readJson(await readText(path.join(home, '.claude.json')))?.mcpServers, 'Claude');
  if (settings.claudeMcpPath) add(readJson(await readText(settings.claudeMcpPath))?.mcpServers, 'Claude (extra config)');
  add(parseCodexServers(await readText(path.join(home, '.codex', 'config.toml'))), 'Codex');
  return found;
}
async function discoverTools(settings = {}, home = os.homedir()) {
  const found = new Map(), warnings = [];
  const add = (name, config, source) => {
    if (!name || typeof config !== 'object' || !config) return;
    const existing = found.get(name);
    if (existing) { if (!existing.source.includes(source)) existing.source += ` + ${source}`; return; }
    found.set(name, { id: `mcp:${name}`, kind: 'mcp', name, source, ...summarize(config) });
  };
  const claude = readJson(await readText(path.join(home, '.claude.json')));
  for (const [name, config] of Object.entries(claude?.mcpServers || {})) add(name, config, 'Claude');
  if (settings.claudeMcpPath) {
    const extra = readJson(await readText(settings.claudeMcpPath));
    if (extra) for (const [name, config] of Object.entries(extra.mcpServers || {})) add(name, config, 'Claude (extra config)');
    else warnings.push('The additional Claude MCP configuration could not be read.');
  }
  for (const [name, config] of Object.entries(parseCodexServers(await readText(path.join(home, '.codex', 'config.toml'))))) add(name, config, 'Codex');
  const custom = (settings.customTools || []).map(t => ({ id: `custom:${t.id}`, kind: 'custom', name: t.name, source: 'Custom', detail: t.pattern }));
  return { tools: [...BUILTIN_TOOLS.map(t => ({ id: t.id, kind: 'builtin', name: t.name, source: 'Built in', detail: t.detail })), ...[...found.values()].sort((a, b) => a.name.localeCompare(b.name)), ...custom], warnings };
}
module.exports = { discoverTools, parseCodexServers, serverConfigs, summarize };
