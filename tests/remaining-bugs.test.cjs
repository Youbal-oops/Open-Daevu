const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { makeFixture } = require('./fixture.cjs');
const { applyMutation, csvParse, csvStringify } = require('../shared/domain.mjs');
const { workbookOf, cleanSheetFields } = require('../shared/workbook.mjs');
const { calculateSheet, sheetContext } = require('../shared/sheet.mjs');

test('renaming a sheet rewrites formulas across tabs and peer books, but not strings or unrelated books (#29)', () => {
  const state = makeFixture(), project = state.projects[0];
  project.notes = [
    { id: 'book', title: 'Budget', kind: 'sheet', sheetName: 'Prices', content: '21', sheets: [{ id: 'other', name: 'Totals', content: csvStringify([['=Prices!A1*2', '=\'Prices\'!A1', '=LEN("Prices!A1")']]) }] },
    { id: 'peer', title: 'Report', kind: 'sheet', content: csvStringify([['=[Budget]Prices!A1*2', "='[book]Prices'!A1", '=[Other]Prices!A1', '=LEN("[Budget]Prices!A1")']]) }
  ];
  project.artifacts = [{ id: 'chart', kind: 'bar', data: { source: { type: 'sheet', sheetId: 'book', sheet: 'Prices' } } }];
  const next = applyMutation(state, { type: 'note', projectId: project.id, value: { ...project.notes[0], sheetName: "Price's list" } });
  const [book, peer] = next.projects[0].notes, tabs = workbookOf(book);
  assert.deepEqual(csvParse(tabs[1].content)[0], ["='Price''s list'!A1*2", "='Price''s list'!A1", '=LEN("Prices!A1")']);
  assert.deepEqual(csvParse(peer.content)[0], ["='[Budget]Price''s list'!A1*2", "='[book]Price''s list'!A1", '=[Other]Prices!A1', '=LEN("[Budget]Prices!A1")']);
  assert.equal(calculateSheet(csvParse(tabs[1].content), sheetContext(tabs, csvParse, tabs[1].name))[0][0], 42);
  assert.equal(state.projects[0].notes[0].sheetName, 'Prices');
  assert.equal(next.projects[0].artifacts[0].data.source.sheet, "Price's list");
});

test('every imported sheet satisfies save limits, and oversized imports fail atomically (#27)', () => {
  const { noteFromSheets } = require('../electron/sheet-files.cjs');
  const good = noteFromSheets('Book', [{ name: 'First', rows: [['a']] }, { name: 'Second', rows: [['x'.repeat(1999999)]] }], {});
  assert.doesNotThrow(() => cleanSheetFields(good));
  for (const at of [0, 1]) {
    const sheets = [{ name: 'First', rows: [['a']] }, { name: 'Second', rows: [['b']] }];
    sheets[at].rows = [['x'.repeat(2000001)]];
    assert.throws(() => noteFromSheets('Book', sheets, {}), /2,000,000/);
  }
});

test('over-limit rows, columns and sheet counts are rejected instead of silently truncated (#26)', async t => {
  const XLSX = require('@e965/xlsx'), { readWorkbook } = require('../electron/sheet-files.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-bounds-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const ref of ['A1:A10001', 'A1:IW2']) {
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, { A1: { t: 's', v: 'a' }, '!ref': ref }, 'Data');
    const file = path.join(dir, 'large.xlsx'); XLSX.writeFile(wb, file);
    assert.throws(() => readWorkbook(file), /exceeds the import limit/);
  }
  const wb = XLSX.utils.book_new();
  for (let n = 0; n < 25; n++) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a']]), 'S' + n);
  const file = path.join(dir, 'tabs.xlsx'); XLSX.writeFile(wb, file);
  assert.throws(() => readWorkbook(file), /more than 24 sheets/);
});

