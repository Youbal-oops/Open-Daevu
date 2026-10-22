import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useContextMenu } from './context-menu';
import { Plus, Trash2, Kanban, X, ArrowUpRight, ExternalLink, Table2, GripVertical, ArrowLeft, Check, AppWindow, Download, Code2, Eye, Sparkles, RefreshCw, Database as DatabaseIcon, Puzzle, Maximize2, Minimize2, LayoutDashboard } from 'lucide-react';
import { api } from './api';
import { LiveApp, AppBridge } from './liveapp';
import { STARTER_APP } from './app-templates';
import { csvParse } from '../shared/domain.mjs';
import { chartRows, kanbanFromRows, sourceOf } from '../shared/chart-data.mjs';
import { KINDS, GROUPS, CHART_IDS, newChartData, boardSample, useInstalledPlugins, useBoardKinds, missingPlugin } from './chart-kinds';
import { PluginBoard, MissingPlugin } from './plugin-board';
import { Chart } from './charts';
import { ChartEditor, SourcePicker } from './chart-editor';
import { IconButton, Modal, Empty, uid, now, date } from './ui';
import { AppStudio } from './app-studio';
import {AppLogo} from './app-logo';
import { DatabaseSql } from './database-sql';
import { Database, newDatabase } from './database';

export { KINDS };
const HTML_KIND = ['html', 'Interactive page', AppWindow], PLUGIN_KIND = ['plugin-board', 'Plugin chart', Puzzle];
const kindEntry = kind => KINDS.find(k => k[0] === kind) || (kind === 'html' ? HTML_KIND : kind === 'plugin-board' ? PLUGIN_KIND : KINDS[0]);
export const kindIcon = kind => kindEntry(kind)[2];
export const kindName = kind => kindEntry(kind)[1];
const PALETTE = ['var(--blue)', 'var(--green)', 'var(--orange)', 'var(--purple)', '#d98a9b', '#8fc7c2', '#c9b458'];
export function newArtifact(kind, label = '') {
  if (kind === 'database') return newDatabase();
  if (kind === 'app') return { id: uid(), kind: 'html', title: 'Untitled app', createdAt: now(), updatedAt: now(), data: { html: STARTER_APP, state: {} } };
  const own = /^plugin:([a-z0-9-]+):([a-z0-9-]+)$/.exec(kind);
  if (own) return { id: uid(), kind: 'plugin-board', title: `Untitled ${(label || 'chart').toLowerCase()}`, createdAt: now(), updatedAt: now(), data: { csv: boardSample(own[1], own[2]) || 'Label,Value\nA,3\nB,5\nC,2', sheetId: '', pluginId: own[1], boardId: own[2], state: null } };
  const base = { id: uid(), kind, createdAt: now(), updatedAt: now() };
  if (kind === 'kanban') return { ...base, title: 'Untitled board', data: { columns: ['To do', 'In progress', 'Done'].map(title => ({ id: uid(), title, cards: [] })) } };
  const name = (KINDS.find(k => k[0] === kind) || KINDS[2])[1].toLowerCase();
  return { ...base, title: `Untitled ${name}`, data: newChartData(kind) };
}

