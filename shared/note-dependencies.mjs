import { csvParse, csvStringify } from './domain.mjs';
import { rewriteFormulaBooks } from './sheet-rename.mjs';
// A moved/copied document gets its own copies of picture files and chart sources.
// Originals stay in the source project because other documents may still use them.
export function planNoteTransfer(source, target, original, rootId) {
  const notes = [], artifacts = [], files = [], fileCopies = [], mapped = new Map([['note:' + original.id, rootId]]);
  const all = [...(target.notes || []), ...(target.artifacts || []), ...(target.files || [])];
  const titles = new Set([original.title, ...(target.notes || []).map(n => n.title)].map(t => String(t).toLowerCase()));
  const allocate = (kind, id) => {
    const key = kind + ':' + id;
    if (mapped.has(key)) return mapped.get(key);
    if (mapped.size > 200) throw Error('This document has too many linked dependencies to transfer at once.');
    const next = `${rootId}-${kind}-${mapped.size}`;
    if (all.some(item => item.id === next)) throw Error('A dependency copy already exists. Copy the document again.');
    mapped.set(key, next); return next;
  };
  const copyFile = id => {
    if (mapped.has('file:' + id)) return mapped.get('file:' + id);
    const item = source.files.find(f => f.id === id);
    if (!item) throw Error('A document picture is missing. Restore it before moving or copying the document.');
    const next = allocate('file', id), extension = /\.[a-z0-9]+$/i.exec(item.storedName || '')?.[0] || '';
    files.push({ ...structuredClone(item), id: next, storedName: next + extension.toLowerCase() });
    fileCopies.push({ from: item, to: files.at(-1) });
    return next;
  };
  const copyChart = id => {
    if (mapped.has('chart:' + id)) return mapped.get('chart:' + id);
    const item = (source.artifacts || []).find(a => a.id === id);
    if (!item) throw Error('An embedded chart is missing. Restore it before moving or copying the document.');
    const copy = structuredClone(item); copy.id = allocate('chart', id); artifacts.push(copy);
    const src = copy.data?.source;
    if (src?.sheetId) src.sheetId = copyNote(src.sheetId);
    if (src?.noteId) src.noteId = copyNote(src.noteId);
    if (copy.data?.sheetId) copy.data.sheetId = copyNote(copy.data.sheetId);
    return copy.id;
  };
  const rewrite = note => {
    if (note.images) note.images = note.images.map(image => ({ ...image, ...(image.fileId ? { fileId: copyFile(image.fileId) } : {}), ...(image.chartId ? { chartId: copyChart(image.chartId) } : {}) }));
    if (note.kind === 'sheet') {
      const formula = raw => rewriteFormulaBooks(raw, file => {
        const dependency = source.notes.findLast(n => n.kind === 'sheet' && [n.id, n.title].some(value => String(value).toLowerCase() === file.toLowerCase()));
        if (!dependency) throw Error('A linked spreadsheet is missing. Restore it before moving or copying this document.');
        return copyNote(dependency.id);
      });
      const sheet = value => {
        value.content = csvStringify(csvParse(value.content || '').map(row => row.map(raw => raw.startsWith('=') ? formula(raw) : raw)));
        if (value.formulaCache) value.formulaCache = Object.fromEntries(Object.entries(value.formulaCache).map(([ref, entry]) => [ref, { ...entry, formula: formula(entry.formula) }]));
      };
      sheet(note); for (const tab of note.sheets || []) sheet(tab);
    }
    return note;
  };
  const copyNote = id => {
    if (mapped.has('note:' + id)) return mapped.get('note:' + id);
    const item = source.notes.find(n => n.id === id);
    if (!item) throw Error('An embedded chart source is missing. Restore it before moving or copying the document.');
    const copy = structuredClone(item); copy.id = allocate('note', id); delete copy.history; delete copy.comments;
    let title = String(copy.title || 'Chart source').slice(0, 160), n = 2;
    while (titles.has(title.toLowerCase())) title = String(copy.title || 'Chart source').slice(0, 150) + ' ' + n++;
    copy.title = title; titles.add(title.toLowerCase());
    notes.push(copy); rewrite(copy); return copy.id;
  };
  const note = rewrite({ ...structuredClone(original), id: rootId });
  // Spreadsheet overlays are linked from the board rather than the note's picture list.
  for (const chart of source.artifacts || []) if ((chart.data?.source?.type === 'sheet' && chart.data.source.sheetId === original.id) || chart.data?.sheetId === original.id) copyChart(chart.id);
  return { note, notes, artifacts, files, fileCopies };
}

export function applyNoteDependencies(target, plan) {
  target.notes.push(...plan.notes);
  target.files.push(...plan.files);
  if (plan.artifacts.length) { target.artifacts ||= []; target.artifacts.push(...plan.artifacts); }
}

// Existing source-project boards must retain usable data after their document moves away.
export function preserveSourceCharts(project, original, snapshotId) {
  const charts = (project.artifacts || []).filter(a => a.data?.source?.noteId === original.id || a.data?.source?.sheetId === original.id || a.data?.sheetId === original.id);
  if (!charts.length) return;
  const snapshot = structuredClone(original); snapshot.id = snapshotId;
  delete snapshot.history; delete snapshot.comments;
  const base = String(original.title || 'Document').slice(0, 135), titles = new Set(project.notes.map(n => n.title));
  snapshot.title = base + ' (chart source)';
  for (let n = 2; titles.has(snapshot.title); n++) snapshot.title = `${base} (chart source ${n})`;
  project.notes.push(snapshot);
  for (const chart of charts) {
    if (chart.data.source?.noteId === original.id) chart.data.source.noteId = snapshotId;
    if (chart.data.source?.sheetId === original.id) chart.data.source.sheetId = snapshotId;
    if (chart.data.sheetId === original.id) chart.data.sheetId = snapshotId;
  }
  // Peers used by those boards may refer back to the moved workbook.
  for (const note of project.notes.filter(n => n.kind === 'sheet')) {
    const rewrite = raw => rewriteFormulaBooks(raw, file => [original.id, original.title].some(name => String(name).toLowerCase() === file.toLowerCase()) ? snapshotId : file);
    for (const sheet of [note, ...(note.sheets || [])]) {
      sheet.content = csvStringify(csvParse(sheet.content || '').map(row => row.map(raw => raw.startsWith('=') ? rewrite(raw) : raw)));
      if (sheet.formulaCache) sheet.formulaCache = Object.fromEntries(Object.entries(sheet.formulaCache).map(([ref, entry]) => [ref, { ...entry, formula: rewrite(entry.formula) }]));
    }
  }
}
