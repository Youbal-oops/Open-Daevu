// A small calculator for the maths behind plots: y = sin(x) / x, r = 1 + cos(t), and so on. An expression is
// compiled once and then evaluated many times with different values for x, t or any named parameter.
const FUNCTIONS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  exp: Math.exp, ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2, sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc, sign: Math.sign,
  sec: x => 1 / Math.cos(x), csc: x => 1 / Math.sin(x), cot: x => 1 / Math.tan(x), deg: x => x * 180 / Math.PI, rad: x => x * Math.PI / 180,
  fact: n => { if (n < 0 || n > 170 || !Number.isInteger(n)) return NaN; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; },
  gamma: x => { if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * FUNCTIONS.gamma(1 - x)); x -= 1; const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; let a = c[0]; const t = x + g + 0.5; for (let i = 1; i < g + 2; i++) a += c[i] / (x + i); return Math.sqrt(2 * Math.PI) * t ** (x + 0.5) * Math.exp(-t) * a; },
  erf: x => { const s = Math.sign(x), t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
};
const FUNCTIONS_2 = { atan2: Math.atan2, pow: Math.pow, mod: (a, b) => a - b * Math.floor(a / b), min: Math.min, max: Math.max, hypot: Math.hypot, nCr: (n, k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); } };
const CONSTANTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2 };
export const RESERVED = new Set([...Object.keys(FUNCTIONS), ...Object.keys(FUNCTIONS_2), ...Object.keys(CONSTANTS), 'if']);

function tokenize(source) {
  const tokens = [], pattern = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-zπ_θ][A-Za-z0-9_]*)|(<=|>=|==|!=|[-+*/^%(),<>!]))/y;
  let pos = 0;
  while (pos < source.length) {
    if (!source.slice(pos).trim()) break;
    pattern.lastIndex = pos; const m = pattern.exec(source);
    if (!m) throw new Error(`Unexpected “${source.slice(pos).trim()[0]}”.`);
    tokens.push(m[1] !== undefined ? { n: Number(m[1]) } : m[2] !== undefined ? { id: m[2] === 'π' ? 'pi' : m[2] === 'θ' ? 'theta' : m[2] } : { op: m[3] });
    pos = pattern.lastIndex;
  }
  return tokens;
}

// Returns (scope) => number. `scope` holds values for the variables the expression uses.
export function compileExpr(source) {
  if (String(source).length > 600) throw new Error('That expression is too long.');
  const tokens = tokenize(String(source)); if (!tokens.length) throw new Error('Type an expression.');
  let i = 0, depth = 0;
  const peek = () => tokens[i], take = () => tokens[i++], isOp = (t, o) => t && t.op === o;
  function primary() {
    if (++depth > 60) throw new Error('That expression is nested too deeply.');
    const t = take(); let node;
    if (!t) throw new Error('The expression ends too soon.');
    if (t.n !== undefined) node = () => t.n;
    else if (isOp(t, '(')) { node = expr(0); if (!isOp(take(), ')')) throw new Error('A bracket is not closed.'); }
    else if (isOp(t, '-')) { const a = power(); node = s => -a(s); }
    else if (isOp(t, '+')) node = power();
    else if (t.id !== undefined) {
      const name = t.id;
      if (isOp(peek(), '(') && (FUNCTIONS[name] || FUNCTIONS_2[name] || name === 'if')) {
        take(); const args = []; if (!isOp(peek(), ')')) { do { args.push(expr(0)); } while (isOp(peek(), ',') && take()); }
        if (!isOp(take(), ')')) throw new Error('A bracket is not closed.');
        if (name === 'if') { if (args.length !== 3) throw new Error('if needs a condition and two results.'); node = s => args[0](s) ? args[1](s) : args[2](s); }
        else if (FUNCTIONS[name]) { if (args.length !== 1) throw new Error(`${name} takes one value.`); const f = FUNCTIONS[name], a = args[0]; node = s => f(a(s)); }
        else { if (args.length < 2) throw new Error(`${name} takes two values.`); const f = FUNCTIONS_2[name]; node = s => f(...args.map(a => a(s))); }
      } else if (name in CONSTANTS) node = () => CONSTANTS[name];
      else node = s => { const v = s[name]; if (v === undefined) throw new Error(`Unknown name “${name}”.`); return v; };
    } else throw new Error(`Unexpected “${t.op}”.`);
    depth--;
    while (isOp(peek(), '!')) { take(); const a = node; node = s => FUNCTIONS.fact(a(s)); }
    return node;
  }
  // Right-associative power: -x^2 is -(x^2), and 2^3^2 is 2^9.
  function power() {
    const base = primary();
    if (isOp(peek(), '^')) { take(); const exp = unary(); return s => base(s) ** exp(s); }
    return base;
  }
  function unary() { if (isOp(peek(), '-')) { take(); const a = unary(); return s => -a(s); } if (isOp(peek(), '+')) { take(); return unary(); } return power(); }
  // Writing 2x, 3(x+1) or 2pi next to each other multiplies them.
  const startsOperand = t => t && (t.n !== undefined || t.id !== undefined || isOp(t, '('));
  function term() {
    let left = unary();
    for (;;) {
      const t = peek();
      if (isOp(t, '*') || isOp(t, '/') || isOp(t, '%')) { take(); const a = left, b = unary(), op = t.op; left = s => op === '*' ? a(s) * b(s) : op === '/' ? a(s) / b(s) : a(s) % b(s); }
      else if (startsOperand(t)) { const a = left, b = unary(); left = s => a(s) * b(s); }
      else return left;
    }
  }
  function sum() { let left = term(); while (isOp(peek(), '+') || isOp(peek(), '-')) { const op = take().op, a = left, b = term(); left = s => op === '+' ? a(s) + b(s) : a(s) - b(s); } return left; }
  const COMPARE = new Set(['<', '>', '<=', '>=', '==', '!=']);
  function expr() { let left = sum(); while (peek() && COMPARE.has(peek().op)) { const op = take().op, a = left, b = sum(); left = s => { const x = a(s), y = b(s); return (op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : op === '>=' ? x >= y : op === '==' ? x === y : x !== y) ? 1 : 0; }; } return left; }
  const compiled = expr();
  if (i !== tokens.length) throw new Error(`Unexpected “${tokens[i].op ?? tokens[i].id ?? tokens[i].n}”.`);
  const names = new Set(tokens.filter(t => t.id !== undefined && !RESERVED.has(t.id)).map(t => t.id));
  const run = scope => compiled(scope);
  run.names = [...names];
  return run;
}

// Evaluate once with named values; NaN when the expression has no value there (for example 1/0 or sqrt(-1)).
export function evaluate(source, scope = {}) { try { const v = compileExpr(source)(scope); return Number.isFinite(v) ? v : NaN; } catch { return NaN; } }
