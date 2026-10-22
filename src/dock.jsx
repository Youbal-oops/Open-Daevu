import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, PanelLeft, PanelRight } from 'lucide-react';

// The project list and the chat can sit on either edge and take any width.
const KEY = 'rw-dock-v1';
export const LIMITS = { sidebar: [188, 440, 238], chat: [300, 900, 360] };
const DEFAULT = { sidebarSide: 'left', chatSide: 'right', sidebarW: null, chatW: null };

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      sidebarSide: stored.sidebarSide === 'right' ? 'right' : 'left',
      chatSide: stored.chatSide === 'left' ? 'left' : 'right',
      sidebarW: Number.isFinite(stored.sidebarW) ? stored.sidebarW : null,
      chatW: Number.isFinite(stored.chatW) ? stored.chatW : null
    };
  } catch { return { ...DEFAULT }; }
}
const clamp = (panel, value, room = Infinity) => Math.round(Math.max(LIMITS[panel][0], Math.min(LIMITS[panel][1], room, value)));

const DockContext = createContext(null);
export const useDock = () => useContext(DockContext) || { dock: DEFAULT, setSide() {}, setWidth() {}, resetWidth() {}, swap() {}, beginDrag() {}, dragging: null };

// Keeps the layout choice, sets the sizes, and shows where a dragged column will land.
export function DockProvider({ children }) {
  const [dock, setDock] = useState(load), [dragging, setDragging] = useState(null);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(dock)); } catch {} }, [dock]);
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--agent-panel-width', clamp('chat', dock.chatW ?? LIMITS.chat[2]) + 'px');
    root.setProperty('--sidebar-w', clamp('sidebar', dock.sidebarW ?? LIMITS.sidebar[2]) + 'px');
  }, [dock.chatW, dock.sidebarW]);
  const setSide = useCallback((panel, side) => setDock(d => ({ ...d, [panel + 'Side']: side })), []);
  const setWidth = useCallback((panel, width) => setDock(d => ({ ...d, [panel + 'W']: clamp(panel, width, Math.max(LIMITS[panel][0], window.innerWidth - 520)) })), []);
  const resetWidth = useCallback(panel => setDock(d => ({ ...d, [panel + 'W']: null })), []);
  const swap = useCallback(() => setDock(d => ({ ...d, sidebarSide: d.chatSide, chatSide: d.sidebarSide })), []);
  const beginDrag = useCallback((panel, event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY }; let live = false, side = null;
    const move = e => {
      if (!live && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
      live = true; side = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
      document.body.classList.add('dock-dragging');
      setDragging({ panel, side, x: e.clientX, y: e.clientY });
    };
    const stop = e => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); window.removeEventListener('keydown', key);
      document.body.classList.remove('dock-dragging'); setDragging(null);
      if (live && side && e.type === 'pointerup') setSide(panel, side);
    };
    const key = e => { if (e.key === 'Escape') { live = false; stop({ type: 'cancel' }); } };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); window.addEventListener('keydown', key);
  }, [setSide]);
  const value = useMemo(() => ({ dock, setSide, setWidth, resetWidth, swap, beginDrag, dragging }), [dock, dragging, setSide, setWidth, resetWidth, swap, beginDrag]);
  return <DockContext.Provider value={value}>{children}{dragging && createPortal(<DropZones dragging={dragging} dock={dock}/>, document.body)}</DockContext.Provider>;
}

function DropZones({ dragging, dock }) {
  const label = dragging.panel === 'chat' ? 'Chat' : 'Projects';
  const width = dragging.panel === 'chat' ? dock.chatW ?? LIMITS.chat[2] : dock.sidebarW ?? LIMITS.sidebar[2];
  return <div className="dock-overlay" aria-hidden="true">
    {['left', 'right'].map(side => <div key={side} className={`dock-zone ${side} ${dragging.side === side ? 'hot' : ''}`}><div className="dock-slab" style={{ width }}><span>{label}</span></div></div>)}
    <div className="dock-ghost" style={{ left: dragging.x, top: dragging.y }}>{label}</div>
  </div>;
}

// A grip to drag a column by, and a button that sends it to the other edge.
export function DockControls({ panel, className = '' }) {
  const { dock, setSide, beginDrag } = useDock();
  const side = dock[panel + 'Side'], other = side === 'left' ? 'right' : 'left', Icon = other === 'left' ? PanelLeft : PanelRight;
  const name = panel === 'chat' ? 'chat' : 'project list';
  return <span className={`dock-controls ${className}`}>
    <button type="button" className="dock-grip" aria-label={`Drag the ${name} to the left or right edge`} title={`Drag to move the ${name}`} onPointerDown={e => beginDrag(panel, e)}><GripVertical size={14}/></button>
    <button type="button" className="dock-flip" aria-label={`Move the ${name} to the ${other}`} title={`Move to the ${other}`} onClick={() => setSide(panel, other)}><Icon size={14}/></button>
  </span>;
}

// The edge you drag to resize a column; arrow keys work, double-click resets.
export function ResizeEdge({ panel }) {
  const { dock, setWidth, resetWidth } = useDock(), ref = useRef(null);
  const side = dock[panel + 'Side'], current = dock[panel + 'W'] ?? LIMITS[panel][2];
  const inner = side === 'left' ? 'right' : 'left';
  const begin = event => {
    event.preventDefault();
    const startX = event.clientX, startW = ref.current.parentElement.getBoundingClientRect().width, sign = side === 'left' ? 1 : -1;
    document.body.classList.add('dock-resizing');
    // Pulled well past its narrowest width, a column folds away (App listens for rw-collapse).
    let folded = false;
    const move = e => {
      if (folded) return;
      const wanted = startW + (e.clientX - startX) * sign;
      if (wanted < LIMITS[panel][0] - 70) { folded = true; stop(); window.dispatchEvent(new CustomEvent('rw-collapse', { detail: panel })); return; }
      setWidth(panel, wanted);
    };
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); document.body.classList.remove('dock-resizing'); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop);
  };
  return <div ref={ref} className={`resize-edge ${inner}`} role="separator" aria-orientation="vertical" aria-label={`Resize the ${panel === 'chat' ? 'chat' : 'project list'}`} aria-valuemin={LIMITS[panel][0]} aria-valuemax={LIMITS[panel][1]} aria-valuenow={Math.round(current)} tabIndex={0} title="Drag to resize · double-click to reset"
    onPointerDown={begin} onDoubleClick={() => resetWidth(panel)}
    onKeyDown={e => { const step = e.shiftKey ? 48 : 16, grow = (e.key === 'ArrowRight') === (side === 'left'); if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setWidth(panel, current + (grow ? step : -step)); } }}/>;
}
