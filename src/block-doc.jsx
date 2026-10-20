import React, { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageSquare, Plus, GripVertical, Check } from 'lucide-react';
import { uid } from './ui';
import { inlineToHtml, inlineToPlain, treeToInline, escapeHtml } from '../shared/inline.mjs';

const TYPES = [['p', 'Text', 'Plain text'], ['h1', 'Heading 1', 'Big section heading'], ['h2', 'Heading 2', 'Medium section heading'], ['h3', 'Heading 3', 'Small section heading'], ['bullet', 'Bulleted list', 'A simple list'], ['numbered', 'Numbered list', 'An ordered list'], ['todo', 'To-do', 'Track a task'], ['quote', 'Quote', 'Set a quote apart'], ['callout', 'Callout', 'Highlight something'], ['code', 'Code', 'A monospace block'], ['divider', 'Divider', 'A thin line']];
const SHORTCUTS = [[/^# $/, 'h1'], [/^## $/, 'h2'], [/^### $/, 'h3'], [/^[-*] $/, 'bullet'], [/^1\. $/, 'numbered'], [/^\[\] $/, 'todo'], [/^> $/, 'quote'], [/^```$/, 'code']];
const LISTS = ['bullet', 'numbered', 'todo'];
const make = (type = 'p', text = '') => ({ id: uid(), type, text, ...(type === 'todo' ? { checked: false } : {}) });
const matches = query => TYPES.filter(([, label, hint]) => !query || `${label} ${hint}`.toLowerCase().includes(query.toLowerCase()));

// ---- Text that shows its formatting. Stored text keeps light markers; the editor never shows them.
function domToTree(node) {
  const out = [];
  for (const child of node.childNodes) {
    if (child.nodeType === 3) out.push({ t: 'text', v: child.nodeValue });
    else if (child.nodeType === 1) out.push({ t: 'el', tag: child.tagName.toLowerCase(), style: child.getAttribute('style') || '', href: child.getAttribute('href') || '', kids: domToTree(child) });
  }
  return out;
}
const serialize = node => treeToInline(domToTree(node));
// Where the caret sits, counted in the words you can see (not the hidden markers).
function offsets(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;
  const at = (node, offset) => { const pre = document.createRange(); pre.selectNodeContents(el); pre.setEnd(node, offset); return pre.toString().length; };
  return { start: at(range.startContainer, range.startOffset), end: at(range.endContainer, range.endOffset), collapsed: range.collapsed };
}
function putCaret(el, offset) {
  const sel = window.getSelection(), range = document.createRange(), walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let left = offset, node;
  while ((node = walker.nextNode())) { if (left <= node.nodeValue.length) { range.setStart(node, left); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); return; } left -= node.nodeValue.length; }
  range.selectNodeContents(el); range.collapse(false); sel.removeAllRanges(); sel.addRange(range);
}
function sliceMarkup(el, which) {
  const sel = window.getSelection(), range = sel.getRangeAt(0), part = document.createRange();
  part.selectNodeContents(el);
  if (which === 'before') part.setEnd(range.startContainer, range.startOffset); else part.setStart(range.endContainer, range.endOffset);
  const holder = document.createElement('div');
  holder.appendChild(part.cloneContents());
  return serialize(holder);
}
function onEdge(el, edge) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const rect = sel.getRangeAt(0).getClientRects()[0], box = el.getBoundingClientRect(), line = parseFloat(getComputedStyle(el).lineHeight) || 24;
  if (!rect) return true;
  return edge === 'top' ? rect.top - box.top < line * 0.9 : box.bottom - rect.bottom < line * 0.9;
}
const FORMATS = { b: 'bold', i: 'italic', u: 'underline' };

