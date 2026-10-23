// Repairs squashed structure in AI text (tables on one line, #Heading, bullet glyphs) before it is drawn or turned into blocks.
const SEPARATOR = /(?:\|\s*:?-{2,}:?\s*){2,}\|/;
const SEPARATOR_CELL = /^:?-{2,}:?$/;
const FENCE = /^\s*(```|~~~)/;

// "| a | b | |---|---| | 1 | 2 |" -> one line per row; the separator row gives the column count, so empty cells survive.
function splitTableLine(line) {
  const match = SEPARATOR.exec(line);
  if (!match) return [line];
  const first = line.indexOf('|');
  if (first < 0) return [line];
  const cells = line.slice(first).split('|').map(c => c.trim());
  if (cells[0] === '') cells.shift();
  if (cells.at(-1) === '') cells.pop();
  const columns = match[0].split('|').filter(c => SEPARATOR_CELL.test(c.trim())).length;
  const at = cells.findIndex((c, i) => SEPARATOR_CELL.test(c) && cells.slice(i, i + columns).every(x => SEPARATOR_CELL.test(x)));
  if (columns < 2 || at < 0) return [line];
  // Everything before the separator is the header.
  let head = cells.slice(0, at);
  while (head.length && head.at(-1) === '') head.pop();
  if (head.length < columns) return [line];
  const lead = head.slice(0, head.length - columns).filter(Boolean).join(' ');
  head = head.slice(head.length - columns);
  const out = [];
  if (lead || line.slice(0, first).trim()) out.push([line.slice(0, first).trim(), lead].filter(Boolean).join(' '), '');
  const row = values => '| ' + values.join(' | ') + ' |';
  out.push(row(head), '|' + Array(columns).fill(' --- ').join('|') + '|');
  let rest = cells.slice(at + columns);
  if (rest[0] === '') rest.shift();
  while (rest.length) {
    const chunk = rest.splice(0, columns);
    while (chunk.length < columns) chunk.push('');
    out.push(row(chunk));
    if (rest[0] === '') rest.shift();
  }
  return out;
}

export function fixMarkdown(text) {
  let source = String(text ?? '').replace(/\r\n/g, '\n');
  // Text that went through one escaping too many arrives with a literal \n where each line break should be.
  if (!source.includes('\n') && /\\n(?:\\n|[-*#>|]|\d+[.)] )/.test(source)) source = source.replace(/\\n/g, '\n');
  const lines = source.split('\n'), out = [];
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (FENCE.test(line)) { fenced = !fenced; out.push(line); continue; }
    if (fenced) { out.push(line); continue; }
    const code = []; line = line.replace(/(`+)(.*?)\1/g, value => { code.push(value); return '\u0000' + (code.length - 1) + '\u0000'; });
    const restore = value => value.replace(/\u0000(\d+)\u0000/g, (_, i) => code[Number(i)]);
    // <br> tags: a line break in text, a separator inside a table cell.
    line = line.replace(/<br\s*\/?>/gi, /^\s*\|/.test(line) ? ' / ' : '\n');
    if (line.includes('\n')) { out.push(...fixMarkdown(restore(line)).split('\n')); continue; }
    if (/^#{1,6}(?=[^#\s])/.test(line)) line = line.replace(/^(#{1,6})/, '$1 ');
    line = line.replace(/^(\s*)[•◦▪●]\s+/, '$1- ');
    if (line.includes('|') && SEPARATOR.test(line)) {
      const rows = splitTableLine(line);
      // A table needs a blank line above it.
      if (rows.length > 1 && out.length && out.at(-1).trim() && !/^\s*\|/.test(out.at(-1))) out.push('');
      out.push(...rows.map(restore));
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && out.length && out.at(-1).trim() && !/^\s*\|/.test(out.at(-1)) && isTableSeparator(lines[i + 1] || '')) out.push('');
    out.push(restore(line));
  }
  return out.join('\n');
}

export const isTableLine = line => /^\s*\|.*\|\s*$/.test(line);
export const isTableSeparator = line => /^\s*\|(?:\s*:?-{2,}:?\s*\|)+\s*$/.test(line);

// Table text -> rows of cells, for drawing.
export function parseTable(text) {
  const rows = String(text || '').split('\n').map(l => l.trim()).filter(Boolean).filter(l => !isTableSeparator(l)).map(l => {
    const cells = l.replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
    return cells;
  });
  return rows;
}
