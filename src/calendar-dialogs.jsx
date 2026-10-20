import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Copy, Repeat, Bell, MapPin, AlignLeft, FolderOpen, X } from 'lucide-react';
import { Modal } from './ui';
import { addDays, dateKey, parseKey, startOfDay, startOfWeek, buildItems, WEEKDAY_NAMES } from './calendar-core';

export const SWATCHES = ['#4f8cff', '#7c5cff', '#e5484d', '#f59e0b', '#22c55e', '#14b8a6', '#ec4899', '#8b8b94'];
const REMINDERS = [[0, 'At time'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '1 hour'], [120, '2 hours'], [1440, '1 day'], [2880, '2 days'], [10080, '1 week']];
const REPEATS = [['none', 'Does not repeat'], ['daily', 'Daily'], ['weekdays', 'Every weekday'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']];

function repeatOf(rule, startDate) {
  const day = parseKey(startDate).getDay(), none = { kind: 'none', interval: 1, byDay: [day], ends: 'never', until: '', count: 10 };
  if (!rule) return none;
  const weekdays = rule.freq === 'weekly' && rule.byDay?.length === 5 && [1, 2, 3, 4, 5].every(d => rule.byDay.includes(d)) && (rule.interval || 1) === 1;
  return { kind: weekdays ? 'weekdays' : rule.freq, interval: rule.interval || 1, byDay: rule.byDay?.length ? rule.byDay : [day], ends: rule.until ? 'until' : rule.count ? 'count' : 'never', until: rule.until || '', count: rule.count || 10 };
}
function formOf(event) {
  const allDay = Boolean(event.allDay), end = event.end || event.start;
  return { title: event.title || '', calendarId: event.calendarId, allDay, startDate: event.start.slice(0, 10), startTime: allDay ? '09:00' : event.start.slice(11, 16), endDate: end.slice(0, 10), endTime: allDay ? '10:00' : end.slice(11, 16), location: event.location || '', notes: event.notes || '', projectId: event.projectId || '', color: event.color || '', reminders: [...(event.reminders || [])], repeat: repeatOf(event.recurrence, event.start.slice(0, 10)) };
}
export function recordOf(f, base) {
  const r = f.repeat;
  let recurrence = null;
  if (r.kind !== 'none') {
    recurrence = r.kind === 'weekdays' ? { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] } : { freq: r.kind, interval: Number(r.interval) || 1, ...(r.kind === 'weekly' ? { byDay: r.byDay } : {}) };
    if (r.ends === 'until' && r.until) recurrence.until = r.until; else if (r.ends === 'count') recurrence.count = Number(r.count) || 1;
  }
  return { ...base, title: f.title.trim(), calendarId: f.calendarId, allDay: f.allDay, start: f.allDay ? f.startDate : `${f.startDate}T${f.startTime}`, end: f.allDay ? f.endDate : `${f.endDate}T${f.endTime}`, location: f.location, notes: f.notes, projectId: f.projectId || undefined, color: f.color || undefined, reminders: f.reminders, recurrence, exceptions: recurrence ? base.exceptions : undefined };
}
const minutesOf = f => (new Date(`${f.endDate}T${f.allDay ? '00:00' : f.endTime}`) - new Date(`${f.startDate}T${f.allDay ? '00:00' : f.startTime}`)) / 60000;

export function EventDialog({ ctx, calendars, projects, onClose, onSave, onDelete, onDuplicate }) {
  const { event, isNew, recurring } = ctx;
  const [f, setF] = useState(() => formOf(event)), [scope, setScope] = useState('this'), [error, setError] = useState(''), [asking, setAsking] = useState(false), [busy, setBusy] = useState(false);
  const change = (key, value) => setF(v => ({ ...v, [key]: value }));
  const repeat = (key, value) => setF(v => ({ ...v, repeat: { ...v.repeat, [key]: value } }));
  // Moving the start moves the end with it, so the length of the event stays put.
  const setStart = (key, value) => setF(v => {
    const length = Math.max(0, minutesOf(v)), next = { ...v, [key]: value }, begin = new Date(`${next.startDate}T${next.allDay ? '00:00' : next.startTime}`);
    if (Number.isNaN(begin.getTime())) return next;
    const finish = new Date(begin.getTime() + length * 60000);
    return { ...next, endDate: dateKey(finish), endTime: `${String(finish.getHours()).padStart(2, '0')}:${String(finish.getMinutes()).padStart(2, '0')}` };
  });
  const toggleReminder = minutes => change('reminders', f.reminders.includes(minutes) ? f.reminders.filter(m => m !== minutes) : [...f.reminders, minutes].sort((a, b) => a - b));
  const calendar = calendars.find(c => c.id === f.calendarId) || calendars[0];
  async function submit(e) {
    e.preventDefault();
    if (!f.title.trim()) { setError('Give the event a title.'); return; }
    setBusy(true);
    try { await onSave(recordOf(f, event), scope); } catch (err) { setError(err.message); setBusy(false); }
  }
  async function remove(chosen) { setBusy(true); try { await onDelete(chosen); } catch (err) { setError(err.message); setBusy(false); } }
  useEffect(() => { if (f.repeat.kind === 'weekly' && !f.repeat.byDay.length) repeat('byDay', [parseKey(f.startDate).getDay()]); }, [f.repeat.kind]);
  return <Modal wide title={isNew ? 'New event' : 'Edit event'} subtitle={recurring ? 'This event repeats. Choose how your change applies.' : undefined} onClose={onClose}>
    <form className="event-form" onSubmit={submit}>
      <input className="event-title" autoFocus required placeholder="Add a title" aria-label="Event title" value={f.title} onChange={e => change('title', e.target.value)}/>
      <div className="event-row"><label className="event-calendar"><i style={{ background: f.color || calendar?.color }}/><select aria-label="Calendar" value={f.calendarId} onChange={e => change('calendarId', e.target.value)}>{calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="settings-check"><input type="checkbox" checked={f.allDay} onChange={e => change('allDay', e.target.checked)}/><span>All day</span></label></div>
      <div className="event-times">
        <input type="date" aria-label="Start date" required value={f.startDate} onChange={e => setStart('startDate', e.target.value)}/>{!f.allDay && <input type="time" aria-label="Start time" required value={f.startTime} onChange={e => setStart('startTime', e.target.value)}/>}
        <span>to</span>
        {!f.allDay && <input type="time" aria-label="End time" required value={f.endTime} onChange={e => change('endTime', e.target.value)}/>}<input type="date" aria-label="End date" required min={f.startDate} value={f.endDate} onChange={e => change('endDate', e.target.value)}/>
      </div>
      <div className="event-field"><Repeat size={15}/><div className="event-repeat">
        <select aria-label="Repeat" value={f.repeat.kind} onChange={e => repeat('kind', e.target.value)}>{REPEATS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>
        {['daily', 'weekly', 'monthly', 'yearly'].includes(f.repeat.kind) && <label className="event-every">every<input type="number" min="1" max="99" aria-label="Repeat interval" value={f.repeat.interval} onChange={e => repeat('interval', e.target.value)}/>{{ daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[f.repeat.kind]}{Number(f.repeat.interval) > 1 ? 's' : ''}</label>}
        {f.repeat.kind === 'weekly' && <div className="event-days" role="group" aria-label="Repeat on">{WEEKDAY_NAMES.map((n, d) => <button type="button" key={n} className={f.repeat.byDay.includes(d) ? 'on' : ''} aria-pressed={f.repeat.byDay.includes(d)} onClick={() => repeat('byDay', f.repeat.byDay.includes(d) ? f.repeat.byDay.filter(x => x !== d) : [...f.repeat.byDay, d].sort())}>{n[0]}</button>)}</div>}
        {f.repeat.kind !== 'none' && <div className="event-ends"><select aria-label="Repeat ends" value={f.repeat.ends} onChange={e => repeat('ends', e.target.value)}><option value="never">Never ends</option><option value="until">Ends on</option><option value="count">Ends after</option></select>
          {f.repeat.ends === 'until' && <input type="date" aria-label="Repeat until" min={f.startDate} required value={f.repeat.until} onChange={e => repeat('until', e.target.value)}/>}
          {f.repeat.ends === 'count' && <label className="event-every"><input type="number" min="1" max="1000" aria-label="Repeat count" value={f.repeat.count} onChange={e => repeat('count', e.target.value)}/>times</label>}</div>}
      </div></div>
      <div className="event-field top"><Bell size={15}/><div className="event-chips" role="group" aria-label="Reminders">{REMINDERS.map(([m, label]) => <button type="button" key={m} className={f.reminders.includes(m) ? 'on' : ''} aria-pressed={f.reminders.includes(m)} onClick={() => toggleReminder(m)}>{label}</button>)}{!f.reminders.length && <small>No reminder</small>}</div></div>
      <div className="event-field"><MapPin size={15}/><input placeholder="Add a location" aria-label="Location" value={f.location} onChange={e => change('location', e.target.value)}/></div>
      <div className="event-field top"><AlignLeft size={15}/><textarea rows={3} placeholder="Add notes" aria-label="Notes" value={f.notes} onChange={e => change('notes', e.target.value)}/></div>
      <div className="event-field"><FolderOpen size={15}/><select aria-label="Project" value={f.projectId} onChange={e => change('projectId', e.target.value)}><option value="">No project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <div className="event-swatches" role="group" aria-label="Colour"><button type="button" className={`reset ${!f.color ? 'on' : ''}`} title="Use the calendar colour" style={{ background: calendar?.color }} onClick={() => change('color', '')}/>{SWATCHES.map(c => <button type="button" key={c} className={f.color === c ? 'on' : ''} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => change('color', c)}/>)}</div></div>
      {recurring && !isNew && <fieldset className="event-scope"><legend>Apply changes to</legend>{[['this', 'This event'], ['following', 'This and following events'], ['all', 'All events']].map(([v, label]) => <label key={v}><input type="radio" name="scope" checked={scope === v} onChange={() => setScope(v)}/>{label}</label>)}</fieldset>}
      {asking && <fieldset className="event-scope danger"><legend>Delete</legend>{[['this', 'This event'], ['following', 'This and following events'], ['all', 'All events']].map(([v, label]) => <button type="button" key={v} className="button secondary small-button" disabled={busy} onClick={() => remove(v)}>{label}</button>)}<button type="button" className="text-button" onClick={() => setAsking(false)}>Keep</button></fieldset>}
      {error && <p className="inline-error">{error}</p>}
      <div className="modal-footer">
        {!isNew && <><button type="button" className="button danger-quiet" disabled={busy} onClick={() => recurring ? setAsking(true) : remove('all')}><Trash2 size={14}/>Delete</button><button type="button" className="button secondary" onClick={() => onDuplicate(recordOf(f, event))}><Copy size={14}/>Duplicate</button></>}
        <button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{isNew ? 'Add event' : 'Save'}</button>
      </div>
    </form>
  </Modal>;
}

export function ScopeDialog({ title, onChoose, onClose }) {
  return <Modal title={title} subtitle="This event repeats. Choose how the change applies." onClose={onClose}><div className="scope-choices">{[['this', 'This event', 'Only this date changes.'], ['following', 'This and following events', 'This date and every later one.'], ['all', 'All events', 'The whole series moves.']].map(([v, label, hint]) => <button key={v} className="button secondary" onClick={() => onChoose(v)}><strong>{label}</strong><small>{hint}</small></button>)}</div></Modal>;
}

export function CalendarDialog({ calendar, count, others, onClose, onSave, onDelete }) {
  const [draft, setDraft] = useState(calendar), [error, setError] = useState(''), [confirm, setConfirm] = useState(false), [moveTo, setMoveTo] = useState('');
  return <Modal title={calendar.isNew ? 'New calendar' : 'Edit calendar'} onClose={onClose}>
    <form onSubmit={async e => { e.preventDefault(); try { await onSave({ id: draft.id, name: draft.name.trim(), color: draft.color, visible: draft.visible !== false }); } catch (err) { setError(err.message); } }}>
      <label className="form-label">Name<input required autoFocus maxLength={60} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}/></label>
      <div className="form-label">Colour</div><div className="event-swatches big">{SWATCHES.map(c => <button type="button" key={c} className={draft.color === c ? 'on' : ''} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => setDraft(d => ({ ...d, color: c }))}/>)}<input type="color" aria-label="Custom colour" value={draft.color} onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}/></div>
      {confirm && <fieldset className="event-scope danger"><legend>{count} event{count === 1 ? '' : 's'} in this calendar</legend><select aria-label="Move events to" value={moveTo} onChange={e => setMoveTo(e.target.value)}><option value="">Delete them with the calendar</option>{others.map(c => <option key={c.id} value={c.id}>Move them to {c.name}</option>)}</select><button type="button" className="button danger" onClick={async () => { try { await onDelete(moveTo || null); } catch (err) { setError(err.message); } }}><Trash2 size={14}/>Delete calendar</button><button type="button" className="text-button" onClick={() => setConfirm(false)}>Keep</button></fieldset>}
      {error && <p className="inline-error">{error}</p>}
      <div className="modal-footer">{!calendar.isNew && others.length > 0 && <button type="button" className="button danger-quiet" onClick={() => setConfirm(true)}><Trash2 size={14}/>Delete</button>}<button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{calendar.isNew ? 'Create' : 'Save'}</button></div>
    </form>
  </Modal>;
}

