import { resolveRef, kpiValue, listReferences, csvParse } from '../shared/domain.mjs';
import { calculateSheet } from '../shared/sheet.mjs';

const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const coerce = v => { const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '')); return String(v).trim() !== '' && Number.isFinite(n) ? n : v; };
function findTable(project, name) {
  const key = String(name || '').trim().toLowerCase();
  const db = (project.artifacts || []).find(a => a.kind === 'database' && (a.id === name || a.title.toLowerCase() === key));
  if (db) return { type: 'database', item: db };
  const sheet = project.notes.find(n => n.kind === 'sheet' && (n.id === name || n.title.toLowerCase() === key));
  return sheet ? { type: 'sheet', item: sheet } : null;
}
// Read-only answers for a live app. Apps can see values, tables and image files; they cannot change project data.
export function bridgeRead(project, op, args = []) {
  switch (op) {
    case 'get': { const r = resolveRef(project, String(args[0] || '')); if (!r.ok) throw new Error(r.error); return r.list ? r.list.map(coerce) : coerce(r.value); }
    case 'refs': return listReferences(project);
    case 'kpis': return (project.kpis || []).map(k => ({ id: k.id, label: k.label, value: coerce(kpiValue(project, k)), unit: k.unit || '', target: k.target || '' }));
    case 'tables': return [...(project.artifacts || []).filter(a => a.kind === 'database').map(a => ({ id: a.id, name: a.title, kind: 'database' })), ...project.notes.filter(n => n.kind === 'sheet').map(n => ({ id: n.id, name: n.title, kind: 'sheet' }))];
    case 'table': {
      const found = findTable(project, args[0]); if (!found) throw new Error('No database or spreadsheet is named "' + args[0] + '".');
      if (found.type === 'database') { const { properties, rows } = found.item.data; return { id: found.item.id, name: found.item.title, kind: 'database', columns: properties.map(p => ({ id: p.id, name: p.name, type: p.type })), rows: rows.slice(0, 5000).map(r => ({ id: r.id, values: Object.fromEntries(properties.map(p => [p.name, r.cells[p.id] ?? ''])) })) }; }
      const raw = csvParse(found.item.content), values = calculateSheet(raw), header = (values[0] || []).map((h, i) => String(h) || 'Column ' + (i + 1));
      return { id: found.item.id, name: found.item.title, kind: 'sheet', columns: header.map(h => ({ name: h })), rows: values.slice(1, 5001).map(r => ({ values: Object.fromEntries(header.map((h, i) => [h, coerce(r[i] ?? '')])) })) };
    }
    case 'files': return project.files.filter(f => IMAGE.test(f.storedName || f.name)).map(f => ({ id: f.id, name: f.name, size: f.size }));
    default: throw new Error('Unknown request "' + op + '".');
  }
}
