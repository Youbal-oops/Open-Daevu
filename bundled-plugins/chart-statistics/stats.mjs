// Numbers behind the statistical and scientific charts: fits, quartiles, histograms and tidy axis ticks.
const sum = a => a.reduce((x, y) => x + y, 0), mean = a => sum(a) / a.length;
export const clean = values => values.filter(v => Number.isFinite(v));

export function quantile(sorted, q) { if (!sorted.length) return NaN; const at = (sorted.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at); return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo); }
export function describe(values) {
  const v = clean(values).sort((a, b) => a - b); if (!v.length) return null;
  const m = mean(v), sd = v.length > 1 ? Math.sqrt(sum(v.map(x => (x - m) ** 2)) / (v.length - 1)) : 0;
  return { count: v.length, mean: m, sd, min: v[0], q1: quantile(v, .25), median: quantile(v, .5), q3: quantile(v, .75), max: v.at(-1) };
}
// Box-plot figures with the usual 1.5 x IQR whiskers; anything past them is an outlier.
export function boxStats(values) {
  const v = clean(values).sort((a, b) => a - b); if (!v.length) return null;
  const q1 = quantile(v, .25), median = quantile(v, .5), q3 = quantile(v, .75), iqr = q3 - q1, low = q1 - 1.5 * iqr, high = q3 + 1.5 * iqr;
  const inside = v.filter(x => x >= low && x <= high);
  return { q1, median, q3, min: inside[0], max: inside.at(-1), outliers: v.filter(x => x < low || x > high), mean: mean(v) };
}
export function histogram(values, wanted) {
  const v = clean(values).sort((a, b) => a - b); if (!v.length) return [];
  const lo = v[0], hi = v.at(-1);
  if (lo === hi) return [{ from: lo - 0.5, to: lo + 0.5, count: v.length }];
  let bins = wanted;
  if (!bins) { const iqr = quantile(v, .75) - quantile(v, .25), width = iqr > 0 ? 2 * iqr / Math.cbrt(v.length) : 0; bins = width > 0 ? Math.ceil((hi - lo) / width) : Math.ceil(Math.log2(v.length) + 1); }
  bins = Math.max(1, Math.min(60, Math.round(bins)));
  const step = (hi - lo) / bins, out = Array.from({ length: bins }, (_, k) => ({ from: lo + k * step, to: lo + (k + 1) * step, count: 0 }));
  for (const x of v) out[Math.min(bins - 1, Math.floor((x - lo) / step))].count++;
  return out;
}

// ---- Fitting a curve to points. Each fit gives { fn, equation, r2, params }.
function solve(matrix, vector) {
  const n = vector.length, a = matrix.map((row, i) => [...row, vector[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    if (Math.abs(a[pivot][c]) < 1e-12) return null;
    [a[c], a[pivot]] = [a[pivot], a[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c] / a[c][c]; for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k]; }
  }
  return a.map((row, i) => row[n] / row[i]);
}
const rSquared = (ys, predicted) => { const m = mean(ys), total = sum(ys.map(y => (y - m) ** 2)), resid = sum(ys.map((y, i) => (y - predicted[i]) ** 2)); return total === 0 ? 1 : 1 - resid / total; };
const g = n => { const a = Math.abs(n); return a !== 0 && (a >= 1e5 || a < 1e-3) ? n.toExponential(3) : String(+n.toPrecision(4)); };
const signed = n => (n < 0 ? '− ' : '+ ') + g(Math.abs(n));

export function polyFit(xs, ys, degree) {
  if (xs.length <= degree) return null;
  const m = degree + 1, A = Array.from({ length: m }, (_, r) => Array.from({ length: m }, (_, c) => sum(xs.map(x => x ** (r + c))))), b = Array.from({ length: m }, (_, r) => sum(xs.map((x, i) => ys[i] * x ** r)));
  const coef = solve(A, b); if (!coef) return null;
  const fn = x => coef.reduce((acc, c, k) => acc + c * x ** k, 0);
  const terms = coef.map((c, k) => [c, k]).reverse().map(([c, k], at) => { const mono = k === 0 ? '' : k === 1 ? 'x' : `x^${k}`; return at === 0 ? `${g(c)}${mono}` : `${signed(c)}${mono}`; });
  return { fn, equation: 'y = ' + terms.join(' '), r2: rSquared(ys, xs.map(fn)), params: coef };
}
export const linearFit = (xs, ys) => polyFit(xs, ys, 1);
export function expFit(xs, ys) { const keep = xs.map((x, i) => [x, ys[i]]).filter(([, y]) => y > 0); if (keep.length < 2) return null; const f = linearFit(keep.map(p => p[0]), keep.map(p => Math.log(p[1]))); if (!f) return null; const b = f.params[1], a = Math.exp(f.params[0]), fn = x => a * Math.exp(b * x); return { fn, equation: `y = ${g(a)}·e^(${g(b)}x)`, r2: rSquared(ys, xs.map(fn)), params: [a, b] }; }
export function powerFit(xs, ys) { const keep = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => x > 0 && y > 0); if (keep.length < 2) return null; const f = linearFit(keep.map(p => Math.log(p[0])), keep.map(p => Math.log(p[1]))); if (!f) return null; const b = f.params[1], a = Math.exp(f.params[0]), fn = x => a * x ** b; return { fn, equation: `y = ${g(a)}·x^${g(b)}`, r2: rSquared(ys, xs.map(fn)), params: [a, b] }; }
export function logFit(xs, ys) { const keep = xs.map((x, i) => [x, ys[i]]).filter(([x]) => x > 0); if (keep.length < 2) return null; const f = linearFit(keep.map(p => Math.log(p[0])), keep.map(p => p[1])); if (!f) return null; const [a, b] = f.params, fn = x => a + b * Math.log(x); return { fn, equation: `y = ${g(a)} ${signed(b)}·ln(x)`, r2: rSquared(ys, xs.map(fn)), params: [a, b] }; }
export const FITS = { linear: ['Linear', linearFit], poly2: ['Quadratic', (x, y) => polyFit(x, y, 2)], poly3: ['Cubic', (x, y) => polyFit(x, y, 3)], exp: ['Exponential', expFit], power: ['Power', powerFit], log: ['Logarithmic', logFit] };
export function fitCurve(kind, xs, ys) { const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)); const f = FITS[kind]; return f && pairs.length > 1 ? f[1](pairs.map(p => p[0]), pairs.map(p => p[1])) : null; }
// Pearson correlation of two columns.
export function correlation(xs, ys) { const n = Math.min(xs.length, ys.length); if (n < 2) return NaN; const mx = mean(xs.slice(0, n)), my = mean(ys.slice(0, n)); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN; }

// A scale with round tick values, optionally logarithmic.
export function niceScale(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (min === max) { const d = Math.abs(min) || 1; min -= d / 2; max += d / 2; }
  const raw = (max - min) / Math.max(1, count - 1), p = 10 ** Math.floor(Math.log10(raw)), f = raw / p, step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(+t.toPrecision(12));
  return { min: lo, max: hi, ticks };
}
export function logTicks(min, max) { const lo = Math.floor(Math.log10(Math.max(min, 1e-12))), hi = Math.ceil(Math.log10(Math.max(max, min * 10))), ticks = []; for (let e = lo; e <= hi; e++) ticks.push(10 ** e); return { min: 10 ** lo, max: 10 ** hi, ticks }; }
