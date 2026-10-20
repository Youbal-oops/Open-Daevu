import React from 'react';
import { CheckSquare, Square, Bot, Repeat } from 'lucide-react';
import { addDays, daysBetween, dateKey, expand, parseKey, startOfDay } from '../shared/calendar.mjs';

export { addDays, daysBetween, dateKey, parseKey, startOfDay, startOfWeek, stamp, timeKey, expand, validateEvent, parseQuickAdd } from '../shared/calendar.mjs';

export const DEFAULT_CALENDAR = { id: 'personal', name: 'Personal', color: '#4f8cff', visible: true };
export const DEFAULT_PREFS = { weekStart: 0, weekNumbers: false, showWeekends: true, showTasks: true, showRuns: true, defaultDuration: 60, defaultReminder: null, view: 'scroll' };
export const prefsOf = state => ({ ...DEFAULT_PREFS, ...(state.settings?.calendar || {}) });
export const calendarsOf = state => state.calendars?.length ? state.calendars : [DEFAULT_CALENDAR];
export const clock = d => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MAX_LANES = 3;

const at = (day, time) => { const [h, m] = (time || '00:00').split(':').map(Number); const d = new Date(day); d.setHours(h, m, 0, 0); return d; };
// When an agent schedule runs inside a window (kept from the old calendar so agent tasks still show up here).
export function occurrences(schedule, from, to, today = new Date()) {
  if (!schedule.enabled) return [];
  const out = [];
  if (schedule.mode === 'once') { const d = new Date(schedule.at); if (d >= from && d <= to) out.push(d); }
  else if (['daily', 'weekly'].includes(schedule.mode)) { for (let day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) if (dateKey(day) >= dateKey(today) && (schedule.mode !== 'weekly' || schedule.weekdays.includes(day.getDay()))) out.push(at(day, schedule.time)); }
  else if (schedule.mode === 'interval' && schedule.nextRunAt) { const step = schedule.intervalMinutes * 60000; for (let t = Date.parse(schedule.nextRunAt), n = 0; t <= to.getTime() && n < 400; t += step, n++) if (t >= from.getTime()) out.push(new Date(t)); }
  return out;
}

// Everything the calendar can show between two instants: events (with repeats), your tasks, and agent runs.
export function buildItems(state, calendars, prefs, from, to) {
  const shown = new Map(calendars.filter(c => c.visible !== false).map(c => [c.id, c])), out = [];
  for (const event of state.events || []) {
    const calendar = shown.get(event.calendarId);
    if (!calendar) continue;
    for (const o of expand(event, from, to)) out.push({ id: o.key, kind: 'event', title: event.title, start: o.start, end: o.end, allDay: o.allDay, color: event.color || calendar.color, event, calendar, recurring: o.recurring, date: dateKey(o.start) });
  }
  if (prefs.showTasks) for (const todo of state.todos || []) {
    const start = todo.time ? new Date(`${todo.date}T${todo.time}:00`) : parseKey(todo.date), end = todo.time ? new Date(start.getTime() + 30 * 60000) : addDays(start, 1);
    if (end > from && start < to) out.push({ id: `task-${todo.id}`, kind: 'task', title: todo.title, start, end, allDay: !todo.time, color: 'var(--accent)', todo, done: todo.done, date: todo.date });
  }
  if (prefs.showRuns) for (const schedule of state.schedules || []) for (const d of occurrences(schedule, from, to)) out.push({ id: `run-${schedule.id}-${d.getTime()}`, kind: 'run', title: schedule.name, start: d, end: new Date(d.getTime() + 30 * 60000), allDay: false, color: '#9b82dc', schedule, agent: state.agents.find(a => a.id === schedule.agentId), date: dateKey(d) });
  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}

export function visibleOffsets(prefs) {
  const all = [0, 1, 2, 3, 4, 5, 6];
  return prefs.showWeekends ? all : all.filter(o => { const day = (prefs.weekStart + o) % 7; return day !== 0 && day !== 6; });
}