// A board whose cards come from the rows of a spreadsheet or a document table.
function LinkedKanban({ data, project }) {
  const table = chartRows(data, project), k = kanbanFromRows(table.rows, data.titleCol, data.groupCol);
  return k.columns.length ? <KanbanBoard data={{ columns: k.columns }} readOnly onChange={() => {}}/> : <div className="chart-empty">{table.error || 'The table has no rows yet.'}</div>;
}
const linked = data => ['sheet', 'note'].includes(sourceOf(data).type);
export function KanbanBoard({ data, onChange, readOnly = false }) {
  const [drag, setDrag] = useState(null), [over, setOver] = useState(null), [adding, setAdding] = useState({});
  const cols = data.columns;
  const set = columns => onChange({ ...data, columns });
  function drop(toCol, index) {
    if (!drag) return;
    const next = cols.map(c => ({ ...c, cards: [...c.cards] }));
    const from = next.find(c => c.id === drag.col), [card] = from.cards.splice(from.cards.findIndex(c => c.id === drag.card), 1);
    const to = next.find(c => c.id === toCol); to.cards.splice(index ?? to.cards.length, 0, card);
    setDrag(null); setOver(null); set(next);
  }
  return <div className={`kanban ${readOnly ? 'mini' : ''}`}>{cols.map(col => <section key={col.id} className={`kanban-col ${over?.col === col.id ? 'over' : ''}`} onDragOver={e => { if (drag) { e.preventDefault(); setOver({ col: col.id }); } }} onDrop={e => { e.preventDefault(); drop(col.id); }}>
    <header>{readOnly ? <strong>{col.title}</strong> : <input aria-label="Column title" value={col.title} onChange={e => set(cols.map(c => c.id === col.id ? { ...c, title: e.target.value } : c))}/>}<span className="kanban-count">{col.cards.length}</span>{!readOnly && <IconButton icon={X} label={`Delete column ${col.title}`} onClick={() => set(cols.filter(c => c.id !== col.id))}/>}</header>
    <div className="kanban-cards">{col.cards.map((card, i) => <article key={card.id} draggable={!readOnly} className={`kanban-card ${drag?.card === card.id ? 'dragging' : ''}`} onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDrag({ col: col.id, card: card.id }); }} onDragEnd={() => { setDrag(null); setOver(null); }} onDragOver={e => { if (drag) { e.preventDefault(); e.stopPropagation(); setOver({ col: col.id }); } }} onDrop={e => { e.preventDefault(); e.stopPropagation(); drop(col.id, i); }}>{readOnly ? <p>{card.text}</p> : <><GripVertical size={13} className="grip"/><textarea aria-label="Card text" rows={Math.max(1, Math.ceil(card.text.length / 28))} value={card.text} onChange={e => set(cols.map(c => c.id === col.id ? { ...c, cards: c.cards.map(x => x.id === card.id ? { ...x, text: e.target.value } : x) } : c))}/><button aria-label="Delete card" onClick={() => set(cols.map(c => c.id === col.id ? { ...c, cards: c.cards.filter(x => x.id !== card.id) } : c))}><X size={12}/></button></>}</article>)}</div>
    {!readOnly && <form className="kanban-add" onSubmit={e => { e.preventDefault(); const text = (adding[col.id] || '').trim(); if (!text) return; setAdding(a => ({ ...a, [col.id]: '' })); set(cols.map(c => c.id === col.id ? { ...c, cards: [...c.cards, { id: uid(), text }] } : c)); }}><input aria-label={`Add a card to ${col.title}`} placeholder="+ Add a card" value={adding[col.id] || ''} onChange={e => setAdding(a => ({ ...a, [col.id]: e.target.value }))}/></form>}
  </section>)}{!readOnly && cols.length < 20 && <button className="kanban-new-col" onClick={() => set([...cols, { id: uid(), title: 'New column', cards: [] }])}><Plus size={15}/>Add column</button>}</div>;
}

export function ArtifactPreview({ artifact, project, still = false }) {
  const gone = missingPlugin(artifact, useInstalledPlugins());
  if (gone) return <MissingPlugin info={gone} compact/>;
  if (artifact.kind === 'plugin-board') return <PluginBoard artifact={artifact} project={project} compact={still}/>;
  if (artifact.kind === 'dashboard') return still ? <div className="plugin-board-tile"><LayoutDashboard size={24}/><span>{(artifact.data.tiles || []).length} charts</span></div> : <Dashboard data={artifact.data} project={project}/>;
  if (artifact.kind === 'database') return <Database data={artifact.data} readOnly compact onChange={() => {}}/>;
  if (artifact.kind === 'html') return still ? <div className="app-tile"><AppWindow size={26}/><span>Live app</span></div> : <LiveApp artifact={artifact} project={project}/>;
  if (artifact.kind === 'kanban') return linked(artifact.data) ? <LinkedKanban data={artifact.data} project={project}/> : <KanbanBoard data={artifact.data} readOnly onChange={() => {}}/>;
  return <Chart kind={artifact.kind} table={chartRows(artifact.data, project)} data={artifact.data} compact/>;
}

