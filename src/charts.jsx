import React, { useMemo, useState } from 'react';
import { categoryData } from '../shared/chart-data.mjs';
import { niceScale, logTicks } from '../shared/scale.mjs';

export const PALETTE = ['#6aa6d8', '#7fb08e', '#dba46b', '#a98fd1', '#e08b9c', '#6fc0bb', '#d4bd5a', '#8a9be0', '#c57b57', '#9aaa6c'];
const color = i => PALETTE[i % PALETTE.length];
const fmt = v => { if (!Number.isFinite(v)) return ''; const a = Math.abs(v); return a >= 1e9 ? `${+(v / 1e9).toFixed(2)}B` : a >= 1e6 ? `${+(v / 1e6).toFixed(2)}M` : a >= 1e4 ? `${+(v / 1e3).toFixed(1)}k` : a !== 0 && a < 0.001 ? v.toExponential(1) : String(+v.toPrecision(4)); };
const shorten = (s, n) => String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s);

// A scale from numbers to pixels: linear with round ticks, or logarithmic.
function scale(min, max, from, to, { log = false, count = 5, zero = false } = {}) {
  let ticks, lo, hi;
  if (log && min > 0) { ({ min: lo, max: hi, ticks } = logTicks(min, max)); const a = Math.log10(lo), b = Math.log10(hi) || 1; return { lo, hi, ticks, log: true, at: v => from + ((Math.log10(Math.max(v, lo)) - a) / (b - a || 1)) * (to - from) }; }
  if (zero) { min = Math.min(0, min); max = Math.max(0, max); }
  ({ min: lo, max: hi, ticks } = niceScale(min, max, count));
  return { lo, hi, ticks, log: false, at: v => from + ((v - lo) / (hi - lo || 1)) * (to - from) };
}
const Empty = ({ children }) => <div className="chart-empty">{children}</div>;
const Legend = ({ items, onToggle, hidden }) => items.length > 1 ? <div className="chart-legend">{items.map((s, i) => <button type="button" key={s} className={hidden?.has(s) ? 'off' : ''} onClick={() => onToggle?.(s)}><i style={{ background: color(i) }}/>{s}</button>)}</div> : null;
const Title = ({ o }) => o.title ? <div className="chart-title">{o.title}</div> : null;

// ---- Axes drawn around a plot area.
function Frame({ W, H, pad, xs, ys, o, xTitle, yTitle, children, rotate }) {
  return <>
    {ys.ticks.map(t => <g key={'y' + t}><line x1={pad.l} x2={W - pad.r} y1={ys.at(t)} y2={ys.at(t)} className={`chart-grid${t === 0 ? ' zero' : ''}`}/><text x={pad.l - 8} y={ys.at(t) + 3.5} textAnchor="end" className="chart-axis">{fmt(t)}</text></g>)}
    {xs?.ticks?.map(t => <g key={'x' + t}>{o.grid !== false && o.xgrid && <line y1={pad.t} y2={H - pad.b} x1={xs.at(t)} x2={xs.at(t)} className="chart-grid"/>}<text x={xs.at(t)} y={H - pad.b + 17} textAnchor="middle" className="chart-axis">{fmt(t)}</text></g>)}
    {xTitle && <text x={(pad.l + W - pad.r) / 2} y={H - 6} textAnchor="middle" className="chart-axis-title">{xTitle}</text>}
    {yTitle && <text transform={`translate(13 ${(pad.t + H - pad.b) / 2}) rotate(-90)`} textAnchor="middle" className="chart-axis-title">{yTitle}</text>}
    {children}
  </>;
}
const layout = (compact, o) => { const W = 640, H = compact ? 280 : 420; return { W, H, pad: { l: o.yTitle ? 70 : 58, r: 20, t: 16, b: (compact ? 38 : 50) + (o.xTitle ? 12 : 0) } }; };

