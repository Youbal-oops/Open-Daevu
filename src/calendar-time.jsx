import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Repeat } from 'lucide-react';
import { addDays, dateKey, daysBetween, startOfDay, buildItems, layoutRow, ItemBar, ItemChip, clock, WEEKDAY_NAMES } from './calendar-core';

export const HOUR_H = 52, SNAP = 15;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = h => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' });
const snap = minutes => Math.round(minutes / SNAP) * SNAP;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function pack(blocks) {
  const out = [];
  let cluster = [], end = -1;
  const flush = () => {
    const lanes = [];
    for (const b of cluster) { let lane = lanes.findIndex(e => e <= b.from); if (lane < 0) { lane = lanes.length; lanes.push(b.to); } else lanes[lane] = b.to; b.lane = lane; }
    for (const b of cluster) b.lanes = lanes.length;
    out.push(...cluster); cluster = []; end = -1;
  };
  for (const b of blocks) { if (cluster.length && b.from >= end) flush(); cluster.push(b); end = Math.max(end, b.to); }
  if (cluster.length) flush();
  return out;
}

// Week and day views: an hour grid you can drag on to create, move and resize events.
export function TimeGrid({ state, calendars, prefs, days, today, onOpen, onToggleTask, onCreate, onMove, onDay, onSelectDay, selected, highlight }) {
  const [drag, setDrag] = useState(null), [now, setNow] = useState(() => new Date()), scroller = useRef(null), body = useRef(null), moved = useRef(false);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  const from = days[0], to = addDays(days.at(-1), 1);
  const items = useMemo(() => buildItems(state, calendars, prefs, from, to), [state.events, state.todos, state.schedules, state.agents, calendars, prefs.showTasks, prefs.showRuns, dateKey(from), dateKey(to)]);
  const offsets = days.map((_, i) => i), top = layoutRow(from, days.length, offsets, items.filter(i => i.allDay || (i.kind === 'event' && daysBetween(i.start, new Date(i.end.getTime() - 1)) > 0)));
  const todayHere = days.some(d => dateKey(d) === dateKey(today));
  useLayoutEffect(() => { if (scroller.current) scroller.current.scrollTop = Math.max(0, ((todayHere ? now.getHours() - 1 : 8) * HOUR_H)); }, [dateKey(from), days.length]);

  const timed = days.map(day => {
    const start = startOfDay(day), end = addDays(start, 1);
    const blocks = items.filter(i => !i.allDay && !(i.kind === 'event' && daysBetween(i.start, new Date(i.end.getTime() - 1)) > 0) && i.end > start && i.start < end)
      .map(i => ({ item: i, from: clamp((i.start - start) / 60000, 0, 1440), to: clamp((i.end - start) / 60000, 0, 1440) })).map(b => ({ ...b, to: Math.max(b.to, b.from + 22) }));
    return pack(blocks.sort((a, b) => a.from - b.from || b.to - a.to));
  });

  const locate = e => {
    const rect = body.current.getBoundingClientRect(), width = (rect.width - 56) / days.length;
    return { day: clamp(Math.floor((e.clientX - rect.left - 56) / width), 0, days.length - 1), minutes: clamp(((e.clientY - rect.top) / HOUR_H) * 60, 0, 1440) };
  };
  const down = (e, mode, item, block) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const at = locate(e);
    moved.current = false;
    try { body.current.setPointerCapture(e.pointerId); } catch {}
    if (mode === 'create') setDrag({ mode, day: at.day, a: snap(at.minutes), b: snap(at.minutes) });
    else setDrag({ mode, item, day: at.day, from: at.day, startMinutes: block.from, endMinutes: block.to, grab: at.minutes - block.from, newStart: block.from, newEnd: block.to, originX: e.clientX, originY: e.clientY, length: block.to - block.from });
  };
  const move = e => {
    if (!drag) return;
    const at = locate(e);
    if (drag.mode === 'create') { setDrag(d => ({ ...d, b: snap(at.minutes) })); moved.current = true; return; }
    if (Math.abs(e.clientX - drag.originX) + Math.abs(e.clientY - drag.originY) < 4) return;
    moved.current = true;
    if (drag.mode === 'move') { const start = clamp(snap(at.minutes - drag.grab), 0, 1440 - drag.length); setDrag(d => ({ ...d, day: at.day, newStart: start, newEnd: start + d.length })); }
    else setDrag(d => ({ ...d, newEnd: clamp(snap(at.minutes), d.startMinutes + SNAP, 1440) }));
  };
  const up = () => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    const dayStart = day => startOfDay(days[day]), at = (day, minutes) => new Date(dayStart(day).getTime() + minutes * 60000);
    if (d.mode === 'create') {
      const [a, b] = d.a <= d.b ? [d.a, d.b] : [d.b, d.a];
      if (b - a >= SNAP) onCreate(at(d.day, a), at(d.day, b)); else if (b === a) onSelectDay?.(days[d.day]);
      return;
    }
    if (!moved.current) { onOpen(d.item); return; }
    if (d.mode === 'move') onMove(d.item, at(d.day, d.newStart), at(d.day, d.newEnd));
    else onMove(d.item, d.item.start, at(d.from, d.newEnd));
  };

  const ghost = drag && drag.mode === 'create' ? { day: drag.day, from: Math.min(drag.a, drag.b), to: Math.max(drag.a, drag.b) + (drag.a === drag.b ? SNAP : 0) } : null;
  return <div className="cal-time">
    <div className="cal-time-head" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
      <span className="cal-gutter-label">{Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop().replace('_', ' ')}</span>
      {days.map(d => <button key={dateKey(d)} className={`cal-day-head ${dateKey(d) === dateKey(today) ? 'today' : ''} ${dateKey(d) === selected ? 'selected' : ''}`} onClick={() => onDay(d)}><small>{WEEKDAY_NAMES[d.getDay()]}</small><b>{d.getDate()}</b></button>)}
    </div>
    <div className="cal-allday" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
      <span className="cal-gutter-label">all-day</span>
      <div className="cal-allday-body" style={{ gridColumn: `2 / span ${days.length}`, minHeight: Math.max(1, top.lanes + (top.chips.some(c => c.length) ? 1 : 0)) * 22 + 6 }} onDoubleClick={e => { const rect = e.currentTarget.getBoundingClientRect(), i = clamp(Math.floor((e.clientX - rect.left) / (rect.width / days.length)), 0, days.length - 1); onCreate(days[i], days[i], true); }}>
        <div className="cal-allday-bars" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>{top.bars.map(bar => <ItemBar key={bar.item.id + bar.c0} bar={bar} onOpen={onOpen}/>)}</div>
        <div className="cal-allday-chips" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, marginTop: top.lanes * 20 }}>{top.chips.map((list, i) => <div key={i}>{list.filter(it => it.allDay).map(it => <ItemChip key={it.id} item={it} onOpen={onOpen} onToggle={onToggleTask}/>)}</div>)}</div>
      </div>
    </div>
    <div className="cal-time-scroll" ref={scroller}>
      <div className="cal-time-body" ref={body} style={{ height: 24 * HOUR_H, gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)}>
        <div className="cal-hours">{HOURS.map(h => <span key={h} style={{ top: h * HOUR_H }}>{h ? hourLabel(h) : ''}</span>)}</div>
        {days.map((day, di) => <div key={dateKey(day)} className={`cal-col ${dateKey(day) === dateKey(today) ? 'today' : ''} ${highlight === dateKey(day) ? 'flash' : ''}`} onPointerDown={e => down(e, 'create')}>
          {HOURS.map(h => <i key={h} className="cal-hour-line" style={{ top: h * HOUR_H }}/>)}
          {timed[di].map(block => { const it = block.item, live = drag && drag.item?.id === it.id, shown = live && drag.mode === 'move' ? { from: drag.newStart, to: drag.newEnd } : live && drag.mode === 'resize' ? { from: block.from, to: drag.newEnd } : block;
            if (live && drag.mode === 'move' && drag.day !== di) return null;
            return <div key={it.id} className={`cal-block ${it.kind} ${it.done ? 'done' : ''} ${live ? 'dragging' : ''} ${shown.to - shown.from < 40 ? 'short' : ''}`} style={{ top: shown.from / 60 * HOUR_H, height: Math.max(20, (shown.to - shown.from) / 60 * HOUR_H - 2), left: `calc(${block.lane / block.lanes * 100}% + 2px)`, width: `calc(${100 / block.lanes}% - 4px)`, '--bar': it.color }} onPointerDown={e => it.kind === 'run' ? e.stopPropagation() : down(e, 'move', it, block)} onClick={e => { e.stopPropagation(); if (it.kind === 'run') onOpen(it); }} title={it.title}>
              <b>{it.title}</b><small>{clock(new Date(startOfDay(day).getTime() + shown.from * 60000))}{(shown.to - shown.from) >= 45 ? ` – ${clock(new Date(startOfDay(day).getTime() + shown.to * 60000))}` : ''}</small>
              {it.event?.location && shown.to - shown.from >= 60 && <small className="loc"><MapPin size={10}/>{it.event.location}</small>}{it.recurring && <Repeat size={10} className="repeat"/>}
              {it.kind !== 'run' && <span className="resize" onPointerDown={e => down(e, 'resize', it, block)}/>}
            </div>; })}
          {drag && drag.mode === 'move' && drag.day === di && !timed[di].some(b => b.item.id === drag.item.id) && <div className="cal-block ghost dragging" style={{ top: drag.newStart / 60 * HOUR_H, height: Math.max(20, drag.length / 60 * HOUR_H - 2), left: 2, right: 2, '--bar': drag.item.color }}><b>{drag.item.title}</b></div>}
          {ghost && ghost.day === di && <div className="cal-block ghost" style={{ top: ghost.from / 60 * HOUR_H, height: (ghost.to - ghost.from) / 60 * HOUR_H, left: 2, right: 2 }}><small>{clock(new Date(startOfDay(day).getTime() + ghost.from * 60000))} – {clock(new Date(startOfDay(day).getTime() + ghost.to * 60000))}</small></div>}
          {dateKey(day) === dateKey(now) && <div className="cal-now" style={{ top: (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_H }}><i/></div>}
        </div>)}
      </div>
    </div>
  </div>;
}

