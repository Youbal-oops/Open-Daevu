import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Kanban, BarChart3, LineChart, PieChart, X, ArrowUpRight, ExternalLink, Table2, GripVertical, ArrowLeft, Check, AppWindow, Download, Code2, Eye, Sparkles, RefreshCw, Database as DatabaseIcon } from 'lucide-react';
import { api } from './api';
import { LiveApp, AppBridge } from './liveapp';
import { STARTER_APP } from './app-templates';
import { csvParse } from '../shared/domain.mjs';
import { calculateSheet } from '../shared/sheet.mjs';
import { IconButton, Modal, Empty, uid, now, date } from './ui';
import { AppStudio } from './app-studio';
import {AppLogo} from './app-logo';
import { DatabaseSql } from './database-sql';
import { Database, newDatabase } from './database';

export const KINDS = [['kanban', 'Kanban board', Kanban, 'Columns and cards you drag between stages.'], ['bar', 'Bar chart', BarChart3, 'Compare values across categories.'], ['line', 'Line chart', LineChart, 'Show change over time.'], ['pie', 'Pie chart', PieChart, 'Show shares of a whole.'], ['database', 'Database', DatabaseIcon, 'Rows with table, board, and gallery views.']];
const HTML_KIND = ['html', 'Interactive page', AppWindow];
export const kindIcon = kind => (KINDS.find(k => k[0] === kind) || (kind === 'html' ? HTML_KIND : KINDS[0]))[2];
export const kindName = kind => (KINDS.find(k => k[0] === kind) || (kind === 'html' ? HTML_KIND : KINDS[0]))[1];
const PALETTE = ['var(--blue)', 'var(--green)', 'var(--orange)', 'var(--purple)', '#d98a9b', '#8fc7c2', '#c9b458'];
export function newArtifact(kind) {
  if (kind === 'database') return newDatabase();
  if (kind === 'app') return { id: uid(), kind: 'html', title: 'Untitled app', createdAt: now(), updatedAt: now(), data: { html: STARTER_APP, state: {} } };
  const base = { id: uid(), kind, createdAt: now(), updatedAt: now() };
  if (kind === 'kanban') return { ...base, title: 'Untitled board', data: { columns: ['To do', 'In progress', 'Done'].map(title => ({ id: uid(), title, cards: [] })) } };
  return { ...base, title: kind === 'pie' ? 'Untitled pie chart' : kind === 'line' ? 'Untitled line chart' : 'Untitled bar chart', data: { csv: 'Category,Value\nResearch,12\nDesign,8\nBuild,15\nLaunch,6', sheetId: '' } };
}
// Rows come from a project spreadsheet (with formulas calculated) or from the chart's own data.
export function chartTable(artifact, project) {
  try {
    const sheet = artifact.data.sheetId ? project.notes.find(n => n.id === artifact.data.sheetId && n.kind === 'sheet') : null;
    const rows = csvParse(sheet ? sheet.content : artifact.data.csv || ''), values = sheet ? calculateSheet(rows) : rows;
    const header = (values[0] || []).map(String), body = values.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
    const series = header.slice(1).map((name, i) => ({ name: name || `Series ${i + 1}`, values: body.map(r => { const n = parseFloat(String(r[i + 1] ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; }) })).filter((s, i) => body.some(r => String(r[i + 1] ?? '').trim() !== ''));
    return { labels: body.map(r => String(r[0] ?? '')), series, sheet };
  } catch (e) { return { labels: [], series: [], error: e.message }; }
}
const niceMax = v => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
const fmt = v => Math.abs(v) >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${+(v / 1e3).toFixed(1)}k` : String(+v.toFixed(2));
export function Chart({ kind, table, compact = false }) {
  const { labels, series } = table, W = 560, H = compact ? 260 : 340, pad = { l: 44, r: 16, t: 16, b: compact ? 34 : 46 };
  if (table.error) return <p className="inline-error">{table.error}</p>;
  if (!labels.length || !series.length) return <div className="chart-empty">Add a header row, labels in the first column, and numbers in the others.</div>;
  const legend = series.length > 1 && kind !== 'pie' && <div className="chart-legend">{series.map((s, i) => <span key={s.name}><i style={{ background: PALETTE[i % PALETTE.length] }}/>{s.name}</span>)}</div>;
  if (kind === 'pie') {
    const s = series[0], total = s.values.reduce((a, b) => a + Math.max(0, b), 0);
    if (!total) return <div className="chart-empty">Pie charts need positive numbers.</div>;
    let angle = -Math.PI / 2; const cx = 150, cy = 150, r = 120;
    return <div className="chart-wrap pie"><svg viewBox="0 0 300 300" role="img" aria-label={`${s.name} by ${labels.length} categories`}>{s.values.map((v, i) => { const frac = Math.max(0, v) / total; if (!frac) return null; const a0 = angle, a1 = angle + frac * Math.PI * 2; angle = a1; const large = a1 - a0 > Math.PI ? 1 : 0, p = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); const d = frac > 0.9999 ? `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0` : `M${cx},${cy}L${x0},${y0}A${r},${r} 0 ${large} 1 ${x1},${y1}Z`; return <path key={i} d={d} fill={PALETTE[i % PALETTE.length]} stroke="var(--card)" strokeWidth="2"><title>{`${labels[i]}: ${v} (${Math.round(frac * 100)}%)`}</title></path>; })}</svg><ul className="chart-legend vertical">{labels.map((l, i) => <li key={i}><i style={{ background: PALETTE[i % PALETTE.length] }}/>{l || '—'}<b>{fmt(s.values[i])}</b></li>)}</ul></div>;
  }
  const all = series.flatMap(s => s.values), max = niceMax(Math.max(...all, 0)), min = Math.min(0, ...all), lo = min < 0 ? -niceMax(-min) : 0, span = max - lo || 1;
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, y = v => pad.t + ih - ((v - lo) / span) * ih, band = iw / labels.length;
  const ticks = Array.from({ length: 5 }, (_, i) => lo + (span * i) / 4), skip = Math.ceil(labels.length / (compact ? 6 : 10));
  return <div className="chart-wrap"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${kind} chart with ${series.length} series`}>
    {ticks.map(t => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="chart-grid"/><text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="chart-axis">{fmt(t)}</text></g>)}
    {labels.map((l, i) => i % skip === 0 && <text key={i} x={pad.l + band * (i + .5)} y={H - pad.b + 15} textAnchor="middle" className="chart-axis">{l.length > 10 ? l.slice(0, 9) + '…' : l}</text>)}
    {kind === 'bar' && series.map((s, si) => s.values.map((v, i) => { const bw = Math.min(46, band * .72 / series.length), x = pad.l + band * i + (band - bw * series.length) / 2 + bw * si, y0 = y(Math.max(0, lo)); return <rect key={`${si}-${i}`} x={x} y={Math.min(y(v), y0)} width={bw - 1.5} height={Math.max(1, Math.abs(y(v) - y0))} rx="2" fill={PALETTE[si % PALETTE.length]}><title>{`${labels[i]} · ${s.name}: ${v}`}</title></rect>; }))}
    {kind === 'line' && series.map((s, si) => <g key={si}><polyline fill="none" stroke={PALETTE[si % PALETTE.length]} strokeWidth="2.2" strokeLinejoin="round" points={s.values.map((v, i) => `${pad.l + band * (i + .5)},${y(v)}`).join(' ')}/>{s.values.map((v, i) => <circle key={i} cx={pad.l + band * (i + .5)} cy={y(v)} r="3.4" fill={PALETTE[si % PALETTE.length]}><title>{`${labels[i]} · ${s.name}: ${v}`}</title></circle>)}</g>)}
  </svg>{legend}</div>;
}

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
  if (artifact.kind === 'database') return <Database data={artifact.data} readOnly compact onChange={() => {}}/>;
  if (artifact.kind === 'html') return still ? <div className="app-tile"><AppWindow size={26}/><span>Live app</span></div> : <LiveApp artifact={artifact} project={project}/>;
  if (artifact.kind === 'kanban') return <KanbanBoard data={artifact.data} readOnly onChange={() => {}}/>;
  return <Chart kind={artifact.kind} table={chartTable(artifact, project)} compact/>;
}

