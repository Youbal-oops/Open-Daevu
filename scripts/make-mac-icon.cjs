// Renders build/icon.svg into build/icon.icns for the macOS build. Run with Electron on macOS: `npm run icon:mac`.
// The checked-in icon.png is only 256 px, too small for a Retina icon, so the SVG is rasterised at each size.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');

const build = path.join(__dirname, '..', 'build');
const iconset = path.join(build, 'icon.iconset');
const target = path.join(build, 'icon.icns');
const sizes = [16, 32, 128, 256, 512];

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  let temp;
  try {
    if (process.platform !== 'darwin') throw new Error('The .icns file can only be built on macOS (it uses iconutil).');
    const svg = fs.readFileSync(path.join(build, 'icon.svg'), 'utf8').replace('<svg ', '<svg width="100%" height="100%" ');
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'daevu-icon-'));
    fs.rmSync(iconset, { recursive: true, force: true });
    fs.mkdirSync(iconset, { recursive: true });
    for (const size of sizes) for (const scale of [1, 2]) {
      const pixels = size * scale;
      const page = path.join(temp, `icon-${pixels}.html`);
      fs.writeFileSync(page, `<!doctype html><body style="margin:0;background:transparent;overflow:hidden"><div style="width:${pixels}px;height:${pixels}px">${svg}</div></body>`);
      const win = new BrowserWindow({ show: false, width: pixels, height: pixels, useContentSize: true, transparent: true, frame: false });
      await win.loadFile(page);
      const image = await win.webContents.capturePage({ x: 0, y: 0, width: pixels, height: pixels });
      const file = path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`);
      fs.writeFileSync(file, image.toPNG());
      console.log(`wrote ${path.basename(file)} (${image.getSize().width}x${image.getSize().height})`);
      win.destroy();
    }
    fs.rmSync(target, { force: true });
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', target], { stdio: 'inherit' });
    if (!fs.existsSync(target)) throw new Error('iconutil did not create icon.icns.');
    console.log(`wrote ${target} (${fs.statSync(target).size} bytes)`);
    fs.rmSync(iconset, { recursive: true, force: true });
    fs.rmSync(temp, { recursive: true, force: true });
    app.exit(0);
  } catch (error) { console.error(error.message); process.exitCode = 1; app.exit(1); }
});
