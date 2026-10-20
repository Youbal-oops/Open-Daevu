import React, { useEffect, useRef, useState } from 'react';

// A pencil-style underwater scene for the empty space under a project overview. Plain strokes in the muted text colour,
// roughened by an SVG displacement filter. The first time it appears the pencil draws it; then the water keeps moving.
// Two stacked drawings: the still seabed is painted once, only the moving layer repaints. Animation stops for reduced-motion users.
const random = seed => { let value = seed; return () => (value = (value * 16807) % 2147483647) / 2147483647; };
const PENCIL = 'url(#sk-pencil)';

function Weed({ x, h, lean = 0, delay = 0 }) {
  const y = 250, d = `M${x} ${y} C${x - 14 + lean} ${y - h * .28} ${x + 16 + lean} ${y - h * .52} ${x - 3 + lean} ${y - h * .76} S${x + 10 + lean} ${y - h * .94} ${x + lean * 1.2} ${y - h}`;
  const leaves = [[.3, 1], [.5, -1], [.7, 1]].map(([t, side]) => `M${x + lean * t} ${y - h * t} q${side * 15} -5 ${side * 22} -16`).join(' ');
  return <g className="sk-weed" style={{ animationDelay: `${delay}s` }}><g><path d={d}/><path d={leaves}/></g></g>;
}

function Fish({ x, y, s = 1, flip = false, delay = 0, drift = 40 }) {
  return <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}><g className="sk-fish" style={{ animationDelay: `${delay}s`, '--drift': `${drift}px` }}><g>
    <path d="M-40 0 C-28 -20 8 -24 34 -6 C44 0 44 0 34 6 C8 24 -28 20 -40 0 Z"/>
    <path className="sk-tail" d="M-40 0 L-62 -16 C-56 -6 -56 6 -62 16 Z" style={{ animationDelay: `${delay / 2}s` }}/>
    <path d="M10 -14 C4 -6 4 6 10 14"/>
    <path className="sk-fin" d="M-6 -20 C-2 -34 14 -34 20 -18"/>
    <path d="M-4 19 C0 28 10 28 14 19"/>
    <path d="M-20 -8 q6 8 0 16 M-10 -11 q6 11 0 22 M0 -10 q5 10 0 20" opacity=".6"/>
    <circle className="sk-fill" cx="24" cy="-4" r="2.4"/>
  </g></g></g>;
}

function Jelly({ x, y, s = 1, delay = 0 }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}><g className="sk-bob" style={{ animationDelay: `${delay}s` }}><g>
    <g className="sk-dome" style={{ animationDelay: `${delay}s` }}><path d="M-22 0 C-22 -34 22 -34 22 0 C14 6 -14 6 -22 0 Z"/><path d="M-14 -4 C-10 -20 10 -20 14 -4" opacity=".6"/></g>
    <g className="sk-tentacles" style={{ animationDelay: `${delay}s` }}><path d="M-14 4 C-20 16 -8 24 -14 36 C-18 44 -8 50 -12 60 M-4 6 C-8 18 4 26 -2 38 C-6 48 4 54 0 64 M6 6 C2 18 14 24 8 38 C4 48 14 52 10 62 M15 4 C10 14 20 22 15 32"/></g>
  </g></g></g>;
}

function Starfish({ x, y, s = 1, turn = 0 }) {
  return <g transform={`translate(${x} ${y}) rotate(${turn}) scale(${s})`}><path d="M0 -14 L4 -4 L15 -4 L6 3 L9 14 L0 8 L-9 14 L-6 3 L-15 -4 L-4 -4 Z"/><path d="M0 -6 L0 2 M-5 -1 L4 -1" opacity=".5"/></g>;
}

const BUBBLES = [[130, 232, 6, 0, 8], [152, 206, 3.5, 2.2, 7], [612, 238, 7, 1, 9], [640, 216, 4, 3.4, 6], [1012, 234, 5, .6, 8], [1040, 206, 3, 2.8, 7], [300, 228, 4, 4.1, 6.5], [786, 242, 5.5, 1.7, 9], [905, 230, 3.5, 5, 7.5], [470, 214, 4.5, 3, 8], [1160, 226, 3.2, 1.1, 6.8], [30, 236, 5, 4.4, 8.4]];
const surface = 'M-240 12 ' + 'q60 -10 120 0 '.concat(Array.from({ length: 16 }, () => 't120 0').join(' '));

