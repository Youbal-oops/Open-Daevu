import React from 'react';
import { Field, Num, TitleField } from './form.jsx';

export const defaults = kind => ({ gauge: { options: { min: 0, max: 100, target: 80 } } }[kind] || { options: {} });

export function Options({ kind, data, change }) {
  const o = data.options || {}, set = patch => change({ options: { ...o, ...patch } });
  return <section className="ce-section"><h4>Options</h4>
    <TitleField value={o.title} onChange={title => set({ title })}/>
    {kind === 'waterfall' && <div className="ce-grid"><Field label="x axis"><input value={o.xTitle || ''} onChange={e => set({ xTitle: e.target.value })}/></Field><Field label="y axis"><input value={o.yTitle || ''} onChange={e => set({ yTitle: e.target.value })}/></Field></div>}
    {kind === 'gauge' && <div className="ce-grid"><Num label="Minimum" value={o.min} placeholder="0" onChange={v => set({ min: v })}/><Num label="Maximum" value={o.max} placeholder="100" onChange={v => set({ max: v })}/><Num label="Target" value={o.target} placeholder="none" onChange={v => set({ target: v })}/></div>}
  </section>;
}
