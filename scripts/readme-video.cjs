// Records the "build your own tools" clip for the README from the real app on a throwaway profile:
//   electron scripts/readme-video.cjs            (frames land in a temp folder, then ffmpeg makes docs/assets/apps.*)
// The app is created and published through the same app tools an agent uses.
const { app, dialog, BrowserWindow } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const repo = path.resolve(__dirname, '..');
const { makeFixture } = require(path.join(repo, 'tests', 'fixture.cjs'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-video-'));
const frames = path.join(root, 'frames');
fs.mkdirSync(path.join(root, 'workspace')); fs.mkdirSync(frames);
app.setPath('userData', root);
process.argv.push('--test-data=' + root);
const timer = setTimeout(() => { console.error('timed out'); app.exit(1); }, 240000);
dialog.showErrorBox = (title, message) => { console.error(title + ': ' + message); app.exit(1); };
const pause = ms => new Promise(r => setTimeout(r, ms));
const source = name => fs.readFileSync(path.join(repo, 'plugin-examples', 'wing-hop', name), 'utf8');
const explore = process.env.EXPLORE === '1';
let frame = 0, ffmpeg = null;
const rawVideo = path.join(root, 'raw.mp4');
// The window is filmed with ffmpeg for smooth motion; capturePage is only used for stills.
const film = box => new Promise(resolve => {
  ffmpeg = require('node:child_process').spawn('ffmpeg', ['-y', '-f', 'gdigrab', '-framerate', '30', '-draw_mouse', '0', '-offset_x', String(box.x), '-offset_y', String(box.y), '-video_size', box.w + 'x' + box.h, '-i', 'desktop', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', rawVideo], { stdio: ['pipe', 'ignore', 'pipe'] });
  let log = ''; ffmpeg.stderr.on('data', d => { log += d; if (/frame=/.test(log)) resolve(true); });
  ffmpeg.on('exit', () => resolve(false));
  setTimeout(() => resolve(false), 5000);
});
const unfilm = () => new Promise(resolve => { if (!ffmpeg) return resolve(); ffmpeg.on('exit', resolve); ffmpeg.stdin.write('q'); });
app.once('browser-window-created', (_event, window) => {
  const wc = window.webContents;
  wc.setBackgroundThrottling(false);
  wc.once('did-finish-load', async () => {
    const run = code => wc.executeJavaScript(code);
    const shot = async name => { const image = await wc.capturePage(); fs.writeFileSync(path.join(os.tmpdir(), name + '.png'), image.toPNG()); };
    const grab = async () => { const image = await wc.capturePage(); fs.writeFileSync(path.join(frames, String(frame++).padStart(4, '0') + '.png'), image.resize({ width: 1200 }).toPNG()); };
    const recordFrames = async ms => { const end = Date.now() + ms; while (Date.now() < end) { const t = Date.now(); await grab(); await pause(Math.max(0, 80 - (Date.now() - t))); } };
    const record = ms => pause(ms);
    await pause(1500);
    window.show(); window.focus(); wc.focus();
    window.setBounds({ x: 0, y: 0, width: 1280, height: 800 });
    await pause(700);
    try {
      const pid = await run('window.workspace.load().then(s => s.selectedProject)');
      const op = (name, args) => run(`window.workspace.appOperation(${JSON.stringify(pid)}, ${JSON.stringify(name)}, ${JSON.stringify(args)})`);
      const made = await op('create', { title: 'Wing Hop' });
      const appId = made.id || made.appId || made.app?.id;
      console.log('created', JSON.stringify(made).slice(0, 200));
      for (const file of ['index.html', 'style.css', 'world.js', 'main.js']) await op('edit', { appId, op: 'write', file, content: source(file) });
      console.log('check', JSON.stringify(await op('check', { appId })).slice(0, 300));
      console.log('publish', JSON.stringify(await op('publish', { appId })).slice(0, 300));
      await run("document.querySelector('.tree-select').click()");
      await pause(1200);
      const { screen } = require('electron'), b = window.getContentBounds(), k = screen.getDisplayMatching(b).scaleFactor;
      console.log('filming', await film({ x: Math.round(b.x * k), y: Math.round(b.y * k), w: Math.floor(b.width * k / 2) * 2, h: Math.floor(b.height * k / 2) * 2 }), k, JSON.stringify(b));
      // A visible pointer, since screenshots never include the real one.
      await run(`(() => { const dot = document.createElement('div'); dot.id = 'demo-pointer'; dot.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:0 0 0 2px rgba(0,0,0,.35),0 6px 18px rgba(0,0,0,.4);z-index:99999;pointer-events:none;transition:transform .55s cubic-bezier(.3,.7,.2,1),scale .15s,opacity .3s;transform:translate(700px,520px)'; document.body.append(dot); })()`);
      const point = async finder => {
        const at = await run(`(() => { const el = (${finder})(); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
        if (!at) throw new Error('target not found: ' + finder);
        await run(`document.querySelector('#demo-pointer').style.transform = 'translate(${at.x}px,${at.y}px)'`);
        await record(650);
        await run("(() => { const d = document.querySelector('#demo-pointer'); d.style.scale = '.6'; setTimeout(() => d.style.scale = '1', 160); })()");
      };
      // Inside the app's sandboxed frame there is no DOM to reach, so those clicks are real mouse events at fixed spots (CSS pixels).
      const frameCenter = () => run("(() => { const f = document.querySelector('.app-studio iframe, .app-studio webview, .app-frame, iframe'); const r = f.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
      const clickIn = async (dx, dy) => { const c = await frameCenter(); await clickAt(Math.round(c.x + dx), Math.round(c.y + dy)); };
      const clickAt = async (x, y) => {
        await run(`document.querySelector('#demo-pointer').style.transform = 'translate(${x}px,${y}px)'`);
        await record(650);
        await run("(() => { const d = document.querySelector('#demo-pointer'); d.style.scale = '.6'; setTimeout(() => d.style.scale = '1', 160); })()");
        for (const [dx, dy] of [[-40, -20], [-12, -6], [0, 0]]) { wc.sendInputEvent({ type: 'mouseMove', x: x + dx, y: y + dy }); await pause(40); }
        wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }); await pause(70);
        wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      };
      const click = async finder => { await point(finder); await run(`(${finder})().click()`); };
      const byText = (sel, text) => `() => [...document.querySelectorAll('${sel}')].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
      await record(1400);
      await click("() => document.querySelector('[aria-label=\"Open Apps\"]')");
      await record(1600);
      await click(byText('button', 'Edit app'));
      await run("document.querySelector('#demo-pointer').style.opacity = '0'");
      await record(15500);
      await run("document.querySelector('#demo-pointer').style.opacity = '1'");
      await click(byText('button', 'Edit'));
      await record(3200);
    } catch (error) { console.error(error); await shot('v-fail').catch(() => {}); app.exit(1); return; }
    clearTimeout(timer);
    await unfilm();
    console.log('video', rawVideo);
    app.exit(0);
  });
});
(async () => {
  const state = makeFixture();
  state.settings.keepRunning = false;
  state.settings.onboarded = true;
  state.theme = 'dark';
  const project = state.projects[0];
  project.name = 'Launch research';
  project.description = 'What to ship, who it is for, and how people will find it.';
  project.notes = []; project.files = []; project.canvas = []; project.edges = [];
  fs.writeFileSync(path.join(root, 'workspace', 'workspace.json'), JSON.stringify(state));
  require(path.join(repo, 'electron', 'main.cjs'));
})().catch(error => { console.error(error); app.exit(1); });
