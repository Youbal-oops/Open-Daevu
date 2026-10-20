import React, { useEffect, useState } from 'react';
import { Bold, Italic, AlignLeft, AlignCenter, AlignRight, Lock, Unlock, ArrowUpToLine, ArrowDownToLine, RotateCw, RotateCcw, AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignHorizontalSpaceBetween, AlignVerticalSpaceBetween } from 'lucide-react';

const TEXT_COLORS = ['#1a1a1a', '#ffffff', '#d93a3a', '#2f6fed', '#1f9d55', '#f08c00'];
const LINE_COLORS = ['#1a1a1a', '#ffffff', '#d93a3a', '#2f6fed', '#1f9d55', '#f08c00'];
const NO_TEXT = ['frame', 'draw', 'link'];
const bounds = list => ({ l: Math.min(...list.map(s => s.position.x)), r: Math.max(...list.map(s => s.position.x + s.size.w)), t: Math.min(...list.map(s => s.position.y)), b: Math.max(...list.map(s => s.position.y + s.size.h)) });
const move = (s, x, y) => ({ ...s, position: { x: Math.round(x), y: Math.round(y) } });

// Text, border, tilt, stacking, lock and alignment for the selected blocks. `save` writes all of them in one step.
export function FormatPanel({ shapes, save }) {
  const texty = shapes.filter(s => !NO_TEXT.includes(s.type)), first = texty[0];
  const size = s => s.fs || (s.type === 'text' ? 20 : 16), all = fn => save(shapes.map(fn)), text = fn => texty.length && save(texty.map(fn));
  const B = shapes.length > 1 ? bounds(shapes) : null, locked = shapes.every(s => s.lock);
  const spread = axis => {
    const sorted = [...shapes].sort((a, b) => a.position[axis] - b.position[axis]), dim = axis === 'x' ? 'w' : 'h', span = (axis === 'x' ? B.r - B.l : B.b - B.t) - sorted.reduce((sum, s) => sum + s.size[dim], 0), gap = span / (sorted.length - 1);
    let at = axis === 'x' ? B.l : B.t;
    save(sorted.map(s => { const next = axis === 'x' ? move(s, at, s.position.y) : move(s, s.position.x, at); at += s.size[dim] + gap; return next; }));
  };
  return <div className="format-panel" role="group" aria-label="Format">
    {texty.length > 0 && <>
      <div className="fp-row"><span>Text</span>
        <button aria-label="Text smaller" title="Text smaller" onClick={() => text(s => ({ ...s, fs: Math.max(8, size(s) - (size(s) > 40 ? 4 : 2)) }))}>A−</button>
        <button aria-label="Text bigger" title="Text bigger" onClick={() => text(s => ({ ...s, fs: Math.min(160, size(s) + (size(s) >= 40 ? 4 : 2)) }))}>A+</button>
        <button aria-label="Bold" aria-pressed={Boolean(first.b)} className={first.b ? 'on' : ''} onClick={() => text(s => ({ ...s, b: !first.b }))}><Bold size={14}/></button>
        <button aria-label="Italic" aria-pressed={Boolean(first.i)} className={first.i ? 'on' : ''} onClick={() => text(s => ({ ...s, i: !first.i }))}><Italic size={14}/></button>
        {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]].map(([al, Icon]) => <button key={al} aria-label={`Align text ${al}`} aria-pressed={first.al === al} className={first.al === al ? 'on' : ''} onClick={() => text(s => ({ ...s, al }))}><Icon size={14}/></button>)}</div>
      <div className="fp-row"><span>Colour</span>{TEXT_COLORS.map(c => <button key={c} className={`fp-swatch ${first.tc === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Text colour ${c}`} onClick={() => text(s => ({ ...s, tc: c }))}/>)}<button aria-label="Automatic text colour" title="Automatic" onClick={() => text(s => ({ ...s, tc: undefined }))}>Auto</button></div>
      <div className="fp-row"><span>Border</span>{[['none', 'None'], ['', 'Normal'], ['dashed', 'Dashed'], ['thick', 'Thick']].map(([bd, label]) => <button key={label} aria-label={`${label} border`} aria-pressed={(first.bd || '') === bd} className={(first.bd || '') === bd ? 'on' : ''} onClick={() => text(s => ({ ...s, bd: bd || undefined }))}>{label}</button>)}</div>
    </>}
    <div className="fp-row"><span>Block</span>
      <button aria-label="Rotate left" title="Rotate left" onClick={() => all(s => ({ ...s, rot: Math.max(-180, (s.rot || 0) - 15) }))}><RotateCcw size={14}/></button>
      <button aria-label="Rotate right" title="Rotate right" onClick={() => all(s => ({ ...s, rot: Math.min(180, (s.rot || 0) + 15) }))}><RotateCw size={14}/></button>
      <button aria-label="Reset rotation" onClick={() => all(s => ({ ...s, rot: undefined }))}>Reset</button>
      <button aria-label="Bring to front" title="Bring to front" onClick={() => all(s => ({ ...s, z: Math.min(1000, (s.z || 0) + 1) }))}><ArrowUpToLine size={14}/></button>
      <button aria-label="Send to back" title="Send to back" onClick={() => all(s => ({ ...s, z: Math.max(-1000, (s.z || 0) - 1) }))}><ArrowDownToLine size={14}/></button>
      <button aria-label={locked ? 'Unlock' : 'Lock'} title={locked ? 'Unlock' : 'Lock in place'} aria-pressed={locked} className={locked ? 'on' : ''} onClick={() => all(s => ({ ...s, lock: !locked }))}>{locked ? <Lock size={14}/> : <Unlock size={14}/>}</button></div>
    {B && <div className="fp-row"><span>Line up</span>
      <button aria-label="Align left edges" title="Align left edges" onClick={() => all(s => move(s, B.l, s.position.y))}><AlignHorizontalJustifyStart size={14}/></button>
      <button aria-label="Align centres horizontally" title="Align centres" onClick={() => all(s => move(s, (B.l + B.r) / 2 - s.size.w / 2, s.position.y))}><AlignHorizontalJustifyCenter size={14}/></button>
      <button aria-label="Align top edges" title="Align top edges" onClick={() => all(s => move(s, s.position.x, B.t))}><AlignVerticalJustifyStart size={14}/></button>
      <button aria-label="Align middles vertically" title="Align middles" onClick={() => all(s => move(s, s.position.x, (B.t + B.b) / 2 - s.size.h / 2))}><AlignVerticalJustifyCenter size={14}/></button>
      {shapes.length > 2 && <><button aria-label="Space evenly across" title="Space evenly across" onClick={() => spread('x')}><AlignHorizontalSpaceBetween size={14}/></button>
      <button aria-label="Space evenly down" title="Space evenly down" onClick={() => spread('y')}><AlignVerticalSpaceBetween size={14}/></button></>}</div>}
  </div>;
}

