// A spreadsheet document holds several sheets. The first one is the note's own `content` (so references, Python and the
// canvas keep working); the rest live in `sheets`. Each sheet can carry a smart filter.
export const MAX_SHEETS = 24;
export const FILTER_OPS = {
  text: [['contains', 'contains'], ['notContains', 'does not contain'], ['begins', 'begins with'], ['ends', 'ends with'], ['is', 'is'], ['isNot', 'is not'], ['empty', 'is empty'], ['notEmpty', 'is not empty']],
  number: [['eq', 'equals'], ['ne', 'does not equal'], ['gt', 'is greater than'], ['ge', 'is at least'], ['lt', 'is less than'], ['le', 'is at most'], ['between', 'is between'], ['empty', 'is empty'], ['notEmpty', 'is not empty']],
  date: [['on', 'is on'], ['before', 'is before'], ['after', 'is after'], ['between', 'is between'], ['empty', 'is empty'], ['notEmpty', 'is not empty']]
};
const ALL_OPS = new Set(Object.values(FILTER_OPS).flat().map(([op]) => op));
const NO_VALUE = new Set(['empty', 'notEmpty']);

export function workbookOf(note) {
  return [{ id: 'main', name: note.sheetName || 'Sheet 1', content: note.content || '', filters: note.filters || null }, ...(note.sheets || []).map(s => ({ id: s.id, name: s.name, content: s.content || '', filters: s.filters || null }))];
}
// The note fields that hold a list of sheets, from the list.
export function fieldsOf(list) {
  const [first, ...rest] = list;
  return { content: first.content, sheetName: first.name, filters: first.filters || undefined, sheets: rest.length ? rest.map(s => ({ id: s.id, name: s.name, content: s.content, ...(s.filters ? { filters: s.filters } : {}) })) : undefined };
}
export function uniqueName(list, wanted) {
  const base = String(wanted || 'Sheet').trim().slice(0, 60) || 'Sheet', taken = new Set(list.map(s => s.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) { const candidate = `${base.slice(0, 56)} ${n}`; if (!taken.has(candidate.toLowerCase())) return candidate; }
}

export function cleanFilter(filter) {
  if (filter == null) return undefined;
  if (typeof filter !== 'object' || Array.isArray(filter) || !Array.isArray(filter.rules) || filter.rules.length > 12) throw new Error('Invalid filter.');
  const rules = filter.rules.map(r => {
    if (!r || !Number.isInteger(r.col) || r.col < 0 || r.col > 255 || !ALL_OPS.has(r.op)) throw new Error('Invalid filter rule.');
    return { col: r.col, op: r.op, ...(NO_VALUE.has(r.op) ? {} : { value: String(r.value ?? '').slice(0, 200), ...(r.op === 'between' ? { value2: String(r.value2 ?? '').slice(0, 200) } : {}) }) };
  });
  return { on: filter.on !== false, match: filter.match === 'any' ? 'any' : 'all', rules };
}
// Validated sheet fields of a note being saved. Throws on bad data.
export function cleanSheetFields(incoming, limit = 2000000) {
  const out = {};
  if (incoming.sheetName != null) { const name = String(incoming.sheetName).trim().slice(0, 60); if (name) out.sheetName = name; }
  const filters = cleanFilter(incoming.filters); if (filters && filters.rules.length) out.filters = filters;
  if (incoming.sheets != null) {
    if (!Array.isArray(incoming.sheets) || incoming.sheets.length > MAX_SHEETS - 1) throw new Error(`A spreadsheet can hold up to ${MAX_SHEETS} sheets.`);
    const seen = new Set([String(out.sheetName || 'Sheet 1').toLowerCase()]), sheets = [];
    for (const s of incoming.sheets) {
      if (!s || !/^[a-zA-Z0-9-]+$/.test(s.id || '') || typeof s.content !== 'string' || s.content.length > limit) throw new Error('Invalid sheet.');
      const name = String(s.name || '').trim().slice(0, 60);
      if (!name || seen.has(name.toLowerCase())) throw new Error('Give each sheet its own name.');
      seen.add(name.toLowerCase());
      const filter = cleanFilter(s.filters);
      sheets.push({ id: s.id, name, content: s.content, ...(filter && filter.rules.length ? { filters: filter } : {}) });
    }
    if (sheets.length) out.sheets = sheets;
  }
  return out;
}

// ---- Smart filters. Which rows pass, judged on the calculated values. Row 0 is the header and always stays.
const toNumber = v => { const t = String(v ?? '').trim().replace(/^[$€£₹]/, '').replace(/,(?=\d{3}(\D|$))/g, ''), p = /^(-?[\d.]+)%$/.exec(t); const n = p ? Number(p[1]) / 100 : Number(t); return t !== '' && Number.isFinite(n) ? n : null; };
const toDay = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? '').trim()); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null; };
export function ruleMatches(rule, cell) {
  const text = String(cell ?? ''), lower = text.toLowerCase(), want = String(rule.value ?? ''), wl = want.toLowerCase();
  switch (rule.op) {
    case 'empty': return text.trim() === '';
    case 'notEmpty': return text.trim() !== '';
    case 'contains': return lower.includes(wl);
    case 'notContains': return !lower.includes(wl);
    case 'begins': return lower.startsWith(wl);
    case 'ends': return lower.endsWith(wl);
    case 'is': return lower === wl;
    case 'isNot': return lower !== wl;
  }
  const date = ['on', 'before', 'after'].includes(rule.op) || (rule.op === 'between' && toDay(want) != null);
  const a = date ? toDay(text) : toNumber(text), b = date ? toDay(want) : toNumber(want), c = date ? toDay(rule.value2) : toNumber(rule.value2);
  if (a == null || b == null) return false;
  switch (rule.op) {
    case 'eq': case 'on': return a === b;
    case 'ne': return a !== b;
    case 'gt': case 'after': return a > b;
    case 'ge': return a >= b;
    case 'lt': case 'before': return a < b;
    case 'le': return a <= b;
    case 'between': return c != null && a >= Math.min(b, c) && a <= Math.max(b, c);
  }
  return false;
}
// Row numbers (from 1, below the header) that pass, or null when no filter is active.
export function passingRows(values, filter) {
  if (!filter || filter.on === false || !filter.rules?.length) return null;
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r] || [], hit = filter.rules.map(rule => ruleMatches(rule, row[rule.col]));
    if (filter.match === 'any' ? hit.some(Boolean) : hit.every(Boolean)) out.push(r);
  }
  return out;
}
// What kind of data a column holds, judged from its values, so the filter can offer the right choices.
export function columnKind(values, col) {
  let n = 0, numbers = 0, dates = 0;
  for (let r = 1; r < values.length && n < 60; r++) { const v = String(values[r]?.[col] ?? '').trim(); if (v === '') continue; n++; if (toDay(v) != null && /^\d{4}-\d{2}-\d{2}/.test(v)) dates++; else if (toNumber(v) != null) numbers++; }
  return n && dates / n > 0.7 ? 'date' : n && numbers / n > 0.7 ? 'number' : 'text';
}

// Other spreadsheets in the same project, by title, for formulas like =[Budget]Totals!B2.
export function projectFiles(notes, parse, exceptId) {
  const files = {};
  for (const note of notes || []) {
    if (note.kind !== 'sheet' || note.id === exceptId) continue;
    const book = workbookOf(note), sheets = {};
    for (const s of book) { let rows; sheets[s.name.toLowerCase()] = () => rows ||= parse(s.content); }
    files[String(note.title).trim().toLowerCase()] = { sheets, first: book[0].name.toLowerCase() };
  }
  return files;
}