export function ArtifactEditor({ artifact, project, onSave, onClose, onDelete }) {
  if(artifact.kind==='html')return <AppStudio artifact={artifact} project={project} onClose={onClose} onDelete={onDelete}/>;
  return <BoardEditor artifact={artifact} project={project} onSave={onSave} onClose={onClose} onDelete={onDelete}/>;
}
// Several charts on one board. Each tile is a small board of its own: pick its type from the + menu, click it to set it up.
function Dashboard({ data, project, change }) {
  const tiles = data.tiles || [], kinds = useBoardKinds().filter(k => !['dashboard', 'database'].includes(k[0])), [adding, setAdding] = useState(false), [editing, setEditing] = useState(null);
  const set = next => change({ data: { ...data, tiles: next } }), patch = (id, p) => set(tiles.map(t => t.id === id ? { ...t, ...p } : t));
  const add = (kind, label) => { const { kind: k, title, data: d } = newArtifact(kind, label); const tile = { id: uid(), kind: k, title: title.replace(/^Untitled /, '').replace(/^./, c => c.toUpperCase()), data: d }; set([...tiles, tile]); setAdding(false); setEditing(tile.id); };
  const open = tiles.find(t => t.id === editing);
  return <div className="dashboard">
    <div className="dash-grid">
      {tiles.map(t => <section key={t.id} className={`dash-tile${t.wide ? ' wide' : ''}`}>
        <header>{change ? <input aria-label="Chart title" value={t.title} onChange={e => patch(t.id, { title: e.target.value })}/> : <strong>{t.title}</strong>}
          {change && <><IconButton icon={t.wide ? Minimize2 : Maximize2} label={t.wide ? 'Make narrower' : 'Make wider'} onClick={() => patch(t.id, { wide: !t.wide })}/><IconButton icon={Trash2} label="Remove chart" onClick={() => set(tiles.filter(x => x.id !== t.id))}/></>}</header>
        <button type="button" className="dash-body" disabled={!change} aria-label={`Edit ${t.title}`} onClick={() => setEditing(t.id)}><ArtifactPreview artifact={t} project={project} still={false}/></button>
      </section>)}
      {change && tiles.length < 12 && <div className="dash-add popover-anchor"><button type="button" aria-expanded={adding} onClick={() => setAdding(!adding)}><Plus size={20}/><span>Add a chart</span></button>
        {adding && <><div className="dash-scrim" onClick={() => setAdding(false)}/><div className="dash-menu" role="menu">{GROUPS.concat([['work', 'Boards']]).filter(([g]) => kinds.some(k => k[4] === g)).map(([g, label]) => <div key={g}><div className="dash-menu-label">{label}</div>{kinds.filter(k => k[4] === g).map(([kind, name, Icon]) => <button key={kind} role="menuitem" onClick={() => add(kind, name)}><Icon size={15}/>{name}</button>)}</div>)}</div></>}</div>}
    </div>
    {!tiles.length && !change && <p className="dash-empty">No charts yet.</p>}
    {open && change && createPortal(<Modal wide title={open.title} onClose={() => setEditing(null)}>{open.kind === 'plugin-board' ? <PluginBoard artifact={open} project={project} change={p => patch(open.id, p)}/> : open.kind === 'kanban' ? <KanbanEditor draft={open} project={project} change={p => patch(open.id, p)}/> : <ChartEditor draft={open} project={project} change={p => patch(open.id, p)}/>}</Modal>, document.body)}
  </div>;
}
function KanbanEditor({ draft, project, change }) {
  const data = draft.data, set = patch => change({ data: { ...data, ...patch } }), on = linked(data), table = chartRows(data, project), k = kanbanFromRows(table.rows, data.titleCol, data.groupCol);
  return <div className="kanban-editor">
    <div className="ce-section kanban-source"><h4>Cards from</h4>
      <SourcePicker data={data} project={project} set={set} table={table} plain ownLabel="Own cards"/>
      {on && k.header.length > 0 && <div className="ce-grid"><label className="ce-field"><span>Card title</span><select value={k.titleCol} onChange={e => set({ titleCol: Number(e.target.value) })}>{k.header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}</select></label><label className="ce-field"><span>Columns by</span><select value={k.groupCol} onChange={e => set({ groupCol: Number(e.target.value) })}>{k.header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}</select></label></div>}
    </div>
    {on ? <LinkedKanban data={data} project={project}/> : <KanbanBoard data={data} onChange={next => change({ data: next })}/>}
  </div>;
}
function BoardEditor({ artifact, project, onSave, onClose, onDelete }) {
  const { ask } = useContext(AppBridge), [reload, setReload] = useState(0), [view, setView] = useState(artifact.kind === 'html' && artifact.data.html === STARTER_APP ? 'source' : 'preview'), [draft, setDraft] = useState(artifact), [saving, setSaving] = useState(false), [problem, setProblem] = useState(''), [confirm, setConfirm] = useState(false), [sqlOpen,setSqlOpen]=useState(false);
  const databaseBase=useRef(artifact.data);
  const dirty = useRef(false), latest = useRef({ draft, onSave, artifact }); latest.current = { draft, onSave, artifact };
  // A live app saves its own data while it runs, so editing its code must never overwrite that data with a stale copy.
  const payload = () => { const { draft, artifact } = latest.current; return draft.kind === 'html' ? { ...draft, data: { ...draft.data, ...(artifact.data.state ? { state: artifact.data.state } : {}) } } : draft.kind==='database'?{...draft,_rwDatabaseBase:databaseBase.current}:draft; };
  const deleted = useRef(false);
  useEffect(()=>{if(!dirty.current){databaseBase.current=artifact.data;setDraft(artifact);}},[artifact]);
  const change = patch => { dirty.current = true; setDraft(d => ({ ...d, ...patch })); };
  useEffect(() => { if (!dirty.current) return; setSaving(true); const t = setTimeout(async () => { try { const sent=latest.current.draft;const next=await latest.current.onSave(payload());if(latest.current.draft===sent){dirty.current=false;const saved=next?.projects?.find(p=>p.id===project.id)?.artifacts?.find(a=>a.id===sent.id);if(saved)setDraft(saved);}setProblem(''); } catch (e) { setProblem(e.message); } finally { setSaving(false); } }, 500); return () => clearTimeout(t); }, [draft]);
  useEffect(() => () => { if (dirty.current && !deleted.current) latest.current.onSave(payload()).catch(() => {}); }, []);
  const Icon = kindIcon(draft.kind), gone = missingPlugin(draft, useInstalledPlugins());
  return <div className={`artifact-page ${draft.kind === 'html' ? 'app-editor' : ''}`}><div className="editor-toolbar"><button className="text-button" onClick={onClose}><ArrowLeft size={15}/>{draft.kind === 'html' ? 'Apps' : 'Boards'}</button><div><span className="save-status">{saving ? 'Saving…' : <><Check size={12}/>Saved locally</>}</span>{draft.kind === 'html' && <><IconButton icon={ExternalLink} label="Open app in new window" onClick={async()=>{try{if(dirty.current){await latest.current.onSave(payload());dirty.current=false;}await api.openAppWindow(project.id,artifact.id);}catch(e){setProblem(e.message);}}}/><button className="button secondary small-button" onClick={() => ask('Change the app "' + draft.title + '": ')}><Sparkles size={13}/>Ask AI to edit</button><IconButton icon={RefreshCw} label="Reload app" onClick={() => setReload(n => n + 1)}/><div className="segmented"><button className={view === 'preview' ? 'active' : ''} title="Preview" aria-label="Preview" onClick={() => setView('preview')}><Eye size={14}/></button><button className={view === 'source' ? 'active' : ''} title="Edit source" aria-label="Edit source" onClick={() => setView('source')}><Code2 size={14}/></button></div><IconButton icon={Download} label="Save as an HTML file" onClick={async () => { try { await api.exportArtifact(project.id, artifact.id); } catch (e) { setProblem(e.message); } }}/></>}<IconButton icon={Trash2} label="Delete this board" onClick={() => setConfirm(true)}/></div></div>
    {draft.kind !== 'html' && <div className="editor-meta"><span className="document-icon blue"><Icon size={22}/></span><input aria-label="Board title" className="document-title" value={draft.title} onChange={e => change({ title: e.target.value })}/><span className="document-byline">{kindName(draft.kind)}<i/>Created {date(artifact.createdAt)}</span></div>}
    {draft.kind === 'html' && view === 'source' && <input aria-label="App title" className="app-source-title" value={draft.title} onChange={e=>change({title:e.target.value})}/>}
    {problem && <p className="inline-error">{problem}</p>}
    {gone ? <MissingPlugin info={gone}/> : draft.kind === 'dashboard' ? <Dashboard data={draft.data} project={project} change={change}/> : draft.kind === 'plugin-board' ? <PluginBoard artifact={draft} project={project} change={change}/> : draft.kind === 'database' ? <><Database data={draft.data} artifactId={artifact.id} onChange={data => change({ data })}/>{sqlOpen && <DatabaseSql projectId={project.id} artifact={draft} onChange={data=>change({data})} beforeRun={async()=>{if(dirty.current){const sent=latest.current.draft;const next=await latest.current.onSave(payload());if(latest.current.draft===sent){dirty.current=false;const saved=next?.projects?.find(p=>p.id===project.id)?.artifacts?.find(a=>a.id===artifact.id);if(saved)setDraft(saved);}}}}/>}</> : draft.kind === 'html' ? (view === 'source' ? <textarea aria-label="Page source" className="csv-source html-source" value={draft.data.html} onChange={e => change({ data: { html: e.target.value } })}/> : <LiveApp key={reload} artifact={{ ...draft, data: { ...draft.data, state: artifact.data.state } }} project={project} className="full"/>) : draft.kind === 'kanban' ? <KanbanEditor draft={draft} project={project} change={change}/> : <ChartEditor draft={draft} project={project} change={change}/>}
    {confirm && <Modal title="Delete this board?" subtitle="It will also be removed from the canvas." onClose={() => setConfirm(false)}><div className="modal-footer"><button className="button secondary" onClick={() => setConfirm(false)}>Keep it</button><button className="button danger" onClick={() => { deleted.current = true; onDelete(artifact.id); }}>Delete</button></div></Modal>}
  </div>;
}