// A connector's words, line style, arrowheads, colour and thickness.
export function EdgePanel({ edges, patch }) {
  const first = edges[0] || {}, [label, setLabel] = useState(first.label || '');
  useEffect(() => setLabel(first.label || ''), [first.id, first.label]);
  const commit = value => { const text = value.trim(); if ((first.label || '') !== text) patch({ label: text || undefined }); };
  return <div className="format-panel edge-panel" role="group" aria-label="Connector format">
    <div className="fp-row"><span>Label</span><input aria-label="Connector label" maxLength={80} placeholder="Say what this link means" value={label} onChange={e => setLabel(e.target.value)} onBlur={e => commit(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); e.stopPropagation(); }}/></div>
    <div className="fp-row"><span>Line</span>{[['', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']].map(([dash, name]) => <button key={name} aria-label={`${name} line`} aria-pressed={(first.dash || '') === dash} className={(first.dash || '') === dash ? 'on' : ''} onClick={() => patch({ dash: dash || undefined })}>{name}</button>)}
      <select aria-label="Line thickness" value={first.ew || 2} onChange={e => patch({ ew: Number(e.target.value) === 2 ? undefined : Number(e.target.value) })}>{[1, 2, 3, 4, 6, 8].map(w => <option key={w} value={w}>{w}px</option>)}</select></div>
    <div className="fp-row"><span>Arrows</span>{[['', 'End →'], ['both', 'Both ↔'], ['none', 'None —']].map(([ends, name]) => <button key={name} aria-label={`Arrowheads: ${name}`} aria-pressed={(first.ends || '') === ends} className={(first.ends || '') === ends ? 'on' : ''} onClick={() => patch({ ends: ends || undefined })}>{name}</button>)}</div>
    <div className="fp-row"><span>Colour</span>{LINE_COLORS.map(c => <button key={c} className={`fp-swatch ${first.ecolor === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Line colour ${c}`} onClick={() => patch({ ecolor: c })}/>)}<button aria-label="Automatic line colour" onClick={() => patch({ ecolor: undefined })}>Auto</button></div>
  </div>;
}
