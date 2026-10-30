import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { applyEdgeChanges, ReactFlow, ReactFlowProvider, BackgroundVariant, useStore, useReactFlow, Background, Panel, BaseEdge, MiniMap, Handle, Position, NodeResizer, ConnectionMode, MarkerType, addEdge, applyNodeChanges } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Image as ImageIcon, MousePointer2, Hand, StickyNote, Type, Square, Circle, Diamond, Frame, FileText, Table2, Kanban, Upload, Paperclip, ArrowUpRight, Maximize2, Minimize2, Trash2, Copy, Network, Plus, Palette, PenLine, LayoutGrid, Shapes, Hexagon, Triangle, ArrowRightFromLine, RectangleHorizontal, Spline, Sparkles, MoveRight, CornerDownRight, Undo2, Redo2, Maximize, Minus, Map as MapIcon, MoreVertical, ArrowLeft, Check, LayoutTemplate, Link2, Wand2, AlignLeft } from 'lucide-react';
import { FormatPanel, EdgePanel } from './canvas-format';
import { recognizeShape } from '../shared/shape-recognize.mjs';
import { TEMPLATES, buildTemplate } from '../shared/canvas-templates.mjs';
import { csvParse, csvStringify } from '../shared/domain.mjs';
import { calculateSheet, columnName, sheetContext } from '../shared/sheet.mjs';
import { workbookOf, projectSheetContext } from '../shared/workbook.mjs';
import { uid, now, date, excerpt, Markdown } from './ui';
import { ingestFiles, usePicture, IMAGE_TYPES } from './float-images';
import { BlockDoc } from './block-doc';
import { markdownToBlocks, blocksToMarkdown } from '../shared/blocks.mjs';
import { ArtifactPreview, NewBoardItems, kindIcon, newArtifact } from './boards';
import { useContextMenu, copyText } from './context-menu';
import { api } from './api';

const COLORS = ['white', 'yellow', 'green', 'blue', 'purple', 'orange', 'pink', 'gray'];
const POLY = { diamond: '50,2 98,50 50,98 2,50', triangle: '50,3 97,96 3,96', hexagon: '24,4 76,4 98,50 76,96 24,96 2,50', parallelogram: '18,4 98,4 82,96 2,96', arrow: '2,20 64,20 64,3 98,50 64,97 64,80 2,80' };
const EDGE_STYLES = [['default', 'Curved', Spline], ['straight', 'Straight', MoveRight], ['smoothstep', 'Elbow', CornerDownRight]];
const SHAPE_DEFAULTS = { roundrect: { w: 170, h: 70, color: 'green' }, hexagon: { w: 180, h: 100, color: 'purple' }, triangle: { w: 150, h: 120, color: 'orange' }, parallelogram: { w: 190, h: 90, color: 'blue' }, arrow: { w: 190, h: 90, color: 'gray' }, sticky: { w: 180, h: 160, color: 'yellow' }, text: { w: 200, h: 44, color: 'gray' }, rect: { w: 190, h: 110, color: 'blue' }, ellipse: { w: 170, h: 110, color: 'green' }, diamond: { w: 170, h: 130, color: 'orange' }, frame: { w: 520, h: 340, color: 'gray' } };
const DOC_SIZE = { note: { w: 380, h: 300 }, sheet: { w: 480, h: 300 } };
// Cards show their contents unless you collapsed them. A document is sized to its text, up to a limit.
const isEmbedded = n => n.embed !== false;
const docSize = n => {
  if (n.kind === 'sheet') return DOC_SIZE.sheet;
  const lines = String(n.content || '').split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 52)), 0);
  return { w: DOC_SIZE.note.w, h: Math.max(DOC_SIZE.note.h, Math.min(900, 110 + lines * 21)) };
};
const canvasProps = c => ({ draggable: !c.lock, ...(c.z ? { zIndex: c.z } : {}) });
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const SHEET_MAX = { rows: 200, cols: 26 }, SHEET_STEP = { rows: 30, cols: 4 };
const sides = [Position.Top, Position.Right, Position.Bottom, Position.Left];
const Handles = () => <>{sides.map(p => <Handle key={p} id={p} type="source" position={p} className="canvas-handle"/>)}</>;

