import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './context-menu.css';

// A Windows-style right-click menu. Items: { label, icon, hint, onClick, danger, disabled } or 'separator'.
export function useContextMenu() {
  const [menu, setMenu] = useState(null);
  const open = useCallback((event, items) => { event.preventDefault(); event.stopPropagation(); setMenu({ x: event.clientX, y: event.clientY, items }); }, []);
  const close = useCallback(() => setMenu(null), []);
  // Drawn on the page itself so a clipped or transformed parent (the sidebar, for one) can never cut the menu off.
  return { open, element: menu ? createPortal(<ContextMenu {...menu} onClose={close}/>, document.body) : null };
}
export function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null), [at, setAt] = useState({ x, y });
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (box) setAt({ x: Math.max(6, Math.min(x, window.innerWidth - box.width - 6)), y: Math.max(6, Math.min(y, window.innerHeight - box.height - 6)) });
    ref.current?.querySelector('button:not(:disabled)')?.focus();
  }, [x, y]);
  useEffect(() => {
    const away = e => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = e => {
      if (e.key === 'Escape') { onClose(); return; }
      if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      const buttons = [...ref.current.querySelectorAll('button:not(:disabled)')], at = buttons.indexOf(document.activeElement);
      buttons[(at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    };
    window.addEventListener('pointerdown', away, true); window.addEventListener('contextmenu', away, true); window.addEventListener('keydown', key); window.addEventListener('blur', onClose); window.addEventListener('resize', onClose); window.addEventListener('wheel', onClose, { passive: true });
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('contextmenu', away, true); window.removeEventListener('keydown', key); window.removeEventListener('blur', onClose); window.removeEventListener('resize', onClose); window.removeEventListener('wheel', onClose); };
  }, [onClose]);
  return <div ref={ref} className="context-menu" role="menu" style={{ left: at.x, top: at.y }} onContextMenu={e => e.preventDefault()}>
    {items.filter(Boolean).map((item, i) => item === 'separator' ? <div key={i} className="context-sep" role="separator"/> : <button key={i} role="menuitem" disabled={item.disabled} className={item.danger ? 'danger' : ''} onClick={() => { onClose(); item.onClick?.(); }}>{item.icon ? <item.icon size={15}/> : <span className="context-gap"/>}<span>{item.label}</span>{item.hint && <kbd>{item.hint}</kbd>}</button>)}
  </div>;
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); } catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
}
