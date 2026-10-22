const test = require('node:test');
const assert = require('node:assert/strict');
const modules = import('../shared/sheet.mjs');
const calc = async (rows, context) => (await modules).calculateSheet(rows, context);
const one = async (formula, rows = []) => (await calc([...rows, [formula]]))[rows.length][0];

const sales = [['Region', 'Item', 'Qty', 'Price'], ['North', 'Pen', '10', '2'], ['South', 'Pen', '5', '2'], ['North', 'Ink', '3', '10'], ['East', 'Pad', '7', '4']];

test('conditional sums and counts', async () => {
  assert.equal(await one('=SUMIF(A2:A5,"North",C2:C5)', sales), 13);
  assert.equal(await one('=SUMIF(C2:C5,">4")', sales), 22);
  assert.equal(await one('=COUNTIF(B2:B5,"Pen")', sales), 2);
  assert.equal(await one('=COUNTIF(A2:A5,"*th")', sales), 3);
  assert.equal(await one('=SUMIFS(C2:C5,A2:A5,"North",B2:B5,"Pen")', sales), 10);
  assert.equal(await one('=COUNTIFS(A2:A5,"North",C2:C5,">5")', sales), 1);
  assert.equal(await one('=AVERAGEIF(B2:B5,"Pen",C2:C5)', sales), 7.5);
  assert.equal(await one('=MAXIFS(C2:C5,A2:A5,"North")', sales), 10);
  assert.equal(await one('=SUMPRODUCT(C2:C5,D2:D5)', sales), 10 * 2 + 5 * 2 + 3 * 10 + 7 * 4);
});

test('lookups', async () => {
  assert.equal(await one('=VLOOKUP("Ink",B2:D5,3,FALSE)', sales), '10');
  assert.equal(await one('=VLOOKUP("Zzz",B2:D5,3,FALSE)', sales), '#N/A');
  assert.equal(await one('=IFERROR(VLOOKUP("Zzz",B2:D5,3,FALSE),"none")', sales), 'none');
  assert.equal(await one('=HLOOKUP("Qty",A1:D5,3,FALSE)', sales), '5');
  assert.equal(await one('=XLOOKUP("East",A2:A5,C2:C5)', sales), '7');
  assert.equal(await one('=XLOOKUP("West",A2:A5,C2:C5,"n/a")', sales), 'n/a');
  assert.equal(await one('=INDEX(A2:D5,2,2)', sales), 'Pen');
  assert.equal(await one('=MATCH("Ink",B2:B5,0)', sales), 3);
  assert.equal(await one('=INDEX(C2:C5,MATCH("Pad",B2:B5,0))', sales), '7');
  assert.equal(await one('=VLOOKUP(4,A1:B3,2,TRUE)', [['1', 'a'], ['3', 'b'], ['5', 'c']]), 'b');
});

test('logic, text and whole-column ranges', async () => {
  assert.equal(await one('=IFS(1>2,"a",2>1,"b")'), 'b');
  assert.equal(await one('=AND(1<2,2<3)'), true);
  assert.equal(await one('=OR(1>2,FALSE)'), false);
  assert.equal(await one('=SWITCH(2,1,"one",2,"two","other")'), 'two');
  assert.equal(await one('=CHOOSE(2,"a","b","c")'), 'b');
  assert.equal(await one('=CONCAT("a","b",1)'), 'ab1');
  assert.equal(await one('=TEXTJOIN(", ",TRUE,"a","","b")'), 'a, b');
  assert.equal(await one('=LEFT("Hello",2)&RIGHT("Hello",2)&MID("Hello",2,3)'), 'Heloell');
  assert.equal(await one('=UPPER(TRIM("  hi   there "))'), 'HI THERE');
  assert.equal(await one('=PROPER("hello wORLD")'), 'Hello World');
  assert.equal(await one('=SUBSTITUTE("a-b-c","-","+")'), 'a+b+c');
  assert.equal(await one('=FIND("l","Hello")'), 3);
  assert.equal(await one('=TEXT(1234.5,"#,##0.00")'), '1,234.50');
  assert.equal(await one('=TEXT(0.256,"0%")'), '26%');
  assert.equal(await one('=SUM(C:C)', sales), 25);
});

test('math and statistics', async () => {
  assert.equal(await one('=MEDIAN(1,3,2,10)'), 2.5);
  assert.equal(await one('=MOD(-3,2)'), 1);
  assert.equal(await one('=POWER(2,10)'), 1024);
  assert.equal(await one('=ROUNDUP(2.121,2)'), 2.13);
  assert.equal(await one('=ROUNDDOWN(-2.129,2)'), -2.12);
  assert.equal(await one('=SQRT(-1)'), '#NUM!');
  assert.equal(await one('=LARGE(A1:A4,2)', [['5'], ['9'], ['1'], ['7']]), 7);
  assert.equal(await one('=RANK(7,A1:A4)', [['5'], ['9'], ['1'], ['7']]), 2);
  assert.equal(Math.round(await one('=STDEV(2,4,4,4,5,5,7,9)') * 1000) / 1000, 2.138);
  assert.equal(await one('=PRODUCT(2,3,4)'), 24);
});

