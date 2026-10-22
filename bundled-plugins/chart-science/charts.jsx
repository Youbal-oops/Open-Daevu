import React, { useMemo, useState } from 'react';
import { xyData } from './data.mjs';
import { compileExpr } from './mathexpr.mjs';
import { quantile } from './stats.mjs';
import { PALETTE, color, fmt, shorten, scale, Empty, Title, Frame, layout } from './common.jsx';

// ---- Function plots: y = f(x), parametric curves and polar curves, with parameters, roots, slope and area.
export function paramScope(data) { const scope = {}; for (const p of data.params || []) if (p.name) scope[p.name] = Number.isFinite(Number(p.value)) ? Number(p.value) : 0; return scope; }
const SAMPLES = 720;
function sampleFunction(f, scope, view, o) {
  const run = compileExpr(f.expr), mode = f.mode || 'cartesian', pts = [];
  if (mode === 'cartesian') {
    const lo = Number.isFinite(view.xmin) ? view.xmin : -10, hi = Number.isFinite(view.xmax) ? view.xmax : 10;
    for (let k = 0; k <= SAMPLES; k++) { const x = o.logX && lo > 0 ? lo * (hi / lo) ** (k / SAMPLES) : lo + (hi - lo) * k / SAMPLES; let y; try { y = run({ ...scope, x }); } catch { y = NaN; } pts.push([x, Number.isFinite(y) ? y : NaN]); }
    return { pts, run, mode };
  }
  const t0 = Number.isFinite(view.tmin) ? view.tmin : 0, t1 = Number.isFinite(view.tmax) ? view.tmax : Math.PI * 2, second = mode === 'parametric' ? compileExpr(f.expr2 || '0') : null;
  for (let k = 0; k <= SAMPLES; k++) {
    const t = t0 + (t1 - t0) * k / SAMPLES, s = { ...scope, t, theta: t };
    try { if (mode === 'polar') { const r = run(s); pts.push([r * Math.cos(t), r * Math.sin(t)]); } else pts.push([run(s), second(s)]); } catch { pts.push([NaN, NaN]); }
  }
  return { pts, run, mode };
}
export function FunctionPlot({ data, table, compact }) {
  const o = data.options || {}, view = data.view || {}, scope = useMemo(() => paramScope(data), [data.params]), [hover, setHover] = useState(null);
  const plots = useMemo(() => (data.functions || []).filter(f => f.show !== false && String(f.expr || '').trim()).map((f, i) => { try { return { f, i, ...sampleFunction(f, scope, view, o) }; } catch (e) { return { f, i, error: e.message }; } }), [data.functions, scope, view.xmin, view.xmax, view.tmin, view.tmax, o.logX]);
  const points = useMemo(() => data.points && table?.rows?.length ? xyData(table.rows) : null, [data.points, table]);
  const { W, H, pad } = layout(compact, o), good = plots.filter(p => p.pts);
  if (!(data.functions || []).some(f => String(f.expr || '').trim())) return <Empty>Add a function to plot, like sin(x) or a*x^2 + b.</Empty>;
  // The window: the x range you asked for, and a y range that ignores spikes at asymptotes.
  const allX = good.flatMap(p => p.pts.map(q => q[0])).filter(Number.isFinite), allY = good.flatMap(p => p.pts.map(q => q[1])).filter(Number.isFinite);
  if (points) { allX.push(...points.xs.filter(Number.isFinite)); allY.push(...points.series.flatMap(s => s.y).filter(Number.isFinite)); }
  if (!allX.length || !allY.length) return <Empty>Nothing to show. Check the expression and the range.</Empty>;
  const sorted = [...allY].sort((a, b) => a - b), yq0 = quantile(sorted, .015), yq1 = quantile(sorted, .985), padY = (yq1 - yq0) * .12 || 1;
  let ymin = Number.isFinite(view.ymin) ? view.ymin : yq0 - padY, ymax = Number.isFinite(view.ymax) ? view.ymax : yq1 + padY, xmin = Number.isFinite(view.xmin) && good.every(p => (p.f.mode || 'cartesian') === 'cartesian') ? view.xmin : Math.min(...allX), xmax = Number.isFinite(view.xmax) && good.every(p => (p.f.mode || 'cartesian') === 'cartesian') ? view.xmax : Math.max(...allX);
  const curved = good.some(p => (p.f.mode || 'cartesian') !== 'cartesian');
  if (curved) { const bx = [Math.min(...allX), Math.max(...allX)], by = [Math.min(...allY), Math.max(...allY)], span = Math.max(bx[1] - bx[0], by[1] - by[0]) * 1.1 || 2, cxm = (bx[0] + bx[1]) / 2, cym = (by[0] + by[1]) / 2; xmin = cxm - span / 2; xmax = cxm + span / 2; ymin = cym - span / 2; ymax = cym + span / 2; }
  const xs = scale(xmin, xmax, pad.l, W - pad.r, { log: o.logX }), ys = scale(ymin, ymax, H - pad.b, pad.t, { log: o.logY }), clampY = v => Math.max(pad.t - 30, Math.min(H - pad.b + 30, ys.at(v)));
  const jump = (a, b) => Math.abs(ys.at(a) - ys.at(b)) > (H - pad.t - pad.b) * .8;
  const pathOf = pts => { let d = '', pen = false, prev = null; for (const [x, y] of pts) { if (!Number.isFinite(x) || !Number.isFinite(y)) { pen = false; prev = null; continue; } if (pen && prev !== null && jump(prev, y)) pen = false; d += `${pen ? 'L' : 'M'}${xs.at(x).toFixed(1)},${clampY(y).toFixed(1)}`; pen = true; prev = y; } return d; };
  const rootsRaw = o.roots ? good.filter(p => (p.f.mode || 'cartesian') === 'cartesian').flatMap(p => { const out = []; for (let k = 1; k < p.pts.length; k++) { const [x0, y0] = p.pts[k - 1], [x1, y1] = p.pts[k]; if (Number.isFinite(y0) && Number.isFinite(y1) && y0 * y1 < 0 && Math.abs(y1 - y0) < (ymax - ymin)) { let a = x0, b = x1; for (let it = 0; it < 40; it++) { const m = (a + b) / 2, ym = (() => { try { return p.run({ ...scope, x: m }); } catch { return NaN; } })(); if (!Number.isFinite(ym)) break; if ((ym < 0) === (y0 < 0)) a = m; else b = m; } out.push({ x: (a + b) / 2, i: p.i }); } else if (y0 === 0) out.push({ x: x0, i: p.i }); } return out; }) : [];
  const roots = rootsRaw.filter((r, i, all) => all.findIndex(q => Math.abs(q.x - r.x) < (xmax - xmin) * 1e-4) === i);
  const first = good.find(p => (p.f.mode || 'cartesian') === 'cartesian'), area = o.area && first ? (() => { const a = Number.isFinite(Number(o.areaFrom)) ? Number(o.areaFrom) : xmin, b = Number.isFinite(Number(o.areaTo)) ? Number(o.areaTo) : xmax, N = 400, h = (b - a) / N; let total = 0; const poly = []; for (let k = 0; k <= N; k++) { const x = a + k * h; let y; try { y = first.run({ ...scope, x }); } catch { y = NaN; } if (!Number.isFinite(y)) return null; poly.push([x, y]); total += (k === 0 || k === N ? 1 : k % 2 ? 4 : 2) * y; } return { a, b, value: total * h / 3, poly }; })() : null;
  const deriv = o.derivative ? good.filter(p => (p.f.mode || 'cartesian') === 'cartesian').map(p => ({ p, pts: p.pts.map(([x]) => { const h = 1e-4 * (xmax - xmin || 1); try { return [x, (p.run({ ...scope, x: x + h }) - p.run({ ...scope, x: x - h })) / (2 * h)]; } catch { return [x, NaN]; } }) })) : [];
  const move = e => { const box = e.currentTarget.getBoundingClientRect(), px = (e.clientX - box.left) / box.width * W; if (px < pad.l || px > W - pad.r) return setHover(null); const x = o.logX ? Math.pow(10, Math.log10(xs.lo) + (px - pad.l) / (W - pad.l - pad.r) * (Math.log10(xs.hi) - Math.log10(xs.lo))) : xs.lo + (px - pad.l) / (W - pad.l - pad.r) * (xs.hi - xs.lo); setHover({ x, px }); };
  const yAt = (p, x) => { try { const v = p.run({ ...scope, x }); return Number.isFinite(v) ? v : NaN; } catch { return NaN; } };
  const xAxisAt = Math.max(pad.t, Math.min(H - pad.b, ys.at(0))), yAxisAt = Math.max(pad.l, Math.min(W - pad.r, xs.at(0)));
  return <div className="chart-wrap"><Title o={o}/><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="function plot" onMouseMove={move} onMouseLeave={() => setHover(null)}>
    <Frame W={W} H={H} pad={pad} xs={xs} ys={ys} o={{ ...o, xgrid: true }} xTitle={o.xTitle} yTitle={o.yTitle}/>
    {!o.logY && ymin < 0 && ymax > 0 && <line x1={pad.l} x2={W - pad.r} y1={xAxisAt} y2={xAxisAt} className="chart-axis-line"/>}{!o.logX && xmin < 0 && xmax > 0 && <line y1={pad.t} y2={H - pad.b} x1={yAxisAt} x2={yAxisAt} className="chart-axis-line"/>}
    {area && <path d={`M${xs.at(area.poly[0][0])},${ys.at(0)}L${area.poly.map(([x, y]) => `${xs.at(x)},${clampY(y)}`).join('L')}L${xs.at(area.poly.at(-1)[0])},${ys.at(0)}Z`} fill={color(first.i)} fillOpacity=".22"/>}
    {deriv.map(({ p, pts }) => <path key={'d' + p.i} d={pathOf(pts)} fill="none" stroke={p.f.color || color(p.i)} strokeWidth="1.6" strokeDasharray="5 4" opacity=".7"/>)}
    {good.map(p => <path key={p.i} d={pathOf(p.pts)} fill="none" stroke={p.f.color || color(p.i)} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round"/>)}
    {points && points.series.map((s, si) => points.xs.map((x, i) => Number.isFinite(x) && Number.isFinite(s.y[i]) ? <circle key={`${si}-${i}`} cx={xs.at(x)} cy={ys.at(s.y[i])} r="4.2" fill="var(--card)" stroke="var(--text)" strokeWidth="1.8"><title>{`(${fmt(x)}, ${fmt(s.y[i])})`}</title></circle> : null))}
    {roots.map((r, k) => <g key={k}><circle cx={xs.at(r.x)} cy={ys.at(0)} r="4.5" fill={color(r.i)} stroke="var(--card)" strokeWidth="1.5"/><text x={xs.at(r.x)} y={ys.at(0) - 9} textAnchor="middle" className="chart-value">{fmt(r.x)}</text></g>)}
    {hover && <g pointerEvents="none"><line x1={hover.px} x2={hover.px} y1={pad.t} y2={H - pad.b} className="chart-cross"/>{good.filter(p => (p.f.mode || 'cartesian') === 'cartesian').map(p => { const y = yAt(p, hover.x); return Number.isFinite(y) ? <circle key={p.i} cx={hover.px} cy={clampY(y)} r="4.5" fill={p.f.color || color(p.i)} stroke="var(--card)" strokeWidth="1.5"/> : null; })}
      <g transform={`translate(${hover.px > W / 2 ? hover.px - 12 : hover.px + 12} ${pad.t + 8})`}><rect x={hover.px > W / 2 ? -130 : 0} y="0" width="130" height={18 + 16 * (1 + good.length)} rx="8" className="chart-tip"/><text x={hover.px > W / 2 ? -120 : 10} y="16" className="chart-tip-text">x = {fmt(hover.x)}</text>{good.filter(p => (p.f.mode || 'cartesian') === 'cartesian').map((p, k) => <text key={p.i} x={hover.px > W / 2 ? -120 : 10} y={32 + 16 * k} className="chart-tip-text" fill={p.f.color || color(p.i)}>{shorten(p.f.label || p.f.expr, 14)} = {fmt(yAt(p, hover.x))}</text>)}</g></g>}
  </svg>
    <ul className="chart-fits">
      {plots.filter(p => p.error).map(p => <li key={p.i} className="bad"><i style={{ background: color(p.i) }}/><strong>{shorten(p.f.expr, 28)}</strong><span>{p.error}</span></li>)}
      {area && <li><strong>Area</strong><span>from {fmt(area.a)} to {fmt(area.b)} ≈ {fmt(area.value)}</span></li>}
      {o.roots && <li><strong>Roots</strong><span>{roots.length ? roots.map(r => fmt(r.x)).join(', ') : 'none in view'}</span></li>}
    </ul></div>;
}

export function Chart({ kind, table, data = {}, compact = false }) {
  return kind === 'function' ? <FunctionPlot data={data} table={table} compact={compact}/> : <Empty>This chart type is not available.</Empty>;
}
