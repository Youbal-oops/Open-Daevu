// Round tick values for chart axes, linear or logarithmic.
export function niceScale(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (min === max) { const d = Math.abs(min) || 1; min -= d / 2; max += d / 2; }
  const raw = (max - min) / Math.max(1, count - 1), p = 10 ** Math.floor(Math.log10(raw)), f = raw / p, step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(+t.toPrecision(12));
  return { min: lo, max: hi, ticks };
}
export function logTicks(min, max) { const lo = Math.floor(Math.log10(Math.max(min, 1e-12))), hi = Math.ceil(Math.log10(Math.max(max, min * 10))), ticks = []; for (let e = lo; e <= hi; e++) ticks.push(10 ** e); return { min: 10 ** lo, max: 10 ** hi, ticks }; }

export function minimum(values, baseline = Infinity) { for (const value of values) baseline = Math.min(baseline, value); return baseline; }
export function maximum(values, baseline = -Infinity) { for (const value of values) baseline = Math.max(baseline, value); return baseline; }
