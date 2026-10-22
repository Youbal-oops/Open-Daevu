import React, { useEffect, useMemo } from 'react';
import { compileExpr } from './mathexpr.mjs';
import { PALETTE } from './common.jsx';
import { Field, Check, Num, TitleField, uid } from './form.jsx';

const EXAMPLES = [
  ['Sine wave', [{ mode: 'cartesian', expr: 'a*sin(b*x)' }], { xmin: -10, xmax: 10 }],
  ['Normal curve', [{ mode: 'cartesian', expr: 'exp(-(x-m)^2/(2*s^2))/(s*sqrt(2*pi))' }], { xmin: -6, xmax: 6 }, [['m', 0, -3, 3], ['s', 1, .3, 3]]],
  ['Damped oscillation', [{ mode: 'cartesian', expr: 'exp(-k*x)*cos(w*x)' }, { mode: 'cartesian', expr: 'exp(-k*x)' }, { mode: 'cartesian', expr: '-exp(-k*x)' }], { xmin: 0, xmax: 20 }, [['k', .15, 0, 1], ['w', 2, .5, 6]]],
  ['Projectile', [{ mode: 'parametric', expr: 'v*cos(a)*t', expr2: 'v*sin(a)*t - 4.9*t^2' }], { tmin: 0, tmax: 6 }, [['v', 25, 5, 50], ['a', .8, .1, 1.5]]],
  ['Lissajous curve', [{ mode: 'parametric', expr: 'sin(a*t)', expr2: 'sin(b*t)' }], { tmin: 0, tmax: 6.2832 }, [['a', 3, 1, 8], ['b', 2, 1, 8]]],
  ['Rose (polar)', [{ mode: 'polar', expr: 'cos(k*theta)' }], { tmin: 0, tmax: 6.2832 }, [['k', 5, 1, 9]]],
  ['Logistic growth', [{ mode: 'cartesian', expr: 'K/(1+((K-p0)/p0)*exp(-r*x))' }], { xmin: 0, xmax: 20 }, [['K', 100, 10, 200], ['p0', 5, 1, 50], ['r', .6, .1, 2]]],
  ['Compound interest', [{ mode: 'cartesian', expr: 'P*(1+r)^x' }], { xmin: 0, xmax: 30 }, [['P', 1000, 100, 5000], ['r', .06, .01, .15]]]
];
export const defaults = () => ({ functions: [{ id: 'f1', mode: 'cartesian', expr: 'a*sin(x)', show: true }, { id: 'f2', mode: 'cartesian', expr: 'a*cos(x)', show: true }], params: [{ name: 'a', value: 1, min: -3, max: 3 }], view: { xmin: -10, xmax: 10 }, options: { roots: true } });

// Every name used in an expression that is not x, t or theta is a constant you can slide.
const detectNames = functions => { const names = new Set(); for (const f of functions || []) for (const src of [f.expr, f.expr2]) { if (!src || !String(src).trim()) continue; try { compileExpr(src).names.forEach(n => names.add(n)); } catch {} } ['x', 't', 'theta'].forEach(n => names.delete(n)); return [...names]; };

