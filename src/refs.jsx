import React, { useState } from 'react';
import { Copy, Trash2, Link2, Check } from 'lucide-react';
import { newRefId, listReferences } from '../shared/domain.mjs';
const RANGE = /^[A-Z]{1,3}[1-9]\d{0,4}(:[A-Z]{1,3}[1-9]\d{0,4})?$/;
import { Modal, IconButton } from './ui';

export const targetKey = t => JSON.stringify(Object.keys(t).sort().map(k => [k, t[k]]));
export function writeClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  return Promise.resolve(legacyCopy(text));
}
function legacyCopy(text) {
  const box = document.createElement('textarea'); box.value = text; box.style.position = 'fixed'; box.style.opacity = '0';
  document.body.appendChild(box); box.select(); try { document.execCommand('copy'); } finally { box.remove(); }
}
// Copies a reference to a value. The reference is created the first time it is copied and reused after that.
export async function copyRef({ project, act, target, setToast }) {
  const key = targetKey(target), existing = (project.refs || []).find(r => targetKey(r.target) === key);
  const entry = existing || { id: newRefId(), name: '', target }, token = `{{${entry.name || entry.id}}}`;
  await writeClipboard(token);
  if (!existing) await act({ type: 'ref', projectId: project.id, value: entry });
  setToast(`Copied ${token}${existing ? '' : '. Name it in References.'}`);
  return token;
}
const shown = v => v == null ? '—' : Array.isArray(v) ? `${v.length} values: ${v.slice(0, 4).join(', ')}${v.length > 4 ? '…' : ''}` : String(v);

export function ReferencesDialog({ project, act, onClose, setToast }) {
  const list = listReferences(project), [errors, setErrors] = useState({}), [names, setNames] = useState({});
  const sheets = project.notes.filter(n => n.kind === 'sheet'), [form, setForm] = useState({ noteId: '', range: '', name: '' }), [formError, setFormError] = useState('');
  async function addRange(e) {
    e.preventDefault(); setFormError('');
    const range = form.range.trim().toUpperCase(), noteId = form.noteId || sheets[0]?.id;
    if (!noteId || !RANGE.test(range)) { setFormError('Choose a spreadsheet and a cell or range such as B2 or B2:B20.'); return; }
    try { await act({ type: 'ref', projectId: project.id, value: { id: newRefId(), name: form.name.trim(), target: { type: 'cell', noteId, range } } }); setForm({ noteId, range: '', name: '' }); } catch (err) { setFormError(err.message); }
  }
  const copyToken = async r => { const token = `{{${r.name || r.id}}}`; await writeClipboard(token); setToast(`Copied ${token}`); };
  async function rename(r) {
    const name = (names[r.id] ?? r.name).trim();
    if (name === r.name) return;
    const entry = project.refs.find(x => x.id === r.id);
    try { await act({ type: 'ref', projectId: project.id, value: { ...entry, name } }); setErrors(e => ({ ...e, [r.id]: '' })); } catch (e) { setErrors(x => ({ ...x, [r.id]: e.message })); }
  }
  const kpis = project.kpis || [], unreferenced = kpis.filter(k => !(project.refs || []).some(r => r.target.type === 'kpi' && r.target.kpiId === k.id));
  return <Modal title="References" subtitle="Names for values you can use in KPI formulas, live values, live apps, and chat as {{name}}." onClose={onClose} wide>
    <p className="field-help ref-hint"><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd> on a spreadsheet cell, database cell or column, text block, or KPI copies its reference.</p>
    <div className="ref-list">{list.map(r => <div className="ref-row" key={r.id}>
      <div className="ref-main"><div className="ref-token"><code>{`{{${r.name || r.id}}}`}</code>{r.name && <small>{r.id}</small>}</div><small className="ref-label">{r.label || 'Missing target'}</small></div>
      <div className={`ref-value ${r.error ? 'bad' : ''}`} title={r.error || undefined}>{r.error || shown(r.value)}</div>
      <input aria-label={`Name for ${r.id}`} className="ref-name" placeholder="Give it a name" maxLength={40} value={names[r.id] ?? r.name} onChange={e => setNames(n => ({ ...n, [r.id]: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))} onBlur={() => rename(r)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/>
      <IconButton icon={Copy} label={`Copy ${r.name || r.id}`} onClick={() => copyToken(r)}/><IconButton icon={Trash2} label={`Delete ${r.name || r.id}`} onClick={() => act({ type: 'ref:delete', projectId: project.id, value: r.id })}/>
      {errors[r.id] && <p className="inline-error ref-error">{errors[r.id]}</p>}
    </div>)}{!list.length && <p className="contact-empty">No references yet. Select a cell or text block and press Ctrl+Shift+C.</p>}</div>
    {unreferenced.length > 0 && <><div className="contact-group">KPIS WITHOUT A REFERENCE · {unreferenced.length}</div><div className="ref-list">{unreferenced.map(k => <div className="ref-row" key={k.id}><div className="ref-main"><strong>{k.label}</strong></div><button className="button secondary small-button" onClick={() => copyRef({ project, act, target: { type: 'kpi', kpiId: k.id }, setToast })}><Link2 size={13}/>Create and copy</button></div>)}</div></>}
    {sheets.length > 0 && <form className="ref-add" onSubmit={addRange}><span>Add a range</span><select aria-label="Spreadsheet" value={form.noteId || sheets[0].id} onChange={e => setForm(f => ({ ...f, noteId: e.target.value }))}>{sheets.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select><input aria-label="Cell or range" placeholder="B2:B20" maxLength={13} value={form.range} onChange={e => setForm(f => ({ ...f, range: e.target.value }))}/><input aria-label="Reference name" placeholder="name (optional)" maxLength={40} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}/><button className="button secondary small-button">Add</button>{formError && <p className="inline-error">{formError}</p>}</form>}
    <div className="modal-footer"><button className="button primary" onClick={onClose}>Done<Check size={15}/></button></div>
  </Modal>;
}
