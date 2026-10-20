const fs = require('node:fs/promises');
// Errors Windows and Google Drive for desktop raise while a file is briefly locked or syncing.
const TRANSIENT = ['EPERM', 'EBUSY', 'EACCES', 'EIO', 'UNKNOWN', 'ETIMEDOUT', 'EAGAIN', 'ENOENT'];
const isTransient = error => TRANSIENT.includes(error?.code);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function replaceFile(source, destination, rename = fs.rename, delay = wait, retries = 6, ceiling = 300) {
  for (let attempt = 0; ; attempt++) {
    try { return await rename(source, destination); }
    catch (error) {
      if (attempt >= retries || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      // Keep the old file intact while Windows releases a short-lived file handle.
      await delay(Math.min(20 * 2 ** attempt, ceiling));
    }
  }
}
// Runs a file operation again when the failure is a temporary lock. Drive needs far more patience than a local disk.
async function retryTransient(operation, patient = false, delay = wait) {
  const retries = patient ? 10 : 3, ceiling = patient ? 1500 : 200;
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) { if (attempt >= retries || !isTransient(error) || error.code === 'ENOENT' && !patient) throw error; await delay(Math.min(30 * 2 ** attempt, ceiling)); }
  }
}
module.exports = { replaceFile, retryTransient, isTransient, TRANSIENT };
