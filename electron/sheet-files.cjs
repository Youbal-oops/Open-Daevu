// Reads spreadsheets from other programs into a Daevu spreadsheet, and writes one back out.
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('@e965/xlsx');
const { csvStringify, csvParse, id } = require('../shared/domain.mjs');
const { calculateSheet, sheetContext } = require('../shared/sheet.mjs');
const { workbookOf, uniqueName, MAX_SHEETS, cleanSheetFields } = require('../shared/workbook.mjs');

const MAX_BYTES = 50 * 1024 * 1024, MAX_ROWS = 10000, MAX_COLUMNS = 256;
const SPREADSHEET = /\.(xlsx|xlsm|xlsb|xls|ods|fods|csv|tsv|txt|numbers)$/i;
const EXCEL_ONLY = /\.(xlsx|xlsm|xlsb|xls|ods|fods|numbers)$/i;

function textOf(cell) {
  if (!cell) return '';
  if (cell.f) return '=' + cell.f;
  switch (cell.t) {
    // A number shown with leading zeros (a zip code, an ID) stays the text it was shown as.
    case 'n': return typeof cell.w === 'string' && /^-?0\d+$/.test(cell.w.trim()) ? cell.w.trim() : String(cell.v);
    case 'b': return cell.v ? 'TRUE' : 'FALSE';
    case 'd': return cell.v instanceof Date && !Number.isNaN(cell.v.getTime()) ? cell.v.toISOString().slice(0, 10) : String(cell.w ?? '');
    case 'e': return String(cell.w || '#ERROR!');
    case 's': return String(cell.v ?? '');
    default: return cell.v == null ? '' : String(cell.v);
  }
}
function rowsOf(sheet) {
  if (!sheet || !sheet['!ref']) return [['']];
  const range = XLSX.utils.decode_range(sheet['!ref']), rows = [];
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + MAX_ROWS - 1); r++) {
    const row = [];
    for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + MAX_COLUMNS - 1); c++) row.push(textOf(sheet[XLSX.utils.encode_cell({ r, c })]));
    rows.push(row);
  }
  while (rows.length > 1 && rows.at(-1).every(v => v === '')) rows.pop();
  const width = Math.max(1, ...rows.map(row => { let n = row.length; while (n > 0 && row[n - 1] === '') n--; return n; }));
  return rows.map(row => row.slice(0, width).concat(Array(Math.max(0, width - row.length)).fill('')));
}

// Plain-text tables are read as text so nothing is turned into a number or loses its zeros; the file is UTF-8, or Windows-1252 when it is not.
function readAny(file, bytes) {
  const options = { cellDates: true, cellFormula: true, cellStyles: false, sheetRows: MAX_ROWS + 1 };
  if (!/\.(csv|tsv|txt)$/i.test(file)) return bytes ? XLSX.read(bytes, { ...options, type: 'buffer' }) : XLSX.readFile(file, options);
  bytes ||= fs.readFileSync(file);
  let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^﻿/, '');
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(bytes);
  return XLSX.read(text, { ...options, type: 'string', raw: true, FS: /\.tsv$/i.test(file) ? '	' : undefined });
}

// Every sheet of the file, as { name, rows }.
function readWorkbook(file, bytes) {
  const size = bytes ? bytes.length : fs.statSync(file).size;
  if (size > MAX_BYTES) throw new Error('Import spreadsheets under 50 MB.');
  const workbook = readAny(file, bytes);
  if (!workbook.SheetNames.length) throw new Error('That file has no sheets.');
  if (workbook.SheetNames.length > MAX_SHEETS) throw new Error(`This workbook has more than ${MAX_SHEETS} sheets. Split it before importing; no sheets were imported.`);
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name], range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
    if (range.e.r - range.s.r + 1 > MAX_ROWS || range.e.c - range.s.c + 1 > MAX_COLUMNS) throw new Error(`Sheet "${name}" exceeds the import limit (${MAX_ROWS} rows, ${MAX_COLUMNS} columns). Split it before importing; no cells were imported.`);
    const rows = rowsOf(sheet), formulaCache = {};
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r + r, c: range.s.c + c })];
      if (cell?.f && ['n', 's', 'b'].includes(cell.t) && cell.v != null) formulaCache[XLSX.utils.encode_cell({ r, c })] = { formula: '=' + cell.f, value: cell.v };
    }
    return { name, rows, ...(Object.keys(formulaCache).length ? { formulaCache } : {}) };
  });
}

