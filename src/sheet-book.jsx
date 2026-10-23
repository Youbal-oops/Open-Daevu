import React, { useMemo, useRef, useState } from 'react';
import { Plus, Copy, Pencil, Trash2 } from 'lucide-react';
import { csvParse, csvStringify } from '../shared/domain.mjs';
import { renameSheetReferences } from '../shared/sheet-rename.mjs';
import { sheetContext } from '../shared/sheet.mjs';
import { workbookOf, fieldsOf, uniqueName, projectFiles, MAX_SHEETS } from '../shared/workbook.mjs';
import { useContextMenu } from './context-menu';
import { uid } from './ui';
import { Sheet } from './sheet';

// A spreadsheet document: tabs for its sheets, and the grid for the open one.
export function SheetBook({ draft, change, projectId, noteId, peers }) {
  const list = useMemo(() => workbookOf(draft), [draft.content, draft.sheetName, draft.filters, draft.sheets, draft.formulaCache]);
  const [activeId, setActive] = useState('main'), [renaming, setRenaming] = useState(null), ctx = useContextMenu(), input = useRef(null);
  const active = list.find(s => s.id === activeId) || list[0];
  const files = useMemo(() => projectFiles(peers, csvParse, noteId), [peers, noteId]);
  const context = useMemo(() => sheetContext(list, csvParse, active.name, files), [list, active.name, files]);
  const update = next => change(fieldsOf(next));
  const patch = (id, values) => update(list.map(s => s.id === id ? { ...s, ...values } : s));
  const add = () => { if (list.length >= MAX_SHEETS) return; const sheet = { id: uid(), name: uniqueName(list, `Sheet ${list.length + 1}`), content: ',,\n,,', filters: null }; update([...list, sheet]); setActive(sheet.id); };
  const duplicate = sheet => { const copy = { ...sheet, id: uid(), name: uniqueName(list, sheet.name + ' copy') }; update([...list.slice(0, list.indexOf(sheet) + 1), copy, ...list.slice(list.indexOf(sheet) + 1)]); setActive(copy.id); };
  const remove = sheet => { if (list.length < 2) return; const at = list.indexOf(sheet), rest = list.filter(s => s !== sheet); update(rest); setActive(at === 0 ? 'main' : list[at - 1].id); };
  const rename = (sheet, value) => { setRenaming(null); const name = uniqueName(list.filter(s => s !== sheet), value || sheet.name); if (name !== sheet.name) change(renameSheetReferences({ ...draft, ...fieldsOf(list.map(s => s.id === sheet.id ? { ...s, name } : s)) }, sheet.name, name, csvParse, csvStringify)); };
  const menu = (e, sheet) => ctx.open(e, [{ label: 'Rename', icon: Pencil, onClick: () => setRenaming(sheet.id) }, { label: 'Duplicate', icon: Copy, onClick: () => duplicate(sheet), disabled: list.length >= MAX_SHEETS }, 'separator', { label: 'Delete sheet', icon: Trash2, danger: true, disabled: list.length < 2, onClick: () => remove(sheet) }]);
  return <div className="sheet-book">
    {ctx.element}
    {list.some(s => s.formulaCache && Object.keys(s.formulaCache).length) && <p className="inline-warning">Imported formulas retain their last saved values when a function is unsupported. Those saved values do not recalculate.</p>}
    <Sheet key={active.id} content={active.content} onChange={content => patch(active.id, { content })} filters={active.filters} onFilters={filters => patch(active.id, { filters })} context={context}
      script={draft.pythonScript || ''} command={draft.pythonCommand || 'python'} onScriptChange={pythonScript => change({ pythonScript })} onCommandChange={pythonCommand => change({ pythonCommand })} projectId={projectId} noteId={noteId} sheetId={active.id}/>
    <div className="sheet-tabs" role="tablist" aria-label="Sheets">
      {list.map(sheet => <div key={sheet.id} className={`sheet-tab${sheet.id === active.id ? ' on' : ''}`} role="tab" aria-selected={sheet.id === active.id} onContextMenu={e => menu(e, sheet)} onDoubleClick={() => setRenaming(sheet.id)}>
        {renaming === sheet.id ? <input ref={input} autoFocus aria-label="Sheet name" defaultValue={sheet.name} maxLength={60} onBlur={e => rename(sheet, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }}/> : <button type="button" onClick={() => setActive(sheet.id)}>{sheet.name}{sheet.filters?.on !== false && sheet.filters?.rules?.length ? <i className="tab-filter" title="Filtered"/> : null}</button>}
      </div>)}
      <button type="button" className="sheet-tab-add" aria-label="Add a sheet" title="Add a sheet" disabled={list.length >= MAX_SHEETS} onClick={add}><Plus size={14}/></button>
    </div>
  </div>;
}