export function ArtifactEditor({ artifact, project, onSave, onClose, onDelete }) {
  if(artifact.kind==='html')return <AppStudio artifact={artifact} project={project} onClose={onClose} onDelete={onDelete}/>;
  return <BoardEditor artifact={artifact} project={project} onSave={onSave} onClose={onClose} onDelete={onDelete}/>;
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
  const Icon = kindIcon(draft.kind), sheets = project.notes.filter(n => n.kind === 'sheet');
  const table = useMemo(() => ['kanban', 'html', 'database'].includes(draft.kind) ? null : chartTable(draft, project), [draft, project.notes]);
  return <div className={`artifact-page ${draft.kind === 'html' ? 'app-editor' : ''}`}><div className="editor-toolbar"><button className="text-button" onClick={onClose}><ArrowLeft size={15}/>{draft.kind === 'html' ? 'Apps' : 'Boards'}</button><div><span className="save-status">{saving ? 'Saving…' : <><Check size={12}/>Saved locally</>}</span>{draft.kind === 'html' && <><IconButton icon={ExternalLink} label="Open app in new window" onClick={async()=>{try{if(dirty.current){await latest.current.onSave(payload());dirty.current=false;}await api.openAppWindow(project.id,artifact.id);}catch(e){setProblem(e.message);}}}/><button className="button secondary small-button" onClick={() => ask('Change the app "' + draft.title + '": ')}><Sparkles size={13}/>Ask AI to edit</button><IconButton icon={RefreshCw} label="Reload app" onClick={() => setReload(n => n + 1)}/><div className="segmented"><button className={view === 'preview' ? 'active' : ''} title="Preview" aria-label="Preview" onClick={() => setView('preview')}><Eye size={14}/></button><button className={view === 'source' ? 'active' : ''} title="Edit source" aria-label="Edit source" onClick={() => setView('source')}><Code2 size={14}/></button></div><IconButton icon={Download} label="Save as an HTML file" onClick={async () => { try { await api.exportArtifact(project.id, artifact.id); } catch (e) { setProblem(e.message); } }}/></>}<IconButton icon={Trash2} label="Delete this board" onClick={() => setConfirm(true)}/></div></div>
    {draft.kind !== 'html' && <div className="editor-meta"><span className="document-icon blue"><Icon size={22}/></span><input aria-label="Board title" className="document-title" value={draft.title} onChange={e => change({ title: e.target.value })}/><span className="document-byline">{kindName(draft.kind)}<i/>Created {date(artifact.createdAt)}</span></div>}
    {draft.kind === 'html' && view === 'source' && <input aria-label="App title" className="app-source-title" value={draft.title} onChange={e=>change({title:e.target.value})}/>}
    {problem && <p className="inline-error">{problem}</p>}
    {draft.kind === 'database' ? <><Database data={draft.data} artifactId={artifact.id} onChange={data => change({ data })}/>{sqlOpen && <DatabaseSql projectId={project.id} artifact={draft} onChange={data=>change({data})} beforeRun={async()=>{if(dirty.current){const sent=latest.current.draft;const next=await latest.current.onSave(payload());if(latest.current.draft===sent){dirty.current=false;const saved=next?.projects?.find(p=>p.id===project.id)?.artifacts?.find(a=>a.id===artifact.id);if(saved)setDraft(saved);}}}}/>}</> : draft.kind === 'html' ? (view === 'source' ? <textarea aria-label="Page source" className="csv-source html-source" value={draft.data.html} onChange={e => change({ data: { html: e.target.value } })}/> : <LiveApp key={reload} artifact={{ ...draft, data: { ...draft.data, state: artifact.data.state } }} project={project} className="full"/>) : draft.kind === 'kanban' ? <KanbanBoard data={draft.data} onChange={data => change({ data })}/> : <div className="chart-editor"><div className="chart-data"><label className="form-label">Data source<select aria-label="Chart data source" value={draft.data.sheetId || ''} onChange={e => change({ data: { ...draft.data, sheetId: e.target.value } })}><option value="">This chart’s own data</option>{sheets.map(s => <option key={s.id} value={s.id}>Spreadsheet: {s.title}</option>)}</select></label>{draft.data.sheetId ? <p className="field-help"><Table2 size={13}/> Using “{table.sheet?.title || 'a spreadsheet'}”. The first column is the label; other columns become series. Edit the spreadsheet to change this chart.</p> : <><label className="form-label">Data (CSV)<textarea aria-label="Chart data" className="csv-source" rows={10} value={draft.data.csv} onChange={e => change({ data: { ...draft.data, csv: e.target.value } })}/></label><p className="field-help">First row = series names. First column = labels.</p></>}<div className="segmented kind-switch">{KINDS.filter(k => !['kanban', 'database'].includes(k[0])).map(([k, label, I]) => <button key={k} className={draft.kind === k ? 'active' : ''} title={label} aria-label={label} onClick={() => change({ kind: k })}><I size={15}/></button>)}</div></div><div className="chart-stage"><Chart kind={draft.kind} table={table}/></div></div>}
    {confirm && <Modal title="Delete this board?" subtitle="It will also be removed from the canvas." onClose={() => setConfirm(false)}><div className="modal-footer"><button className="button secondary" onClick={() => setConfirm(false)}>Keep it</button><button className="button danger" onClick={() => { deleted.current = true; onDelete(artifact.id); }}>Delete</button></div></Modal>}
  </div>;
}