// Sticky notes grow with their text: wider first (up to 300), then taller (up to 460); past that the text scrolls.
let measurer;
function fitSticky(text, base) {
  if (!measurer) { measurer = document.createElement('div'); measurer.style.cssText = 'position:fixed;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:anywhere;font:16px/1.35 Inter,"Segoe UI",system-ui,sans-serif;box-sizing:border-box;padding:18px'; document.body.appendChild(measurer); }
  measurer.textContent = text + '​';
  let best = base;
  for (const w of [base.w, 220, 260, 300].filter(w => w >= base.w)) {
    measurer.style.width = w + 'px';
    const h = Math.max(base.h, measurer.scrollHeight);
    best = { w, h: Math.min(460, h) };
    if (h <= w) break;
  }
  return best;
}
function ShapeNode({ id, data, selected }) {
  const item = data.item, [editing, setEditing] = useState(false), [text, setText] = useState(item.text), start = useRef(item.size);
  useEffect(() => setText(item.text), [item.text]);
  const sticky = item.type === 'sticky';
  const look = { ...(item.fs ? { fontSize: item.fs } : {}), ...(item.b ? { fontWeight: 700 } : {}), ...(item.i ? { fontStyle: 'italic' } : {}), ...(item.al ? { textAlign: item.al, justifyContent: item.al === 'left' ? 'flex-start' : item.al === 'right' ? 'flex-end' : 'center' } : {}), ...(item.tc ? { color: item.tc } : {}) };
  const edit = () => { start.current = item.size; setEditing(true); };
  useEffect(() => {
    if (!selected || editing) return;
    const key = e => { if ((e.key === 'Enter' || e.key === 'F2') && !e.target.closest?.('input, textarea, select, [contenteditable]') && document.querySelectorAll('.react-flow__node.selected').length === 1) { e.preventDefault(); edit(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selected, editing]);
  const change = value => { setText(value); if (sticky) data.h.current.live(id, fitSticky(value, start.current)); };
  const commit = () => { setEditing(false); if (text !== item.text) data.h.current.saveItem({ ...item, text, ...(sticky ? { size: fitSticky(text, start.current) } : {}) }); };
  return <div className={`shape ${item.type} c-${item.color}${item.bd ? ' bd-' + item.bd : ''}${item.lock ? ' locked' : ''}`} style={item.rot ? { transform: `rotate(${item.rot}deg)` } : undefined} onDoubleClick={edit} onContextMenu={e => data.h.current.menu(e, 'shape', item, { edit })}>
    <NodeResizer isVisible={selected && !item.lock} minWidth={60} minHeight={36} onResizeEnd={(_, p) => data.h.current.resized(id, p)}/>
    {POLY[item.type] && <svg className="shape-bg" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points={POLY[item.type]} vectorEffect="non-scaling-stroke"/></svg>}
    {item.type === 'frame' && <div className="frame-title">{editing ? <input autoFocus className="nodrag" value={text} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/> : <span>{item.text || 'Frame'}</span>}</div>}
    {item.type !== 'frame' && <div className="shape-text" style={look}>{editing ? <textarea autoFocus className="nodrag nowheel" value={text} onChange={e => change(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.blur(); }}/> : <span>{item.text || (item.type === 'text' ? 'Text' : '')}</span>}</div>}
    <Handles/>
  </div>;
}
function Cell({ raw, shown, onCommit }) {
  const [focus, setFocus] = useState(false), [value, setValue] = useState(raw);
  useEffect(() => { if (!focus) setValue(raw); }, [raw, focus]);
  return <input className="nodrag" aria-label="Cell" value={focus ? value : String(shown ?? '')} onFocus={() => setFocus(true)} onChange={e => setValue(e.target.value)} onBlur={() => { setFocus(false); if (value !== raw) onCommit(value); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/>;
}
export function SheetEmbed({ note, h, project }) {
  const parsed = useMemo(() => { try { const rows = csvParse(note.content); return { rows, values: calculateSheet(rows, projectSheetContext(note, project?.notes || h?.current?.project?.notes || [], csvParse)) }; } catch (e) { return { error: e.message }; } }, [note.content, note.sheets, note.sheetName, project?.notes, h?.current?.project?.notes]);
  const [limit, setLimit] = useState({ rows: SHEET_STEP.rows, cols: 8 });
  if (parsed.error) return <p className="inline-error">{parsed.error}</p>;
  const { rows, values } = parsed;
  const totalCols = Math.min(SHEET_MAX.cols, Math.max(3, ...rows.map(r => r.length))), totalRows = Math.min(SHEET_MAX.rows, Math.max(rows.length, 6));
  const cols = Math.min(totalCols, limit.cols), shownRows = Math.min(totalRows, limit.rows);
  const set = (y, x, v) => { const next = rows.map(r => [...r]); while (next.length <= y) next.push([]); while (next[y].length <= x) next[y].push(''); next[y][x] = v; h.current.saveNote({ ...note, content: csvStringify(next), updatedAt: now() }); };
  const grow = e => {
    const el = e.currentTarget, bottom = el.scrollTop + el.clientHeight > el.scrollHeight - 90, right = el.scrollLeft + el.clientWidth > el.scrollWidth - 90;
    if ((bottom && limit.rows < totalRows) || (right && limit.cols < totalCols)) setLimit(l => ({ rows: bottom ? Math.min(totalRows, l.rows + SHEET_STEP.rows) : l.rows, cols: right ? Math.min(totalCols, l.cols + SHEET_STEP.cols) : l.cols }));
  };
  const more = shownRows < totalRows || cols < totalCols || rows.length > SHEET_MAX.rows;
  return <><div className="embed-sheet nowheel" onScroll={grow}><table><thead><tr><th scope="col"><span className="sr-only">Row</span></th>{Array.from({ length: cols }, (_, x) => <th key={x}>{columnName(x)}</th>)}</tr></thead><tbody>{Array.from({ length: shownRows }, (_, y) => <tr key={y}><th>{y + 1}</th>{Array.from({ length: cols }, (_, x) => <td key={x}><Cell raw={String(rows[y]?.[x] ?? '')} shown={values[y]?.[x]} onCommit={v => set(y, x, v)}/></td>)}</tr>)}</tbody></table></div>{more && <div className="embed-more">{shownRows} of {rows.length > SHEET_MAX.rows ? `${rows.length} rows (first ${SHEET_MAX.rows} load)` : `${totalRows} rows`} · {cols} of {totalCols} columns · scroll for more, or open it in a tab</div>}</>;
}
// A document on the canvas shows its text; double-click edits it in place with the same block editor the tab uses.
export function DocEmbed({ note, h }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <DocEdit note={note} h={h} onDone={() => setEditing(false)}/>;
  return <div className="embed-doc nowheel" onDoubleClick={() => setEditing(true)} title="Double-click to edit"><Markdown>{note.content || '*Double-click to start writing.*'}</Markdown></div>;
}
// Typing is saved a moment after you pause, when focus leaves the card, and when it closes.
function DocEdit({ note, h, onDone }) {
  const [blocks, setBlocks] = useState(() => note.format === 'blocks' && note.blocks ? note.blocks : markdownToBlocks(note.content || ''));
  const pending = useRef(null), timer = useRef(0), latest = useRef({ note, h });
  latest.current = { note, h };
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!pending.current) return;
    const next = pending.current; pending.current = null;
    latest.current.h.current.saveNote({ ...latest.current.note, format: 'blocks', blocks: next, content: blocksToMarkdown(next), updatedAt: now() });
  }, []);
  useEffect(() => flush, [flush]);
  const change = next => { setBlocks(next); pending.current = next; clearTimeout(timer.current); timer.current = setTimeout(flush, 700); };
  return <div className="embed-doc embed-doc-edit nodrag nowheel" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) flush(); }}>
    <button className="embed-done" onClick={() => { flush(); onDone(); }}><Check size={12}/>Done</button>
    <BlockDoc blocks={blocks} onChange={change} projectId={h.current.projectId}/>
  </div>;
}
// Zoomed far out, cards collapse to a simple icon so a large board stays readable.
const useFar = () => useStore(s => s.transform[2] < 0.4);
function LodIcon({ Icon, tone = '' }) { return <div className="lod-wrap"><div className={`lod-icon ${tone}`}><Handles/><Icon size={30}/></div></div>; }
function NoteNode({ id, data, selected }) {
  const far = useFar();
  const note = data.item, embed = isEmbedded(note);
  if (far) return <LodIcon Icon={note.kind === 'sheet' ? Table2 : FileText} tone={note.kind === 'sheet' ? 'sheet' : ''}/>;
  const resize = embed && <NodeResizer isVisible={selected} minWidth={220} minHeight={140} onResizeEnd={(_, p) => data.h.current.resized(id, p)}/>;
  const Icon = note.kind === 'sheet' ? Table2 : FileText;
  return <div className={`board-card ${note.kind === 'sheet' ? 'sheet' : ''} ${embed ? 'embedded' : ''}`} onContextMenu={e => data.h.current.menu(e, 'note', note)}>{resize}<Handles/>
    <div className="board-card-header"><Icon size={15}/><span>{note.kind === 'sheet' ? 'SPREADSHEET' : 'DOCUMENT'}</span><button className="nodrag" aria-label={embed ? `Collapse ${note.title}` : `Expand ${note.title} on canvas`} title={embed ? 'Collapse to card' : 'Show contents on canvas'} onClick={() => data.h.current.toggleEmbed(note)}>{embed ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</button><button className="nodrag" aria-label={`Open ${note.title} in a tab`} title="Open in a tab" onClick={() => data.h.current.open(note.id)}><ArrowUpRight size={15}/></button></div>
    <h3>{note.title}</h3>
    {embed ? (note.kind === 'sheet' ? <SheetEmbed note={note} h={data.h}/> : <DocEmbed note={note} h={data.h}/>) : <><p>{excerpt(note.content, 200) || 'An idea waiting to happen.'}</p><div className="board-card-bottom"><span>{note.author}</span><span>{date(note.updatedAt || note.createdAt)}</span></div></>}
  </div>;
}
function ImageThumb({ pid, id, name }) {
  const [src, setSrc] = useState(null);
  useEffect(() => { let live = true; api.fileImage(pid, id).then(url => live && setSrc(url)).catch(() => {}); return () => { live = false; }; }, [pid, id]);
  return src ? <img className="file-thumb" src={src} alt={name} draggable={false}/> : <div className="file-thumb loading"/>;
}
function FileNode({ data }) {
  const far = useFar(), f = data.item, picture = IMAGE_FILE.test(f.name) && data.pid;
  if (far) return <LodIcon Icon={Paperclip}/>;
  return <div className={`board-card ${picture ? 'image-card' : ''}`} onContextMenu={e => data.h.current.menu(e, 'file', f)} onDoubleClick={() => data.h.current.openFile(f.id)}><Handles/><div className="board-card-header"><Paperclip size={15}/><span>{picture ? 'IMAGE' : 'ATTACHMENT'}</span><button className="nodrag" aria-label={`Open ${f.name}`} onClick={() => data.h.current.openFile(f.id)}><ArrowUpRight size={15}/></button></div>{picture && <ImageThumb pid={data.pid} id={f.id} name={f.name}/>}<h3>{f.name}</h3><p>{(f.size / 1024).toFixed(1)} KB · Stored locally</p><div className="board-card-bottom"><span>{picture ? 'Image' : 'Attachment'}</span><span>{date(f.createdAt)}</span></div></div>;
}
function PictureNode({ id, data, selected }) {
  const item = data.item, { url, failed } = usePicture(data.pid, { fileId: item.refId });
  return <div className={`canvas-picture${item.lock ? ' locked' : ''}${failed ? ' failed' : ''}`} onContextMenu={e => data.h.current.menu(e, 'shape', item)}>
    <NodeResizer isVisible={selected && !item.lock} minWidth={56} minHeight={40} keepAspectRatio onResizeEnd={(_, p) => data.h.current.resized(id, p)}/><Handles/>
    {url ? <img src={url} alt={item.text || ''} draggable={false}/> : <div className="canvas-picture-empty">{failed ? 'Picture not found' : ''}</div>}
  </div>;
}
function LinkNode({ id, data, selected }) {
  const item = data.item;
  let host = '';
  try { host = new URL(item.url).hostname.replace(/^www\./, ''); } catch {}
  return <div className={`link-card${item.lock ? ' locked' : ''}`} onDoubleClick={() => data.h.current.openLink(item.url)} onContextMenu={e => data.h.current.menu(e, 'shape', item, { edit: () => data.h.current.openLink(item.url) })}><NodeResizer isVisible={selected && !item.lock} minWidth={180} minHeight={64} onResizeEnd={(_, p) => data.h.current.resized(id, p)}/><Handles/><span className="link-icon"><Link2 size={18}/></span><div className="link-text"><strong>{item.text || host}</strong><small>{host}</small></div><button className="nodrag" aria-label={`Open ${host}`} title="Open in your browser" onClick={() => data.h.current.openLink(item.url)}><ArrowUpRight size={15}/></button></div>;
}
function ArtifactNode({ id, data, selected }) {
  const far = useFar(), a = data.artifact, Icon = kindIcon(a.kind);
  if (far) return <LodIcon Icon={Icon} tone="board"/>;
  return <div className="board-card embedded artifact-embed"><NodeResizer isVisible={selected} minWidth={240} minHeight={160} onResizeEnd={(_, p) => data.h.current.resized(id, p)}/><Handles/><div className="board-card-header"><Icon size={15}/><span>{a.kind === 'kanban' ? 'KANBAN' : 'CHART'}</span><button className="nodrag" aria-label={`Open ${a.title} in a tab`} onClick={() => data.h.current.openArtifact(a.id)}><ArrowUpRight size={15}/></button></div><h3>{a.title}</h3><div className="embed-artifact nowheel nodrag"><ArtifactPreview artifact={limitBoard(a)} project={data.project}/>{boardIsCut(a) && <div className="embed-more">Showing the first cards only · open it in a tab to see everything</div>}</div></div>;
}
const BOARD_LIMIT = { columns: 8, cards: 12 };
const boardIsCut = a => a.kind === 'kanban' && (a.data.columns.length > BOARD_LIMIT.columns || a.data.columns.some(c => c.cards.length > BOARD_LIMIT.cards));
const limitBoard = a => boardIsCut(a) ? { ...a, data: { ...a.data, columns: a.data.columns.slice(0, BOARD_LIMIT.columns).map(c => ({ ...c, cards: c.cards.slice(0, BOARD_LIMIT.cards) })) } } : a;
function DrawNode({ id, data, selected }) {
  const item = data.item, pts = [];
  for (let i = 0; i + 1 < (item.points || []).length; i += 2) pts.push(`${item.points[i]},${item.points[i + 1]}`);
  return <div className={`shape draw c-${item.color}`}><NodeResizer isVisible={selected} minWidth={20} minHeight={20} onResizeEnd={(_, p) => data.h.current.resized(id, p)}/><svg viewBox={`0 0 ${item.size.w} ${item.size.h}`} preserveAspectRatio="none" aria-label="Drawing"><polyline points={pts.join(' ')} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></svg></div>;
}
function LoopEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style }) {
  // A connector from a shape back to itself: leaves the right side, arcs over the top.
  return <BaseEdge id={id} path={`M ${sourceX} ${sourceY} C ${sourceX + 90} ${sourceY - 4}, ${targetX + 70} ${targetY - 100}, ${targetX} ${targetY}`} markerEnd={markerEnd} style={style}/>;
}
const edgeTypes = { loop: LoopEdge };
const EDGE_DEFAULTS = { style: { stroke: '#1a1a1a', strokeWidth: 1.5 } };
for (const k of ['rect', 'roundrect', 'ellipse', 'diamond', 'hexagon', 'parallelogram', 'triangle', 'arrow']) SHAPE_DEFAULTS[k].color = 'white';
function ZoomPill({ map, onMap }) {
  const flow = useReactFlow(), zoom = useStore(s => s.transform[2]);
  return <Panel position="bottom-right" className="zoom-pill"><button aria-label="Fit board to screen" title="Fit to screen" onClick={() => flow.fitView({ padding: 0.2, duration: 250 })}><Maximize size={16}/></button>{onMap && <button aria-label="Overview map" aria-pressed={map} title={map ? 'Hide the overview map' : 'Show the overview map'} className={map ? 'on' : ''} onClick={onMap}><MapIcon size={16}/></button>}<span className="zoom-sep"/><button aria-label="Zoom out" title="Zoom out" onClick={() => flow.zoomOut({ duration: 150 })}><Minus size={16}/></button><button className="zoom-value" aria-label="Reset zoom to 100%" title="Reset to 100%" onClick={() => flow.zoomTo(1, { duration: 200 })}>{Math.round(zoom * 100)}%</button><button aria-label="Zoom in" title="Zoom in" onClick={() => flow.zoomIn({ duration: 150 })}><Plus size={16}/></button></Panel>;
}
// ---- Diagram sheets: a card on the board that opens into a full editor for shapes and connectors, and mirrors them as a live preview.
const COLOR_HEX = { white: '#ffffff', yellow: '#fff08a', green: '#8be59a', blue: '#9fd3ff', purple: '#c3b6ff', orange: '#ffc98a', pink: '#ffb3d1', gray: '#e3e5ea' };
const DIAGRAM_SIZE = { w: 520, h: 340 };
const DIAGRAM_SHAPES = [['rect', 'Rectangle', Square], ['roundrect', 'Rounded', RectangleHorizontal], ['ellipse', 'Ellipse', Circle], ['diamond', 'Decision', Diamond], ['hexagon', 'Hexagon', Hexagon], ['parallelogram', 'Input / output', Square], ['triangle', 'Triangle', Triangle], ['arrow', 'Arrow', ArrowRightFromLine], ['sticky', 'Sticky note', StickyNote], ['text', 'Text', Type]];
const ARROW = { type: MarkerType.ArrowClosed, color: '#1a1a1a' };
function edgeLook(edge, base, dark) {
  const color = edge.ecolor || base, ends = edge.ends || 'end', arrow = type => ({ type: type || MarkerType.ArrowClosed, color });
  return { ...edge, style: { ...edge.style, stroke: color, ...(edge.ew ? { strokeWidth: edge.ew } : {}), ...(edge.dash ? { strokeDasharray: edge.dash === 'dashed' ? '9 6' : '1.5 6', strokeLinecap: 'round' } : {}) },
    markerEnd: ends === 'none' ? undefined : arrow(edge.markerEnd?.type), markerStart: ends === 'both' ? arrow(edge.markerEnd?.type) : undefined,
    ...(edge.label ? { labelStyle: { fill: base, fontSize: 12, fontWeight: 500 }, labelBgStyle: { fill: dark ? '#1b1b1f' : '#ffffff' }, labelBgPadding: [6, 3], labelBgBorderRadius: 5 } : {}) };
}
const anchor = (n, side) => { const { x, y } = n.position, { w, h } = n.size; return { top: [x + w / 2, y], right: [x + w, y + h / 2], bottom: [x + w / 2, y + h], left: [x, y + h / 2] }[side]; };
function facingSides(a, b) {
  const dx = b.position.x + b.size.w / 2 - (a.position.x + a.size.w / 2), dy = b.position.y + b.size.h / 2 - (a.position.y + a.size.h / 2);
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? ['right', 'left'] : ['left', 'right']) : (dy > 0 ? ['bottom', 'top'] : ['top', 'bottom']);
}
function previewPath(e, byId) {
  const a = byId.get(e.source), b = byId.get(e.target);
  if (!a || !b || a === b) return null;
  const [fs, ft] = facingSides(a, b), ss = e.sourceHandle || fs, ts = e.targetHandle || ft, [x1, y1] = anchor(a, ss), [x2, y2] = anchor(b, ts);
  if (e.type === 'straight') return `M${x1} ${y1}L${x2} ${y2}`;
  if (e.type === 'smoothstep') return ['left', 'right'].includes(ss) ? `M${x1} ${y1}H${(x1 + x2) / 2}V${y2}H${x2}` : `M${x1} ${y1}V${(y1 + y2) / 2}H${x2}V${y2}`;
  const out = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }, d = Math.max(30, Math.hypot(x2 - x1, y2 - y1) / 3);
  return `M${x1} ${y1}C${x1 + out[ss][0] * d} ${y1 + out[ss][1] * d},${x2 + out[ts][0] * d} ${y2 + out[ts][1] * d},${x2} ${y2}`;
}
function wrapLabel(text, w, h, fs) {
  const per = Math.max(4, Math.floor((w - 14) / (fs * 0.56))), max = Math.max(1, Math.floor((h - 8) / (fs * 1.25))), lines = [];
  for (const para of String(text).split('\n')) { let line = ''; for (const word of para.split(/\s+/)) { if (line && (line + ' ' + word).length > per) { lines.push(line); line = word; } else line = line ? line + ' ' + word : word; } lines.push(line); }
  return lines.length > max ? [...lines.slice(0, max - 1), lines[max - 1].slice(0, Math.max(1, per - 1)) + '…'] : lines;
}
const DiagramPreview = React.memo(function DiagramPreview({ item, bare }) {
  const view = useMemo(() => {
    const nodes = item.nodes || [];
    if (!nodes.length) return null;
    const x0 = Math.min(...nodes.map(n => n.position.x)), y0 = Math.min(...nodes.map(n => n.position.y)), x1 = Math.max(...nodes.map(n => n.position.x + n.size.w)), y1 = Math.max(...nodes.map(n => n.position.y + n.size.h)), pad = 36;
    const byId = new Map(nodes.map(n => [n.id, n]));
    return { box: `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`, nodes, paths: (item.edges || []).map(e => ({ id: e.id, d: previewPath(e, byId) })).filter(p => p.d) };
  }, [item.nodes, item.edges]);
  if (!view) return <div className="diagram-empty"><Network size={26}/><span>Empty diagram</span><small>Open it to add shapes and connectors</small></div>;
  const mark = `arr-${item.id}`;
  return <svg className="diagram-svg" viewBox={view.box} preserveAspectRatio="xMidYMid meet" aria-label={`${item.text || 'Diagram'} preview`}>
    <defs><marker id={mark} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#1a1a1a"/></marker></defs>
    {view.nodes.map(n => { const { x, y } = n.position, { w, h } = n.size, fill = COLOR_HEX[n.color] || '#fff', common = { fill, stroke: '#1a1a1a', strokeWidth: 1.5, vectorEffect: 'non-scaling-stroke' };
      return <g key={n.id}>
        {n.type === 'rect' && <rect x={x} y={y} width={w} height={h} rx="4" {...common}/>}
        {n.type === 'roundrect' && <rect x={x} y={y} width={w} height={h} rx={Math.min(w, h) / 2} {...common}/>}
        {n.type === 'ellipse' && <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...common}/>}
        {POLY[n.type] && <polygon points={POLY[n.type]} transform={`translate(${x} ${y}) scale(${w / 100} ${h / 100})`} {...common}/>}
        {n.type === 'sticky' && <rect x={x} y={y} width={w} height={h} fill={fill}/>}
        {!bare && n.text && <text x={x + w / 2} y={y + h / 2} textAnchor="middle" fontSize="14" fill="#1c1f26" fontFamily="Inter, Segoe UI, system-ui, sans-serif">{(() => { const lines = wrapLabel(n.text, w, h, 14); return lines.map((l, i) => <tspan key={i} x={x + w / 2} dy={i === 0 ? `${-(lines.length - 1) * 0.625 + 0.35}em` : '1.25em'}>{l}</tspan>); })()}</text>}
      </g>; })}
    {view.paths.map(p => <path key={p.id} d={p.d} fill="none" stroke="#1a1a1a" strokeWidth="1.5" vectorEffect="non-scaling-stroke" markerEnd={`url(#${mark})`}/>)}
  </svg>;
});
function DiagramNode({ id, data, selected }) {
  const far = useFar(), item = data.item, [menu, setMenu] = useState(false), [renaming, setRenaming] = useState(false), [name, setName] = useState(item.text);
  useEffect(() => setName(item.text), [item.text]);
  useEffect(() => { if (!selected) setMenu(false); }, [selected]);
  const h = data.h.current, open = () => h.openDiagram(id), rename = () => { setRenaming(false); if (name !== item.text) h.saveItem({ ...item, text: name }); };
  return <div className="diagram-sheet" onDoubleClick={open} onContextMenu={e => h.menu(e, 'diagram', item, { open, rename: () => setRenaming(true) })}>
    <NodeResizer isVisible={selected} minWidth={240} minHeight={160} onResizeEnd={(_, p) => h.resized(id, p)}/>
    <Handles/>
    <DiagramPreview item={item} bare={far}/>
    {!far && <div className="diagram-pill nodrag" onDoubleClick={e => e.stopPropagation()}>
      <Network size={14}/>{renaming ? <input autoFocus className="nodrag" value={name} onChange={e => setName(e.target.value)} onBlur={rename} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setName(item.text); setRenaming(false); } }}/> : <span>{item.text || 'Diagram'}</span>}
      <button aria-label={`Open ${item.text || 'diagram'}`} title="Open diagram" onClick={open}><Maximize2 size={14}/></button>
      <button aria-label="Diagram options" title="More" onClick={() => setMenu(m => !m)}><MoreVertical size={14}/></button>
      {menu && <div className="popover diagram-menu" role="menu"><button role="menuitem" onClick={() => { setMenu(false); open(); }}>Open</button><button role="menuitem" onClick={() => { setMenu(false); setRenaming(true); }}>Rename</button><button role="menuitem" onClick={() => { setMenu(false); h.saveItem({ ...item, id: uid(), position: { x: item.position.x + 40, y: item.position.y + 40 } }); }}>Duplicate</button><button role="menuitem" className="danger" onClick={() => { setMenu(false); h.deleteItem(id); }}>Delete</button></div>}
    </div>}
  </div>;
}
const itemsOf = nodes => nodes.map(n => ({ ...n.data.item, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, size: { w: Math.round(n.width ?? n.measured?.width ?? n.data.item.size.w), h: Math.round(n.height ?? n.measured?.height ?? n.data.item.size.h) } }));
function DiagramEditorInner({ item, onSave, onClose }) {
  const flow = useReactFlow(), [title, setTitle] = useState(item.text || 'Diagram'), hh = useRef({}), inner = useContextMenu();
  const toNode = c => ({ id: c.id, type: 'shape', position: c.position, width: c.size.w, height: c.size.h, data: { item: c, h: hh } });
  const [nodes, setNodes] = useState(() => (item.nodes || []).map(toNode)), [edges, setEdges] = useState(item.edges || []), [selNodes, setSelNodes] = useState([]), [edgeOpen, setEdgeOpen] = useState(false);
  const live = useRef({}), timer = useRef(null), dirty = useRef(false), [drop, setDrop] = useState(null);
  live.current = { nodes, edges, title };
  const flush = () => { clearTimeout(timer.current); if (!dirty.current) return; dirty.current = false; const { nodes: n, edges: e, title: t } = live.current; onSave({ ...item, text: t, nodes: itemsOf(n), edges: e.map(({ id, source, target, type, sourceHandle, targetHandle, label, markerEnd, dash, ends, ecolor, ew }) => ({ id, source, target, type, sourceHandle, targetHandle, label, markerEnd, dash, ends, ecolor, ew })) }); };
  const touch = () => { dirty.current = true; clearTimeout(timer.current); timer.current = setTimeout(flush, 350); };
  useEffect(() => () => flush(), []);
  hh.current = {
    saveItem: c => { setNodes(ns => ns.map(n => n.id === c.id ? { ...n, width: c.size.w, height: c.size.h, position: c.position, data: { ...n.data, item: c } } : n)); touch(); },
    resized: (id, p) => { setNodes(ns => ns.map(n => n.id === id ? { ...n, position: { x: p.x, y: p.y }, width: p.width, height: p.height, data: { ...n.data, item: { ...n.data.item, size: { w: p.width, h: p.height } } } } : n)); touch(); },
    live: (id, s) => setNodes(ns => ns.map(n => n.id === id ? { ...n, width: s.w, height: s.h } : n)),
    menu: (e, kind, c, extra = {}) => inner.open(e, [
      { label: 'Edit text', icon: PenLine, onClick: extra.edit },
      { label: 'Copy text', icon: Copy, disabled: !c.text, onClick: () => copyText(c.text) },
      { label: 'Duplicate', icon: Copy, onClick: () => { const n = nodes.find(x => x.id === c.id); if (!n) return; const [one] = itemsOf([n]); setNodes(ns => [...ns.map(x => ({ ...x, selected: false })), { ...toNode({ ...one, id: uid(), position: { x: one.position.x + 28, y: one.position.y + 28 } }), selected: true }]); touch(); } },
      'separator',
      { label: 'Delete', icon: Trash2, hint: 'Del', danger: true, onClick: () => { setNodes(ns => ns.filter(n => n.id !== c.id)); setEdges(es => es.filter(x => x.source !== c.id && x.target !== c.id)); touch(); } }
    ])
  };
  const add = type => {
    const d = SHAPE_DEFAULTS[type], r = flow.getViewport(), box = document.querySelector('.diagram-editor .react-flow')?.getBoundingClientRect(), jitter = (nodes.length % 6) * 22;
    const cx = box ? (box.width / 2 - r.x) / r.zoom : 200, cy = box ? (box.height / 2 - r.y) / r.zoom : 150;
    const c = { id: uid(), type, text: '', color: d.color, position: { x: Math.round(cx - d.w / 2 + jitter), y: Math.round(cy - d.h / 2 + jitter) }, size: { w: d.w, h: d.h } };
    setNodes(ns => [...ns.map(n => ({ ...n, selected: false })), { ...toNode(c), selected: true }]); touch();
  };
  const chosen = nodes.filter(n => selNodes.includes(n.id));
  const recolor = color => { setNodes(ns => ns.map(n => selNodes.includes(n.id) ? { ...n, data: { ...n.data, item: { ...n.data.item, color } } } : n)); touch(); };
  const duplicate = () => { const copies = itemsOf(chosen).map(c => { const moved = { ...c, id: uid(), position: { x: c.position.x + 28, y: c.position.y + 28 } }; return { ...toNode(moved), selected: true }; }); setNodes(ns => [...ns.map(n => ({ ...n, selected: false })), ...copies]); touch(); };
  const removeSelected = () => { const gone = new Set(selNodes); setNodes(ns => ns.filter(n => !gone.has(n.id))); setEdges(es => es.filter(e => !gone.has(e.source) && !gone.has(e.target) && !selEdges.includes(e.id))); touch(); };
  const selEdges = useMemo(() => edges.filter(e => e.selected).map(e => e.id), [edges]);
  const restyle = type => { setEdges(es => es.map(e => selEdges.includes(e.id) ? { ...e, type } : e)); touch(); };
  const patchEdges = patch => { setEdges(es => es.map(e => selEdges.includes(e.id) ? { ...e, ...patch } : e)); touch(); };
  const connect = c => { if (c.source === c.target) return; setEdges(es => addEdge({ ...c, type: 'default', id: uid(), markerEnd: ARROW }, es)); touch(); };
  const edgeColor = '#1a1a1a';
  const shown = useMemo(() => edges.map(e => edgeLook(e, edgeColor, false)), [edges]);
  const onSel = useCallback(({ nodes: ns }) => setSelNodes(old => old.length === ns.length && ns.every((n, i) => n.id === old[i]) ? old : ns.map(n => n.id)), []);
  const close = () => { flush(); onClose(); };
  return <div className="diagram-editor" role="dialog" aria-label={`Edit ${title}`}>{inner.element}
    <div className="diagram-bar"><button className="button secondary small-button" onClick={close}><ArrowLeft size={14}/>Back to board</button><input className="diagram-title" aria-label="Diagram name" value={title} onChange={e => { setTitle(e.target.value); touch(); }} onBlur={flush}/><span className="diagram-hint">Drag from a dot on a shape to another shape to connect them · Double-click a shape to type</span><button className="button primary small-button" onClick={close}><Check size={14}/>Done</button></div>
    <div className="diagram-body">
      <div className="canvas-palette diagram-palette" role="toolbar" aria-label="Diagram shapes" aria-orientation="vertical">{DIAGRAM_SHAPES.map(([type, label, Icon]) => <button key={type} aria-label={`Add ${label}`} title={`Add ${label}`} onClick={() => add(type)}><Icon size={17}/></button>)}<span className="palette-sep"/><button aria-label="Fit diagram" title="Fit to screen" onClick={() => flow.fitView({ padding: 0.2, duration: 200 })}><Maximize size={17}/></button></div>
      {selEdges.length > 0 && !selNodes.length && <div className="canvas-context" role="toolbar" aria-label="Connector">{EDGE_STYLES.map(([type, label, Icon]) => <button key={type} aria-label={`${label} connector`} title={`${label} connector`} onClick={() => restyle(type)}><Icon size={15}/></button>)}<span className="palette-sep h"/><button aria-label="Label and line style" title="Label, line style, arrows and colour" className={edgeOpen ? 'active' : ''} onClick={() => setEdgeOpen(o => !o)}><Spline size={14}/>Line</button><button aria-label="Delete connector" title="Delete" onClick={removeSelected}><Trash2 size={14}/></button>{edgeOpen && <EdgePanel edges={edges.filter(e => selEdges.includes(e.id))} patch={patchEdges}/>}</div>}
      {selNodes.length > 0 && <div className="canvas-context" role="toolbar" aria-label="Selection"><Palette size={14}/>{COLORS.map(c => <button key={c} className={`swatch c-${c}`} aria-label={`Color ${c}`} onClick={() => recolor(c)}/>)}<span className="palette-sep h"/><button aria-label="Duplicate" title="Duplicate" onClick={duplicate}><Copy size={14}/></button><button aria-label="Delete selected" title="Delete (Del)" onClick={removeSelected}><Trash2 size={14}/></button></div>}
      <ReactFlow nodes={nodes} edges={shown} nodeTypes={nodeTypes} defaultEdgeOptions={EDGE_DEFAULTS} connectionLineStyle={{ stroke: edgeColor }} connectionMode={ConnectionMode.Loose} onSelectionChange={onSel}
        panOnDrag={[1, 2]} selectionOnDrag zoomOnDoubleClick={false} minZoom={0.1} maxZoom={2} colorMode="light" deleteKeyCode={['Delete', 'Backspace']} fitView fitViewOptions={{ padding: 0.25, maxZoom: 1 }} proOptions={{ hideAttribution: true }}
        onNodesChange={changes => { setNodes(ns => applyNodeChanges(changes, ns)); if (changes.some(c => c.type === 'remove')) touch(); }}
        onNodeDragStop={() => touch()} onConnect={connect} onConnectEnd={(event, state) => { if (state.isValid || !state.fromNode || state.toNode) return; const p = dropPoint(event); setDrop({ ...p, fromId: state.fromNode.id, side: state.fromHandle?.id, at: flow.screenToFlowPosition(p) }); }}
        onEdgesChange={changes => { const picks = changes.filter(c => c.type === 'select'); if (picks.length) setEdges(es => applyEdgeChanges(picks, es)); const gone = changes.filter(c => c.type === 'remove').map(c => c.id); if (gone.length) { setEdges(es => es.filter(e => !gone.includes(e.id))); touch(); } }}>
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color="#c9ced8"/><ZoomPill/>
      </ReactFlow>
      {drop && <ConnectMenu at={drop} onClose={() => setDrop(null)} onPick={type => { const { item, targetHandle } = branchItem(type, drop.at, drop.side); setNodes(ns => [...ns.map(n => ({ ...n, selected: false })), { ...toNode(item), selected: true }]); setEdges(es => addEdge({ id: uid(), source: drop.fromId, target: item.id, sourceHandle: drop.side, targetHandle, type: 'default', markerEnd: ARROW }, es)); touch(); setDrop(null); }}/>}
    </div>
  </div>;
}
// Let go of a connector on empty space and pick what to attach there.
const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const DROP_SHAPES = [['rect', 'Rectangle'], ['roundrect', 'Rounded box'], ['ellipse', 'Ellipse'], ['diamond', 'Decision'], ['hexagon', 'Hexagon'], ['parallelogram', 'Input / output'], ['triangle', 'Triangle'], ['sticky', 'Sticky note'], ['text', 'Text']];
function branchItem(type, at, fromSide) {
  const d = SHAPE_DEFAULTS[type], side = OPPOSITE[fromSide] || 'left';
  const x = side === 'left' ? at.x : side === 'right' ? at.x - d.w : at.x - d.w / 2, y = side === 'top' ? at.y : side === 'bottom' ? at.y - d.h : at.y - d.h / 2;
  return { item: { id: uid(), type, text: '', color: d.color, position: { x: Math.round(x), y: Math.round(y) }, size: { w: d.w, h: d.h } }, targetHandle: side };
}
function dropPoint(event) { const t = event.changedTouches?.[0] || event; return { x: t.clientX, y: t.clientY }; }
function ConnectMenu({ at, onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const away = e => { if (!ref.current?.contains(e.target)) onClose(); }, key = e => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => window.addEventListener('pointerdown', away, true), 0);
    window.addEventListener('keydown', key);
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', key); };
  }, []);
  const left = Math.min(at.x + 8, window.innerWidth - 220), top = Math.min(at.y + 8, window.innerHeight - 38 * DROP_SHAPES.length - 40);
  return createPortal(<div ref={ref} className="connect-menu" role="menu" aria-label="Connect to a new shape" style={{ left, top }}><div className="tool-group-label">Connect to</div>{DROP_SHAPES.map(([type, label]) => <button key={type} role="menuitem" onClick={() => onPick(type)}><span className={`connect-shape ${type}`} aria-hidden="true"/>{label}</button>)}</div>, document.body);
}
function DiagramEditor(props) { return <ReactFlowProvider><DiagramEditorInner {...props}/></ReactFlowProvider>; }
// Nodes only repaint when their own data or selection changes, so dragging or saving one item doesn't redraw the whole board.
const memoNode = C => React.memo(C, (a, b) => a.data === b.data && a.selected === b.selected && a.id === b.id);
const nodeTypes = { draw: memoNode(DrawNode), shape: memoNode(ShapeNode), note: memoNode(NoteNode), file: memoNode(FileNode), artifact: memoNode(ArtifactNode), diagram: memoNode(DiagramNode), link: memoNode(LinkNode), picture: memoNode(PictureNode) };