export function UnderwaterSketch() {
  const root = useRef(null), napTimer = useRef(0), asleepNow = useRef(false), [asleep, setAsleep] = useState(false), dots = random(11), sand = Array.from({ length: 120 }, () => [dots() * 1200, 255 + dots() * 22, .5 + dots() * .9]);
  // The scene moves for a few seconds, then holds still: an animated filter keeps the processor busy for no reason.
  // Moving the pointer over it wakes it up again for a while.
  const wake = () => { asleepNow.current = false; setAsleep(false); clearTimeout(napTimer.current); napTimer.current = setTimeout(() => { asleepNow.current = true; setAsleep(true); }, 9000); };
  useEffect(() => {
    wake();
    const move = e => { if (!asleepNow.current || !root.current) return; const r = root.current.getBoundingClientRect(); if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) wake(); };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); clearTimeout(napTimer.current); };
  }, []);
  // Give every stroke a one-time "being drawn" animation, staggered so the scene builds up left to right.
  useEffect(() => {
    root.current?.querySelectorAll('path, circle').forEach((el, i) => {
      if (el.closest('.sk-nodraw') || el.getAttribute('stroke') === 'none') return;
      el.setAttribute('pathLength', '1');
      el.style.setProperty('--d', `${(i % 48) * .04}s`);
      el.classList.add('sk-draw');
    });
  }, []);
  const common = { preserveAspectRatio: 'xMidYMax meet', role: 'presentation', viewBox: '0 0 1200 290' };
  const pencil = { stroke: 'currentColor', fill: 'none', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  return <div className={`overview-scene${asleep ? ' asleep' : ''}`} aria-hidden="true" ref={root}>
    <svg {...common}>
      <defs>
        <filter id="sk-pencil" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="1" seed="7" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6" xChannelSelector="R" yChannelSelector="G"/></filter>
        <pattern id="sk-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth=".9" opacity=".55"/></pattern>
      </defs>
      <g filter={PENCIL} {...pencil}>
        <path d="M0 252 C120 240 220 264 340 250 S560 238 700 254 S950 264 1070 248 S1170 242 1200 250"/>
        <g className="sk-stipple sk-nodraw" stroke="none" fill="currentColor" opacity=".5">{sand.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r}/>)}</g>
        <path d="M428 252 C422 228 452 212 486 218 C514 222 532 240 528 252 Z"/><path className="sk-nodraw" d="M428 252 C422 228 452 212 486 218 C514 222 532 240 528 252 Z" fill="url(#sk-hatch)" stroke="none" opacity=".4"/>
        <path d="M960 252 C958 234 978 224 1000 228 C1024 232 1040 244 1038 252 Z"/><path className="sk-nodraw" d="M960 252 C958 234 978 224 1000 228 C1024 232 1040 244 1038 252 Z" fill="url(#sk-hatch)" stroke="none" opacity=".4"/>
        <path d="M520 254 C522 244 534 240 546 244 C554 248 556 252 556 254 Z"/>
        <path d="M180 252 C184 244 196 240 206 244 C214 247 216 251 216 252 Z"/>
        <g><path d="M880 252 C880 230 876 214 868 196 M876 224 C866 216 856 214 848 200 M878 218 C888 206 896 204 902 188 M870 204 C864 196 864 188 860 180 M900 200 C908 196 914 190 916 180"/><circle cx="868" cy="195" r="2.4"/><circle cx="848" cy="199" r="2.4"/><circle cx="902" cy="187" r="2.4"/><circle cx="860" cy="179" r="2.4"/><circle cx="916" cy="179" r="2.4"/></g>
        <g><path d="M270 252 C270 238 266 224 262 212 M268 232 C260 226 254 222 250 212 M270 228 C278 220 282 214 284 204"/><circle cx="262" cy="211" r="2.2"/><circle cx="250" cy="211" r="2.2"/><circle cx="284" cy="203" r="2.2"/></g>
        <Starfish x={586} y={264} s={.9} turn={-12}/><Starfish x={1002} y={270} s={.55} turn={20}/>
      </g>
    </svg>
    <svg {...common} className="sk-live">
      <g {...pencil}>
        <path className="sk-surface" d={surface} opacity=".5"/>
        <g className="sk-rays sk-nodraw" strokeDasharray="3 10"><path d="M120 20 L210 250"/><path d="M360 18 L450 250"/><path d="M640 20 L730 250"/><path d="M930 18 L1020 250"/></g>
        <Weed x={70} h={150} delay={0}/><Weed x={106} h={108} lean={8} delay={1.2}/><Weed x={332} h={118} delay={.6}/><Weed x={362} h={160} lean={-10} delay={2}/>
        <Weed x={700} h={132} delay={1.5}/><Weed x={736} h={96} lean={6} delay={.3}/><Weed x={1100} h={150} delay={2.4}/><Weed x={1136} h={104} lean={-8} delay={.9}/>
        <g className="sk-cross"><Fish x={0} y={188} s={1.35} drift={0}/></g>
        <g className="sk-cross back"><Fish x={0} y={46} s={.55} flip drift={0} delay={1}/></g>
        <Fish x={540} y={112} s={1.1} delay={0} drift={46}/><Fish x={890} y={86} s={.8} flip delay={2} drift={34}/><Fish x={250} y={74} s={.6} delay={1} drift={28}/>
        <Fish x={1010} y={150} s={.4} flip delay={.5} drift={20}/><Fish x={1042} y={166} s={.34} flip delay={1.4} drift={20}/><Fish x={1072} y={142} s={.38} flip delay={2.2} drift={20}/>
        <Jelly x={760} y={78} s={1.1} delay={0}/><Jelly x={120} y={62} s={.7} delay={1.8}/>
        {BUBBLES.map(([x, y, r, delay, duration], i) => <g key={i} className="sk-rise sk-nodraw" style={{ animationDelay: `${delay}s`, animationDuration: `${duration}s` }}><circle cx={x} cy={y} r={r}/><path d={`M${x - r * .5} ${y - r * .1} a${r * .6} ${r * .6} 0 0 1 ${r * .45} ${-r * .5}`} opacity=".7"/></g>)}
      </g>
    </svg>
  </div>;
}
