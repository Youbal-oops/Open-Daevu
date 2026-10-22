import { compileExpr } from './mathexpr.mjs';
// Formulas that plugins add. Built-in names always win.
const CUSTOM = new Map();
export function setSheetFunctions(list) { CUSTOM.clear(); for (const f of list || []) { try { CUSTOM.set(f.name, { args: f.args, run: compileExpr(f.expr) }); } catch {} } }
export function columnName(index) { let s = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; }
const columnIndex = letters => [...letters.toUpperCase()].reduce((v, c) => v * 26 + c.charCodeAt(0) - 64, 0) - 1;
export function address(ref) { const m = /^\$?([A-Z]+)\$?([1-9]\d*)$/i.exec(ref); if (!m) throw Error('#REF!'); return [Number(m[2]) - 1, columnIndex(m[1])]; }

// ---- Values. Cells hold text; a formula result is a number, text, or true/false. Dates are written 2026-10-22.
const DAY = 86400000, ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+Z?)?$/;
const serialOf = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / DAY);
const localStamp = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const isoOf = serial => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * DAY); return d.toISOString().slice(0, 10); };
const asDate = value => { const m = typeof value === 'string' ? ISO.exec(value.trim()) : null; return m ? serialOf(+m[1], +m[2], +m[3]) : null; };
const num = value => {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === '' || value == null) return 0;
  if (typeof value === 'number') return value;
  const text = String(value).trim(), pct = /^(-?[\d.,]+)%$/.exec(text);
  if (pct) { const n = Number(pct[1].replace(/,/g, '')); if (Number.isFinite(n)) return n / 100; }
  const n = Number(text.replace(/^[$€£₹]/, '').replace(/,(?=\d{3}(\D|$))/g, ''));
  if (text !== '' && Number.isFinite(n)) return n;
  const date = asDate(text); if (date != null) return date;
  throw Error('#VALUE!');
};
const isNumeric = value => { if (typeof value === 'number') return Number.isFinite(value); if (typeof value === 'boolean' || value === '' || value == null) return false; try { num(value); return asDate(value) == null; } catch { return false; } };
const text = value => value === true ? 'TRUE' : value === false ? 'FALSE' : value == null ? '' : String(value);
const truth = value => { if (typeof value === 'boolean') return value; if (typeof value === 'string') { const u = value.trim().toUpperCase(); if (u === 'TRUE') return true; if (u === 'FALSE' || u === '') return false; } return num(value) !== 0; };
const roundTo = (value, digits, mode = 'round') => { if (!Number.isInteger(digits) || Math.abs(digits) > 100) throw Error('#NUM!'); const scale = 10 ** digits, v = value * scale; return (mode === 'up' ? Math.sign(v) * Math.ceil(Math.abs(v) - 1e-12) : mode === 'down' ? Math.trunc(v + Math.sign(v) * 1e-12) : Math.round(v + Math.sign(v) * Number.EPSILON * Math.abs(v))) / scale; };
class Range { constructor(rows) { this.rows = rows; } get height() { return this.rows.length; } get width() { return this.rows[0]?.length || 0; } flat() { return this.rows.flat(); } }
const flat = args => args.flatMap(v => v instanceof Range ? v.flat() : [v]);
const numbers = args => flat(args).filter(isNumeric).map(num);

