export function fileInventory(project) {
  const notes = project?.notes || [], uploads = (project?.files || []).filter(file => !file.inline);
  const sheetCount = notes.filter(note => note.kind === 'sheet').length;
  return { uploads, counts: { all: notes.length + uploads.length, note: notes.length - sheetCount, sheet: sheetCount, file: uploads.length } };
}
