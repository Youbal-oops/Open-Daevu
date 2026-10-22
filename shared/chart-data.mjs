// Where a chart's numbers come from: its own table, a spreadsheet (any sheet, any range), or a table inside a document.
import { csvParse } from './domain.mjs';
import { calculateSheet, sheetContext, address } from './sheet.mjs';
import { workbookOf, projectFiles } from './workbook.mjs';
import { markdownToBlocks } from './blocks.mjs';
import { parseTable } from './markdown-fix.mjs';

export const sourceOf = data => data.source || { type: data.sheetId ? 'sheet' : 'own', sheetId: data.sheetId || '' };

// Text to a number, or NaN. Accepts 1,234.5  12%  $9.99.
export function toNumber(value) {
  if (typeof value === 'number') return value;
  const t = String(value ?? '').trim().replace(/^[$€£₹]/, '');
  if (t === '') return NaN;
  const pct = /^(-?[\d,.]+)%$/.exec(t); if (pct) return Number(pct[1].replace(/,/g, '')) / 100;
  const n = Number(t.replace(/,(?=\d{3}(\D|$))/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

function cut(rows, range) {
  if (!range || !String(range).trim()) return rows;
  const [a, b = a] = String(range).trim().split(':'), [y0, x0] = address(a), [y1, x1] = address(b);
  return rows.slice(Math.min(y0, y1), Math.max(y0, y1) + 1).map(r => r.slice(Math.min(x0, x1), Math.max(x0, x1) + 1));
}
const flip = rows => (rows[0] || []).map((_, c) => rows.map(r => r[c] ?? ''));

// { rows, label, error } for a chart or board, with formulas worked out.
export function chartRows(data, project) {
  const src = sourceOf(data || {});
  try {
    let rows, label = 'This chart’s own data';
    if (src.type === 'sheet') {
      const note = (project.notes || []).find(n => n.id === src.sheetId && n.kind === 'sheet');
      if (!note) return { rows: [], label: '', error: 'That spreadsheet is gone. Choose another source.' };
      const book = workbookOf(note), sheet = (src.sheet && book.find(s => s.name === src.sheet)) || book[0];
      const parsed = csvParse(sheet.content);
      rows = calculateSheet(parsed, sheetContext(book, csvParse, sheet.name, projectFiles(project.notes, csvParse, note.id)));
      label = book.length > 1 ? `${note.title} · ${sheet.name}` : note.title;
    } else if (src.type === 'note') {
      const note = (project.notes || []).find(n => n.id === src.noteId && n.kind !== 'sheet');
      if (!note) return { rows: [], label: '', error: 'That document is gone. Choose another source.' };
      const tables = (note.format === 'blocks' && note.blocks ? note.blocks : markdownToBlocks(note.content || '')).filter(b => b.type === 'table');
      if (!tables.length) return { rows: [], label: note.title, error: `“${note.title}” has no table. Add one with /table.` };
      rows = parseTable(tables[Math.min(tables.length - 1, src.table || 0)].text);
      label = `${note.title}${tables.length > 1 ? ` · table ${(src.table || 0) + 1}` : ''}`;
    } else rows = csvParse(data.csv || '');
    rows = cut(rows, src.range);
    if (data.transpose) rows = flip(rows);
    return { rows: rows.map(r => r.map(c => (typeof c === 'number' ? c : String(c ?? '')))), label, error: '' };
  } catch (e) { return { rows: [], label: '', error: /^#/.test(e.message) ? 'That range is not valid.' : e.message }; }
}
// The tables in a document, for the source picker.
export const tablesIn = note => (note.format === 'blocks' && note.blocks ? note.blocks : markdownToBlocks(note.content || '')).filter(b => b.type === 'table').length;

// Cards for a kanban board from a table: one column per value in the status column, one card per row.
export function kanbanFromRows(rows, titleCol, groupCol) {
  const header = (rows[0] || []).map(String), data = rows.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
  if (!header.length) return { columns: [], titleCol: 0, groupCol: 0, header };
  const find = (want, fallback) => { const byName = header.findIndex(h => h === want); return byName >= 0 ? byName : Number.isInteger(want) && want >= 0 && want < header.length ? want : fallback; };
  const guess = header.findIndex(h => /^(status|stage|state|column|phase|progress)$/i.test(h.trim())), group = find(groupCol, guess >= 0 ? guess : header.length - 1), title = find(titleCol, group === 0 ? Math.min(1, header.length - 1) : 0);
  const order = []; for (const r of data) { const key = String(r[group] ?? '').trim() || 'No status'; if (!order.includes(key)) order.push(key); }
  return { header, titleCol: title, groupCol: group, columns: order.map(key => ({ id: 'col-' + key, title: key, cards: data.filter(r => (String(r[group] ?? '').trim() || 'No status') === key).map((r, i) => ({ id: `${key}-${i}`, text: String(r[title] ?? '') })) })) };
}

const body = rows => rows.slice(1).filter(r => r.some(c => String(c).trim() !== ''));

// Labels down the first column, one series per other column (bars, lines, areas, pies, funnels).
export function categoryData(rows) {
  const header = (rows[0] || []).map(String), data = body(rows);
  const series = header.slice(1).map((name, i) => ({ name: name || `Series ${i + 1}`, values: data.map(r => { const n = toNumber(r[i + 1]); return Number.isFinite(n) ? n : 0; }), has: data.some(r => String(r[i + 1] ?? '').trim() !== '') })).filter(s => s.has);
  return { labels: data.map(r => String(r[0] ?? '')), series };
}