function CanvasInner({ project, onOpen, onFile, onOpenArtifact, act, onImport, onAsk, controls, theme=document.documentElement.dataset.theme||'light' }) {
  const flow = useReactFlow(), area = useRef(null), ctx = useContextMenu();
  // While the view moves the overview map is taken out: redrawing every card in it was what made panning stutter.
  const [busy, setBusy] = useState(false), [mapOn, setMapOn] = useState(() => { try { return localStorage.getItem('rw-canvas-map') !== 'off'; } catch { return true; } });
  const moving = useCallback(on => { area.current?.classList.toggle('moving', on); setBusy(on); }, []);
  const toggleMap = () => setMapOn(on => { try { localStorage.setItem('rw-canvas-map', on ? 'off' : 'on'); } catch {} return !on; });
  // The mouse wheel zooms smoothly toward the pointer; a touchpad scroll pans (one move per frame); pinch zooms.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    let target = null, raf = 0, settle = 0, padUntil = 0, panX = 0, panY = 0, panRaf = 0;
    const calm = on => { clearTimeout(settle); if (on) moving(true); else settle = setTimeout(() => moving(false), 160); };
    const step = () => {
      const v = flow.getViewport(), t = target, k = 0.3, next = { x: v.x + (t.x - v.x) * k, y: v.y + (t.y - v.y) * k, zoom: v.zoom + (t.zoom - v.zoom) * k };
      const done = Math.abs(t.x - next.x) < 0.3 && Math.abs(t.y - next.y) < 0.3 && Math.abs(t.zoom - next.zoom) < 0.0008;
      flow.setViewport(done ? t : next);
      if (done) { raf = 0; target = null; calm(false); } else raf = requestAnimationFrame(step);
    };
    // A touchpad sends many small scroll events; they are added up and applied once per frame.
    const flushPan = () => {
      panRaf = 0;
      if (!panX && !panY) return;
      const v = raf && target ? target : flow.getViewport(), next = { x: v.x - panX, y: v.y - panY, zoom: v.zoom };
      panX = panY = 0;
      if (raf) target = next;
      flow.setViewport(next);
      calm(false);
    };
    const wheel = e => {
      const t = e.target;
      if (!t.closest?.('.react-flow') || t.closest('.nowheel, .canvas-palette, .canvas-context, .diagram-editor, .react-flow__minimap, textarea, input, select')) return;
      e.preventDefault(); e.stopPropagation();
      const unit = e.deltaMode === 1 ? 16 : 1, dx = e.deltaX * unit, dy = e.deltaY * unit, pinch = e.ctrlKey || e.metaKey;
      // A mouse wheel clicks in whole steps (100 or 120); anything else is a touchpad, and stays one through its glide.
      const step100 = Math.abs(e.deltaY) >= 100 && (Math.abs(e.deltaY) % 100 === 0 || Math.abs(e.deltaY) % 120 === 0);
      const notch = e.deltaMode === 1 || (dx === 0 && Number.isInteger(e.deltaY) && step100);
      if (!pinch && !notch) padUntil = e.timeStamp + 350;
      calm(true);
      if (pinch || (notch && e.timeStamp >= padUntil)) {
        const box = el.querySelector('.react-flow').getBoundingClientRect(), base = target || flow.getViewport();
        const zoom = Math.min(2, Math.max(0.05, base.zoom * Math.exp(-dy * (pinch ? 0.01 : 0.0015)))), k = zoom / base.zoom, cx = e.clientX - box.left, cy = e.clientY - box.top;
        target = { x: cx - (cx - base.x) * k, y: cy - (cy - base.y) * k, zoom };
        if (!raf) raf = requestAnimationFrame(step);
      } else {
        panX += dx; panY += dy;
        if (!panRaf) panRaf = requestAnimationFrame(flushPan);
      }
    };
    el.addEventListener('wheel', wheel, { capture: true, passive: false });
    return () => { el.removeEventListener('wheel', wheel, { capture: true }); cancelAnimationFrame(raf); cancelAnimationFrame(panRaf); clearTimeout(settle); };
  }, [flow, moving]);
  const [stroke, setStroke] = useState(null), [tool, setTool] = useState('select'), [penColor, setPenColor] = useState('blue'), [menu, setMenu] = useState(''), [selected, setSelected] = useState([]), [edges, setEdges] = useState(project.edges || []), [diagram, setDiagram] = useState(null), diagramOpen = useRef(false), stableData = useRef(new Map()), viewportTimer = useRef(null);
  diagramOpen.current = Boolean(diagram);
  // Changes from the format panel show at once. Until the saved copy catches up, the screen keeps its own newer version of those blocks.
  const optimistic = useRef(new Map()), pendingEdges = useRef(0);
  const [drop, setDrop] = useState(null), [fmtOpen, setFmtOpen] = useState(false), [edgeOpen, setEdgeOpen] = useState(false), [linkUrl, setLinkUrl] = useState(''), mindRef = useRef(null), linkRef = useRef(null);
  const [smart, setSmart] = useState(() => { try { return localStorage.getItem('rw-smart-shapes') !== 'off'; } catch { return true; } });
  const toggleSmart = () => setSmart(on => { try { localStorage.setItem('rw-smart-shapes', on ? 'off' : 'on'); } catch {} return !on; });
  // Undo and redo keep whole earlier snapshots of the canvas (items, connectors, card layout).
  const hist = useRef({ undo: [], redo: [] }), [, bump] = useState(0), historyApi = useRef({});
  const snapshot = () => ({ canvas: structuredClone(project.canvas || []), edges: structuredClone(project.edges || []), layout: [...project.notes, ...project.files].map(n => ({ id: n.id, position: n.position || { x: 0, y: 0 }, ...(n.kind ? { size: n.size, embed: isEmbedded(n) } : {}) })) });
  const remember = () => { hist.current.undo.push(snapshot()); if (hist.current.undo.length > 60) hist.current.undo.shift(); hist.current.redo = []; bump(n => n + 1); };
  const travel = (from, to) => { const snap = hist.current[from].pop(); if (!snap) return; hist.current[to].push(snapshot()); bump(n => n + 1); act({ type: 'canvas:restore', projectId: project.id, value: snap }).catch(() => {}); };
  historyApi.current = { undo: () => travel('undo', 'redo'), redo: () => travel('redo', 'undo') };
  const board = value => { if (value.edges) pendingEdges.current = Date.now(); if (value.positions || value.layout || value.edges) remember(); return act({ type: 'board', projectId: project.id, value }).catch(() => {}); };
  const handlers = useRef({});
  handlers.current = {
    project,
    // The board updates at once; the save to disk follows.
    saveItem: item => { remember(); if (item.type !== 'artifact') setNodes(ns => ns.some(n => n.id === item.id) ? ns.map(n => n.id === item.id ? { ...n, width: item.size.w, height: item.size.h, position: item.position, draggable: !item.lock, ...(item.type === 'frame' ? {} : { zIndex: item.z || 0 }), data: { ...n.data, item } } : n) : [...ns, { id: item.id, type: item.type === 'draw' || item.type === 'diagram' || item.type === 'link' ? item.type : 'shape', position: item.position, width: item.size.w, height: item.size.h, ...(item.type === 'frame' ? { zIndex: -1 } : {}), data: { item, h: handlers } }]); return act({ type: 'canvas:item', projectId: project.id, value: item }).catch(() => {}); },
    live: (id, s) => setNodes(ns => ns.map(n => n.id === id ? { ...n, width: s.w, height: s.h } : n)),
    menu: (e, kind, item, extra = {}) => {
      const asked = (label, run) => { if (window.confirm(`Delete "${label}"?`)) run(); };
      const remove = { label: 'Delete', icon: Trash2, hint: 'Del', danger: true };
      const items = kind === 'note' ? [
        { label: 'Open', icon: ArrowUpRight, onClick: () => onOpen(item.id) },
        { label: 'Duplicate', icon: Copy, onClick: () => act({ type: 'note', projectId: project.id, value: { ...item, id: uid(), title: `${item.title} copy`, createdAt: now(), updatedAt: now(), position: { x: (item.position?.x || 80) + 40, y: (item.position?.y || 90) + 40 } } }).catch(() => {}) },
        { label: 'Copy text', icon: Copy, onClick: () => copyText(item.content || '') }, 'separator',
        { ...remove, onClick: () => asked(item.title, () => act({ type: 'note:delete', projectId: project.id, value: item.id }).catch(() => {})) }
      ] : kind === 'file' ? [
        { label: 'Open', icon: ArrowUpRight, onClick: () => onFile(item.id) },
        { label: 'Copy file name', icon: Copy, onClick: () => copyText(item.name) }, 'separator',
        { ...remove, onClick: () => asked(item.name, () => act({ type: 'file:delete', projectId: project.id, value: item.id }).catch(() => {})) }
      ] : kind === 'diagram' ? [
        { label: 'Open', icon: Maximize2, onClick: extra.open }, { label: 'Rename', icon: PenLine, onClick: extra.rename },
        { label: 'Duplicate', icon: Copy, onClick: () => handlers.current.saveItem({ ...item, id: uid(), position: { x: item.position.x + 40, y: item.position.y + 40 } }) }, 'separator',
        { ...remove, onClick: () => handlers.current.deleteItem(item.id) }
      ] : [
        { label: 'Edit text', icon: PenLine, onClick: extra.edit },
        { label: 'Copy text', icon: Copy, disabled: !item.text, onClick: () => copyText(item.text) },
        { label: 'Duplicate', icon: Copy, onClick: () => handlers.current.saveItem({ ...item, id: uid(), position: { x: item.position.x + 28, y: item.position.y + 28 } }) }, 'separator',
        { ...remove, onClick: () => handlers.current.deleteItem(item.id) }
      ];
      ctx.open(e, items);
    },
    deleteItem: id => { remember(); act({ type: 'canvas:item:delete', projectId: project.id, value: id }).catch(() => {}); },
    openDiagram: id => { const item = (project.canvas || []).find(c => c.id === id); if (item) { remember(); setDiagram(item); } },
    projectId: project.id,
    saveNote: note => act({ type: 'note', projectId: project.id, value: note }).catch(() => {}),
    toggleEmbed: note => { const size = note.size || docSize(note); board({ layout: [{ id: note.id, size, embed: !isEmbedded(note) }] }); },
    resized: (id, p) => board({ positions: [{ id, position: { x: p.x, y: p.y } }], layout: [{ id, size: { w: p.width, h: p.height } }] }),
    open: onOpen, openFile: onFile, openArtifact: onOpenArtifact, openLink: url => api.openURL(url)
  };
  // Packs cards, stickies, shapes, and boards into tidy rows so nothing overlaps. Frames stay where you put them.
  const tidy = (silent = false) => {
    const cardSize = n => isEmbedded(n) ? (n.size || docSize(n)) : { w: 260, h: 170 };
    const entries = [...project.notes.map(n => ({ id: n.id, ...cardSize(n) })), ...project.files.filter(f => !f.inline).map(f => ({ id: f.id, w: 260, h: 170 })), ...(project.canvas || []).filter(c => c.type !== 'frame').map(c => ({ id: c.id, w: c.size.w, h: c.size.h }))];
    if (!entries.length) return;
    const maxWidth = 1500, gap = 36, positions = [];
    let x = 80, y = 80, rowHeight = 0;
    for (const e of entries) { if (x > 80 && x + e.w > maxWidth) { x = 80; y += rowHeight + gap; rowHeight = 0; } positions.push({ id: e.id, position: { x, y } }); x += e.w + gap; rowHeight = Math.max(rowHeight, e.h); }
    board({ positions });
    if (!silent) setTimeout(() => flow.fitView({ padding: 0.2, duration: 300 }), 120);
  };
  const tidied = useRef(false);
  useEffect(() => {
    if (tidied.current) return; tidied.current = true;
    const seen = new Set(); let stacked = project.files.some(f => !f.inline && !f.position);
    for (const item of [...project.notes, ...project.files.filter(f => !f.inline)]) { const key = item.position ? `${Math.round(item.position.x)},${Math.round(item.position.y)}` : 'none'; if (seen.has(key)) stacked = true; seen.add(key); }
    if (stacked) tidy(true);
  }, []);
  // Each node's data object is reused while its content is unchanged, so memoized nodes skip repainting.
  const stable = (id, sig, make) => { const c = stableData.current.get(id); if (c && c.sig === sig) return c.data; const data = make(); stableData.current.set(id, { sig, data }); return data; };
  const build = () => {
    const items = project.canvas || [], list = [], stamp = project.notes.length + ':' + project.notes.reduce((m, n) => n.updatedAt > m ? n.updatedAt : m, '');
    const itemData = c => {
      const pending = optimistic.current.get(c.id);
      if (pending) { if (JSON.stringify(pending.item) === JSON.stringify(c) || Date.now() - pending.at > 4000) optimistic.current.delete(c.id); else c = pending.item; }
      return stable(c.id, JSON.stringify(c), () => ({ item: c, h: handlers, pid: project.id }));
    };
    for (const c of items.filter(c => c.type === 'frame')) list.push({ id: c.id, type: 'shape', position: c.position, width: c.size.w, height: c.size.h, zIndex: -1, draggable: !c.lock, data: itemData(c) });
    for (const n of project.notes) list.push({ id: n.id, type: 'note', position: n.position || { x: 80, y: 90 }, ...(isEmbedded(n) ? { width: (n.size || docSize(n)).w, height: (n.size || docSize(n)).h } : {}), data: stable(n.id, [n.updatedAt, n.title, n.embed, n.kind, n.author, n.content?.length, n.size?.w, n.size?.h].join('|'), () => ({ item: n, h: handlers })) });
    for (const f of project.files) if (!f.inline) list.push({ id: f.id, type: 'file', position: f.position || { x: 400, y: 90 }, data: stable(f.id, [f.name, f.size, f.createdAt].join('|'), () => ({ item: f, h: handlers, pid: project.id })) });
    for (const c of items.filter(c => c.type !== 'frame')) {
      if (c.type === 'draw' || c.type === 'diagram') list.push({ id: c.id, type: c.type, position: c.position, width: c.size.w, height: c.size.h, ...canvasProps(c), data: itemData(c) });
      else if (c.type === 'artifact') { const a = (project.artifacts || []).find(x => x.id === c.refId); if (a) list.push({ id: c.id, type: 'artifact', position: c.position, width: c.size.w, height: c.size.h, data: stable(c.id, [a.kind === 'html' ? [a.id, a.updatedAt, a.title, a.data?.html?.length].join('|') : JSON.stringify(a), stamp].join('#'), () => ({ artifact: a, project, h: handlers })) }); }
      else list.push({ id: c.id, type: c.type === 'link' ? 'link' : c.type === 'image' ? 'picture' : 'shape', position: c.position, width: c.size.w, height: c.size.h, ...canvasProps(c), data: itemData(c) });
    }
    // Lock and stacking follow the version of each block that is on screen, including unsaved changes.
    for (const n of list) { const it = n.data?.item; if (it?.type && it.size) { n.draggable = !it.lock; if (it.type !== 'frame') { if (it.z) n.zIndex = it.z; else delete n.zIndex; } } }
    return list;
  };
  const [nodes, setNodes] = useState(build);
  // Connector changes show at once; saved copies that arrive while newer changes are in flight must not undo them.
  useEffect(() => { if (Date.now() - pendingEdges.current < 2500) return; setEdges(old => { const picked = new Set(old.filter(e => e.selected).map(e => e.id)); return (project.edges || []).map(e => picked.has(e.id) ? { ...e, selected: true } : e); }); }, [project.edges]);
  useEffect(() => {
    setNodes(old => {
      const prev = new Map(old.map(n => [n.id, n])), fresh = build(), alive = new Set(fresh.map(n => n.id));
      for (const id of stableData.current.keys()) if (!alive.has(id)) stableData.current.delete(id);
      return fresh.map(n => { const o = prev.get(n.id), position = o?.dragging ? o.position : n.position, next = { ...n, position, selected: o?.selected }; return o && o.data === n.data && o.type === n.type && o.position.x === position.x && o.position.y === position.y && o.width === n.width && o.height === n.height && o.selected === next.selected ? o : next; });
    });
  }, [project.notes, project.files, project.canvas, project.artifacts]);
  useEffect(() => { const key = e => { if (diagramOpen.current || e.target.closest?.('input,textarea,select,[contenteditable]')) return; if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) { e.preventDefault(); (e.key.toLowerCase() === 'y' || e.shiftKey ? historyApi.current.redo : historyApi.current.undo)(); return; } const k = { v: 'select', h: 'hand', p: 'pen', s: 'sticky', t: 'text', f: 'frame' }[e.key.toLowerCase()]; if (k && !e.ctrlKey && !e.metaKey && !e.altKey) setTool(k); if (e.key === 'Escape') { setTool('select'); setMenu(''); } if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) mindRef.current?.(e); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, []);
  const center = () => { const r = area.current.getBoundingClientRect(); return flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); };
  const [notice, setNotice] = useState(''), pictureInput = useRef(null);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(t); }, [notice]);
  // Pictures from a paste, a drop or the picker land on the canvas as blocks you can move and resize freely.
  async function addPictures(files, at) {
    try {
      if (!window.workspace) throw new Error('Pictures on the canvas need the desktop app.');
      const made = await ingestFiles(project.id, files);
      if (!made.length) return false;
      const spot = at || center(), items = made.map((m, n) => { const w = Math.round(Math.min(380, m.width)), h = Math.round(w * m.height / m.width); return { id: uid(), type: 'image', text: m.name || '', color: 'gray', refId: m.fileId, position: { x: Math.round(spot.x - w / 2 + n * 28), y: Math.round(spot.y - h / 2 + n * 28) }, size: { w, h } }; });
      remember();
      await act({ type: 'canvas:items', projectId: project.id, value: { items } });
      setTimeout(() => setNodes(ns => ns.map(n => ({ ...n, selected: n.id === items.at(-1).id }))), 150);
      return true;
    } catch (error) { setNotice(error.message || 'Could not add that picture.'); return true; }
  }
  const picturesRef = useRef(null); picturesRef.current = addPictures;
  function place(type, at) {
    const d = SHAPE_DEFAULTS[type], item = { id: uid(), type, text: type === 'frame' ? 'Frame' : '', color: d.color, position: { x: at.x - d.w / 2, y: at.y - d.h / 2 }, size: { w: d.w, h: d.h } };
    handlers.current.saveItem(item);
    if (type !== 'frame') setTimeout(() => setNodes(ns => ns.map(n => ({ ...n, selected: n.id === item.id }))), 80);
  }
  const newDiagram = () => { const at = center(), item = { id: uid(), type: 'diagram', text: 'Diagram', color: 'white', position: { x: Math.round(at.x - DIAGRAM_SIZE.w / 2), y: Math.round(at.y - DIAGRAM_SIZE.h / 2) }, size: DIAGRAM_SIZE, nodes: [], edges: [] }; setMenu(''); setTool('select'); handlers.current.saveItem(item); setDiagram(item); };
  const addNote = (kind, preset) => { const at = center(), note = { id: uid(), title: kind === 'sheet' ? (preset ? 'Table' : 'Untitled spreadsheet') : 'Untitled note', content: kind === 'sheet' ? (preset || 'Topic,Finding,Source\n,,') : '', kind, author: 'You', createdAt: now(), updatedAt: now(), embed: true, size: DOC_SIZE[kind], position: { x: at.x - DOC_SIZE[kind].w / 2, y: at.y - DOC_SIZE[kind].h / 2 } }; setMenu(''); handlers.current.saveNote(note); };
  const placeArtifact = (artifact, create) => { const at = center(); setMenu(''); const go = () => handlers.current.saveItem({ id: uid(), type: 'artifact', refId: artifact.id, text: '', color: 'gray', position: { x: at.x - 210, y: at.y - 150 }, size: { w: 420, h: 300 } }); if (create) act({ type: 'artifact', projectId: project.id, value: artifact }).then(go).catch(() => {}); else go(); };
  // A selection that has not really changed must not set state: the connectors are drawn from it, so that would go round in circles.
  const sameIds = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);
  const selectedEdges = useMemo(() => edges.filter(e => e.selected).map(e => e.id), [edges]);
  const onSelection = useCallback(({ nodes: ns }) => { const nodeIds = ns.map(n => n.id); setSelected(old => sameIds(old, nodeIds) ? old : nodeIds); }, []);
  const restyleEdges = type => { const next = edges.map(e => selectedEdges.includes(e.id) ? { ...e, type } : e); setEdges(next); board({ edges: next }); };
  // Read from the nodes, which update at once, so quick successive changes build on each other instead of the last saved copy.
  const shapes = nodes.filter(n => selected.includes(n.id) && n.data?.item?.size && n.data.item.type && !['artifact', 'diagram', 'image'].includes(n.data.item.type) && (project.canvas || []).some(c => c.id === n.id)).map(n => n.data.item);
  const canvasIds = new Set((project.canvas || []).map(c => c.id));
  const removable = selected.filter(id => canvasIds.has(id));
  // Writes a change to several blocks as one step, so a single undo puts them all back.
  const saveMany = items => {
    remember();
    setNodes(ns => ns.map(n => { const it = items.find(i => i.id === n.id); return it ? { ...n, width: it.size.w, height: it.size.h, position: it.position, draggable: !it.lock, ...(it.type === 'frame' ? {} : { zIndex: it.z || 0 }), data: { ...n.data, item: it } } : n; }));
    items.forEach(i => optimistic.current.set(i.id, { item: i, at: Date.now() }));
    return act({ type: 'canvas:items', projectId: project.id, value: { items } }).catch(() => {});
  };
  const patchEdges = patch => { const next = edges.map(e => selectedEdges.includes(e.id) ? { ...e, ...patch } : e); setEdges(next); board({ edges: next }); };
  const removeEdges = () => { const next = edges.filter(e => !selectedEdges.includes(e.id)); setEdges(next); board({ edges: next }); };
  const addTemplate = id => {
    const built = buildTemplate(id, center(), uid);
    if (!built.items.length) return;
    setMenu(''); setTool('select'); remember();
    act({ type: 'canvas:items', projectId: project.id, value: built }).then(() => setTimeout(() => flow.fitView({ padding: 0.25, duration: 350 }), 150)).catch(() => {});
  };
  const addLinkFrom = raw => {
    let url;
    try { url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch { return false; }
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const at = center(), host = url.hostname.replace(/^www\./, '');
    setLinkUrl(''); setMenu('');
    handlers.current.saveItem({ id: uid(), type: 'link', text: host, url: url.href, color: 'white', position: { x: Math.round(at.x - 130), y: Math.round(at.y - 40) }, size: { w: 260, h: 80 } });
    return true;
  };
  linkRef.current = addLinkFrom;
  // Tab on one selected block adds a connected branch, like a mind map.
  mindRef.current = e => {
    const picked = (project.canvas || []).filter(c => selected.includes(c.id));
    if (picked.length !== 1 || selected.length !== 1 || ['frame', 'draw', 'artifact', 'diagram', 'link', 'image'].includes(picked[0].type)) return;
    e.preventDefault();
    const parent = picked[0], kids = edges.filter(x => x.source === parent.id).length, size = { w: Math.min(parent.size.w, 190), h: Math.min(parent.size.h, 90) };
    const child = { id: uid(), type: parent.type === 'sticky' ? 'sticky' : 'roundrect', text: '', color: parent.color, position: { x: Math.round(parent.position.x + parent.size.w + 90), y: Math.round(parent.position.y + kids * (size.h + 24)) }, size };
    remember();
    act({ type: 'canvas:items', projectId: project.id, value: { items: [child], edges: [{ id: uid(), source: parent.id, target: child.id, type: 'default', markerEnd: { type: 'arrowclosed' } }] } }).then(() => setTimeout(() => setNodes(ns => ns.map(n => ({ ...n, selected: n.id === child.id }))), 120)).catch(() => {});
  };
  useEffect(() => {
    const paste = e => {
      if (diagramOpen.current || e.target.closest?.('input, textarea, select, [contenteditable]') || !area.current?.offsetParent) return;
      const pictures = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type));
      if (pictures.length) { e.preventDefault(); picturesRef.current?.(pictures); return; }
      const text = (e.clipboardData?.getData('text/plain') || '').trim();
      if (/^https?:\/\/\S+$/i.test(text) && linkRef.current?.(text)) e.preventDefault();
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, []);
  const tools = [['select', MousePointer2, 'Select (V)'], ['hand', Hand, 'Pan (H)'], ['pen', PenLine, 'Pen (P)'], ['sticky', StickyNote, 'Sticky note (S)'], ['text', Type, 'Text (T)'], ['frame', Frame, 'Frame (F)']];
  function penDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = area.current.getBoundingClientRect();
    setStroke({ screen: [[e.clientX - r.left, e.clientY - r.top]], flow: [flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })] });
  }
  function penMove(e) {
    if (!stroke) return;
    const r = area.current.getBoundingClientRect();
    setStroke(s => ({ screen: [...s.screen, [e.clientX - r.left, e.clientY - r.top]], flow: [...s.flow, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })] }));
  }
  function penUp() {
    if (!stroke) return;
    const pts = stroke.flow; setStroke(null);
    if (pts.length < 2) return;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), minX = Math.min(...xs), minY = Math.min(...ys);
    const w = Math.max(40, Math.max(...xs) - minX), h = Math.max(30, Math.max(...ys) - minY);
    const step = Math.max(1, Math.ceil(pts.length / 1500)), guess = smart && recognizeShape(pts.map(p => [p.x, p.y]));
    if (guess && guess.type !== 'line') {
      const item = { id: uid(), type: guess.type, text: '', color: 'white', position: { x: Math.round(guess.x), y: Math.round(guess.y) }, size: { w: Math.max(60, Math.round(guess.w)), h: Math.max(40, Math.round(guess.h)) } };
      handlers.current.saveItem(item);
      setTimeout(() => setNodes(ns => ns.map(n => ({ ...n, selected: n.id === item.id }))), 80);
      return;
    }
    const straight = guess ? [guess.x1 - minX, guess.y1 - minY, guess.x2 - minX, guess.y2 - minY] : null;
    handlers.current.saveItem({ id: uid(), type: 'draw', text: '', color: penColor, position: { x: minX, y: minY }, size: { w, h }, points: straight || pts.filter((_, i) => i % step === 0 || i === pts.length - 1).flatMap(p => [p.x - minX, p.y - minY]) });
  }
  const connect = c => { const loop = c.source === c.target; const next = addEdge({ ...c, ...(loop ? { sourceHandle: 'right', targetHandle: 'top', type: 'loop' } : { type: 'default' }), id: uid(), markerEnd: { type: MarkerType.ArrowClosed, color: '#1a1a1a' } }, edges); setEdges(next); board({ edges: next }); };
  const edgeColor=theme==='dark'?'#ffffff':'#1a1a1a';
  const displayEdges = useMemo(() => edges.map(edge => edgeLook(edge, edgeColor, theme === 'dark')), [edges, edgeColor, theme]);
  return <div className="canvas-view freeform">{ctx.element}<div className="canvas-toolbar"><div><span className="canvas-badge"><Network size={15}/>Project canvas</span><span className="canvas-hint">Diagram sheets, notes, documents, spreadsheets, and boards.</span></div><div><button data-ai className="button secondary small-button" onClick={() => onAsk?.('Draw a flowchart on the canvas for: ')}><Sparkles size={14}/>Ask AI to diagram</button><button className="button secondary small-button" onClick={() => tidy()}><LayoutGrid size={14}/>Tidy up</button><button className="button secondary small-button" onClick={onImport}><Upload size={14}/>Add files</button>{controls}</div></div>
    <div className="flow-area" ref={area} data-tool={tool} onDragOver={e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); }} onDrop={e => { const files = [...(e.dataTransfer?.files || [])].filter(f => /^image\//.test(f.type)); if (!files.length) return; e.preventDefault(); picturesRef.current?.(files, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })); }}>{notice && <div className="canvas-notice" role="status">{notice}</div>}<input ref={pictureInput} type="file" accept={IMAGE_TYPES} multiple hidden aria-label="Choose pictures" onChange={e => { addPictures(e.target.files); e.target.value = ''; }}/>
      <div className="canvas-palette" role="toolbar" aria-label="Canvas tools" aria-orientation="vertical">{tools.map(([id, Icon, label]) => <button key={id} aria-label={label} title={label} className={tool === id ? 'active' : ''} aria-pressed={tool === id} onClick={() => setTool(id)}><Icon size={17}/></button>)}<button aria-label="New diagram sheet" title="Diagram sheet: shapes and connectors" onClick={newDiagram}><Shapes size={17}/></button><span className="palette-sep"/>
        <button aria-label="Add a picture" title="Add a picture (or paste / drop one)" onClick={() => pictureInput.current?.click()}><ImageIcon size={17}/></button><button aria-label="New document on canvas" title="New document" onClick={() => addNote('note')}><FileText size={17}/></button><button aria-label="New spreadsheet on canvas" title="New spreadsheet" onClick={() => addNote('sheet')}><Table2 size={17}/></button>
        <div className="popover-anchor"><button aria-label="Add a board or chart" title="Kanban or chart" className={menu === 'boards' ? 'active' : ''} onClick={() => setMenu(menu === 'boards' ? '' : 'boards')}><Kanban size={17}/></button>{menu === 'boards' && <div className="popover palette-menu"><div className="tool-group-label">New</div><NewBoardItems onPick={(kind, label) => placeArtifact(newArtifact(kind, label), true)}/>{(project.artifacts || []).length > 0 && <><div className="tool-group-label">Existing</div>{project.artifacts.map(a => { const Icon = kindIcon(a.kind); return <button key={a.id} onClick={() => placeArtifact(a, false)}><Icon size={14}/>{a.title}</button>; })}</>}</div>}</div><div className="popover-anchor"><button aria-label="Templates" title="Templates, mind map and timeline" className={menu === 'templates' ? 'active' : ''} onClick={() => setMenu(menu === 'templates' ? '' : 'templates')}><LayoutTemplate size={17}/></button>{menu === 'templates' && <div className="popover palette-menu"><div className="tool-group-label">Start from</div>{TEMPLATES.map(t => <button key={t.id} title={t.hint} onClick={() => addTemplate(t.id)}>{t.name}</button>)}<button title="A spreadsheet with task columns" onClick={() => addNote('sheet', 'Task,Owner,Status,Due\n,,,')}>Table</button></div>}</div>
        <div className="popover-anchor"><button aria-label="Add a link" title="Link card (or just paste a web address)" className={menu === 'link' ? 'active' : ''} onClick={() => setMenu(menu === 'link' ? '' : 'link')}><Link2 size={17}/></button>{menu === 'link' && <form className="popover palette-menu link-form" onSubmit={e => { e.preventDefault(); addLinkFrom(linkUrl.trim()); }}><input autoFocus aria-label="Web address" placeholder="Paste a web address" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}/><button className="button primary small-button">Add</button></form>}</div><span className="palette-sep"/><button aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!hist.current.undo.length} onClick={() => historyApi.current.undo()}><Undo2 size={17}/></button><button aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)" disabled={!hist.current.redo.length} onClick={() => historyApi.current.redo()}><Redo2 size={17}/></button></div>
      {tool === 'pen' && <><div className="canvas-context pen-colors" role="toolbar" aria-label="Pen color"><PenLine size={14}/>{COLORS.map(c => <button key={c} className={`swatch c-${c} ${penColor === c ? 'on' : ''}`} aria-label={`Pen ${c}`} aria-pressed={penColor === c} onClick={() => setPenColor(c)}/>)}<span className="palette-sep h"/><button aria-label="Smart shapes" aria-pressed={smart} title={smart ? 'Rough drawings become clean shapes (on)' : 'Turn rough drawings into clean shapes (off)'} className={smart ? 'on' : ''} onClick={toggleSmart}><Wand2 size={14}/></button></div><svg className={`pen-overlay c-${penColor}`} onPointerDown={penDown} onPointerMove={penMove} onPointerUp={penUp} onPointerCancel={() => setStroke(null)}>{stroke && <polyline points={stroke.screen.map(p => p.join(',')).join(' ')} fill="none" strokeLinecap="round" strokeLinejoin="round"/>}</svg></>}
      {tool !== 'pen' && selectedEdges.length > 0 && !selected.length && <div className="canvas-context" role="toolbar" aria-label="Connector">{EDGE_STYLES.map(([type, label, Icon]) => <button key={type} aria-label={`${label} connector`} title={`${label} connector`} onClick={() => restyleEdges(type)}><Icon size={15}/></button>)}<span className="palette-sep h"/><button aria-label="Label and line style" title="Label, line style, arrows and colour" className={edgeOpen ? 'active' : ''} onClick={() => setEdgeOpen(o => !o)}><Spline size={14}/>Line</button><button aria-label="Delete connector" title="Delete" onClick={removeEdges}><Trash2 size={14}/></button>{edgeOpen && <EdgePanel edges={edges.filter(e => selectedEdges.includes(e.id))} patch={patchEdges}/>}</div>}
      {tool !== 'pen' && (shapes.length > 0 || removable.length > 0) && <div className="canvas-context" role="toolbar" aria-label="Selection">{shapes.length > 0 && <><Palette size={14}/>{COLORS.map(c => <button key={c} className={`swatch c-${c}`} aria-label={`Color ${c}`} onClick={() => shapes.forEach(s => handlers.current.saveItem({ ...s, color: c }))}/>)}<span className="palette-sep h"/><button aria-label="Format" title="Text, border, tilt, layer, lock and alignment" className={fmtOpen ? 'active' : ''} onClick={() => setFmtOpen(o => !o)}><AlignLeft size={14}/>Format</button><button aria-label="Make bigger" title="Make bigger" onClick={() => shapes.forEach(s => handlers.current.saveItem({ ...s, size: { w: Math.min(4000, Math.round(s.size.w * 1.25)), h: Math.min(4000, Math.round(s.size.h * 1.25)) } }))}><Maximize2 size={14}/></button><button aria-label="Make smaller" title="Make smaller" onClick={() => shapes.forEach(s => handlers.current.saveItem({ ...s, size: { w: Math.max(40, Math.round(s.size.w * 0.8)), h: Math.max(30, Math.round(s.size.h * 0.8)) } }))}><Minimize2 size={14}/></button><button aria-label="Duplicate" title="Duplicate" onClick={() => shapes.forEach(s => handlers.current.saveItem({ ...s, id: uid(), position: { x: s.position.x + 28, y: s.position.y + 28 } }))}><Copy size={14}/></button></>}{removable.length > 0 && <button aria-label="Delete selected" title="Delete (Del)" onClick={() => { remember(); removable.forEach(id => act({ type: 'canvas:item:delete', projectId: project.id, value: id }).catch(() => {})); }}><Trash2 size={14}/></button>}{fmtOpen && shapes.length > 0 && <FormatPanel shapes={shapes} save={saveMany}/>}</div>}
      <ReactFlow nodes={nodes} edges={displayEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultEdgeOptions={EDGE_DEFAULTS} connectionLineStyle={{stroke:edgeColor}} connectionMode={ConnectionMode.Loose} onSelectionChange={onSelection}
        panOnDrag={tool === 'hand' ? true : [1, 2]} selectionOnDrag={tool === 'select'} nodesDraggable={tool !== 'hand'} zoomOnDoubleClick={false}
        onPaneClick={e => { if (!['select', 'hand'].includes(tool)) { place(tool, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })); setTool('select'); } setMenu(''); }}
        onNodesChange={changes => { const gone = changes.filter(c => c.type === 'remove' && canvasIds.has(c.id)); if (gone.length) remember(); gone.forEach(c => act({ type: 'canvas:item:delete', projectId: project.id, value: c.id }).catch(() => {})); setNodes(ns => applyNodeChanges(changes.filter(c => c.type !== 'remove'), ns)); }}
        onMoveStart={e => { if (e) moving(true); }} onNodeDragStart={() => moving(true)} onNodeDragStop={(_, node, dragged) => { moving(false); board({ positions: (dragged?.length ? dragged : [node]).map(n => ({ id: n.id, position: n.position })) }); }}
        onConnect={connect} onConnectEnd={(event, state) => { if (tool === 'pen' || state.isValid || !state.fromNode || state.toNode) return; const p = dropPoint(event); setDrop({ ...p, fromId: state.fromNode.id, side: state.fromHandle?.id, at: flow.screenToFlowPosition(p) }); }}
        onEdgesChange={changes => { const picks = changes.filter(c => c.type === 'select'); if (picks.length) setEdges(es => applyEdgeChanges(picks, es)); const removed = changes.filter(c => c.type === 'remove').map(c => c.id); if (removed.length) { const next = edges.filter(e => !removed.includes(e.id)); setEdges(next); board({ edges: next }); } }}
        onMoveEnd={(e, viewport) => { if (e) moving(false); clearTimeout(viewportTimer.current); viewportTimer.current = setTimeout(() => board({ viewport }), 800); }} defaultViewport={project.viewport || { x: 0, y: 0, zoom: 1 }} minZoom={0.05} maxZoom={2} colorMode={theme} deleteKeyCode={diagram ? null : ['Delete', 'Backspace']} selectNodesOnDrag={false} fitView={!project.viewport} attributionPosition="bottom-center" onlyRenderVisibleElements>
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4}/><ZoomPill map={mapOn} onMap={toggleMap}/>{mapOn && !busy && <MiniMap pannable zoomable ariaLabel="Canvas overview" className="canvas-minimap" style={{ width: 160, height: 100 }} nodeColor="#c9d1e3" maskColor="rgba(238,240,245,.75)"/>}
      </ReactFlow>
      {drop && <ConnectMenu at={drop} onClose={() => setDrop(null)} onPick={type => { const { item, targetHandle } = branchItem(type, drop.at, drop.side); remember(); act({ type: 'canvas:items', projectId: project.id, value: { items: [item], edges: [{ id: uid(), source: drop.fromId, target: item.id, sourceHandle: drop.side, targetHandle, type: 'default', markerEnd: { type: 'arrowclosed' } }] } }).then(() => setTimeout(() => setNodes(ns => ns.map(n => ({ ...n, selected: n.id === item.id }))), 120)).catch(() => {}); setDrop(null); }}/>}
      {diagram && <DiagramEditor key={diagram.id} item={diagram} onSave={item => act({ type: 'canvas:item', projectId: project.id, value: item }).catch(() => {})} onClose={() => setDiagram(null)}/>}
      {!nodes.length && <div className="canvas-empty"><Network size={34}/><h3>Your canvas is empty</h3><p>Pick a shape from the left, or add a document, spreadsheet, or kanban board.</p></div>}</div>
    <div className="canvas-bottom"><span><span className="live-dot"/>All changes saved locally</span><span>{tool === 'select' ? 'Drag to select · Right-drag or Hand tool to pan · Scroll to zoom' : tool === 'hand' ? 'Drag to pan' : 'Click the canvas to place · Esc to cancel'}</span><span>{nodes.length} items</span></div></div>;
}
export default function Canvas(props) { return <ReactFlowProvider><CanvasInner {...props}/></ReactFlowProvider>; }
