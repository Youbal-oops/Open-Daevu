import React, { useEffect, useRef } from 'react';
import { Plus, X, ListFilter } from 'lucide-react';
import { FILTER_OPS, columnKind, passingRows } from '../shared/workbook.mjs';
import { columnName } from '../shared/sheet.mjs';

const NO_VALUE = new Set(['empty', 'notEmpty']);
const label = (values, col) => String(values[0]?.[col] ?? '').trim() || `Column ${columnName(col)}`;

// Show only the rows that match rules, like a smart filter: the choices adapt to what a column holds.
export function FilterPanel({ values, filter, onChange, onClose }) {
  const ref = useRef(null), width = Math.max(1, ...values.map(r => r.length)), rules = filter?.rules || [];
  useEffect(() => {
    const away = e => { if (!ref.current?.contains(e.target) && !e.target.closest('.sheet-filter-button')) onClose(); }, key = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', away, true); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', key); };
  }, [onClose]);
  const set = patch => onChange({ on: true, match: 'all', rules, ...filter, ...patch });
  const edit = (index, patch) => set({ rules: rules.map((r, i) => i === index ? { ...r, ...patch } : r) });
  const add = () => { const col = Math.max(0, [...Array(width).keys()].find(c => values.slice(1).some(r => String(r[c] ?? '') !== '')) ?? 0), kind = columnKind(values, col); set({ rules: [...rules, { col, op: FILTER_OPS[kind][0][0], value: '' }] }); };
  const shown = passingRows(values, filter), total = Math.max(0, values.length - 1);
  return <div ref={ref} className="filter-panel" role="dialog" aria-label="Filter rows">
    <header><strong>Filter rows</strong>{rules.length > 0 && <label className="filter-switch"><input type="checkbox" checked={filter?.on !== false} onChange={e => set({ on: e.target.checked })}/>On</label>}<button type="button" className="icon-button" aria-label="Close filter" onClick={onClose}><X size={14}/></button></header>
    {rules.length > 1 && <div className="filter-match">Show rows that match <select aria-label="Match" value={filter?.match || 'all'} onChange={e => set({ match: e.target.value })}><option value="all">all</option><option value="any">any</option></select> of these rules</div>}
    <div className="filter-rules">
      {rules.map((rule, index) => {
        const kind = columnKind(values, rule.col), ops = FILTER_OPS[kind];
        const known = ops.some(([op]) => op === rule.op), shownOps = known ? ops : [...ops, [rule.op, rule.op]];
        return <div className="filter-rule" key={index}>
          <select aria-label="Column" value={rule.col} onChange={e => { const col = Number(e.target.value), next = FILTER_OPS[columnKind(values, col)]; edit(index, { col, op: next.some(([op]) => op === rule.op) ? rule.op : next[0][0] }); }}>{Array.from({ length: width }, (_, c) => <option key={c} value={c}>{label(values, c)}</option>)}</select>
          <select aria-label="Condition" value={rule.op} onChange={e => edit(index, { op: e.target.value })}>{shownOps.map(([op, text]) => <option key={op} value={op}>{text}</option>)}</select>
          {!NO_VALUE.has(rule.op) && <input aria-label="Value" type={kind === 'date' ? 'date' : 'text'} value={rule.value || ''} placeholder={kind === 'number' ? 'Number' : 'Value'} onChange={e => edit(index, { value: e.target.value })}/>}
          {rule.op === 'between' && <><span>and</span><input aria-label="Second value" type={kind === 'date' ? 'date' : 'text'} value={rule.value2 || ''} onChange={e => edit(index, { value2: e.target.value })}/></>}
          <button type="button" className="icon-button" aria-label="Remove rule" onClick={() => set({ rules: rules.filter((_, i) => i !== index) })}><X size={13}/></button>
        </div>;
      })}
      {!rules.length && <p className="filter-empty"><ListFilter size={18}/>No rules yet.</p>}
    </div>
    <footer><button type="button" className="button secondary small-button" onClick={add}><Plus size={13}/>Add a rule</button>{rules.length > 0 && <><span className="filter-count">{filter?.on === false ? 'Filter is off' : `Showing ${shown ? shown.length : total} of ${total} rows`}</span><button type="button" className="text-button" onClick={() => onChange(null)}>Clear</button></>}</footer>
  </div>;
}
