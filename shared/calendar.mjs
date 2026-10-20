// Calendar rules shared by the app and the main process: events, repeats, quick add, and .ics import and export.
// Times are local wall-clock strings ("2026-10-20T09:30"); all-day events use plain dates with an inclusive end date.
export const pad = n => String(n).padStart(2, '0');
export const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const timeKey = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const stamp = d => `${dateKey(d)}T${timeKey(d)}`;
export const parseKey = key => { const [y, m, d] = String(key).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
export const startOfDay = date => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
export const startOfWeek = (date, weekStart = 0) => { const d = startOfDay(date); d.setDate(d.getDate() - ((d.getDay() - weekStart + 7) % 7)); return d; };
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
const daysIn = (year, month) => new Date(year, month + 1, 0).getDate();
const DAY_MS = 86400000;

export const FREQS = ['daily', 'weekly', 'monthly', 'yearly'];
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

export function eventStart(event) { return event.allDay ? parseKey(event.start) : new Date(`${event.start}:00`); }
// The end as an exclusive instant: an all-day event ending on the 21st ends at midnight on the 22nd.
export function eventEnd(event) { return event.allDay ? addDays(parseKey(event.end || event.start), 1) : new Date(`${event.end || event.start}:00`); }

function occurrence(event, start) {
  const spanDays = event.allDay ? daysBetween(eventStart(event), eventEnd(event)) : 0;
  const end = event.allDay ? addDays(start, spanDays) : new Date(start.getTime() + (eventEnd(event) - eventStart(event)));
  return { key: `${event.id}@${dateKey(start)}`, event, start, end, allDay: Boolean(event.allDay), recurring: Boolean(event.recurrence) };
}

// Every occurrence of an event that overlaps [from, to). Repeats stop at `until` or after `count` occurrences.
export function expand(event, from, to, limit = 2000) {
  const first = eventStart(event), rule = event.recurrence, out = [];
  if (!(first instanceof Date) || Number.isNaN(first.getTime())) return out;
  const length = eventEnd(event) - first, skip = new Set(event.exceptions || []);
  const take = start => {
    if (skip.has(dateKey(start))) return true;
    const item = occurrence(event, start);
    if (item.end > from && item.start < to) out.push(item);
    return out.length < limit;
  };
  if (!rule || !FREQS.includes(rule.freq)) { take(first); return out; }
  const interval = Math.max(1, Math.min(99, Number(rule.interval) || 1)), until = rule.until && DATE_RE.test(rule.until) ? parseKey(rule.until) : null, count = Number(rule.count) > 0 ? Number(rule.count) : null;
  const clock = d => { const out2 = new Date(d); out2.setHours(first.getHours(), first.getMinutes(), 0, 0); return out2; };
  let produced = 0;
  const emit = start => {
    if (until && startOfDay(start) > until) return false;
    if (count && produced >= count) return false;
    produced++;
    if (start - to >= 0 && !event.allDay) return false;
    return take(start) && start < to;
  };
  // Without a count we can jump straight to the window; with one we must walk from the start so the count stays right.
  const lead = Math.max(0, Math.ceil((from - first - length) / DAY_MS));
  if (rule.freq === 'daily') {
    for (let n = count ? 0 : Math.floor(lead / interval); n < 100000; n++) { const day = addDays(first, n * interval); if (!emit(clock(day))) break; }
  } else if (rule.freq === 'weekly') {
    const days = (Array.isArray(rule.byDay) && rule.byDay.length ? [...new Set(rule.byDay.map(Number))].filter(d => d >= 0 && d <= 6) : [first.getDay()]).sort((a, b) => a - b);
    const base = startOfWeek(first, 0);
    for (let w = count ? 0 : Math.max(0, Math.floor(lead / 7 / interval) - 1); w < 20000; w++) {
      let stop = false;
      for (const d of days) {
        const day = addDays(base, w * interval * 7 + d);
        if (startOfDay(day) < startOfDay(first)) continue;
        if (!emit(clock(day))) { stop = true; break; }
      }
      if (stop) break;
    }
  } else if (rule.freq === 'monthly') {
    const startMonth = first.getFullYear() * 12 + first.getMonth();
    for (let n = count ? 0 : Math.max(0, Math.floor(lead / 31 / interval) - 1); n < 5000; n++) {
      const index = startMonth + n * interval, year = Math.floor(index / 12), month = index % 12;
      if (!emit(clock(new Date(year, month, Math.min(first.getDate(), daysIn(year, month)))))) break;
    }
  } else {
    for (let n = count ? 0 : Math.max(0, Math.floor(lead / 366 / interval) - 1); n < 500; n++) {
      const year = first.getFullYear() + n * interval;
      if (!emit(clock(new Date(year, first.getMonth(), Math.min(first.getDate(), daysIn(year, first.getMonth())))))) break;
    }
  }
  return out;
}

export function validateEvent(value, calendars = []) {
  if (!value || typeof value !== 'object') throw new Error('Invalid event.');
  if (!/^[a-zA-Z0-9-]+$/.test(value.id || '')) throw new Error('Invalid event.');
  const title = String(value.title || '').trim();
  if (!title) throw new Error('Give the event a title.');
  const allDay = Boolean(value.allDay), fits = allDay ? DATE_RE : DATETIME_RE;
  if (!fits.test(value.start || '')) throw new Error(allDay ? 'Choose a start date.' : 'Choose a start date and time.');
  const end = value.end && fits.test(value.end) ? value.end : value.start;
  if (end < value.start) throw new Error('The event cannot end before it starts.');
  const calendarId = value.calendarId || calendars[0]?.id || 'personal';
  if (calendars.length && !calendars.some(c => c.id === calendarId)) throw new Error('Choose one of your calendars.');
  let recurrence = null;
  if (value.recurrence) {
    const r = value.recurrence;
    if (!FREQS.includes(r.freq)) throw new Error('Choose how the event repeats.');
    recurrence = { freq: r.freq, interval: Math.max(1, Math.min(99, Math.round(Number(r.interval) || 1))) };
    if (r.freq === 'weekly' && Array.isArray(r.byDay) && r.byDay.length) recurrence.byDay = [...new Set(r.byDay.map(Number).filter(d => d >= 0 && d <= 6))].sort();
    if (r.until) { if (!DATE_RE.test(r.until)) throw new Error('Choose a valid end date for the repeat.'); recurrence.until = r.until; }
    else if (Number(r.count) > 0) recurrence.count = Math.min(1000, Math.round(Number(r.count)));
  }
  const reminders = [...new Set((Array.isArray(value.reminders) ? value.reminders : []).map(Number).filter(m => Number.isFinite(m) && m >= 0 && m <= 40320))].slice(0, 5);
  return {
    id: value.id, calendarId, title: title.slice(0, 200), start: value.start, end, allDay,
    location: String(value.location || '').slice(0, 300), notes: String(value.notes || '').slice(0, 8000),
    ...(recurrence ? { recurrence } : {}),
    ...(recurrence && Array.isArray(value.exceptions) ? { exceptions: value.exceptions.filter(k => DATE_RE.test(k)).slice(0, 500) } : {}),
    ...(reminders.length ? { reminders } : {}),
    ...(/^[a-zA-Z0-9-]+$/.test(value.projectId || '') ? { projectId: value.projectId } : {}),
    ...(/^#[0-9a-fA-F]{6}$/.test(value.color || '') ? { color: value.color.toLowerCase() } : {}),
    createdBy: String(value.createdBy || 'You').slice(0, 80), createdAt: value.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  };
}

// ---- quick add: "Lunch with Sam tomorrow 1pm for 90 min @Cafe", "Standup every weekday 9:30", "Dentist oct 28 3-4pm"
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthIndex = word => MONTHS.findIndex(m => m === word || m.slice(0, 3) === word.slice(0, 3) && word.length >= 3 && m.startsWith(word.slice(0, 3)));
export function parseQuickAdd(input, now = new Date()) {
  let text = ` ${String(input || '').trim()} `;
  const take = (re, fn) => { const m = re.exec(text); if (!m) return false; text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length); fn(m); return true; };
  const result = { title: '', allDay: false };
  let location = '';
  let recurrence = null;
  if (take(/\severy\s+(\d+)\s+(day|week|month|year)s?\b/i, m => { recurrence = { freq: { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }[m[2].toLowerCase()], interval: Number(m[1]) }; }));
  else if (take(/\severy\s+weekday\b/i, () => { recurrence = { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] }; }));
  else if (take(/\severy\s+(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i, m => { recurrence = { freq: 'weekly', interval: 1, byDay: [WEEKDAYS.findIndex(d => d.startsWith(m[1].toLowerCase()))] }; }));
  else if (take(/\s(?:every\s+day|daily)\b/i, () => { recurrence = { freq: 'daily', interval: 1 }; }));
  else if (take(/\s(?:every\s+week|weekly)\b/i, () => { recurrence = { freq: 'weekly', interval: 1 }; }));
  else if (take(/\s(?:every\s+month|monthly)\b/i, () => { recurrence = { freq: 'monthly', interval: 1 }; }));
  else if (take(/\s(?:every\s+year|yearly|annually)\b/i, () => { recurrence = { freq: 'yearly', interval: 1 }; }));
  let minutes = null;
  take(/\sfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)\b/i, m => { minutes = Math.round(Number(m[1]) * (/^h/i.test(m[2]) ? 60 : 1)); });
  if (take(/\sall[\s-]?day\b/i, () => { result.allDay = true; }));
  // time or time range
  let timeStart = null, timeEnd = null;
  const clock = (h, mm, ap) => { let hour = Number(h); const minute = Number(mm || 0); if (ap) { const pm = /^p/i.test(ap); if (hour === 12) hour = pm ? 12 : 0; else if (pm) hour += 12; } return hour > 23 || minute > 59 ? null : hour * 60 + minute; };
  take(/\s(?:at\s+|from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?=\s|$)/i, m => {
    const endAp = m[6], startAp = m[3] || (endAp && Number(m[1]) <= Number(m[4]) ? endAp : '');
    if (!m[3] && !m[6] && !m[2] && !m[5]) { text += ` ${m[0]} `; return; }
    timeStart = clock(m[1], m[2], startAp); timeEnd = clock(m[4], m[5], endAp);
  });
  if (timeStart == null) {
    if (!take(/\s(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?(?=\s|$)/i, m => { timeStart = clock(m[1], m[2], m[3]); }))
      if (!take(/\s(?:at\s+)?(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)(?=\s|$)/i, m => { timeStart = clock(m[1], 0, m[2]); }))
        if (!take(/\sat\s+(\d{1,2})(?=\s|$)/i, m => { const h = Number(m[1]); timeStart = clock(h < 7 ? h + 12 : h, 0, ''); }))
          if (!take(/\snoon\b/i, () => { timeStart = 720; })) take(/\smidnight\b/i, () => { timeStart = 0; });
  }
  // date
  let day = null;
  const base = startOfDay(now);
  if (take(/\s(\d{4})-(\d{2})-(\d{2})\b/, m => { day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); }));
  else if (take(/\stoday\b/i, () => { day = base; }));
  else if (take(/\stonight\b/i, () => { day = base; if (timeStart == null) timeStart = 19 * 60; }));
  else if (take(/\stomorrow\b/i, () => { day = addDays(base, 1); }));
  else if (take(/\sin\s+(\d+)\s+(day|week|month)s?\b/i, m => { day = m[2].toLowerCase() === 'month' ? new Date(base.getFullYear(), base.getMonth() + Number(m[1]), base.getDate()) : addDays(base, Number(m[1]) * (m[2].toLowerCase() === 'week' ? 7 : 1)); }));
  else if (take(/\s(next\s+|this\s+|on\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i, m => {
    const target = WEEKDAYS.findIndex(d => d.startsWith(m[2].toLowerCase()));
    let delta = (target - base.getDay() + 7) % 7;
    if (/^next/i.test(m[1] || '')) delta = delta === 0 ? 7 : delta + (target > base.getDay() ? 7 : 0);
    day = addDays(base, delta);
  }));
  else if (take(/\s(?:on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i, m => { day = new Date(m[3] ? Number(m[3]) : base.getFullYear(), monthIndex(m[1].toLowerCase()), Number(m[2])); if (!m[3] && day < base) day.setFullYear(day.getFullYear() + 1); }));
  else if (take(/\s(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:,?\s+(\d{4}))?\b/i, m => { day = new Date(m[3] ? Number(m[3]) : base.getFullYear(), monthIndex(m[2].toLowerCase()), Number(m[1])); if (!m[3] && day < base) day.setFullYear(day.getFullYear() + 1); }));
  else take(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, m => { const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : base.getFullYear(); day = new Date(year, Number(m[1]) - 1, Number(m[2])); if (!m[3] && day < base) day.setFullYear(day.getFullYear() + 1); });
  // What follows an @ is the place, once the date, time and length have been taken out of the sentence.
  take(/\s@\s?([^\n]+)$/, m => { location = m[1].trim(); });
  result.title = text.replace(/\s+(at|on|from|for|by|in)\s*$/i, '').replace(/^\s+(at|on|from)\s+/i, '').replace(/\s{2,}/g, ' ').trim();
  day = day || base;
  const hasTime = timeStart != null && !result.allDay;
  if (!hasTime) { result.allDay = true; result.start = dateKey(day); result.end = dateKey(minutes && minutes >= 1440 ? addDays(day, Math.ceil(minutes / 1440) - 1) : day); }
  else {
    const begin = new Date(day); begin.setHours(0, timeStart, 0, 0);
    const length = timeEnd != null ? (timeEnd - timeStart + 1440) % 1440 || 60 : minutes || 60, finish = new Date(begin.getTime() + length * 60000);
    result.start = stamp(begin); result.end = stamp(finish);
  }
  if (recurrence) result.recurrence = recurrence;
  if (location) result.location = location;
  return result;
}

// ---- .ics
const escapeText = value => String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const unescapeText = value => String(value || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const fold = line => { const out = []; let rest = line; while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74); } out.push(rest); return out.join('\r\n'); };
const icsDate = key => key.replaceAll('-', ''), icsLocal = value => value.replace(/[-:]/g, '') + '00';
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export function toIcs(events, name = 'Daevu') {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${name}//Calendar//EN`, 'CALSCALE:GREGORIAN'], now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@research-workspace`, `DTSTAMP:${now}`);
    if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${icsDate(e.start)}`, `DTEND;VALUE=DATE:${icsDate(dateKey(addDays(parseKey(e.end || e.start), 1)))}`);
    else lines.push(`DTSTART:${icsLocal(e.start)}`, `DTEND:${icsLocal(e.end || e.start)}`);
    lines.push(`SUMMARY:${escapeText(e.title)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.notes) lines.push(`DESCRIPTION:${escapeText(e.notes)}`);
    const r = e.recurrence;
    if (r) lines.push('RRULE:' + [`FREQ=${r.freq.toUpperCase()}`, r.interval > 1 && `INTERVAL=${r.interval}`, r.byDay?.length && `BYDAY=${r.byDay.map(d => BYDAY[d]).join(',')}`, r.until && `UNTIL=${icsDate(r.until)}`, r.count && `COUNT=${r.count}`].filter(Boolean).join(';'));
    if (r && e.exceptions?.length) lines.push(`EXDATE${e.allDay ? ';VALUE=DATE' : ''}:${e.exceptions.map(k => e.allDay ? icsDate(k) : icsDate(k) + 'T' + e.start.slice(11, 13) + e.start.slice(14, 16) + '00').join(',')}`);
    for (const minutes of e.reminders || []) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(e.title)}`, `TRIGGER:-PT${minutes}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function parseIcs(source, makeId = () => globalThis.crypto.randomUUID()) {
  const raw = String(source || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let current = null, alarm = null;
  const local = (value, zone) => {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value);
    if (!m) return null;
    if (m[4] == null) return { date: `${m[1]}-${m[2]}-${m[3]}`, allDay: true };
    let d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
    if (m[7]) d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])));
    return { date: dateKey(d), time: stamp(d), allDay: false };
  };
  for (const line of raw) {
    if (line === 'BEGIN:VEVENT') { current = { id: makeId(), reminders: [] }; continue; }
    if (line === 'END:VEVENT') {
      if (current?.start) { current.end ||= current.start; events.push(current); }
      current = null; continue;
    }
    if (!current) continue;
    if (line === 'BEGIN:VALARM') { alarm = true; continue; }
    if (line === 'END:VALARM') { alarm = null; continue; }
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon).split(';'), name = head[0].toUpperCase(), value = line.slice(colon + 1);
    if (alarm) { const t = /^-PT?(\d+)([MHD])$/i.exec(value.replace('-P', '-PT').replace('-PTT', '-PT')) || /^-P(?:T)?(\d+)([MHD])$/i.exec(value); if (name === 'TRIGGER' && t) current.reminders.push(Number(t[1]) * { M: 1, H: 60, D: 1440 }[t[2].toUpperCase()]); continue; }
    if (name === 'SUMMARY') current.title = unescapeText(value);
    else if (name === 'LOCATION') current.location = unescapeText(value);
    else if (name === 'DESCRIPTION') current.notes = unescapeText(value);
    else if (name === 'UID') current.uid = value;
    else if (name === 'DTSTART') { const t = local(value); if (t) { current.allDay = t.allDay; current.start = t.allDay ? t.date : t.time; } }
    else if (name === 'DTEND') { const t = local(value); if (t) current._end = t; }
    else if (name === 'DURATION') { const t = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(value); if (t) current._minutes = (Number(t[1] || 0) * 7 + Number(t[2] || 0)) * 1440 + Number(t[3] || 0) * 60 + Number(t[4] || 0); }
    else if (name === 'RRULE') {
      const parts = Object.fromEntries(value.split(';').map(p => p.split('=')));
      const freq = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[parts.FREQ];
      if (freq) {
        const rule = { freq, interval: Number(parts.INTERVAL) || 1 };
        if (parts.BYDAY && freq === 'weekly') rule.byDay = parts.BYDAY.split(',').map(d => BYDAY.indexOf(d.slice(-2))).filter(d => d >= 0);
        if (parts.UNTIL) { const t = local(parts.UNTIL); if (t) rule.until = t.date; } else if (Number(parts.COUNT) > 0) rule.count = Number(parts.COUNT);
        current.recurrence = rule;
      }
    } else if (name === 'EXDATE') current.exceptions = [...(current.exceptions || []), ...value.split(',').map(v => local(v)?.date).filter(Boolean)];
  }
  return events.slice(0, 2000).map(e => {
    const { _end, _minutes, uid, ...rest } = e;
    if (rest.allDay) { const last = _end ? addDays(parseKey(_end.date), -1) : parseKey(rest.start); rest.end = dateKey(last < parseKey(rest.start) ? parseKey(rest.start) : last); }
    else if (_end?.time) rest.end = _end.time;
    else if (_minutes != null) rest.end = stamp(new Date(new Date(`${rest.start}:00`).getTime() + _minutes * 60000));
    else rest.end = stamp(new Date(new Date(`${rest.start}:00`).getTime() + 3600000));
    rest.title = (rest.title || 'Untitled event').slice(0, 200);
    if (!rest.reminders?.length) delete rest.reminders;
    return rest;
  });
}

// Reminders that should fire now: the reminder time falls in the last `windowMs`. Missed ones (app closed) are not replayed.
export function dueReminders(events, now = Date.now(), windowMs = 120000) {
  const out = [];
  for (const event of events) {
    if (!event.reminders?.length) continue;
    const longest = Math.max(...event.reminders) * 60000;
    for (const item of expand(event, new Date(now - windowMs), new Date(now + longest + 60000), 200)) {
      for (const minutes of event.reminders) {
        const at = item.start.getTime() - minutes * 60000;
        if (at <= now && now < at + windowMs) out.push({ key: `${item.key}#${minutes}`, event, start: item.start, end: item.end, minutes, allDay: item.allDay });
      }
    }
  }
  return out;
}
