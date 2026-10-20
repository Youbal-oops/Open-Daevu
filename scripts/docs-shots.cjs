// Takes the pictures used in the README from the real app on a throwaway profile: electron scripts/docs-shots.cjs
const { app, dialog } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const repo = path.resolve(__dirname, '..');
const { makeFixture } = require(path.join(repo, 'tests', 'fixture.cjs'));
const out = path.join(repo, 'docs', 'assets');
fs.mkdirSync(out, { recursive: true });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-docs-'));
fs.mkdirSync(path.join(root, 'workspace'));
app.setPath('userData', root);
process.argv.push('--test-data=' + root);
const stamp = (days, hour, minutes = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, minutes, 0, 0); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + 'T' + String(hour).padStart(2, '0') + ':' + String(minutes).padStart(2, '0'); };
const timer = setTimeout(() => { console.error('timed out'); app.exit(1); }, 120000);
dialog.showErrorBox = (title, message) => { console.error(title + ': ' + message); app.exit(1); };
const pause = ms => new Promise(r => setTimeout(r, ms));
app.once('browser-window-created', (_event, window) => {
  const wc = window.webContents;
  wc.setBackgroundThrottling(false);
  wc.once('did-finish-load', async () => {
    const run = code => wc.executeJavaScript(code);
    const snap = async name => { const image = await wc.capturePage(); const size = image.getSize(); fs.writeFileSync(path.join(out, name + '.jpg'), image.resize({ width: Math.min(1400, size.width) }).toJPEG(84)); console.log('saved ' + name); };
    const openWorkspace = `(() => { const nav = document.querySelector('.workspace-nav'); if (nav.hidden) document.querySelector('.section-collapse').click(); })()`;
    const go = label => run(`(() => { const nav = document.querySelector('.workspace-nav'); if (nav.hidden) document.querySelector('.section-collapse').click(); [...document.querySelectorAll('.workspace-nav button')].find(b => b.textContent.includes(${JSON.stringify(label)})).click(); })()`);
    await pause(1500);
    window.setSize(1440, 900);
    await pause(700);
    try {
      await run("document.querySelector('.tree-select').click()");
      await pause(1800);
      await snap('overview');
      await run("document.querySelector('[aria-label=\"Open canvas board\"]').click()");
      await pause(2200);
      await run("document.querySelector('[aria-label=\"Fit board to screen\"]').click()");
      await pause(900);
      await snap('canvas');
      await run("document.querySelector('[aria-label=\"Close canvas board\"]').click()");
      await pause(600);
      await go('Calendar');
      await pause(2200);
      await snap('calendar');
      await go('Agents');
      await pause(1200);
      await snap('agents');
      await go('Plugins');
      await pause(1200);
      await snap('plugins');
    } catch (error) { console.error(error); app.exit(1); return; }
    clearTimeout(timer);
    app.exit(0);
  });
});
// A small, believable workspace to photograph: a flowchart and a brainstorm on the canvas, and a week of events.
(async () => {
  const { buildTemplate } = await import(require('node:url').pathToFileURL(path.join(repo, 'shared', 'canvas-templates.mjs')).href);
  let n = 0;
  const uid = () => 'd' + (n++);
  const state = makeFixture();
  state.settings.keepRunning = false;
  state.theme = 'light';
  const project = state.projects[0];
  project.name = 'Launch research';
  project.description = 'What to ship, who it is for, and how people will find it.';
  const flow = buildTemplate('flowchart', { x: -320, y: 120 }, uid), brain = buildTemplate('brainstorm', { x: 520, y: 40 }, uid);
  const words = ['Pricing page', 'Compare with rivals', 'Interview five users', 'Landing page copy', 'Onboarding email', 'Launch checklist'];
  let w = 0;
  for (const item of brain.items) if (item.type === 'sticky') item.text = words[w++] || item.text;
  brain.items[0].text = 'Ideas for launch week';
  project.canvas = [...flow.items, ...brain.items];
  project.notes = []; project.files = [];
  project.edges = [...flow.edges];
  state.calendars = [{ id: 'personal', name: 'Personal', color: '#4f8cff', visible: true }, { id: 'work', name: 'Work', color: '#34c759', visible: true }];
  const event = (id, title, day, from, to, calendarId = 'personal') => ({ id, calendarId, title, start: stamp(day, from), end: stamp(day, to), allDay: false, location: '', notes: '', reminders: [10], exceptions: [] });
  state.events = [event('e1', 'Research sync', 0, 10, 11, 'work'), event('e2', 'Interview: Maya', 1, 14, 15, 'work'), event('e3', 'Draft landing copy', 2, 9, 11), event('e4', 'Competitor review', 3, 13, 14, 'work'), event('e5', 'Gym', 1, 18, 19), event('e6', 'Launch checklist', 5, 11, 12, 'work'), event('e7', 'Dinner with Sam', 4, 19, 21)];
  fs.writeFileSync(path.join(root, 'workspace', 'workspace.json'), JSON.stringify(state));
  require(path.join(repo, 'electron', 'main.cjs'));
})().catch(error => { console.error(error); app.exit(1); });
