// Parsing and ZIP expansion stay off Electron's main thread.
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs/promises');
const JSZip = require('jszip');

async function checkArchive(file, { maxBytes = 100 * 1024 * 1024, maxEntries = 5000 } = {}) {
  const handle = await fs.open(file, 'r');
  let bytes;
  try {
    const stat = await handle.stat();
    if (stat.size > 50 * 1024 * 1024) throw Error('Import documents under 50 MB.');
    const buffer = Buffer.alloc(stat.size + 1); let size = 0;
    while (size < buffer.length) { const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size); if (!bytesRead) break; size += bytesRead; }
    const after = await handle.stat();
    if (size !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw Error('The file changed during import. Try again after it finishes saving.');
    bytes = buffer.subarray(0, size);
  } finally { await handle.close(); }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return bytes;
  const zip = await JSZip.loadAsync(bytes), entries = Object.values(zip.files).filter(e => !e.dir);
  if (entries.length > maxEntries) throw Error('This archive has too many entries to import.');
  let expanded = 0;
  for (const entry of entries) {
    await new Promise((resolve, reject) => {
      const stream = entry.internalStream('uint8array');
      stream.on('data', chunk => {
        expanded += chunk.byteLength;
        if (expanded > maxBytes) { stream.pause(); reject(Error('This document expands beyond the 100 MB import limit.')); }
      }).on('error', reject).on('end', resolve).resume();
    });
  }
  return bytes;
}

async function run({ kind, file, position }) {
  const bytes = await checkArchive(file);
  if (kind === 'sheet') return require('./sheet-files.cjs').importFile(file, position, bytes);
  if (kind === 'word') return require('./doc-convert.cjs').wordToMarkdown(file, bytes);
  throw Error('Unknown document import type.');
}
if (parentPort) run(workerData).then(value => parentPort.postMessage({ value }), error => parentPort.postMessage({ error: error.message }));
module.exports = { checkArchive };
