import React from 'react';
import { Plus, X, Trash2, Rows3, Columns3 } from 'lucide-react';
import { useContextMenu } from './context-menu';
import { parseTable } from '../shared/markdown-fix.mjs';

export const TABLE_TEMPLATE = '| Column | Column | Column |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |';

const cellText = value => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
// Rows of cells back to the stored markdown table.
export function tableToText(rows) {
  const width = Math.max(1, ...rows.map(r => r.length)), line = r => '| ' + Array.from({ length: width }, (_, i) => cellText(r[i] ?? '')).join(' | ') + ' |';
  return [line(rows[0] || []), '|' + Array(width).fill(' --- ').join('|') + '|', ...rows.slice(1).map(line)].join('\n');
}

// A table edited as a grid of fields.
export function TableBlock({ text, onChange, onDelete, readOnly }) {
  const ctx = useContextMenu();
  const rows = parseTable(text);
  if (!rows.length) rows.push(['']);
  const width = Math.max(...rows.map(r => r.length)), grid = rows.map(r => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  const commit = next => onChange(tableToText(next));
  const set = (r, c, value) => commit(grid.map((row, i) => i === r ? row.map((x, j) => j === c ? value : x) : row));
  const blankRow = () => Array(width).fill('');
  // An untouched table (blank or starter headings) goes away with Backspace in an empty cell; text in a cell is edited as usual.
  const empty = grid.every((row, r) => row.every(cell => !cell.trim() || (r === 0 && cell.trim() === 'Column')));
  const menu = e => { if (readOnly) return; ctx.open(e, [{ label: 'Add row', icon: Rows3, onClick: () => commit([...grid, blankRow()]) }, { label: 'Add column', icon: Columns3, onClick: () => commit(grid.map(row => [...row, ''])) }, ...(onDelete ? ['separator', { label: 'Delete table', icon: Trash2, danger: true, onClick: onDelete }] : [])]); };
  return <div className="table-block" onContextMenu={menu}>{ctx.element}
    <div className="table-scroll">
      <table>
        <tbody>{grid.map((row, r) => <tr key={r} className={r === 0 ? 'head' : ''}>
          {row.map((value, c) => <td key={c}><input value={value} readOnly={readOnly} aria-label={r === 0 ? `Column ${c + 1} title` : `Row ${r}, column ${c + 1}`} onChange={e => set(r, c, e.target.value)} onKeyDown={e => {
            if ((e.key === 'Backspace' || e.key === 'Delete') && empty && onDelete && e.currentTarget.value === '') { e.preventDefault(); onDelete(); return; }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const table = e.currentTarget.closest('table'), next = table.rows[r + 1]?.cells[c]?.firstChild; if (next) next.focus(); else { commit([...grid, blankRow()]); setTimeout(() => table.rows[r + 1]?.cells[c]?.firstChild?.focus(), 30); } }
          }}/>
            {!readOnly && r === 0 && width > 1 && <button type="button" className="table-remove col" aria-label={`Remove column ${c + 1}`} title="Remove column" onClick={() => commit(grid.map(x => x.filter((_, j) => j !== c)))}><X size={11}/></button>}
            {!readOnly && c === width - 1 && r > 0 && <button type="button" className="table-remove row" aria-label={`Remove row ${r}`} title="Remove row" onClick={() => commit(grid.filter((_, i) => i !== r))}><X size={11}/></button>}
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {!readOnly && <div className="table-actions"><button type="button" onClick={() => commit([...grid, blankRow()])}><Plus size={12}/>Row</button><button type="button" onClick={() => commit(grid.map(row => [...row, '']))}><Plus size={12}/>Column</button></div>}
  </div>;
}