const dayTitle = (date, today) => { const diff = daysBetween(today, date); return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : date.toLocaleDateString(undefined, { weekday: 'long' }); };

// A plain list of what is coming up, grouped by day. Also used for search results.
export function Agenda({ items, today, onOpen, onToggleTask, empty, heading }) {
  const groups = [];
  for (const item of items) {
    const key = dateKey(item.start), last = groups.at(-1);
    if (last?.key === key) last.items.push(item); else groups.push({ key, date: startOfDay(item.start), items: [item] });
  }
  return <div className="cal-agenda">
    {heading && <p className="cal-agenda-heading">{heading}</p>}
    {groups.map(g => <section key={g.key} className={g.key === dateKey(today) ? 'today' : ''}>
      <header><b>{dayTitle(g.date, today)}</b><span>{g.date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: g.date.getFullYear() === today.getFullYear() ? undefined : 'numeric' })}</span></header>
      {g.items.map(item => <div key={item.id} className={`cal-agenda-row ${item.kind} ${item.done ? 'done' : ''}`} role="button" tabIndex={0} onClick={() => onOpen(item)} onKeyDown={e => { if (e.key === 'Enter') onOpen(item); }}>
        <span className="when">{item.allDay ? 'All day' : `${clock(item.start)}${item.end - item.start > 60000 && item.kind === 'event' ? ' – ' + clock(item.end) : ''}`}</span>
        <i className="bar" style={{ background: item.color }}/>
        <span className="what"><strong>{item.title}</strong>{item.event?.location && <small><MapPin size={11}/>{item.event.location}</small>}{item.kind === 'task' && <small>Task</small>}{item.kind === 'run' && <small>Agent task{item.agent ? ` · ${item.agent.name}` : ''}</small>}{item.event?.createdBy && item.event.createdBy !== 'You' && item.event.createdBy !== 'Imported' && <small>Added by {item.event.createdBy}</small>}</span>
        {item.calendar && <span className="cal-name"><i style={{ background: item.color }}/>{item.calendar.name}</span>}
        {item.recurring && <Repeat size={12} className="repeat"/>}
      </div>)}
    </section>)}
    {!groups.length && <p className="cal-agenda-empty">{empty}</p>}
  </div>;
}
