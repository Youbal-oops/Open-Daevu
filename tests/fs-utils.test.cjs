const { test } = require('node:test');
const assert = require('node:assert/strict');
const { replaceFile } = require('../electron/fs-utils.cjs');
test('atomic replacement retries temporary Windows locks without deleting the old file', async () => {
  let attempts=0;const delays=[];
  await replaceFile('new.tmp','saved.json',async(source,destination)=>{assert.equal(source,'new.tmp');assert.equal(destination,'saved.json');if(++attempts<4)throw Object.assign(Error('busy'),{code:'EPERM'});},async ms=>delays.push(ms));
  assert.equal(attempts,4);assert.deepEqual(delays,[20,40,80]);
});
test('atomic replacement reports persistent locks and unrelated filesystem errors', async () => {
  let attempts=0;
  await assert.rejects(replaceFile('a','b',async()=>{attempts++;throw Object.assign(Error('locked'),{code:'EBUSY'});},async()=>{}),/locked/);assert.equal(attempts,7);
  attempts=0;await assert.rejects(replaceFile('a','b',async()=>{attempts++;throw Object.assign(Error('missing'),{code:'ENOENT'});},async()=>{}),/missing/);assert.equal(attempts,1);
});
test('patient retries ride out a slow Drive lock but still stop on real errors', async () => {
  const { retryTransient, replaceFile } = require('../electron/fs-utils.cjs');
  let n = 0; const delays = [];
  assert.equal(await retryTransient(async () => { if (++n < 6) throw Object.assign(Error('sync'), { code: 'UNKNOWN' }); return 'ok'; }, true, async ms => delays.push(ms)), 'ok');
  assert.equal(n, 6); assert.ok(delays.every((d, i) => i === 0 || d >= delays[i - 1]) && Math.max(...delays) <= 1500);
  n = 0; await assert.rejects(retryTransient(async () => { n++; throw Object.assign(Error('denied'), { code: 'EINVAL' }); }, true, async () => {}), /denied/); assert.equal(n, 1);
  n = 0; await assert.rejects(retryTransient(async () => { n++; throw Object.assign(Error('busy'), { code: 'EBUSY' }); }, false, async () => {}), /busy/); assert.equal(n, 4);
  n = 0; await assert.rejects(replaceFile('a', 'b', async () => { n++; throw Object.assign(Error('locked'), { code: 'EBUSY' }); }, async () => {}, 14, 1500), /locked/); assert.equal(n, 15);
});
