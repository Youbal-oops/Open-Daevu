const fs = require('node:fs/promises');
const path = require('node:path');
const { dialog } = require('electron');

// Sandboxed apps cannot download or read files themselves. They hand the host a name and bytes, and the person picks
// the location in a native dialog, so an app only ever touches a file that was chosen on purpose.
const EXPORT_LIMIT = 50 * 1024 * 1024, IMPORT_LIMIT = 25 * 1024 * 1024;
const TYPES = { '.pdf': 'application/pdf', '.json': 'application/json', '.csv': 'text/csv', '.tsv': 'text/tab-separated-values', '.txt': 'text/plain', '.md': 'text/markdown', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.zip': 'application/zip' };
const BLOCKED = /\.(exe|dll|bat|cmd|com|msi|scr|ps1|vbs|js|jse|wsf|lnk|reg|hta|cpl|jar)$/i;

function cleanName(value) {
  const name = path.basename(String(value || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')).replace(/^\.+/, '').slice(0, 120);
  return name || 'export';
}
function cleanExtensions(list) {
  return (Array.isArray(list) ? list : []).map(x => String(x).replace(/^[.*]+/, '').toLowerCase()).filter(x => /^[a-z0-9]{1,8}$/.test(x)).slice(0, 20);
}

async function saveFile(window, name, data) {
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data || []);
  if (bytes.length > EXPORT_LIMIT) throw new Error('Exports can be up to 50 MB.');
  const file = cleanName(name);
  if (BLOCKED.test(file)) throw new Error('Apps cannot export program files.');
  const extension = path.extname(file).slice(1).toLowerCase();
  const picked = await dialog.showSaveDialog(window, { title: 'Export from app', defaultPath: file, filters: [...(extension ? [{ name: extension.toUpperCase() + ' file', extensions: [extension] }] : []), { name: 'All files', extensions: ['*'] }] });
  if (picked.canceled) return false;
  await fs.writeFile(picked.filePath, bytes);
  return true;
}

async function openFile(window, options = {}) {
  const extensions = cleanExtensions(options.accept);
  const picked = await dialog.showOpenDialog(window, { title: 'Import into app', properties: ['openFile'], filters: [...(extensions.length ? [{ name: 'Supported files', extensions }] : []), { name: 'All files', extensions: ['*'] }] });
  if (picked.canceled || !picked.filePaths[0]) return null;
  const source = picked.filePaths[0];
  if ((await fs.stat(source)).size > IMPORT_LIMIT) throw new Error('Import files under 25 MB.');
  const type = TYPES[path.extname(source).toLowerCase()] || 'application/octet-stream';
  return { name: path.basename(source), type, bytes: await fs.readFile(source) };
}

module.exports = { saveFile, openFile, cleanName, cleanExtensions };
