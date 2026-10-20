// A brand-new profile: the welcome set-up appears, AI helpers are optional, and what was chosen is saved.
const { app, dialog } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-welcome-'));
fs.mkdirSync(path.join(root, 'workspace'));
app.setPath('userData', root);
process.argv.push('--test-data=' + root);
const timer = setTimeout(() => { console.error('onboarding test timed out'); app.exit(1); }, 90000);
dialog.showErrorBox = (title, message) => { console.error(title + ': ' + message); app.exit(1); };
const pause = ms => new Promise(r => setTimeout(r, ms));
app.once('browser-window-created', (_event, window) => {
  const errors = [], wc = window.webContents;
  wc.setBackgroundThrottling(false);
  wc.on('console-message', event => { if (event.level === 'error' && !/ResizeObserver loop/.test(event.message)) errors.push(event.message); });
  wc.once('did-finish-load', async () => {
    const run = code => wc.executeJavaScript(code);
    const wait = async (expr, label) => { for (let i = 0; i < 100; i++) { if (await run(expr)) return; await pause(100); } throw new Error('Not ready: ' + label + (errors.length ? ' | console errors: ' + errors.join(' || ') : '')); };
    const press = text => run(`[...document.querySelectorAll('.onboarding button')].find(b => b.textContent.includes(${JSON.stringify(text)})).click()`);
    const type = (label, value) => run(`(() => { const el = document.querySelector('.onboarding input[aria-label=${JSON.stringify(label)}]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const saved = () => run('window.workspace.load()');
    try {
      await wait("!!document.querySelector('.onboarding .ob-title')", 'the welcome appears on a new profile');
      assert.match(await run("document.querySelector('.onboarding .ob-title').textContent"), /Welcome\sto/);
      assert.equal(await run("!!document.querySelector('.onboarding .ob-blob')"), true, 'the shape that keeps moulding is there');
      assert.equal(await run("document.querySelector('.onboarding .ob-skip')?.textContent || ''"), '', 'no skip button on the welcome itself');
      await press('Get started');
      await wait("!!document.querySelector('.onboarding input[aria-label=\"Your name\"]')", 'name step');
      await type('Your name', 'Sam Rivers');
      await press('Continue');
      await wait("!![...document.querySelectorAll('.onboarding .ob-option')].find(o => /Dark/.test(o.textContent))", 'look step');
      await run("[...document.querySelectorAll('.onboarding .ob-option')].find(o => /Dark/.test(o.textContent)).click()");
      await wait("document.documentElement.dataset.theme === 'dark'", 'the theme changes at once');
      await press('Continue');
      await wait("!![...document.querySelectorAll('.onboarding .ob-option')].find(o => /On this computer/.test(o.textContent))", 'storage step');
      await press('Continue');
      await wait("!![...document.querySelectorAll('.onboarding .ob-option')].find(o => /Not now/.test(o.textContent))", 'AI step');
      assert.equal(await run("[...document.querySelectorAll('.onboarding .ob-option')].find(o => /Not now/.test(o.textContent)).getAttribute('aria-pressed')"), 'true', 'AI helpers are off unless chosen');
      await press('Continue');
      await wait("!!document.querySelector('.onboarding input[aria-label=\"Project name\"]')", 'project step');
      await type('Project name', 'Launch research');
      await press('Continue');
      await wait("!!document.querySelector('.onboarding .ob-check')", 'the last screen draws its check');
      assert.match(await run("document.querySelector('.onboarding .ob-title').textContent"), /Sam/);
      await press('Open my workspace');
      await wait("!document.querySelector('.onboarding') && !!document.querySelector('.project-heading')", 'the workspace opens on the new project');
      const after = await saved();
      assert.deepEqual([after.settings.onboarded, after.settings.aiAgents, after.settings.userName, after.theme], [true, false, 'Sam Rivers', 'dark']);
      assert.equal(after.projects.length, 1);
      assert.equal(after.projects[0].name, 'Launch research');
      assert.equal(await run("document.documentElement.dataset.ai"), 'off');
      assert.equal(await run("[...document.querySelectorAll('.sidebar button')].some(b => b.offsetParent !== null && /Agents/.test(b.getAttribute('aria-label') || ''))"), false, 'no Agents entry without AI helpers');
      assert.equal(await run("!!document.querySelector('.chat-panel') || !!document.querySelector('.chat-toggle') && document.querySelector('.chat-toggle').offsetParent !== null"), false, 'no chat panel or toggle');
      // Switching AI helpers on later brings everything back.
      await run("document.querySelector('[aria-label=\"Workspace settings\"]').click()");
      await wait("!!document.querySelector('input[aria-label=\"Use AI agents\"]')", 'settings open');
      await run("document.querySelector('input[aria-label=\"Use AI agents\"]').click()");
      await run("document.querySelector('.modal form').requestSubmit()");
      await wait("document.documentElement.dataset.ai === 'on' && !!document.querySelector('.chat-panel')", 'AI helpers come back from Settings');
      assert.deepEqual(errors, [], 'no console errors: ' + errors.join(' || '));
      console.log(JSON.stringify({ passed: true, onboarding: 'welcome, name, look, storage, optional AI, first project, saved' }));
      clearTimeout(timer);
      app.exit(0);
    } catch (error) { console.error(error.stack || error); app.exit(1); }
  });
});
require(path.resolve(__dirname, '../../electron/main.cjs'));