// Lays an item list over a row of days: items that last a day or more become bars on lanes, the rest become chips per day.
export function layoutRow(rangeStart, span, offsets, items) {
  const bars = [], chips = offsets.map(() => []), hidden = offsets.map(() => 0), rangeEnd = addDays(rangeStart, span);
  for (const item of items) {
    if (item.end <= rangeStart || item.start >= rangeEnd) continue;
    const first = startOfDay(item.start), last = item.allDay ? addDays(item.end, -1) : startOfDay(new Date(item.end.getTime() - 1));
    const bar = item.kind === 'event' && (item.allDay || daysBetween(first, last) > 0);
    const from = Math.max(0, daysBetween(rangeStart, first)), to = Math.min(span - 1, daysBetween(rangeStart, last));
    const columns = offsets.map((offset, column) => offset >= from && offset <= to ? column : -1).filter(column => column >= 0);
    if (!columns.length) continue;
    if (bar) bars.push({ item, c0: columns[0], c1: columns.at(-1), from: daysBetween(rangeStart, first) >= 0, to: daysBetween(rangeStart, last) < span });
    else for (const column of columns) chips[column].push(item);
  }
  bars.sort((a, b) => a.c0 - b.c0 || (b.c1 - b.c0) - (a.c1 - a.c0));
  const ends = [];
  for (const bar of bars) { let lane = ends.findIndex(end => end < bar.c0); if (lane < 0) { lane = ends.length; ends.push(bar.c1); } else ends[lane] = bar.c1; bar.lane = lane; }
  for (const bar of bars) if (bar.lane >= MAX_LANES) for (let c = bar.c0; c <= bar.c1; c++) hidden[c]++;
  return { bars: bars.filter(bar => bar.lane < MAX_LANES), chips, hidden, lanes: Math.min(ends.length, MAX_LANES) };
}

// A small marker for one item: a coloured dot and time for events, a tick box for tasks, a robot for agent runs.
export function ItemChip({ item, onOpen, onToggle, drag, compact }) {
  const time = item.allDay ? '' : clock(item.start).replace(' ', '').toLowerCase();
  const props = drag ? { draggable: true, onDragStart: e => drag(e, item) } : {};
  const open = e => { e.stopPropagation(); onOpen(item); };
  return <div className={`cal-chip ${item.kind} ${item.done ? 'done' : ''} ${compact ? 'compact' : ''}`} role="button" tabIndex={0} title={`${time ? time + ' · ' : ''}${item.title}${item.event?.location ? ' · ' + item.event.location : ''}`} onClick={open} onKeyDown={e => { if (e.key === 'Enter') open(e); }} {...props}>
    {item.kind === 'task' ? <button type="button" className="chip-tick" aria-label={item.done ? 'Mark not done' : 'Mark done'} onClick={e => { e.stopPropagation(); onToggle?.(item.todo); }}>{item.done ? <CheckSquare size={11}/> : <Square size={11}/>}</button> : item.kind === 'run' ? <Bot size={11}/> : <i className="chip-dot" style={{ background: item.color }}/>}
    <span className="chip-text">{time && <b>{time}</b>}{item.title}</span>{item.recurring && <Repeat size={9} className="chip-repeat"/>}
  </div>;
}

export function ItemBar({ bar, onOpen, drag }) {
  const { item } = bar;
  return <div className={`cal-bar ${bar.from ? '' : 'cont-left'} ${bar.to ? '' : 'cont-right'}`} role="button" tabIndex={0} draggable={item.kind !== 'run'} onDragStart={e => drag?.(e, item, bar)} title={item.title} style={{ gridColumn: `${bar.c0 + 1} / ${bar.c1 + 2}`, gridRow: bar.lane + 1, '--bar': item.color }} onClick={e => { e.stopPropagation(); onOpen(item); }} onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onOpen(item); } }}>
    <span>{item.title}</span>{item.recurring && <Repeat size={10}/>}
  </div>;
}
