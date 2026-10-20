// Turns a hand-drawn stroke into a clean shape. Points are [x, y] pairs in any one coordinate space.
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function pathLength(points) { let sum = 0; for (let i = 1; i < points.length; i++) sum += dist(points[i - 1], points[i]); return sum; }
function lineDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  if (!len) return dist(p, a);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}
function simplify(points, epsilon) {
  if (points.length < 3) return points;
  let far = 0, at = 0;
  for (let i = 1; i < points.length - 1; i++) { const d = lineDistance(points[i], points[0], points.at(-1)); if (d > far) { far = d; at = i; } }
  if (far <= epsilon) return [points[0], points.at(-1)];
  return [...simplify(points.slice(0, at + 1), epsilon).slice(0, -1), ...simplify(points.slice(at), epsilon)];
}
export function recognizeShape(points) {
  if (!Array.isArray(points) || points.length < 8) return null;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y, size = Math.max(w, h), length = pathLength(points);
  if (length < 40 || size < 16) return null;
  const gap = dist(points[0], points.at(-1)), closed = gap < 0.3 * size && length > 1.25 * (w + h);
  if (!closed) {
    if (gap / length > 0.9) return { type: 'line', x1: points[0][0], y1: points[0][1], x2: points.at(-1)[0], y2: points.at(-1)[1], x, y, w, h };
    return null;
  }
  if (w < 12 || h < 12) return null;
  const cx = x + w / 2, cy = y + h / 2, radii = points.map(p => Math.hypot((p[0] - cx) / (w / 2), (p[1] - cy) / (h / 2)));
  const mean = radii.reduce((a, b) => a + b, 0) / radii.length, spread = Math.sqrt(radii.reduce((a, b) => a + (b - mean) ** 2, 0) / radii.length);
  if (Math.abs(mean - 1) < 0.14 && spread < 0.1) return { type: 'ellipse', x, y, w, h };
  const poly = simplify([...points, points[0]], 0.1 * Math.hypot(w, h)).slice(0, -1);
  if (poly.length === 3) return { type: 'triangle', x, y, w, h };
  if (poly.length === 4) {
    const nearMid = poly.filter(p => Math.abs(p[0] - cx) < 0.22 * w || Math.abs(p[1] - cy) < 0.22 * h).length;
    return { type: nearMid >= 3 ? 'diamond' : 'rect', x, y, w, h };
  }
  if (poly.length === 5 || poly.length === 6) return { type: spread < 0.16 && Math.abs(mean - 1) < 0.2 ? 'ellipse' : 'rect', x, y, w, h };
  return null;
}
