const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const XLSX = require('@e965/xlsx');
const { readWorkbook, noteFromSheets, importFile, writeNote } = require('../electron/sheet-files.cjs');

const temp = name => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sheetfiles-')), name);

test('an Excel workbook becomes a spreadsheet with one sheet per tab, keeping formulas, dates and booleans', () => {
  const wb = XLSX.utils.book_new();
  const a = XLSX.utils.aoa_to_sheet([['Item', 'Qty', 'Total', 'Due', 'Done'], ['Pen', 3, { t: 'n', v: 6, f: 'B2*2' }, new Date(Date.UTC(2026, 9, 22)), true]], { cellDates: true });
  XLSX.utils.book_append_sheet(wb, a, 'Orders');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Rate'], [0.2]]), 'Rates');
  const file = temp('Budget Q3.xlsx'); XLSX.writeFile(wb, file);
  const note = importFile(file, { x: 1, y: 2 });
  assert.equal(note.title, 'Budget Q3');
  assert.equal(note.kind, 'sheet');
  assert.equal(note.sheetName, 'Orders');
  assert.equal(note.content.split('\n')[1], 'Pen,3,=B2*2,2026-10-22,TRUE');
  assert.equal(note.sheets.length, 1);
  assert.equal(note.sheets[0].name, 'Rates');
  assert.equal(note.sheets[0].content, 'Rate\n0.2');
});

test('CSV and tab-separated files import too', () => {
  const csv = temp('data.csv'); fs.writeFileSync(csv, 'a,b\n1,2\n');
  assert.equal(importFile(csv, { x: 0, y: 0 }).content, 'a,b\n1,2');
  const tsv = temp('data.tsv'); fs.writeFileSync(tsv, 'a\tb\n1\t2\n');
  assert.deepEqual(readWorkbook(tsv)[0].rows, [['a', 'b'], ['1', '2']]);
});

test('a spreadsheet exports to xlsx with formulas and values, and imports back the same', () => {
  const note = noteFromSheets('Plan', [{ name: 'Costs', rows: [['Item', 'Cost'], ['Rent', '1200'], ['Total', '=SUM(B2:B2)*2']] }, { name: 'Notes', rows: [['Text'], ['hello']] }], { x: 0, y: 0 });
  const file = temp('plan.xlsx'); writeNote(note, file, {});
  const back = importFile(file, { x: 0, y: 0 });
  assert.equal(back.content, note.content);
  assert.equal(back.sheets[0].name, 'Notes');
  const wb = XLSX.readFile(file), ws = wb.Sheets.Costs;
  assert.equal(ws.B3.v, 2400);
  assert.equal(ws.B3.f, 'SUM(B2:B2)*2');
  const ods = temp('plan.ods'); writeNote(note, ods, {});
  assert.equal(importFile(ods, { x: 0, y: 0 }).content, note.content);
});

test('sheet names that collide in Excel are made unique and formulas follow the renamed sheet', () => {
  const long = 'Quarterly figures for the whole company';
  const note = noteFromSheets('Names', [
    { name: long + ' one', rows: [['v'], ['5']] },
    { name: long + ' two', rows: [['=\'' + long + ' one\'!A2*2']] },
    { name: 'Q1/Q2', rows: [['1']] },
    { name: 'Q1-Q2', rows: [['=\'Q1/Q2\'!A1+1']] }
  ], { x: 0, y: 0 });
  const file = temp('names.xlsx'); writeNote(note, file, {});
  const wb = XLSX.readFile(file), names = wb.SheetNames;
  assert.equal(new Set(names.map(n => n.toLowerCase())).size, 4, 'every sheet got its own name');
  assert.ok(names.every(n => n.length <= 31));
  assert.equal(wb.Sheets[names[1]].A1.f, `'${names[0]}'!A2*2`, 'the formula points at the exported name');
  assert.equal(wb.Sheets[names[3]].A1.f, `'${names[2]}'!A1+1`, 'a name that was just written is not renamed again');
});