const RichText = memo(function RichText({ block, focus, api }) {
  const ref = useRef(null), shown = useRef(null);
  useLayoutEffect(() => { const el = ref.current; if (el && shown.current !== block.text) { el.innerHTML = inlineToHtml(block.text); shown.current = block.text; } }, [block.text]);
  useEffect(() => {
    if (!focus || !ref.current) return;
    const el = ref.current; el.focus();
    putCaret(el, focus.caret === 'end' ? Infinity : focus.caret === 'start' ? 0 : focus.caret);
  }, [focus]);
  const sync = () => { const el = ref.current; if (!el) return; if (el.innerHTML === '<br>') el.innerHTML = ''; const value = serialize(el); shown.current = value; api.current.type(block, value); };
  function keys(e) {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && !e.altKey && !e.shiftKey && FORMATS[k]) { e.preventDefault(); document.execCommand(FORMATS[k]); sync(); return; }
    if (mod && !e.altKey && e.shiftKey && k === 'x') { e.preventDefault(); document.execCommand('strikeThrough'); sync(); return; }
    if (mod && !e.altKey && !e.shiftKey && k === 'e') { e.preventDefault(); const chosen = window.getSelection().toString(); if (chosen) { document.execCommand('insertHTML', false, `<code>${escapeHtml(chosen)}</code>`); sync(); } return; }
    if (mod && e.altKey && /^Digit[0-3]$/.test(e.code)) { e.preventDefault(); api.current.convert(block.id, ['p', 'h1', 'h2', 'h3'][Number(e.code.slice(5))]); return; }
    if (mod && e.shiftKey && !e.altKey && { Digit7: 'numbered', Digit8: 'bullet', Digit9: 'todo' }[e.code]) { e.preventDefault(); api.current.convert(block.id, { Digit7: 'numbered', Digit8: 'bullet', Digit9: 'todo' }[e.code]); return; }
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); document.execCommand('insertText', false, '\n'); sync(); return; }
    api.current.key(e, block);
  }
  return <div ref={ref} contentEditable suppressContentEditableWarning spellCheck role="textbox" aria-multiline="true" aria-label="Document text" data-placeholder={block.type === 'p' ? "Type '/' for blocks" : ''}
    className={`doc-text rich ${block.type}${block.checked ? ' checked' : ''}`} onInput={sync} onKeyDown={keys}
    onPaste={e => { e.preventDefault(); const text = e.clipboardData.getData('text/plain'); if (text) { document.execCommand('insertText', false, text); sync(); } }}/>;
});

// Code blocks stay plain, monospaced text.
const CodeText = memo(function CodeText({ block, focus, api }) {
  const ref = useRef(null);
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = '0px'; el.style.height = el.scrollHeight + 'px'; } }, [block.text]);
  useEffect(() => {
    if (!focus || !ref.current) return;
    const el = ref.current; el.focus();
    const at = focus.caret === 'end' ? el.value.length : focus.caret === 'start' ? 0 : focus.caret;
    el.setSelectionRange(at, at);
  }, [focus]);
  return <textarea ref={ref} rows={1} spellCheck className={`doc-text ${block.type}${block.checked ? ' checked' : ''}`} value={block.text} aria-label="Document text" placeholder="Code"
    onChange={e => api.current.type(block, e.target.value)} onKeyDown={e => api.current.key(e, block)}/>;
});
const BlockText = props => props.block.type === 'code' ? <CodeText {...props}/> : <RichText {...props}/>;

