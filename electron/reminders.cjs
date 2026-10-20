const { Notification } = require('electron');
const { dueReminders } = require('../shared/calendar.mjs');

const clock = date => date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const lead = minutes => minutes === 0 ? 'Starting now' : minutes % 1440 === 0 ? `In ${minutes / 1440} day${minutes === 1440 ? '' : 's'}` : minutes % 60 === 0 ? `In ${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `In ${minutes} minutes`;

class Reminders {
  constructor(store, onOpen) { Object.assign(this, { store, onOpen }); this.fired = new Set(); this.timer = null; }
  start() { this.tick(); this.timer = setInterval(() => this.tick(), 30000); this.timer.unref?.(); }
  stop() { clearInterval(this.timer); }
  tick(now = Date.now()) {
    if (!Notification.isSupported()) return;
    for (const due of dueReminders(this.store.state.events || [], now)) {
      if (this.fired.has(due.key)) continue;
      this.fired.add(due.key);
      if (this.fired.size > 2000) this.fired.delete(this.fired.values().next().value);
      const when = due.allDay ? 'All day' : `${clock(due.start)} to ${clock(due.end)}`;
      const note = new Notification({ title: due.event.title, body: [lead(due.minutes), when, due.event.location].filter(Boolean).join(' · '), silent: false });
      note.on('click', () => this.onOpen({ id: due.event.id, start: `${due.start.getFullYear()}-${String(due.start.getMonth() + 1).padStart(2, '0')}-${String(due.start.getDate()).padStart(2, '0')}` }));
      note.show();
    }
  }
}
module.exports = { Reminders };
