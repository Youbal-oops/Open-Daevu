const test = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([import('../shared/mathexpr.mjs'), import('../bundled-plugins/chart-statistics/stats.mjs')]);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} is not near ${b}`);

test('expressions follow the usual order of operations', async () => {
  const [{ evaluate }] = await modules;
  assert.equal(evaluate('2+3*4'), 14);
  assert.equal(evaluate('2^3^2'), 512);
  assert.equal(evaluate('-2^2'), -4);
  assert.equal(evaluate('(1+2)(3+4)'), 21);
  assert.equal(evaluate('2pi'), Math.PI * 2);
  assert.equal(evaluate('3x', { x: 4 }), 12);
  assert.equal(evaluate('5!'), 120);
  assert.equal(evaluate('10 % 4'), 2);
});
test('functions, constants, conditions and parameters', async () => {
  const [{ evaluate, compileExpr }] = await modules;
  near(evaluate('sin(pi/2)'), 1); near(evaluate('ln(e)'), 1); near(evaluate('log(1000)'), 3); near(evaluate('sqrt(16)+abs(-3)'), 7);
  assert.equal(evaluate('max(1,5,3)'), 5);
  assert.equal(evaluate('if(x>2, 10, 20)', { x: 3 }), 10);
  near(evaluate('gamma(5)'), 24, 1e-6);
  near(evaluate('a*sin(b*x)', { a: 2, b: 1, x: Math.PI / 2 }), 2);
  assert.deepEqual(compileExpr('a*sin(b*x)+c').names.sort(), ['a', 'b', 'c', 'x']);
});
test('bad expressions say what is wrong and never throw out of evaluate', async () => {
  const [{ evaluate, compileExpr }] = await modules;
  assert.throws(() => compileExpr('2+'), /ends too soon/);
  assert.throws(() => compileExpr('(1+2'), /bracket/);
  assert.throws(() => compileExpr('sin(1,2)'), /one value/);
  assert.throws(() => compileExpr('1 $ 2'), /Unexpected/);
  assert.ok(Number.isNaN(evaluate('1/0')));
  assert.ok(Number.isNaN(evaluate('sqrt(-1)')));
  assert.ok(Number.isNaN(evaluate('missing+1')));
});
test('curve fits recover known relationships', async () => {
  const [, { fitCurve }] = await modules;
  const xs = [1, 2, 3, 4, 5, 6];
  const lin = fitCurve('linear', xs, xs.map(x => 3 * x + 2)); near(lin.params[0], 2); near(lin.params[1], 3); near(lin.r2, 1);
  const quad = fitCurve('poly2', xs, xs.map(x => x * x - 2 * x + 1)); near(quad.params[2], 1); near(quad.fn(10), 81, 1e-4);
  const exp = fitCurve('exp', xs, xs.map(x => 2 * Math.exp(0.5 * x))); near(exp.params[0], 2, 1e-6); near(exp.params[1], 0.5, 1e-6);
  const pow = fitCurve('power', xs, xs.map(x => 4 * x ** 1.5)); near(pow.params[1], 1.5, 1e-6);
  assert.match(lin.equation, /^y = /);
  assert.equal(fitCurve('linear', [1], [1]), null);
});
test('quartiles, box plots, histograms and correlation', async () => {
  const [, { describe, boxStats, histogram, correlation }] = await modules;
  const d = describe([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); near(d.mean, 5.5); near(d.median, 5.5); near(d.q1, 3.25); near(d.q3, 7.75);
  const b = boxStats([1, 2, 3, 4, 5, 100]); assert.deepEqual(b.outliers, [100]); assert.equal(b.max, 5);
  const h = histogram([1, 1, 2, 2, 2, 3, 9], 4); assert.equal(h.reduce((a, x) => a + x.count, 0), 7); assert.equal(h.length, 4);
  near(correlation([1, 2, 3, 4], [2, 4, 6, 8]), 1); near(correlation([1, 2, 3, 4], [8, 6, 4, 2]), -1);
});
test('axis scales use round numbers', async () => {
  const [, { niceScale, logTicks }] = await modules;
  assert.deepEqual(niceScale(0, 97, 5).ticks, [0, 25, 50, 75, 100]);
  assert.equal(niceScale(3, 3).min < 3, true);
  assert.deepEqual(logTicks(3, 4000).ticks, [1, 10, 100, 1000, 10000]);
});
