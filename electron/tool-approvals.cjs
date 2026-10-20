const { randomUUID } = require('node:crypto');
class ToolApprovals {
  constructor(onChange = () => {}) { this.onChange = onChange; this.pending = new Map(); }
  list() { return [...this.pending.values()].map(({value}) => value); }
  request({signal, agentId, agentName, server, tool, args}) {
    const value = {agentId,agentName,server,tool,args:structuredClone(args)};
    if (signal?.aborted) return Promise.resolve(false);
    return new Promise(resolve => {
      const id = randomUUID();
      const finish = allowed => { if (!this.pending.has(id)) return; this.pending.delete(id); signal?.removeEventListener('abort', cancel); this.onChange(this.list()); resolve(allowed); };
      const cancel = () => finish(false);
      this.pending.set(id, {value:{id,...value},finish}); signal?.addEventListener('abort', cancel, {once:true}); this.onChange(this.list());
    });
  }
  answer(id, allowed) { if (typeof allowed !== 'boolean') throw Error('Choose Allow or Deny.'); const entry = this.pending.get(id); if (!entry) throw Error('This tool request has already ended.'); entry.finish(allowed); }
  destroy() { for (const entry of [...this.pending.values()]) entry.finish(false); }
}
module.exports = { ToolApprovals };
