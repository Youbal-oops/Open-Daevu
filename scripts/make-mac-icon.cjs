// Renders build/icon.svg into build/icon.icns for the macOS build. Run with Electron on macOS: `npm run icon:mac`.
// The checked-in icon.png is only 256 px, too small for a Retina icon, so the SVG is rasterised at each size.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');

const build = path.join(__dirname, '..', 'build');
const iconset = path.join(build, 'icon.iconset');
const sizes = [16, 32, 128, 256, 512];

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    if (process.platform !== 'darwin') throw new Error('The .icns file can only be built on macOS (it uses iconutil).');
    const svg = fs.readFileSync(path.join(build, 'icon.svg'), 'utf8');
    fs.rmSync(iconset, { recursive: true, force: true });
    fs.mkdirSync(iconset, { recursive: true });
    for (const size of sizes) for (const scale of [1, 2]) {
      const pixels = size * scale;
      const win = new BrowserWindow({ show: false, width: pixels, height: pixels, useContentSize: true, transparent: true, frame: false, webPreferences: { offscreen: true } });
      const html = `<body style="margin:0;background:transparent"><div style="width:${pixels}px;height:${pixels}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`;
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      const image = await win.webContents.capturePage({ x: 0, y: 0, width: pixels, height: pixels });
      fs.writeFileSync(path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`), image.toPNG());
      win.destroy();
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(build, 'icon.icns')]);
    fs.rmSync(iconset, { recursive: true, force: true });
    app.exit(0);
  } catch (error) { console.error(error.message); app.exit(1); }
});
