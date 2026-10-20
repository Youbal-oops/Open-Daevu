const {agentOffline}=require('../shared/agent-status.mjs');
const { nextOccurrence } = require('../shared/domain.mjs');
class Scheduler {
  constructor(store, runner, clock = () => new Date(), enabled = () => true) { this.store = store; this.runner = runner; this.clock = clock; this.enabled = enabled; this.busy = false; this.active = new Set(); }
  start() { this.timer = setInterval(() => this.tick().catch(e => console.error('Scheduler:', e.message)), 15000); this.timer.unref?.(); this.tick().catch(e => console.error('Scheduler:', e.message)); }
  stop() { clearInterval(this.timer); }
  async tick() {
    if (this.busy || !this.enabled()) return;
    this.busy = true;
    try {
      for (const schedule of [...(this.store.state.schedules || [])]) {
        if (schedule.lastStatus === 'running' && !this.runner.groups.has(schedule.lastGroupId)) {
          const tasks = this.store.state.projects.find(p => p.id === schedule.projectId)?.tasks.filter(t => t.groupId === schedule.lastGroupId) || [];
          const status = tasks.some(t => ['failed','blocked'].includes(t.status)) ? 'failed' : tasks.some(t => ['stopped','interrupted'].includes(t.status)) ? 'interrupted' : tasks.length ? 'done' : 'interrupted';
          await this.patch(schedule.id, { lastStatus: status, lastError: tasks.find(t => t.error)?.error || '', finishedAt: this.clock().toISOString() });
        }
        if (schedule.enabled && schedule.nextRunAt && Date.parse(schedule.nextRunAt) <= this.clock().getTime()) await this.run(schedule.id);
      }
    } finally { this.busy = false; }
  }
  async patch(id, values) { return this.store.update(state => { const item = state.schedules.find(s => s.id === id); if (item) Object.assign(item, values); return state; }); }
  async run(id, manual = false) {
    const schedule = this.store.state.schedules.find(s => s.id === id);
    if (!schedule) throw new Error('Unknown scheduled task.');
    if (this.active.has(id) || (schedule.lastStatus === 'running' && this.runner.groups.has(schedule.lastGroupId))) { if (manual) throw new Error('This scheduled task is already running.'); return; }
    if (this.runner.lanes.has(`${schedule.projectId}:${schedule.agentId}`)) { if (manual) throw new Error('This agent is busy. Try again when its current research finishes.'); return; }
    const agent=this.store.state.agents.find(a=>a.id===schedule.agentId);
    if(agent && agentOffline(this.store.state,agent,this.clock().getTime())){if(manual)throw Error('This agent is offline after reaching a usage limit. Retry its unread chat when ready.');return;}
    this.active.add(id);
    const timestamp = this.clock().toISOString();
    try {
      const result = await this.runner.start(schedule.projectId, schedule.agentId, `[Scheduled task: ${schedule.name}]\n${schedule.task}`);
      if(result.queued){await this.patch(id,{lastStatus:'waiting',lastError:'Agent is offline; task is waiting.'});return;}
      const {groupId}=result;
      await this.patch(id, { lastGroupId: groupId, lastRunAt: timestamp, lastStatus: 'running', lastError: '', ...(schedule.mode === 'once' ? { enabled: false } : {}), nextRunAt: schedule.mode === 'once' ? null : nextOccurrence(schedule, this.clock()) });
    } catch (e) {
      await this.patch(id, { lastRunAt: timestamp, lastStatus: 'failed', lastError: e.message, ...(schedule.mode === 'once' ? { enabled: false } : {}), nextRunAt: schedule.mode === 'once' ? null : nextOccurrence(schedule, this.clock()) });
      if (manual) throw e;
    } finally { this.active.delete(id); }
  }
}
module.exports = { Scheduler };
