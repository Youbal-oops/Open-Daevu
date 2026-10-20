import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Sparkles, CheckSquare, Trash2, PanelLeftClose, PanelLeftOpen, Search as SearchIcon, Settings2, Upload, Download, Clock3, List as ListIcon, X, ChevronDown, Bot, SlidersHorizontal } from 'lucide-react';
import { api } from './api';
import { Modal, uid } from './ui';
import { useContextMenu } from './context-menu';
import { eventStart, eventEnd } from '../shared/calendar.mjs';
import { addDays, dateKey, daysBetween, parseKey, startOfDay, startOfWeek, stamp, timeKey, buildItems, calendarsOf, prefsOf, visibleOffsets, parseQuickAdd } from './calendar-core';
import { ScrollMonths } from './calendar-scroll';
import { TimeGrid, Agenda } from './calendar-time';
import { EventDialog, ScopeDialog, CalendarDialog, MiniMonth, PrefsPopover, SWATCHES } from './calendar-dialogs';
import './calendar.css';

export { occurrences } from './calendar-core';

const VIEWS = [['scroll', 'Scroll'], ['week', 'Week'], ['day', 'Day'], ['agenda', 'Agenda']];

function useToday() {
  const [today, setToday] = useState(() => startOfDay(new Date()));
  useEffect(() => { const timer = setInterval(() => { const now = startOfDay(new Date()); setToday(previous => dateKey(previous) === dateKey(now) ? previous : now); }, 60000); return () => clearInterval(timer); }, []);
  return today;
}

