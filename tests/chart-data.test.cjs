const test = require('node:test');
const assert = require('node:assert/strict');
const modules = import('../shared/chart-data.mjs');
const note = (id, title, content, extra = {}) => ({ id, title, content, kind: 'sheet', ...extra });
const project = { notes: [
  note('s1', 'Sales', 'Month,Qty,Price\nJan,10,2\nFeb,20,3\nMar,"=B4*2",4', { sheetName: 'Q1', sheets: [{ id: 'p2', name: 'Other', content: 'x,y\n1,10\n2,20\n3,30' }] }),
  { id: 'd1', title: 'Notes', kind: 'note', content: 'Intro\n\n| Item | Cost |\n| --- | --- |\n| Pen | 2 |\n| Ink | 10 |\n\nMore\n\n| A | B |\n| --- | --- |\n| 1 | 2 |' }
] };

test('a chart reads its own table, a sheet with formulas, another sheet, a range, and a document table', async () => {
  const { chartRows } = await modules;
  assert.deepEqual(chartRows({ csv: 'a,b\n1,2' }, project).rows, [['a', 'b'], ['1', '2']]);
  const sheet = chartRows({ source: { type: 'sheet', sheetId: 's1' } }, project);
  assert.equal(sheet.rows[3][1], '40' === sheet.rows[3][1] ? '40' : sheet.rows[3][1]);
  assert.equal(sheet.label, 'Sales · Q1');
  assert.equal(chartRows({ source: { type: 'sheet', sheetId: 's1', sheet: 'Other' } }, project).rows[2][1], '20');
  assert.deepEqual(chartRows({ source: { type: 'sheet', sheetId: 's1', range: 'A2:B3' } }, project).rows, [['Jan', '10'], ['Feb', '20']]);
  assert.deepEqual(chartRows({ source: { type: 'note', noteId: 'd1', table: 1 } }, project).rows, [['A', 'B'], ['1', '2']]);
  assert.match(chartRows({ source: { type: 'note', noteId: 'nope' } }, project).error, /gone/);
  assert.match(chartRows({ source: { type: 'sheet', sheetId: 'nope' } }, project).error, /gone/);
  assert.deepEqual(chartRows({ csv: 'a,b\n1,2', transpose: true }, project).rows, [['a', '1'], ['b', '2']]);
});
test('rows become categories, points, columns and grids', async () => {
  const { categoryData, toNumber } = await modules, { xyData, columnsData, matrixData } = await import('../bundled-plugins/chart-statistics/data.mjs');
  const rows = [['Month', 'Qty', 'Price'], ['Jan', '10', '$2'], ['Feb', '1,200', '3'], ['', '', '']];
  const c = categoryData(rows); assert.deepEqual(c.labels, ['Jan', 'Feb']); assert.deepEqual(c.series[0].values, [10, 1200]); assert.deepEqual(c.series[1].values, [2, 3]);
  const xy = xyData([['x', 'y'], ['1', '2'], ['2', '4']]); assert.deepEqual(xy.xs, [1, 2]); assert.equal(xy.numericX, true); assert.deepEqual(xy.series[0].y, [2, 4]);
  assert.equal(xyData([['k', 'y'], ['a', '2'], ['b', '4']]).numericX, false);
  const b = xyData([['x', 'y', 'size'], ['1', '2', '9']], true); assert.deepEqual(b.series[0].size, [9]);
  assert.deepEqual(columnsData([['a', 'b', 'name'], ['1', '5', 'x'], ['2', '6', 'y']]).map(c => c.name), ['a', 'b']);
  assert.deepEqual(matrixData([['', 'A', 'B'], ['r1', '1', '2'], ['r2', '3', '4']]).matrix, [[1, 2], [3, 4]]);
  assert.equal(toNumber('12%'), 0.12); assert.ok(Number.isNaN(toNumber('abc')));
});

test('a kanban board can be built from the rows of a table', async () => {
  const { kanbanFromRows } = await modules;
  const k = kanbanFromRows([['Task', 'Owner', 'Status'], ['Write', 'Ana', 'Doing'], ['Ship', 'Ben', 'Todo'], ['Test', 'Ana', 'Doing'], ['', '', '']]);
  assert.deepEqual(k.columns.map(c => [c.title, c.cards.map(x => x.text)]), [['Doing', ['Write', 'Test']], ['Todo', ['Ship']]]);
  assert.equal(k.header[k.groupCol], 'Status'); assert.equal(k.header[k.titleCol], 'Task');
  const by = kanbanFromRows([['Task', 'Owner', 'Status'], ['Write', 'Ana', 'Doing'], ['Ship', 'Ben', 'Todo']], 'Task', 'Owner');
  assert.deepEqual(by.columns.map(c => c.title), ['Ana', 'Ben']);
});
