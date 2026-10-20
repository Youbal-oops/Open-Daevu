const randomId = () => globalThis.crypto.randomUUID();

export const NOTE_BLOCK_TYPES = ['p', 'h1', 'h2', 'h3', 'bullet', 'numbered', 'todo', 'quote', 'callout', 'code', 'divider'];
const LIST = ['bullet', 'numbered', 'todo'];

export function markdownToBlocks(markdown, makeId = randomId) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n'), blocks = [];
  const push = (type, text, extra = {}) => blocks.push({ id: makeId(), type, text, ...extra });
  let paragraph = [];
  const flush = () => { if (paragraph.length) { push('p', paragraph.join('\n')); paragraph = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if (/^```/.test(line)) { flush(); const body = []; i++; while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]); push('code', body.join('\n')); continue; }
    if (!line.trim()) { flush(); continue; }
    if ((m = /^(#{1,3}) +(.*)$/.exec(line))) { flush(); push('h' + m[1].length, m[2]); }
    else if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); push('divider', ''); }
    else if ((m = /^\s*[-*+] \[( |x|X)\] ?(.*)$/.exec(line))) { flush(); push('todo', m[2], { checked: m[1] !== ' ' }); }
    else if ((m = /^\s*[-*+] +(.*)$/.exec(line))) { flush(); push('bullet', m[1]); }
    else if ((m = /^\s*\d+[.)] +(.*)$/.exec(line))) { flush(); push('numbered', m[1]); }
    else if ((m = /^> 💡 ?(.*)$/.exec(line))) { flush(); push('callout', m[1]); }
    else if ((m = /^> ?(.*)$/.exec(line))) { flush(); push('quote', m[1]); }
    else paragraph.push(line);
  }
  flush();
  return blocks.length ? blocks : [{ id: makeId(), type: 'p', text: '' }];
}

export function blocksToMarkdown(blocks) {
  let out = '', previous = '', number = 0;
  (blocks || []).forEach((b, index) => {
    const text = String(b.text || '');
    number = b.type === 'numbered' ? (previous === 'numbered' ? number + 1 : 1) : 0;
    const line = ({ h1: `# ${text}`, h2: `## ${text}`, h3: `### ${text}`, bullet: `- ${text}`, numbered: `${number}. ${text}`, todo: `- [${b.checked ? 'x' : ' '}] ${text}`, quote: `> ${text}`, callout: `> 💡 ${text}`, code: '```\n' + text + '\n```', divider: '---' })[b.type] ?? text;
    out += (index === 0 ? '' : LIST.includes(b.type) && previous === b.type ? '\n' : '\n\n') + line;
    previous = b.type;
  });
  return out;
}

export function cleanBlocks(blocks, types = NOTE_BLOCK_TYPES, limit = 2000) {
  if (!Array.isArray(blocks) || !blocks.length || blocks.length > limit) throw new Error(`A document can hold between 1 and ${limit} blocks.`);
  const seen = new Set();
  return blocks.map(b => {
    if (!b || !/^[a-zA-Z0-9-]+$/.test(b.id || '') || seen.has(b.id) || !types.includes(b.type)) throw new Error('Invalid document block.');
    seen.add(b.id);
    return { id: b.id, type: b.type, text: String(b.text || '').slice(0, 20000), ...(b.type === 'todo' ? { checked: Boolean(b.checked) } : {}) };
  });
}
