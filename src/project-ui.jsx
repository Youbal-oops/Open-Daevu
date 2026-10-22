import React, { useMemo, useRef, useState } from 'react';
import { Plus, ChevronDown, ChevronRight, Folder, FolderOpen, ArrowUpRight, FileText, CheckCircle2, X, Orbit, Trash2, Pencil, Link2, Archive, ArchiveRestore, Paperclip } from 'lucide-react';
import { useContextMenu, copyText } from './context-menu';
import { UnderwaterSketch } from './sketch';
import { projectPath, projectBranch, kpiValue, isArchived } from '../shared/domain.mjs';

const COVER_COLORS = { sage: '#7fb08e', sky: '#6aa6d8', sand: '#d2b46a', rose: '#e08b9c', slate: '#8493ab', violet: '#9b82dc' };

const cleanText = value => String(value || '').toLowerCase();
function Marked({ text, query }) {
  if (!query) return text;
  const at = cleanText(text).indexOf(query);
  return at < 0 ? text : <>{text.slice(0, at)}<mark>{text.slice(at, at + query.length)}</mark>{text.slice(at + query.length)}</>;
}

export function ProjectTree({ projects, selected, filter = '', onSelect, onNew, onEdit, onDelete, onDropItem, onMoveProject, onArchive, onOpenNote, onOpenFile }) {
  const [closed, setClosed] = useState(new Set()), [over, setOver] = useState(null), ctx = useContextMenu(), dragging = useRef(null);
  const [archiveOpen, setArchiveOpen] = useState(() => { try { return localStorage.getItem('rw-archive-open') === 'yes'; } catch { return false; } });
  const query = cleanText(filter).trim(), searching = Boolean(query);
  const shelved = projects.filter(p => isArchived(projects, p.id)), live = projects.filter(p => !isArchived(projects, p.id));
  const shelvedRoot = p => !p.parentId || !isArchived(projects, p.parentId);
  const accepts = e => e.dataTransfer.types.includes('application/x-rw-item') || e.dataTransfer.types.includes('application/x-rw-project');
  const toggleArchive = () => setArchiveOpen(v => { try { localStorage.setItem('rw-archive-open', v ? 'no' : 'yes'); } catch {} return !v; });

  // What matches the search: the project itself, or documents and uploaded files inside it. Parents of a match stay visible for context.
  const hits = useMemo(() => {
    if (!searching) return null;
    const own = new Map();
    for (const p of projects) {
      const named = cleanText(p.name).includes(query) || cleanText(p.description).includes(query);
      const notes = (p.notes || []).filter(n => cleanText(n.title).includes(query)), files = (p.files || []).filter(f => cleanText(f.name).includes(query));
      own.set(p.id, { named, startsWith: cleanText(p.name).startsWith(query), notes, files, any: named || notes.length > 0 || files.length > 0 });
    }
    const visible = new Set();
    for (const p of projects) if (own.get(p.id).any) for (const ancestor of projectPath(projects, p.id)) visible.add(ancestor.id);
    return { own, visible };
  }, [projects, query, searching]);

  const remove = p => ({ label: p.parentId ? 'Delete folder' : 'Delete project', icon: Trash2, danger: true, onClick: () => onDelete(p) });
  const menu = (e, p, archived) => ctx.open(e, archived ? [
    { label: 'Open', icon: ArrowUpRight, onClick: () => onSelect(p.id) },
    { label: 'Restore from archive', icon: ArchiveRestore, onClick: () => onArchive(p, false) },
    'separator', remove(p)
  ] : [
    { label: 'Open', icon: ArrowUpRight, onClick: () => onSelect(p.id) },
    ...(p.parentId ? [] : [{ label: 'New folder inside', icon: Plus, onClick: () => onNew(p) }]),
    { label: 'Edit details', icon: Pencil, onClick: () => onEdit(p) },
    { label: 'Copy link', icon: Link2, onClick: () => copyText(`rw://open?project=${p.id}`) },
    { label: 'Archive', icon: Archive, onClick: () => onArchive(p, true) },
    'separator', remove(p)
  ]);
  const zoneOf = e => { if (!dragging.current) return 'inside'; const box = e.currentTarget.getBoundingClientRect(), y = (e.clientY - box.top) / box.height; return y < .28 ? 'before' : y > .72 ? 'after' : 'inside'; };
  const blocked = p => dragging.current && (dragging.current.id === p.id || projectPath(projects, p.id).some(a => a.id === dragging.current.id));
  function drop(e, p) {
    e.preventDefault(); e.stopPropagation();
    const zone = zoneOf(e);
    setOver(null);
    const item = e.dataTransfer.getData('application/x-rw-item'), moved = e.dataTransfer.getData('application/x-rw-project');
    if (item) { onDropItem?.(JSON.parse(item), p, e.ctrlKey); return; }
    if (!moved || moved === p.id) return;
    // Folders hold no folders: dropping on a folder puts the dragged project beside it, and a project with folders stays at the top.
    const hasFolders = projects.some(x => x.parentId === moved), fits = parent => !parent || (!projects.find(x => x.id === parent)?.parentId && !hasFolders);
    if (zone === 'inside' && !p.parentId) { if (fits(p.id)) onMoveProject?.({ id: moved, parentId: p.id, beforeId: null }); return; }
    const parentId = p.parentId || null, siblings = live.filter(x => (x.parentId || null) === parentId && x.id !== moved), at = siblings.findIndex(x => x.id === p.id);
    if (!fits(parentId)) return;
    onMoveProject?.({ id: moved, parentId, beforeId: zone === 'before' ? p.id : siblings[at + 1]?.id || null });
  }
  const rank = p => { const h = hits.own.get(p.id); return h.startsWith ? 0 : h.named ? 1 : 2; };
  function branch(list, isRoot, depth = 0, parentId) {
    const archived = list === shelved;
    let rows = parentId === undefined ? list.filter(isRoot) : list.filter(c => c.parentId === parentId);
    if (searching) rows = rows.filter(p => hits.visible.has(p.id)).map((p, i) => [p, i]).sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]).map(x => x[0]);
    return rows.map(p => {
      const children = list.filter(c => c.parentId === p.id && (!searching || hits.visible.has(c.id))), expanded = searching || !closed.has(p.id), tint = COVER_COLORS[p.page?.cover];
      const found = searching ? hits.own.get(p.id) : null;
      const dragProps = archived || searching ? {} : {
        draggable: true,
        onDragStart: e => { dragging.current = { id: p.id }; e.dataTransfer.setData('application/x-rw-project', p.id); e.dataTransfer.effectAllowed = 'move'; },
        onDragEnd: () => { dragging.current = null; setOver(null); },
        onDragOver: e => { if (!accepts(e) || blocked(p)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; const zone = zoneOf(e); setOver(o => o?.id === p.id && o.zone === zone ? o : { id: p.id, zone }); },
        onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(v => v?.id === p.id ? null : v); },
        onDrop: e => drop(e, p)
      };
      return <React.Fragment key={p.id}><div className={`tree-row depth-${Math.min(depth, 1)} ${p.id === selected ? 'selected' : ''} ${archived ? 'archived' : ''} ${over?.id === p.id ? 'drop-' + over.zone : ''}`} style={{ paddingLeft: 8 + depth * 16 }} onContextMenu={e => menu(e, p, archived)} {...dragProps}>
        <button className="tree-disclosure" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${p.name}`} disabled={searching || !children.length} onClick={() => setClosed(previous => { const next = new Set(previous); if (expanded) next.add(p.id); else next.delete(p.id); return next; })}>{children.length && !searching ? expanded ? <ChevronDown size={13}/> : <ChevronRight size={13}/> : <span/>}</button>
        <button className="tree-select" onClick={() => onSelect(p.id)}>{p.page?.icon ? <span className="tree-emoji" aria-hidden="true">{p.page.icon}</span> : p.parentId ? <Folder size={15} style={tint ? { color: tint, fill: tint + '33' } : undefined}/> : <span className="project-monogram" style={tint ? { background: tint, color: '#121212' } : undefined}>{p.name.slice(0, 1).toUpperCase()}</span>}<span><Marked text={p.name} query={searching ? query : ''}/></span></button>{!searching && (p.notes?.length || 0) + (p.files?.length || 0) > 0 && <small className="tree-count">{(p.notes?.length || 0) + (p.files?.length || 0)}</small>}
        {!archived && !searching && !p.parentId && <button className="tree-add" title={`Add folder to ${p.name}`} aria-label={`Add folder to ${p.name}`} onClick={() => onNew(p)}><Plus size={13}/></button>}
      </div>
      {found && [...found.notes.slice(0, 6).map(n => <button key={n.id} className="tree-hit" style={{ paddingLeft: 36 + depth * 16 }} onClick={() => onOpenNote?.(p.id, n.id)}><FileText size={13}/><span><Marked text={n.title} query={query}/></span></button>), ...found.files.slice(0, 6).map(f => <button key={f.id} className="tree-hit" style={{ paddingLeft: 36 + depth * 16 }} onClick={() => onOpenFile?.(p.id, f.id)}><Paperclip size={13}/><span><Marked text={f.name} query={query}/></span></button>)]}
      {expanded && branch(list, isRoot, depth + 1, p.id)}</React.Fragment>;
    });
  }
  const liveHere = searching ? live.some(p => hits.visible.has(p.id)) : live.length > 0, shelvedHere = searching ? shelved.some(p => hits.visible.has(p.id)) : shelved.length > 0;
  return <nav className="project-tree" aria-label="Projects">{ctx.element}{branch(live, p => !p.parentId)}
    {searching && !liveHere && !shelvedHere && <p className="tree-empty">Nothing matches “{filter.trim()}”</p>}
    {!searching && !live.length && <p className="tree-empty">No projects yet</p>}
    {!searching && <div className={`tree-root-drop ${over?.id === '__root' ? 'over' : ''}`} aria-hidden="true"
      onDragOver={e => { if (!dragging.current) return; e.preventDefault(); setOver(o => o?.id === '__root' ? o : { id: '__root', zone: 'inside' }); }}
      onDragLeave={() => setOver(v => v?.id === '__root' ? null : v)}
      onDrop={e => { e.preventDefault(); setOver(null); const moved = e.dataTransfer.getData('application/x-rw-project'); if (moved) onMoveProject?.({ id: moved, parentId: null, beforeId: null }); }}/>}
    {shelvedHere && <div className="tree-archive"><button className="tree-archive-head" aria-expanded={searching || archiveOpen} onClick={toggleArchive}><Archive size={13}/><span>Archived</span><small>{shelved.filter(shelvedRoot).filter(p => !searching || hits.visible.has(p.id)).length}</small><ChevronDown size={12} style={{ transform: searching || archiveOpen ? undefined : 'rotate(-90deg)' }}/></button>{(searching || archiveOpen) && branch(shelved, shelvedRoot)}</div>}
  </nav>;
}
export function BlankWorkspace({ onProject, onAgent }) {
  return <main className="blank-workspace"><div className="blank-content"><div className="blank-mark"><Orbit size={30}/></div><div className="eyebrow">RESEARCH WORKSPACE</div><h1>A place to<br/><em>work things out.</em></h1><p>Bring a question. Build a team. Keep the findings that matter.</p><button className="button primary" onClick={onProject}><Plus size={17}/>Create your first project</button><div className="blank-divider"/><div className="onboarding-row"><span>01</span><div><h3>Organize the work</h3><p>Projects hold the bigger picture. Folders give each workstream its own space.</p></div><FolderOpen size={21}/></div><button className="onboarding-row actionable" onClick={onAgent}><span>02</span><div><h3>Add your specialists</h3><p>Create your own agent profiles with a provider, model, and role.</p></div><ArrowUpRight size={20}/></button><div className="onboarding-row"><span>03</span><div><h3>Keep what matters</h3><p>Conversations stay in chat. Important findings become notes and documents.</p></div><FileText size={21}/></div><div className="blank-footnote">Stored on your computer · No preset projects or profiles</div></div><div className="blank-side-label">YOUR RESEARCH, IN PROGRESS.</div></main>;
}
export function ProjectCrumbs({ projects, project, onSelect }) {
  const path = projectPath(projects, project.id).slice(0,-1);
  return path.length ? <div className="folder-crumbs">{path.map(p => <React.Fragment key={p.id}><button onClick={() => onSelect(p.id)}>{p.name}</button><ChevronRight size={12}/></React.Fragment>)}</div> : null;
}
function Counts({ records }) {
  const tasks = records.flatMap(p => p.tasks);
  return <div className="work-counts"><span><FileText size={13}/>{records.reduce((sum,p) => sum + p.notes.length,0)} documents</span><span><CheckCircle2 size={13}/>{tasks.filter(t => t.status === 'done').length}/{tasks.length} tasks</span></div>;
}
export function WorkOverview({ project, projects, agents, onOpen, onFolder, onKpi, onNote, onNew, onAgent, onStatus }) {
  const children = projects.filter(p => p.parentId === project.id), branch = projectBranch(projects, project.id), tasks = branch.flatMap(p => p.tasks), kpis = project.kpis || [];
  return <div className="overview-page work-overview"><div className="content-heading"><div><div className="eyebrow">AT A GLANCE</div><h2>{project.parentId ? 'Work overview' : 'Project overview'}</h2></div><select className={`work-status ${project.status || 'active'}`} aria-label="Work status" value={project.status || 'active'} onChange={e => onStatus(e.target.value)}><option value="planned">Planned</option><option value="active">In progress</option><option value="done">Complete</option></select></div>
    <div className="summary-strip"><div><strong>{children.length.toString().padStart(2,'0')}</strong><span>Work folders</span></div><div><strong>{branch.reduce((sum,p) => sum + p.notes.length,0).toString().padStart(2,'0')}</strong><span>Saved documents</span></div><div><strong>{tasks.filter(t => t.status === 'done').length}<small> / {tasks.length}</small></strong><span>Tasks completed</span></div></div>
    <section className="overview-section"><div className="section-heading"><h3>Key metrics<span>Optional</span></h3><button className="text-button" onClick={() => onKpi()}><Plus size={14}/>Add KPI</button></div>{kpis.length ? <div className="kpi-grid">{kpis.map(k => <button key={k.id} className="kpi-card" data-ref={JSON.stringify({ type: 'kpi', kpiId: k.id })} onClick={() => onKpi(k)}><span>{k.label}<ArrowUpRight size={14}/></span><strong>{kpiValue(project, k) || '—'}<small>{k.unit}</small></strong>{k.target && <p>Target: {k.target} {k.unit}</p>}</button>)}</div> : <div className="quiet-placeholder">Track the outcomes that matter to this work. Add metrics when you need them.</div>}</section>
    <section className="overview-section"><div className="section-heading"><h3>Work folders<span>{children.length}</span></h3><button className="text-button" onClick={onFolder}><Plus size={14}/>New folder</button></div><div className="work-folder-list">{children.map(p => <button className="work-folder-card" key={p.id} onClick={() => onOpen(p.id)}><div className="folder-card-title"><Folder size={20}/><h4>{p.name}</h4><span className={`work-status ${p.status || 'active'}`}>{p.status === 'done' ? 'Complete' : p.status === 'planned' ? 'Planned' : 'In progress'}</span><ArrowUpRight size={16}/></div>{p.description && <p>{p.description}</p>}<Counts records={projectBranch(projects,p.id)}/>{p.kpis?.length > 0 && <div className="folder-kpis">{p.kpis.slice(0,3).map(k => <span key={k.id}>{k.label}<strong>{kpiValue(p, k) || '—'} {k.unit}</strong></span>)}</div>}</button>)}</div>{!children.length && <button className="folder-empty" onClick={onFolder}><FolderOpen size={23}/><span><strong>Break the project into focused work</strong><small>Each folder has its own overview, chat, documents, and canvas.</small></span><Plus size={17}/></button>}</section>
    
    
    <UnderwaterSketch/>
  </div>;
}
export function KpiDialog({ kpi, project, onClose, onSave, onDelete, onCopyRef }) {
  const [draft,setDraft] = useState(kpi || { id: crypto.randomUUID(), label:'', value:'', target:'', unit:'', formula:'' }), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const change = (key,value) => setDraft(d => ({...d,[key]:value}));
  const refs = project.refs || [], formula = String(draft.formula || '').trim(), preview = formula ? kpiValue(project, draft) : '';
  return <div className="modal-backdrop" onMouseDown={e => { if(e.target === e.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={kpi ? 'Edit KPI' : 'Add KPI'} onKeyDown={e => { if(e.key === 'Escape') onClose(); }}><div className="modal-heading"><div><h2>{kpi ? 'Edit KPI' : 'Add KPI'}</h2><p>A metric for this project or work folder. Type a value, or let a formula work it out from the project.</p></div><button aria-label="Close dialog" className="icon-button" onClick={onClose}><X size={17}/></button></div><form onSubmit={async e => { e.preventDefault();setBusy(true);try { await onSave({...draft,label:draft.label.trim(),formula:formula}); }catch(e){setError(e.message);}finally{setBusy(false);} }}><label className="form-label">Metric name<input autoFocus required maxLength={120} value={draft.label} onChange={e => change('label',e.target.value)} placeholder="e.g. Organic visits"/></label>
    <label className="form-label">Formula (optional)<textarea aria-label="KPI formula" rows={2} maxLength={500} spellCheck={false} placeholder="=SUM({{costs}}) / {{leads}}" value={draft.formula || ''} onChange={e => change('formula',e.target.value)}/></label>
    <div className="kpi-formula-tools"><select aria-label="Insert a reference" value="" onChange={e => { if (e.target.value) change('formula', (draft.formula || '') + '{{' + e.target.value + '}}'); }}><option value="">Insert reference…</option>{refs.map(r => <option key={r.id} value={r.name || r.id}>{r.name || r.id}</option>)}</select>{formula && <span className={`kpi-preview ${/^#/.test(preview) ? 'bad' : ''}`}>Result <strong>{preview || '—'}</strong></span>}</div>
    <p className="field-help">Start with =. Use SUM, AVERAGE, MIN, MAX, COUNT, ROUND, ABS, IF with <code>{'{{references}}'}</code>. Copy a reference from a spreadsheet cell, database column, text block, or another KPI with Ctrl+Shift+C.</p>
    <div className="form-grid"><label>Current value{formula ? ' (formula is used instead)' : ''}<input maxLength={120} disabled={Boolean(formula)} value={draft.value} onChange={e => change('value',e.target.value)} placeholder="e.g. 2,400"/></label><label>Target (optional)<input maxLength={120} value={draft.target} onChange={e => change('target',e.target.value)} placeholder="e.g. 3,000"/></label></div><label className="form-label">Unit (optional)<input maxLength={40} value={draft.unit} onChange={e => change('unit',e.target.value)} placeholder="visits / month"/></label>{error && <p className="inline-error">{error}</p>}<div className="modal-footer">{kpi && <button type="button" className="button secondary" onClick={() => onCopyRef(kpi.id)}>Copy reference</button>}{kpi && <button type="button" className="button danger" disabled={busy} onClick={async () => {setBusy(true);try{await onDelete(kpi.id);}catch(e){setError(e.message);setBusy(false);}}}>Delete KPI</button>}<button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>Save KPI</button></div></form></section></div>;
}