test('dates', async () => {
  assert.equal(await one('=DATE(2026,10,22)'), '2026-10-22');
  assert.equal(await one('=YEAR("2026-10-22")+MONTH("2026-10-22")+DAY("2026-10-22")'), 2026 + 10 + 22);
  assert.equal(await one('="2026-10-22"+30'), '2026-11-21');
  assert.equal(await one('="2026-10-22"-"2026-10-01"'), 21);
  assert.equal(await one('=DAYS("2026-10-22","2026-10-01")'), 21);
  assert.equal(await one('=EDATE("2026-01-31",1)'), '2026-02-28');
  assert.equal(await one('=EOMONTH("2026-02-10",0)'), '2026-02-28');
  assert.equal(await one('=DATEDIF("2020-05-10","2026-10-22","Y")'), 6);
  assert.equal(await one('=NETWORKDAYS("2026-10-19","2026-10-23")'), 5);
  assert.equal(await one('=WEEKDAY("2026-10-22",2)'), 4);
});

test('finance', async () => {
  assert.equal(Math.round(await one('=PMT(0.05/12,60,-20000)') * 100) / 100, 377.42);
  assert.equal(Math.round(await one('=FV(0.06,10,-100)') * 100) / 100, 1318.08);
  assert.equal(Math.round(await one('=NPV(0.1,100,100,100)') * 100) / 100, 248.69);
  assert.equal(Math.round(await one('=IRR(A1:A4)', [['-100'], ['30'], ['40'], ['80']]) * 10000) / 10000, 0.195);
});

test('formulas can reach other sheets', async () => {
  const { sheetContext } = await modules;
  const sheets = [{ name: 'Sheet 1', content: '' }, { name: 'Prices', content: 'Pen,2\nInk,10' }];
  const parse = csv => csv.split('\n').map(line => line.split(','));
  const context = sheetContext(sheets, parse, 'Sheet 1');
  const out = await calc([["=Prices!B2*2", "=VLOOKUP(\"Pen\",'Prices'!A1:B2,2,FALSE)", '=SUM(Prices!B1:B2)', '=Nope!A1', '=A1']], context);
  assert.deepEqual(out[0], [20, '2', 12, '#REF!', 20]);
});

test('unknown functions and bad arguments stay errors', async () => {
  assert.equal(await one('=FAKE(1)'), '#NAME?');
  assert.equal(await one('=ROUND()'), '#VALUE!');
  assert.equal(await one('=INDEX(A1:A2,5)', [['1'], ['2']]), '#REF!');
});

test('formulas can reach other spreadsheets in the project', async () => {
  const { sheetContext } = await modules, { projectFiles, workbookOf } = await import('../shared/workbook.mjs');
  const parse = csv => csv.split('\n').map(line => line.split(','));
  const budget = { id: 'b', kind: 'sheet', title: 'Q3 Budget', content: 'Item,Cost\nRent,1200\nTotal,=SUM(B2:B2)*2', sheetName: 'Costs', sheets: [{ id: 's2', name: 'Totals', content: 'x\n=Costs!B3+1' }] };
  const me = { id: 'm', kind: 'sheet', title: 'Report', content: '' };
  const files = projectFiles([budget, me], parse, 'm');
  const context = sheetContext(workbookOf(me), parse, 'Sheet 1', files);
  const out = await calc([["=[Q3 Budget]Costs!B2", "=[Q3 Budget]Totals!A2", "='[Q3 Budget]Costs'!B3", '=[Q3 Budget]!B2*2', '=[Missing]Costs!A1', '=SUM([Q3 Budget]Costs!B2:B3)']], context);
  assert.deepEqual(out[0], ['1200', 2401, 2400, 2400, '#REF!', 3600]);
});

test('names ending in digits are functions, ROW and COLUMN say where they are, and TODAY is local', async () => {
  const { calculateSheet, setSheetFunctions } = await import('../shared/sheet.mjs');
  const r = calculateSheet([['=LOG10(100)', '=ROW(A5)', '=COLUMN(C1)', '=ROW()', '=COLUMN()'], ['=ROW(B3:C9)', '=MOD(ROW(),2)', '=A1+1']]);
  assert.deepEqual(r[0], [2, 5, 3, 1, 5]);
  assert.deepEqual(r[1], [3, 0, 3]);
  setSheetFunctions([{ name: 'VAT2', args: ['p'], expr: 'p*1.2' }]);
  assert.equal(calculateSheet([['=VAT2(100)']])[0][0], 120);
  setSheetFunctions([]);
  const d = new Date(), p = n => String(n).padStart(2, '0'), local = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  assert.equal(calculateSheet([['=TODAY()']])[0][0], local);
});