// ---- Bars, lines and areas.
function CategoryChart({ kind, table, o, compact }) {
  const { labels, series: all } = useMemo(() => categoryData(table.rows), [table.rows]), [hidden, setHidden] = useState(new Set());
  if (!labels.length || !all.length) return <Empty>Add a header row, labels in the first column, and numbers in the others.</Empty>;
  const series = all.filter(s => !hidden.has(s.name)), { W, H, pad } = layout(compact, o), horizontal = kind === 'bar' && o.horizontal, stacked = o.stacked && series.length > 1;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + s.values[i], 0)), pos = labels.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i]), 0)), neg = labels.map((_, i) => series.reduce((a, s) => a + Math.min(0, s.values[i]), 0));
  const hi = stacked ? Math.max(...pos, 0) : Math.max(...series.flatMap(s => s.values), 0), lo = stacked ? Math.min(...neg, 0) : Math.min(...series.flatMap(s => s.values), 0);
  const vs = horizontal ? scale(lo, hi, pad.l, W - pad.r, { zero: true, log: o.logY }) : scale(lo, hi, H - pad.b, pad.t, { zero: true, log: o.logY }), n = labels.length;
  const band = horizontal ? (H - pad.t - pad.b) / n : (W - pad.l - pad.r) / n, along = i => horizontal ? pad.t + band * (i + .5) : pad.l + band * (i + .5), skip = Math.ceil(n / (compact ? 6 : 12));
  const base = vs.at(Math.max(vs.lo, 0)), y = v => vs.at(v);
  const stackAt = (si, i) => { let pBase = 0, nBase = 0; for (let k = 0; k < si; k++) { const v = series[k].values[i]; if (v >= 0) pBase += v; else nBase += v; } const v = series[si].values[i]; return v >= 0 ? [pBase, pBase + v] : [nBase + v, nBase]; };
  const path = (pts, smooth) => { if (!pts.length) return ''; if (!smooth || pts.length < 3) return 'M' + pts.map(p => p.join(',')).join('L'); let d = `M${pts[0].join(',')}`; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2; d += `C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`; } return d; };
  return <div className="chart-wrap"><Title o={o}/><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${kind} chart`}>
    {horizontal ? <>
      {vs.ticks.map(t => <g key={t}><line y1={pad.t} y2={H - pad.b} x1={vs.at(t)} x2={vs.at(t)} className="chart-grid"/><text x={vs.at(t)} y={H - pad.b + 17} textAnchor="middle" className="chart-axis">{fmt(t)}</text></g>)}
      {labels.map((l, i) => <text key={i} x={pad.l - 8} y={along(i) + 3.5} textAnchor="end" className="chart-axis">{shorten(l, 14)}</text>)}
    </> : <Frame W={W} H={H} pad={pad} ys={vs} o={o} xTitle={o.xTitle} yTitle={o.yTitle}>{labels.map((l, i) => i % skip === 0 && <text key={i} x={along(i)} y={H - pad.b + 17} textAnchor="middle" className="chart-axis">{shorten(l, 11)}</text>)}</Frame>}
    {kind === 'bar' && series.map((s, si) => s.values.map((v, i) => {
      const w = stacked ? Math.min(60, band * .7) : Math.min(46, band * .74 / series.length), off = stacked ? -w / 2 : (si - (series.length - 1) / 2) * w - w / 2 + w / 2 - w / 2;
      const [a, b] = stacked ? stackAt(si, i) : [Math.min(0, v), Math.max(0, v)], p0 = horizontal ? vs.at(a) : y(a), p1 = horizontal ? vs.at(b) : y(b), c = along(i) + (stacked ? -w / 2 : (si - (series.length - 1) / 2) * w - w / 2);
      return <rect key={`${si}-${i}`} {...(horizontal ? { x: Math.min(p0, p1), y: c, width: Math.max(1, Math.abs(p1 - p0)), height: w - 1.5 } : { x: c, y: Math.min(p0, p1), width: w - 1.5, height: Math.max(1, Math.abs(p1 - p0)) })} rx="2.5" fill={color(all.indexOf(s))}><title>{`${labels[i]} · ${s.name}: ${v}`}</title></rect>;
    }))}
    {kind === 'bar' && o.values && !stacked && series.map((s, si) => s.values.map((v, i) => { const w = Math.min(46, band * .74 / series.length), c = along(i) + (si - (series.length - 1) / 2) * w; return horizontal ? <text key={`${si}-${i}`} x={vs.at(Math.max(0, v)) + 5} y={c + 3.5} className="chart-value">{fmt(v)}</text> : <text key={`${si}-${i}`} x={c} y={y(Math.max(0, v)) - 5} textAnchor="middle" className="chart-value">{fmt(v)}</text>; }))}
    {kind === 'area' && series.map((s, si) => { const pts = s.values.map((v, i) => [along(i), stacked ? y(stackAt(si, i)[1]) : y(v)]), low = s.values.map((_, i) => [along(i), stacked ? y(stackAt(si, i)[0]) : base]); return <g key={si}><path d={`${path(pts, o.smooth)}L${low.slice().reverse().map(p => p.join(',')).join('L')}Z`} fill={color(all.indexOf(s))} fillOpacity={stacked ? .85 : .28}/><path d={path(pts, o.smooth)} fill="none" stroke={color(all.indexOf(s))} strokeWidth="2.2"/></g>; })}
    {kind === 'line' && series.map((s, si) => <g key={si}><path d={path(s.values.map((v, i) => [along(i), y(v)]), o.smooth)} fill="none" stroke={color(all.indexOf(s))} strokeWidth="2.4" strokeLinejoin="round"/>{s.values.map((v, i) => <circle key={i} cx={along(i)} cy={y(v)} r="3.5" fill={color(all.indexOf(s))}><title>{`${labels[i]} · ${s.name}: ${v}`}</title></circle>)}</g>)}
  </svg><Legend items={all.map(s => s.name)} hidden={hidden} onToggle={name => setHidden(h => { const n = new Set(h); n.has(name) ? n.delete(name) : n.add(name); return n; })}/></div>;
}

// ---- Pie and donut.
function PieChart({ table, o }) {
  const { labels, series } = useMemo(() => categoryData(table.rows), [table.rows]);
  if (!labels.length || !series.length) return <Empty>Add labels in the first column and numbers in the second.</Empty>;
  const s = series[0], total = s.values.reduce((a, b) => a + Math.max(0, b), 0);
  if (!total) return <Empty>Pie charts need positive numbers.</Empty>;
  let angle = -Math.PI / 2; const cx = 150, cy = 150, r = 124, inner = o.donut ? 72 : 0;
  return <div className="chart-wrap pie"><Title o={o}/><svg viewBox="0 0 300 300" role="img" aria-label="pie chart">{s.values.map((v, i) => {
    const frac = Math.max(0, v) / total; if (!frac) return null;
    const a0 = angle, a1 = angle + frac * Math.PI * 2; angle = a1; const large = a1 - a0 > Math.PI ? 1 : 0, p = (a, rad) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    const [x0, y0] = p(a0, r), [x1, y1] = p(a1, r), [x2, y2] = p(a1, inner), [x3, y3] = p(a0, inner), mid = (a0 + a1) / 2, [lx, ly] = p(mid, (r + inner) / 2 + (inner ? 0 : r * .18));
    const d = frac > .9999 ? `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0${inner ? `M${cx - inner},${cy}a${inner},${inner} 0 1,1 ${2 * inner},0a${inner},${inner} 0 1,1 ${-2 * inner},0` : ''}` : inner ? `M${x0},${y0}A${r},${r} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${inner},${inner} 0 ${large} 0 ${x3},${y3}Z` : `M${cx},${cy}L${x0},${y0}A${r},${r} 0 ${large} 1 ${x1},${y1}Z`;
    return <g key={i}><path d={d} fill={color(i)} fillRule="evenodd" stroke="var(--card)" strokeWidth="2"><title>{`${labels[i]}: ${v} (${Math.round(frac * 100)}%)`}</title></path>{frac > .06 && o.values !== false && <text x={lx} y={ly + 4} textAnchor="middle" className="chart-pie-label">{Math.round(frac * 100)}%</text>}</g>;
  })}{o.donut && <text x={cx} y={cy + 5} textAnchor="middle" className="chart-pie-total">{fmt(total)}</text>}</svg>
    <ul className="chart-legend vertical">{labels.map((l, i) => <li key={i}><i style={{ background: color(i) }}/>{l || '—'}<b>{fmt(s.values[i])}</b></li>)}</ul></div>;
}

export const CHART_KINDS = new Set(['bar', 'line', 'area', 'pie']);
export function Chart({ kind, table, data = {}, compact = false }) {
  const o = data.options || {};
  if (table.error) return <p className="inline-error">{table.error}</p>;
  const props = { table, o, compact };
  switch (kind) {
    case 'bar': case 'line': case 'area': return <CategoryChart kind={kind} {...props}/>;
    case 'pie': return <PieChart {...props}/>;
    default: return <Empty>This chart type is not available.</Empty>;
  }
}
