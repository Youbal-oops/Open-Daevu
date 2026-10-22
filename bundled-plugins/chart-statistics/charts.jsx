import React, { useMemo, useState } from 'react';
import { xyData, columnsData, matrixData, categoryData } from './data.mjs';
import { niceScale, fitCurve, boxStats, histogram, describe, correlation, FITS } from './stats.mjs';
import { PALETTE, color, fmt, shorten, scale, Empty, Legend, Title, Frame, layout } from './common.jsx';

// ---- Scatter and bubble, with fitted curves.
function ScatterChart({ table, o, compact }) {
  const data = useMemo(() => xyData(table.rows, o.bubble), [table.rows, o.bubble]), [hidden, setHidden] = useState(new Set());
  if (!data.series.length) return <Empty>Put x values in the first column and y values in the others.</Empty>;
  const { W, H, pad } = layout(compact, o), series = data.series.filter(s => !hidden.has(s.name));
  const xv = data.xs.filter(Number.isFinite), yv = series.flatMap(s => s.y).filter(Number.isFinite);
  if (!xv.length || !yv.length) return <Empty>No numbers to plot.</Empty>;
  const xs = scale(Math.min(...xv), Math.max(...xv), pad.l, W - pad.r, { log: o.logX }), ys = scale(Math.min(...yv), Math.max(...yv), H - pad.b, pad.t, { log: o.logY });
  const sizes = data.series[0]?.size?.filter(Number.isFinite) || [], sMax = Math.max(...sizes, 1);
  const fits = o.fit && o.fit !== 'none' ? series.map(s => { const pairs = data.xs.map((x, i) => [x, s.y[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)); return { s, fit: fitCurve(o.fit, pairs.map(p => p[0]), pairs.map(p => p[1])), r: correlation(pairs.map(p => p[0]), pairs.map(p => p[1])) }; }) : [];
  return <div className="chart-wrap"><Title o={o}/><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="scatter chart">
    <Frame W={W} H={H} pad={pad} xs={xs} ys={ys} o={{ ...o, xgrid: true }} xTitle={o.xTitle || data.xName} yTitle={o.yTitle}/>
    {fits.map(({ s, fit }) => { if (!fit) return null; const pts = []; for (let k = 0; k <= 160; k++) { const x = o.logX ? xs.lo * (xs.hi / xs.lo) ** (k / 160) : xs.lo + (xs.hi - xs.lo) * k / 160, v = fit.fn(x); if (Number.isFinite(v)) pts.push([xs.at(x), ys.at(v)]); } return <path key={s.name} d={'M' + pts.map(p => p.join(',')).join('L')} fill="none" stroke={color(data.series.indexOf(s))} strokeWidth="2" strokeDasharray="6 4" opacity=".9"/>; })}
    {series.map(s => data.xs.map((x, i) => Number.isFinite(x) && Number.isFinite(s.y[i]) ? <circle key={`${s.name}-${i}`} cx={xs.at(x)} cy={ys.at(s.y[i])} r={s.size ? 4 + 18 * Math.sqrt(Math.max(0, s.size[i] || 0) / sMax) : 4.2} fill={color(data.series.indexOf(s))} fillOpacity={s.size ? .55 : .85} stroke="var(--card)" strokeWidth="1"><title>{`${data.labels[i] || data.xName}: (${fmt(x)}, ${fmt(s.y[i])})${s.size ? ` · ${fmt(s.size[i])}` : ''}`}</title></circle> : null))}
  </svg><Legend items={data.series.map(s => s.name)} hidden={hidden} onToggle={name => setHidden(h => { const n = new Set(h); n.has(name) ? n.delete(name) : n.add(name); return n; })}/>
    {fits.some(f => f.fit) && <ul className="chart-fits">{fits.filter(f => f.fit).map(({ s, fit, r }) => <li key={s.name}><i style={{ background: color(data.series.indexOf(s)) }}/><strong>{s.name}</strong><code>{fit.equation}</code><span>R² = {fit.r2.toFixed(4)}{FITS[o.fit][0] === 'Linear' && Number.isFinite(r) ? ` · r = ${r.toFixed(3)}` : ''}</span></li>)}</ul>}</div>;
}

// ---- Histogram and box plot.
function HistogramChart({ table, o, compact }) {
  const columns = useMemo(() => columnsData(table.rows), [table.rows]);
  if (!columns.length) return <Empty>Put the numbers to count in a column with a header.</Empty>;
  const column = columns.find(c => c.name === o.column) || columns[0], bins = histogram(column.values, o.bins ? Number(o.bins) : undefined), stats = describe(column.values), { W, H, pad } = layout(compact, o);
  const xs = scale(bins[0].from, bins.at(-1).to, pad.l, W - pad.r, { count: 6 }), ys = scale(0, Math.max(...bins.map(b => b.count)), H - pad.b, pad.t, { zero: true }), width = bins[0].to - bins[0].from;
  const normal = o.curve && stats.sd > 0 ? Array.from({ length: 100 }, (_, k) => { const x = bins[0].from + (bins.at(-1).to - bins[0].from) * k / 99, pdf = Math.exp(-((x - stats.mean) ** 2) / (2 * stats.sd ** 2)) / (stats.sd * Math.sqrt(2 * Math.PI)); return [xs.at(x), ys.at(pdf * stats.count * width)]; }) : null;
  return <div className="chart-wrap"><Title o={o}/><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="histogram">
    <Frame W={W} H={H} pad={pad} xs={xs} ys={ys} o={o} xTitle={o.xTitle || column.name} yTitle={o.yTitle || 'Count'}/>
    {bins.map((b, i) => <rect key={i} x={xs.at(b.from) + 1} y={ys.at(b.count)} width={Math.max(1, xs.at(b.to) - xs.at(b.from) - 2)} height={Math.max(0, ys.at(0) - ys.at(b.count))} rx="2" fill={color(0)} fillOpacity=".85"><title>{`${fmt(b.from)} to ${fmt(b.to)}: ${b.count}`}</title></rect>)}
    {normal && <path d={'M' + normal.map(p => p.join(',')).join('L')} fill="none" stroke={color(2)} strokeWidth="2.2"/>}
    {stats && <line x1={xs.at(stats.mean)} x2={xs.at(stats.mean)} y1={pad.t} y2={H - pad.b} stroke={color(4)} strokeWidth="1.5" strokeDasharray="5 4"/>}
  </svg><ul className="chart-fits"><li><strong>{column.name}</strong><span>n = {stats.count} · mean {fmt(stats.mean)} · median {fmt(stats.median)} · sd {fmt(stats.sd)} · min {fmt(stats.min)} · max {fmt(stats.max)}</span></li></ul></div>;
}
function BoxChart({ table, o, compact }) {
  const columns = useMemo(() => columnsData(table.rows), [table.rows]);
  if (!columns.length) return <Empty>Each column with a header becomes one box.</Empty>;
  const boxes = columns.map(c => ({ c, b: boxStats(c.values) })), { W, H, pad } = layout(compact, o), all = boxes.flatMap(({ b }) => [b.min, b.max, ...b.outliers]);
  const ys = scale(Math.min(...all), Math.max(...all), H - pad.b, pad.t, { log: o.logY }), band = (W - pad.l - pad.r) / boxes.length, w = Math.min(70, band * .5);
  return <div className="chart-wrap"><Title o={o}/><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="box plot">
    <Frame W={W} H={H} pad={pad} ys={ys} o={o} xTitle={o.xTitle} yTitle={o.yTitle}/>
    {boxes.map(({ c, b }, i) => { const x = pad.l + band * (i + .5), col = color(i); return <g key={c.name}>
      <line x1={x} x2={x} y1={ys.at(b.min)} y2={ys.at(b.q1)} stroke={col} strokeWidth="2"/><line x1={x} x2={x} y1={ys.at(b.q3)} y2={ys.at(b.max)} stroke={col} strokeWidth="2"/>
      <line x1={x - w / 4} x2={x + w / 4} y1={ys.at(b.min)} y2={ys.at(b.min)} stroke={col} strokeWidth="2"/><line x1={x - w / 4} x2={x + w / 4} y1={ys.at(b.max)} y2={ys.at(b.max)} stroke={col} strokeWidth="2"/>
      <rect x={x - w / 2} y={ys.at(b.q3)} width={w} height={Math.max(1, ys.at(b.q1) - ys.at(b.q3))} rx="3" fill={col} fillOpacity=".35" stroke={col} strokeWidth="2"><title>{`${c.name}: median ${fmt(b.median)}, Q1 ${fmt(b.q1)}, Q3 ${fmt(b.q3)}`}</title></rect>
      <line x1={x - w / 2} x2={x + w / 2} y1={ys.at(b.median)} y2={ys.at(b.median)} stroke="var(--text)" strokeWidth="2.4"/>
      <circle cx={x} cy={ys.at(b.mean)} r="3.5" fill="var(--text)" opacity=".8"><title>{`mean ${fmt(b.mean)}`}</title></circle>
      {b.outliers.map((v, k) => <circle key={k} cx={x} cy={ys.at(v)} r="3" fill="none" stroke={col} strokeWidth="1.6"><title>{fmt(v)}</title></circle>)}
      <text x={x} y={H - pad.b + 17} textAnchor="middle" className="chart-axis">{shorten(c.name, 12)}</text></g>; })}
  </svg></div>;
}

// ---- Heat map and radar.
function HeatmapChart({ table, o, compact }) {
  const { cols, rowsLabels, matrix } = useMemo(() => matrixData(table.rows), [table.rows]);
  const flat = matrix.flat().filter(Number.isFinite);
  if (!cols.length || !rowsLabels.length || !flat.length) return <Empty>Put row names down the first column, column names across the top, and numbers in the grid.</Empty>;
  const lo = Math.min(...flat), hi = Math.max(...flat), W = 640, left = 110, top = 40, cw = Math.min(90, (W - left - 16) / cols.length), ch = Math.min(40, (compact ? 220 : 340) / rowsLabels.length), H = top + ch * rowsLabels.length + 34;
  const shade = v => { if (!Number.isFinite(v)) return 'transparent'; const t = hi === lo ? .5 : (v - lo) / (hi - lo); return `color-mix(in srgb, ${PALETTE[0]} ${Math.round(12 + t * 78)}%, ${o.diverge && t < .5 ? PALETTE[4] : 'transparent'})`; };
  return <div className="chart-wrap"><Title o={o}/><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="heat map">
    {cols.map((c, j) => <text key={j} x={left + cw * (j + .5)} y={top - 10} textAnchor="middle" className="chart-axis">{shorten(c, 11)}</text>)}
    {rowsLabels.map((r, i) => <g key={i}><text x={left - 8} y={top + ch * (i + .5) + 3.5} textAnchor="end" className="chart-axis">{shorten(r, 15)}</text>{matrix[i].map((v, j) => <g key={j}><rect x={left + cw * j + 1} y={top + ch * i + 1} width={cw - 2} height={ch - 2} rx="5" fill={shade(v)}><title>{`${r} · ${cols[j]}: ${v}`}</title></rect>{o.values !== false && Number.isFinite(v) && <text x={left + cw * (j + .5)} y={top + ch * (i + .5) + 3.5} textAnchor="middle" className="chart-heat-value">{fmt(v)}</text>}</g>)}</g>)}
  </svg></div>;
}
function RadarChart({ table, o }) {
  const { labels, series } = useMemo(() => categoryData(table.rows), [table.rows]);
  if (labels.length < 3 || !series.length) return <Empty>Radar charts need at least three labels and one column of numbers.</Empty>;
  const max = niceScale(0, Math.max(...series.flatMap(s => s.values), 1)).max, cx = 300, cy = 190, r = 140, n = labels.length, pt = (i, v) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [cx + r * (v / max) * Math.cos(a), cy + r * (v / max) * Math.sin(a)]; };
  return <div className="chart-wrap"><Title o={o}/><svg viewBox="0 0 600 390" role="img" aria-label="radar chart">
    {[.25, .5, .75, 1].map(f => <polygon key={f} points={labels.map((_, i) => pt(i, max * f).join(',')).join(' ')} fill="none" className="chart-grid"/>)}
    {labels.map((l, i) => { const [x, y] = pt(i, max), [lx, ly] = pt(i, max * 1.12); return <g key={i}><line x1={cx} y1={cy} x2={x} y2={y} className="chart-grid"/><text x={lx} y={ly + 3.5} textAnchor={lx < cx - 8 ? 'end' : lx > cx + 8 ? 'start' : 'middle'} className="chart-axis">{shorten(l, 14)}</text></g>; })}
    {series.map((s, si) => <g key={si}><polygon points={s.values.map((v, i) => pt(i, v).join(',')).join(' ')} fill={color(si)} fillOpacity=".22" stroke={color(si)} strokeWidth="2.2"/>{s.values.map((v, i) => <circle key={i} cx={pt(i, v)[0]} cy={pt(i, v)[1]} r="3.5" fill={color(si)}><title>{`${labels[i]} · ${s.name}: ${v}`}</title></circle>)}</g>)}
  </svg><Legend items={series.map(s => s.name)}/></div>;
}

export function Chart({ kind, table, data = {}, compact = false }) {
  const o = data.options || {};
  if (table.error) return <p className="inline-error">{table.error}</p>;
  const props = { table, o, compact };
  switch (kind) {
    case 'scatter': return <ScatterChart {...props}/>;
    case 'histogram': return <HistogramChart {...props}/>;
    case 'box': return <BoxChart {...props}/>;
    case 'heatmap': return <HeatmapChart {...props}/>;
    case 'radar': return <RadarChart {...props}/>;
    default: return <Empty>This chart type is not available.</Empty>;
  }
}
