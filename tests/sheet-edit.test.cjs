const {test}=require('node:test'),assert=require('node:assert/strict');
const {bounds,clipboardText,clipboardRows,putCells,fillDown,shiftFormula}=require('../shared/sheet-edit.mjs');
const {calculateSheet}=require('../shared/sheet.mjs');
test('clipboard tables preserve multiline cells, quotes, tabs and ordinary commas',()=>{
 const rows=[['Name','a,b','line 1\nline 2'],['"quoted"','with\ttab','']];
 assert.deepEqual(clipboardRows(clipboardText(rows,bounds([0,0],[1,2]))),rows);
 assert.deepEqual(clipboardRows('a\tb\r\n1\t2\r\n'),[['a','b'],['1','2']]);
 assert.deepEqual(clipboardRows('hello, world'),[['hello, world']]);
 assert.throws(()=>clipboardRows('"unclosed'),/quote/);
});
test('pasting expands real data atomically and rejects grid overflow',()=>{
 const original=[['original']];assert.deepEqual(putCells(original,1,1,[['10','20'],['30','40']]),[['original'],['','10','20'],['','30','40']]);assert.deepEqual(original,[['original']]);
 assert.throws(()=>putCells(original,9999,0,[['x'],['y']]),/10,000/);assert.throws(()=>putCells(original,0,255,[['x','y']]),/256/);assert.deepEqual(original,[['original']]);
});
test('fill and copied formulas shift relative references and preserve absolute references and quoted strings',()=>{
 assert.equal(shiftFormula('=A1+$B$2+C$3+$D4+"A1"',2,1),'=B3+$B$2+D$3+$D6+"A1"');
 assert.equal(shiftFormula('="say ""A1"""&A1',1,0),'="say ""A1"""&A2');
 const result=fillDown([['Value','Result'],['2','=A2*2'],['3',''],['4','']],bounds([1,1],[3,1]));assert.deepEqual(result.map(r=>r[1]),['Result','=A2*2','=A3*2','=A4*2']);assert.deepEqual(calculateSheet(result).map(r=>r[1]),['Result',4,6,8]);
 const invalid=shiftFormula('=A1',-1,0);assert.equal(invalid,'=#REF!');assert.equal(calculateSheet([[invalid]])[0][0],'#REF!');assert.equal(calculateSheet([['=IFERROR(#REF!,"missing")']])[0][0],'missing');
});
