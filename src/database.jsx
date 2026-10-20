import React, { useMemo, useState } from 'react';
import { Plus, Table2, Columns3, LayoutGrid, Trash2, X, Search, Type, Hash, ListFilter, CalendarDays, CheckSquare, AlignLeft } from 'lucide-react';
import { uid, now } from './ui';

export const PROP_TYPES = [['title', 'Title', Type], ['text', 'Text', AlignLeft], ['number', 'Number', Hash], ['select', 'Select', ListFilter], ['date', 'Date', CalendarDays], ['checkbox', 'Checkbox', CheckSquare]];
const VIEW_TYPES = [['table', 'Table', Table2], ['board', 'Board', Columns3], ['gallery', 'Gallery', LayoutGrid]];
const propIcon = type => (PROP_TYPES.find(p => p[0] === type) || PROP_TYPES[1])[2];
export function newDatabase() {
  const name = uid(), status = uid();
  return { id: uid(), kind: 'database', title: 'Untitled database', createdAt: now(), updatedAt: now(), data: { properties: [{ id: name, name: 'Name', type: 'title' }, { id: status, name: 'Status', type: 'select', options: ['Not started', 'In progress', 'Done'] }, { id: uid(), name: 'Date', type: 'date' }, { id: uid(), name: 'Notes', type: 'text' }], rows: [], views: [{ id: uid(), type: 'table' }, { id: uid(), type: 'board', groupBy: status }] } };
}
const titleProp = db => db.properties.find(p => p.type === 'title');
const show = (prop, value) => prop.type === 'checkbox' ? (value ? '✓' : '') : String(value ?? '');