// The types of board you can add, for the canvas menu.
export function NewBoardItems({ onPick }) { return useBoardKinds().map(([kind, label, Icon]) => <button key={kind} onClick={() => onPick(kind, label)}><Icon size={14}/>{label}</button>); }

export function BoardsView({ project, onOpen, onCreate, onDelete }) {
  const ctx = useContextMenu(), kinds = useBoardKinds(), plugins = useInstalledPlugins(), [picking, setPicking] = useState(false), list = (project.artifacts || []).filter(a => !['html', 'database'].includes(a.kind) && !missingPlugin(a, plugins));
  return <div className="documents-page boards-page">{ctx.element}<div className="content-heading"><div><h2>Boards & charts</h2></div><button className="button primary" onClick={() => setPicking(true)}><Plus size={15}/>New</button></div>
    <div className="document-grid">{list.map(a => { const Icon = kindIcon(a.kind); return <button key={a.id} className="document-card" onClick={() => onOpen(a.id)} onContextMenu={e => ctx.open(e, [{ label: 'Open', icon: ArrowUpRight, onClick: () => onOpen(a.id) }, { label: 'Delete', icon: Trash2, danger: true, onClick: () => onDelete?.(a.id) }])}><div className="doc-card-top"><span className="document-icon blue"><Icon size={18}/></span><ArrowUpRight size={15}/></div><h3>{a.title}</h3><div className="artifact-mini"><ArtifactPreview artifact={a} project={project} still/></div><div className="doc-card-bottom"><span>{kindName(a.kind)}</span><time>{date(a.updatedAt)}</time></div></button>; })}</div>
    {!list.length && <Empty icon={Kanban} title="No boards yet" action={<button className="button secondary" onClick={() => setPicking(true)}>Create one</button>}>Kanban boards, charts and plots.</Empty>}
    {picking && createPortal(<Modal wide title="New board or chart" onClose={() => setPicking(false)}><div className="new-board-groups">{[['work', 'Boards'], ...GROUPS].filter(([group]) => kinds.some(k => k[4] === group && k[0] !== 'database')).map(([group, label]) => <section key={group}><h3>{label}</h3><div className="new-board-grid">{kinds.filter(k => k[4] === group && k[0] !== 'database').map(([kind, name, Icon, hint]) => <button key={kind} className="new-board-card" onClick={() => { setPicking(false); onCreate(kind, name); }}><span className="document-icon blue"><Icon size={18}/></span><strong>{name}</strong><small>{hint}</small></button>)}</div></section>)}</div></Modal>, document.body)}</div>;
}

