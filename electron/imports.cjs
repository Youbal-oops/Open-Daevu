const path = require('node:path');
const { Worker } = require('node:worker_threads');

function importDocument(kind, file, position, { timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'import-worker.cjs'), {
      workerData: { kind, file, position }, resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 }
    });
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); worker.terminate().catch(() => {});
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => finish(Error('Import took too long. Split the document before importing.')), timeout);
    worker.once('message', result => finish(result.error ? Error(result.error) : null, result.value));
    worker.once('error', error => finish(error));
    worker.once('exit', code => { if (!settled) finish(Error(`Document import stopped before completion (${code}).`)); });
  });
}
module.exports = { importDocument };
