import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addDays, dateKey, daysBetween, parseKey, startOfWeek, buildItems, layoutRow, visibleOffsets, ItemChip, ItemBar, WEEKDAY_NAMES } from './calendar-core';

const ROW_H = 124, CHIP_LINES = 4, MONTH = new Intl.DateTimeFormat(undefined, { month: 'short' });

// One calendar that simply keeps going: weeks stack endlessly in both directions and only the visible ones are drawn.
export const ScrollMonths = forwardRef(function ScrollMonths({ state, calendars, prefs, today, selected, onSelect, onTitle, onCreateRange, onOpen, onToggleTask, onDropItem, onDay, highlight }, ref) {
  const offsets = useMemo(() => visibleOffsets(prefs), [prefs.showWeekends, prefs.weekStart]);
  const base = useMemo(() => startOfWeek(today, prefs.weekStart), [today, prefs.weekStart]);
  const [bounds, setBounds] = useState({ lo: -60, hi: 110 }), [view, setView] = useState({ top: 0, height: 700 }), [paint, setPaint] = useState(null), [over, setOver] = useState(null);
  const box = useRef(null), shift = useRef(0), titled = useRef(''), drag = useRef(null);
  const rowDate = index => addDays(base, index * 7);
  const indexOf = date => Math.floor(daysBetween(base, startOfWeek(date, prefs.weekStart)) / 7);

  const scrollTo = useCallback((date, smooth = true) => {
    const el = box.current;
    if (!el) return;
    const index = indexOf(date), lo = Math.min(bounds.lo, index - 20), hi = Math.max(bounds.hi, index + 40), moved = lo !== bounds.lo || hi !== bounds.hi;
    if (moved) setBounds({ lo, hi });
    requestAnimationFrame(() => requestAnimationFrame(() => el.scrollTo({ top: Math.max(0, (index - lo - 1) * ROW_H), behavior: smooth && !moved ? 'smooth' : 'auto' })));
  }, [base, bounds.lo, prefs.weekStart]);
  useImperativeHandle(ref, () => ({ scrollTo }), [scrollTo]);
  useLayoutEffect(() => { box.current.scrollTop = (-bounds.lo - 1) * ROW_H; setView({ top: box.current.scrollTop, height: box.current.clientHeight }); }, []);
  useLayoutEffect(() => { if (shift.current) { box.current.scrollTop += shift.current; shift.current = 0; } }, [bounds.lo]);

  const onScroll = () => {
    const el = box.current, top = el.scrollTop, first = Math.floor(top / ROW_H) + bounds.lo, last = Math.ceil((top + el.clientHeight) / ROW_H) + bounds.lo;
    setView({ top, height: el.clientHeight });
    if (first < bounds.lo + 14) { shift.current = 60 * ROW_H; setBounds(b => ({ ...b, lo: b.lo - 60 })); }
    else if (last > bounds.hi - 14) setBounds(b => ({ ...b, hi: b.hi + 60 }));
    const mid = addDays(rowDate(first + 1), 3), label = mid.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (label !== titled.current) { titled.current = label; onTitle(label, mid); }
  };
  useEffect(() => { onScroll(); }, []);

  const count = bounds.hi - bounds.lo, first = Math.max(0, Math.floor(view.top / ROW_H) - 3), last = Math.min(count - 1, Math.ceil((view.top + view.height) / ROW_H) + 3);
  const from = addDays(rowDate(bounds.lo + first), 0), to = addDays(rowDate(bounds.lo + last), 7);
  const items = useMemo(() => buildItems(state, calendars, prefs, from, to), [state.events, state.todos, state.schedules, state.agents, calendars, prefs.showTasks, prefs.showRuns, dateKey(from), dateKey(to)]);

  useEffect(() => {
    const finish = () => { setPaint(p => { if (p) { const [a, b] = [p.a, p.b].sort(); if (a !== b) onCreateRange(a, b); else onSelect(a); } return null; }); };
    window.addEventListener('mouseup', finish);
    return () => window.removeEventListener('mouseup', finish);
  }, [onCreateRange, onSelect]);

  // The day you picked the item up from is remembered, so dropping it elsewhere moves it by exactly that many days.
  const startDrag = (e, item, grabDay) => {
    drag.current = { id: item.id };
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-rw-cal', JSON.stringify({ id: item.id, kind: item.kind, grab: dateKey(grabDay) }));
  };
  const startBarDrag = (e, item, bar, weekDate) => {
    const rect = e.currentTarget.getBoundingClientRect(), cells = bar.c1 - bar.c0 + 1, at = Math.min(cells - 1, Math.max(0, Math.floor((e.clientX - rect.left) / (rect.width / cells))));
    startDrag(e, item, addDays(weekDate, offsets[bar.c0 + at]));
  };
  const drop = (e, key) => {
    e.preventDefault(); setOver(null);
    let data; try { data = JSON.parse(e.dataTransfer.getData('application/x-rw-cal')); } catch { return; }
    const item = items.find(it => it.id === data.id);
    if (item) onDropItem(item, daysBetween(parseKey(data.grab), parseKey(key)));
  };

  const rows = [];
  for (let i = first; i <= last; i++) {
    const weekDate = rowDate(bounds.lo + i), weekEnd = addDays(weekDate, 7);
    const layout = layoutRow(weekDate, 7, offsets, items.filter(it => it.end > weekDate && it.start < weekEnd));
    const laneAt = offsets.map((_, column) => Math.max(0, ...layout.bars.filter(b => b.c0 <= column && column <= b.c1).map(b => b.lane + 1)));
    rows.push(<div className="cal-week" key={bounds.lo + i} style={{ top: i * ROW_H, height: ROW_H, gridTemplateColumns: `${prefs.weekNumbers ? '30px ' : ''}repeat(${offsets.length}, minmax(0, 1fr))` }}>
      {prefs.weekNumbers && <span className="cal-weekno" title="Week number">{isoWeek(addDays(weekDate, 3))}</span>}
      {offsets.map((offset, column) => {
        const day = addDays(weekDate, offset), key = dateKey(day), chips = layout.chips[column], room = Math.max(0, CHIP_LINES - laneAt[column]), extra = Math.max(0, chips.length - room) + layout.hidden[column], shown = extra ? chips.slice(0, Math.max(0, room - 1)) : chips;
        const hidden = extra ? chips.length - shown.length + layout.hidden[column] : 0;
        const parity = (day.getFullYear() * 12 + day.getMonth()) % 2, prev = addDays(day, -1), newMonth = day.getDate() === 1, topEdge = addDays(day, -7).getMonth() !== day.getMonth(), leftEdge = prev.getMonth() !== day.getMonth() && column > 0;
        const inPaint = paint && key >= [paint.a, paint.b].sort()[0] && key <= [paint.a, paint.b].sort()[1];
        return <div key={key} data-date={key} className={`cal-cell ${parity ? 'odd' : 'even'} ${key === dateKey(today) ? 'today' : ''} ${key === selected ? 'selected' : ''} ${topEdge ? 'top-edge' : ''} ${leftEdge ? 'left-edge' : ''} ${inPaint ? 'painting' : ''} ${over === key ? 'drop' : ''} ${highlight === key ? 'flash' : ''}`} style={{ gridColumn: column + 1 + (prefs.weekNumbers ? 1 : 0) }}
          onMouseDown={e => { if (e.button === 0 && !e.target.closest('.cal-chip, .cal-more')) setPaint({ a: key, b: key }); }} onMouseEnter={() => setPaint(p => p ? { ...p, b: key } : p)}
          onDoubleClick={e => { if (!e.target.closest('.cal-chip, .cal-more')) onCreateRange(key, key, true); }}
          onDragOver={e => { if (e.dataTransfer.types.includes('application/x-rw-cal')) { e.preventDefault(); setOver(key); } }} onDragLeave={() => setOver(o => o === key ? null : o)} onDrop={e => drop(e, key)}>
          <span className={`cal-num ${newMonth ? 'first' : ''}`}>{newMonth ? `${MONTH.format(day)} ${day.getDate()}` : day.getDate()}</span>
          <div className="cal-lanes" style={{ height: laneAt[column] * 20 }}/>
          <div className="cal-chips">{shown.map(item => <ItemChip key={item.id} item={item} onOpen={onOpen} onToggle={onToggleTask} drag={item.kind === 'run' ? null : (e, it) => startDrag(e, it, day)}/>)}{hidden > 0 && <button type="button" className="cal-more" onClick={e => { e.stopPropagation(); onDay(day); }}>+{hidden} more</button>}</div>
        </div>;
      })}
      <div className="cal-bars" style={{ gridTemplateColumns: `repeat(${offsets.length}, minmax(0, 1fr))`, left: prefs.weekNumbers ? 30 : 0 }}>{layout.bars.map(bar => <ItemBar key={bar.item.id + bar.c0} bar={bar} onOpen={onOpen} drag={(e, it, b) => startBarDrag(e, it, b, weekDate)}/>)}</div>
    </div>);
  }
  const names = offsets.map(o => WEEKDAY_NAMES[(prefs.weekStart + o) % 7]);
  return <div className="cal-scroll-wrap">
    <div className="cal-weekdays" style={{ gridTemplateColumns: `${prefs.weekNumbers ? '30px ' : ''}repeat(${offsets.length}, minmax(0, 1fr))` }}>{prefs.weekNumbers && <span/>}{names.map(n => <span key={n}>{n}</span>)}</div>
    <div className="cal-scroll" ref={box} onScroll={onScroll} role="grid" aria-label="Calendar"><div className="cal-weeks" style={{ height: count * ROW_H }}>{rows}</div></div>
  </div>;
});

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())), day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  return Math.ceil(((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
}
