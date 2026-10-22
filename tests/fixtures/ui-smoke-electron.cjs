// Drives the real app (real main process, real renderer) against a throwaway profile. Needs a build in dist/.
const { app, dialog } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '../..');
const { makeFixture } = require(path.join(repo, 'tests', 'fixture.cjs'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-smoke-'));
fs.mkdirSync(path.join(root, 'workspace'));
app.setPath('userData', root);
process.argv.push('--test-data=' + root);
const state = makeFixture(); state.settings.keepRunning = false;
// A small real PNG uploaded to the first project, to try the in-app image viewer.
const zlib = require('node:zlib');
function makePng(width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const o = y * (width * 3 + 1) + 1 + x * 3; raw[o] = 40 + x * 2; raw[o + 1] = 90; raw[o + 2] = 160 - y; }
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(zlib.crc32(body), 8 + data.length); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const picture = makePng(120, 80), pictureDir = path.join(root, 'workspace', 'projects', 'research-project', 'files');
fs.mkdirSync(pictureDir, { recursive: true });
fs.writeFileSync(path.join(pictureDir, 'pic1.png'), picture);
state.projects[0].files = [{ id: 'pic1', name: 'Photo.png', storedName: 'pic1.png', size: picture.length, createdAt: new Date().toISOString(), position: { x: 0, y: 0 } }];
fs.writeFileSync(path.join(root, 'workspace', 'workspace.json'), JSON.stringify(state));
const timer = setTimeout(() => { console.error('smoke test timed out'); app.exit(1); }, 150000);
dialog.showErrorBox = (title, message) => { console.error(title + ': ' + message); app.exit(1); };
const pause = ms => new Promise(r => setTimeout(r, ms));
app.once('browser-window-created', (_event, window) => {
  const errors = [], wc = window.webContents;
  wc.setBackgroundThrottling(false);
  wc.on('console-message', event => { if (event.level === 'error' && !/ResizeObserver loop/.test(event.message)) errors.push(event.message); });
  wc.once('did-finish-load', async () => {
    const run = code => wc.executeJavaScript(code);
    const wait = async (expr, label) => { for (let i = 0; i < 100; i++) { if (await run(expr)) return; await pause(100); } throw new Error('Not ready: ' + (label || expr) + (errors.length ? ' | console errors: ' + errors.join(' || ') : '')); };
    const setValue = (selector, value) => run(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const results = {};
    try {
      await wait("!!document.querySelector('.sidebar')", 'app shell');
      assert.equal(await run("document.querySelector('.workspace-nav').hidden"), true, 'the Workspace section starts collapsed');
      assert.ok(await run("!!document.querySelector('.titlebar .nav-island')"), 'our own title bar is shown');
      results.shell = 'collapsed workspace, own title bar';
      wc.send('deeplink', { project: 'research-project', note: 'brief' });
      await wait("!!document.querySelector('.editor-page')", 'deep link opens the document');
      results.deepLink = 'opened document';

      await wait("!!document.querySelector('.doc-blocks .doc-text')", 'the document opens in the editor');
      assert.equal(await run("!!document.querySelector('.segmented.text') || !!document.querySelector('textarea.note-editor') || !!document.querySelector('[title=\"Preview document\"]')"), false, 'no Markdown mode, no preview switch');
      const blockCount = await run("document.querySelectorAll('.doc-block').length");
      assert.ok(blockCount >= 3, 'the note became blocks: ' + blockCount);
      results.blocks = blockCount;

      const typeIn = (selector, text) => run(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); el.textContent = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      const shortcut = (selector, init) => run(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); document.execCommand('selectAll'); el.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, ${JSON.stringify(init)}))); })()`);
      const lastText = '.doc-block:last-child .doc-text, .doc-blocks .doc-block:nth-last-child(2) .doc-text';
      await typeIn(lastText, 'Typed in a block');
      await shortcut(lastText, { key: 'b', ctrlKey: true });
      await wait("!!document.querySelector('.doc-blocks .doc-text b')", 'Ctrl+B makes the selection bold');
      assert.equal(await run("document.querySelector('.doc-blocks .doc-text b').textContent"), 'Typed in a block');
      assert.equal(await run("[...document.querySelectorAll('.doc-text')].some(t => t.textContent.includes('**'))"), false, 'the editor never shows the markers');
      await shortcut(lastText, { key: 'i', ctrlKey: true });
      await wait("!!document.querySelector('.doc-blocks .doc-text i')", 'Ctrl+I makes the selection italic');
      await run("document.querySelector('.doc-add-end').click()");
      await pause(150);
      await typeIn('.doc-blocks .doc-block:last-of-type .doc-text', '/');
      await wait("!!document.querySelector('.doc-blocks .slash-menu')", 'slash menu');
      results.slashMenu = await run("document.querySelectorAll('.doc-blocks .slash-menu button').length");

      await run("document.querySelector('.comment-toggle').click()");
      await wait("!!document.querySelector('.comment-panel')", 'comment panel');
      await setValue('.comment-composer textarea', 'First comment from the smoke test');
      await run("document.querySelector('.comment-composer .button').click()");
      await wait("document.querySelectorAll('.comment-panel .comment').length >= 1", 'comment appears');
      results.noteComment = 'added';

      await pause(2600);
      const saved = await run("window.workspace.load().then(s => { const n = s.projects[0].notes.find(x => x.id === 'brief'); return { format: n.format, blocks: n.blocks?.length, comments: n.comments?.length, hasText: n.content.includes('Typed in a block') }; })");
      assert.equal(saved.format, 'blocks'); assert.ok(saved.blocks >= 3); assert.equal(saved.comments, 1); assert.ok(saved.hasText, 'typed text was saved into the document');
      results.saved = saved;

      const stored = await run("window.workspace.load().then(s => s.projects[0].notes.find(x => x.id === 'brief').content)");
      assert.ok(/\*\*_Typed in a block_\*\*|_\*\*Typed in a block\*\*_/.test(stored), 'formatting is kept in the saved text: ' + stored.slice(-120));
      results.markdown = 'formatting kept, markers never shown';

      wc.send('deeplink', { project: 'research-project', page: true });
      await wait("!!document.querySelector('.doc-page')", 'deep link opens the page');
      await run("[...document.querySelectorAll('.prop-add')].find(b => /Comments/.test(b.textContent)).click()");
      await wait("!!document.querySelector('.comment-panel')", 'page comment panel');
      await setValue('.comment-composer textarea', 'Page comment from the smoke test');
      await run("document.querySelector('.comment-composer .button').click()");
      await wait("document.querySelectorAll('.comment-panel .comment').length >= 1", 'page comment appears');
      const pageComments = await run("window.workspace.load().then(s => s.projects[0].page?.comments?.length)");
      assert.equal(pageComments, 1);
      results.pageComment = 'added';

      await run("document.querySelector('.nav-step[aria-label=\"Go back\"]').click()");
      await wait("!!document.querySelector('.editor-page')", 'back returns to the document');
      await run("document.querySelector('.nav-step[aria-label=\"Go forward\"]').click()");
      await wait("!!document.querySelector('.doc-page')", 'forward returns to the page');
      results.history = 'back and forward';

      wc.send('deeplink', { project: 'research-project', note: 'brief' });
      await wait("!!document.querySelector('.editor-page')", 'document open again');
      await run("document.querySelectorAll('.nav-location button.crumb')[1].click()");
      await wait("!document.querySelector('.editor-page')", 'the project crumb leaves the document');
      await wait("!!document.querySelector('.overview-scene svg.sk-live .sk-fish')", 'the underwater scene');
      const motion = await run(`(async () => { const fish = document.querySelector('.overview-scene .sk-fish'), before = getComputedStyle(fish).transform; await new Promise(r => setTimeout(r, 900)); return { running: document.getAnimations().filter(a => a.playState === 'running' && a.effect?.target?.closest?.('.overview-scene')).length, moved: before !== getComputedStyle(fish).transform }; })()`);
      assert.ok(motion.running > 25 && motion.moved, 'the scene is animated: ' + JSON.stringify(motion));
      results.scene = motion.running + ' animations running';
      const slide = await run(`(async () => { const strip = document.querySelector('.tab-strip'), tab = n => [...strip.querySelectorAll('button[role=tab]')].find(b => b.getAttribute('aria-label') === n), shift = () => new DOMMatrix(getComputedStyle(strip, '::before').transform).m41, wait = ms => new Promise(r => setTimeout(r, ms)); tab('Overview').click(); await wait(900); const from = shift(); tab('Boards').click(); await wait(110); const mid = shift(), entering = document.getAnimations().some(a => a.animationName === 'page-in'); await wait(900); return { from, mid, to: shift(), entering, ready: strip.hasAttribute('data-thumb-ready') }; })()`);
      assert.ok(slide.ready && slide.to > slide.from + 40 && slide.mid > slide.from && slide.mid < slide.to, 'the tab highlight glides instead of jumping: ' + JSON.stringify(slide));
      assert.ok(slide.entering, 'the page eases in when the tab changes');
      results.tabSlide = 'glides, page eases in';
      await run("document.querySelector('.nav-location button.crumb').click()");
      await wait("/Home/.test(document.querySelector('.nav-location .crumb:last-child').textContent)", 'the Workspace crumb goes home');
      results.crumbs = 'clickable';

      await run("window.workspace.mutate({ type: 'project', value: { id: 'second-proj', name: 'Second', description: '', parentId: null, status: 'active', kpis: [], agentIds: [], color: 'green', notes: [], files: [], tasks: [], messages: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } } })");
      await run("window.workspace.mutate({ type: 'note', projectId: 'second-proj', value: { id: 'link-note', title: 'Linker', content: 'See [[@Example project]] and [[Start with a better question]]', kind: 'note', author: 'You', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), position: { x: 1, y: 1 } } })");
      wc.send('deeplink', { project: 'research-project', page: true });
      await pause(400);
      await wait("[...document.querySelectorAll('.page-backlinks button')].some(b => /Linker/.test(b.textContent))", 'project backlinks from [[@Project]]');
      results.projectBacklink = 'shown';

      const blank = id => ({ id, name: id, description: '', parentId: null, status: 'active', kpis: [], agentIds: [], color: 'green', notes: [], files: [], tasks: [], messages: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
      await run(`window.workspace.mutate({ type: 'project', value: ${JSON.stringify({ ...blank('third-proj'), name: 'Third' })} })`);
      await run("window.workspace.mutate({ type: 'project:update', projectId: 'second-proj', value: { name: 'Second' } })");
      await wait("[...document.querySelectorAll('.tree-row')].some(r => /Third/.test(r.textContent))", 'new project in the tree');
      const drag = async (from, to, y) => {
        await run(`(() => { const find = n => [...document.querySelectorAll('.tree-row')].find(r => r.querySelector('.tree-select')?.textContent.trim().endsWith(n)); window.__dt = new DataTransfer(); find(${JSON.stringify(from)}).dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: window.__dt })); const dst = find(${JSON.stringify(to)}), box = dst.getBoundingClientRect(); dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: window.__dt, clientY: box.top + box.height * ${y} })); })()`);
        await pause(80);
        await run(`(() => { const find = n => [...document.querySelectorAll('.tree-row')].find(r => r.querySelector('.tree-select')?.textContent.trim().endsWith(n)); const dst = find(${JSON.stringify(to)}), box = dst.getBoundingClientRect(); dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: window.__dt, clientY: box.top + box.height * ${y} })); find(${JSON.stringify(from)})?.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: window.__dt })); })()`);
        await pause(500);
      };
      await drag('Third', 'Example project', 0.1);
      const placed = await run("window.workspace.load().then(s => ({ order: s.projects.map(p => p.id), parent: s.projects.find(p => p.id === 'third-proj').parentId }))");
      assert.ok(placed.order.indexOf('third-proj') < placed.order.indexOf('research-project') && placed.parent === null, 'dropping on the top edge puts the project before: ' + placed.order);
      await drag('Second', 'Example project', 0.5);
      assert.equal(await run("window.workspace.load().then(s => s.projects.find(p => p.id === 'second-proj').parentId)"), 'research-project', 'dropping on the middle nests it');
      results.dragDrop = 'reorder and nest';

      await run("window.workspace.mutate({ type: 'page', projectId: 'third-proj', value: { blocks: [{ id: 'x', type: 'p', text: '' }], cover: 'rose' } })");
      await wait("[...document.querySelectorAll('.tree-row')].some(r => /Third/.test(r.textContent) && getComputedStyle(r.querySelector('.project-monogram')).backgroundColor === 'rgb(224, 139, 156)')", 'cover colour on the sidebar project');
      results.coverColour = 'rose';

      const menuClick = async (row, label) => {
        await run(`(() => { const find = n => [...document.querySelectorAll('.tree-row')].find(r => r.querySelector('.tree-select')?.textContent.trim().endsWith(n)); find(${JSON.stringify(row)}).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 220 })); })()`);
        await wait("!!document.querySelector('.context-menu')", 'context menu');
        assert.ok(await run("document.querySelector('.context-menu').parentElement === document.body"), 'the menu is not inside a container that could clip it');
        await run(`[...document.querySelectorAll('.context-menu button')].find(b => b.textContent.includes(${JSON.stringify(label)})).click()`);
      };
      await menuClick('Third', 'Archive');
      await wait("!!document.querySelector('.tree-archive-head')", 'archived section appears');
      assert.equal(await run("[...document.querySelectorAll('.tree-row')].some(r => /Third/.test(r.textContent))"), false, 'archived projects leave the tree');
      await run("document.querySelector('.tree-archive-head').click()");
      await wait("[...document.querySelectorAll('.tree-row.archived')].some(r => /Third/.test(r.textContent))", 'archive opens');
      await menuClick('Third', 'Restore from archive');
      await wait("!document.querySelector('.tree-archive-head') && [...document.querySelectorAll('.tree-row')].some(r => /Third/.test(r.textContent))", 'restored project is back');
      results.archive = 'archive and restore';

      const typeFilter = value => run(`(() => { const el = document.querySelector('.sidebar-filter input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await typeFilter('better');
      await wait("!document.querySelector('.workspace-nav') && !document.querySelector('.plugin-nav-items')", 'Workspace and Plugins hide while searching');
      const filtered = await run("({ rows: [...document.querySelectorAll('.project-tree .tree-row')].map(r => r.textContent.trim()), hits: [...document.querySelectorAll('.project-tree .tree-hit')].map(h => h.textContent.trim()), dialog: !!document.querySelector('[role=dialog]') })");
      assert.ok(filtered.rows.some(r => /Example project/.test(r)) && !filtered.rows.some(r => /Third/.test(r)), 'only matching projects stay: ' + JSON.stringify(filtered));
      assert.ok(filtered.hits.some(h => /Start with a better question/.test(h)) && !filtered.dialog, 'matching documents show under their project and no menu opens: ' + JSON.stringify(filtered));
      await typeFilter('thi');
      await wait("[...document.querySelectorAll('.project-tree .tree-row')].some(r => /Third/.test(r.textContent)) && ![...document.querySelectorAll('.project-tree .tree-row')].some(r => /Example project/.test(r.textContent))", 'projects filter by name');
      await typeFilter('zzzz');
      await wait("!!document.querySelector('.tree-empty') && /Nothing matches/.test(document.querySelector('.tree-empty').textContent)", 'empty search result');
      await typeFilter('');
      await wait("!!document.querySelector('.workspace-nav') && !!document.querySelector('.plugin-nav-items, .plugin-nav-label')", 'clearing the search brings the sections back');
      results.sidebarSearch = 'filters in place';

      await run("document.querySelector('.workspace-nav button[aria-label=\"Agents\"]').click()");
      await wait("!!document.querySelector('.agent-profile-card')", 'agents page');
      const agentsBefore = await run("document.querySelectorAll('.agent-profile-card').length");
      await run("[...document.querySelector('.agent-profile-card').querySelectorAll('button')].find(b => /Delete/.test(b.textContent)).click()");
      await wait("!!document.querySelector('.modal .button.danger')", 'agent delete confirmation');
      await run("document.querySelector('.modal .button.danger').click()");
      await wait(`document.querySelectorAll('.agent-profile-card').length === ${agentsBefore - 1}`, 'agent removed');
      assert.equal(await run("window.workspace.load().then(s => (s.trash || []).some(t => t.kind === 'agent'))"), true, 'the deleted agent is in Trash');
      results.agentDelete = 'moved to Trash';

      // Open the uploaded picture from Files: it becomes its own tab, and marking it never copies or changes the image.
      wc.send('deeplink', { project: 'research-project' });
      await wait("!!document.querySelector('.tab-strip button[role=tab][aria-label=\"Files\"]')", 'project tabs');
      await run("document.querySelector('.tab-strip button[role=tab][aria-label=\"Files\"]').click()");
      await wait("[...document.querySelectorAll('.files-grid button')].some(b => /Photo\\.png/.test(b.textContent))", 'uploaded file listed');
      await run("[...document.querySelectorAll('.files-grid button')].find(b => /Photo\\.png/.test(b.textContent)).click()");
      await wait("!!document.querySelector('.image-viewer .iv-canvas img') && document.querySelector('.iv-canvas img').complete && document.querySelector('.iv-canvas img').naturalWidth === 120", 'the image opens inside the app');
      assert.ok(await run("[...document.querySelectorAll('.tab-strip [role=tab]')].some(t => /Photo\\.png/.test(t.textContent))"), 'the image has its own tab');
      const press = (type, x, y) => `document.querySelector('.iv-canvas img').dispatchEvent(new PointerEvent('${type}', { bubbles: true, clientX: ${x}, clientY: ${y}, button: 0, buttons: ${type === 'pointerup' ? 0 : 1}, pointerId: 7 }))`;
      const spot = await run("(() => { const b = document.querySelector('.iv-canvas img').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()");
      await run("document.querySelector('button[aria-label^=\"Marker\"]').click()");
      await run(press('pointerdown', spot.x + spot.w * .2, spot.y + spot.h * .3));
      for (let i = 1; i <= 8; i++) await run(press('pointermove', spot.x + spot.w * (.2 + i * .07), spot.y + spot.h * (.3 + (i % 3) * .05)));
      await run(press('pointerup', spot.x + spot.w * .8, spot.y + spot.h * .4));
      await wait("document.querySelectorAll('.iv-marks g path').length >= 1", 'marker stroke drawn');
      await run("document.querySelector('button[aria-label^=\"Text\"]').click()");
      await run(press('pointerdown', spot.x + spot.w * .3, spot.y + spot.h * .75));
      await run(press('pointerup', spot.x + spot.w * .3, spot.y + spot.h * .75));
      await wait("!!document.querySelector('textarea.iv-text.editing')", 'text note opens for typing');
      await setValue('textarea.iv-text.editing', 'Check this corner');
      await run("document.querySelector('textarea.iv-text.editing').blur()");
      await wait("[...document.querySelectorAll('.iv-text')].some(t => /Check this corner/.test(t.textContent))", 'text note placed');
      await pause(1800);
      const marked = await run("window.workspace.load().then(s => { const home = s.projects.find(p => p.id === 'research-project'), f = home.files.find(x => x.id === 'pic1'); return { strokes: f.annotations?.strokes.length, texts: f.annotations?.texts.map(t => t.v), files: home.files.length }; })");
      assert.deepEqual([marked.strokes, marked.texts, marked.files], [1, ['Check this corner'], 1], 'marks saved on the file record: ' + JSON.stringify(marked));
      assert.deepEqual(fs.readdirSync(pictureDir), ['pic1.png'], 'no copy of the image was created');
      assert.ok(fs.readFileSync(path.join(pictureDir, 'pic1.png')).equals(picture), 'the original image is byte-for-byte unchanged');
      await run("document.querySelector('button[aria-label^=\"Eraser\"]').click()");
      await run("document.querySelector('.iv-marks g path[stroke=transparent]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerId: 7 }))");
      await wait("document.querySelectorAll('.iv-marks g').length === 0", 'eraser removes the stroke');
      const undoInfo = await run("(async () => { const b = document.querySelector('button[aria-label=\"Undo\"]'); const before = { disabled: b.disabled, groups: document.querySelectorAll('.iv-marks g').length }; b.click(); await new Promise(r => setTimeout(r, 400)); return { before, after: document.querySelectorAll('.iv-marks g').length, status: document.querySelector('.iv-status')?.textContent }; })()");
      assert.equal(undoInfo.after, 1, 'undo brings the stroke back: ' + JSON.stringify(undoInfo));
      await run("document.querySelector('button[aria-label^=\"Crop\"]').click()");
      await wait("!!document.querySelector('.iv-crop') && [...document.querySelectorAll('.iv-toolbar button')].some(b => /Apply crop/.test(b.textContent))", 'the crop tool shows a crop frame and Apply');
      const full = await run("(() => { const c = document.querySelector('.iv-canvas'); return [parseFloat(c.style.width), parseFloat(c.style.height)]; })()");
      await run(press('pointerdown', spot.x + spot.w * .2, spot.y + spot.h * .2));
      await run(press('pointermove', spot.x + spot.w * .5, spot.y + spot.h * .5));
      await run(press('pointermove', spot.x + spot.w * .8, spot.y + spot.h * .7));
      await run(press('pointerup', spot.x + spot.w * .8, spot.y + spot.h * .7));
      await run("[...document.querySelectorAll('.iv-toolbar button')].find(b => /Apply crop/.test(b.textContent)).click()");
      await wait("!document.querySelector('.iv-crop') && parseFloat(document.querySelector('.iv-canvas').style.width) < " + full[0] * .7, 'applying the crop shows only the kept part');
      await pause(1800);
      const cropped = await run("window.workspace.load().then(s => s.projects.find(p => p.id === 'research-project').files.find(x => x.id === 'pic1').annotations?.crop)");
      assert.ok(cropped && cropped.w < full[0] * .7 && cropped.h < full[1] * .7, 'the crop is saved beside the file: ' + JSON.stringify(cropped));
      assert.ok(fs.readFileSync(path.join(pictureDir, 'pic1.png')).equals(picture), 'cropping leaves the original image untouched');
      await run("document.querySelector('button[aria-label^=\"Crop\"]').click()");
      await run("[...document.querySelectorAll('.iv-toolbar button')].find(b => /Reset crop/.test(b.textContent)).click()");
      await wait("parseFloat(document.querySelector('.iv-canvas').style.width) === " + full[0], 'reset crop brings the whole picture back');
      results.imageCrop = 'crop frame, applied non-destructively, reset';
      results.imageViewer = 'own tab, marker and text saved beside the file, no copy, original untouched';

      // ---- the calendar: one continuous scroll, quick add, drag, repeats, week grid, search, calendars, preferences, shortcuts
      const dayOf = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
      const events = () => run("window.workspace.load().then(s => s.events || [])");
      await run("if (document.querySelector('.workspace-nav').hidden) document.querySelector('.section-collapse').click()");
      await run("[...document.querySelectorAll('.workspace-nav button')].find(b => /Calendar/.test(b.textContent)).click()");
      await wait("!!document.querySelector('.cal-app .cal-scroll') && document.querySelectorAll('.cal-week').length > 5 && !!document.querySelector('.cal-cell.today')", 'the calendar opens as one continuous scroll');
      const scrolled = await run("(async () => { const box = document.querySelector('.cal-scroll'), before = document.querySelector('.cal-title').textContent; box.scrollTop += 124 * 14; await new Promise(r => setTimeout(r, 600)); const after = document.querySelector('.cal-title').textContent; const reach = box.scrollTop; box.scrollTop = 0; await new Promise(r => setTimeout(r, 400)); return { before, after, grew: box.scrollHeight > 124 * 150, top: box.scrollTop }; })()");
      assert.ok(scrolled.grew && scrolled.before !== scrolled.after, 'scrolling moves through months and updates the title: ' + JSON.stringify(scrolled));
      await run("document.querySelector('.cal-toolbar button.button.secondary').click()");
      await pause(700);

      const quick = async text => { await run(`(() => { const el = document.querySelector('.cal-quick input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`); await wait("!!document.querySelector('.cal-quick-preview')", 'quick add preview'); await run("document.querySelector('.cal-quick').requestSubmit()"); };
      await quick('Test review tomorrow 3pm for 45 min @Room 9');
      await wait("document.querySelectorAll('.cal-chip').length > 0 && [...document.querySelectorAll('.cal-chip')].some(c => /Test review/.test(c.textContent))", 'the quick-added event shows in the scroll view');
      let made = (await events()).find(e => e.title === 'Test review');
      assert.deepEqual([made.start, made.end, made.location], [dayOf(1) + 'T15:00', dayOf(1) + 'T15:45', 'Room 9'], 'quick add understood the sentence: ' + JSON.stringify(made));

      const dragCal = (fromSelector, textPart, toDate) => run(`(() => { const chip = [...document.querySelectorAll(${JSON.stringify(fromSelector)})].find(c => c.textContent.includes(${JSON.stringify(textPart)})), cell = document.querySelector('.cal-cell[data-date="${toDate}"]'), dt = new DataTransfer(); chip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })); cell.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); cell.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); })()`);
      await dragCal('.cal-chip', 'Test review', dayOf(2));
      await wait("window.workspace.load().then(s => (s.events || []).find(e => e.title === 'Test review')?.start === '" + dayOf(2) + "T15:00')", 'dragging an event to another day moves it and keeps its time');
      results.calendarQuickAddAndDrag = 'sentence understood, drag moves';

      await quick('Weekly sync every monday 10am');
      await wait("[...document.querySelectorAll('.cal-chip')].filter(c => /Weekly sync/.test(c.textContent)).length >= 2", 'a repeating event shows on several Mondays');
      const series = (await events()).find(e => e.title === 'Weekly sync');
      assert.deepEqual([series.recurrence.freq, series.recurrence.byDay], ['weekly', [1]]);
      const mondayChip = await run("(() => { const chips = [...document.querySelectorAll('.cal-chip')].filter(c => /Weekly sync/.test(c.textContent)); return chips[1].closest('.cal-cell').dataset.date; })()");
      await run(`(() => { const chips = [...document.querySelectorAll('.cal-chip')].filter(c => /Weekly sync/.test(c.textContent)), chip = chips[1], cell = document.querySelector('.cal-cell[data-date="${mondayChip}"]'), target = cell.nextElementSibling.nextElementSibling, dt = new DataTransfer(); chip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })); target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); })()`);
      await wait("[...document.querySelectorAll('.scope-choices button')].length === 3", 'moving a repeating event asks how far the change reaches');
      await run("[...document.querySelectorAll('.scope-choices button')].find(b => /This event$/.test(b.querySelector('strong').textContent)).click()");
      await wait("window.workspace.load().then(s => { const list = s.events || [], base = list.find(e => e.title === 'Weekly sync' && e.recurrence); return base?.exceptions?.length === 1 && list.filter(e => e.title === 'Weekly sync').length === 2; })", 'moving one date skips it in the series and makes its own event');
      results.calendarRepeats = 'weekly repeat, this-event-only move';

      await run("[...document.querySelectorAll('.cal-toolbar .segmented button')].find(b => b.textContent === 'Week').click()");
      await wait("!!document.querySelector('.cal-time .cal-col')", 'week view');
      const grid = await run("(() => { const body = document.querySelector('.cal-time-body'), r = body.getBoundingClientRect(), col = document.querySelectorAll('.cal-col')[3].getBoundingClientRect(); return { x: col.left + col.width / 2, y10: r.top + 10 * 52, y11: r.top + 11 * 52 }; })()");
      const fire = (type, x, y) => run(`document.querySelectorAll('.cal-col')[3].dispatchEvent(new PointerEvent('${type}', { bubbles: true, clientX: ${x}, clientY: ${y}, button: 0, buttons: ${type === 'pointerup' ? 0 : 1}, pointerId: 3 }))`);
      await fire('pointerdown', grid.x, grid.y10 + 4); await fire('pointermove', grid.x, grid.y10 + 30); await fire('pointermove', grid.x, grid.y11 + 4); await fire('pointerup', grid.x, grid.y11 + 4);
      await wait("!!document.querySelector('.event-form')", 'dragging on the week grid opens a new event');
      const times = await run("({ start: document.querySelector('input[aria-label=\"Start time\"]').value, end: document.querySelector('input[aria-label=\"End time\"]').value })");
      assert.deepEqual(times, { start: '10:00', end: '11:00' }, 'the dragged span fills in the times: ' + JSON.stringify(times));
      await run(`(() => { const el = document.querySelector('.event-title'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'Deep work'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await run("[...document.querySelectorAll('.event-chips button')].find(b => b.textContent === '10 min').click()");
      await run("document.querySelector('.event-form').requestSubmit()");
      await wait("window.workspace.load().then(s => (s.events || []).some(e => e.title === 'Deep work' && e.start.endsWith('T10:00') && e.end.endsWith('T11:00') && e.reminders?.[0] === 10))", 'the new event saves with its time and reminder');
      await wait("[...document.querySelectorAll('.cal-block')].some(b => /Deep work/.test(b.textContent))", 'it appears in the grid');
      results.calendarWeekGrid = 'drag to create, reminder saved';

      await run("document.querySelector('.cal-app').dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }))");
      await wait("document.querySelectorAll('.cal-col').length === 1", 'the D key opens day view');
      await run("document.querySelector('.cal-app').dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }))");
      await wait("!!document.querySelector('.cal-scroll')", 'the M key returns to the continuous scroll');

      await run(`(() => { const el = document.querySelector('.cal-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'deep work'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await wait("!!document.querySelector('.cal-agenda') && /1 result/.test(document.querySelector('.cal-agenda-heading').textContent)", 'search lists matching events');
      await run("document.querySelector('.cal-search button').click()");
      await wait("!!document.querySelector('.cal-scroll')", 'clearing search returns to the calendar');

      await run("document.querySelector('button[aria-label=\"New calendar\"]').click()");
      await wait("!!document.querySelector('.modal input[maxlength=\"60\"]')", 'new calendar dialog');
      await run(`(() => { const el = document.querySelector('.modal input[maxlength="60"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'Side project'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await run("document.querySelector('.modal form').requestSubmit()");
      await wait("window.workspace.load().then(s => (s.calendars || []).some(c => c.name === 'Side project'))", 'a calendar is created');
      await run("[...document.querySelectorAll('.cal-list-row')].find(r => /Personal/.test(r.textContent)).querySelector('input').click()");
      await wait("![...document.querySelectorAll('.cal-chip')].some(c => /Test review/.test(c.textContent))", 'hiding a calendar hides its events');
      await run("[...document.querySelectorAll('.cal-list-row')].find(r => /Personal/.test(r.textContent)).querySelector('input').click()");
      await wait("[...document.querySelectorAll('.cal-chip')].some(c => /Test review|Weekly sync/.test(c.textContent))", 'and showing it brings them back');

      await run("document.querySelector('button[aria-label=\"Calendar preferences\"]').click()");
      await wait("!!document.querySelector('.cal-popover.prefs')", 'preferences');
      await run(`(() => { const select = document.querySelector('.cal-popover.prefs select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '1'); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await wait("document.querySelector('.cal-weekdays span').textContent === 'Mon'", 'the week can start on Monday');
      assert.equal(await run("window.workspace.load().then(s => s.settings.calendar.weekStart)"), 1, 'the preference is saved');
      results.calendarMore = 'shortcuts, search, calendars, preferences';

      // ---- the browser is a temporary tab, Esc closes it, and plugins can wear a normal icon
      await run("document.querySelector('.tree-select').click()");
      await wait("!!document.querySelector('.workspace-tabs')", 'a project opens');
      const active = () => run("[...document.querySelectorAll('.temp-tab.active')].map(t => t.textContent.trim())");
      await run("document.querySelector('[aria-label=\"Open in a tab\"]').click()");
      const menuItems = await run("[...document.querySelectorAll('.tab-add-menu button')].map(b => b.textContent.trim())");
      for (const name of ['Apps', 'Canvas', 'Browser', 'Calendar', 'Database']) assert.ok(menuItems.includes(name), 'the + menu offers ' + name + ': ' + menuItems);
      await run("[...document.querySelectorAll('.tab-add-menu button')].find(b => /Browser/.test(b.textContent)).click()");
      await wait("[...document.querySelectorAll('.temp-tab.active')].some(t => /Browser/.test(t.textContent))", 'the + menu opens the browser and adds it to the header nav');
      await run("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
      await wait("!document.querySelector('.temp-tab.active') && [...document.querySelectorAll('.temp-tab')].some(t => /Browser/.test(t.textContent))", 'Esc closes the browser but its tab stays for next time');
      await run("[...document.querySelectorAll('.temp-tab')].find(t => /Browser/.test(t.textContent)).querySelector('.doc-tab-main').click()");
      await wait("[...document.querySelectorAll('.temp-tab.active')].some(t => /Browser/.test(t.textContent))", 'clicking the kept tab opens it again');
      await run("document.querySelector('[aria-label=\"Open in a tab\"]').click()");
      await run("[...document.querySelectorAll('.tab-add-menu button')].find(b => /Calendar/.test(b.textContent)).click()");
      await wait("[...document.querySelectorAll('.temp-tab.active')].some(t => /Calendar/.test(t.textContent)) && !!document.querySelector('.project-layout .cal-app')", 'the + menu opens the calendar as a tab');
      await run("document.querySelector('[aria-label=\"Open in a tab\"]').click()");
      await run("[...document.querySelectorAll('.tab-add-menu button')].find(b => /Canvas/.test(b.textContent)).click()");
      await wait("[...document.querySelectorAll('.temp-tab.active')].some(t => /Canvas/.test(t.textContent))", 'the + menu opens the canvas shelf');
      await run("[...document.querySelectorAll('.temp-tab')].find(t => /Canvas/.test(t.textContent)).querySelector('.doc-tab-main').click()");
      await wait("![...document.querySelectorAll('.temp-tab.active')].some(t => /Canvas/.test(t.textContent))", 'clicking an open shelf tab closes it');
      assert.equal(await run("Object.values(JSON.parse(localStorage.getItem('rw-nav-tools-by-project'))).flat().length"), 3, 'the three tools are remembered, for this project');
      const selects = await run("document.querySelectorAll('.tree-select').length");
      assert.ok(selects > 1, 'there is a second project to check');
      await run("document.querySelectorAll('.tree-select')[1].click()");
      await wait("!document.querySelector('.temp-tab') && !!document.querySelector('.workspace-tabs')", 'another project does not inherit the kept tools');
      await run("document.querySelectorAll('.tree-select')[0].click()");
      await wait("document.querySelectorAll('.temp-tab').length === 3", 'they are still there when you come back');
      for (const name of ['Browser', 'Calendar', 'Canvas']) await run(`document.querySelector('[aria-label="Remove ${name} from the tab bar"]').click()`);
      await wait("!document.querySelector('.temp-tab')", 'the x on a kept tab removes it from the nav');
      results.browserTab = 'plus menu keeps tools in the nav, Esc closes, x removes';

      // ---- the canvas: templates, block formatting, connector looks, links and mind-map branches
      const canvasOf = () => run("window.workspace.load().then(s => { const p = s.projects.find(x => x.id === s.selectedProject); return { items: p.canvas || [], edges: p.edges || [] }; })");
      await run("document.querySelector('[aria-label=\"Open canvas board\"]').click()");
      await wait("!!document.querySelector('#workspace-canvas-shelf .react-flow__pane')", 'the canvas opens');
      await run("document.querySelector('[aria-label=\"Templates\"]').click()");
      await run("[...document.querySelectorAll('.palette-menu button')].find(b => b.textContent === 'Flowchart').click()");
      await wait("document.querySelectorAll('#workspace-canvas-shelf .react-flow__node').length >= 5", 'a template puts its blocks on the canvas');
      const flow = await canvasOf();
      assert.ok(flow.items.length >= 5 && flow.edges.length >= 5, 'the flowchart brought its connectors: ' + flow.items.length + '/' + flow.edges.length);
      const clickNode = text => run(`(() => { const node = [...document.querySelectorAll('#workspace-canvas-shelf .react-flow__node')].find(n => n.textContent.includes(${JSON.stringify(text)})); node.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
      await clickNode('Do the first step');
      await wait("!!document.querySelector('[aria-label=\"Format\"]')", 'selecting a block shows the format button');
      await run("document.querySelector('.canvas-context [aria-label=\"Format\"]').click()");
      await wait("!!document.querySelector('.format-panel')", 'the format panel opens');
      await run("document.querySelector('.format-panel [aria-label=\"Bold\"]').click()");
      await run("document.querySelector('.format-panel [aria-label=\"Text bigger\"]').click()");
      await run("document.querySelector('.format-panel [aria-label=\"Align text left\"]').click()");
      await run("document.querySelector('.format-panel [aria-label=\"Dashed border\"]').click()");
      await run("document.querySelector('.format-panel [aria-label=\"Rotate right\"]').click()");
      await run("document.querySelector('.format-panel [aria-label=\"Lock\"]').click()");
      await pause(1500);
      const looks = await run("window.workspace.load().then(s => { const i = s.projects.find(x => x.id === s.selectedProject).canvas.find(c => c.text === 'Do the first step'); return { b: i.b, fs: i.fs, al: i.al, bd: i.bd, rot: i.rot, lock: i.lock }; })");
      assert.deepEqual(looks, { b: true, fs: 18, al: 'left', bd: 'dashed', rot: 15, lock: true }, 'bold, size, alignment, border, tilt and lock are saved on the block: ' + JSON.stringify(looks));
      assert.equal(await run("[...document.querySelectorAll('#workspace-canvas-shelf .react-flow__node')].find(n => n.textContent.includes('Do the first step')).classList.contains('draggable')"), false, 'a locked block cannot be dragged');
      await run("document.querySelector('.canvas-context [aria-label=\"Make bigger\"]').click()");
      await wait("window.workspace.load().then(s => s.projects.find(x => x.id === s.selectedProject).canvas.find(c => c.text === 'Do the first step').size.w > 190)", 'make bigger grows the block');
      await run("document.querySelector('.canvas-pane, #workspace-canvas-shelf .react-flow__pane').dispatchEvent(new MouseEvent('click', { bubbles: true }))");
      const spot2 = await run("(() => { for (const edge of document.querySelectorAll('#workspace-canvas-shelf .react-flow__edge')) { const path = edge.querySelector('.react-flow__edge-interaction') || edge.querySelector('path'), len = path.getTotalLength(), m = path.getScreenCTM(); for (const f of [0.5, 0.35, 0.65, 0.2, 0.8]) { const at = path.getPointAtLength(len * f), x = Math.round(at.x * m.a + at.y * m.c + m.e), y = Math.round(at.x * m.b + at.y * m.d + m.f), hit = document.elementFromPoint(x, y); if (hit && hit.closest('.react-flow__edge') === edge) return { x, y }; } } return null; })()");
      assert.ok(spot2, 'a connector can be reached');
      window.show(); window.focus(); wc.focus(); await pause(300);
      wc.sendInputEvent({ type: 'mouseMove', x: spot2.x, y: spot2.y }); wc.sendInputEvent({ type: 'mouseDown', x: spot2.x, y: spot2.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: spot2.x, y: spot2.y, button: 'left', clickCount: 1 });
      await wait("!!document.querySelector('[aria-label=\"Label and line style\"]')", 'selecting a connector shows its tools');
      await run("document.querySelector('[aria-label=\"Label and line style\"]').click()");
      await run("document.querySelector('.edge-panel [aria-label=\"Dashed line\"]').click()");
      await run("document.querySelector('.edge-panel [aria-label=\"Arrowheads: Both ↔\"]').click()");
      await pause(400);
      await run(`(() => { const el = document.querySelector('.edge-panel input'); el.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'because'); el.dispatchEvent(new Event('input', { bubbles: true })); el.blur(); })()`);
      await pause(1500);
      const edgeLooks = await run("window.workspace.load().then(s => s.projects.find(x => x.id === s.selectedProject).edges.map(e => ({ id: e.id.slice(0, 4), dash: e.dash, ends: e.ends, label: e.label })))");
      assert.ok(edgeLooks.some(e => e.dash === 'dashed' && e.ends === 'both' && e.label === 'because'), 'a connector keeps its label, dashes and arrowheads: ' + JSON.stringify(edgeLooks));
      await run("document.querySelector('[aria-label=\"Add a link\"]').click()");
      await run(`(() => { const el = document.querySelector('.link-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'https://example.org/read'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await run("document.querySelector('.link-form').requestSubmit()");
      await wait("!!document.querySelector('#workspace-canvas-shelf .link-card')", 'a link card appears');
      assert.equal((await canvasOf()).items.some(i => i.type === 'link' && i.url === 'https://example.org/read'), true, 'the link is saved');
      // A diagram sheet: its lines are dark on the light page and can be clicked to restyle.
      const sheetId = 'sheet-check', pid = await run("window.workspace.load().then(s => s.selectedProject)");
      const inner = (id, x, text) => ({ id, type: 'rect', text, color: 'white', position: { x, y: 40 }, size: { w: 140, h: 70 } });
      await run(`window.workspace.mutate({ type: 'canvas:item', projectId: ${JSON.stringify(pid)}, value: ${JSON.stringify({ id: sheetId, type: 'diagram', text: 'Check sheet', color: 'white', position: { x: 300, y: 560 }, size: { w: 520, h: 340 }, nodes: [inner('d1', 0, 'One'), inner('d2', 320, 'Two')], edges: [{ id: 'de1', source: 'd1', target: 'd2', type: 'default' }] })} })`);
      await wait(`!!document.querySelector('#workspace-canvas-shelf .react-flow__node[data-id="${sheetId}"]')`, 'the diagram sheet is on the canvas');
      await run(`document.querySelector('#workspace-canvas-shelf .react-flow__node[data-id="${sheetId}"] [aria-label^="Open"]').click()`);
      await wait("!!document.querySelector('.diagram-editor .react-flow__edge path')", 'the diagram editor opens with its connector');
      assert.equal(await run("getComputedStyle(document.querySelector('.diagram-editor .react-flow__edge-path')).stroke"), 'rgb(26, 26, 26)', 'diagram lines are dark, never white');
      const dspot = await run("(() => { const edge = document.querySelector('.diagram-editor .react-flow__edge'), path = edge.querySelector('.react-flow__edge-interaction') || edge.querySelector('path'), len = path.getTotalLength(), m = path.getScreenCTM(); for (const f of [0.5, 0.4, 0.6, 0.3, 0.7]) { const at = path.getPointAtLength(len * f), x = Math.round(at.x * m.a + at.y * m.c + m.e), y = Math.round(at.x * m.b + at.y * m.d + m.f), hit = document.elementFromPoint(x, y); if (hit && hit.closest('.react-flow__edge') === edge) return { x, y }; } return null; })()");
      assert.ok(dspot, 'the diagram connector can be reached');
      wc.sendInputEvent({ type: 'mouseMove', x: dspot.x, y: dspot.y }); wc.sendInputEvent({ type: 'mouseDown', x: dspot.x, y: dspot.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: dspot.x, y: dspot.y, button: 'left', clickCount: 1 });
      await wait("!!document.querySelector('.diagram-editor [aria-label=\"Label and line style\"]')", 'clicking a diagram connector shows its tools');
      await run("document.querySelector('.diagram-editor [aria-label=\"Straight connector\"]').click()");
      await run("document.querySelector('.diagram-editor [aria-label=\"Label and line style\"]').click()");
      await run("document.querySelector('.diagram-editor .edge-panel [aria-label=\"Dotted line\"]').click()");
      await wait("getComputedStyle(document.querySelector('.diagram-editor .react-flow__edge-path')).strokeDasharray !== 'none'", 'the connector turns dotted');
      await run("document.querySelector('.diagram-editor .diagram-bar .primary').click()");
      await wait("!document.querySelector('.diagram-editor')", 'the diagram editor closes');
      await pause(1200);
      const savedSheet = await run(`window.workspace.load().then(s => s.projects.find(x => x.id === s.selectedProject).canvas.find(c => c.id === ${JSON.stringify(sheetId)}))`);
      assert.ok(savedSheet.edges.some(e => e.type === 'straight' && e.dash === 'dotted'), 'the diagram keeps its connector looks: ' + JSON.stringify(savedSheet.edges));
      // Letting go of a connector on empty space offers a shape to attach.
      const doneId = (await canvasOf()).items.find(i => i.text === 'Done').id;
      const grip = await run(`(() => { const node = document.querySelector('#workspace-canvas-shelf .react-flow__node[data-id="${doneId}"]'), h = node.querySelector('.react-flow__handle-right'), r = h.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
      wc.sendInputEvent({ type: 'mouseMove', x: grip.x, y: grip.y }); wc.sendInputEvent({ type: 'mouseDown', x: grip.x, y: grip.y, button: 'left', clickCount: 1 });
      for (let step = 1; step <= 8; step++) { wc.sendInputEvent({ type: 'mouseMove', x: grip.x + step * 14, y: grip.y + step * 22 }); await pause(30); }
      wc.sendInputEvent({ type: 'mouseUp', x: grip.x + 112, y: grip.y + 176, button: 'left', clickCount: 1 });
      await wait("!!document.querySelector('.connect-menu')", 'letting go of a connector offers shapes');
      await run("[...document.querySelectorAll('.connect-menu button')].find(b => /Ellipse/.test(b.textContent)).click()");
      await wait("window.workspace.load().then(s => { const p = s.projects.find(x => x.id === s.selectedProject); const e = p.canvas.find(c => c.type === 'ellipse' && c.text === ''); return !!e && p.edges.some(x => x.source === '" + doneId + "' && x.target === e.id); })", 'the chosen shape appears already connected');
      const before = await canvasOf();
      await clickNode('Start');
      await run("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))");
      await wait("window.workspace.load().then(s => s.projects.find(x => x.id === s.selectedProject).canvas.length === " + (before.items.length + 1) + ")", 'Tab adds a connected branch');
      assert.equal((await canvasOf()).edges.length, before.edges.length + 1, 'and its connector');
      // ---- the pointer changes with what you are doing
      const cursorOf = selector => run(`(async () => { const el = document.querySelector(${JSON.stringify(selector)}); el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 })); for (let i = 0; i < 40 && !el.style.cursor; i++) await new Promise(r => setTimeout(r, 50)); return el.style.cursor; })()`);
      assert.equal(await cursorOf('.sidebar-filter input'), 'var(--cursor-ibeam)', 'a text field shows the text bar');
      assert.equal(await cursorOf('.brand'), 'var(--cursor-hand)', 'a button shows the hand');
      await run("document.querySelector('[aria-label=\"Pen (P)\"]').click()");
      assert.equal(await cursorOf('#workspace-canvas-shelf .react-flow__pane'), 'var(--cursor-pen)', 'the pen tool shows a pencil');
      await run("document.querySelector('[aria-label=\"Select (V)\"]').click()");
      await pause(600);
      const afterSelect = await run("document.querySelector('#workspace-canvas-shelf .react-flow__pane').style.cursor");
      assert.ok(['var(--cursor-arrow)', 'var(--cursor-grab)', 'var(--cursor-hand)', ''].includes(afterSelect), 'switching back to select drops the pencil: ' + afterSelect);
      assert.match(await run("getComputedStyle(document.body).cursor"), /^url\(/, 'the app pointer is in use everywhere else');
      results.cursors = 'text bar, hand, pencil, arrow';
      await run("document.querySelector('[aria-label=\"Close canvas board\"]').click()");
      await wait("!document.querySelector('#workspace-canvas-shelf')", 'the canvas closes');
      const chord = code => run(`window.dispatchEvent(new KeyboardEvent('keydown', { code: ${JSON.stringify(code)}, key: 'x', ctrlKey: true, altKey: true, bubbles: true, cancelable: true }))`);
      await chord('KeyC');
      await wait("!!document.querySelector('#workspace-canvas-shelf')", 'Ctrl+Alt+C opens the canvas');
      await chord('KeyC');
      await wait("!document.querySelector('#workspace-canvas-shelf')", 'and closes it');
      await chord('KeyB');
      await wait("!!document.querySelector('#workspace-browser-shelf')", 'Ctrl+Alt+B opens the browser');
      await chord('KeyB');
      await wait("!document.querySelector('#workspace-browser-shelf')", 'and closes it');
      window.hide();
      results.canvasWork = 'templates, format, locked blocks, connector looks, links, Tab branches';

      assert.deepEqual(errors, [], 'no console errors: ' + errors.join(' || '));
      console.log(JSON.stringify({ passed: true, ...results }));
      clearTimeout(timer); app.exit(0);
    } catch (error) {
      console.error(error.stack); console.error(JSON.stringify(results)); clearTimeout(timer); app.exit(1);
    }
  });
});
require(path.join(repo, 'electron', 'main.cjs'));
