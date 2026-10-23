const fs = require('node:fs/promises');
const path = require('node:path');
const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

// Retain references in pages, documents, charts, canvas, app state, history and trash.
function planInlineCleanup(state, now = Date.now()) {
  const references = JSON.stringify({ ...state, projects: state.projects.map(({ files, ...project }) => project) });
  const removed = []; let changed = false;
  for (const project of state.projects) project.files = project.files.filter(file => {
    if (!file.inline) return true;
    if (references.includes(file.id)) { if (file.unreferencedAt) { delete file.unreferencedAt; changed = true; } return true; }
    const since = Date.parse(file.unreferencedAt || '');
    if (!Number.isFinite(since)) { file.unreferencedAt = new Date(now).toISOString(); changed = true; return true; }
    if (now - since < GRACE_MS) return true;
    removed.push({ projectId: project.id, file }); changed = true; return false;
  });
  return { removed, changed };
}
async function cleanInlineFiles(store, now = Date.now()) {
  // A single device cannot prove that another Drive device has no pending references.
  if (store.options.shared) return [];
  let removed = [];
  const probe = planInlineCleanup(structuredClone(store.state), now);
  if (!probe.changed) return [];
  await store.update(async state => {
    const plan = planInlineCleanup(state, now);
    for (const item of plan.removed) {
      const { projectId, file } = item;
      try {
        if (!file.storedName || path.basename(file.storedName) !== file.storedName) throw Error('Invalid stored inline file name.');
        await fs.rm(path.join(store.projectDir(projectId), 'files', file.storedName), { force: true });
        removed.push(item);
      } catch (error) {
        // Keep metadata for retry rather than forgetting a file that could not be deleted.
        state.projects.find(p => p.id === projectId).files.push(file);
        console.error('Could not reclaim an inline picture:', error.message);
      }
    }
    return state;
  });
  return removed;
}
module.exports = { planInlineCleanup, cleanInlineFiles, GRACE_MS };
