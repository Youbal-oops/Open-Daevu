const fs = require('node:fs/promises');
const path = require('node:path');
const { constants } = require('node:fs');
const { applyMutation } = require('../shared/domain.mjs');
const { planNoteTransfer } = require('../shared/note-dependencies.mjs');

async function transferItem(store, action) {
  const created = [];
  let sourceFile = null, committed = false;
  try {
    const result = await store.update(async state => {
      const moving = action.type === 'item:move', value = action.value;
      const source = state.projects.find(p => p.id === (moving ? action.projectId : value.fromProjectId));
      const target = state.projects.find(p => p.id === (moving ? value.toProjectId : action.projectId));
      const next = applyMutation(state, action); // Validate before touching files.
      const copies = [];
      if (value.kind === 'note' && source !== target) {
        const note = source.notes.find(n => n.id === value.id);
        copies.push(...planNoteTransfer(source, target, note, moving ? note.id : value.newId).fileCopies);
      } else if (value.kind === 'file') {
        const from = source.files.find(f => f.id === value.id), to = next.projects.find(p => p.id === target.id).files.find(f => f.id === (moving ? value.id : value.newId));
        copies.push({ from, to });
        if (moving) sourceFile = { projectId: source.id, storedName: from.storedName, path: path.join(store.projectDir(source.id), 'files', from.storedName) };
      }
      for (const { from, to } of copies) {
        if (path.basename(from.storedName) !== from.storedName || path.basename(to.storedName) !== to.storedName) throw Error('Invalid stored file name.');
        const destination = path.join(store.projectDir(target.id), 'files', to.storedName);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.copyFile(path.join(store.projectDir(source.id), 'files', from.storedName), destination, constants.COPYFILE_EXCL);
        created.push(destination);
      }
      // Note dependencies keep their originals; other documents may still share them.
      return next;
    }, { owned: true, action, ...(store.options.shared && (action.value?._rwSyncHeads || action._rwSyncHeads) ? { heads: action.value?._rwSyncHeads || action._rwSyncHeads } : {}) });
    committed = true;
    if (sourceFile && !store.state.projects.find(p => p.id === sourceFile.projectId)?.files?.some(f => f.storedName === sourceFile.storedName)) {
      await fs.rm(sourceFile.path, { force: true }).catch(error => console.error('Could not remove the old moved file:', error.message));
    }
    return result;
  } catch (error) { if (!committed) await Promise.all(created.map(file => fs.rm(file, { force: true }).catch(() => {}))); throw error; }
}
module.exports = { transferItem };