export function AppsView({ project, onOpen, onCreate }) {
  const { ask } = useContext(AppBridge), [idea, setIdea] = useState('');
  const apps = (project.artifacts || []).filter(a => a.kind === 'html');
  return <div className="documents-page apps-page"><div className="content-heading"><div><h2>Apps</h2><p>A space for interactive pages you or your agents build: dashboards, maps, games, trackers, anything. They can read your project and keep their own data.</p></div><button className="button secondary" onClick={() => onCreate('app')}><Plus size={15}/>Blank app</button></div>
    <form className="app-prompt" onSubmit={e => { e.preventDefault(); const text = idea.trim(); if (!text) return; ask('Build this as a live app in the Apps tab: ' + text); setIdea(''); }}>
      <textarea aria-label="Describe the app you want" rows={3} placeholder="Describe what you want. For example: a D&D battle map that uses my map image, with draggable tokens and HP, or a dashboard of my KPIs, or a quiz game about this project." value={idea} onChange={e => setIdea(e.target.value)}/>
      <div><span className="field-help">This puts your request in the chat box, so you choose the agent and send it.</span><button className="button primary" disabled={!idea.trim()}><Sparkles size={14}/>Ask AI to build it</button></div></form>
    <div className="document-grid">{apps.map(a => <button key={a.id} className="document-card" onClick={() => onOpen(a.id)}><div className="doc-card-top"><AppLogo artifact={a} size={32}/><ArrowUpRight size={15}/></div><h3>{a.title}</h3><div className="artifact-mini"><ArtifactPreview artifact={a} project={project} still/></div><div className="doc-card-bottom"><span>App</span><time>{date(a.updatedAt)}</time></div></button>)}</div>
    {!apps.length && <Empty icon={AppWindow} title="No apps yet">Describe one above and ask an agent to build it, or start from a blank app and write it yourself.</Empty>}</div>;
}