export function MiniMonth({ state, calendars, prefs, today, selected, anchor, onPick }) {
  const [month, setMonth] = useState(() => new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  useEffect(() => { setMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1)); }, [anchor.getFullYear(), anchor.getMonth()]);
  const start = startOfWeek(month, prefs.weekStart), days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const busy = useMemo(() => new Set(buildItems(state, calendars, { ...prefs, showRuns: false }, days[0], addDays(days[41], 1)).flatMap(i => { const out = []; for (let d = startOfDay(i.start); d < i.end && out.length < 40; d = addDays(d, 1)) out.push(dateKey(d)); return out; })), [state.events, state.todos, calendars, prefs.showTasks, dateKey(days[0])]);
  const names = Array.from({ length: 7 }, (_, i) => WEEKDAY_NAMES[(prefs.weekStart + i) % 7][0]);
  return <div className="mini-month">
    <header><b>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b><button aria-label="Previous month" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}><ChevronLeft size={14}/></button><button aria-label="Next month" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}><ChevronRight size={14}/></button></header>
    <div className="mini-grid">{names.map((n, i) => <span key={i} className="mini-name">{n}</span>)}{days.map(d => { const key = dateKey(d); return <button key={key} className={`${d.getMonth() !== month.getMonth() ? 'out' : ''} ${key === dateKey(today) ? 'today' : ''} ${key === selected ? 'selected' : ''} ${busy.has(key) ? 'busy' : ''}`} aria-label={d.toDateString()} onClick={() => onPick(d)}>{d.getDate()}</button>; })}</div>
  </div>;
}