// Criteria like ">5", "<>x", "=A", "app*" as used by SUMIF and COUNTIF.
function matcher(criteria) {
  if (criteria instanceof Range) throw Error('#VALUE!');
  const raw = typeof criteria === 'string' ? criteria : text(criteria), m = /^(<>|<=|>=|=|<|>)?(.*)$/s.exec(raw), op = m[1] || '=', want = m[2];
  const wantNumber = want.trim() !== '' && Number.isFinite(Number(want)) ? Number(want) : null, wantDate = asDate(want);
  const wild = /[*?]/.test(want) ? new RegExp('^' + want.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i') : null;
  return cell => {
    const value = cell, str = text(value).toLowerCase();
    if (op === '=' || op === '<>') {
      let eq;
      if (want === '') eq = value === '' || value == null; else if (wantNumber != null && isNumeric(value)) eq = num(value) === wantNumber; else if (wantDate != null && asDate(value) != null) eq = asDate(value) === wantDate; else if (wild) eq = wild.test(text(value)); else eq = str === want.toLowerCase();
      return op === '=' ? eq : !eq;
    }
    let a, b;
    if (wantNumber != null && isNumeric(value)) { a = num(value); b = wantNumber; } else if (wantDate != null && asDate(value) != null) { a = asDate(value); b = wantDate; } else if (wantNumber == null && wantDate == null) { a = str; b = want.toLowerCase(); } else return false;
    return op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
  };
}
function compare(a, b) {
  if (isNumeric(a) && isNumeric(b)) return num(a) - num(b);
  const da = asDate(a), db = asDate(b); if (da != null && db != null) return da - db;
  const x = text(a).toLowerCase(), y = text(b).toLowerCase(); return x < y ? -1 : x > y ? 1 : 0;
}
const looseEqual = (a, b) => compare(a, b) === 0;

// Spreadsheet text patterns for TEXT(): 0, 0.00, #,##0, 0%, yyyy-mm-dd.
function formatNumber(value, pattern) {
  const p = String(pattern);
  if (/[ymd]/i.test(p) && /y|d/i.test(p)) { const iso = isoOf(num(value)), [Y, M, D] = iso.split('-'); return p.replace(/yyyy/gi, Y).replace(/yy/gi, Y.slice(2)).replace(/mm/gi, M).replace(/dd/gi, D); }
  const pct = p.includes('%'), body = p.replace(/%/g, ''), decimals = (body.split('.')[1] || '').replace(/[^0#]/g, '').length, group = body.includes(','), v = pct ? num(value) * 100 : num(value);
  let out = Math.abs(v).toFixed(decimals);
  if (group) out = out.replace(/\B(?=(\d{3})+(?!\d))/g, (m, i) => out.split('.')[0].length - i > 0 ? ',' : '').replace(/^(\d+)/, d => d);
  if (group) { const [i, f] = Math.abs(v).toFixed(decimals).split('.'); out = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : ''); }
  const prefix = (/^[^0#,.]*/.exec(body) || [''])[0], suffix = (/[^0#,.]*$/.exec(body) || [''])[0];
  return (v < 0 ? '-' : '') + prefix + out + suffix + (pct ? '%' : '');
}

// ---- The calculator. context = { sheets: { 'name': () => rows }, self: 'name' } lets formulas reach other sheets.
export function calculateSheet(rows, context = {}) {
  const books = context.sheets || {}, selfName = String(context.self || '').toLowerCase();
  const cache = new Map(), visiting = new Set(); let budget = 100000;
  const files = context.files || {}, SEP = '\u0000', grids = new Map([[SEP, rows]]);
  // A grid is named by its file and sheet; the file is empty for the document being calculated.
  const gridOf = (name, file = '', home = SEP) => {
    const homeFile = home.split(SEP)[0];
    if (!file) file = homeFile;
    if (!file && (!name || name.toLowerCase() === selfName)) return SEP;
    if (file === homeFile && !name && homeFile) return home;
    const f = file.toLowerCase(), key = f + SEP + (name || '').toLowerCase();
    if (!grids.has(key)) {
      const book = f ? files[f] : { sheets: books, first: '' };
      if (!book) throw Error('#REF!');
      const get = book.sheets[(name || book.first || '').toLowerCase()];
      if (!get) throw Error('#REF!');
      grids.set(key, get());
    }
    return key;
  };
  function cell(grid, y, x, depth = 0) {
    const key = `${grid}|${y}:${x}`;
    if (cache.has(key)) return cache.get(key);
    if (--budget < 0 || depth > 100) throw Error('#LIMIT!');
    if (visiting.has(key)) throw Error('#CYCLE!');
    const raw = String(grids.get(grid)?.[y]?.[x] ?? '');
    if (!raw.startsWith('=')) return raw;
    visiting.add(key);
    try { const result = parse(raw.slice(1), depth, grid, [y, x]); if (typeof result === 'number' && !Number.isFinite(result)) throw Error('#NUM!'); if (result instanceof Range) throw Error('#VALUE!'); cache.set(key, result); return result; }
    finally { visiting.delete(key); }
  }
  function parse(source, depth, home, at = [0, 0]) {
    if (source.length > 4000) throw Error('#LIMIT!');
    const tokens = []; let pos = 0;
    const pattern = /\s*(?:(\d*\.?\d+(?:[eE][+-]?\d+)?)|("(?:[^"]|"")*")|(?:('?)\[([^\]]+)\]((?:[^'!]|'')*)\3!)|('(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!|(\$?[A-Za-z]+\$?[1-9]\d*(?![A-Za-z0-9_.(])|[A-Za-z_][A-Za-z0-9_.]*)|(<>|<=|>=|[+\-*/^%=<>&(),:;])|(#REF!))/y;
    while (pos < source.length) {
      if (!source.slice(pos).trim()) break;
      pattern.lastIndex = pos; const m = pattern.exec(source); if (!m) throw Error('#ERROR!');
      tokens.push(m[1] ? { n: Number(m[1]) } : m[2] ? { s: m[2].slice(1, -1).replace(/""/g, '"') } : m[4] !== undefined ? { file: m[4], sheet: (m[5] || '').replace(/''/g, "'") } : m[6] ? { sheet: m[6].startsWith("'") ? m[6].slice(1, -1).replace(/''/g, "'") : m[6] } : m[7] ? m[7].toUpperCase() : m[8] ?? m[9]);
      pos = pattern.lastIndex;
    }
    let i = 0;
    const peek = () => tokens[i], take = () => tokens[i++], need = t => { if (take() !== t) throw Error('#ERROR!'); };
    const isRef = t => typeof t === 'string' && /^\$?[A-Z]+\$?[1-9]\d*$/.test(t), isCol = t => typeof t === 'string' && /^\$?[A-Z]{1,3}$/.test(t);
    function rangeNode(grid, a, b) {
      const [y, x] = a, [ey, ex] = b;
      if ((Math.abs(ey - y) + 1) * (Math.abs(ex - x) + 1) > 10000) throw Error('#LIMIT!');
      return () => { const out = []; for (let r = Math.min(y, ey); r <= Math.max(y, ey); r++) { const line = []; for (let c = Math.min(x, ex); c <= Math.max(x, ex); c++) line.push(cell(grid, r, c, depth + 1)); out.push(line); } return new Range(out); };
    }
    function primary(level) {
      if (level > 100) throw Error('#LIMIT!');
      const t = take(); let node;
      if (t && typeof t === 'object' && 'sheet' in t) {
        const grid = gridOf(t.sheet, t.file, home), first = take();
        if (isRef(first)) {
          const a = address(first);
          if (peek() === ':') { take(); const b = address(take()); node = rangeNode(grid, a, b); node.ref = [Math.min(a[0], b[0]), Math.min(a[1], b[1])]; } else { node = () => cell(grid, a[0], a[1], depth + 1); node.ref = a; }
        } else if (isCol(first) && peek() === ':') { take(); const second = take(), last = Math.max(0, (grids.get(grid)?.length || 1) - 1); node = rangeNode(grid, [0, columnIndex(first.replace(/\$/g, ''))], [last, columnIndex(String(second).replace(/\$/g, ''))]); }
        else throw Error('#REF!');
      }
      else if (t && typeof t === 'object') node = () => t.n ?? t.s;
      else if (t === '+' || t === '-') { const a = primary(level + 1); node = () => (t === '-' ? -1 : 1) * num(a()); }
      else if (t === '(') { node = expression(0, level + 1); need(')'); }
      else if (isRef(t) && peek() !== '(') {
        const a = address(t);
        if (peek() === ':') { take(); const b = address(take()); node = rangeNode(home, a, b); node.ref = [Math.min(a[0], b[0]), Math.min(a[1], b[1])]; } else { node = () => cell(home, a[0], a[1], depth + 1); node.ref = a; }
      } else if (isCol(t) && peek() === ':' && isCol(tokens[i + 1])) { take(); const second = take(), last = Math.max(0, (grids.get(home)?.length || 1) - 1); node = rangeNode(home, [0, columnIndex(t.replace(/\$/g, ''))], [last, columnIndex(second.replace(/\$/g, ''))]); }
      else if (t === '#REF!') node = () => { throw Error('#REF!'); };
      else if (t === 'TRUE' || t === 'FALSE') { if (peek() === '(') { take(); need(')'); } node = () => t === 'TRUE'; }
      else if (typeof t === 'string' && peek() === '(') {
        take(); const args = []; if (peek() !== ')') { do { args.push(expression(0, level + 1)); if (peek() !== ',' && peek() !== ';') break; take(); } while (true); } need(')');
        node = () => call(t, args, home, at);
      } else throw Error('#ERROR!');
      while (peek() === '%') { take(); const previous = node; node = () => num(previous()) / 100; }
      return node;
    }
    const precedence = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };
    function expression(min, level) {
      if (level > 100) throw Error('#LIMIT!');
      let left = primary(level + 1);
      while (precedence[peek()] >= min) {
        const op = take(), a = left, b = expression(precedence[op] + (op === '^' ? 0 : 1), level + 1);
        left = () => {
          const av = a(), bv = b(); if (av instanceof Range || bv instanceof Range) throw Error('#VALUE!');
          if (op === '&') { const x = text(av), y = text(bv); if (x.length + y.length > 100000) throw Error('#LIMIT!'); return x + y; }
          if (['=', '<>', '<', '>', '<=', '>='].includes(op)) { const c = compare(av, bv); return op === '=' ? c === 0 : op === '<>' ? c !== 0 : op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0; }
          // A date plus or minus days stays a date; two dates subtract to a number of days.
          const da = asDate(av), db = asDate(bv);
          if ((op === '+' || op === '-') && da != null && db == null && isNumeric(bv)) return isoOf(op === '+' ? da + num(bv) : da - num(bv));
          const x = num(av), y = num(bv); if (op === '/' && y === 0) throw Error('#DIV/0!');
          return op === '+' ? x + y : op === '-' ? x - y : op === '*' ? x * y : op === '/' ? x / y : x ** y;
        };
      }
      return left;
    }
    const result = expression(0, 0); if (i !== tokens.length) throw Error('#ERROR!'); return result();
  }

  // ---- Functions.
  const need = (args, min, max = min) => { if (args.length < min || args.length > max) throw Error('#VALUE!'); };
  const range = v => { if (!(v instanceof Range)) throw Error('#VALUE!'); return v; };
  const pairs = (args, from) => { const out = []; for (let k = from; k < args.length; k += 2) { const r = range(args[k]); if (args[k + 1] === undefined) throw Error('#VALUE!'); out.push([r, matcher(args[k + 1])]); } if (out.some(([r]) => r.height !== out[0][0].height || r.width !== out[0][0].width)) throw Error('#VALUE!'); return out; };
  const hits = list => { const first = list[0][0], at = []; for (let y = 0; y < first.height; y++) for (let x = 0; x < first.width; x++) if (list.every(([r, test]) => test(r.rows[y][x]))) at.push([y, x]); return at; };
  const stat = (n, f) => { if (!n.length) throw Error('#DIV/0!'); return f(n); };
  const sum = n => n.reduce((a, b) => a + b, 0), mean = n => sum(n) / n.length;
  const variance = (n, sample) => { if (n.length < (sample ? 2 : 1)) throw Error('#DIV/0!'); const m = mean(n); return n.reduce((a, b) => a + (b - m) ** 2, 0) / (n.length - (sample ? 1 : 0)); };
  const median = n => { const s = [...n].sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  const dateParts = v => { const s = asDate(v) ?? num(v), d = new Date(Date.UTC(1899, 11, 30) + s * DAY); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay(), serial: s }; };
  const addMonths = (v, months) => { const { y, m, d } = dateParts(v), t = new Date(Date.UTC(y, m - 1 + months, 1)), last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); return isoOf(serialOf(t.getUTCFullYear(), t.getUTCMonth() + 1, Math.min(d, last))); };
  const pmt = (rate, n, pv, fv = 0, type = 0) => rate === 0 ? -(pv + fv) / n : -(rate * (pv * (1 + rate) ** n + fv)) / ((1 + rate * type) * ((1 + rate) ** n - 1));
  function lookupIn(key, vector, exact) {
    const list = vector.flat();
    if (exact) return list.findIndex(v => looseEqual(v, key) && !(v === '' && key !== ''));
    let best = -1; for (let k = 0; k < list.length; k++) { if (list[k] === '' ) continue; if (compare(list[k], key) <= 0) best = k; else break; } return best;
  }
  function call(name, args, home, at = [0, 0]) {
    const lazy = { IF: 1, IFERROR: 1, IFNA: 1, IFS: 1, SWITCH: 1, CHOOSE: 1 };
    if (name === 'IF') { if (args.length < 2 || args.length > 3) throw Error('#VALUE!'); return truth(args[0]()) ? args[1]() : args[2]?.() ?? false; }
    if (name === 'IFERROR' || name === 'IFNA') { if (args.length !== 2) throw Error('#VALUE!'); try { return args[0](); } catch (e) { if (name === 'IFNA' && e.message !== '#N/A') throw e; return args[1](); } }
    if (name === 'IFS') { if (args.length < 2 || args.length % 2) throw Error('#VALUE!'); for (let k = 0; k < args.length; k += 2) if (truth(args[k]())) return args[k + 1](); throw Error('#N/A'); }
    if (name === 'SWITCH') { if (args.length < 3) throw Error('#VALUE!'); const key = args[0](); for (let k = 1; k + 1 < args.length; k += 2) if (looseEqual(args[k](), key)) return args[k + 1](); if (args.length % 2 === 0) return args.at(-1)(); throw Error('#N/A'); }
    if (name === 'CHOOSE') { if (args.length < 2) throw Error('#VALUE!'); const k = Math.trunc(num(args[0]())); if (k < 1 || k >= args.length) throw Error('#VALUE!'); return args[k](); }
    if (name === 'AND' || name === 'OR' || name === 'XOR') { const v = flat(args.map(a => a())).filter(x => x !== '' && x != null).map(truth); if (!v.length) throw Error('#VALUE!'); return name === 'AND' ? v.every(Boolean) : name === 'OR' ? v.some(Boolean) : v.filter(Boolean).length % 2 === 1; }
    if (name === 'ISERROR' || name === 'ISNA') { try { args[0](); return false; } catch (e) { return name === 'ISERROR' || e.message === '#N/A'; } }
    if (name === 'ROW' || name === 'COLUMN') { const k = name === 'ROW' ? 0 : 1; if (!args.length) return at[k] + 1; if (args.length > 1 || !args[0].ref) throw Error('#VALUE!'); return args[0].ref[k] + 1; }
    const v = args.map(f => f());
    switch (name) {
      case 'SUM': return sum(numbers(v));
      case 'PRODUCT': return numbers(v).reduce((a, b) => a * b, 1);
      case 'COUNT': return numbers(v).length;
      case 'COUNTA': return flat(v).filter(n => n !== '' && n != null).length;
      case 'COUNTBLANK': return flat(v).filter(n => n === '' || n == null).length;
      case 'AVERAGE': return stat(numbers(v), mean);
      case 'MIN': { const n = numbers(v); return n.length ? Math.min(...n) : 0; }
      case 'MAX': { const n = numbers(v); return n.length ? Math.max(...n) : 0; }
      case 'MEDIAN': return stat(numbers(v), median);
      case 'MODE': return stat(numbers(v), n => { const c = new Map(); n.forEach(x => c.set(x, (c.get(x) || 0) + 1)); return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0]; });
      case 'STDEV': case 'STDEV.S': return Math.sqrt(variance(numbers(v), true));
      case 'STDEVP': case 'STDEV.P': return Math.sqrt(variance(numbers(v), false));
      case 'VAR': case 'VAR.S': return variance(numbers(v), true);
      case 'VARP': case 'VAR.P': return variance(numbers(v), false);
      case 'LARGE': case 'SMALL': { need(v, 2); const n = numbers([v[0]]).sort((a, b) => a - b), k = Math.trunc(num(v[1])); if (k < 1 || k > n.length) throw Error('#NUM!'); return name === 'LARGE' ? n[n.length - k] : n[k - 1]; }
      case 'RANK': { need(v, 2, 3); const n = numbers([v[1]]), x = num(v[0]), asc = v[2] !== undefined && truth(v[2]); if (!n.includes(x)) throw Error('#N/A'); return 1 + n.filter(y => asc ? y < x : y > x).length; }
      case 'SUMPRODUCT': { const rs = v.map(range), size = rs[0].height * rs[0].width; if (rs.some(r => r.height * r.width !== size)) throw Error('#VALUE!'); const lists = rs.map(r => r.flat()); let total = 0; for (let k = 0; k < size; k++) total += lists.reduce((a, l) => a * (isNumeric(l[k]) ? num(l[k]) : 0), 1); return total; }
      case 'SUMIF': case 'AVERAGEIF': { need(v, 2, 3); const crit = range(v[0]), target = v[2] === undefined ? crit : range(v[2]), at = hits([[crit, matcher(v[1])]]), n = at.map(([y, x]) => target.rows[y]?.[x]).filter(isNumeric).map(num); return name === 'SUMIF' ? sum(n) : stat(n, mean); }
      case 'COUNTIF': { need(v, 2); return hits([[range(v[0]), matcher(v[1])]]).length; }
      case 'SUMIFS': case 'AVERAGEIFS': case 'MAXIFS': case 'MINIFS': { if (v.length < 3 || v.length % 2 === 0) throw Error('#VALUE!'); const target = range(v[0]), list = pairs(v, 1); if (list[0][0].height !== target.height || list[0][0].width !== target.width) throw Error('#VALUE!'); const n = hits(list).map(([y, x]) => target.rows[y][x]).filter(isNumeric).map(num); return name === 'SUMIFS' ? sum(n) : name === 'AVERAGEIFS' ? stat(n, mean) : name === 'MAXIFS' ? (n.length ? Math.max(...n) : 0) : (n.length ? Math.min(...n) : 0); }
      case 'COUNTIFS': { if (v.length < 2 || v.length % 2) throw Error('#VALUE!'); return hits(pairs(v, 0)).length; }
      case 'ROUND': { need(v, 1, 2); return roundTo(num(v[0]), num(v[1] ?? 0)); }
      case 'ROUNDUP': { need(v, 1, 2); return roundTo(num(v[0]), num(v[1] ?? 0), 'up'); }
      case 'ROUNDDOWN': { need(v, 1, 2); return roundTo(num(v[0]), num(v[1] ?? 0), 'down'); }
      case 'INT': need(v, 1); return Math.floor(num(v[0]));
      case 'TRUNC': need(v, 1, 2); return roundTo(num(v[0]), num(v[1] ?? 0), 'down');
      case 'ABS': need(v, 1); return Math.abs(num(v[0]));
      case 'SIGN': need(v, 1); return Math.sign(num(v[0]));
      case 'SQRT': { need(v, 1); const n = num(v[0]); if (n < 0) throw Error('#NUM!'); return Math.sqrt(n); }
      case 'EXP': need(v, 1); return Math.exp(num(v[0]));
      case 'LN': { need(v, 1); const n = num(v[0]); if (n <= 0) throw Error('#NUM!'); return Math.log(n); }
      case 'LOG10': { need(v, 1); const n = num(v[0]); if (n <= 0) throw Error('#NUM!'); return Math.log10(n); }
      case 'LOG': { need(v, 1, 2); const n = num(v[0]); if (n <= 0) throw Error('#NUM!'); return Math.log(n) / Math.log(v[1] === undefined ? 10 : num(v[1])); }
      case 'POWER': need(v, 2); return num(v[0]) ** num(v[1]);
      case 'MOD': { need(v, 2); const d = num(v[1]); if (d === 0) throw Error('#DIV/0!'); const n = num(v[0]); return n - d * Math.floor(n / d); }
      case 'CEILING': { need(v, 1, 2); const s = v[1] === undefined ? 1 : num(v[1]); return s === 0 ? 0 : Math.ceil(num(v[0]) / s) * s; }
      case 'FLOOR': { need(v, 1, 2); const s = v[1] === undefined ? 1 : num(v[1]); return s === 0 ? 0 : Math.floor(num(v[0]) / s) * s; }
      case 'PI': return Math.PI;
      case 'NOT': need(v, 1); return !truth(v[0]);
      case 'ISBLANK': need(v, 1); return v[0] === '' || v[0] == null;
      case 'ISNUMBER': need(v, 1); return isNumeric(v[0]);
      case 'ISTEXT': need(v, 1); return typeof v[0] === 'string' && v[0] !== '' && !isNumeric(v[0]);
      case 'CONCAT': case 'CONCATENATE': { const out = flat(v).map(text).join(''); if (out.length > 100000) throw Error('#LIMIT!'); return out; }
      case 'TEXTJOIN': { if (v.length < 3) throw Error('#VALUE!'); const items = flat(v.slice(2)).map(text).filter(s => !truth(v[1]) || s !== ''); return items.join(text(v[0])); }
      case 'LEFT': need(v, 1, 2); return text(v[0]).slice(0, v[1] === undefined ? 1 : Math.max(0, num(v[1])));
      case 'RIGHT': { need(v, 1, 2); const s = text(v[0]), n = v[1] === undefined ? 1 : Math.max(0, num(v[1])); return n ? s.slice(-n) : ''; }
      case 'MID': { need(v, 3); const start = Math.trunc(num(v[1])); if (start < 1) throw Error('#VALUE!'); return text(v[0]).slice(start - 1, start - 1 + Math.max(0, num(v[2]))); }
      case 'LEN': need(v, 1); return text(v[0]).length;
      case 'UPPER': need(v, 1); return text(v[0]).toUpperCase();
      case 'LOWER': need(v, 1); return text(v[0]).toLowerCase();
      case 'PROPER': need(v, 1); return text(v[0]).toLowerCase().replace(/(^|[^a-z0-9'])([a-z])/g, (m, a, b) => a + b.toUpperCase());
      case 'TRIM': need(v, 1); return text(v[0]).trim().replace(/\s+/g, ' ');
      case 'REPT': { need(v, 2); const n = Math.trunc(num(v[1])); if (n < 0 || text(v[0]).length * n > 100000) throw Error('#VALUE!'); return text(v[0]).repeat(n); }
      case 'EXACT': need(v, 2); return text(v[0]) === text(v[1]);
      case 'SUBSTITUTE': { need(v, 3, 4); const s = text(v[0]), from = text(v[1]), to = text(v[2]); if (from === '') return s; if (v[3] === undefined) return s.split(from).join(to); let k = 0; return s.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), m => ++k === num(v[3]) ? to : m); }
      case 'REPLACE': { need(v, 4); const s = text(v[0]), at = Math.trunc(num(v[1])) - 1; return s.slice(0, at) + text(v[3]) + s.slice(at + Math.trunc(num(v[2]))); }
      case 'FIND': case 'SEARCH': { need(v, 2, 3); const hay = name === 'FIND' ? text(v[1]) : text(v[1]).toLowerCase(), needle = name === 'FIND' ? text(v[0]) : text(v[0]).toLowerCase(), at = hay.indexOf(needle, v[2] === undefined ? 0 : num(v[2]) - 1); if (at < 0) throw Error('#VALUE!'); return at + 1; }
      case 'VALUE': need(v, 1); return num(v[0]);
      case 'TEXT': need(v, 2); return formatNumber(v[0], text(v[1]));
      case 'VLOOKUP': case 'HLOOKUP': {
        need(v, 3, 4); const table = range(v[1]), index = Math.trunc(num(v[2])), exact = v[3] !== undefined && !truth(v[3]), horizontal = name === 'HLOOKUP';
        const keys = horizontal ? table.rows[0] : table.rows.map(r => r[0]), at = lookupIn(v[0], { flat: () => keys }, exact);
        if (at < 0) throw Error('#N/A'); if (index < 1 || index > (horizontal ? table.height : table.width)) throw Error('#REF!');
        return horizontal ? table.rows[index - 1][at] : table.rows[at][index - 1];
      }
      case 'XLOOKUP': {
        need(v, 3, 6); const keys = range(v[1]), out = range(v[2]), list = keys.flat(), at = list.findIndex(x => looseEqual(x, v[0]) && !(x === '' && v[0] !== ''));
        if (at < 0) { if (v[3] !== undefined) return v[3]; throw Error('#N/A'); }
        return out.flat()[at] ?? '';
      }
      case 'MATCH': { need(v, 2, 3); const mode = v[2] === undefined ? 1 : num(v[2]), list = range(v[1]).flat(); if (mode === 0) { const at = list.findIndex(x => looseEqual(x, v[0])); if (at < 0) throw Error('#N/A'); return at + 1; } const at = lookupIn(v[0], { flat: () => list }, false); if (at < 0) throw Error('#N/A'); return at + 1; }
      case 'INDEX': { need(v, 2, 3); const r = range(v[0]); let row = Math.trunc(num(v[1])), col = v[2] === undefined ? 1 : Math.trunc(num(v[2])); if (v[2] === undefined && r.height === 1) { col = row; row = 1; } if (row < 1 || col < 1 || row > r.height || col > r.width) throw Error('#REF!'); return r.rows[row - 1][col - 1]; }
      case 'ROWS': need(v, 1); return range(v[0]).height;
      case 'COLUMNS': need(v, 1); return range(v[0]).width;
      case 'TODAY': return localStamp(new Date()).slice(0, 10);
      case 'NOW': return localStamp(new Date()).slice(0, 16);
      case 'DATE': { need(v, 3); const t = new Date(Date.UTC(num(v[0]), num(v[1]) - 1, num(v[2]))); return t.toISOString().slice(0, 10); }
      case 'YEAR': need(v, 1); return dateParts(v[0]).y;
      case 'MONTH': need(v, 1); return dateParts(v[0]).m;
      case 'DAY': need(v, 1); return dateParts(v[0]).d;
      case 'WEEKDAY': need(v, 1, 2); { const w = dateParts(v[0]).dow; return v[1] !== undefined && num(v[1]) === 2 ? (w + 6) % 7 + 1 : w + 1; }
      case 'DAYS': need(v, 2); return dateParts(v[0]).serial - dateParts(v[1]).serial;
      case 'EDATE': need(v, 2); return addMonths(v[0], Math.trunc(num(v[1])));
      case 'EOMONTH': { need(v, 2); const { y, m } = dateParts(addMonths(v[0], Math.trunc(num(v[1])))); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }
      case 'DATEDIF': { need(v, 3); const a = dateParts(v[0]), b = dateParts(v[1]), unit = text(v[2]).toUpperCase(); if (b.serial < a.serial) throw Error('#NUM!'); const months = (b.y - a.y) * 12 + b.m - a.m - (b.d < a.d ? 1 : 0); return unit === 'D' ? b.serial - a.serial : unit === 'M' ? months : unit === 'Y' ? Math.floor(months / 12) : (() => { throw Error('#NUM!'); })(); }
      case 'NETWORKDAYS': { need(v, 2); let a = dateParts(v[0]).serial, b = dateParts(v[1]).serial, n = 0; const flip = a > b; if (flip) [a, b] = [b, a]; if (b - a > 36600) throw Error('#LIMIT!'); for (let s = a; s <= b; s++) { const w = new Date(Date.UTC(1899, 11, 30) + s * DAY).getUTCDay(); if (w !== 0 && w !== 6) n++; } return flip ? -n : n; }
      case 'PMT': need(v, 3, 5); return pmt(num(v[0]), num(v[1]), num(v[2]), num(v[3] ?? 0), num(v[4] ?? 0));
      case 'FV': { need(v, 3, 5); const r = num(v[0]), n = num(v[1]), p = num(v[2]), pv = num(v[3] ?? 0), t = num(v[4] ?? 0); return r === 0 ? -(pv + p * n) : -(pv * (1 + r) ** n + p * (1 + r * t) * ((1 + r) ** n - 1) / r); }
      case 'PV': { need(v, 3, 5); const r = num(v[0]), n = num(v[1]), p = num(v[2]), fv = num(v[3] ?? 0), t = num(v[4] ?? 0); return r === 0 ? -(fv + p * n) : -(fv + p * (1 + r * t) * ((1 + r) ** n - 1) / r) / (1 + r) ** n; }
      case 'NPV': { if (v.length < 2) throw Error('#VALUE!'); const r = num(v[0]); return numbers(v.slice(1)).reduce((a, c, k) => a + c / (1 + r) ** (k + 1), 0); }
      case 'IRR': { const cf = numbers([v[0]]); if (cf.length < 2 || !cf.some(x => x > 0) || !cf.some(x => x < 0)) throw Error('#NUM!'); let r = v[1] === undefined ? 0.1 : num(v[1]); for (let k = 0; k < 100; k++) { let f = 0, d = 0; cf.forEach((c, t) => { f += c / (1 + r) ** t; d -= t * c / (1 + r) ** (t + 1); }); if (Math.abs(f) < 1e-9) return r; if (d === 0) break; r -= f / d; } throw Error('#NUM!'); }
      default: {
        const custom = CUSTOM.get(name); if (!custom) throw Error('#NAME?');
        need(v, custom.args.length); const out = custom.run(Object.fromEntries(custom.args.map((a, k) => [a, num(v[k])])));
        if (!Number.isFinite(out)) throw Error('#VALUE!'); return Number(out.toPrecision(12));
      }
    }
  }
  return rows.map((row, y) => row.map((_, x) => { try { return cell(SEP, y, x); } catch (e) { return /^#[A-Z0-9/?!]+$/.test(e.message) ? e.message : '#ERROR!'; } }));
}

// All sheets of a workbook as a calculation context. `parse` turns a sheet's CSV text into rows.
export function sheetContext(sheets, parse, self, files) {
  const map = {};
  for (const s of sheets || []) { let rows; map[String(s.name).toLowerCase()] = () => rows ||= parse(s.content || ''); }
  return { sheets: map, self, files };
}