const Row = memo(function Row({ b, num, focus, count, menu, pick, over, api }) {
  const entries = menu ? matches(menu.query) : [];
  return <div className={`doc-block ${b.type}${over ? ' drop' : ''}`} data-block-id={b.id}
    onDragOver={e => { if (api.current.dragging()) { e.preventDefault(); api.current.over(b.id); } }} onDrop={e => { e.preventDefault(); api.current.drop(b.id); }}>
    <div className="doc-gutter">
      <button className="doc-add" aria-label="Add a block below" title="Add a block" onClick={() => api.current.addBelow(b.id)}><Plus size={14}/></button>
      <span className="doc-grip" draggable aria-label="Drag to reorder" title="Drag to reorder" onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; api.current.startDrag(b.id); }} onDragEnd={() => api.current.endDrag()}><GripVertical size={14}/></span>
    </div>
    <div className="doc-body">
      {b.type === 'divider' ? <hr/> : <>
        {b.type === 'bullet' && <span className="doc-marker">•</span>}
        {b.type === 'numbered' && <span className="doc-marker num">{num}.</span>}
        {b.type === 'todo' && <button className={`doc-check ${b.checked ? 'on' : ''}`} role="checkbox" aria-checked={Boolean(b.checked)} aria-label="Done" onClick={() => api.current.patch(b.id, { checked: !b.checked })}>{b.checked && <Check size={11}/>}</button>}
        <BlockText block={b} focus={focus} api={api}/>
      </>}
      {menu && entries.length > 0 && <div className="slash-menu page-menu" role="listbox" aria-label="Change block type">{entries.map(([type, label, hint], n) => <button key={type} type="button" role="option" aria-selected={n === pick} className={n === pick ? 'active' : ''} onMouseDown={ev => { ev.preventDefault(); api.current.choose(type, b.id); }}><span>{label}</span><small>{hint}</small></button>)}</div>}
    </div>
    <button className={`doc-comment ${count ? 'has' : ''}`} aria-label={count ? `${count} comment${count === 1 ? '' : 's'} on this block` : 'Comment on this block'} title="Comment" onClick={() => api.current.comment(b.id)}><MessageSquare size={13}/>{count > 0 && <i>{count}</i>}</button>
  </div>;
});

