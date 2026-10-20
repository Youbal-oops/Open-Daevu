const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSheet, columnName } = require('../shared/sheet.mjs');
const { SheetPython } = require('../electron/sheet-python.cjs');
const os = require('node:os');
test('formulas recalculate dependencies, ranges, arithmetic, text, and conditionals', () => {
  const rows = [['Name','Amount'],['A','10'],['B','20'],['Total','=SUM(B2:B3)'],['Avg','=AVERAGE(B2:B3)'],['Ratio','=IF(B4>0,ROUND(B2/B4,2),0)'],['Count','=COUNT(B1:B3)'],['Label','="Total: "&B4'],['Anchored','=SUM($B$2:B3)*50%']];
  assert.deepEqual(calculateSheet(rows).map(r=>r[1]), ['Amount','10','20',30,15,0.33,2,'Total: 30',15]);
  rows[1][1]='40';assert.equal(calculateSheet(rows)[3][1],60);
  assert.equal(columnName(26),'AA');assert.equal(columnName(255),'IV');
});
test('formula errors are visible, lazy IF handles division, and scripts cannot execute as formulas', () => {
  const rows = [['=1/0','=IF(FALSE,1/0,42)','=IFERROR(1/0,"missing")','=A1+1'],['=B2','=A2','=SUM(A2:B2)','=globalThis.process.exit()']];
  const out=calculateSheet(rows);assert.deepEqual(out[0],['#DIV/0!',42,'missing','#DIV/0!']);assert.deepEqual(out[1].slice(0,3),['#CYCLE!','#CYCLE!','#CYCLE!']);assert.match(out[1][3],/^#/);
  assert.equal(calculateSheet([['='+ '('.repeat(200)+'1'+')'.repeat(200)]])[0][0],'#LIMIT!');
  const growing = [['x'], ...Array.from({ length: 25 }, (_, i) => [`=A${i + 1}&A${i + 1}`])];
  assert.equal(calculateSheet(growing).at(-1)[0], '#LIMIT!');
});
test('basic aggregate functions, precedence, comparisons, numeric errors, and strings', () => {
  const formulas=['=2+3*4','=2^3^2','=MIN(4,2,6)','=MAX(4,2,6)','=ABS(-3)','=COUNTA("a","",2)','=ROUND(12.345,2)','=IF("a"="A","yes","no")','=FAKE(1)','=1e300*1e300','=SUM(A1:A10001)'];
  assert.deepEqual(calculateSheet([formulas])[0],[14,512,2,6,3,2,12.35,'yes','#NAME?','#NUM!','#LIMIT!']);
});
test('Python uses calculated values, preserves formulas, previews changes, and surfaces errors', async () => {
  const python=new SheetPython();
  const output=await python.run({rows:[['2','=A1*3']],script:'print(get_cell("B1"))\nset_cell("C1", get_cell("B1") + 4)\nset_cell("D1", "=SUM(A1:C1)")'},os.tmpdir());
  assert.deepEqual(output.rows,[['2','=A1*3','10','=SUM(A1:C1)']]);assert.equal(output.stdout.trim(),'6');
  await assert.rejects(python.run({rows:[['']],script:'raise ValueError("bad input")'},os.tmpdir()),/bad input/);
  await assert.rejects(python.run({rows:[['']],script:'rows = [[{"bad":1}]]'},os.tmpdir()),/text or numbers/);
  const unicode = await python.run({ rows: [['東京 café ₹']], script: 'print(rows[0][0])' }, os.tmpdir());
  assert.equal(unicode.stdout.trim(), '東京 café ₹'); assert.deepEqual(unicode.rows, [['東京 café ₹']]);
});
test('Python cancellation and invalid inputs do not mutate the source', async () => {
  const python=new SheetPython();const rows=[['original']];
  const pending=python.run({rows,script:'import time\ntime.sleep(15)'},os.tmpdir());
  await new Promise(resolve=>setTimeout(resolve,200));python.stop();await assert.rejects(pending,/stopped/);assert.deepEqual(rows,[['original']]);
  await assert.rejects(python.run({rows,script:' ',command:'python'},os.tmpdir()),/Enter a Python/);
});