export function CalendarView({ state, act, perform, onEditSchedule, onNewSchedule, onAsk, onAgentTasks }) {
  const prefs = prefsOf(state), calendars = calendarsOf(state), today = useToday(), menu = useContextMenu();
  const [view, setViewState] = useState(prefs.view), [selected, setSelected] = useState(dateKey(today)), [anchor, setAnchor] = useState(today), [title, setTitle] = useState('');
  const [editor, setEditor] = useState(null), [todo, setTodo] = useState(null), [scopeAsk, setScopeAsk] = useState(null), [calendarDialog, setCalendarDialog] = useState(null), [prefsOpen, setPrefsOpen] = useState(false);
  const [rail, setRail] = useState(() => { try { return localStorage.getItem('rw-cal-rail') !== 'no'; } catch { return true; } }), [query, setQuery] = useState(''), [quick, setQuick] = useState(''), [flash, setFlash] = useState('');
  const scroll = useRef(null), searchRef = useRef(null), quickRef = useRef(null);
  const focus = parseKey(selected), defaultCalendar = (calendars.find(c => c.visible !== false) || calendars[0]).id;
  const setPrefs = patch => act({ type: 'settings', value: { calendar: patch } });
  const setView = next => { setViewState(next); if (next !== prefs.view) setPrefs({ view: next }).catch(() => {}); };
  const pick = date => { setSelected(dateKey(date)); setAnchor(date); };
  const jump = date => { pick(date); if (view === 'scroll') scroll.current?.scrollTo(date); };
  const openDay = date => { setViewState('day'); pick(date); };
  const flashDay = key => { setFlash(key); setTimeout(() => setFlash(''), 2200); };
  useEffect(() => { if (view === 'scroll' && dateKey(focus) !== dateKey(today)) setTimeout(() => scroll.current?.scrollTo(focus, false), 30); }, [view]);

  // ---- what is shown
  const offsets = useMemo(() => visibleOffsets(prefs), [prefs.showWeekends, prefs.weekStart]);
  const weekStart = startOfWeek(focus, prefs.weekStart), days = view === 'day' ? [focus] : offsets.map(o => addDays(weekStart, o));
  const shortDate = (d, year) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) }), first = days[0], last = days.at(-1);
  const weekLabel = first.getFullYear() !== last.getFullYear() ? `${shortDate(first, true)} – ${shortDate(last, true)}` : first.getMonth() === last.getMonth() ? `${shortDate(first)} – ${last.getDate()}, ${last.getFullYear()}` : `${shortDate(first)} – ${shortDate(last)}, ${last.getFullYear()}`;
  const periodLabel = view === 'week' ? weekLabel : view === 'day' ? focus.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : view === 'agenda' ? 'Agenda' : title;
  const agendaItems = useMemo(() => view === 'agenda' ? buildItems(state, calendars, prefs, startOfDay(focus), addDays(startOfDay(focus), 75)) : [], [view, selected, state.events, state.todos, state.schedules, calendars, prefs.showTasks, prefs.showRuns]);
  const needle = query.trim().toLowerCase();
  const results = useMemo(() => needle ? buildItems(state, calendars, prefs, addDays(today, -730), addDays(today, 730)).filter(i => `${i.title} ${i.event?.location || ''} ${i.event?.notes || ''}`.toLowerCase().includes(needle)).slice(0, 250) : [], [needle, state.events, state.todos, calendars]);

  // ---- creating, opening, saving
  const startEditor = (event, extra = {}) => setEditor({ isNew: true, recurring: false, event: { id: uid(), calendarId: defaultCalendar, title: '', allDay: false, location: '', notes: '', reminders: prefs.defaultReminder == null ? [] : [prefs.defaultReminder], ...event }, ...extra });
  const createSpan = (start, end, allDay) => allDay ? startEditor({ allDay: true, start: dateKey(start), end: dateKey(end) }) : startEditor({ start: stamp(start), end: stamp(end) });
  const newEvent = (date = focus) => { const begin = new Date(date); begin.setHours(date.getHours() || 9, 0, 0, 0); if (!begin.getHours()) begin.setHours(9); createSpan(begin, new Date(begin.getTime() + prefs.defaultDuration * 60000), false); };
  const createRange = (a, b, double) => { if (double || a !== b) startEditor({ allDay: true, start: a, end: b }); else pick(parseKey(a)); };
  const openItem = item => {
    if (item.kind === 'task') return setTodo(item.todo);
    if (item.kind === 'run') return onEditSchedule(item.schedule);
    const series = item.event;
    setEditor({ isNew: false, recurring: item.recurring, series, occurrence: item.start, event: { ...series, start: item.allDay ? dateKey(item.start) : stamp(item.start), end: item.allDay ? dateKey(addDays(item.end, -1)) : stamp(item.end) } });
  };
  // Saves an edited copy of one date of a series: just that date, that date onwards, or the whole series.
  async function commitRecord(record, series, occurrence, scope) {
    if (scope === 'this') return act({ type: 'event:occurrence', value: { id: series.id, date: dateKey(occurrence), event: { ...record, id: uid(), recurrence: null, exceptions: undefined } } });
    if (scope === 'following') return act({ type: 'event:following', value: { id: series.id, date: dateKey(occurrence), event: { ...record, id: uid(), exceptions: undefined } } });
    const begin = record.allDay ? parseKey(record.start) : new Date(`${record.start}:00`), finish = eventEnd(record), base = eventStart(series);
    const length = finish - begin, same = Boolean(record.allDay) === Boolean(series.allDay);
    const start = !same ? begin : series.allDay ? addDays(base, daysBetween(occurrence, begin)) : new Date(base.getTime() + (begin - occurrence));
    const end = record.allDay ? addDays(start, daysBetween(begin, finish) - 1) : new Date(start.getTime() + length);
    return act({ type: 'event', value: { ...record, id: series.id, start: record.allDay ? dateKey(start) : stamp(start), end: record.allDay ? dateKey(end) : stamp(end), exceptions: series.exceptions } });
  }
  const saveFromDialog = async (record, scope) => {
    if (editor.isNew || !editor.recurring) await act({ type: 'event', value: record }); else await commitRecord(record, editor.series, editor.occurrence, scope);
    setEditor(null); flashDay(record.start.slice(0, 10));
  };
  const deleteFromDialog = async scope => {
    const series = editor.series || editor.event;
    if (!editor.recurring || scope === 'all') await act({ type: 'event:delete', value: series.id });
    else await act({ type: scope === 'this' ? 'event:occurrence' : 'event:following', value: { id: series.id, date: dateKey(editor.occurrence) } });
    setEditor(null);
  };
  const duplicate = record => { setEditor(null); setTimeout(() => startEditor({ ...record, id: uid(), title: `${record.title} copy`, exceptions: undefined, createdAt: undefined }), 0); };
  const toggleTask = task => perform(() => act({ type: 'todo', value: { ...task, done: !task.done } }));
  // A move from either grid: tasks change their date, events move, and a repeating event first asks how far the change reaches.
  const moveItem = (item, newStart, newEnd) => {
    if (item.kind === 'task') return perform(() => act({ type: 'todo', value: { ...item.todo, date: dateKey(newStart), time: item.todo.time ? timeKey(newStart) : '' } }));
    if (item.kind !== 'event') return;
    const record = { ...item.event, start: item.allDay ? dateKey(newStart) : stamp(newStart), end: item.allDay ? dateKey(addDays(newEnd, -1)) : stamp(newEnd) };
    if (!item.recurring) return perform(() => act({ type: 'event', value: record }));
    setScopeAsk({ title: 'Move repeating event', apply: scope => perform(() => commitRecord(record, item.event, item.start, scope)) });
  };
  const dropItem = (item, delta) => { if (delta) moveItem(item, addDays(item.start, delta), addDays(item.end, delta)); };

  // ---- quick add
  const parsed = useMemo(() => quick.trim() ? parseQuickAdd(quick, new Date()) : null, [quick]);
  const preview = parsed?.title ? `${parseKey(parsed.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}${parsed.allDay ? ' · all day' : ` · ${new Date(`${parsed.start}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – ${new Date(`${parsed.end}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}${parsed.recurrence ? ' · repeats' : ''}${parsed.location ? ` · ${parsed.location}` : ''}` : '';
  const submitQuick = e => {
    e.preventDefault();
    if (!parsed?.title) return;
    const event = { id: uid(), calendarId: defaultCalendar, ...parsed, reminders: prefs.defaultReminder == null ? [] : [prefs.defaultReminder] };
    perform(async () => { await act({ type: 'event', value: event }); setQuick(''); jump(parseKey(event.start)); flashDay(event.start.slice(0, 10)); });
  };

  // ---- navigation
  const step = direction => {
    if (view === 'scroll') scroll.current?.scrollTo(new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1));
    else pick(addDays(focus, direction * (view === 'week' ? 7 : view === 'day' ? 1 : 14)));
  };
  const goToday = () => { pick(today); scroll.current?.scrollTo(today); };
  const keys = e => {
    if (editor || todo || scopeAsk || calendarDialog || e.target.closest('input, textarea, select, button') || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase(), view = { m: 'scroll', w: 'week', d: 'day', a: 'agenda' }[key];
    if (view) setView(view);
    else if (key === 't') goToday();
    else if (key === 'n') { e.preventDefault(); newEvent(); }
    else if (key === '/') { e.preventDefault(); searchRef.current?.focus(); }
    else if (key === 'q') { e.preventDefault(); quickRef.current?.focus(); }
    else if (key === 'arrowright' || key === 'j') step(1);
    else if (key === 'arrowleft' || key === 'k') step(-1);
  };

  // ---- calendars, import and export
  const toggleCalendar = c => perform(() => act({ type: 'calendar', value: { ...c, visible: c.visible === false } }));
  const importFile = () => perform(async () => {
    const { events } = await api.calendarImport();
    if (!events.length) return;
    const id = uid();
    await act({ type: 'calendar', value: { id, name: 'Imported', color: SWATCHES[7], visible: true } });
    await act({ type: 'events:import', value: { calendarId: id, events } });
  }, 'Imported into a new "Imported" calendar. Rename or merge it any time.');
  const exportFile = () => perform(async () => { const count = await api.calendarExport(calendars.filter(c => c.visible !== false).map(c => c.id)); if (count < 0) return; }, 'Calendar exported.');
  const addMenu = e => { const box = e.currentTarget.getBoundingClientRect(); menu.open({ preventDefault() {}, stopPropagation() {}, clientX: box.left, clientY: box.bottom + 4 }, [
    { label: 'New event', icon: Plus, hint: 'N', onClick: () => newEvent() },
    { label: 'New task for me', icon: CheckSquare, onClick: () => setTodo({ date: selected }) },
    ...(state.settings.aiAgents === false ? [] : [{ label: 'New agent task', icon: Bot, onClick: () => onNewSchedule(selected) }, 'separator', { label: 'Ask AI to plan…', icon: Sparkles, onClick: () => onAsk(selected) }])
  ]); };

  const body = needle ? <Agenda items={results} today={today} onOpen={openItem} onToggleTask={toggleTask} heading={`${results.length} result${results.length === 1 ? '' : 's'} for “${query.trim()}”`} empty="Nothing matches that search."/>
    : view === 'scroll' ? <ScrollMonths ref={scroll} state={state} calendars={calendars} prefs={prefs} today={today} selected={selected} onSelect={key => pick(parseKey(key))} onTitle={(label, mid) => { setTitle(label); setAnchor(mid); }} onCreateRange={createRange} onOpen={openItem} onToggleTask={toggleTask} onDropItem={dropItem} onDay={openDay} highlight={flash}/>
    : view === 'agenda' ? <Agenda items={agendaItems} today={today} onOpen={openItem} onToggleTask={toggleTask} empty="Nothing planned in the next few weeks. Press N to add an event, or Q to type one."/>
    : <TimeGrid state={state} calendars={calendars} prefs={prefs} days={days} today={today} selected={selected} highlight={flash} onOpen={openItem} onToggleTask={toggleTask} onCreate={createSpan} onMove={moveItem} onDay={openDay} onSelectDay={date => pick(date)}/>;

  return <div className="cal-app" tabIndex={-1} onKeyDown={keys}>
    <div className="cal-toolbar">
      <button className="icon-button" aria-label={rail ? 'Hide sidebar' : 'Show sidebar'} onClick={() => setRail(v => { try { localStorage.setItem('rw-cal-rail', v ? 'no' : 'yes'); } catch {} return !v; })}>{rail ? <PanelLeftClose size={16}/> : <PanelLeftOpen size={16}/>}</button>
      <button className="button secondary small-button" onClick={goToday}>Today</button>
      <button className="icon-button" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft size={17}/></button>
      <button className="icon-button" aria-label="Next" onClick={() => step(1)}><ChevronRight size={17}/></button>
      <h2 className="cal-title" aria-live="polite">{needle ? 'Search' : periodLabel}</h2>
      <span className="cal-gap"/>
      <form className="cal-quick" onSubmit={submitQuick}><Sparkles size={14}/><input ref={quickRef} placeholder="Quick add: Lunch with Sam tomorrow 1pm" aria-label="Quick add an event" value={quick} onChange={e => setQuick(e.target.value)}/>{preview && <span className="cal-quick-preview" role="status">{preview} · Enter to add</span>}</form>
      <label className="cal-search"><SearchIcon size={14}/><input ref={searchRef} type="search" placeholder="Search events" aria-label="Search events" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }}/>{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={12}/></button>}</label>
      <div className="segmented" role="group" aria-label="Calendar view">{VIEWS.map(([id, label]) => <button key={id} className={view === id ? 'active' : ''} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}</div>
      <div className="cal-add"><button className="button primary small-button" onClick={() => newEvent()}><Plus size={14}/>Event</button><button className="button primary small-button caret" aria-label="More ways to add" onClick={addMenu}><ChevronDown size={13}/></button></div>
      <div className="cal-prefs-wrap"><button className={`icon-button ${prefsOpen ? 'on' : ''}`} aria-label="Calendar preferences" aria-expanded={prefsOpen} onClick={() => setPrefsOpen(v => !v)}><SlidersHorizontal size={16}/></button>{prefsOpen && <PrefsPopover prefs={prefs} onChange={patch => setPrefs(patch)} onClose={() => setPrefsOpen(false)}/>}</div>
    </div>
    <div className="cal-shell">
      {rail && <aside className="cal-rail" aria-label="Calendar sidebar">
        <MiniMonth state={state} calendars={calendars} prefs={prefs} today={today} selected={selected} anchor={anchor} onPick={date => { jump(date); if (view === 'agenda' || view === 'week' || view === 'day') pick(date); }}/>
        <section><header><b>My calendars</b><button aria-label="New calendar" onClick={() => setCalendarDialog({ isNew: true, id: uid(), name: '', color: SWATCHES[calendars.length % SWATCHES.length], visible: true })}><Plus size={14}/></button></header>
          {calendars.map(c => <div className="cal-list-row" key={c.id}><label><input type="checkbox" checked={c.visible !== false} onChange={() => toggleCalendar(c)} style={{ accentColor: c.color }}/><span>{c.name}</span></label><button aria-label={`Edit ${c.name}`} onClick={() => setCalendarDialog(c)}><Settings2 size={13}/></button></div>)}</section>
        <section><header><b>Also show</b></header>
          <label className="cal-check"><input type="checkbox" checked={prefs.showTasks} onChange={e => setPrefs({ showTasks: e.target.checked })}/><CheckSquare size={13}/>My tasks</label>
          <label className="cal-check"><input type="checkbox" checked={prefs.showRuns} onChange={e => setPrefs({ showRuns: e.target.checked })}/><Bot size={13}/>Agent tasks</label>
          <button className="text-button cal-link" onClick={onAgentTasks}><ListIcon size={13}/>Manage agent tasks</button></section>
        <section className="cal-rail-actions"><button onClick={importFile}><Upload size={13}/>Import .ics</button><button onClick={exportFile}><Download size={13}/>Export .ics</button></section>
        <p className="cal-tip">Press <kbd>N</kbd> for a new event, <kbd>Q</kbd> to type one, <kbd>/</kbd> to search.</p>
      </aside>}
      <div className="cal-main">{body}</div>
    </div>
    {menu.element}
    {editor && <EventDialog ctx={editor} calendars={calendars} projects={state.projects.filter(p => !p.archived)} onClose={() => setEditor(null)} onSave={saveFromDialog} onDelete={deleteFromDialog} onDuplicate={duplicate}/>}
    {scopeAsk && <ScopeDialog title={scopeAsk.title} onClose={() => setScopeAsk(null)} onChoose={scope => { const ask = scopeAsk; setScopeAsk(null); ask.apply(scope); }}/>}
    {calendarDialog && <CalendarDialog calendar={calendarDialog} count={(state.events || []).filter(e => e.calendarId === calendarDialog.id).length} others={calendars.filter(c => c.id !== calendarDialog.id)} onClose={() => setCalendarDialog(null)} onSave={async value => { await act({ type: 'calendar', value }); setCalendarDialog(null); }} onDelete={async moveTo => { await act({ type: 'calendar:delete', value: { id: calendarDialog.id, moveTo } }); setCalendarDialog(null); }}/>}
    {todo && <TodoDialog todo={todo} projects={state.projects} defaultProject={state.selectedProject} onClose={() => setTodo(null)} onSave={async value => { await act({ type: 'todo', value }); setTodo(null); }} onDelete={async id => { await act({ type: 'todo:delete', value: id }); setTodo(null); }}/>}
  </div>;
}

export function TodoDialog({ todo, projects, defaultProject, onClose, onSave, onDelete }) {
  const editing = Boolean(todo.id);
  const [draft, setDraft] = useState({ id: uid(), title: '', notes: '', time: '', projectId: defaultProject || '', done: false, createdBy: 'You', ...todo }), [error, setError] = useState('');
  const change = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  return <Modal title={editing ? 'Edit task' : 'New task'} subtitle="A task for you. It appears on the calendar but does not run an agent." onClose={onClose}><form onSubmit={async e => { e.preventDefault(); try { await onSave({ ...draft, title: draft.title.trim() }); } catch (err) { setError(err.message); } }}>
    <label className="form-label">Task<input required autoFocus placeholder="e.g. Review the competitor summary" value={draft.title} onChange={e => change('title', e.target.value)}/></label>
    <div className="form-grid"><label>Date<input required type="date" value={draft.date} onChange={e => change('date', e.target.value)}/></label><label>Time (optional)<input type="time" value={draft.time} onChange={e => change('time', e.target.value)}/></label></div>
    <label className="form-label">Project (optional)<select value={draft.projectId} onChange={e => change('projectId', e.target.value)}><option value="">No project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label className="form-label">Notes<textarea rows={3} placeholder="Anything you want to remember" value={draft.notes} onChange={e => change('notes', e.target.value)}/></label>
    {editing && <label className="settings-check"><input type="checkbox" checked={draft.done} onChange={e => change('done', e.target.checked)}/><span>Done</span></label>}
    {error && <p className="inline-error">{error}</p>}
    <div className="modal-footer">{editing && <button type="button" className="button danger" onClick={() => onDelete(draft.id)}><Trash2 size={14}/>Delete</button>}<button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">{editing ? 'Save task' : 'Add task'}</button></div></form></Modal>;
}

export function AskAIDialog({ state, day, onClose, perform }) {
  const project = state.projects.find(p => p.id === state.selectedProject) || state.projects[0];
  const [projectId, setProjectId] = useState(project?.id || ''), [request, setRequest] = useState(''), [kind, setKind] = useState('todo'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const chosen = state.projects.find(p => p.id === projectId), assigned = state.agents.filter(a => chosen?.agentIds.includes(a.id));
  const [agentId, setAgentId] = useState(assigned[0]?.id || '');
  const agent = assigned.find(a => a.id === agentId) || assigned[0];
  async function submit(e) {
    e.preventDefault(); if (!agent) return; setBusy(true); setError('');
    const todayText = new Date().toDateString();
    const what = kind === 'todo' ? 'Add 1 to 6 concrete tasks for the user. Put them in the "todos" array of one research-actions block, each with a YYYY-MM-DD date, optional HH:MM local time, and short notes.' : kind === 'event' ? 'Add the plan as calendar events in the "events" array of one research-actions block: timed events use start and end like 2026-11-04T14:00, all-day events use allDay true with YYYY-MM-DD dates.' : 'Create the work as scheduled tasks for yourself using the "schedules" array of one research-actions block.';
    const instruction = `[Calendar planning] The user asked you to plan calendar items.\nRequest: ${request.trim()}\nToday is ${todayText}.${day ? ` The user is looking at ${day}; prefer dates on or after it.` : ''}\n${what}\nReply in one or two sentences saying what you added. Do not do extra research.`;
    try { await api.start(projectId, agent.id, instruction, { effort: 'low' }); onClose(true); } catch (err) { setError(err.message); setBusy(false); }
  }
  return <Modal title="Ask AI to plan" subtitle="Describe what you need and an agent will add it to your calendar." onClose={() => onClose(false)}><form onSubmit={submit}>
    <label className="form-label">What should be planned?<textarea required autoFocus rows={4} placeholder="e.g. A two-week plan to audit our top 10 landing pages" value={request} onChange={e => setRequest(e.target.value)}/></label>
    <div className="form-grid"><label>Project<select value={projectId} onChange={e => { setProjectId(e.target.value); setAgentId(state.agents.find(a => state.projects.find(p => p.id === e.target.value)?.agentIds.includes(a.id))?.id || ''); }}>{state.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Agent<select value={agent?.id || ''} onChange={e => setAgentId(e.target.value)}>{!assigned.length && <option value="">Assign an agent first</option>}{assigned.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div>
    <div className="form-label">Add them as</div><div className="segmented-choice"><button type="button" className={kind === 'event' ? 'active' : ''} onClick={() => setKind('event')}><Clock3 size={15}/>Calendar events</button><button type="button" className={kind === 'todo' ? 'active' : ''} onClick={() => setKind('todo')}><CheckSquare size={15}/>Tasks for me</button><button type="button" className={kind === 'schedule' ? 'active' : ''} onClick={() => setKind('schedule')}><Bot size={15}/>Scheduled agent tasks</button></div>
    <p className="field-help">{agent ? `${agent.name} will reply in the project chat and add the items. Agent-created items are marked on the calendar.` : 'This project has no agent yet.'}</p>
    {error && <p className="inline-error">{error}</p>}
    <div className="modal-footer"><button type="button" className="button secondary" onClick={() => onClose(false)}>Cancel</button><button className="button primary" disabled={busy || !agent}><Sparkles size={15}/>{busy ? 'Asking…' : 'Plan it'}</button></div></form></Modal>;
}
