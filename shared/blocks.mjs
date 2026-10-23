import { isTableLine, isTableSeparator } from './markdown-fix.mjs';

const randomId = () => globalThis.crypto.randomUUID();

export const NOTE_BLOCK_TYPES = ['p', 'h1', 'h2', 'h3', 'bullet', 'numbered', 'todo', 'quote', 'callout', 'code', 'table', 'divider'];
const LIST = ['bullet', 'numbered', 'todo'];

export const MAX_INDENT = 3;
const levelOf = value => Math.max(0, Math.min(MAX_INDENT, Math.round(Number(value) || 0)));

// Numbers for a run of list blocks: each level counts on its own, and a deeper level starts over after its parent moves on.
export function listNumbers(blocks) {
  const counts = [];
  return (blocks || []).map(b => {
    if (!LIST.includes(b.type)) { counts.length = 0; return 0; }
    const level = levelOf(b.indent);
    counts.length = level + 1;
    for (let i = 0; i <= level; i++) counts[i] ||= 0;
    if (b.type === 'numbered') return ++counts[level];
    counts[level] = 0;
    return 0;
  });
}

export function markdownToBlocks(markdown, makeId = randomId) {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n'), blocks = [];
  const push = (type, text, extra = {}) => blocks.push({ id: makeId(), type, text, ...extra });
  let paragraph = [], widths = [0];
  const flush = () => { if (paragraph.length) { push('p', paragraph.join('\n')); paragraph = []; } };
  // How deep a list line sits, judged against the lines above it, so two-space and four-space nesting both work.
  const depth = line => {
    const lead = /^[ \t]*/.exec(line)[0], width = lead.replace(/\t/g, '    ').length;
    while (widths.length > 1 && width < widths.at(-1)) widths.pop();
    if (width > widths.at(-1)) widths.push(width);
    return Math.min(MAX_INDENT, widths.length - 1);
  };
  const item = (type, text, line, extra = {}) => { const indent = depth(line); push(type, text, { ...extra, ...(indent ? { indent } : {}) }); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if (/^```/.test(line)) { flush(); widths = [0]; const body = []; i++; while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]); push('code', body.join('\n')); continue; }
    if (!line.trim()) { flush(); continue; }
    if (isTableLine(line) && isTableSeparator(lines[i + 1] || '')) { flush(); widths = [0]; const rows = []; while (i < lines.length && isTableLine(lines[i])) rows.push(lines[i++]); i--; push('table', rows.join('\n')); continue; }
    if ((m = /^(#{1,3}) +(.*)$/.exec(line))) { flush(); widths = [0]; push('h' + m[1].length, m[2]); }
    else if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); widths = [0]; push('divider', ''); }
    else if ((m = /^\s*[-*+] \[( |x|X)\] ?(.*)$/.exec(line))) { flush(); item('todo', m[2], line, { checked: m[1] !== ' ' }); }
    else if ((m = /^\s*[-*+] +(.*)$/.exec(line))) { flush(); item('bullet', m[1], line); }
    else if ((m = /^\s*\d+[.)] +(.*)$/.exec(line))) { flush(); item('numbered', m[1], line); }
    else if ((m = /^> 💡 ?(.*)$/.exec(line))) { flush(); widths = [0]; push('callout', m[1]); }
    else if ((m = /^> ?(.*)$/.exec(line))) { flush(); widths = [0]; push('quote', m[1]); }
    else { widths = [0]; paragraph.push(line); }
  }
  flush();
  return blocks.length ? blocks : [{ id: makeId(), type: 'p', text: '' }];
}

export function blocksToMarkdown(blocks) {
  let out = '', previous = null;
  const numbers = listNumbers(blocks);
  (blocks || []).forEach((b, index) => {
    const text = String(b.text || ''), pad = LIST.includes(b.type) ? '  '.repeat(levelOf(b.indent)) : '';
    const line = ({ h1: `# ${text}`, h2: `## ${text}`, h3: `### ${text}`, bullet: `${pad}- ${text}`, numbered: `${pad}${numbers[index]}. ${text}`, todo: `${pad}- [${b.checked ? 'x' : ' '}] ${text}`, quote: `> ${text}`, callout: `> 💡 ${text}`, code: '```\n' + text + '\n```', table: text, divider: '---' })[b.type] ?? text;
    const together = previous && LIST.includes(b.type) && LIST.includes(previous.type) && (previous.type === b.type || b.indent || previous.indent);
    out += (index === 0 ? '' : together ? '\n' : '\n\n') + line;
    previous = b;
  });
  return out;
}

export function cleanBlocks(blocks, types = NOTE_BLOCK_TYPES, limit = 2000) {
  if (!Array.isArray(blocks) || !blocks.length || blocks.length > limit) throw new Error(`A document can hold between 1 and ${limit} blocks.`);
  const seen = new Set();
  return blocks.map(b => {
    if (!b || !/^[a-zA-Z0-9-]+$/.test(b.id || '') || seen.has(b.id) || !types.includes(b.type)) throw new Error('Invalid document block.');
    seen.add(b.id);
    return { id: b.id, type: b.type, text: String(b.text || '').slice(0, 20000), ...(b.type === 'todo' ? { checked: Boolean(b.checked) } : {}), ...(LIST.includes(b.type) && levelOf(b.indent) ? { indent: levelOf(b.indent) } : {}) };
  });
}

// Pictures placed on a page or document: where they sit, how big they are, and how the text treats them.
export const IMAGE_WRAPS = ['around', 'break', 'over'];
export function cleanImages(images, limit = 60) {
  if (images == null) return [];
  if (!Array.isArray(images) || images.length > limit) throw new Error(`Keep up to ${limit} pictures on a page.`);
  const num = (v, lo, hi, d) => Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : d, seen = new Set();
  return images.map(i => {
    if (!i || !/^[a-zA-Z0-9-]+$/.test(i.id || '') || seen.has(i.id)) throw new Error('Invalid picture.');
    seen.add(i.id);
    const source = /^[a-zA-Z0-9-]+$/.test(i.chartId || '') ? { chartId: i.chartId } : /^[a-zA-Z0-9-]+$/.test(i.fileId || '') ? { fileId: i.fileId } : typeof i.src === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(i.src) && i.src.length <= 1500000 ? { src: i.src } : null;
    if (!source) throw new Error('A picture needs a stored file.');
    return { id: i.id, ...source, name: String(i.name || '').slice(0, 160), x: num(i.x, 0, 20000, 0), y: num(i.y, 0, 400000, 0), w: num(i.w, 24, 6000, 240), h: num(i.h, 24, 6000, 160), wrap: IMAGE_WRAPS.includes(i.wrap) ? i.wrap : 'around' };
  });
}