export function Options({ data, change }) {
  const o = data.options || {}, functions = data.functions || [], params = data.params || [], view = data.view || {}, names = useMemo(() => detectNames(functions), [functions]);
  const set = patch => change(patch), setOptions = patch => change({ options: { ...o, ...patch } }), setFn = (id, patch) => change({ functions: functions.map(f => f.id === id ? { ...f, ...patch } : f) });
  useEffect(() => {
    const have = new Map(params.map(p => [p.name, p])), next = names.map(n => have.get(n) || { name: n, value: 1, min: -5, max: 5 });
    if (next.length !== params.length || next.some((p, i) => p !== params[i])) change({ params: next });
  }, [names.join(',')]);
  const loadExample = i => { const [, fns, v, ps = []] = EXAMPLES[i]; change({ functions: fns.map(f => ({ id: uid(), show: true, ...f })), view: v, params: ps.map(([name, value, min, max]) => ({ name, value, min, max })) }); };
  const setParam = (name, patch) => change({ params: params.map(q => q.name === name ? { ...q, ...patch } : q) });
  return <>
    <section className="ce-section"><h4>Functions</h4>
      <select className="ce-example" aria-label="Start from an example" value="" onChange={e => e.target.value !== '' && loadExample(Number(e.target.value))}><option value="">Start from an example…</option>{EXAMPLES.map((e, i) => <option key={e[0]} value={i}>{e[0]}</option>)}</select>
      {functions.map((f, i) => { const mode = f.mode || 'cartesian'; let error = ''; try { if (f.expr?.trim()) compileExpr(f.expr); if (mode === 'parametric' && f.expr2?.trim()) compileExpr(f.expr2); } catch (e) { error = e.message; } return <div className="ce-fn" key={f.id}>
        <div className="ce-fn-row"><button type="button" className="ce-dot" style={{ background: f.color || PALETTE[i % PALETTE.length] }} aria-label="Change colour" onClick={() => setFn(f.id, { color: PALETTE[(PALETTE.indexOf(f.color || PALETTE[i % PALETTE.length]) + 1) % PALETTE.length] })}/>
          <select aria-label="Kind of curve" value={mode} onChange={e => setFn(f.id, { mode: e.target.value })}><option value="cartesian">y = f(x)</option><option value="parametric">x(t), y(t)</option><option value="polar">r = f(θ)</option></select>
          <Check label="Show" value={f.show !== false} onChange={v => setFn(f.id, { show: v })}/><button type="button" className="icon-button" aria-label="Remove function" onClick={() => change({ functions: functions.filter(x => x.id !== f.id) })}>×</button></div>
        <div className="ce-expr"><span>{mode === 'cartesian' ? 'y =' : mode === 'polar' ? 'r =' : 'x ='}</span><input spellCheck={false} aria-label="Expression" placeholder={mode === 'polar' ? 'cos(3*theta)' : mode === 'parametric' ? 'cos(t)' : 'sin(x) / x'} value={f.expr || ''} onChange={e => setFn(f.id, { expr: e.target.value })}/></div>
        {mode === 'parametric' && <div className="ce-expr"><span>y =</span><input spellCheck={false} aria-label="Second expression" placeholder="sin(t)" value={f.expr2 || ''} onChange={e => setFn(f.id, { expr2: e.target.value })}/></div>}
        {error && <p className="ce-error">{error}</p>}</div>; })}
      <button type="button" className="small-button" disabled={functions.length >= 8} onClick={() => change({ functions: [...functions, { id: uid(), mode: 'cartesian', expr: '', show: true }] })}>+ Add a function</button>
      {params.length > 0 && <div className="ce-params"><small>Parameters</small>{params.map(p => <div key={p.name} className="ce-param"><strong>{p.name}</strong>
        <input type="range" aria-label={`Value of ${p.name}`} min={p.min} max={p.max} step={(p.max - p.min) / 400 || .01} value={p.value} onChange={e => setParam(p.name, { value: Number(e.target.value) })}/>
        <input className="ce-param-value" inputMode="decimal" aria-label={`${p.name} value`} value={p.value} onChange={e => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) setParam(p.name, { value: v, min: Math.min(p.min, v), max: Math.max(p.max, v) }); }}/>
        <span className="ce-param-range"><input aria-label={`${p.name} minimum`} inputMode="decimal" value={p.min} onChange={e => Number.isFinite(Number(e.target.value)) && setParam(p.name, { min: Number(e.target.value) })}/>to<input aria-label={`${p.name} maximum`} inputMode="decimal" value={p.max} onChange={e => Number.isFinite(Number(e.target.value)) && setParam(p.name, { max: Number(e.target.value) })}/></span></div>)}</div>}
      <div className="ce-grid"><Num label="x from" value={view.xmin} onChange={v => set({ view: { ...view, xmin: v } })}/><Num label="x to" value={view.xmax} onChange={v => set({ view: { ...view, xmax: v } })}/><Num label="y from" value={view.ymin} onChange={v => set({ view: { ...view, ymin: v } })}/><Num label="y to" value={view.ymax} onChange={v => set({ view: { ...view, ymax: v } })}/><Num label="t from" value={view.tmin} placeholder="0" onChange={v => set({ view: { ...view, tmin: v } })}/><Num label="t to" value={view.tmax} placeholder="2π" onChange={v => set({ view: { ...view, tmax: v } })}/></div>
    </section>
    <section className="ce-section"><h4>Options</h4>
      <TitleField value={o.title} onChange={title => setOptions({ title })}/>
      <div className="ce-grid"><Field label="x axis"><input value={o.xTitle || ''} onChange={e => setOptions({ xTitle: e.target.value })}/></Field><Field label="y axis"><input value={o.yTitle || ''} onChange={e => setOptions({ yTitle: e.target.value })}/></Field></div>
      <Check label="Mark where it crosses zero" value={o.roots} onChange={v => setOptions({ roots: v })}/><Check label="Show the slope (derivative)" value={o.derivative} onChange={v => setOptions({ derivative: v })}/>
      <Check label="Plot measured points from the data" value={data.points} onChange={v => set({ points: v })}/><Check label="Logarithmic x axis" value={o.logX} onChange={v => setOptions({ logX: v })}/><Check label="Logarithmic y axis" value={o.logY} onChange={v => setOptions({ logY: v })}/>
      <Check label="Shade the area under the first curve" value={o.area} onChange={v => setOptions({ area: v })}/>{o.area && <div className="ce-grid"><Num label="From" value={o.areaFrom} onChange={v => setOptions({ areaFrom: v })}/><Num label="To" value={o.areaTo} onChange={v => setOptions({ areaTo: v })}/></div>}
    </section></>;
}
