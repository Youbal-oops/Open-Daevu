const fs = require('node:fs/promises');
const CHUNK_BYTES = 1024 * 1024;
async function readFileChunk(file, offset = 0, expectedVersion) {
  if (!Number.isSafeInteger(offset) || offset < 0) throw Error('Invalid file offset.');
  const handle = await fs.open(file, 'r');
  try {
    const { size, mtimeMs, ctimeMs } = await handle.stat(), version = `${size}:${mtimeMs}:${ctimeMs}`;
    if (expectedVersion != null && expectedVersion !== version) throw Error('The file changed while it was being read. Reopen the preview.');
    if (size > 150 * 1024 * 1024) throw Error('This file is too large to preview.');
    if (offset > size) throw Error('The file changed while it was being read. Reopen the preview.');
    const bytes = Buffer.alloc(Math.min(CHUNK_BYTES, size - offset));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, offset);
    return { bytes: bytes.subarray(0, bytesRead), total: size, version };
  } finally { await handle.close(); }
}
module.exports = { readFileChunk, CHUNK_BYTES };
