import { ServerIcon } from './server-icon';
import React, { useEffect, useState } from 'react';
import { Plug, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from './api';
import { Modal } from './ui';
import './mcp.css';
export function McpConnections({ tools, reload }) {
  const [dialog,setDialog]=useState(null),[gallery,setGallery]=useState(false),[busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState('');
  async function test(name) {
    setBusy(name);setError('');setNotice('');
    try {const result=await api.mcpTest(name);setNotice(`${name} connected · ${result.count} tools available. No tools were invoked.`);}
    catch(e){setError(e.message);}finally{setBusy('');}
  }
  async function signIn(name) {
    setBusy(name);setError('');setNotice('Complete sign-in in your browser.');
    try{await api.mcpSignIn(name);reload();setNotice(`${name} authorized. Test the connection to check available tools.`);}
    catch(e){setError(e.message);setNotice('');}finally{setBusy('');}
  }
  return <section className="mcp-connections">
    <div><h3><Plug size={17}/>Connections</h3><div className="mcp-actions"><button className="button secondary" onClick={()=>setDialog({})}><Plus size={14}/>Custom connection</button><button className="button primary" onClick={()=>setGallery(true)}>Browse connections</button></div></div>
    <p>Connect a service once, then choose which agents can use it. Credentials are encrypted on this device.</p>
    {!tools.some(t=>t.kind==='mcp') && <div className="mcp-empty">Your connected services will appear here. Browse the directory or add your website.</div>}
    {tools.filter(t=>t.kind==='mcp').map(t=><div className="mcp-connection-row" key={t.id}>
      <ServerIcon tool={t} size={30}/><span><strong>{t.name}</strong><small>{t.source} · {t.detail}{t.authorized?' · Signed in':''}</small></span>
      <select aria-label={`Tool approval for ${t.name}`} value={t.approvalMode || 'ask'} disabled={Boolean(busy)} onChange={async e=>{try{await api.mcpPolicy(t.name,e.target.value);reload();}catch(e){setError(e.message);}}}><option value="ask">Ask every time</option><option value="read">Allow read-only tools</option><option value="all">Always allow all tools</option></select>
      {t.managed && t.remote && <button className="button secondary small-button" disabled={Boolean(busy)} onClick={()=>signIn(t.name)}>{t.authorized?'Sign in again':'Sign in'}</button>}
      <button className="button secondary small-button" disabled={Boolean(busy)} onClick={()=>test(t.name)}>{busy===t.name?'Working…':'Test connection'}</button>
      {t.managed && <button className="icon-button" aria-label={`Remove MCP ${t.name}`} disabled={Boolean(busy)} onClick={async()=>{try{await api.mcpRemove(t.name);reload();}catch(e){setError(e.message);}}}><Trash2 size={14}/></button>}
    </div>)}
    {busy && <button className="button secondary small-button" onClick={()=>api.mcpCancel(busy).catch(e=>setError(e.message))}>Cancel sign-in</button>}
    {notice && <p role="status" className="field-help">{notice}</p>}{error && <p role="alert" className="inline-error">{error}</p>}
    {gallery && <ConnectionGallery onClose={()=>setGallery(false)} onSelect={entry=>{setGallery(false);setDialog(entry);}}/>}
    {dialog && <McpDialog entry={dialog} onClose={()=>{setDialog(null);reload();}} onSaved={()=>{setDialog(null);reload();}}/>}
  </section>;
}
function ConnectionGallery({onClose,onSelect,inline=false}) {
  const [query,setQuery]=useState(''),[result,setResult]=useState({servers:[],cursor:''}),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [search,setSearch]=useState('');
  useEffect(()=>{let alive=true;setLoading(true);setError('');api.mcpSearch(search).then(v=>{if(alive)setResult(v);}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[search]);
  async function more(){setLoading(true);try{const v=await api.mcpSearch(search,result.cursor);setResult(old=>({servers:[...old.servers,...v.servers.filter(s=>!old.servers.some(o=>o.id===s.id))],cursor:v.cursor}));}catch(e){setError(e.message);}finally{setLoading(false);}}
  const Container=inline?'section':Modal;
  return <Container {...(inline?{className:'mcp-market-content'}:{wide:true})} title="Discover connections" subtitle="Search the public MCP Registry. Listings are supplied by their publishers; availability and authorization vary by service." onClose={onClose}>
    <form className="mcp-search" onSubmit={e=>{e.preventDefault();setSearch(query.trim());}}><input aria-label="Search connections" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search services, tools, and integrations…" maxLength={100}/><button className="button primary" disabled={loading}>Search</button></form>
    <div className="mcp-suggestions">{['Notion','GitHub','Linear','Indeed','Drive','SEO'].map(q=><button key={q} onClick={()=>{setQuery(q);setSearch(q);}}>{q}</button>)}</div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="mcp-gallery">{result.servers.map(entry=><article key={entry.id} className="mcp-service"><div className="mcp-service-icon"><ServerIcon tool={{ kind: 'mcp', name: entry.name, detail: entry.id, icon: entry.icon }} size={36}/></div><div><strong>{entry.name}</strong><small>{entry.id}</small><p>{entry.description}</p><span>{entry.remotes.length?'Remote MCP · service authorization may be required':'Local server · manual setup required'}</span></div><button className="button secondary small-button" disabled={!entry.remotes.length} onClick={()=>onSelect(entry)}>Connect</button></article>)}</div>
    {loading && <p role="status" className="field-help">Searching the directory…</p>}
    {!loading && !error && !result.servers.length && <p className="field-help">No matching services. Some services only provide connectors inside specific apps. You can still add a custom MCP endpoint.</p>}
    {result.cursor && <button className="button secondary" disabled={loading} onClick={more}>Load more</button>}
  </Container>;
}
function McpDialog({entry={},onClose,onSaved}) {
  const [name,setName]=useState((entry.name || '').replace(/[^A-Za-z0-9_-]/g,'').slice(0,60)),[url,setUrl]=useState(entry.remotes?.[0]?.url || ''),[remoteIndex,setRemoteIndex]=useState(0),[auth,setAuth]=useState('oauth'),[token,setToken]=useState(''),[headers,setHeaders]=useState({}),[advanced,setAdvanced]=useState(false),[json,setJson]=useState(''),[approvalMode,setApprovalMode]=useState('ask'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const selectedRemote=entry.remotes?.[remoteIndex];
  return <Modal title={entry.id?`Connect ${entry.name}`:'Custom connection'} subtitle="Connection details are encrypted on this PC and stay out of Drive and project files." onClose={()=>{if(!busy)onClose();}}>
    <form onSubmit={async e=>{
      e.preventDefault();setBusy(true);setError('');
      try {
        let config=advanced?JSON.parse(json):{url,type:selectedRemote?.type==='sse'?'sse':'http',headers:{...Object.fromEntries((selectedRemote?.headers || []).filter(h=>h.value).map(h=>[h.name,h.value])),...headers,...(auth==='token' && token?{Authorization:`Bearer ${token}`}:{})}};
        if(config.mcpServers){const entries=Object.values(config.mcpServers);if(entries.length!==1)throw Error('Paste one server configuration at a time.');config=entries[0];}
        await api.mcpAdd(name,config,approvalMode);
        if(!advanced && auth==='oauth')await api.mcpSignIn(name);
        setUrl('');setToken('');setHeaders({});setJson('');onSaved();
      } catch(e){setError(e.message);}finally{setBusy(false);}
    }}>
      {entry.id && <p className="field-help">Publisher: {entry.id}. Confirm this is the provider you intend to trust before authorizing access.</p>}
      <label className="form-label">Connection name<input required aria-label="MCP server name" value={name} pattern="[A-Za-z][A-Za-z0-9_-]{0,60}" onChange={e=>setName(e.target.value)} placeholder="website"/></label>
      {entry.remotes?.length>1 && <label className="form-label">Endpoint<select value={remoteIndex} onChange={e=>{const index=Number(e.target.value);setRemoteIndex(index);setUrl(entry.remotes[index].url);setHeaders({});}}>{entry.remotes.map((r,i)=><option key={i} value={i}>{r.url}</option>)}</select></label>}
      <label className="settings-check"><input type="checkbox" checked={advanced} onChange={e=>setAdvanced(e.target.checked)}/>Advanced JSON configuration</label>
      {advanced?<label className="form-label">Server JSON<textarea required aria-label="MCP server JSON" spellCheck={false} value={json} onChange={e=>setJson(e.target.value)} rows={7} placeholder={'{"command":"npx","args":["-y","your-mcp-server"]}'}/></label>:<>
        <label className="form-label">Server URL<input required type="password" aria-label="MCP server URL" autoComplete="off" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://your-site.example/mcp"/></label>
        <label className="form-label">Authorization<select aria-label="MCP authorization" value={auth} onChange={e=>setAuth(e.target.value)}><option value="oauth">Sign in with browser</option><option value="token">API token</option><option value="none">No additional sign-in / access in URL</option></select></label>
        {auth==='token' && <label className="form-label">API token<input type="password" required autoComplete="off" value={token} onChange={e=>setToken(e.target.value)}/></label>}
        {(selectedRemote?.headers || []).map(h=><label className="form-label" key={h.name}>{h.name}<input type="password" required={h.required} autoComplete="off" value={headers[h.name] ?? h.value} onChange={e=>setHeaders({...headers,[h.name]:e.target.value})}/><small>{h.description}</small></label>)}
      </>}
      <label className="form-label">Tool approval<select aria-label="Tool approval" value={approvalMode} onChange={e=>setApprovalMode(e.target.value)}><option value="ask">Ask every time</option><option value="read">Allow read-only tools</option><option value="all">Always allow all tools</option></select></label>
      <p className="field-help">Always allow all tools includes reads, writes and tools without safety metadata. The setting applies to this server on this device. Browser sign-in requires a server that accepts public desktop clients; some services require their own approved integration. Claude CLI uses its own tool permissions.</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="modal-footer"><button className="button secondary" type="button" onClick={async()=>{if(busy)await api.mcpCancel(name);else onClose();}}>{busy?'Cancel sign-in':'Cancel'}</button><button className="button primary" disabled={busy}><ShieldCheck size={14}/>{busy?'Connecting…':!advanced && auth==='oauth'?'Connect & sign in':'Save connection'}</button></div>
    </form>
  </Modal>;
}
export function McpApprovals({onPendingChange}) {
  const [requests,setRequests]=useState([]),[error,setError]=useState('');
  useEffect(()=>{api.mcpPending().then(setRequests).catch(()=>{});return api.onMcpApprovals(setRequests);},[]);
  useEffect(()=>{onPendingChange?.(requests.length>0);},[requests.length,onPendingChange]);
  const first=requests[0];if(!first)return null;
  async function answer(allowed,always=false){setError('');try{await api.mcpAnswer(first.id,allowed,always);}catch(e){setError(e.message);}}
  return <div className="mcp-approval-layer"><Modal title="Allow this tool call?" subtitle={`${first.agentName || 'Agent'} wants to call ${first.server}.${first.tool}`} onClose={()=>answer(false)}><p className="field-help">Review the operation and arguments. Allowing runs this call once using this MCP server’s access.</p><pre className="mcp-arguments">{JSON.stringify(first.args,null,2)}</pre>{error && <p className="inline-error">{error}</p>}<div className="modal-footer"><button className="button secondary" onClick={()=>answer(false)}>Deny tool call</button><button className="button secondary" onClick={()=>answer(true,true)}>Always allow this server</button><button className="button primary" onClick={()=>answer(true)}>Allow once</button></div></Modal></div>;
}

export function McpMarketplace({tools,reload,onTools}){
 const [entry,setEntry]=useState(null),[selected,setSelected]=useState('');
 const connected=tools.filter(t=>t.kind==='mcp');
 return <div className="market-shell"><aside className="market-nav"><h2>Integrations</h2><button className={!selected?'active':''} onClick={()=>setSelected('')}>Discover MCP servers</button><button onClick={onTools}>Agent tools & defaults</button><small>INSTALLED</small>{connected.map(t=><button key={t.id} className={selected===t.id?'active':''} onClick={()=>setSelected(t.id)}><ServerIcon tool={t} size={20}/>{t.name}</button>)}</aside><div className="market-body"><h1>{selected?'Connection settings':'MCP marketplace'}</h1><p className="field-help">Connect services and give your agents the tools they need.</p>{selected?<McpConnections tools={connected.filter(t=>t.id===selected)} reload={reload}/>:<ConnectionGallery inline onSelect={setEntry}/>}</div>{entry&&<McpDialog entry={entry} onClose={()=>setEntry(null)} onSaved={()=>{setEntry(null);reload();}}/>}</div>;
}