// A new spreadsheet note holding those sheets.
function noteFromSheets(title, sheets, position) {
  const named = [];
  for (const sheet of sheets) named.push({ id: named.length ? id() : 'main', name: uniqueName(named, sheet.name), content: csvStringify(sheet.rows), ...(sheet.formulaCache ? { formulaCache: sheet.formulaCache } : {}) });
  if (!named.length) throw new Error('That file has no sheets.');
  if (named.some(s => s.content.length > 2000000)) throw new Error('Each imported sheet must fit within 2,000,000 characters. Split the workbook before importing; nothing was imported.');
  const [first, ...rest] = named, now = new Date().toISOString();
  const note = { id: id(), title: String(title).slice(0, 160), kind: 'sheet', content: first.content, sheetName: first.name, ...(first.formulaCache ? { formulaCache: first.formulaCache } : {}), ...(rest.length ? { sheets: rest } : {}), author: 'You', createdAt: now, updatedAt: now, position };
  cleanSheetFields(note);
  return note;
}
function importFile(file, position, bytes) {
  return noteFromSheets(path.basename(file).replace(/\.[^.]+$/, '') || 'Imported spreadsheet', readWorkbook(file, bytes), position);
}

// Excel sheet names are at most 31 characters, cannot hold / \ ? * [ ] : and must differ from each other without regard to case.
function exportNames(book) {
  const taken = new Set(), out = new Map();
  for (const sheet of book) {
    const base = sheet.name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31) || 'Sheet';
    let name = base, n = 2;
    while (taken.has(name.toLowerCase())) { const tag = ` (${n++})`; name = base.slice(0, 31 - tag.length) + tag; }
    taken.add(name.toLowerCase()); out.set(sheet.name, name);
  }
  return out;
}
// A formula that points at a sheet by its Daevu name has to use the name it was exported under.
function renameRefs(formula, names) {
  const sheet = text => `'${text.replace(/'/g, "''")}'!`, escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), swap = new Map();
  for (const [from, to] of names) if (from !== to) { swap.set(sheet(from), sheet(to)); if (/^[\w.]+$/.test(from)) swap.set(from + '!', sheet(to)); }
  if (!swap.size) return formula;
  // One pass over the formula, so a name that was just written is never renamed again.
  const found = new RegExp(`'(?:[^']|'')*'!|(?<![\\w'.])(?:${[...swap.keys()].filter(k => !k.startsWith("'")).map(k => escape(k.slice(0, -1))).join('|') || '(?!)'})!`, 'g');
  return formula.replace(found, match => swap.get(match) ?? match);
}

// Writes the note as .xlsx or .ods, with formulas and their calculated values.
function writeNote(note, file, files) {
  const book = workbookOf(note), parse = csv => csvParse(csv), context = name => sheetContext(book, parse, name, files), names = exportNames(book);
  const workbook = XLSX.utils.book_new();
  for (const sheet of book) {
    const rows = parse(sheet.content), values = calculateSheet(rows, context(sheet.name)), ws = {};
    let maxC = 0;
    rows.forEach((row, r) => row.forEach((raw, c) => {
      if (raw === '') return;
      maxC = Math.max(maxC, c);
      const value = values[r][c], cell = typeof value === 'number' ? { t: 'n', v: value } : typeof value === 'boolean' ? { t: 'b', v: value } : { t: 's', v: String(value) };
      if (raw.startsWith('=')) cell.f = renameRefs(raw.slice(1), names);
      else if (typeof value === 'string' && /^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(value.trim())) { cell.t = 'n'; cell.v = Number(value); }
      ws[XLSX.utils.encode_cell({ r, c })] = cell;
    }));
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, rows.length - 1), c: maxC } });
    XLSX.utils.book_append_sheet(workbook, ws, names.get(sheet.name));
  }
  XLSX.writeFile(workbook, file, { bookType: /\.ods$/i.test(file) ? 'ods' : 'xlsx' });
}
module.exports = { readWorkbook, noteFromSheets, importFile, writeNote, SPREADSHEET, EXCEL_ONLY };
