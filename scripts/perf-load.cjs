// Starts the real app on a big throwaway workspace and reports load time, memory and how fast edits feel.
//   electron scripts/perf-load.cjs            (PROJECTS=120 FILES=10 NOTES=10 by default)
const { app, dialog } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const repo = path.resolve(__dirname, '..');
const { makeFixture } = require(path.join(repo, 'tests', 'fixture.cjs'));
const PROJECTS = Number(process.env.PROJECTS || 120), FILES = Number(process.env.FILES || 10), NOTES = Number(process.env.NOTES || 10), MESSAGES = Number(process.env.MESSAGES || 20);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-perf-'));
fs.mkdirSync(path.join(root, 'workspace'));
app.setPath('userData', root);
process.argv.push('--test-data=' + root);
const text = n => Array.from({ length: n }, (_, i) => 'Finding ' + i + ': lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.').join('\n');
const state = makeFixture();
state.settings.keepRunning = false;
state.theme = 'light';
const when = new Date().toISOString();
state.projects = Array.from({ length: PROJECTS }, (_, p) => ({
  id: 'p' + p, name: 'Project ' + (p + 1), description: 'Research project number ' + (p + 1), color: 'green', agentIds: ['seo', 'market'], tasks: [], edges: [], viewport: null,
  parentId: p >= 20 && p % 5 === 0 ? 'p' + (p % 20) : null,
  messages: Array.from({ length: MESSAGES }, (_, m) => ({ id: 'm' + p + '-' + m, agentId: 'seo', role: m % 2 ? 'agent' : 'user', text: text(3), createdAt: when })),
  files: Array.from({ length: FILES }, (_, f) => ({ id: 'f' + p + '-' + f, name: 'Document ' + f + '.pdf', storedName: 'f' + p + '-' + f + '.pdf', size: 120000 + f, createdAt: when })),
  notes: Array.from({ length: NOTES }, (_, n) => ({ id: 'n' + p + '-' + n, title: 'Note ' + n, kind: n % 5 === 4 ? 'sheet' : 'note', content: n % 5 === 4 ? Array.from({ length: 30 }, (_, r) => 'a' + r + ',b' + r + ',c' + r).join('\n') : text(40), author: 'You', createdAt: when, updatedAt: when, position: { x: 80 + n * 10, y: 90 } }))
}));
state.selectedProject = 'p0';
fs.writeFileSync(path.join(root, 'workspace', 'workspace.json'), JSON.stringify(state));
const fileSize = fs.statSync(path.join(root, 'workspace', 'workspace.json')).size;
const timer = setTimeout(() => { console.error('timed out'); app.exit(1); }, 170000);
dialog.showErrorBox = (title, message) => { console.error(title + ': ' + message); app.exit(1); };
const pause = ms => new Promise(r => setTimeout(r, ms));
const started = Date.now();
app.once('browser-window-created', (_event, window) => {
  const wc = window.webContents;
  wc.setBackgroundThrottling(false);
  wc.once('did-finish-load', async () => {
    const run = code => wc.executeJavaScript(code);
    const metrics = () => app.getAppMetrics().map(m => ({ type: m.type, mb: Math.round((m.memory.privateBytes || m.memory.workingSetSize) / 1024) })).filter(m => m.mb > 8);
    const out = { projects: PROJECTS, files: PROJECTS * FILES, notes: PROJECTS * NOTES, workspaceMB: +(fileSize / 1048576).toFixed(1) };
    try {
      for (let i = 0; i < 400; i++) { if (await run("document.querySelectorAll('.tree-row').length") >= Math.min(PROJECTS, 20)) break; await pause(50); }
      out.firstTreeMs = Date.now() - started;
      await pause(2500);
      out.afterLoadMemory = metrics();
      out.heapMB = await run("Math.round(performance.memory.usedJSHeapSize / 1048576)");
      const cpu = async () => { app.getAppMetrics(); await pause(3000); return app.getAppMetrics().map(m => ({ type: m.type, cpu: +m.cpu.percentCPUUsage.toFixed(1) })).filter(m => m.cpu > 0.3); };
      await run("document.querySelector('.tree-select').click()"); await pause(11000);
      out.idleCpuOverview = await cpu();
      await run("document.querySelector('.tab-strip button[aria-label=Files]').click()");
      await pause(800);
      out.idleCpuFiles = await cpu();
      await run("document.querySelector('.tab-strip button[aria-label=Overview]').click()");
      await pause(500);
      out.filesTab = await run(`(async () => { document.querySelector('.tree-select').click(); await new Promise(r => setTimeout(r, 400)); const t = performance.now(); document.querySelector('.tab-strip button[aria-label=Files]').click(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const ms = Math.round(performance.now() - t); await new Promise(r => setTimeout(r, 300)); return { ms, rows: document.querySelectorAll('.file-table button, .file-row').length, nodes: document.getElementsByTagName('*').length }; })()`);
      await run("document.querySelector('.tab-strip button[aria-label=Overview]').click()");
      out.views = await run(`(async () => { const nav = document.querySelector('.workspace-nav'); if (nav.hidden) document.querySelector('.section-collapse').click(); const out = {}; for (const label of ['Library', 'Agents', 'Calendar', 'Tools', 'Database', 'Trash', 'Home']) { const b = [...document.querySelectorAll('.workspace-nav button')].find(x => x.textContent.includes(label)); if (!b) continue; const t = performance.now(); b.click(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); out[label] = [Math.round(performance.now() - t), document.getElementsByTagName('*').length]; await new Promise(r => setTimeout(r, 250)); } return out; })()`);
      out.treeRows = await run("document.querySelectorAll('.tree-row').length");
      out.domNodes = await run("document.getElementsByTagName('*').length");
      if (process.env.PROFILE) { wc.debugger.attach('1.3'); await wc.debugger.sendCommand('Profiler.enable'); await wc.debugger.sendCommand('Profiler.start'); }
      // How long an edit takes from click to saved, and whether the screen freezes meanwhile.
      const edit = await run(`(async () => {
        const state = (await window.workspace.sync()).state, project = state.projects[0], note = project.notes[0], times = [];
        let worst = 0, last = performance.now(), live = true;
        const tick = t => { worst = Math.max(worst, t - last); last = t; if (live) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
        for (let i = 0; i < 12; i++) { const t = performance.now(); await window.workspace.mutatePatch({ type: 'note', projectId: project.id, value: { ...note, content: note.content + '\\nedit ' + i, updatedAt: new Date().toISOString() } }); times.push(Math.round(performance.now() - t)); await new Promise(r => setTimeout(r, 120)); }
        live = false;
        times.sort((a, b) => a - b);
        return { median: times[6], slowest: times[11], longestFrameMs: Math.round(worst) };
      })()`);
      out.edit = edit;
      const pick = await run(`(async () => { const rows = [...document.querySelectorAll('.tree-select')]; const times = []; for (const row of rows.slice(0, 12)) { const t = performance.now(); row.click(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); times.push(Math.round(performance.now() - t)); } times.sort((a, b) => a - b); return { median: times[6], slowest: times.at(-1) }; })()`);
      out.switchProject = pick;
      if (process.env.PROFILE) { const { profile } = await wc.debugger.sendCommand('Profiler.stop'); fs.writeFileSync(process.env.PROFILE, JSON.stringify(profile)); }
      await pause(1500);
      if (process.env.CSS) await run(`(() => { const st = document.createElement('style'); st.textContent = ${JSON.stringify(process.env.CSS)}; document.head.appendChild(st); })()`);
      if (process.env.SOAK) {
        // Many project switches and edits in a row: the memory should level off, not climb.
        const heap = () => run("Math.round(performance.memory.usedJSHeapSize / 1048576)");
        const steps = [];
        for (let round = 0; round < 4; round++) {
          await run(`(async () => { const rows = [...document.querySelectorAll('.tree-select')]; const tabs = ['Overview', 'Page', 'Files', 'Boards']; const sync = (await window.workspace.sync()).state; for (let i = 0; i < 75; i++) { rows[(i * 7 + ${round}) % rows.length].click(); await new Promise(r => setTimeout(r, 25)); const tab = [...document.querySelectorAll('.tab-strip button[role=tab]')].find(b => b.getAttribute('aria-label') === tabs[i % 4]); if (tab) tab.click(); if (i % 5 === 0) { const project = sync.projects[i % sync.projects.length], note = project.notes[0]; await window.workspace.mutatePatch({ type: 'note', projectId: project.id, value: { ...note, content: note.content + '.', updatedAt: new Date().toISOString() } }); } } })()`);
          await pause(1500);
          steps.push({ heapMB: await heap(), total: await run('Math.round(performance.memory.totalJSHeapSize / 1048576)'), tabMB: metrics().find(m => m.type === 'Tab')?.mb, nodes: await run("document.getElementsByTagName('*').length") });
        }
        out.soak = steps;
      }
      out.finalMemory = metrics();
      out.heapMBAfter = await run("Math.round(performance.memory.usedJSHeapSize / 1048576)");
      out.mainHeapMB = Math.round(process.memoryUsage().heapUsed / 1048576);
      out.mainRssMB = Math.round(process.memoryUsage().rss / 1048576);
    } catch (error) { console.error(error); app.exit(1); return; }
    console.log('PERF ' + JSON.stringify(out));
    clearTimeout(timer);
    app.exit(0);
  });
});
require(path.join(repo, 'electron', 'main.cjs'));
