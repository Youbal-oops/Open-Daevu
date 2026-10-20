const { test } = require('node:test');
const assert = require('node:assert/strict');

let calendar;
const load = async () => (calendar ||= await import('../shared/calendar.mjs'));
const day = (y, m, d, h = 0, mm = 0) => new Date(y, m - 1, d, h, mm);
const keys = list => list.map(o => o.key.split('@')[1]);

test('events expand into daily, weekly, monthly and yearly repeats with exceptions, counts and end dates', async () => {
  const { expand } = await load();
  const base = { id: 'e', title: 'x', allDay: false, start: '2026-10-05T09:00', end: '2026-10-05T10:30' };
  assert.deepEqual(keys(expand(base, day(2026, 10, 1), day(2026, 10, 31))), ['2026-10-05'], 'a single event appears once');
  const daily = { ...base, recurrence: { freq: 'daily', interval: 2, count: 4 }, exceptions: ['2026-10-09'] };
  assert.deepEqual(keys(expand(daily, day(2026, 10, 1), day(2026, 11, 30))), ['2026-10-05', '2026-10-07', '2026-10-11'], 'count 4 includes the skipped day, so only three show');
  const weekly = { ...base, recurrence: { freq: 'weekly', interval: 1, byDay: [1, 3], until: '2026-10-21' } };
  assert.deepEqual(keys(expand(weekly, day(2026, 10, 1), day(2026, 12, 1))), ['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21']);
  const monthly = { ...base, start: '2026-01-31T09:00', end: '2026-01-31T10:00', recurrence: { freq: 'monthly', interval: 1 } };
  assert.deepEqual(keys(expand(monthly, day(2026, 1, 1), day(2026, 5, 1))), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'], 'a 31st clamps to the end of shorter months');
  const yearly = { ...base, start: '2024-02-29T09:00', end: '2024-02-29T10:00', recurrence: { freq: 'yearly', interval: 1 } };
  assert.deepEqual(keys(expand(yearly, day(2024, 1, 1), day(2027, 1, 1))), ['2024-02-29', '2025-02-28', '2026-02-28']);
  const far = expand({ ...base, recurrence: { freq: 'weekly', interval: 2 } }, day(2031, 6, 1), day(2031, 6, 30));
  assert.ok(far.length >= 2 && far.length <= 3, 'a repeat from years ago jumps to the window: ' + far.length);
  const multi = { id: 'm', title: 'Trip', allDay: true, start: '2026-10-10', end: '2026-10-12' };
  const hit = expand(multi, day(2026, 10, 12), day(2026, 10, 13));
  assert.equal(hit.length, 1, 'a multi-day event shows on its last day');
  assert.equal(expand(multi, day(2026, 10, 13), day(2026, 10, 14)).length, 0, 'and not the day after');
  assert.equal(hit[0].end.getDate(), 13, 'an all-day end is exclusive');
});

test('events are validated and cleaned', async () => {
  const { validateEvent } = await load();
  const calendars = [{ id: 'personal' }, { id: 'work' }];
  const ok = validateEvent({ id: 'a', calendarId: 'work', title: '  Dentist ', start: '2026-10-20T15:00', end: '2026-10-20T16:00', reminders: [10, 10, 60, -5, 'x'], recurrence: { freq: 'weekly', interval: 2, byDay: [1, 1, 9], count: 5 }, exceptions: ['2026-10-27', 'nope'], color: '#ABCDEF' }, calendars);
  assert.deepEqual([ok.title, ok.reminders, ok.recurrence, ok.exceptions, ok.color], ['Dentist', [10, 60], { freq: 'weekly', interval: 2, byDay: [1], count: 5 }, ['2026-10-27'], '#abcdef']);
  assert.equal(validateEvent({ id: 'b', title: 'Day off', allDay: true, start: '2026-10-20' }).end, '2026-10-20');
  for (const bad of [{ id: 'x y', title: 't', start: '2026-10-20T10:00' }, { id: 'c', title: ' ', start: '2026-10-20T10:00' }, { id: 'c', title: 't', start: '2026-10-20' }, { id: 'c', title: 't', start: '2026-10-20T10:00', end: '2026-10-20T09:00' }, { id: 'c', title: 't', start: '2026-10-20T10:00', calendarId: 'gone' }, { id: 'c', title: 't', start: '2026-10-20T10:00', recurrence: { freq: 'hourly' } }])
    assert.throws(() => validateEvent(bad, calendars));
});

test('quick add understands dates, times, lengths, repeats and places', async () => {
  const { parseQuickAdd } = await load();
  const now = day(2026, 10, 20, 8, 0); // a Tuesday
  const t = text => parseQuickAdd(text, now);
  assert.deepEqual(pick(t('Lunch with Sam tomorrow 1pm for 90 min')), ['Lunch with Sam', '2026-10-21T13:00', '2026-10-21T14:30', false]);
  assert.deepEqual(pick(t('Dentist oct 28 3-4pm')), ['Dentist', '2026-10-28T15:00', '2026-10-28T16:00', false]);
  assert.deepEqual(pick(t('Pay rent 1st nov')), ['Pay rent', '2026-11-01', '2026-11-01', true]);
  assert.deepEqual(pick(t('Call mum friday at 6pm')), ['Call mum', '2026-10-23T18:00', '2026-10-23T19:00', false]);
  assert.deepEqual(pick(t('Planning next monday 10:30')), ['Planning', '2026-10-26T10:30', '2026-10-26T11:30', false]);
  assert.deepEqual(pick(t('Conference 12/05 all day')), ['Conference', '2026-12-05', '2026-12-05', true]);
  assert.deepEqual(pick(t('Dinner tonight')), ['Dinner', '2026-10-20T19:00', '2026-10-20T20:00', false]);
  assert.deepEqual(pick(t('Review in 3 days')), ['Review', '2026-10-23', '2026-10-23', true]);
  const standup = t('Standup every weekday 9:30');
  assert.deepEqual([standup.title, standup.start, standup.recurrence], ['Standup', '2026-10-20T09:30', { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] }]);
  assert.deepEqual(t('Gym every 2 weeks 7am').recurrence, { freq: 'weekly', interval: 2 });
  assert.deepEqual(t('Yoga every wed 18:00').recurrence, { freq: 'weekly', interval: 1, byDay: [3] });
  assert.equal(t('Coffee with Ana tomorrow 10am @Blue Bottle').location, 'Blue Bottle');
  const room = t('Test review tomorrow 3pm for 45 min @Room 9');
  assert.deepEqual([room.title, room.location, room.start, room.end], ['Test review', 'Room 9', '2026-10-21T15:00', '2026-10-21T15:45']);
  assert.deepEqual([t('Standup @Floor 2 tomorrow 9am').title, t('Standup @Floor 2 tomorrow 9am').location], ['Standup', 'Floor 2']);
  assert.equal(t('Just a note').allDay, true);
  function pick(e) { return [e.title, e.start, e.end, e.allDay]; }
});

