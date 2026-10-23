import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useContextMenu } from './context-menu';
import { ArrowUpRight, BringToFront, ImageOff, SeparatorHorizontal, Trash2, WrapText } from 'lucide-react';
import { api } from './api';
import { uid } from './ui';
import { planFlow, makeFit } from './flow';

// Pictures at free positions on a page or document: pasted, dropped or imported, moved, resized, with text around them (flow.js).
export const ACCEPT = /^image\/(png|jpe?g|webp|gif)$/i;
export const IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif';
const MIN_SIZE = 56;
const WRAPS = [['around', WrapText, 'Text wraps around'], ['break', SeparatorHorizontal, 'Text above and below only'], ['over', BringToFront, 'In front of the text']];

const readAsDataUrl = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read that image.')); reader.readAsDataURL(file); });
const decode = src => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('That image could not be opened.')); image.src = src; });
export async function prepareImage(file) {
  let dataUrl = await readAsDataUrl(file);
  const image = await decode(dataUrl);
  let { naturalWidth: width, naturalHeight: height } = image;
  // Very large pictures are scaled down first.
  if (file.size > 4_500_000 || Math.max(width, height) > 3200) {
    const scale = Math.min(1, 2400 / Math.max(width, height)), canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    dataUrl = file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
    if (dataUrl.length > 6_000_000) dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    width = canvas.width; height = canvas.height;
  }
  return { dataUrl, width, height, name: file.name && !/^image\.\w+$/i.test(file.name) ? file.name : 'Pasted image' };
}
export async function store(projectId, prepared) {
  const out = [];
  if (!window.workspace) {
    // The browser preview has no files folder, so small pictures live in the page.
    for (const item of prepared) { if (item.dataUrl.length > 1_400_000) throw new Error('Large pictures need the desktop app.'); out.push({ src: item.dataUrl, name: item.name }); }
    return out;
  }
  for (let i = 0; i < prepared.length; i += 4) {
    const chunk = prepared.slice(i, i + 4), made = await api.attachImages(projectId, chunk.map(({ dataUrl, name }) => ({ dataUrl, name, inline: true })));
    made.forEach((file, index) => out.push({ fileId: file.id, name: file.name || chunk[index].name }));
  }
  return out;
}

// Stored and ready to place: { fileId | src, name, width, height }.
export async function ingestFiles(projectId, files) {
  const list = [...files].filter(file => ACCEPT.test(file.type)).slice(0, 12);
  if (!list.length) return [];
  const prepared = await Promise.all(list.map(prepareImage)), stored = await store(projectId, prepared);
  return stored.map((item, index) => ({ ...item, width: prepared[index].width, height: prepared[index].height }));
}

