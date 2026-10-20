// Text inside a block can carry bold, italic, underline, strike-through, code and links. They are stored as light
// markers inside the text (so exports, search and agents keep working), but the editor never shows the markers:
// it shows the formatting. These helpers turn stored text into what is drawn, and what is drawn back into stored text.
const ESCAPABLE = '\\*_`~[]+';
const TOKEN = /\\([\\*_`~\[\]+])|`([^`\n]+)`|\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*|\+\+(?=\S)([\s\S]+?)(?<=\S)\+\+|~~(?=\S)([\s\S]+?)(?<=\S)~~|\*(?=\S)([^*\n]+?)(?<=\S)\*|(?<![A-Za-z0-9])_(?=\S)([^_\n]+?)(?<=\S)_(?![A-Za-z0-9])|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g;
export const escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Stored text to HTML for the editor.
export function inlineToHtml(text) {
  const source = String(text ?? ''), out = [];
  let last = 0;
  for (const m of source.matchAll(TOKEN)) {
    out.push(escapeHtml(source.slice(last, m.index)));
    last = m.index + m[0].length;
    if (m[1] !== undefined) out.push(escapeHtml(m[1]));
    else if (m[2] !== undefined) out.push(`<code>${escapeHtml(m[2])}</code>`);
    else if (m[3] !== undefined) out.push(`<b>${inlineToHtml(m[3])}</b>`);
    else if (m[4] !== undefined) out.push(`<u>${inlineToHtml(m[4])}</u>`);
    else if (m[5] !== undefined) out.push(`<s>${inlineToHtml(m[5])}</s>`);
    else if (m[6] !== undefined || m[7] !== undefined) out.push(`<i>${inlineToHtml(m[6] ?? m[7])}</i>`);
    else out.push(`<a href="${escapeHtml(m[9])}">${inlineToHtml(m[8])}</a>`);
  }
  out.push(escapeHtml(source.slice(last)));
  return out.join('');
}

// Stored text as plain words, with no markers: what a person would count as its length.
export function inlineToPlain(text) {
  const source = String(text ?? '');
  let out = '', last = 0;
  for (const m of source.matchAll(TOKEN)) {
    out += source.slice(last, m.index);
    last = m.index + m[0].length;
    out += m[1] ?? m[2] ?? (m[3] !== undefined ? inlineToPlain(m[3]) : m[4] !== undefined ? inlineToPlain(m[4]) : m[5] !== undefined ? inlineToPlain(m[5]) : m[6] !== undefined || m[7] !== undefined ? inlineToPlain(m[6] ?? m[7]) : inlineToPlain(m[8]));
  }
  return out + source.slice(last);
}

export const escapeInline = value => String(value).replace(/[\\*_`~\[\]]/g, c => '\\' + c).replace(/\+\+/g, '\\+\\+');

const has = (nodes, test) => nodes.some(n => n.t === 'el' && (test(n) || has(n.kids || [], test)));
function marks(node) {
  const tag = node.tag, style = node.style || '', set = new Set();
  if (tag === 'b' || tag === 'strong' || /font-weight:\s*(bold|[6-9]00)/i.test(style)) set.add('bold');
  if (tag === 'i' || tag === 'em' || /font-style:\s*italic/i.test(style)) set.add('italic');
  if (tag === 'u' || /text-decoration[^;]*underline/i.test(style)) set.add('underline');
  if (tag === 's' || tag === 'strike' || tag === 'del' || /text-decoration[^;]*line-through/i.test(style)) set.add('strike');
  if (tag === 'code') set.add('code');
  return set;
}
const wrap = (inner, marker) => {
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
  return core ? lead + marker + core + marker + trail : inner;
};

// What the editor drew, as a small tree of { t: 'text', v } and { t: 'el', tag, style, href, kids }, back to stored text.
export function treeToInline(nodes, inBold = false) {
  let out = '';
  for (const node of nodes) {
    if (node.t === 'text') { out += escapeInline(node.v); continue; }
    if (node.tag === 'br') { out += '\n'; continue; }
    const set = marks(node), kids = node.kids || [];
    if (set.has('code')) { const raw = kids.map(k => k.t === 'text' ? k.v : '').join(''); out += raw && !raw.includes('`') ? wrap('`' + raw + '`', '') : escapeInline(raw); continue; }
    let inner = treeToInline(kids, inBold || set.has('bold'));
    if (node.tag === 'a' && /^https?:\/\//i.test(node.href || '')) inner = `[${inner}](${node.href})`;
    if (set.has('italic')) inner = wrap(inner, inBold || set.has('bold') || has(kids, n => marks(n).has('bold')) ? '_' : '*');
    if (set.has('bold')) inner = wrap(inner, '**');
    if (set.has('underline')) inner = wrap(inner, '++');
    if (set.has('strike')) inner = wrap(inner, '~~');
    out += inner;
  }
  return out;
}
