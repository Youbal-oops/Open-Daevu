import { useCallback, useEffect, useRef, useState } from 'react';

const shape = v => v.blocks.map(b => b.id + b.type + (b.indent || 0) + (b.checked ? 1 : 0)).join('|') + JSON.stringify(v.images || []);

// Undo and redo for a page or document: value is { blocks, images }, apply puts an earlier one back.
// Typing in the same block is grouped, so one step undoes a burst rather than a single letter.
export function useHistory(value, apply, rootRef) {
  const [, bump] = useState(0), past = useRef([]), future = useRef([]), prev = useRef(value), last = useRef({ at: 0, typing: false }), restoring = useRef(false), latest = useRef(apply);
  latest.current = apply;
  useEffect(() => {
    if (restoring.current) { restoring.current = false; prev.current = value; return; }
    if (value === prev.current) return;
    const typing = shape(prev.current) === shape(value), now = Date.now();
    if (!(typing && last.current.typing && now - last.current.at < 1000)) { past.current.push(prev.current); if (past.current.length > 100) past.current.shift(); }
    future.current = []; last.current = { at: now, typing }; prev.current = value; bump(n => n + 1);
  }, [value]);
  const step = useCallback((from, to) => {
    const next = from.current.pop();
    if (!next) return false;
    to.current.push(prev.current);
    restoring.current = true; last.current = { at: 0, typing: false };
    const before = prev.current; prev.current = next;
    latest.current(next, before); bump(n => n + 1);
    return true;
  }, []);
  const undo = useCallback(() => step(past, future), [step]);
  const redo = useCallback(() => step(future, past), [step]);
  // Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z, wherever focus is inside the page or document.
  const onKeyDown = useCallback(e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { if (undo() || true) e.preventDefault(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { if (redo() || true) e.preventDefault(); }
  }, [undo, redo]);
  // After a menu or dialog closes focus lands on the page body, so the shortcuts also work from there.
  useEffect(() => {
    const key = e => {
      const root = rootRef?.current, active = document.activeElement;
      if (e.defaultPrevented || !root || root.contains(e.target) || (active && active !== document.body && !root.contains(active)) || document.querySelector('.modal-backdrop, .context-menu')) return;
      onKeyDown(e);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onKeyDown, rootRef]);
  return { undo, redo, onKeyDown, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
// The first block whose text differs, so focus can go back to where the change was.
export const changedBlock = (a, b) => b.blocks.find((x, i) => a.blocks[i] && a.blocks[i].id === x.id && a.blocks[i].text !== x.text)?.id || null;