const cache = new Map();
function pictureUrl(projectId, image) {
  if (image.src) return Promise.resolve(image.src);
  const key = projectId + ':' + image.fileId;
  if (!cache.has(key)) {
    cache.set(key, api.fileImage(projectId, image.fileId).catch(error => { cache.delete(key); throw error; }));
    // Data URLs are big, so only the latest stay in memory.
    while (cache.size > 24) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}
export function usePicture(projectId, image) {
  const [state, setState] = useState({ url: image.src || null, failed: false });
  useEffect(() => {
    let live = true;
    if (image.chartId) return;
    if (image.src) { setState({ url: image.src, failed: false }); return; }
    pictureUrl(projectId, image).then(url => live && setState({ url, failed: false })).catch(() => live && setState({ url: null, failed: true }));
    return () => { live = false; };
  }, [projectId, image.src, image.fileId]);
  return state;
}

// Measured with the spacers hidden, so the plan starts from where text naturally sits.
function fontOf(el) { const s = getComputedStyle(el); return `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`; }
function runsOf(el) {
  if (el.tagName === 'TEXTAREA') return [{ text: el.value, font: fontOf(el) }];
  const out = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.nodeValue) out.push({ text: node.nodeValue, font: fontOf(node.parentElement) });
  return out;
}
function measure(root, previous) {
  // Counted from the top of the content, not the scrolled view.
  const frame = root.getBoundingClientRect(), base = { top: frame.top - root.scrollTop, left: frame.left - root.scrollLeft, width: frame.width }, blocks = [];
  const cached = previous?.width === base.width ? new Map(previous.blocks.map(b => [b.id, b])) : new Map();
  root.classList.add('flow-measuring');
  try {
    for (const row of root.querySelectorAll('[data-flow]')) {
      const rect = row.getBoundingClientRect(), id = row.dataset.blockId;
      if (row.dataset.flow !== 'text') { blocks.push({ id, solid: true, top: rect.top - base.top, height: rect.height }); continue; }
      const el = row.querySelector('[data-flow-text]'), wrap = el?.closest('.flow-wrap');
      if (!el || !wrap) { blocks.push({ id, solid: true, top: rect.top - base.top, height: rect.height }); continue; }
      const box = el.getBoundingClientRect(), style = getComputedStyle(el), px = v => parseFloat(v) || 0;
      const padLeft = px(style.paddingLeft) + px(style.borderLeftWidth), padRight = px(style.paddingRight) + px(style.borderRightWidth), padTop = px(style.paddingTop) + px(style.borderTopWidth);
      const lineHeight = px(style.lineHeight) || px(style.fontSize) * 1.4, width = box.width - padLeft - padRight;
      const stamp = el.tagName === 'TEXTAREA' ? el.value : el.innerHTML, old = cached.get(id), font = fontOf(el);
      let fit = old?.stamp === stamp && old.font === font ? old.cachedFit : null;
      const block = {
        stamp, font, get cachedFit() { return fit; },
        id, solid: false, top: rect.top - base.top, height: rect.height, wrapTop: wrap.getBoundingClientRect().top - base.top, rowsTop: box.top - base.top + padTop,
        left: box.left - base.left + padLeft, width, lineHeight, padLeft, padRight,
        get fit() { return fit ||= makeFit(runsOf(el), style.whiteSpace); },
        get naturalRows() { return this.fit.rows(width); }
      };
      blocks.push(block);
    }
  } finally { root.classList.remove('flow-measuring'); }
  return { blocks, width: base.width };
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Unchanged blocks keep the same object so they are not redrawn.
function settle(old, next) {
  const out = {}; let same = Object.keys(old).length === Object.keys(next).length;
  for (const id in next) { out[id] = old[id] && sameJson(old[id], next[id]) ? old[id] : next[id]; if (out[id] !== old[id]) same = false; }
  return same ? old : out;
}

// Pictures, the plan for the text around them, and everything you can do with them.
export function useFloatBoard({ projectId, images = [], onImages, signature = '', onError, charts }) {
  const rootRef = useRef(null), natural = useRef(null), [live, setLive] = useState(null), [selected, setSelected] = useState(null), [plan, setPlan] = useState({}), [reach, setReach] = useState(0), [column, setColumn] = useState(0);
  const latest = useRef({ images, onImages }); latest.current = { images, onImages };
  // In a narrower column pictures shrink and slide left instead of hanging out.
  const shown = useMemo(() => images.map(image => {
    const moved = live && live.id === image.id ? { ...image, ...live } : image;
    if (!column || moved.x + moved.w <= column) return moved;
    const w = Math.min(moved.w, column), h = Math.round(moved.h * (w / moved.w));
    return { ...moved, w, h, x: Math.max(0, column - w) };
  }), [images, live, column]);
  const corrections = useRef({});
  const shownRef = useRef(shown); shownRef.current = shown;
  const replan = useCallback(() => {
    if (!rootRef.current || !natural.current) return;
    const { blocks, width } = natural.current, result = planFlow(blocks, shownRef.current, width, corrections.current);
    setPlan(old => settle(old, result.plan));
  }, []);
  const remeasure = useCallback(() => {
    const root = rootRef.current; if (!root) return;
    corrections.current = {};
    natural.current = shownRef.current.length ? measure(root, natural.current) : null;
    if (!natural.current) { setPlan(old => Object.keys(old).length ? {} : old); return; }
    replan();
  }, [replan]);

  // Measure again when the text, the width or the fonts change.
  useLayoutEffect(() => { remeasure(); }, [images.length, remeasure]);
  const measuredSignature = useRef(signature);
  useEffect(() => {
    if (measuredSignature.current === signature) return;
    const timer = setTimeout(() => { measuredSignature.current = signature; remeasure(); }, 140);
    return () => clearTimeout(timer);
  }, [signature, remeasure]);
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    let frame = 0, width = root.getBoundingClientRect().width;
    setColumn(Math.round(width));
    const watch = new ResizeObserver(() => { const now = root.getBoundingClientRect().width; if (Math.abs(now - width) < 0.5) return; width = now; setColumn(Math.round(now)); cancelAnimationFrame(frame); frame = requestAnimationFrame(remeasure); });
    watch.observe(root);
    let disposed = false;
    document.fonts?.ready.then(() => { if (!disposed) { natural.current = null; remeasure(); } });
    return () => { disposed = true; watch.disconnect(); cancelAnimationFrame(frame); };
  }, [remeasure]);
  // Moving a picture re-plans from the saved measurements; dragging never touches layout.
  useLayoutEffect(() => { corrections.current = {}; replan(); setReach(Math.max(0, ...shown.map(i => i.y + i.h))); }, [shown, replan]);
  // Where a block came out taller or shorter than estimated, plan again from what the page drew.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || live || !natural.current || !shownRef.current.length) return;
    const timer = setTimeout(() => {
      let changed = false;
      // A block that cannot wrap must clear every picture; if the page left one on top of it, push it down by what is missing.
      const pictures = [...root.querySelectorAll('.float-img')].filter(el => !el.classList.contains('wrap-over')).map(el => el.getBoundingClientRect());
      for (const row of root.querySelectorAll('[data-flow=solid]')) {
        const box = row.getBoundingClientRect(), id = row.dataset.blockId;
        for (const p of pictures) if (box.bottom > p.top && box.top < p.bottom && box.height > 0 && (corrections.current[id] || 0) < 3000) { corrections.current[id] = (corrections.current[id] || 0) + Math.ceil(p.bottom + 14 - box.top); changed = true; break; }
      }
      for (const [id, entry] of Object.entries(plan)) {
        if (!entry.height) continue;
        const row = root.querySelector(`[data-block-id="${CSS.escape(id)}"]`); if (!row) continue;
        const off = Math.round(row.getBoundingClientRect().height - entry.height);
        // The correction is the gap from the estimate.
        if (Math.abs(off) > 2 && Math.abs(off) < 400 && corrections.current[id] !== off) { corrections.current[id] = off; changed = true; }
      }
      if (changed) replan();
    }, 140);
    return () => clearTimeout(timer);
  }, [plan, live, replan]);

  const commit = useCallback(next => latest.current.onImages(next), []);
  const patch = useCallback((id, values) => commit(latest.current.images.map(i => i.id === id ? { ...i, ...values } : i)), [commit]);
  const remove = useCallback(id => { commit(latest.current.images.filter(i => i.id !== id)); setSelected(null); }, [commit]);

  const addFiles = useCallback(async (files, point) => {
    const list = [...files].filter(file => ACCEPT.test(file.type)).slice(0, 12);
    if (!list.length) return false;
    try {
      const prepared = await Promise.all(list.map(prepareImage)), stored = await store(projectId, prepared), root = rootRef.current, width = root?.getBoundingClientRect().width || 700;
      const focusRow = document.activeElement?.closest?.('[data-block-id]'), base = root?.getBoundingClientRect();
      const baseY = point ? point.y : focusRow && base ? focusRow.getBoundingClientRect().top - base.top + root.scrollTop : base ? Math.max(0, -base.top) + root.scrollTop + 24 : 0;
      const made = stored.map((item, index) => {
        const ratio = prepared[index].height / prepared[index].width, w = Math.round(Math.min(prepared[index].width, Math.max(160, Math.min(340, width * 0.42)))), h = Math.round(Math.min(w * ratio, 420)), fit = Math.round(h / ratio);
        const wideW = Math.min(w, fit);
        return { id: uid(), ...item, x: Math.round(point ? Math.max(0, Math.min(width - wideW, point.x - wideW / 2)) : width - wideW), y: Math.round(Math.max(0, baseY + index * 28)), w: wideW, h: Math.round(wideW * ratio), wrap: 'around' };
      });
      commit([...latest.current.images, ...made]); setSelected(made.at(-1).id);
      return true;
    } catch (error) { onError?.(error.message || 'Could not add that picture.'); return true; }
  }, [projectId, commit, onError]);

  // A chart sits in the page like a picture: it can be moved and sized, and the text wraps round it.
  const addChart = useCallback((chartId, blockId) => {
    const root = rootRef.current, width = root?.getBoundingClientRect().width || 700, base = root?.getBoundingClientRect(), row = blockId && root?.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`);
    const w = Math.round(Math.min(width, 380)), y = row && base ? row.getBoundingClientRect().top - base.top + root.scrollTop : 0, made = { id: uid(), chartId, name: '', x: Math.round(Math.max(0, width - w)), y: Math.round(Math.max(0, y)), w, h: 270, wrap: 'around' };
    commit([...latest.current.images, made]); setSelected(made.id);
  }, [commit]);

  const rootProps = {
    ref: rootRef,
    onPasteCapture: e => { const files = [...(e.clipboardData?.files || [])].filter(f => ACCEPT.test(f.type)); if (!files.length) return; e.preventDefault(); e.stopPropagation(); addFiles(files); },
    onDragOver: e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); },
    onDrop: e => { const files = [...(e.dataTransfer?.files || [])].filter(f => ACCEPT.test(f.type)); if (!files.length) return; e.preventDefault(); const r = rootRef.current.getBoundingClientRect(); addFiles(files, { x: e.clientX - r.left + rootRef.current.scrollLeft, y: e.clientY - r.top + rootRef.current.scrollTop }); },
    onPointerDown: e => { if (!e.target.closest?.('.float-img')) setSelected(null); },
    style: { minHeight: reach ? reach + 24 : undefined }
  };
  return { rootRef, rootProps, images: shown, plan, selected, setSelected, setLive, patch, remove, commit, addFiles, addChart, charts, projectId, signature };
}

// Spacers that shorten the text beside a picture; they go just before the text.
export function FlowSlot({ plan, children }) {
  return <div className="flow-wrap">{plan?.floats?.map((f, i) => <i key={i} aria-hidden="true" className={`flow-float ${f.side}`} style={{ width: f.w, height: f.h, marginTop: f.mt }}/>)}{children}</div>;
}
export const FlowPush = ({ plan }) => plan?.push > 0 ? <div className="flow-push" aria-hidden="true" style={{ height: plan.push }}/> : null;

function Picture({ board, image }) {
  const { url, failed } = usePicture(board.projectId, image), ref = useRef(null), selected = board.selected === image.id, ctx = useContextMenu();
  const menu = e => { board.setSelected(image.id); ctx.open(e, [...(image.chartId ? [{ label: 'Open chart', icon: ArrowUpRight, onClick: () => board.charts?.open(image.chartId) }, 'separator'] : []), ...WRAPS.map(([value, Icon, label]) => ({ label, icon: Icon, onClick: () => board.patch(image.id, { wrap: value }) })), 'separator', { label: image.chartId ? 'Remove chart' : 'Delete picture', icon: Trash2, danger: true, onClick: () => board.remove(image.id) }]); };
  const column = () => ref.current.parentElement.getBoundingClientRect().width;

  function begin(event, mode, corner) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    ref.current.focus({ preventScroll: true }); board.setSelected(image.id);
    const start = { x: event.clientX, y: event.clientY }, from = { x: image.x, y: image.y, w: image.w, h: image.h }, ratio = from.h / from.w, width = column();
    let moved = false, last = null;
    const frame = { id: 0 };
    const update = e => {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      if (mode === 'move') last = { id: image.id, x: Math.round(Math.max(0, Math.min(width - from.w, from.x + dx))), y: Math.round(Math.max(0, from.y + dy)) };
      else {
        const grow = corner.includes('e') ? dx : -dx, w = Math.round(Math.max(MIN_SIZE, Math.min(width, from.w + grow))), h = Math.round(w * ratio);
        last = { id: image.id, w, h, x: Math.round(Math.max(0, Math.min(width - w, corner.includes('w') ? from.x + from.w - w : from.x))), y: Math.round(Math.max(0, corner.includes('n') ? from.y + from.h - h : from.y)) };
      }
      cancelAnimationFrame(frame.id); frame.id = requestAnimationFrame(() => board.setLive(last));
    };
    const end = () => {
      window.removeEventListener('pointermove', update); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
      cancelAnimationFrame(frame.id); document.body.classList.remove('picture-dragging');
      if (moved && last) { const { id, ...values } = last; board.patch(id, values); }
      board.setLive(null);
    };
    document.body.classList.add('picture-dragging');
    window.addEventListener('pointermove', update); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  }
  function key(e) {
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); board.remove(image.id); }
    else if (e.key === 'Escape') { board.setSelected(null); e.currentTarget.blur(); }
    else if (e.key.startsWith('Arrow')) {
      e.preventDefault(); const step = e.shiftKey ? 24 : 4, width = column();
      board.patch(image.id, { x: Math.round(Math.max(0, Math.min(width - image.w, image.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0)))), y: Math.round(Math.max(0, image.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0))) });
    }
  }
  const barBelow = image.y < 46;
  return <div ref={ref} className={`float-img wrap-${image.wrap || 'around'}${selected ? ' selected' : ''}${failed ? ' failed' : ''}`} tabIndex={0} role="img" aria-label={image.name || 'Picture'}
    style={{ left: image.x, top: image.y, width: image.w, height: image.h }} onPointerDown={e => begin(e, 'move')} onContextMenu={menu} onKeyDown={key} onFocus={() => board.setSelected(image.id)}>{ctx.element}
    {image.chartId ? <div className="float-chart">{board.charts?.render(image.chartId)}</div> : url ? <img src={url} alt={image.name || ''} draggable={false}/> : <div className="float-img-empty">{failed ? <><ImageOff size={20}/><span>Picture not found</span></> : null}</div>}
    {selected && <>
      {['nw', 'ne', 'sw', 'se'].map(corner => <span key={corner} className={`float-handle ${corner}`} onPointerDown={e => begin(e, 'resize', corner)}/>)}
      <div className={`float-bar${barBelow ? ' below' : ''}`} onPointerDown={e => e.stopPropagation()}>
        {WRAPS.map(([value, Icon, label]) => <button key={value} type="button" className={(image.wrap || 'around') === value ? 'on' : ''} aria-label={label} title={label} onClick={() => board.patch(image.id, { wrap: value })}><Icon size={15}/></button>)}
        {image.chartId && <button type="button" aria-label="Open chart" title="Open chart" onClick={() => board.charts?.open(image.chartId)}><ArrowUpRight size={15}/></button>}
        <span className="float-bar-sep"/>
        <button type="button" aria-label="Remove picture" title="Remove picture (Delete)" onClick={() => board.remove(image.id)}><Trash2 size={15}/></button>
      </div>
    </>}
  </div>;
}
export function ImageLayer({ board }) {
  return <div className="float-layer" aria-label="Pictures">{board.images.map(image => <Picture key={image.id} board={board} image={image}/>)}</div>;
}

// A hidden picker for adding pictures from disk.
export function useImagePicker(board) {
  const input = useRef(null);
  const element = <input ref={input} type="file" accept={IMAGE_TYPES} multiple hidden aria-label="Choose pictures" onChange={e => { board.addFiles(e.target.files); e.target.value = ''; }}/>;
  return { element, open: () => input.current?.click() };
}
