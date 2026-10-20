const { rolePrompt } = require('../shared/domain.mjs');
function makeFixture() {
  const now = new Date().toISOString();
  const agents = [
    { id: 'seo', name: 'Scout', role: 'SEO research & strategy', provider: 'codex', model: '', color: 'green', initials: 'Sc', command: 'codex', args: '[]' },
    { id: 'market', name: 'Sage', role: 'Market & competitor analysis', provider: 'claude', model: 'sonnet', color: 'purple', initials: 'Sa', command: 'claude', args: '[]' },
    { id: 'research', name: 'Atlas', role: 'Research synthesis & fact checking', provider: 'claude', model: 'opus', color: 'blue', initials: 'At', command: 'claude', args: '[]' }
  ].map(a => ({ ...a, prompt: rolePrompt(a.name, a.role) }));
  return { version: 1, theme: 'dark', selectedProject: 'research-project', agents, schedules: [], settings: { claudeMcpPath: '', maxHandoffs: 4, timeoutMinutes: 15, launchAtLogin: false, keepRunning: true, allowAgentSchedules: true }, projects: [
    { id: 'research-project', name: 'Example project', description: 'A shared home for search insights, competitor research, and the next steps for example.org.', color: 'green', agentIds: ['seo', 'market', 'research'], messages: [], tasks: [], files: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, notes: [
      { id: 'brief', title: 'Start with a better question', content: '# Project brief\n\nWhat would make example.org easier to find, more useful to visitors, and worth returning to?\n\n## Research directions\n- Understand the audience and their search intent.\n- Map competitors and gaps in useful content.\n- Turn evidence into a prioritized action plan.\n\n## Working agreement\nCite sources. Keep assumptions visible. Ask before changing a live website.\n\n*This is a starter brief, not completed research.*', kind: 'note', author: 'You', createdAt: now, updatedAt: now, position: { x: 80, y: 90 } },
      { id: 'questions', title: 'Questions worth exploring', content: '# Open questions\n\n- Who is the primary audience?\n- Which queries already bring qualified visitors?\n- What do competing pages explain better?\n- Which improvements can we measure in 30 days?\n\nAdd your context here, then ask Scout to start a research task.', kind: 'note', author: 'You', createdAt: now, updatedAt: now, position: { x: 430, y: 200 } }
    ] }
  ] };
}
module.exports = { makeFixture };
