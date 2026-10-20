import { api } from './api';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function copyItem(kind, item, projectId) {
  const note = kind === 'note';
  return api.clipboardWrite({
    text: note ? item.content || item.title : item.name,
    html: note ? `<h1>${esc(item.title)}</h1><div>${esc(item.content || '').replace(/\n/g, '<br>')}</div>` : `<p>${esc(item.name)}</p>`,
    ref: { kind, id: item.id, fromProjectId: projectId }
  });
}
