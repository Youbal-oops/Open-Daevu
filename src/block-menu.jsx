import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Smile, Type, Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, Quote, Lightbulb, Copy, Trash2, LayoutDashboard } from 'lucide-react';
import { EmojiPicker } from './emoji-picker';

const TURNS = [['p', 'Text', Type], ['h1', 'Heading 1', Heading1], ['h2', 'Heading 2', Heading2], ['h3', 'Heading 3', Heading3], ['bullet', 'Bulleted list', List], ['numbered', 'Numbered list', ListOrdered], ['todo', 'To-do', CheckSquare], ['quote', 'Quote', Quote], ['callout', 'Callout', Lightbulb]];

// Right-click menu for a line of text: emoji, change what kind of block it is, copy it, remove it.
export function blockMenuItems({ block, x, y, onEmoji, onBoard, onTurn, onDuplicate, onDelete }) {
  return [
    { label: 'Emoji…', icon: Smile, onClick: () => onEmoji(x, y) },
    ...(onBoard ? [{ label: 'Insert board…', icon: LayoutDashboard, onClick: onBoard }] : []),
    'separator',
    ...TURNS.filter(([type]) => type !== block.type).map(([type, label, Icon]) => ({ label: `Turn into ${label.toLowerCase()}`, icon: Icon, onClick: () => onTurn(type) })),
    'separator',
    { label: 'Duplicate', icon: Copy, onClick: onDuplicate },
    { label: 'Delete', icon: Trash2, danger: true, onClick: onDelete }
  ];
}

// The emoji picker, floating where the menu was opened.
export function EmojiPopup({ x, y, onPick, onClose }) {
  const ref = useRef(null), [at, setAt] = useState({ x, y });
  useLayoutEffect(() => { const box = ref.current?.getBoundingClientRect(); if (box) setAt({ x: Math.max(8, Math.min(x, window.innerWidth - box.width - 8)), y: Math.max(8, Math.min(y, window.innerHeight - box.height - 8)) }); }, [x, y]);
  useEffect(() => {
    const away = e => { if (!ref.current?.contains(e.target)) onClose(); }, key = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', away, true); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', key); };
  }, [onClose]);
  return createPortal(<div ref={ref} className="popover emoji-pop emoji-floating" style={{ left: at.x, top: at.y }} onMouseDown={e => e.preventDefault()}><EmojiPicker onPick={i => { onPick(i); onClose(); }}/></div>, document.body);
}
