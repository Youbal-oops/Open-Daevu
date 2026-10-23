import { ServerIcon } from './server-icon';
import { McpConnections, McpMarketplace } from './mcp';
import React, { useEffect, useState } from 'react';
import { Wrench, Plug, Globe2, FileSearch, RefreshCw, Plus, Trash2, Server, Check, Search as SearchIcon, Sparkles } from 'lucide-react';
import { api } from './api';
import { Avatar, Modal, IconButton, uid } from './ui';
import { toolBlock } from '../shared/domain.mjs';

const toolIcon = tool => tool.kind === 'mcp' ? Plug : tool.kind === 'custom' ? Sparkles : /Web/.test(tool.id) ? Globe2 : /Read|Glob|Grep/.test(tool.id) ? FileSearch : Wrench;
export function useToolCatalog(refreshKey = '') {
  const [catalog, setCatalog] = useState({ tools: [], warnings: [], loading: true });
  const load = () => { setCatalog(c => ({ ...c, loading: true })); api.toolsList().then(v => setCatalog({ ...v, loading: false })).catch(e => setCatalog({ tools: [], warnings: [e.message], loading: false })); };
  useEffect(load, [refreshKey]);
  return { ...catalog, reload: load };
}
export function ToolChecklist({ tools, selected, onChange, empty = 'No tools found.' }) {
  const groups = [['builtin', 'Built-in research tools'], ['mcp', 'MCP servers'], ['custom', 'Custom tools']];
  const toggle = id => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  return <div className="tool-checklist">{groups.map(([kind, label]) => { const items = tools.filter(t => t.kind === kind); return items.length ? <div key={kind}><div className="tool-group-label">{label}</div>{items.map(t => { const Icon = toolIcon(t); return <label key={t.id} className="tool-check"><input type="checkbox" checked={t.id==='workspace:database' || selected.includes(t.id)} disabled={t.id==='workspace:database'} onChange={() => toggle(t.id)}/>{t.kind === 'mcp' ? <ServerIcon tool={t} size={22}/> : <Icon size={15}/>}<span><strong>{t.name}</strong><small>{t.source}{t.detail ? ` · ${t.detail}` : ''}</small></span></label>; })}</div> : null; })}{!tools.length && <p className="field-help">{empty}</p>}</div>;
}
const support = agent => ['claude'].includes(agent.provider) ? 'Enforced: only selected tools are allowed' : ['codex', 'custom'].includes(agent.provider) ? 'Preferred: added to the instructions; the CLI uses its own configuration' : 'Runs through the app: the tools you pick are offered to the model, and MCP servers use their approval setting';
export function ToolsView(props){
 const [inventory,setInventory]=useState(false);const catalog=useToolCatalog();
 return inventory?<><button className="text-button market-back" onClick={()=>setInventory(false)}>← MCP marketplace</button><ToolsInventory {...props}/></>:<McpMarketplace tools={catalog.tools} reload={catalog.reload} onTools={()=>setInventory(true)}/>;
}
function ToolsInventory({ state, act, perform }) {
  const { tools, warnings, loading, reload } = useToolCatalog(state.settings.claudeMcpPath || '');
  const [filter, setFilter] = useState(''), [dialog, setDialog] = useState(false);
  const visible = tools.filter(t => `${t.name} ${t.source} ${t.detail}`.toLowerCase().includes(filter.toLowerCase()));
  const setDefault = (agent, toolId) => perform(() => act({ type: 'agent:tools', value: { id:agent.id, toolIds: (agent.toolIds || []).includes(toolId) ? agent.toolIds.filter(t => t !== toolId) : [...(agent.toolIds || []), toolId] } }));
  const sections = [['builtin', 'Built-in research tools', 'CLI research tools. Account web search is configured in the agent profile.'], ['mcp', 'MCP servers', 'Found in your Claude and Codex configuration. Secrets and arguments are never shown.'], ['custom', 'Custom tools', 'Tool patterns you added yourself.']];
  return <main className="full-page tools-page"><div className="eyebrow">AGENT TOOLS</div><div className="full-page-heading"><div><h1>Tools & MCP</h1><p>See what your agents can use, choose tools per message in chat, and set defaults for each agent.</p></div><div className="heading-actions"><button className="button secondary" onClick={reload}><RefreshCw size={15} className={loading ? 'spin' : ''}/>Refresh</button><button className="button primary" onClick={() => setDialog(true)}><Plus size={16}/>Add custom tool</button></div></div>
    <div className="tool-legend"><span><i className="dot enforced"/>Claude CLI: only the tools you select are allowed</span><span><i className="dot preferred"/>Codex and custom CLIs: selected tools are added to instructions</span><span><i className="dot none"/>Account connections: selected MCP servers through the app</span></div>
    <McpConnections tools={tools} reload={reload}/>
    <div className="search-field"><SearchIcon size={16}/><input aria-label="Search tools" placeholder="Search tools and MCP servers…" value={filter} onChange={e => setFilter(e.target.value)}/></div>
    {warnings.map(w => <p key={w} className="inline-error">{w}</p>)}
    {sections.map(([kind, title, note]) => { const items = visible.filter(t => t.kind === kind); return (items.length || (kind === 'mcp' && !filter)) ? <section key={kind} className="tool-section"><div className="section-heading"><h3>{title}<span>{items.length}</span></h3><small>{note}</small></div>{items.length ? <div className="tool-table">{items.map(t => { const Icon = toolIcon(t); return <article className="tool-row" key={t.id}><span className="tool-icon">{t.kind === 'mcp' ? <ServerIcon tool={t} size={30}/> : <Icon size={17}/>}</span><div className="tool-main"><strong>{t.name}</strong><small>{t.source}{t.transport ? ` · ${t.transport === 'http' ? 'Remote' : 'Local'}` : ''}{t.detail ? ` · ${t.detail}` : ''}</small></div><div className="tool-defaults" aria-label={`Default for ${t.name}`}><span className="tool-defaults-label">Default for</span>{state.agents.map(a => { const on = t.id==='workspace:database' || (a.toolIds || []).includes(t.id), block = toolBlock(t, a); return <button key={a.id} type="button" className={`tool-agent ${on ? 'on' : ''}${block ? ' blocked' : ''}`} title={t.id==='workspace:database'?'Automatic for every project agent':block ? `${a.name}: ${block}` : `${on ? 'Remove default from' : 'Make default for'} ${a.name} · ${support(a)}`} disabled={t.id==='workspace:database' || Boolean(block)} aria-pressed={on} aria-label={`${a.name} default for ${t.name}`} onClick={() => setDefault(a, t.id)}><Avatar agent={a} small/>{on && <Check size={9} className="tool-agent-check"/>}</button>; })}{!state.agents.length && <small>Create an agent first</small>}</div>{kind === 'custom' && <IconButton icon={Trash2} label={`Remove ${t.name}`} onClick={() => perform(() => act({ type: 'settings', value: { customTools: state.settings.customTools.filter(c => 'custom:' + c.id !== t.id) } }))}/>}</article>; })}</div> : <div className="quiet-placeholder"><Server size={16}/> No MCP servers were found. Add one with <code>claude mcp add</code> or in <code>~/.codex/config.toml</code>, or set an extra Claude MCP file in Settings, then Refresh.</div>}</section> : null; })}
    {dialog && <CustomToolDialog onClose={() => setDialog(false)} onSave={async tool => { await act({ type: 'settings', value: { customTools: [...(state.settings.customTools || []), tool] } }); setDialog(false); }}/>}
  </main>;
}
function CustomToolDialog({ onClose, onSave }) {
  const [name, setName] = useState(''), [pattern, setPattern] = useState(''), [error, setError] = useState('');
  return <Modal title="Add a custom tool" subtitle="Allow a specific Claude CLI tool pattern, such as an MCP tool or a limited command." onClose={onClose}><form onSubmit={async e => { e.preventDefault(); try { await onSave({ id: uid(), name: name.trim(), pattern: pattern.trim() }); } catch (err) { setError(err.message); } }}><label className="form-label">Name<input required placeholder="e.g. Git history" value={name} onChange={e => setName(e.target.value)}/></label><label className="form-label">Tool pattern<input required placeholder="mcp__server__tool or Bash(git log:*)" value={pattern} onChange={e => setPattern(e.target.value)}/><small>Use one pattern. Prefer narrow patterns; broad shell access lets an agent change your files.</small></label>{error && <p className="inline-error">{error}</p>}<div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Add tool</button></div></form></Modal>;
}