export function BoardsView({ project, onOpen, onCreate }) {
  const list = (project.artifacts || []).filter(a => !['html','database'].includes(a.kind));
  return <div className="documents-page boards-page"><div className="content-heading"><div><h2>Boards & charts</h2><p>Kanban boards, charts, and databases. Open one in its own tab or place it on the canvas. Apps have their own tab.</p></div></div>
    <div className="new-board-grid">{KINDS.filter(k=>k[0]!='database').map(([kind, label, Icon, hint]) => <button key={kind} className="new-board-card" onClick={() => onCreate(kind)}><span className="document-icon blue"><Icon size={18}/></span><strong>{label}</strong><small>{hint}</small><Plus size={14}/></button>)}</div>
    <div className="document-grid">{list.map(a => { const Icon = kindIcon(a.kind); return <button key={a.id} className="document-card" onClick={() => onOpen(a.id)}><div className="doc-card-top"><span className="document-icon blue"><Icon size={18}/></span><ArrowUpRight size={15}/></div><h3>{a.title}</h3><div className="artifact-mini"><ArtifactPreview artifact={a} project={project} still/></div><div className="doc-card-bottom"><span>{kindName(a.kind)}</span><time>{date(a.updatedAt)}</time></div></button>; })}</div>
    {!list.length && <Empty icon={Kanban} title="No boards yet">Pick a type above to create your first kanban board or chart.</Empty>}</div>;
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
