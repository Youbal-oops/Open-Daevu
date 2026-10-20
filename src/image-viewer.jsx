import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Hand, PenLine, Highlighter, Type, Eraser, Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Crop, Trash2, Download, ExternalLink, Check, AlertCircle } from 'lucide-react';
import { api } from './api';
import { uid } from './ui';

// Opens an uploaded image inside the app. Marker strokes and text notes are kept as light vector data beside the file
// (project.files[].annotations), drawn over the picture. The image itself is never changed and no copy is made;
// "Export" is the only thing that writes pixels, and only when you ask for it.
const COLORS = ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#38bdf8', '#a78bfa', '#ffffff', '#111111'];
const TOOLS = [['move', 'Move and pan (V)', Hand], ['pen', 'Marker (P)', PenLine], ['highlight', 'Highlighter (H)', Highlighter], ['text', 'Text (T)', Type], ['erase', 'Eraser (E)', Eraser], ['crop', 'Crop (C)', Crop]];
const EMPTY = { strokes: [], texts: [] };
const round = n => Math.round(n * 10) / 10;
const points = d => d.split(' ').filter(Boolean).map(pair => pair.split(',').map(Number));
function pathOf(d) {
  const pts = points(d);
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0][0]} ${pts[0][1]} l.01 0`;
  let out = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) out += ` Q${pts[i][0]} ${pts[i][1]} ${(pts[i][0] + pts[i + 1][0]) / 2} ${(pts[i][1] + pts[i + 1][1]) / 2}`;
  return out + ` L${pts.at(-1)[0]} ${pts.at(-1)[1]}`;
}
const fromFile = file => file.annotations ? { strokes: file.annotations.strokes || [], texts: file.annotations.texts || [], ...(file.annotations.crop ? { crop: file.annotations.crop } : {}) } : EMPTY;
// Dragging a crop rectangle (all numbers are in the picture's own pixels).
function dragCrop(g, x, y, W, H) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), MIN = 16, f = g.from;
  if (g.mode === 'new') { const x0 = clamp(g.ox, 0, W), y0 = clamp(g.oy, 0, H), x1 = clamp(x, 0, W), y1 = clamp(y, 0, H); return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.max(MIN, Math.abs(x1 - x0)), h: Math.max(MIN, Math.abs(y1 - y0)) }; }
  const dx = x - g.ox, dy = y - g.oy;
  if (g.mode === 'move') return { ...f, x: clamp(f.x + dx, 0, W - f.w), y: clamp(f.y + dy, 0, H - f.h) };
  let l = f.x, t = f.y, r = f.x + f.w, b = f.y + f.h;
  if (g.mode.includes('w')) l = clamp(l + dx, 0, r - MIN);
  if (g.mode.includes('e')) r = clamp(r + dx, l + MIN, W);
  if (g.mode.includes('n')) t = clamp(t + dy, 0, b - MIN);
  if (g.mode.includes('s')) b = clamp(b + dy, t + MIN, H);
  return { x: l, y: t, w: r - l, h: b - t };
}

export function ImageViewer({ project, file, act, onExternal }) {
  const [src, setSrc] = useState(null), [error, setError] = useState(''), [size, setSize] = useState(null), [status, setStatus] = useState('saved');
  const [ann, setAnn] = useState(() => fromFile(file)), [past, setPast] = useState([]), [future, setFuture] = useState([]);
  const [tool, setTool] = useState('move'), [color, setColor] = useState(COLORS[0]), [width, setWidth] = useState(0), [textSize, setTextSize] = useState(0);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 }), [draft, setDraft] = useState(null), [editing, setEditing] = useState(null), [selected, setSelected] = useState(null);
  const [cropDraft, setCropDraft] = useState(null), cropRef = useRef(null), inner = useRef(null);
  const setCrop = r => { cropRef.current = r; setCropDraft(r); };
  const stage = useRef(null), canvas = useRef(null), photo = useRef(null), annRef = useRef(ann), dirty = useRef(false), version = useRef(0), lastSaved = useRef(file.annotatedAt || ''), gesture = useRef(null), fitted = useRef(true), viewRef = useRef(view), draftRef = useRef(null);
  viewRef.current = view;
  const w = size?.w || 1200, h = size?.h || 800;
  // While cropping you see the whole picture; otherwise only the kept part.
  const shownCrop = tool === 'crop' ? null : ann.crop, vw = shownCrop?.w || w, vh = shownCrop?.h || h, vx = shownCrop?.x || 0, vy = shownCrop?.y || 0;

  useEffect(() => {
    let alive = true;
    setSrc(null); setError('');
    api.fileImage(project.id, file.id).then(url => alive && setSrc(url)).catch(e => alive && setError(e.message));
    return () => { alive = false; };
  }, [project.id, file.id]);

  const fit = useCallback(() => {
    const box = stage.current?.getBoundingClientRect();
    if (!box || !size) return;
    const cw = shownCrop?.w || size.w, ch = shownCrop?.h || size.h, s = Math.min((box.width - 56) / cw, (box.height - 56) / ch, 1);
    fitted.current = true;
    setView({ s, x: (box.width - cw * s) / 2, y: (box.height - ch * s) / 2 });
  }, [size, shownCrop?.x, shownCrop?.y, shownCrop?.w, shownCrop?.h]);
  useEffect(() => { if (tool === 'crop') setCrop(annRef.current.crop || { x: 0, y: 0, w, h }); else setCrop(null); }, [tool]);
  useLayoutEffect(() => { fit(); }, [fit]);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(() => { if (fitted.current) fit(); });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [fit]);
  useEffect(() => { if (size && !width) { const edge = Math.max(size.w, size.h); setWidth(Math.max(3, Math.round(edge / 220))); setTextSize(Math.max(16, Math.round(edge / 38))); } }, [size, width]);

  const zoomAt = useCallback((factor, cx, cy) => {
    fitted.current = false;
    setView(v => { const s = Math.min(16, Math.max(.05, v.s * factor)), k = s / v.s; return { s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }; });
  }, []);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = e => { e.preventDefault(); const box = el.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - box.left, e.clientY - box.top); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  // Saving: the local copy is the truth while editing; a save only marks things clean if nothing changed meanwhile.
  const save = useCallback(async () => {
    if (!dirty.current) return;
    const sent = version.current;
    setStatus('saving');
    try {
      const next = await act({ type: 'file:annotate', projectId: project.id, value: { id: file.id, annotations: annRef.current } });
      const saved = next?.projects?.find(p => p.id === project.id)?.files.find(f => f.id === file.id);
      if (saved?.annotatedAt) lastSaved.current = saved.annotatedAt;
      if (version.current === sent) { dirty.current = false; setStatus('saved'); }
    } catch (e) { setStatus('error'); setError(e.message); }
  }, [act, project.id, file.id]);
  useEffect(() => { if (!dirty.current) return; const timer = setTimeout(save, 900); return () => clearTimeout(timer); }, [ann, save]);
  useEffect(() => () => { if (dirty.current) act({ type: 'file:annotate', projectId: project.id, value: { id: file.id, annotations: annRef.current } }).catch(() => {}); }, []);
  useEffect(() => { if (!dirty.current && (file.annotatedAt || '') > lastSaved.current) { lastSaved.current = file.annotatedAt; annRef.current = fromFile(file); setAnn(annRef.current); } }, [file.annotatedAt]);

  const edited = () => { dirty.current = true; version.current++; setStatus('unsaved'); };
  const commit = update => {
    const before = annRef.current, next = update(before);
    setPast(p => [...p.slice(-99), before]); setFuture([]);
    annRef.current = next; setAnn(next); edited();
  };
  const patchText = (id, values) => { const next = { ...annRef.current, texts: annRef.current.texts.map(t => t.id === id ? { ...t, ...values } : t) }; annRef.current = next; setAnn(next); edited(); };
  const undo = () => { if (!past.length) return; const prev = past.at(-1), current = annRef.current; setPast(p => p.slice(0, -1)); setFuture(f => [current, ...f]); annRef.current = prev; setAnn(prev); edited(); };
  const redo = () => { if (!future.length) return; const next = future[0], current = annRef.current; setFuture(f => f.slice(1)); setPast(p => [...p, current]); annRef.current = next; setAnn(next); edited(); };

  const toImage = e => { const box = inner.current.getBoundingClientRect(); return [(e.clientX - box.left) / (box.width / w), (e.clientY - box.top) / (box.height / h)]; };
  const capture = e => { try { stage.current.setPointerCapture(e.pointerId); } catch {} };
  function down(e) {
    if (e.button === 2 || !canvas.current) return;
    const onText = e.target.closest?.('.iv-text');
    if (e.button === 1 || (tool === 'move' && !onText)) { capture(e); gesture.current = { type: 'pan', x: e.clientX, y: e.clientY, from: viewRef.current }; fitted.current = false; setSelected(null); return; }
    if (tool === 'crop') {
      const mode = e.target.closest?.('[data-crop]')?.dataset.crop, [cx, cy] = toImage(e), from = cropRef.current || { x: 0, y: 0, w, h };
      capture(e); gesture.current = { type: 'crop', mode: mode || 'new', ox: cx, oy: cy, from };
      return;
    }
    if (onText) {
      const id = onText.dataset.id;
      if (tool === 'erase') { commit(a => ({ ...a, texts: a.texts.filter(t => t.id !== id) })); return; }
      if (editing === id) return;
      setSelected(id); capture(e);
      const text = annRef.current.texts.find(t => t.id === id), [px, py] = toImage(e);
      gesture.current = { type: 'text', id, dx: px - text.x, dy: py - text.y, moved: false, snapshot: annRef.current };
      return;
    }
    const [x, y] = toImage(e);
    if (tool === 'pen' || tool === 'highlight') { capture(e); gesture.current = { type: 'draw' }; draftRef.current = { t: tool === 'pen' ? 'pen' : 'highlight', c: color, w: tool === 'pen' ? width : width * 3, pts: [[x, y]] }; setDraft(draftRef.current); setSelected(null); return; }
    if (tool === 'text') {
      const id = uid();
      commit(a => ({ ...a, texts: [...a.texts, { id, x: round(x), y: round(y), s: textSize, c: color, v: '' }] }));
      setEditing(id); setSelected(id);
    }
  }
  function move(e) {
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'crop') { const [cx, cy] = toImage(e); setCrop(dragCrop(g, cx, cy, w, h)); }
    else if (g.type === 'pan') setView({ ...g.from, x: g.from.x + e.clientX - g.x, y: g.from.y + e.clientY - g.y });
    else if (g.type === 'draw') { const [x, y] = toImage(e), d = draftRef.current; if (d && Math.hypot(x - d.pts.at(-1)[0], y - d.pts.at(-1)[1]) * viewRef.current.s >= 1.5) { draftRef.current = { ...d, pts: [...d.pts, [x, y]] }; setDraft(draftRef.current); } }
    else if (g.type === 'text') {
      const [x, y] = toImage(e), text = annRef.current.texts.find(t => t.id === g.id);
      if (!g.moved && Math.hypot(x - g.dx - text.x, y - g.dy - text.y) * viewRef.current.s < 3) return;
      g.moved = true; patchText(g.id, { x: round(x - g.dx), y: round(y - g.dy) });
    }
  }
  function up() {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.type === 'draw') {
      const d = draftRef.current;
      draftRef.current = null; setDraft(null);
      if (d) { const stroke = { id: uid(), t: d.t, c: d.c, w: d.w, d: d.pts.map(p => `${round(p[0])},${round(p[1])}`).join(' ') }; commit(a => ({ ...a, strokes: [...a.strokes, stroke] })); }
    } else if (g.type === 'text') {
      if (g.moved) { setPast(p => [...p.slice(-99), g.snapshot]); setFuture([]); }
      else if (tool === 'text' || tool === 'move') setEditing(g.id);
    }
  }
  const applyCrop = () => {
    const c = cropRef.current;
    if (!c) return;
    const full = c.x <= 0 && c.y <= 0 && c.w >= w && c.h >= h, next = full ? null : { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h) };
    commit(a => { const { crop, ...rest } = a; return next ? { ...rest, crop: next } : rest; });
    setTool('move');
  };
  const resetCrop = () => { commit(a => { const { crop, ...rest } = a; return rest; }); setTool('move'); };
  const eraseStroke = id => commit(a => ({ ...a, strokes: a.strokes.filter(s => s.id !== id) }));
  const finishText = (id, value) => { setEditing(null); if (!value.trim()) commit(a => ({ ...a, texts: a.texts.filter(t => t.id !== id) })); };

  function keys(e) {
    if (e.target.closest('textarea, input')) return;
    const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && key === 'y') { e.preventDefault(); redo(); }
    else if (mod && key === 's') { e.preventDefault(); save(); }
    else if ((key === 'delete' || key === 'backspace') && selected) { commit(a => ({ ...a, texts: a.texts.filter(t => t.id !== selected) })); setSelected(null); }
    else if (tool === 'crop' && key === 'enter') { e.preventDefault(); applyCrop(); }
    else if (tool === 'crop' && key === 'escape') setTool('move');
    else if (!mod && { v: 'move', p: 'pen', h: 'highlight', t: 'text', e: 'erase', c: 'crop' }[key]) setTool({ v: 'move', p: 'pen', h: 'highlight', t: 'text', e: 'erase', c: 'crop' }[key]);
    else if (!mod && (key === '+' || key === '=')) zoomAt(1.2, stage.current.clientWidth / 2, stage.current.clientHeight / 2);
    else if (!mod && key === '-') zoomAt(1 / 1.2, stage.current.clientWidth / 2, stage.current.clientHeight / 2);
    else if (!mod && key === '0') fit();
  }

  async function exportPng() {
    const image = photo.current;
    if (!image) return;
    const surface = document.createElement('canvas');
    const keep = ann.crop || { x: 0, y: 0, w, h };
    surface.width = keep.w; surface.height = keep.h;
    const g = surface.getContext('2d');
    g.translate(-keep.x, -keep.y);
    g.drawImage(image, 0, 0, w, h);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const stroke of ann.strokes) { g.globalAlpha = stroke.t === 'highlight' ? .4 : 1; g.strokeStyle = stroke.c; g.lineWidth = stroke.w; g.stroke(new Path2D(pathOf(stroke.d))); }
    g.globalAlpha = 1; g.textBaseline = 'top';
    for (const text of ann.texts) { g.font = `600 ${text.s}px Inter, system-ui, sans-serif`; g.fillStyle = text.c; text.v.split('\n').forEach((line, i) => g.fillText(line, text.x, text.y + i * text.s * 1.25)); }
    const blob = await new Promise(resolve => surface.toBlob(resolve, 'image/png'));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = file.name.replace(/\.[^.]+$/, '') + ' (annotated).png';
    link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }

  const cursor = tool === 'move' ? 'grab' : tool === 'text' ? 'text' : tool === 'erase' ? 'cell' : 'crosshair';
  const count = ann.strokes.length + ann.texts.length;
  return <div className="editor-page image-viewer" tabIndex={0} onKeyDown={keys} aria-label={`Image ${file.name}`}>
    <div className="iv-toolbar">
      <div className="segmented" role="group" aria-label="Tools">{TOOLS.map(([id, label, Icon]) => <button key={id} className={tool === id ? 'active' : ''} aria-pressed={tool === id} title={label} aria-label={label} onClick={() => setTool(id)}><Icon size={15}/></button>)}</div>
      <div className="iv-colors" role="group" aria-label="Colour">{COLORS.map(c => <button key={c} className={color === c ? 'on' : ''} style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}/>)}</div>
      {(tool === 'pen' || tool === 'highlight') && <label className="iv-size" title="Marker size">Size<input type="range" min="1" max={Math.max(40, Math.round(Math.max(w, h) / 40))} value={width} onChange={e => setWidth(Number(e.target.value))}/></label>}
      {tool === 'text' && <label className="iv-size" title="Text size">Text<input type="range" min="10" max={Math.max(120, Math.round(Math.max(w, h) / 8))} value={textSize} onChange={e => setTextSize(Number(e.target.value))}/></label>}
      {tool === 'crop' && <><button className="button primary small-button" onClick={applyCrop}>Apply crop</button><button className="button secondary small-button" onClick={() => setTool('move')}>Cancel</button>{ann.crop && <button className="button secondary small-button" onClick={resetCrop}>Reset crop</button>}</>}
      <span className="iv-gap"/>
      <button className="icon-button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!past.length} onClick={undo}><Undo2 size={16}/></button>
      <button className="icon-button" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!future.length} onClick={redo}><Redo2 size={16}/></button>
      <button className="icon-button" aria-label="Clear all marks" title="Clear all marks" disabled={!count} onClick={() => commit(a => ({ ...a, strokes: [], texts: [] }))}><Trash2 size={16}/></button>
      <span className="iv-sep"/>
      <button className="icon-button" aria-label="Zoom out" title="Zoom out (-)" onClick={() => zoomAt(1 / 1.2, stage.current.clientWidth / 2, stage.current.clientHeight / 2)}><ZoomOut size={16}/></button>
      <button className="iv-zoom" title="Zoom to 100%" onClick={() => { const box = stage.current.getBoundingClientRect(); zoomAt(1 / viewRef.current.s, box.width / 2, box.height / 2); }}>{Math.round(view.s * 100)}%</button>
      <button className="icon-button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomAt(1.2, stage.current.clientWidth / 2, stage.current.clientHeight / 2)}><ZoomIn size={16}/></button>
      <button className="icon-button" aria-label="Fit to window" title="Fit to window (0)" onClick={fit}><Maximize size={16}/></button>
      <span className="iv-sep"/>
      <span className={`iv-status ${status}`} role="status">{status === 'saving' ? 'Saving…' : status === 'unsaved' ? 'Unsaved' : status === 'error' ? <><AlertCircle size={12}/>Not saved</> : <><Check size={12}/>{count ? 'Marks saved' : 'No marks'}</>}</span>
      <button className="icon-button" aria-label="Export a copy with the marks" title="Export a copy with the marks (the original stays untouched)" onClick={exportPng}><Download size={16}/></button>
      <button className="icon-button" aria-label="Open in your image app" title="Open in your image app" onClick={onExternal}><ExternalLink size={16}/></button>
    </div>
    <div className="iv-stage" ref={stage} data-tool={tool} style={{ cursor }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onContextMenu={e => e.preventDefault()}>
      {error && <p className="iv-error">{error}</p>}
      {!src && !error && <p className="iv-loading">Opening {file.name}…</p>}
      {src && <div className="iv-canvas" ref={canvas} style={{ width: vw, height: vh, overflow: 'hidden', transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}><div ref={inner} className="iv-inner" style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transform: `translate(${-vx}px, ${-vy}px)` }}>
        <img ref={photo} src={src} alt={file.name} draggable={false} width={w} height={h} onLoad={e => setSize({ w: e.target.naturalWidth || 1200, h: e.target.naturalHeight || 800 })}/>
        <svg className="iv-marks" viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
          {ann.strokes.map(s => <g key={s.id} opacity={s.t === 'highlight' ? .4 : 1}><path d={pathOf(s.d)} fill="none" stroke={s.c} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round"/>{tool === 'erase' && <path d={pathOf(s.d)} fill="none" stroke="transparent" strokeWidth={Math.max(s.w, 28 / view.s)} strokeLinecap="round" style={{ pointerEvents: 'stroke' }} onPointerDown={() => eraseStroke(s.id)} onPointerEnter={e => { if (e.buttons === 1) eraseStroke(s.id); }}/>}</g>)}
          {draft && <path d={pathOf(draft.pts.map(p => `${round(p[0])},${round(p[1])}`).join(' '))} fill="none" stroke={draft.c} strokeWidth={draft.w} strokeLinecap="round" strokeLinejoin="round" opacity={draft.t === 'highlight' ? .4 : 1}/>}
        </svg>
        {ann.texts.map(t => editing === t.id
          ? <textarea key={t.id} className="iv-text editing" data-id={t.id} autoFocus value={t.v} style={{ left: t.x, top: t.y, fontSize: t.s, color: t.c }} onChange={e => patchText(t.id, { v: e.target.value })} onBlur={e => finishText(t.id, e.target.value)} onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.blur(); e.stopPropagation(); }} onPointerDown={e => e.stopPropagation()} placeholder="Type…"/>
          : <div key={t.id} className={`iv-text ${selected === t.id ? 'selected' : ''}`} data-id={t.id} style={{ left: t.x, top: t.y, fontSize: t.s, color: t.c }} onDoubleClick={() => setEditing(t.id)}>{t.v}</div>)}
        {tool === 'crop' && cropDraft && <div className="iv-crop" data-crop="move" style={{ left: cropDraft.x, top: cropDraft.y, width: cropDraft.w, height: cropDraft.h, boxShadow: `0 0 0 ${Math.max(w, h) * 2}px rgba(0,0,0,.55)`, '--k': 1 / view.s }}>{['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(m => <i key={m} data-crop={m} className={`iv-crop-h h-${m}`}/>)}</div>}
      </div></div>}
    </div>
  </div>;
}
