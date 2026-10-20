export function columnName(index) { let s = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; }
export function address(ref) { const m = /^\$?([A-Z]+)\$?([1-9]\d*)$/i.exec(ref); if (!m) throw Error('#REF!'); return [Number(m[2]) - 1, [...m[1].toUpperCase()].reduce((v, c) => v * 26 + c.charCodeAt(0) - 64, 0) - 1]; }
const number = value => { if (value === '' || value == null) return 0; const n = Number(value); if (!Number.isFinite(n)) throw Error('#VALUE!'); return n; };
export function calculateSheet(rows) {
  const cache = new Map(), visiting = new Set(); let budget = 100000;
  function cell(y, x, depth = 0) {
    const key = `${y}:${x}`;
    if (cache.has(key)) return cache.get(key);
    if (--budget < 0 || depth > 100) throw Error('#LIMIT!');
    if (visiting.has(key)) throw Error('#CYCLE!');
    const raw = String(rows[y]?.[x] ?? '');
    if (!raw.startsWith('=')) return raw;
    visiting.add(key);
    try { const result = parse(raw.slice(1), depth); if (typeof result === 'number' && !Number.isFinite(result)) throw Error('#NUM!'); if (Array.isArray(result)) throw Error('#VALUE!'); cache.set(key, result); return result; }
    finally { visiting.delete(key); }
  }
  function parse(source, depth) {
    if (source.length > 4000) throw Error('#LIMIT!');
    const tokens = []; let pos = 0;
    const pattern = /\s*(?:(\d*\.?\d+(?:[eE][+-]?\d+)?)|("(?:[^"]|"")*")|(\$?[A-Za-z]+\$?[1-9]\d*|[A-Za-z_]+)|(<>|<=|>=|[+\-*/^%=<>&(),:])|(#REF!))/y;
    while (pos < source.length) { if (!source.slice(pos).trim()) break; pattern.lastIndex = pos; const m = pattern.exec(source); if (!m) throw Error('#ERROR!'); tokens.push(m[1] ? { n: Number(m[1]) } : m[2] ? { s: m[2].slice(1, -1).replaceAll('""', '"') } : (m[3] || m[4] || m[5]).toUpperCase()); pos = pattern.lastIndex; }
    let i = 0;
    const peek = () => tokens[i], take = () => tokens[i++], need = t => { if (take() !== t) throw Error('#ERROR!'); };
    function primary(level) {
      if (level > 100) throw Error('#LIMIT!');
      const t = take(); let node;
      if (t && typeof t === 'object') node = () => t.n ?? t.s;
      else if (t === '+' || t === '-') { const a = primary(level + 1); node = () => (t === '-' ? -1 : 1) * number(a()); }
      else if (t === '(') { node = expression(0, level + 1); need(')'); }
      else if (typeof t === 'string' && /^\$?[A-Z]+\$?[1-9]\d*$/.test(t)) {
        const [y, x] = address(t);
        if (peek() === ':') { take(); const [ey, ex] = address(take()); if ((Math.abs(ey - y) + 1) * (Math.abs(ex - x) + 1) > 10000) throw Error('#LIMIT!'); node = () => { const values = []; for (let r = Math.min(y, ey); r <= Math.max(y, ey); r++) for (let c = Math.min(x, ex); c <= Math.max(x, ex); c++) values.push(cell(r, c, depth + 1)); return values; }; }
        else node = () => cell(y, x, depth + 1);
      } else if (t === '#REF!') node = () => { throw Error('#REF!'); };
      else if (t === 'TRUE' || t === 'FALSE') node = () => t === 'TRUE';
      else if (typeof t === 'string' && peek() === '(') {
        take(); const args = []; if (peek() !== ')') { do { args.push(expression(0, level + 1)); if (peek() !== ',') break; take(); } while (true); } need(')');
        node = () => {
          if (t === 'IF') { if (args.length < 2 || args.length > 3) throw Error('#VALUE!'); return args[0]() ? args[1]() : args[2]?.() ?? false; }
          if (t === 'IFERROR') { if (args.length !== 2) throw Error('#VALUE!'); try { return args[0](); } catch { return args[1](); } }
          const v = args.flatMap(fn => { const value = fn(); return Array.isArray(value) ? value : [value]; });
          const nums = () => v.filter(n => n !== '' && n != null && Number.isFinite(Number(n))).map(Number);
          if (t === 'SUM') return nums().reduce((a, b) => a + b, 0);
          if (t === 'COUNT') return nums().length;
          if (t === 'COUNTA') return v.filter(n => n !== '' && n != null).length;
          if (['AVERAGE', 'MIN', 'MAX'].includes(t)) { const n = nums(); if (!n.length) { if (t === 'AVERAGE') throw Error('#DIV/0!'); return 0; } return t === 'AVERAGE' ? n.reduce((a, b) => a + b, 0) / n.length : t === 'MIN' ? Math.min(...n) : Math.max(...n); }
          if (t === 'ROUND') { if (v.length < 1 || v.length > 2) throw Error('#VALUE!'); const digits = number(v[1] ?? 0); if (!Number.isInteger(digits) || Math.abs(digits) > 100) throw Error('#NUM!'); const scale = 10 ** digits; return Math.round((number(v[0]) + Number.EPSILON) * scale) / scale; }
          if (t === 'ABS' && v.length === 1) return Math.abs(number(v[0]));
          throw Error('#NAME?');
        };
      } else throw Error('#ERROR!');
      while (peek() === '%') { take(); const previous = node; node = () => number(previous()) / 100; }
      return node;
    }
    const precedence = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };
    function expression(min, level) {
      if (level > 100) throw Error('#LIMIT!');
      let left = primary(level + 1);
      while (precedence[peek()] >= min) { const op = take(), a = left, b = expression(precedence[op] + (op === '^' ? 0 : 1), level + 1); left = () => {
        const av = a(), bv = b(); if (Array.isArray(av) || Array.isArray(bv)) throw Error('#VALUE!');
        if (op === '&') { const x = String(av), y = String(bv); if (x.length + y.length > 100000) throw Error('#LIMIT!'); return x + y; }
        if (['=', '<>', '<', '>', '<=', '>='].includes(op)) { const numeric = av !== '' && bv !== '' && Number.isFinite(Number(av)) && Number.isFinite(Number(bv)); const x = numeric ? Number(av) : String(av).toLowerCase(), y = numeric ? Number(bv) : String(bv).toLowerCase(); return op === '=' ? x === y : op === '<>' ? x !== y : op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : x >= y; }
        const x = number(av), y = number(bv); if (op === '/' && y === 0) throw Error('#DIV/0!'); return op === '+' ? x + y : op === '-' ? x - y : op === '*' ? x * y : op === '/' ? x / y : x ** y;
      }; }
      return left;
    }
    const result = expression(0, 0); if (i !== tokens.length) throw Error('#ERROR!'); return result();
  }
  return rows.map((row, y) => row.map((_, x) => { try { return cell(y, x); } catch (e) { return /^#[A-Z0-9/?!]+$/.test(e.message) ? e.message : '#ERROR!'; } }));
}
