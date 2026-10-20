// The MCP client library is large, so it is loaded the first time a server is actually connected.
let sdk;
const loadSdk = () => sdk ||= {
  Client: require('@modelcontextprotocol/sdk/client/index.js').Client,
  ...require('@modelcontextprotocol/sdk/client/stdio.js'),
  StreamableHTTPClientTransport: require('@modelcontextprotocol/sdk/client/streamableHttp.js').StreamableHTTPClientTransport,
  SSEClientTransport: require('@modelcontextprotocol/sdk/client/sse.js').SSEClientTransport
};
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { serverConfigs, summarize } = require('./tools.cjs');
const { McpOAuth } = require('./mcp-oauth.cjs');
function configValue(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 64000) throw Error('Enter a server configuration under 64 KB.');
  const config = structuredClone(input);
  if (config.url || config.serverUrl || config.httpUrl) {
    const url = new URL(config.url || config.serverUrl || config.httpUrl);
    if (!(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)) || url.username || url.password || url.hash) throw Error('Use HTTPS, or HTTP for a local MCP server, without embedded login details.');
    config.url = url.href;
  } else if (typeof config.command !== 'string' || !config.command.trim() || /[\r\n]/.test(config.command) || config.args != null && (!Array.isArray(config.args) || config.args.some(x => typeof x !== 'string'))) throw Error('A local server needs a command and an optional array of arguments.');
  for (const key of ['headers','http_headers','env','env_http_headers']) if (config[key] != null && (typeof config[key] !== 'object' || Array.isArray(config[key]) || Object.values(config[key]).some(x => typeof x !== 'string'))) throw Error(`${key} must contain string values.`);
  return config;
}
class McpRuntime {
  constructor(vault, { approve = async () => false, home, connector, openExternal, oauthOptions } = {}) { this.vault = vault; this.approve = approve; this.home = home; this.connector = connector; this.sessions = new Set(); this.oauth=new McpOAuth(vault,{openExternal,...oauthOptions}); }
  async configs(settings) {
    const found = await serverConfigs(settings, this.home);
    for (const [name, record] of Object.entries(this.vault?.data.mcpServers || {})) found.set(name, { ...record, source: 'Workspace connection', managed: true });
    return found;
  }
  policy(name,record){const saved=this.vault?.data.mcpPolicies?.[name];return saved?.configHash===createHash('sha256').update(JSON.stringify(record.config)).digest('hex')?saved.mode:record.approvalMode || (record.allowReadOnly?'read':'ask');}
  async setPolicy(name,mode,settings={}){
    if(!['ask','read','all'].includes(mode))throw Error('Choose an MCP approval mode.');
    const record=(await this.configs(settings)).get(name);if(!record || !this.vault)throw Error('Choose a configured MCP server.');
    await this.vault.update(data=>{data.mcpPolicies ||= {};data.mcpPolicies[name]={mode,configHash:createHash('sha256').update(JSON.stringify(record.config)).digest('hex')};});
  }
  async catalog(settings) { return [...await this.configs(settings)].map(([name, record]) => ({ id: `mcp:${name}`, name, kind: 'mcp', source: record.source, managed: Boolean(record.managed), remote:Boolean(record.config.url), authorized:Boolean(record.oauth?.tokens), approvalMode:this.policy(name,record),allowReadOnly:this.policy(name,record)==='read', ...summarize(record.config) })); }
  async add(name, config, allowReadOnly = false) {
    if (!this.vault) throw Error('Secure credential storage is unavailable.');
    if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,60}$/.test(name)) throw Error('Use a server name with letters, numbers, underscores, or hyphens.');
    const checked = configValue(config),mode=typeof allowReadOnly==='string'?allowReadOnly:allowReadOnly===true?'read':'ask';
    if(!['ask','read','all'].includes(mode))throw Error('Choose an MCP approval mode.');
    this.oauth.cancel(name);
    await this.vault.update(data => { data.mcpServers ||= {}; if (!data.mcpServers[name] && Object.keys(data.mcpServers).length >= 30) throw Error('Keep up to 30 MCP connections.'); if(data.mcpPolicies)delete data.mcpPolicies[name];data.mcpServers[name] = { config: checked, approvalMode:mode,allowReadOnly:mode==='read' }; });
  }
  async remove(name) { if (!this.vault) throw Error('Secure storage is unavailable.'); this.oauth.cancel(name); await this.vault.update(data => { if (data.mcpServers) delete data.mcpServers[name];if(data.mcpPolicies)delete data.mcpPolicies[name]; }); }
  async connect(name, record, signal) {
    if (this.connector) return this.connector(name, record, signal);
    const { Client, StdioClientTransport, getDefaultEnvironment, StreamableHTTPClientTransport, SSEClientTransport } = loadSdk();
    const config = configValue(record.config), client = new Client({ name: 'Research-Workspace', version: '0.7.0' }); let transport;
    const timeout = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(20000)]);
    if (config.url) {
      const headers = { ...config.http_headers, ...config.headers };
      for (const [key, env] of Object.entries(config.env_http_headers || {})) { if (!process.env[env]) throw Error('An MCP header environment variable is missing.'); headers[key] = process.env[env]; }
      if (config.bearer_token_env_var) { if (!process.env[config.bearer_token_env_var]) throw Error('The MCP bearer-token environment variable is missing.'); headers.Authorization = `Bearer ${process.env[config.bearer_token_env_var]}`; }
      const options = { ...(record.managed && record.oauth?.redirect ? {authProvider:this.oauth.provider(name)} : {}), requestInit: { headers, redirect: 'error' }, fetch: (url, init) => fetch(url, { ...init, redirect: 'error',signal:AbortSignal.any([AbortSignal.timeout(60000),...(signal ? [signal] : []),...(init?.signal ? [init.signal] : [])]) }) };
      transport = config.type === 'sse' ? new SSEClientTransport(new URL(config.url), options) : new StreamableHTTPClientTransport(new URL(config.url), options);
    } else {
      const env = { ...getDefaultEnvironment() };
      for (const key of config.env_vars || []) if (typeof key === 'string' && process.env[key]) env[key] = process.env[key];
      Object.assign(env, config.env || {});
      transport = new StdioClientTransport({ command: config.command, args: config.args || [], env, stderr: 'pipe', maxBufferSize: 2 * 1024 * 1024 }); transport.stderr?.on('data', () => {});
    }
    const abort = () => { client.close().catch(() => {}); };
    timeout.addEventListener('abort', abort, { once: true });
    try { await client.connect(transport, { signal: timeout, timeout: 20000 }); if (timeout.aborted) throw Error('Cancelled'); }
    catch { await client.close().catch(() => {}); throw Error(`Could not connect to MCP server “${name}”. Check its command, URL, and separate MCP authorization. ChatGPT/Codex app connections are not inherited.`); }
    finally { timeout.removeEventListener('abort', abort); }
    return client;
  }
  async open(selected, settings, signal, context = {}) {
    const names = [...new Set((selected || []).filter(x => x.startsWith('mcp:')).map(x => x.slice(4)))];
    const configs = names.length ? await this.configs(settings) : new Map(), clients = [], tools = [], calls = new Map(); let count = 0, closed = false;
    const close = async () => { if (closed) return; closed = true; signal?.removeEventListener('abort', abort); await Promise.allSettled(clients.map(c => c.close())); this.sessions.delete(close); };
    const abort = () => { close().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true }); this.sessions.add(close);
    try {
      for (const name of names) {
        if (signal?.aborted || closed) throw Error('Run stopped.');
        const record = configs.get(name); if (!record) throw Error(`MCP server “${name}” is not configured on this PC.`);
        const client = await this.connect(name, record, signal); if (closed || signal?.aborted) { await client.close(); throw Error('Run stopped.'); } clients.push(client);
        let cursor, pages = 0; const seen = new Set();
        do {
          const listed = await client.listTools(cursor ? { cursor } : {}, { signal, timeout: 20000 });
          for (const tool of listed.tools || []) {
            if (tools.length >= 100) throw Error('Selected MCP servers expose over 100 tools. Select fewer servers.');
            if (seen.has(tool.name)) continue; seen.add(tool.name);
            const alias = `mcp_${name.replace(/[^a-zA-Z0-9_]/g,'_').slice(0,16)}_${tool.name.replace(/[^a-zA-Z0-9_]/g,'_').slice(0,30)}_${createHash('sha256').update(name + ':' + tool.name).digest('hex').slice(0,8)}`;
            tools.push({ name: alias, description: `${name}.${tool.name}: ${tool.description || tool.name}`.slice(0, 3000), parameters: tool.inputSchema || { type: 'object', properties: {} } }); calls.set(alias, { client, name, record, tool });
          }
          cursor = listed.nextCursor; if (++pages > 10 && cursor) throw Error('MCP tool listing exceeded its page limit.');
        } while (cursor);
      }
    } catch (error) { await close(); throw error; }
    const call = async (alias, args) => {
      if (signal?.aborted || closed) throw Error('Run stopped.');
      const entry = calls.get(alias); if (!entry) throw Error('The model requested a tool that was not selected.');
      if (++count > 32) throw Error('The MCP call limit was reached. Narrow this research request.');
      const { client, name, record, tool } = entry;
      if (!args || typeof args !== 'object' || Array.isArray(args) || JSON.stringify(args).length > 64000) throw Error('Invalid MCP arguments.');
      const mode=this.policy(name,record);
      const allowed = mode==='all' || mode==='read' && tool.annotations?.readOnlyHint === true || await this.approve({ ...context, server: name, tool: tool.name, args, signal });
      if (signal?.aborted || closed) throw Error('Run stopped.');
      if (!allowed) return JSON.stringify({ error: 'The user declined this tool call. Do not retry it or perform an equivalent action.' });
      await context.onCall?.({ server: name, tool: tool.name, phase: 'running' });
      try {
        const result = await client.callTool({ name: tool.name, arguments: args }, undefined, { signal, timeout: 60000, maxTotalTimeout: 60000 });
        const output = JSON.stringify({ isError: Boolean(result.isError), content: (result.content || []).filter(c => c.type === 'text').map(c => ({ type: 'text', text: String(c.text).slice(0, 40000) })), ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}) }).slice(0, 160000);
        await context.onCall?.({ server: name, tool: tool.name, phase: result.isError ? 'failed' : 'done' }); return output;
      } catch { await context.onCall?.({ server: name, tool: tool.name, phase: 'failed' }); if (signal?.aborted) throw Error('Run stopped.'); return JSON.stringify({ error: `MCP tool ${name}.${tool.name} failed. Check the server connection and authorization.` }); }
    };
    return { tools, call, close };
  }
  async test(name, settings) { const session = await this.open([`mcp:${name}`], settings, AbortSignal.timeout(25000)); try { return { name, count: session.tools.length }; } finally { await session.close(); } }
  async cliFile(selected, settings) {
    const names = [...new Set((selected || []).filter(x => x.startsWith('mcp:')).map(x => x.slice(4)))];
    if (!names.length) return null;
    const configs = await this.configs(settings), mcpServers = {};
    for (const name of names) {
      const record = configs.get(name); if (!record) throw Error(`MCP server “${name}” is not configured on this PC.`);
      const c = configValue(record.config);
      if (c.url) {
        const headers = {...c.http_headers,...c.headers};
        if(record.oauth?.tokens)headers.Authorization=`Bearer ${await this.oauth.token(name,c.url)}`;
        for (const [key,env] of Object.entries(c.env_http_headers || {})) { if (!process.env[env]) throw Error('An MCP header environment variable is missing.'); headers[key] = process.env[env]; }
        if(c.bearer_token_env_var) { if(!process.env[c.bearer_token_env_var]) throw Error('An MCP token environment variable is missing.'); headers.Authorization=`Bearer ${process.env[c.bearer_token_env_var]}`; }
        mcpServers[name] = {type:c.type==='sse'?'sse':'http',url:c.url,headers};
      } else mcpServers[name] = {command:c.command,args:c.args || [],env:c.env || {}};
    }
    const folder = await fs.mkdtemp(path.join(os.tmpdir(),'research-mcp-')), file = path.join(folder,'servers.json');
    try { await fs.writeFile(file,JSON.stringify({mcpServers}),{mode:0o600}); } catch (e) { await fs.rmdir(folder).catch(()=>{});throw e; }
    return {path:file,close:async()=>{await fs.unlink(file).catch(()=>{});await fs.rmdir(folder).catch(()=>{});}};
  }
  destroy() { this.oauth.destroy(); for (const close of this.sessions) close().catch(() => {}); }
}
module.exports = { McpRuntime, configValue };
