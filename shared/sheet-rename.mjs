// Rewrite reference tokens, leaving quoted formula strings and references to other books alone.
export function renameSheetFormula(formula, from, to, books = null) {
  const tokens = /("(?:[^"]|"")*")|('?)\[([^\]]+)\]((?:[^'!]|'')*)\2!|('(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!/g;
  return formula.replace(tokens, (match, literal, quote, file, externalSheet, localSheet) => {
    if (literal) return match;
    const name = file != null ? externalSheet.replace(/''/g, "'") : localSheet.startsWith("'") ? localSheet.slice(1, -1).replace(/''/g, "'") : localSheet;
    if (name.toLowerCase() !== from.toLowerCase()) return match;
    if (books ? file == null || !books.some(b => b.toLowerCase() === file.toLowerCase()) : file != null) return match;
    return "'" + (file != null ? `[${file}]` : '') + to.replace(/'/g, "''") + "'!";
  });
}

export function rewriteFormulaBooks(formula, resolve) {
  const tokens = /("(?:[^"]|"")*")|('?)\[([^\]]+)\]((?:[^'!]|'')*)\2!/g;
  return formula.replace(tokens, (match, literal, quote, file, sheet) => {
    if (literal) return match;
    const next = resolve(file);
    return next === file ? match : "'[" + next.replace(/'/g, "''") + ']' + sheet.replace(/''/g, "'").replace(/'/g, "''") + "'!";
  });
}

export function renameSheetReferences(note, from, to, parse, stringify, books = null) {
  const rewrite = content => {
    if (!String(content).includes('!')) return content;
    let changed = false;
    const rows = parse(content).map(row => row.map(cell => {
      if (!cell.startsWith('=')) return cell;
      const next = renameSheetFormula(cell, from, to, books);
      changed ||= next !== cell;
      return next;
    }));
    return changed ? stringify(rows) : content;
  };
  const cache = entries => entries ? Object.fromEntries(Object.entries(entries).map(([ref, entry]) => [ref, { ...entry, formula: renameSheetFormula(entry.formula, from, to, books) }])) : undefined;
  return { ...note, content: rewrite(note.content || ''), ...(note.formulaCache ? { formulaCache: cache(note.formulaCache) } : {}), ...(note.sheets ? { sheets: note.sheets.map(s => ({ ...s, content: rewrite(s.content || ''), ...(s.formulaCache ? { formulaCache: cache(s.formulaCache) } : {}) })) } : {}) };
}