test('document copies and moves carry picture bytes and embedded chart sources (#35)', async t => {
  const { Store } = require('../electron/store.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dependencies-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = new Store(dir); await store.init();
  const state = makeFixture(), source = state.projects[0], target = { ...structuredClone(source), id: 'target', notes: [], files: [], artifacts: [] };
  source.notes = [{ id: 'doc', title: 'Document', kind: 'note', content: '', images: [{ id: 'img', fileId: 'pic' }, { id: 'plot', chartId: 'chart' }] }, { id: 'data', title: 'Numbers', kind: 'sheet', content: 'a,b\nx,=[Rates]Data!A1' }, { id: 'rates', title: 'Rates', kind: 'sheet', sheetName: 'Data', content: '42' }];
  target.notes.push({ id: 'target-rates', title: 'Rates', kind: 'sheet', sheetName: 'Data', content: '999' });
  source.files = [{ id: 'pic', name: 'Pic.png', storedName: 'pic.png', inline: true }];
  source.artifacts = [{ id: 'chart', kind: 'bar', data: { source: { type: 'sheet', sheetId: 'data' } } }];
  state.projects.push(target); await store.update(() => state);
  await fs.writeFile(path.join(store.projectDir(source.id), 'files/pic.png'), 'picture');
  await store.mutate({ type: 'item:copy', projectId: target.id, value: { kind: 'note', id: 'doc', newId: 'copied', fromProjectId: source.id } });
  let copied = store.state.projects.find(p => p.id === target.id);
  const copiedPicture = copied.files.find(f => f.id === copied.notes.find(n => n.id === 'copied').images[0].fileId);
  assert.notEqual(copiedPicture.id, 'pic');
  assert.equal(await fs.readFile(path.join(store.projectDir(target.id), 'files', copiedPicture.storedName), 'utf8'), 'picture');
  assert.notEqual(copied.artifacts[0].data.source.sheetId, 'data');
  const dataNote = copied.notes.find(n => n.id === copied.artifacts[0].data.source.sheetId), { projectFiles } = require('../shared/workbook.mjs');
  assert.equal(calculateSheet(csvParse(dataNote.content), sheetContext(workbookOf(dataNote), csvParse, 'Sheet 1', projectFiles(copied.notes, csvParse, dataNote.id)))[1][1], '42');
  assert.equal(copied.notes.filter(n => n.title === 'Rates').length, 1, 'copied dependencies do not shadow an existing workbook title');
  assert.equal(copied.notes.find(n => n.id === 'target-rates').content, '999');
  await store.mutate({ type: 'item:move', projectId: source.id, value: { kind: 'note', id: 'doc', toProjectId: target.id } });
  copied = store.state.projects.find(p => p.id === target.id);
  const movedPicture = copied.files.find(f => f.id === copied.notes.find(n => n.id === 'doc').images[0].fileId);
  assert.equal(await fs.readFile(path.join(store.projectDir(target.id), 'files', movedPicture.storedName), 'utf8'), 'picture');
  assert.ok(!store.state.projects[0].notes.some(n => n.id === 'doc'));
  assert.equal(await fs.readFile(path.join(store.projectDir(source.id), 'files/pic.png'), 'utf8'), 'picture', 'shared source bytes remain');
});

test('a missing dependency leaves the original document and destination unchanged (#35)', async t => {
  const { Store } = require('../electron/store.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'missing-dependency-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = new Store(dir); await store.init();
  const state = makeFixture(); state.projects[0].notes[0].images = [{ id: 'img', fileId: 'missing' }];
  state.projects.push({ ...structuredClone(state.projects[0]), id: 'target', notes: [], files: [] }); await store.update(() => state);
  const before = structuredClone(store.state);
  await assert.rejects(store.mutate({ type: 'item:move', projectId: state.projects[0].id, value: { kind: 'note', id: 'brief', toProjectId: 'target' } }), /picture is missing/);
  assert.deepEqual(store.state, before);
  await store.update(s => {
    s.projects[0].notes[0].images = [{ id: 'one', fileId: 'present' }, { id: 'two', fileId: 'missing' }];
    s.projects[0].files = ['present', 'missing'].map(id => ({ id, name: id + '.png', storedName: id + '.png', inline: true })); return s;
  });
  await fs.writeFile(path.join(store.projectDir(state.projects[0].id), 'files/present.png'), 'present');
  const beforeMissingBytes = structuredClone(store.state);
  await assert.rejects(store.mutate({ type: 'item:copy', projectId: 'target', value: { kind: 'note', id: 'brief', newId: 'failed-copy', fromProjectId: state.projects[0].id } }), { code: 'ENOENT' });
  assert.deepEqual(store.state, beforeMissingBytes);
  assert.deepEqual(await fs.readdir(path.join(store.projectDir('target'), 'files')), [], 'partial dependency copies are removed on failure');
});

test('moving a workbook preserves cyclic cross-book references without recursive copying (#35)', () => {
  const state = makeFixture(), project = state.projects[0];
  project.notes = [{ id: 'root', title: 'Root', kind: 'sheet', content: '=[Other]Sheet 1!A1' }, { id: 'other', title: 'Other', kind: 'sheet', content: '=[Root]Sheet 1!A1' }];
  const target = { ...structuredClone(project), id: 'target', notes: [], files: [] }; state.projects.push(target);
  project.artifacts = [{ id: 'overlay', kind: 'bar', data: { source: { type: 'sheet', sheetId: 'root' } } }];
  const next = applyMutation(state, { type: 'item:move', projectId: project.id, value: { kind: 'note', id: 'root', toProjectId: target.id } });
  const moved = next.projects[1], root = moved.notes.find(n => n.id === 'root');
  assert.equal(moved.notes.length, 2);
  const other = moved.notes.find(n => n.id !== 'root');
  assert.equal(csvParse(root.content)[0][0], `='[${other.id}]Sheet 1'!A1`);
  assert.equal(csvParse(other.content)[0][0], "='[root]Sheet 1'!A1", 'the back-reference points to the moved workbook rather than making another copy');
  const source = next.projects[0], snapshot = source.notes.find(n => n.id === source.artifacts[0].data.source.sheetId);
  assert.ok(snapshot && snapshot.id !== 'root');
  assert.match(snapshot.title, /chart source/);
  assert.ok(!source.notes.some(n => n.id === 'root'));
  assert.ok(source.notes.find(n => n.id === 'other').content.includes(snapshot.id), 'source-project dependents keep a reference to the retained data');
  project.notes[0].content = '42';
  const simpleMove = applyMutation(state, { type: 'item:move', projectId: project.id, value: { kind: 'note', id: 'root', toProjectId: target.id } });
  const sourceAfterMove = simpleMove.projects[0];
  assert.deepEqual(require('../shared/chart-data.mjs').chartRows(sourceAfterMove.artifacts[0].data, sourceAfterMove).rows, [['42']], 'the board left in the source project still renders its retained values');
});

test('inline cleanup preserves live, trash, canvas and app references and observes a grace period (#36)', () => {
  const { planInlineCleanup, GRACE_MS } = require('../electron/inline-cleanup.cjs');
  const state = makeFixture(), project = state.projects[0], now = Date.now();
  project.files = ['live', 'canvas-pic', 'app-pic', 'trashed', 'unused'].map(id => ({ id, inline: true, storedName: id + '.png' }));
  project.files.push({ id: 'upload', storedName: 'upload.pdf' });
  project.notes[0].images = [{ fileId: 'live' }]; project.canvas = [{ fileId: 'canvas-pic' }];
  project.artifacts = [{ data: { state: { image: 'app-pic' } } }]; state.trash = [{ item: { images: [{ fileId: 'trashed' }] } }];
  assert.equal(planInlineCleanup(state, now).removed.length, 0);
  assert.ok(project.files.find(f => f.id === 'unused').unreferencedAt);
  assert.equal(planInlineCleanup(state, now + GRACE_MS - 1).removed.length, 0);
  assert.deepEqual(planInlineCleanup(state, now + GRACE_MS).removed.map(r => r.file.id), ['unused']);
  assert.ok(project.files.find(f => f.id === 'upload'));
});

test('imports run in bounded workers and reject excessive ZIP expansion (#56)', async t => {
  const { importDocument } = require('../electron/imports.cjs'), { checkArchive } = require('../electron/import-worker.cjs'), JSZip = require('jszip');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-worker-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'data.csv'); await fs.writeFile(file, 'A,B\n00123,42');
  const note = await importDocument('sheet', file, { x: 1, y: 2 }); assert.equal(note.content, 'A,B\n00123,42');
  const snapshot = await checkArchive(file); await fs.writeFile(file, 'changed,after validation');
  assert.equal(require('../electron/sheet-files.cjs').importFile(file, {}, snapshot).content, 'A,B\n00123,42', 'the parser uses the bytes that passed archive validation');
  const zip = new JSZip(); zip.file('big.xml', 'x'.repeat(100000));
  const archive = path.join(dir, 'bomb.docx'); await fs.writeFile(archive, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  await assert.rejects(checkArchive(archive, { maxBytes: 1000 }), /expands beyond/);
  await assert.rejects(checkArchive(archive, { maxEntries: 0 }), /too many entries/);
  await assert.rejects(importDocument('sheet', file, {}, { timeout: 1 }), /too long/);
});

test('preview reads use bounded IPC chunks and reject invalid offsets (#56)', async t => {
  const { readFileChunk, CHUNK_BYTES } = require('../electron/file-chunks.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-chunks-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'large.bin'), data = Buffer.alloc(CHUNK_BYTES + 13, 42); await fs.writeFile(file, data);
  const first = await readFileChunk(file), second = await readFileChunk(file, first.bytes.length);
  assert.equal(first.bytes.length, CHUNK_BYTES); assert.equal(second.bytes.length, 13); assert.equal(first.total, data.length);
  assert.ok(Buffer.concat([first.bytes, second.bytes]).equals(data));
  await assert.rejects(readFileChunk(file, -1), /offset/);
  await assert.rejects(readFileChunk(file, data.length + 1), /changed/);
  await fs.utimes(file, new Date(), new Date(Date.now() + 10000));
  await assert.rejects(readFileChunk(file, first.bytes.length, first.version), /changed/);
});

test('unsupported imported formulas retain cached values across save and export (#26)', async t => {
  const XLSX = require('@e965/xlsx'), { importFile, writeNote } = require('../electron/sheet-files.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'formula-cache-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, { A1: { t: 'n', v: 42, f: 'INDIRECT("B1")' }, B1: { t: 'n', v: 42 }, C1: { t: 'n', v: 84, f: 'A1*2' }, '!ref': 'A1:C1' }, 'Data');
  const file = path.join(dir, 'input.xlsx'); XLSX.writeFile(wb, file);
  const note = importFile(file, {}), state = makeFixture();
  const saved = applyMutation(state, { type: 'note', projectId: state.projects[0].id, value: note }).projects[0].notes.find(n => n.id === note.id);
  assert.equal(csvParse(saved.content)[0][0], '=INDIRECT("B1")');
  const values = calculateSheet(csvParse(saved.content), sheetContext(workbookOf(saved), csvParse, 'Data'));
  assert.deepEqual(values[0], [42, '42', 84]);
  const output = path.join(dir, 'output.xlsx'); writeNote(saved, output, {});
  const back = XLSX.readFile(output).Sheets.Data;
  assert.equal(back.A1.f, 'INDIRECT("B1")'); assert.equal(back.A1.v, 42);
  const changed = { ...saved, content: csvStringify([['=UNSUPPORTED("new")']]) };
  assert.equal(calculateSheet(csvParse(changed.content), sheetContext(workbookOf(changed), csvParse, 'Data'))[0][0], '#NAME?', 'an edited formula cannot reuse another formula cache');
  assert.throws(() => cleanSheetFields({ formulaCache: { A1: { formula: '=X()', value: {} } } }), /formula cache/);
});

test('oversized charts have a bounded diagnostic instead of creating unbounded SVG nodes (#41)', () => {
  const { chartRenderError } = require('../shared/chart-limits.mjs');
  assert.equal(chartRenderError([['x', 'y'], ['a', '42']]), '');
  assert.match(chartRenderError(Array.from({ length: 10000 }, () => Array(14).fill('1'))), /smaller source range/);
});

test('preload reassembles multiple bounded IPC chunks without changing its readFile API (#56)', async () => {
  const vm = require('node:vm'), data = Buffer.alloc(2 * 1024 * 1024 + 13, 42), calls = [];
  let api;
  const preload = await fs.readFile(path.join(__dirname, '../electron/preload.cjs'), 'utf8');
  vm.runInNewContext(preload, { require: name => {
    assert.equal(name, 'electron');
    return { contextBridge: { exposeInMainWorld(name, exposed) { if (name === 'workspace') api = exposed; } }, ipcRenderer: { on() {}, invoke: async (channel, project, file, offset, version) => {
      assert.equal(channel, 'files:read'); calls.push(offset);
      if (offset) assert.equal(version, 'v1');
      return { bytes: data.subarray(offset, offset + 1024 * 1024), total: data.length, version: 'v1' };
    } } };
  } });
  assert.ok(Buffer.from(await api.readFile('project', 'file')).equals(data));
  assert.deepEqual(calls, [0, 1024 * 1024, 2 * 1024 * 1024]);
});

test('expired unreferenced inline bytes are reclaimed, while shared Drive cleanup is skipped (#36)', async t => {
  const { Store } = require('../electron/store.cjs'), { cleanInlineFiles, GRACE_MS } = require('../electron/inline-cleanup.cjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'inline-gc-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = new Store(dir); await store.init();
  const state = makeFixture(), project = state.projects[0], now = Date.now();
  project.files.push({ id: 'expired', storedName: 'expired.png', inline: true, unreferencedAt: new Date(now - GRACE_MS).toISOString() });
  await store.update(() => state);
  const file = path.join(store.projectDir(project.id), 'files/expired.png'); await fs.writeFile(file, 'old picture');
  assert.equal((await cleanInlineFiles(store, now)).length, 1);
  await assert.rejects(fs.stat(file), { code: 'ENOENT' });
  assert.ok(!store.state.projects[0].files.length);
  assert.deepEqual(await cleanInlineFiles({ options: { shared: true } }), []);
});
