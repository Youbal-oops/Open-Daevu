import { CommentsPanel } from './comments';
import { MessageSquare as CommentIcon } from 'lucide-react';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppWindow, Gauge, Link2, ListOrdered, ChevronRight as Chevron, Code2, SmilePlus, ImagePlus, Plus, GripVertical, Type, Heading1, Heading2, Heading3, List, CheckSquare, Square, Quote, Lightbulb, Minus, FileText, Table2, Upload, Paperclip, Folder, ArrowUpRight, Trash2, Star, LayoutDashboard, Network, Kanban, Undo2, Redo2 } from 'lucide-react';
import { api } from './api';
import { uid, now, date } from './ui';
import { KINDS, kindIcon, kindName, newArtifact, ArtifactPreview, KanbanBoard } from './boards';
import { Database } from './database';
import { kpiValue, evaluateExpression } from '../shared/domain.mjs';
import { SheetEmbed, DocEmbed } from './canvas';
import { TableBlock, TABLE_TEMPLATE } from './table-block';
import { inlineToHtml, inlineToPlain } from '../shared/inline.mjs';
import { listNumbers } from '../shared/blocks.mjs';
import { useHistory, changedBlock } from './history';
import { EmojiPicker } from './emoji-picker';
import { useContextMenu } from './context-menu';
import { blockMenuItems, EmojiPopup } from './block-menu';
import { useFloatBoard, useImagePicker, ImageLayer, FlowSlot, FlowPush } from './float-images';

const TEXT_BLOCKS = [['p', 'Text', Type, 'Plain text'], ['h1', 'Heading 1', Heading1, 'Big section heading'], ['h2', 'Heading 2', Heading2, 'Medium heading'], ['h3', 'Heading 3', Heading3, 'Small heading'], ['bullet', 'Bulleted list', List, 'A simple list'], ['numbered', 'Numbered list', ListOrdered, 'A list with numbering'], ['toggle', 'Toggle list', Chevron, 'Hide content inside a heading'], ['code', 'Code', Code2, 'Capture a code snippet'], ['table', 'Table', Table2, 'Rows and columns you can edit'], ['image', 'Image', ImagePlus, 'Place a picture the text wraps around'], ['metric', 'Live value', Gauge, 'Show a number from your project'], ['todo', 'To-do', CheckSquare, 'Track a task'], ['quote', 'Quote', Quote, 'Capture a quote'], ['callout', 'Callout', Lightbulb, 'Make text stand out'], ['divider', 'Divider', Minus, 'Visually separate sections']];
const NO_TEXT = ['embed', 'divider', 'table', 'metric'], FLOW_TEXT = new Set(['p', 'h1', 'h2', 'h3', 'bullet', 'numbered', 'todo']);
const block = (type = 'p', text = '', extra = {}) => ({ id: uid(), type, text, ...extra });
const SHORTCUTS = [[/^# $/, 'h1'], [/^## $/, 'h2'], [/^### $/, 'h3'], [/^[-*] $/, 'bullet'], [/^\[\] $/, 'todo'], [/^> $/, 'quote'], [/^1\. $/, 'numbered'], [/^```$/, 'code']];
const ICONS = ['📄', '📚', '🚀', '🎯', '💡', '🧠', '📊', '🗂️', '✅', '🔬', '📝', '🌱', '🔥', '⭐', '🧭', '🛠️', '📅', '💼', '🎨', '🔒'];
const COVERS = [['', 'None'], ['sage', 'Sage'], ['sky', 'Sky'], ['sand', 'Sand'], ['rose', 'Rose'], ['slate', 'Slate'], ['violet', 'Violet']];

function AutoText({ value, onChange, onKeyDown, focus, onFocused, onEnter, onLeave, className, placeholder, ariaLabel }) {
  const ref = useRef(null);
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = '0px'; el.style.height = el.scrollHeight + 'px'; } }, [value]);
  useEffect(() => { if (focus != null && ref.current) { ref.current.focus(); const end = focus === 'end' ? ref.current.value.length : typeof focus === 'number' ? Math.min(focus, ref.current.value.length) : 0; ref.current.setSelectionRange(end, end); onFocused?.(); } }, [focus]);
  return <textarea ref={ref} data-flow-text rows={1} className={className} value={value} placeholder={placeholder} aria-label={ariaLabel} onChange={e => onChange(e.target.value, e.target.selectionStart)} onKeyDown={onKeyDown} onFocus={onEnter} onBlur={onLeave}/>;
}

