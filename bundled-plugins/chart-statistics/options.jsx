import React, { useMemo } from 'react';
import { columnsData } from './data.mjs';
import { FITS } from './stats.mjs';
import { Field, Check, Num, TitleField } from './form.jsx';

export const defaults = kind => ({ scatter: { options: { fit: 'linear' } }, histogram: { options: { curve: true } } }[kind] || { options: {} });

export function Options({ kind, data, table, change }) {
  const o = data.options || {}, set = patch => change({ options: { ...o, ...patch } });
  const columns = useMemo(() => kind === 'histogram' ? columnsData(table.rows).map(c => c.name) : [], [kind, table.rows]);
  return <section className="ce-section"><h4>Options</h4>
    <TitleField value={o.title} onChange={title => set({ title })}/>
    {['scatter', 'histogram', 'box'].includes(kind) && <div className="ce-grid"><Field label="x axis"><input value={o.xTitle || ''} onChange={e => set({ xTitle: e.target.value })}/></Field><Field label="y axis"><input value={o.yTitle || ''} onChange={e => set({ yTitle: e.target.value })}/></Field></div>}
    {kind === 'scatter' && <>
      <Check label="Size points by the third column" value={o.bubble} onChange={v => set({ bubble: v })}/>
      <Field label="Best-fit curve"><select value={o.fit || 'none'} onChange={e => set({ fit: e.target.value })}><option value="none">None</option>{Object.entries(FITS).map(([k, [name]]) => <option key={k} value={k}>{name}</option>)}</select></Field>
      <Check label="Logarithmic x axis" value={o.logX} onChange={v => set({ logX: v })}/><Check label="Logarithmic y axis" value={o.logY} onChange={v => set({ logY: v })}/></>}
    {kind === 'histogram' && <>
      <Field label="Column"><select value={o.column || columns[0] || ''} onChange={e => set({ column: e.target.value })}>{columns.map(n => <option key={n} value={n}>{n}</option>)}</select></Field>
      <Num label="Bars" value={o.bins} placeholder="auto" onChange={v => set({ bins: v })}/><Check label="Overlay a normal curve" value={o.curve} onChange={v => set({ curve: v })}/></>}
    {kind === 'box' && <Check label="Logarithmic y axis" value={o.logY} onChange={v => set({ logY: v })}/>}
    {kind === 'heatmap' && <><Check label="Show numbers" value={o.values !== false} onChange={v => set({ values: v })}/><Check label="Colour lows differently" value={o.diverge} onChange={v => set({ diverge: v })}/></>}
  </section>;
}
