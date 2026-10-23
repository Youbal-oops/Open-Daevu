import { minimum, maximum } from './common.jsx';
import React, { useMemo } from 'react';
import { categoryData, toNumber } from './data.mjs';
import { PALETTE, color, fmt, shorten, scale, Empty, Title, Frame, layout } from './common.jsx';

function WaterfallChart({ table, o, compact }) {
  const { labels, series } = useMemo(() => categoryData(table.rows), [table.rows]);
  if (!labels.length || !series.length) return <Empty>List the steps in the first column and their changes in the second.</Empty>;
  const { W, H, pad } = layout(compact, o), values = series[0].values; let run = 0;
  const steps = values.map((v, i) => { const total = /^(total|sum|balance|end|net)/i.test(labels[i]); const from = total ? 0 : run, to = total ? run : run + v; if (!total) run += v; return { v, from, to, total }; });
  const ys = scale(minimum(steps.flatMap(s => [s.from, s.to]), 0), maximum(steps.flatMap(s => [s.from, s.to]), 0), H - pad.b, pad.t, { zero: true }), band = (W - pad.l - pad.r) / steps.length, w = Math.min(56, band * .7);
  return <div className="chart-wrap"><Title o={o}/><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="waterfall chart">
    <Frame W={W} H={H} pad={pad} ys={ys} o={o} xTitle={o.xTitle} yTitle={o.yTitle}/>
    {steps.map((s, i) => { const x = pad.l + band * (i + .5), top = ys.at(Math.max(s.from, s.to)), h = Math.max(1.5, Math.abs(ys.at(s.from) - ys.at(s.to))); return <g key={i}>
      {i > 0 && <line x1={x - band + w / 2} x2={x - w / 2} y1={ys.at(steps[i - 1].to)} y2={ys.at(steps[i - 1].to)} className="chart-grid"/>}
      <rect x={x - w / 2} y={top} width={w} height={h} rx="3" fill={s.total ? color(0) : s.v >= 0 ? color(1) : color(4)}><title>{`${labels[i]}: ${s.total ? fmt(s.to) : (s.v >= 0 ? '+' : '') + fmt(s.v)}`}</title></rect>
      <text x={x} y={top - 5} textAnchor="middle" className="chart-value">{s.total ? fmt(s.to) : (s.v >= 0 ? '+' : '') + fmt(s.v)}</text>
      <text x={x} y={H - pad.b + 17} textAnchor="middle" className="chart-axis">{shorten(labels[i], 10)}</text></g>; })}
  </svg></div>;
}
function FunnelChart({ table, o }) {
  const { labels, series } = useMemo(() => categoryData(table.rows), [table.rows]);
  if (!labels.length || !series.length) return <Empty>List the stages in the first column and their counts in the second.</Empty>;
  const values = series[0].values, max = maximum(values, 1), H = 44;
  return <div className="chart-wrap"><Title o={o}/><svg viewBox={`0 0 640 ${labels.length * H + 10}`} role="img" aria-label="funnel chart">{values.map((v, i) => { const w = 440 * (v / max), x = 320 - w / 2, y = 5 + i * H; return <g key={i}><rect x={x} y={y + 3} width={Math.max(2, w)} height={H - 8} rx="7" fill={color(i)} fillOpacity=".88"><title>{`${labels[i]}: ${v}`}</title></rect><text x={320} y={y + H / 2 + 3} textAnchor="middle" className="chart-funnel-label">{shorten(labels[i], 22)} · {fmt(v)}</text>{i > 0 && values[i - 1] > 0 && <text x={560} y={y + H / 2 + 3} className="chart-axis">{Math.round(v / values[i - 1] * 100)}% →</text>}</g>; })}</svg></div>;
}
function GaugeChart({ table, o }) {
  const { labels, series } = useMemo(() => categoryData(table.rows), [table.rows]);
  const value = series[0]?.values[0];
  if (!Number.isFinite(value)) return <Empty>Put a header row, then a label and a number.</Empty>;
  const min = toNumber(o.min) || 0, max = Number.isFinite(toNumber(o.max)) ? toNumber(o.max) : 100, target = toNumber(o.target), t = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const arc = (frac, rad) => { const a = Math.PI + Math.PI * frac; return [300 + rad * Math.cos(a), 230 + rad * Math.sin(a)]; }, seg = (f0, f1, rad) => { const [x0, y0] = arc(f0, rad), [x1, y1] = arc(f1, rad); return `M${x0},${y0}A${rad},${rad} 0 0 1 ${x1},${y1}`; };
  const good = target !== undefined && Number.isFinite(target) ? value >= target : true;
  return <div className="chart-wrap"><Title o={o}/><svg viewBox="0 0 600 270" role="img" aria-label="gauge"><path d={seg(0, 1, 170)} fill="none" stroke="var(--hover)" strokeWidth="34" strokeLinecap="round"/><path d={seg(0, Math.max(t, .004), 170)} fill="none" stroke={good ? color(1) : color(4)} strokeWidth="34" strokeLinecap="round"/>
    {Number.isFinite(target) && (() => { const f = Math.max(0, Math.min(1, (target - min) / (max - min || 1))), [x0, y0] = arc(f, 148), [x1, y1] = arc(f, 192); return <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--text)" strokeWidth="3"/>; })()}
    <text x="300" y="218" textAnchor="middle" className="chart-gauge-value">{fmt(value)}</text><text x="300" y="248" textAnchor="middle" className="chart-axis">{labels[0] || series[0].name}</text><text x="130" y="258" textAnchor="middle" className="chart-axis">{fmt(min)}</text><text x="470" y="258" textAnchor="middle" className="chart-axis">{fmt(max)}</text></svg></div>;
}

export function Chart({ kind, table, data = {}, compact = false }) {
  const o = data.options || {};
  if (table.error) return <p className="inline-error">{table.error}</p>;
  const props = { table, o, compact };
  switch (kind) {
    case 'waterfall': return <WaterfallChart {...props}/>;
    case 'funnel': return <FunnelChart {...props}/>;
    case 'gauge': return <GaugeChart {...props}/>;
    default: return <Empty>This chart type is not available.</Empty>;
  }
}