// Where a click landed in the formatted text, as a position in the stored text (which still holds the **markers**).
function storedOffset(raw, shown) {
  let lo = 0, hi = raw.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (inlineToPlain(raw.slice(0, mid)).length < shown) lo = mid + 1; else hi = mid; }
  return lo;
}
function clickedOffset(event, root) {
  const x = event.clientX, y = event.clientY;
  const caret = document.caretPositionFromPoint?.(x, y) || (() => { const r = document.caretRangeFromPoint?.(x, y); return r ? { offsetNode: r.startContainer, offset: r.startOffset } : null; })();
  if (!caret || !root.contains(caret.offsetNode)) return null;
  const pre = document.createRange(); pre.selectNodeContents(root); pre.setEnd(caret.offsetNode, caret.offset);
  return pre.toString().length;
}
// Written text shows its formatting until you click into it; only then do you see (and edit) the stored markers.
function FormattedText({ value, className, onEdit, onLink }) {
  const ref = useRef(null);
  return <div ref={ref} data-flow-text className={`${className} formatted`} role="textbox" aria-readonly="true" aria-label="Page text" tabIndex={0}
    onFocus={e => { if (e.target === e.currentTarget) onEdit('end'); }}
    onClick={e => { const link = e.target.closest?.('a[href]'); if (link) { e.preventDefault(); onLink(link.getAttribute('href')); return; } const shown = clickedOffset(e, ref.current); onEdit(shown == null ? 'end' : storedOffset(value, shown)); }}
    dangerouslySetInnerHTML={{ __html: inlineToHtml(value) }}/>;
}


// Where the caret is in a textarea or in a plain-text editable.
function caretOf(el) {
  if (el.tagName === 'TEXTAREA') return { start: el.selectionStart, end: el.selectionEnd, length: el.value.length };
  const sel = window.getSelection(), length = el.textContent.length;
  if (!sel.rangeCount || !el.contains(sel.anchorNode)) return { start: 0, end: 0, length };
  const range = sel.getRangeAt(0), at = (node, offset) => { const pre = document.createRange(); pre.selectNodeContents(el); pre.setEnd(node, offset); return pre.toString().length; };
  return { start: at(range.startContainer, range.startOffset), end: at(range.endContainer, range.endOffset), length };
}
// A textarea cannot wrap its text around a picture, so a block beside one is edited in a plain-text editable instead.
function FlowEdit({ value, onChange, onKeyDown, focus, onFocused, onEnter, onLeave, className, placeholder, ariaLabel }) {
  const ref = useRef(null), shown = useRef(null);
  useLayoutEffect(() => { const el = ref.current; if (el && shown.current !== value) { el.textContent = value; shown.current = value; } }, [value]);
  useEffect(() => {
    const el = ref.current; if (focus == null || !el) return;
    el.focus();
    const at = focus === 'end' ? Infinity : typeof focus === 'number' ? focus : 0, range = document.createRange(), walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let left = at, node, placed = false;
    while (!placed && (node = walker.nextNode())) { if (left <= node.nodeValue.length) { range.setStart(node, left); placed = true; } else left -= node.nodeValue.length; }
    if (!placed) range.selectNodeContents(el);
    range.collapse(!placed ? false : true);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    onFocused?.();
  }, [focus]);
  return <div ref={ref} data-flow-text contentEditable="plaintext-only" suppressContentEditableWarning spellCheck role="textbox" aria-multiline="true" aria-label={ariaLabel} data-placeholder={placeholder} className={`${className} flow-edit`}
    onInput={e => { const text = e.currentTarget.textContent; shown.current = text; onChange(text, caretOf(e.currentTarget).start); }} onKeyDown={onKeyDown} onFocus={onEnter} onBlur={onLeave}/>;
}