function PropertyMenu({ prop, canDelete, onChange, onDelete, onClose }) {
  const [option, setOption] = useState('');
  return <div className="db-popover" role="dialog" aria-label={`Edit property ${prop.name}`}>
    <input aria-label="Property name" autoFocus value={prop.name} onChange={e => onChange({ name: e.target.value })}/>
    {prop.type !== 'title' && <label className="db-field">Type<select aria-label="Property type" value={prop.type} onChange={e => onChange({ type: e.target.value, ...(e.target.value === 'select' ? { options: prop.options || [] } : {}) })}>{PROP_TYPES.filter(p => p[0] !== 'title').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
    {prop.type === 'select' && <div className="db-options"><div className="db-field">Options</div>{(prop.options || []).map(o => <span className="db-option" key={o}>{o}<button aria-label={`Remove option ${o}`} onClick={() => onChange({ options: prop.options.filter(x => x !== o) })}><X size={11}/></button></span>)}<form onSubmit={e => { e.preventDefault(); const v = option.trim(); if (v && !(prop.options || []).includes(v)) onChange({ options: [...(prop.options || []), v] }); setOption(''); }}><input aria-label="New option" placeholder="Add an option…" value={option} onChange={e => setOption(e.target.value)}/></form></div>}
    <div className="db-popover-foot">{canDelete && <button className="text-button danger-text" onClick={onDelete}><Trash2 size={13}/>Delete property</button>}<button className="text-button" onClick={onClose}>Done</button></div>
  </div>;
}
function CellEditor({ prop, value, onChange, readOnly }) {
  if (readOnly) return <span className={`db-static ${prop.type}`}>{show(prop, value)}</span>;
  if (prop.type === 'checkbox') return <input type="checkbox" aria-label={prop.name} checked={Boolean(value)} onChange={e => onChange(e.target.checked)}/>;
  if (prop.type === 'select') return <select aria-label={prop.name} className={value ? 'has-value' : ''} value={value || ''} onChange={e => onChange(e.target.value)}><option value="">—</option>{(prop.options || []).map(o => <option key={o} value={o}>{o}</option>)}</select>;
  if (prop.type === 'date') return <input type="date" aria-label={prop.name} value={value || ''} onChange={e => onChange(e.target.value)}/>;
  if (prop.type === 'number') return <input type="number" aria-label={prop.name} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}/>;
  return <input aria-label={prop.name} className={prop.type === 'title' ? 'db-title-input' : ''} value={value || ''} placeholder={prop.type === 'title' ? 'Untitled' : ''} onChange={e => onChange(e.target.value)}/>;
}

export function Database({ data, onChange, artifactId, readOnly = false, compact = false }) {
  const [viewId, setViewId] = useState(data.views[0]?.id), [query, setQuery] = useState(''), [menu, setMenu] = useState(null), [drag, setDrag] = useState(null), [over, setOver] = useState(null), [adding, setAdding] = useState({});
  const view = data.views.find(v => v.id === viewId) || data.views[0], title = titleProp(data);
  const selects = data.properties.filter(p => p.type === 'select');
  const group = data.properties.find(p => p.id === view.groupBy && p.type === 'select') || selects[0];
  const rows = useMemo(() => data.rows.filter(r => !query || Object.values(r.cells).some(v => String(v).toLowerCase().includes(query.toLowerCase()))), [data.rows, query]);
  const set = patch => onChange({ ...data, ...patch });
  const setCell = (rowId, propId, value) => set({ rows: data.rows.map(r => r.id === rowId ? { ...r, cells: { ...r.cells, [propId]: value } } : r) });
  const addRow = cells => { const row = { id: uid(), cells: { ...cells } }; set({ rows: [...data.rows, row] }); return row; };
  const setProp = (id, patch) => set({ properties: data.properties.map(p => p.id === id ? { ...p, ...patch } : p) });
  const delProp = id => { set({ properties: data.properties.filter(p => p.id !== id), rows: data.rows.map(r => { const cells = { ...r.cells }; delete cells[id]; return { ...r, cells }; }), views: data.views.map(v => v.groupBy === id ? { ...v, groupBy: undefined } : v) }); setMenu(null); };
  const addProp = type => set({ properties: [...data.properties, { id: uid(), name: PROP_TYPES.find(p => p[0] === type)[1], type, ...(type === 'select' ? { options: [] } : {}) }] });
  const addView = type => { const v = { id: uid(), type, ...(type === 'board' && selects[0] ? { groupBy: selects[0].id } : {}) }; set({ views: [...data.views, v] }); setViewId(v.id); };
  const delView = id => { if (data.views.length < 2) return; const next = data.views.filter(v => v.id !== id); set({ views: next }); if (viewId === id) setViewId(next[0].id); };
  const others = data.properties.filter(p => p.type !== 'title');
  const card = row => <article key={row.id} className={`db-card ${drag === row.id ? 'dragging' : ''}`} draggable={!readOnly && view.type === 'board'} onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDrag(row.id); }} onDragEnd={() => { setDrag(null); setOver(null); }}>
    <strong>{readOnly ? (row.cells[title.id] || 'Untitled') : <CellEditor prop={title} value={row.cells[title.id]} onChange={v => setCell(row.id, title.id, v)}/>}</strong>
    <div className="db-card-props">{others.filter(p => p.id !== group?.id || view.type !== 'board').filter(p => row.cells[p.id] !== undefined && row.cells[p.id] !== '' && row.cells[p.id] !== false).map(p => <span key={p.id} className={`db-chip ${p.type}`}>{show(p, row.cells[p.id])}</span>)}</div>
    {!readOnly && <button className="db-card-delete" aria-label="Delete row" onClick={() => set({ rows: data.rows.filter(r => r.id !== row.id) })}><X size={12}/></button>}
  </article>;
  return <div className={`database ${compact ? 'compact' : ''}`}>
    {!compact && <div className="db-toolbar"><div className="db-views" role="tablist" aria-label="Views">{data.views.map(v => { const Icon = VIEW_TYPES.find(t => t[0] === v.type)[2]; return <span key={v.id} className={`db-view-tab ${v.id === view.id ? 'active' : ''}`}><button role="tab" aria-selected={v.id === view.id} onClick={() => setViewId(v.id)}><Icon size={14}/>{VIEW_TYPES.find(t => t[0] === v.type)[1]}</button>{!readOnly && data.views.length > 1 && v.id === view.id && <button className="db-view-x" aria-label={`Remove ${v.type} view`} onClick={() => delView(v.id)}><X size={11}/></button>}</span>; })}{!readOnly && <div className="db-add-view"><button aria-label="Add a view" onClick={() => setMenu(menu === 'views' ? null : 'views')}><Plus size={14}/></button>{menu === 'views' && <div className="db-popover small">{VIEW_TYPES.map(([t, l, I]) => <button key={t} onClick={() => { addView(t); setMenu(null); }}><I size={14}/>{l}</button>)}</div>}</div>}</div>
      <div className="db-tools">{view.type === 'board' && selects.length > 0 && <label className="db-group">Group by<select aria-label="Group by" value={group?.id || ''} onChange={e => set({ views: data.views.map(v => v.id === view.id ? { ...v, groupBy: e.target.value } : v) })}>{selects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}<label className="db-search"><Search size={13}/><input aria-label="Search rows" placeholder="Search" value={query} onChange={e => setQuery(e.target.value)}/></label>{!readOnly && <button className="button primary small-button" onClick={() => addRow(view.type === 'board' && group ? { [group.id]: group.options?.[0] || '' } : {})}><Plus size={13}/>New</button>}</div></div>}
    {view.type === 'table' && <div className="db-table-wrap"><table className="db-table"><thead><tr>{data.properties.map(p => { const Icon = propIcon(p.type); return <th key={p.id} data-ref={artifactId ? JSON.stringify({ type: 'dbcol', artifactId, propId: p.id }) : undefined}><button disabled={readOnly} className="db-th" onClick={() => setMenu(menu === p.id ? null : p.id)}><Icon size={13}/>{p.name}</button>{menu === p.id && <PropertyMenu prop={p} canDelete={p.type !== 'title'} onChange={patch => setProp(p.id, patch)} onDelete={() => delProp(p.id)} onClose={() => setMenu(null)}/>}</th>; })}{!readOnly && <th className="db-th-add"><div className="db-add-view"><button aria-label="Add a property" onClick={() => setMenu(menu === 'props' ? null : 'props')}><Plus size={14}/></button>{menu === 'props' && <div className="db-popover small right">{PROP_TYPES.filter(p => p[0] !== 'title').map(([t, l, I]) => <button key={t} onClick={() => { addProp(t); setMenu(null); }}><I size={14}/>{l}</button>)}</div>}</div></th>}</tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}>{data.properties.map(p => <td key={p.id} data-ref={artifactId ? JSON.stringify({ type: 'dbcell', artifactId, rowId: r.id, propId: p.id }) : undefined} className={p.type}><CellEditor prop={p} value={r.cells[p.id]} readOnly={readOnly} onChange={v => setCell(r.id, p.id, v)}/></td>)}{!readOnly && <td className="db-row-end"><button aria-label="Delete row" onClick={() => set({ rows: data.rows.filter(x => x.id !== r.id) })}><X size={12}/></button></td>}</tr>)}</tbody></table>
      {!readOnly && <button className="db-new-row" onClick={() => addRow({})}><Plus size={14}/>New</button>}{!rows.length && <p className="db-empty">{query ? 'No rows match your search.' : 'No rows yet.'}</p>}</div>}
    {view.type === 'board' && (group ? <div className="db-board">{[...(group.options || []), ''].map(option => { const col = rows.filter(r => (r.cells[group.id] || '') === option); if (!option && !col.length && !(group.options || []).length === false && readOnly) return null; return <section key={option || 'none'} className={`db-col ${over === option ? 'over' : ''}`} onDragOver={e => { if (drag) { e.preventDefault(); setOver(option); } }} onDrop={e => { e.preventDefault(); if (drag) setCell(drag, group.id, option); setDrag(null); setOver(null); }}><header><span className={`db-chip select ${option ? '' : 'none'}`}>{option || 'No value'}</span><small>{col.length}</small></header><div className="db-cards">{col.map(card)}</div>{!readOnly && <form onSubmit={e => { e.preventDefault(); const text = (adding[option] || '').trim(); if (!text) return; setAdding(a => ({ ...a, [option]: '' })); addRow({ [title.id]: text, [group.id]: option }); }}><input aria-label={`New card in ${option || 'No value'}`} placeholder="+ New" value={adding[option] || ''} onChange={e => setAdding(a => ({ ...a, [option]: e.target.value }))}/></form>}</section>; })}</div> : <p className="db-empty">Add a Select property to group this board.</p>)}
    {view.type === 'gallery' && <div className="db-gallery">{rows.map(card)}{!readOnly && <button className="db-gallery-new" onClick={() => addRow({})}><Plus size={16}/>New</button>}{!rows.length && readOnly && <p className="db-empty">No rows yet.</p>}</div>}
  </div>;
}
