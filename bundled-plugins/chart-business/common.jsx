import React from 'react';
import { niceScale, logTicks } from './stats.mjs';

export const PALETTE = ['#6aa6d8', '#7fb08e', '#dba46b', '#a98fd1', '#e08b9c', '#6fc0bb', '#d4bd5a', '#8a9be0', '#c57b57', '#9aaa6c'];
export const color = i => PALETTE[i % PALETTE.length];
export const fmt = v => { if (!Number.isFinite(v)) return ''; const a = Math.abs(v); return a >= 1e9 ? `${+(v / 1e9).toFixed(2)}B` : a >= 1e6 ? `${+(v / 1e6).toFixed(2)}M` : a >= 1e4 ? `${+(v / 1e3).toFixed(1)}k` : a !== 0 && a < 0.001 ? v.toExponential(1) : String(+v.toPrecision(4)); };
export const shorten = (s, n) => String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s);

// A scale from numbers to pixels: linear with round ticks, or logarithmic.
export function scale(min, max, from, to, { log = false, count = 5, zero = false } = {}) {
  let ticks, lo, hi;
  if (log && min > 0) { ({ min: lo, max: hi, ticks } = logTicks(min, max)); const a = Math.log10(lo), b = Math.log10(hi) || 1; return { lo, hi, ticks, log: true, at: v => from + ((Math.log10(Math.max(v, lo)) - a) / (b - a || 1)) * (to - from) }; }
  if (zero) { min = Math.min(0, min); max = Math.max(0, max); }
  ({ min: lo, max: hi, ticks } = niceScale(min, max, count));
  return { lo, hi, ticks, log: false, at: v => from + ((v - lo) / (hi - lo || 1)) * (to - from) };
}
export const Empty = ({ children }) => <div className="chart-empty">{children}</div>;
export const Legend = ({ items, onToggle, hidden }) => items.length > 1 ? <div className="chart-legend">{items.map((s, i) => <button type="button" key={s} className={hidden?.has(s) ? 'off' : ''} onClick={() => onToggle?.(s)}><i style={{ background: color(i) }}/>{s}</button>)}</div> : null;
export const Title = ({ o }) => o.title ? <div className="chart-title">{o.title}</div> : null;

// ---- Axes drawn around a plot area.
export function Frame({ W, H, pad, xs, ys, o, xTitle, yTitle, children, rotate }) {
  return <>
    {ys.ticks.map(t => <g key={'y' + t}><line x1={pad.l} x2={W - pad.r} y1={ys.at(t)} y2={ys.at(t)} className={`chart-grid${t === 0 ? ' zero' : ''}`}/><text x={pad.l - 8} y={ys.at(t) + 3.5} textAnchor="end" className="chart-axis">{fmt(t)}</text></g>)}
    {xs?.ticks?.map(t => <g key={'x' + t}>{o.grid !== false && o.xgrid && <line y1={pad.t} y2={H - pad.b} x1={xs.at(t)} x2={xs.at(t)} className="chart-grid"/>}<text x={xs.at(t)} y={H - pad.b + 17} textAnchor="middle" className="chart-axis">{fmt(t)}</text></g>)}
    {xTitle && <text x={(pad.l + W - pad.r) / 2} y={H - 6} textAnchor="middle" className="chart-axis-title">{xTitle}</text>}
    {yTitle && <text transform={`translate(13 ${(pad.t + H - pad.b) / 2}) rotate(-90)`} textAnchor="middle" className="chart-axis-title">{yTitle}</text>}
    {children}
  </>;
}
export const layout = (compact, o) => { const W = 640, H = compact ? 280 : 420; return { W, H, pad: { l: o.yTitle ? 70 : 58, r: 20, t: 16, b: (compact ? 38 : 50) + (o.xTitle ? 12 : 0) } }; };

export { minimum, maximum } from './stats.mjs';