export function ProjectPage({ onOpenFile, commentActions, onCopyLink, projectLinks = [], onOpenLink, project, projects, onRefs, act, perform, onOpenNote, onOpenArtifact, onOpenProject, onKpi, onFolder, onStatus, loadFresh }) {
  const stored = project.page?.blocks;
  const [picker, setPicker] = useState(null), [blocks, setBlocks] = useState(() => stored?.length ? stored : [block()]), [focus, setFocus] = useState(null), [menu, setMenu] = useState(null), [pick, setPick] = useState(0), [drag, setDrag] = useState(null), [commentsOpen, setCommentsOpen] = useState(false), [commentBlock, setCommentBlock] = useState(null), [editId, setEditId] = useState(null), [images, setImages] = useState(() => project.page?.images || []);
  const dirty = useRef(false), edits = useRef(0), inflight = useRef(0), lastSaved = useRef(project.page?.updatedAt || ''), latest = useRef({ blocks, images, project }); latest.current = { blocks, images, project };
  const children = projects.filter(p => p.parentId === project.id), kpis = project.kpis || [];
  // Take in a stored copy only when nothing is unsaved or in flight, and only if it is newer than our last save, so a late or stale update can never erase typing.
  useEffect(() => { const at = project.page?.updatedAt || ''; if (!dirty.current && !inflight.current && (!at || at > lastSaved.current)) { lastSaved.current = at || lastSaved.current; setBlocks(stored?.length ? stored : [block()]); setImages(project.page?.images || []); } }, [stored, project.page?.images]);
  const flush = async () => {
    const sent = edits.current; inflight.current++;
    try { const next = await act({ type: 'page', projectId: latest.current.project.id, value: { blocks: latest.current.blocks.filter((b, i, all) => b.type !== 'p' || b.text || all.length === 1 || i < all.length - 1), images: latest.current.images } }); const at = next?.projects?.find(p => p.id === latest.current.project.id)?.page?.updatedAt; if (at && at > lastSaved.current) lastSaved.current = at; if (edits.current === sent) dirty.current = false; } catch {} finally { inflight.current--; }
  };
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(flush, 1500);
    return () => clearTimeout(t);
  }, [blocks, images]);
  useEffect(() => () => { if (dirty.current) act({ type: 'page', projectId: latest.current.project.id, value: { blocks: latest.current.blocks, images: latest.current.images } }).catch(() => {}); }, []);
  const icon = project.page?.icon || '', cover = project.page?.cover || '';
  const setPage = values => { const sent = edits.current; inflight.current++; return act({ type: 'page', projectId: project.id, value: { blocks: latest.current.blocks, images: latest.current.images, ...values } }).then(next => { const at = next?.projects?.find(p => p.id === project.id)?.page?.updatedAt; if (at && at > lastSaved.current) lastSaved.current = at; if (edits.current === sent) dirty.current = false; }).catch(() => {}).finally(() => { inflight.current--; }); };
  const comments = project.page?.comments || [], openCount = comments.filter(c => !c.resolved && !c.replyTo).length, commentCounts = {};
  for (const c of comments) if (c.blockId && !c.replyTo && !c.resolved) commentCounts[c.blockId] = (commentCounts[c.blockId] || 0) + 1;
  const headings = blocks.filter(b => ['h1', 'h2', 'h3'].includes(b.type) && b.text.trim());
  const numbers = useMemo(() => listNumbers(blocks), [blocks]), numberOf = i => numbers[i];
  const edit = fn => { dirty.current = true; edits.current++; setBlocks(fn); };
  const patch = (id, values) => edit(list => list.map(b => b.id === id ? { ...b, ...values } : b));
  const signature = useMemo(() => blocks.map(b => b.id + b.type + (b.text || '') + (b.open ? '1' : '')).join('\u0001'), [blocks]);
  const board = useFloatBoard({ projectId: project.id, images, signature, onImages: next => { dirty.current = true; edits.current++; setImages(next); }, onError: message => perform(() => Promise.reject(new Error(message))) }), imagePicker = useImagePicker(board);
  const ctx = useContextMenu(), [emoji, setEmoji] = useState(null);
  // Right-click on a line of text: emoji at the click, change the block's kind, duplicate or delete it.
  const blockContext = (e, b) => {
    if (NO_TEXT.includes(b.type) || b.type === 'code') return;
    const el = e.target.closest('[data-flow-text]');
    let at = b.text.length;
    if (el?.classList.contains('formatted')) { const shown = clickedOffset(e, el); if (shown != null) at = storedOffset(b.text, shown); } else if (el) at = caretOf(el).start;
    ctx.open(e, blockMenuItems({ block: b, x: e.clientX, y: e.clientY, onEmoji: (x, y) => setEmoji({ x, y, id: b.id, at }), onTurn: type => patch(b.id, { type, ...(type === 'todo' ? { checked: false } : {}) }), onDuplicate: () => insertAfter(b.id, [{ ...b, id: uid() }]), onDelete: () => remove(b.id) }));
  };
  const doc = useMemo(() => ({ blocks, images }), [blocks, images]);
  const history = useHistory(doc, (next, before) => { dirty.current = true; edits.current++; setBlocks(next.blocks); setImages(next.images || []); const id = changedBlock(before, next); setFocus(id ? { id, end: true } : null); }, board.rootRef);
  const insertAfter = (id, items) => edit(list => { const at = list.findIndex(b => b.id === id); return [...list.slice(0, at + 1), ...items, ...list.slice(at + 1)]; });
  const remove = id => edit(list => list.length > 1 ? list.filter(b => b.id !== id) : [block()]);

  const entries = useMemo(() => {
    const q = (menu?.query || '').toLowerCase();
    const list = [...TEXT_BLOCKS.map(([type, label, Icon, hint]) => ({ kind: 'type', type, label, Icon, hint, group: 'Basic blocks' })).flatMap(e => e.type === 'table' ? [e, { kind: 'new', what: 'kanban', label: 'Board', Icon: Kanban, hint: 'A kanban board right on the page. Drag it anywhere', group: 'Basic blocks' }] : [e]),
      { kind: 'new', what: 'note', label: 'New document', Icon: FileText, hint: 'Create a page and embed it', group: 'Create & embed' }, { kind: 'new', what: 'sheet', label: 'New spreadsheet', Icon: Table2, hint: 'Create a sheet and embed it', group: 'Create & embed' },
      ...KINDS.filter(([k]) => k !== 'kanban').map(([k, label, Icon, hint]) => ({ kind: 'new', what: k, label: k === 'kanban' ? 'New board' : `New ${label.toLowerCase()}`, Icon, hint, group: 'Create & embed' })),
      { kind: 'new', what: 'app', label: 'New app', Icon: AppWindow, hint: 'A blank page you or AI can build anything in', group: 'Create & embed' },
      { kind: 'import', label: 'Import files', Icon: Upload, hint: 'Documents, sheets, PDFs, images…', group: 'Import' },
      ...project.notes.map(n => ({ kind: 'ref', refType: 'note', refId: n.id, label: n.title, Icon: n.kind === 'sheet' ? Table2 : FileText, hint: n.kind === 'sheet' ? 'Embed spreadsheet' : 'Embed document', group: 'Embed existing' })),
      ...(project.artifacts || []).map(a => ({ kind: 'ref', refType: 'artifact', refId: a.id, label: a.title, Icon: kindIcon(a.kind), hint: `Embed ${kindName(a.kind).toLowerCase()}`, group: 'Embed existing' })),
      ...project.files.map(f => ({ kind: 'ref', refType: 'file', refId: f.id, label: f.name, Icon: Paperclip, hint: 'Embed attachment', group: 'Embed existing' })),
      ...children.map(c => ({ kind: 'ref', refType: 'folder', refId: c.id, label: c.name, Icon: Folder, hint: 'Link work folder', group: 'Embed existing' }))];
    return list.filter(e => !q || `${e.label} ${e.hint}`.toLowerCase().includes(q)).slice(0, 16);
  }, [menu?.query, project, children.length]);

  async function run(entry, id) {
    setMenu(null);
    const clearHere =() => patch(id, { text: '' });
    if (entry.kind === 'type' && entry.type === 'image') { patch(id, { text: '' }); setFocus({ id }); return imagePicker.open(); }
    if (entry.kind === 'type') { patch(id, { type: entry.type, text: entry.type === 'table' ? TABLE_TEMPLATE : '' }); if (entry.type === 'table') { insertAfter(id, [block()]); return setFocus(null); } if (entry.type === 'divider') { insertAfter(id, [block()]); } return setFocus({ id: entry.type === 'divider' ? null : id }); }
    const embed = (refType, refId) => { const nb = block('p'); edit(list => { const at = list.findIndex(b => b.id === id), replace = /^\/\S*$/.test(list[at]?.text || ''); const embedBlock = block('embed', '', { refType, refId }); const out = [...list]; out.splice(replace ? at : at + 1, replace ? 1 : 0, embedBlock, nb); return out; }); setFocus({ id: nb.id }); };
    if (entry.kind === 'ref') return embed(entry.refType, entry.refId);
    if (entry.kind === 'new') {
      clearHere();
      if (entry.what === 'note' || entry.what === 'sheet') { const note = { id: uid(), title: entry.what === 'sheet' ? 'Untitled spreadsheet' : 'Untitled note', content: entry.what === 'sheet' ? 'Topic,Finding,Source\n,,' : '', kind: entry.what, author: 'You', createdAt: now(), updatedAt: now(), position: { x: 80, y: 90 + project.notes.length * 30 } }; await perform(() => act({ type: 'note', projectId: project.id, value: note })); return embed('note', note.id); }
      const artifact = newArtifact(entry.what); await perform(() => act({ type: 'artifact', projectId: project.id, value: artifact })); return embed('artifact', artifact.id);
    }
    if (entry.kind === 'import') {
      clearHere();
      const before = new Set([...project.notes.map(n => n.id), ...project.files.map(f => f.id)]);
      await perform(() => api.importFiles(project.id));
      const fresh = await loadFresh(project.id); if (!fresh) return;
      const added = [...fresh.notes.filter(n => !before.has(n.id)).map(n => ['note', n.id]), ...fresh.files.filter(f => !before.has(f.id) && !fresh.notes.some(n => n.title === f.name.replace(/\.[^.]+$/, ''))).map(f => ['file', f.id])];
      if (!added.length) return;
      const nb = block('p'); edit(list => { const at = list.findIndex(b => b.id === id), replace = /^\/?\S*$/.test(list[at]?.text || ''); const out = [...list]; out.splice(replace ? at : at + 1, replace ? 1 : 0, ...added.map(([refType, refId]) => block('embed', '', { refType, refId })), nb); return out; }); setFocus({ id: nb.id });
    }
  }
  function onText(b, value, caret) {
    if (b.type === 'p') { const short = SHORTCUTS.find(([re]) => re.test(value)); if (short) { patch(b.id, { type: short[1], text: '' }); return; } }
    patch(b.id, { text: value });
    const m = /^\/([^\s]*)$/.exec(value);
    if (m && b.type !== 'divider') { setMenu({ id: b.id, query: m[1] }); setPick(0); } else if (menu?.id === b.id) setMenu(null);
  }
  function onKey(e, b, i) {
    const sel = caretOf(e.currentTarget);
    if (menu?.id === b.id && entries.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); return setPick(p => (p + 1) % entries.length); }
      if (e.key === 'ArrowUp') { e.preventDefault(); return setPick(p => (p + entries.length - 1) % entries.length); }
      if (e.key === 'Enter') { e.preventDefault(); return run(entries[pick], b.id); }
      if (e.key === 'Escape') { e.preventDefault(); return setMenu(null); }
    }
    if (e.key === 'Tab' && ['bullet', 'numbered', 'todo'].includes(b.type) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); const level = Math.max(0, Math.min(3, (b.indent || 0) + (e.shiftKey ? -1 : 1))); if (level !== (b.indent || 0)) patch(b.id, { indent: level || undefined }); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && b.type !== 'code') {
      e.preventDefault();
      if (['bullet', 'numbered', 'todo'].includes(b.type) && !b.text) return patch(b.id, b.indent ? { indent: b.indent - 1 } : { type: 'p' });
      const before = b.text.slice(0, sel.start), after = b.text.slice(sel.end), nb = block(['bullet', 'numbered', 'todo'].includes(b.type) ? b.type : 'p', after, ['bullet', 'numbered', 'todo'].includes(b.type) && b.indent ? { indent: b.indent } : {});
      edit(list => { const at = list.findIndex(x => x.id === b.id); const out = [...list]; out[at] = { ...b, text: before }; out.splice(at + 1, 0, nb); return out; }); setFocus({ id: nb.id });
    } else if (e.key === 'Backspace' && sel.start === 0 && sel.end === 0) {
      if (b.type !== 'p') { e.preventDefault(); patch(b.id, { type: 'p' }); }
      else if (i > 0) { e.preventDefault(); const prev = blocks[i - 1]; if (NO_TEXT.includes(prev.type)) { if (!b.text) { remove(b.id); setFocus({ id: prev.id === blocks[i - 1].id && blocks[i - 2] ? blocks[i - 2].id : null, end: true }); } } else { edit(list => list.filter(x => x.id !== b.id).map(x => x.id === prev.id ? { ...x, text: x.text + b.text } : x)); setFocus({ id: prev.id, end: true }); } }
    } else if (e.key === 'ArrowUp' && sel.start === 0 && i > 0 && blocks[i - 1].text !== undefined && !NO_TEXT.includes(blocks[i - 1].type)) { e.preventDefault(); setFocus({ id: blocks[i - 1].id, end: true }); }
    else if (e.key === 'ArrowDown' && sel.start === sel.length && blocks[i + 1] && !NO_TEXT.includes(blocks[i + 1].type)) { e.preventDefault(); setFocus({ id: blocks[i + 1].id }); }
  }
  const lookup = b => b.refType === 'note' ? project.notes.find(n => n.id === b.refId) : b.refType === 'artifact' ? (project.artifacts || []).find(a => a.id === b.refId) : b.refType === 'file' ? project.files.find(f => f.id === b.refId) : projects.find(p => p.id === b.refId);
  const saveNote = note => act({ type: 'note', projectId: project.id, value: note }).catch(() => {});
  const handlers = useRef({}); handlers.current = { saveNote };
  // Embedded documents, boards and databases are costly to draw, so reuse the same element until the thing it shows changes.
  const embedCache = useRef(new Map());
  function renderEmbed(b) {
    const item = lookup(b), hit = embedCache.current.get(b.id);
    if (hit && hit.item === item && hit.project === project && hit.projects === projects && hit.type === b.refType && hit.ref === b.refId) return hit.node;
    const node = buildEmbed(b, item);
    embedCache.current.set(b.id, { item, project, projects, type: b.refType, ref: b.refId, node });
    return node;
  }
  function buildEmbed(b, item) {
    if (!item) return <div className="page-embed missing"><span>This item was deleted.</span><button className="text-button" onClick={() => remove(b.id)}>Remove</button></div>;
    const head = (Icon, label, title, open) => <div className="page-embed-head"><Icon size={15}/><strong>{title}</strong><small>{label}</small><button className="icon-button" aria-label={`Open ${title}`} title="Open" onClick={open}><ArrowUpRight size={15}/></button><button className="icon-button" aria-label="Remove from page" title="Remove from page" onClick={() => remove(b.id)}><Trash2 size={14}/></button></div>;
    if (b.refType === 'note') return <div className="page-embed">{head(item.kind === 'sheet' ? Table2 : FileText, item.kind === 'sheet' ? 'Spreadsheet' : 'Document', item.title, () => onOpenNote(item.id))}{item.kind === 'sheet' ? <SheetEmbed note={item} h={handlers}/> : <DocEmbed note={item} h={handlers}/>}</div>;
    if (b.refType === 'artifact') { const Icon = kindIcon(item.kind); return <div className="page-embed">{head(Icon, kindName(item.kind), item.title, () => onOpenArtifact(item.id))}{item.kind === 'database' ? <div className="page-embed-art editable"><Database data={item.data} artifactId={item.id} onChange={data => act({ type: 'artifact', projectId: project.id, value: { ...item, data } }).catch(() => {})}/></div> : item.kind === 'kanban' ? <div className="page-embed-art editable"><KanbanBoard data={item.data} onChange={data => act({ type: 'artifact', projectId: project.id, value: { ...item, data } }).catch(() => {})}/></div> : <div className="page-embed-art"><ArtifactPreview artifact={item} project={project}/></div>}</div>; }
    if (b.refType === 'file') return <div className="page-embed file">{head(Paperclip, `${(item.size / 1024).toFixed(1)} KB · ${date(item.createdAt)}`, item.name, () => (onOpenFile ? onOpenFile(project.id, item.id) : perform(() => api.openFile(project.id, item.id))))}</div>;
    return <div className="page-embed file">{head(Folder, 'Work folder', item.name, () => onOpenProject(item.id))}{item.description && <p className="page-embed-note">{item.description}</p>}</div>;
  }
  const renderText = (b, i) => {
    const classes = `block-text ${b.type} ${b.checked ? 'checked' : ''}`, planned = board.plan[b.id], flows = FLOW_TEXT.has(b.type), editing = editId === b.id || focus?.id === b.id;
    const placeholder = i === 0 && blocks.length === 1 ? 'Type "/" for blocks, or import a file…' : b.type === 'p' ? '' : b.type === 'h1' ? 'Heading 1' : b.type === 'h2' ? 'Heading 2' : b.type === 'h3' ? 'Heading 3' : 'List';
    let node;
    if (b.text && b.type !== 'code' && !editing) node = <FormattedText value={b.text} className={classes} onLink={href => api.openURL(href)} onEdit={caret => { setEditId(b.id); setFocus({ id: b.id, caret }); }}/>;
    else {
      const Editor = flows && planned?.floats?.length ? FlowEdit : AutoText;
      node = <Editor ariaLabel="Page text" className={classes} value={b.text} focus={focus?.id === b.id ? (focus.caret ?? (focus.end ? 'end' : 'start')) : null} onFocused={() => setFocus(null)} onEnter={() => setEditId(b.id)} onLeave={() => setEditId(id => id === b.id ? null : id)} placeholder={placeholder} onChange={(v, c) => onText(b, v, c)} onKeyDown={e => onKey(e, b, i)}/>;
    }
    return flows ? <FlowSlot plan={planned}>{node}</FlowSlot> : node;
  };
  return <div className="doc-page">{headings.length > 1 && <nav className="page-toc" aria-label="Table of contents"><div className="page-toc-inner"><div className="page-toc-ticks">{headings.map(h => <span key={h.id} className={`tick ${h.type}`}/>)}</div><ul>{headings.map(h => <li key={h.id} className={h.type}><button onClick={() => document.querySelector(`[data-block-id="${h.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{h.text}</button></li>)}</ul></div></nav>}
  {cover && <div className={`page-cover-band ${cover}`}/>}<div className="page-cover"><div className="page-decor"><div className="popover-anchor"><button className={`page-icon ${icon ? '' : 'empty'}`} aria-label="Change page icon" onClick={() => setPicker(picker === 'icon' ? null : 'icon')}>{icon || <><SmilePlus size={15}/>Add icon</>}</button>{picker === 'icon' && <div className="popover emoji-pop"><EmojiPicker value={icon} onPick={i => { setPicker(null); setPage({ icon: i }); }} onRemove={() => { setPicker(null); setPage({ icon: '' }); }}/></div>}</div><div className="popover-anchor"><button className="page-decor-btn" aria-label="Change page cover" onClick={() => setPicker(picker === 'cover' ? null : 'cover')}><ImagePlus size={14}/>{cover ? 'Change cover' : 'Add cover'}</button>{picker === 'cover' && <div className="popover cover-menu" role="listbox" aria-label="Page cover">{COVERS.map(([v, l]) => <button key={v || 'none'} role="option" aria-selected={v === cover} onClick={() => { setPicker(null); setPage({ cover: v }); }}><i className={`cover-swatch ${v}`}/>{l}</button>)}</div>}</div></div>
    <div className="page-title-row"><h1>{project.name}</h1></div>
    {project.description && <p className="page-description">{project.description}</p>}{projectLinks.length > 0 && <div className="backlinks page-backlinks"><span>Linked from</span>{projectLinks.map(l => <button key={l.kind + l.projectId + (l.noteId || '')} onClick={() => onOpenLink(l)}>{l.kind === 'page' ? <Folder size={13}/> : <FileText size={13}/>}{l.kind === 'page' ? `${l.project} (page)` : l.title}{l.kind === 'note' && <small>{l.project}</small>}</button>)}</div>}
    <div className="page-props"><label><span>Status</span><select className={`work-status ${project.status || 'active'}`} aria-label="Work status" value={project.status || 'active'} onChange={e => onStatus(e.target.value)}><option value="planned">Planned</option><option value="active">In progress</option><option value="done">Complete</option></select></label>
      {kpis.map(k => <button key={k.id} className="prop-chip" data-ref={JSON.stringify({ type: 'kpi', kpiId: k.id })} onClick={() => onKpi(k)}><span>{k.label}</span><strong>{kpiValue(project, k) || '—'}{k.unit ? ` ${k.unit}` : ''}</strong>{k.target && <small>/ {k.target}</small>}</button>)}<button className="prop-add" onClick={() => onKpi()}><Plus size={13}/>Metric</button><button className="prop-add" onClick={onRefs}><Link2 size={13}/>References{(project.refs || []).length ? ` · ${project.refs.length}` : ''}</button><button className="prop-add" onClick={() => { setCommentsOpen(v => !v); setCommentBlock(null); }}><CommentIcon size={13}/>Comments{openCount ? ` · ${openCount}` : ''}</button><span className="prop-undo"><button type="button" className="prop-add" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.canUndo} onClick={history.undo}><Undo2 size={13}/></button><button type="button" className="prop-add" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!history.canRedo} onClick={history.redo}><Redo2 size={13}/></button></span><button className="prop-add" onClick={imagePicker.open}><ImagePlus size={13}/>Image</button><button className="prop-add" onClick={onCopyLink}><Link2 size={13}/>Copy link</button></div>
    <div className="page-folders">{children.map(c => <button key={c.id} onClick={() => onOpenProject(c.id)}><Folder size={15}/>{c.name}<ArrowUpRight size={12}/></button>)}<button className="prop-add" onClick={onFolder}><Plus size={13}/>Work folder</button></div></div>
  <div {...board.rootProps} onKeyDown={history.onKeyDown} className="page-blocks flow-root" role="document" aria-label="Page content">{ctx.element}{emoji && <EmojiPopup x={emoji.x} y={emoji.y} onClose={() => setEmoji(null)} onPick={i => { const cur = blocks.find(x => x.id === emoji.id); if (cur) { patch(cur.id, { text: cur.text.slice(0, emoji.at) + i + cur.text.slice(emoji.at) }); setFocus({ id: cur.id, caret: emoji.at + i.length }); } }}/>}{imagePicker.element}<ImageLayer board={board}/>{blocks.map((b, i) => <React.Fragment key={b.id}><FlowPush plan={board.plan[b.id]}/><div data-block-id={b.id} onContextMenu={e => blockContext(e, b)} data-flow={FLOW_TEXT.has(b.type) ? 'text' : 'solid'} data-ref={['embed', 'divider', 'metric'].includes(b.type) ? undefined : JSON.stringify({ type: 'block', blockId: b.id })} className={`block-row ${b.type} ${drag?.over === b.id ? 'drop' : ''}`} onDragOver={e => { if (drag) { e.preventDefault(); setDrag(d => d.over === b.id ? d : { ...d, over: b.id }); } }} onDrop={e => { e.preventDefault(); if (drag && drag.id !== b.id) edit(list => { const moving = list.find(x => x.id === drag.id), rest = list.filter(x => x.id !== drag.id); rest.splice(rest.findIndex(x => x.id === b.id), 0, moving); return rest; }); setDrag(null); }}>
    <div className="block-gutter"><button className="block-add" aria-label="Add a block below" title="Add a block" onClick={() => { const nb = block('p', '/'); insertAfter(b.id, [nb]); setFocus({ id: nb.id, end: true }); setMenu({ id: nb.id, query: '' }); setPick(0); }}><Plus size={14}/></button><span className="block-grip" draggable aria-label="Drag to reorder" title="Drag to reorder" onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDrag({ id: b.id }); }} onDragEnd={() => setDrag(null)}><GripVertical size={14}/></span><button className={`block-comment ${commentCounts[b.id] ? 'has' : ''}`} aria-label="Comment on this block" title="Comment" onClick={() => { setCommentsOpen(true); setCommentBlock(b.id); }}><CommentIcon size={13}/>{commentCounts[b.id] > 0 && <i>{commentCounts[b.id]}</i>}</button></div>
    <div className="block-body" style={b.indent ? { marginLeft: b.indent * 26 } : undefined}>{b.type === 'embed' ? renderEmbed(b) : b.type === 'divider' ? <hr/> : b.type === 'metric' ? <div className="metric-block"><input aria-label="Value label" className="metric-label" placeholder="Label" value={b.text} onChange={e => patch(b.id, { text: e.target.value })}/><strong className={`metric-value ${/^#/.test(evaluateExpression(project, b.body)) ? 'bad' : ''}`}>{evaluateExpression(project, b.body) || '—'}</strong><input aria-label="Value formula" className="metric-formula" placeholder="={{revenue}} / {{costs}}   or   {{name}} of {{total}}" value={b.body || ''} onChange={e => patch(b.id, { body: e.target.value })}/></div> : <>{b.type === 'bullet' && <span className="block-marker">•</span>}{b.type === 'numbered' && <span className="block-marker num">{numberOf(i)}.</span>}{b.type === 'toggle' && <button className={`block-toggle ${b.open ? 'open' : ''}`} aria-expanded={Boolean(b.open)} aria-label={b.open ? 'Collapse toggle' : 'Expand toggle'} onClick={() => patch(b.id, { open: !b.open })}><Chevron size={16}/></button>}{b.type === 'todo' && <button className="block-check" aria-label={b.checked ? 'Mark not done' : 'Mark done'} onClick={() => patch(b.id, { checked: !b.checked })}>{b.checked ? <CheckSquare size={16}/> : <Square size={16}/>}</button>}{b.type === 'callout' && <span className="block-marker callout-icon"><Lightbulb size={16}/></span>}
      {b.type === 'table' ? <TableBlock text={b.text} onChange={v => patch(b.id, { text: v })} onDelete={() => { remove(b.id); const near = blocks[i - 1] || blocks[i + 1]; if (near && !NO_TEXT.includes(near.type)) setFocus({ id: near.id, end: true }); }}/> : renderText(b, i)}{b.type === 'toggle' && b.open && <AutoText ariaLabel="Toggle content" className="block-text toggle-body" value={b.body || ''} placeholder="Empty toggle. Type inside." onChange={v => patch(b.id, { body: v })} onKeyDown={() => {}}/>}</>}
      {menu?.id === b.id && entries.length > 0 && <div className="slash-menu page-menu" role="listbox" aria-label="Insert a block">{entries.map((e, n) => <React.Fragment key={`${e.kind}-${e.type || e.what || e.refId || e.label}`}>{(n === 0 || entries[n - 1].group !== e.group) && <div className="slash-title">{e.group}</div>}<button type="button" role="option" aria-selected={n === pick} className={n === pick ? 'active' : ''} onMouseEnter={() => setPick(n)} onMouseDown={ev => { ev.preventDefault(); run(e, b.id); }}><e.Icon size={15}/><span>{e.label}</span><small>{e.hint}</small></button></React.Fragment>)}</div>}
    </div></div></React.Fragment>)}
    <button className="page-add" onClick={() => { const nb = block(); edit(list => [...list, nb]); setFocus({ id: nb.id }); }}><Plus size={14}/>Add a block</button></div>{commentsOpen && <CommentsPanel title="Page comments" comments={comments} blocks={blocks} block={commentBlock} onShowAll={() => setCommentBlock(null)} onClose={() => { setCommentsOpen(false); setCommentBlock(null); }} actions={commentActions}/>}</div>;
}