// A block editor for documents. The caller keeps the blocks; every change hands back the whole new list.
export function BlockDoc({ blocks, onChange, commentCounts = {}, onComment }) {
  const [focus, setFocus] = useState(null), [menu, setMenu] = useState(null), [pick, setPick] = useState(0), [drag, setDrag] = useState(null);
  const api = useRef({}), latest = useRef(blocks); latest.current = blocks;
  const focusOn = (id, caret) => setFocus({ id, caret, nonce: Math.random() });
  const commit = fn => onChange(fn(latest.current));
  const patch = (id, values) => commit(list => list.map(b => b.id === id ? { ...b, ...values } : b));
  const insertAfter = (id, items) => commit(list => { const at = list.findIndex(b => b.id === id); return [...list.slice(0, at + 1), ...items, ...list.slice(at + 1)]; });

  api.current = {
    patch,
    type(b, value) {
      const hit = b.type !== 'code' && SHORTCUTS.find(([re]) => re.test(value));
      if (hit) { patch(b.id, { type: hit[1], text: '', ...(hit[1] === 'todo' ? { checked: false } : {}) }); focusOn(b.id, 'start'); setMenu(null); return; }
      if (b.type !== 'code' && value.startsWith('/') && !value.includes('\n')) { setMenu({ id: b.id, query: value.slice(1) }); setPick(0); }
      else if (menu?.id === b.id) setMenu(null);
      patch(b.id, { text: value });
    },
    choose(type, id) {
      setMenu(null);
      if (type === 'divider') { const next = make('p'); commit(list => { const at = list.findIndex(b => b.id === id), copy = [...list]; copy[at] = { id, type: 'divider', text: '' }; copy.splice(at + 1, 0, next); return copy; }); focusOn(next.id, 'start'); return; }
      patch(id, { type, text: '', ...(type === 'todo' ? { checked: false } : {}) }); focusOn(id, 'start');
    },
    key(e, b) {
      const list = latest.current, i = list.findIndex(x => x.id === b.id), el = e.target, rich = el.tagName !== 'TEXTAREA';
      const here = rich ? offsets(el) || { start: 0, end: 0 } : { start: el.selectionStart, end: el.selectionEnd };
      if (menu?.id === b.id) {
        const entries = matches(menu.query);
        if (e.key === 'ArrowDown') { e.preventDefault(); setPick(p => (p + 1) % Math.max(1, entries.length)); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); setPick(p => (p + entries.length - 1) % Math.max(1, entries.length)); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (entries[pick]) api.current.choose(entries[pick][0], b.id); return; }
        if (e.key === 'Escape') { setMenu(null); return; }
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && b.type === 'code') { e.preventDefault(); const next = make('p'); insertAfter(b.id, [next]); focusOn(next.id, 'start'); return; }
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && b.type !== 'code') {
        e.preventDefault();
        if (b.text === '---') { api.current.choose('divider', b.id); return; }
        if (LISTS.includes(b.type) && !b.text) { patch(b.id, { type: 'p' }); return; }
        const before = rich ? sliceMarkup(el, 'before') : b.text.slice(0, el.selectionStart), after = rich ? sliceMarkup(el, 'after') : b.text.slice(el.selectionEnd), next = make(LISTS.includes(b.type) ? b.type : 'p', after);
        commit(all => { const at = all.findIndex(x => x.id === b.id), copy = [...all]; copy[at] = { ...b, text: before }; copy.splice(at + 1, 0, next); return copy; });
        focusOn(next.id, 'start'); return;
      }
      if (e.key === 'Backspace' && here.start === 0 && here.end === 0) {
        if (b.type !== 'p') { e.preventDefault(); patch(b.id, { type: 'p' }); return; }
        if (i > 0) {
          e.preventDefault();
          const prev = list[i - 1];
          if (prev.type === 'divider') { commit(all => all.filter(x => x.id !== prev.id)); return; }
          const join = inlineToPlain(prev.text).length;
          commit(all => all.filter(x => x.id !== b.id).map(x => x.id === prev.id ? { ...x, text: x.text + b.text } : x));
          focusOn(prev.id, join); return;
        }
      }
      if (e.key === 'ArrowUp' && i > 0 && (rich ? onEdge(el, 'top') : !el.value.slice(0, el.selectionStart).includes('\n'))) { const prev = list[i - 1]; if (prev.type !== 'divider') { e.preventDefault(); focusOn(prev.id, 'end'); } return; }
      if (e.key === 'ArrowDown' && i < list.length - 1 && (rich ? onEdge(el, 'bottom') : !el.value.slice(el.selectionEnd).includes('\n'))) { const next = list[i + 1]; if (next.type !== 'divider') { e.preventDefault(); focusOn(next.id, 'start'); } }
    },
    convert(id, type) { patch(id, { type, ...(type === 'todo' ? { checked: false } : {}) }); focusOn(id, 'end'); },
    addBelow(id) { const next = make('p', '/'); insertAfter(id, [next]); setMenu({ id: next.id, query: '' }); setPick(0); focusOn(next.id, 'end'); },
    comment(id) { onComment?.(id); },
    dragging: () => Boolean(drag),
    startDrag: id => setDrag({ id }),
    over: id => setDrag(d => d && d.over !== id ? { ...d, over: id } : d),
    endDrag: () => setDrag(null),
    drop(id) {
      if (drag && drag.id !== id) commit(all => { const moving = all.find(x => x.id === drag.id), rest = all.filter(x => x.id !== drag.id); rest.splice(rest.findIndex(x => x.id === id), 0, moving); return rest; });
      setDrag(null);
    }
  };

  let run = 0;
  return <div className="doc-blocks" role="document" aria-label="Document blocks">
    {blocks.map(b => {
      run = b.type === 'numbered' ? run + 1 : 0;
      return <Row key={b.id} b={b} num={run} focus={focus?.id === b.id ? focus : null} count={commentCounts[b.id] || 0} menu={menu?.id === b.id ? menu : null} pick={menu?.id === b.id ? pick : 0} over={drag?.over === b.id && drag.id !== b.id} api={api}/>;
    })}
    <button className="doc-add-end" onClick={() => { const last = blocks.at(-1); if (last && last.type === 'p' && !last.text) { focusOn(last.id, 'end'); return; } const next = make('p'); commit(all => [...all, next]); focusOn(next.id, 'start'); }}><Plus size={14}/>Add a block</button>
  </div>;
}