export function PrefsPopover({ prefs, onChange, onClose }) {
  const row = (label, control) => <label className="pref-row"><span>{label}</span>{control}</label>;
  const check = key => <input type="checkbox" checked={prefs[key]} onChange={e => onChange({ [key]: e.target.checked })}/>;
  return <div className="cal-popover prefs" role="dialog" aria-label="Calendar preferences">
    <header><b>Preferences</b><button className="icon-button" aria-label="Close preferences" onClick={onClose}><X size={14}/></button></header>
    {row('Week starts on', <select value={prefs.weekStart} onChange={e => onChange({ weekStart: Number(e.target.value) })}><option value={0}>Sunday</option><option value={1}>Monday</option><option value={6}>Saturday</option></select>)}
    {row('Show week numbers', check('weekNumbers'))}{row('Show weekends', check('showWeekends'))}{row('Show my tasks', check('showTasks'))}{row('Show agent tasks', check('showRuns'))}
    {row('New event length', <select value={prefs.defaultDuration} onChange={e => onChange({ defaultDuration: Number(e.target.value) })}>{[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}</select>)}
    {row('Default reminder', <select value={prefs.defaultReminder ?? ''} onChange={e => onChange({ defaultReminder: e.target.value === '' ? null : Number(e.target.value) })}><option value="">None</option>{REMINDERS.slice(0, 8).map(([m, label]) => <option key={m} value={m}>{label}</option>)}</select>)}
  </div>;
}