test('events survive an .ics round trip, and outside files import with repeats, all-day spans and alarms', async () => {
  const { toIcs, parseIcs } = await load();
  const events = [
    { id: 'a1', title: 'Team, sync; weekly', start: '2026-10-20T09:00', end: '2026-10-20T09:30', allDay: false, location: 'Room 4', notes: 'Line one\nLine two', recurrence: { freq: 'weekly', interval: 1, byDay: [2, 4], until: '2026-12-31' }, exceptions: ['2026-10-22'], reminders: [10, 60] },
    { id: 'a2', title: 'Offsite', start: '2026-11-02', end: '2026-11-04', allDay: true }
  ];
  const text = toIcs(events);
  assert.ok(text.startsWith('BEGIN:VCALENDAR') && text.includes('RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261231') && text.includes('DTEND;VALUE=DATE:20261105'));
  const back = parseIcs(text, () => 'new');
  assert.deepEqual([back[0].title, back[0].start, back[0].end, back[0].location, back[0].notes, back[0].recurrence, back[0].exceptions, back[0].reminders], ['Team, sync; weekly', '2026-10-20T09:00', '2026-10-20T09:30', 'Room 4', 'Line one\nLine two', events[0].recurrence, ['2026-10-22'], [10, 60]]);
  assert.deepEqual([back[1].allDay, back[1].start, back[1].end], [true, '2026-11-02', '2026-11-04']);
  const outside = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:x', 'DTSTART;VALUE=DATE:20261201', 'SUMMARY:Holiday', 'END:VEVENT', 'BEGIN:VEVENT', 'DTSTART:20261201T100000', 'DURATION:PT45M', 'SUMMARY:Short', 'RRULE:FREQ=DAILY;COUNT=3', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const imported = parseIcs(outside, () => 'id');
  assert.deepEqual([imported[0].allDay, imported[0].end, imported[1].end, imported[1].recurrence], [true, '2026-12-01', '2026-12-01T10:45', { freq: 'daily', interval: 1, count: 3 }]);
});

test('reminders fire once in their window, for repeats too, and are not replayed after being missed', async () => {
  const { dueReminders } = await load();
  const meeting = { id: 'm', title: 'Standup', allDay: false, start: '2026-10-20T09:00', end: '2026-10-20T09:15', reminders: [10, 0], recurrence: { freq: 'daily', interval: 1 } };
  const at = (d, h, m, s = 0) => new Date(2026, 9, d, h, m, s).getTime();
  assert.deepEqual(dueReminders([meeting], at(21, 8, 50, 10)).map(r => [r.key, r.minutes]), [['m@2026-10-21#10', 10]], 'ten minutes before the second day');
  assert.deepEqual(dueReminders([meeting], at(21, 9, 0, 30)).map(r => r.minutes), [0], 'and at the start');
  assert.deepEqual(dueReminders([meeting], at(21, 8, 40)), [], 'nothing before the window');
  assert.deepEqual(dueReminders([meeting], at(21, 8, 56)), [], 'a reminder from long ago is not replayed');
  assert.deepEqual(dueReminders([{ ...meeting, reminders: [] }], at(21, 8, 50, 10)), []);
  const holiday = { id: 'h', title: 'Holiday', allDay: true, start: '2026-10-25', end: '2026-10-25', reminders: [540] };
  assert.equal(dueReminders([holiday], at(24, 15, 0, 5)).length, 1, 'an all-day reminder counts from midnight');
});
