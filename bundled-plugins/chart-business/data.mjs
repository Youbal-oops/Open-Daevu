// Reads a table (rows of text) into the shapes the charts draw.
// Text to a number, or NaN. Accepts 1,234.5  12%  $9.99.
export function toNumber(value) {
  if (typeof value === 'number') return value;
  const t = String(value ?? '').trim().replace(/^[$€£₹]/, '');
  if (t === '') return NaN;
  const pct = /^(-?[\d,.]+)%$/.exec(t); if (pct) return Number(pct[1].replace(/,/g, '')) / 100;
  const n = Number(t.replace(/,(?=\d{3}(\D|$))/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

const body = rows => rows.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
// Labels down the first column, one series per other column (bars, lines, areas, pies, funnels).
export function categoryData(rows) {
  const header = (rows[0] || []).map(String), data = body(rows);
  const series = header.slice(1).map((name, i) => ({ name: name || `Series ${i + 1}`, values: data.map(r => { const n = toNumber(r[i + 1]); return Number.isFinite(n) ? n : 0; }), has: data.some(r => String(r[i + 1] ?? '').trim() !== '') })).filter(s => s.has);
  return { labels: data.map(r => String(r[0] ?? '')), series };
}
// Numbers in the first column, one series of points per other column; a third numeric column can size the points.
export function xyData(rows, bubble = false) {
  const header = (rows[0] || []).map(String), data = body(rows), numericX = data.length > 0 && data.every(r => Number.isFinite(toNumber(r[0])));
  const xs = data.map((r, i) => numericX ? toNumber(r[0]) : i), labels = data.map(r => String(r[0] ?? ''));
  const cols = header.slice(1).map((name, i) => ({ name: name || `Series ${i + 1}`, values: data.map(r => toNumber(r[i + 1])) })).filter(c => c.values.some(Number.isFinite));
  if (bubble && cols.length >= 2) return { xs, labels, numericX, series: [{ name: cols[0].name, y: cols[0].values, size: cols[1].values }], xName: header[0] || 'x' };
  return { xs, labels, numericX, series: cols.map(c => ({ name: c.name, y: c.values })), xName: header[0] || 'x' };
}
// Every column that holds numbers, for histograms and box plots.
export function columnsData(rows) {
  const header = (rows[0] || []).map(String), data = body(rows);
  return header.map((name, c) => ({ name: name || `Column ${c + 1}`, values: data.map(r => toNumber(r[c])).filter(Number.isFinite) })).filter(c => c.values.length > 0 && c.values.length >= data.length * 0.6);
}
// A grid of numbers with row and column names (heat maps).
export function matrixData(rows) {
  const header = (rows[0] || []).map(String), data = body(rows);
  return { cols: header.slice(1), rowsLabels: data.map(r => String(r[0] ?? '')), matrix: data.map(r => header.slice(1).map((_, i) => toNumber(r[i + 1]))) };
}
