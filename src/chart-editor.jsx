import React, { useMemo } from 'react';
import { Table2, FileText, Rows3 } from 'lucide-react';
import { sourceOf, chartRows, tablesIn } from '../shared/chart-data.mjs';
import { workbookOf } from '../shared/workbook.mjs';
import { Chart, PALETTE } from './charts';

function Field({ label, children }) { return <label className="ce-field"><span>{label}</span>{children}</label>; }
function Check({ label, value, onChange }) { return <label className="ce-check"><input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)}/>{label}</label>; }
function Num({ label, value, onChange, placeholder = 'auto' }) { return <Field label={label}><input inputMode="decimal" value={value ?? ''} placeholder={placeholder} onChange={e => { const v = e.target.value; onChange(v === '' ? undefined : v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v); }}/></Field>; }

// Where the numbers come from: a table of its own, a spreadsheet (any sheet, any range), or a table in a document.
export function SourcePicker({ data, project, set, table, ownLabel = 'Table', plain = false }) {
  const source = sourceOf(data), sheets = project.notes.filter(n => n.kind === 'sheet'), docs = project.notes.filter(n => n.kind !== 'sheet' && tablesIn(n) > 0);
  const setSource = patch => set({ source: { ...source, ...patch } });
  const book = source.type === 'sheet' ? (() => { const n = sheets.find(s => s.id === source.sheetId); return n ? workbookOf(n) : []; })() : [];
  return <>
        <div className="ce-tabs" role="tablist" aria-label="Where the numbers come from">{[['own', ownLabel, Rows3], ['sheet', 'Spreadsheet', Table2], ['note', 'Document', FileText]].map(([type, label, Icon]) => <button key={type} role="tab" aria-selected={source.type === type} className={source.type === type ? 'on' : ''} onClick={() => setSource({ type })}><Icon size={13}/>{label}</button>)}</div>
        {source.type === 'own' && !plain && <><textarea aria-label="Chart data" className="csv-source" rows={9} spellCheck={false} value={data.csv || ''} onChange={e => set({ csv: e.target.value })}/><small className="ce-hint">First row names the columns, first column names the rows.</small></>}
        {source.type === 'sheet' && <>
          <Field label="Spreadsheet"><select aria-label="Spreadsheet" value={source.sheetId || ''} onChange={e => setSource({ sheetId: e.target.value, sheet: '' })}><option value="">Choose…</option>{sheets.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></Field>
          {book.length > 1 && <Field label="Sheet"><select aria-label="Sheet" value={source.sheet || book[0].name} onChange={e => setSource({ sheet: e.target.value })}>{book.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</select></Field>}
          <Field label="Range"><input aria-label="Range" placeholder="All, or A1:D20" value={source.range || ''} onChange={e => setSource({ range: e.target.value })}/></Field></>}
        {source.type === 'note' && <>
          <Field label="Document"><select aria-label="Document" value={source.noteId || ''} onChange={e => setSource({ noteId: e.target.value, table: 0 })}><option value="">Choose…</option>{docs.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></Field>
          {source.noteId && tablesIn(project.notes.find(n => n.id === source.noteId) || { content: '' }) > 1 && <Field label="Table"><select aria-label="Table" value={source.table || 0} onChange={e => setSource({ table: Number(e.target.value) })}>{Array.from({ length: tablesIn(project.notes.find(n => n.id === source.noteId)) }, (_, i) => <option key={i} value={i}>Table {i + 1}</option>)}</select></Field>}
          {!docs.length && <small className="ce-hint">No document has a table yet. Add one with /table.</small>}</>}
        {!plain && <Check label="Rows are series (swap rows and columns)" value={data.transpose} onChange={v => set({ transpose: v })}/>}
        {source.type !== 'own' && <small className="ce-hint">{table.error || `Using ${table.label}. Edit it there and this chart follows.`}</small>}
  </>;
}

export function ChartEditor({ draft, project, change }) {
  const data = draft.data, o = data.options || {}, table = useMemo(() => chartRows(data, project), [data, project.notes]);
  const set = patch => change({ data: { ...data, ...patch } }), setOptions = patch => set({ options: { ...o, ...patch } });
  return <div className="chart-editor">
    <div className="chart-side">
      <section className="ce-section"><h4><Table2 size={14}/>Data</h4>
        <SourcePicker data={data} project={project} set={set} table={table}/>
      </section>
      <section className="ce-section"><h4>Options</h4>
        <Field label="Title"><input value={o.title || ''} placeholder="No title" onChange={e => setOptions({ title: e.target.value })}/></Field>
        {['bar', 'line', 'area'].includes(draft.kind) && <div className="ce-grid"><Field label="x axis"><input value={o.xTitle || ''} onChange={e => setOptions({ xTitle: e.target.value })}/></Field><Field label="y axis"><input value={o.yTitle || ''} onChange={e => setOptions({ yTitle: e.target.value })}/></Field></div>}
        {draft.kind === 'bar' && <><Check label="Stack the series" value={o.stacked} onChange={v => setOptions({ stacked: v })}/><Check label="Horizontal bars" value={o.horizontal} onChange={v => setOptions({ horizontal: v })}/><Check label="Show values" value={o.values} onChange={v => setOptions({ values: v })}/></>}
        {(draft.kind === 'line' || draft.kind === 'area') && <><Check label="Smooth the lines" value={o.smooth} onChange={v => setOptions({ smooth: v })}/>{draft.kind === 'area' && <Check label="Stack the series" value={o.stacked} onChange={v => setOptions({ stacked: v })}/>}</>}
        {['bar', 'line'].includes(draft.kind) && <Check label="Logarithmic y axis" value={o.logY} onChange={v => setOptions({ logY: v })}/>}
        {draft.kind === 'pie' && <Check label="Donut" value={o.donut} onChange={v => setOptions({ donut: v })}/>}
      </section>
    </div>
    <div className="chart-stage"><Chart kind={draft.kind} table={table} data={data}/></div>
  </div>;
}
