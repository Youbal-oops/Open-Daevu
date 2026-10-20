import { markdownToBlocks } from './blocks.mjs';
import { saveNoteRecord } from './domain.mjs';
import { validateEvent } from './calendar.mjs';

const lower = value => String(value || '').trim().toLowerCase();
const stamp = () => new Date().toISOString();
const findProject = (state, current, name) => !name ? current : state.projects.find(p => p.id === name || lower(p.name) === lower(name)) || null;
const findNote = (project, ref) => project.notes.find(n => n.id === ref || lower(n.title) === lower(ref));
function pageOf(project) { project.page ||= { icon: '', cover: '', blocks: [] }; project.page.blocks ||= []; return project.page; }
function trimBlank(blocks) { while (blocks.length && blocks.at(-1).type === 'p' && !blocks.at(-1).text) blocks.pop(); return blocks; }

// Applies the pages, comments and links an agent asked for. Projects and documents are found by exact id or title.
export function applyAgentWork(state, current, actions, agent, makeId, say) {
  for (const item of (actions.events || []).slice(0, 12)) {
    state.calendars = Array.isArray(state.calendars) && state.calendars.length ? state.calendars : [{ id: 'personal', name: 'Personal', color: '#4f8cff', visible: true }];
    state.events ||= [];
    if (state.events.length >= 5000) { say('Calendar events skipped: the calendar is full.'); break; }
    const calendar = state.calendars.find(c => lower(c.name) === lower(item.calendar)) || state.calendars[0];
    try { state.events.push(validateEvent({ id: makeId(), calendarId: calendar.id, title: item.title, start: item.start, end: item.end, allDay: item.allDay, location: item.location, notes: item.notes, projectId: current.id, createdBy: agent.name }, state.calendars)); }
    catch (error) { say(`Event "${item.title}" was not added: ${error.message}`); }
  }
  for (const edit of (actions.pages || []).slice(0, 3)) {
    const target = findProject(state, current, edit.project);
    if (!target) { say(`Page edit skipped: there is no project named "${edit.project}".`); continue; }
    const page = pageOf(target), fresh = markdownToBlocks(edit.markdown, makeId);
    page.blocks = (edit.mode === 'replace' ? fresh : [...trimBlank(page.blocks), ...fresh]).slice(0, 2000);
    page.updatedAt = stamp();
    say(`${agent.name} ${edit.mode === 'replace' ? 'rewrote' : 'added to'} the page of "${target.name}" (${fresh.length} blocks).`);
  }
  for (const item of (actions.comments || []).slice(0, 8)) {
    const target = findProject(state, current, item.project);
    if (!target) { say(`Comment skipped: there is no project named "${item.project}".`); continue; }
    let holder, blocks;
    if (item.on === 'page') { holder = pageOf(target); blocks = holder.blocks; }
    else { holder = findNote(target, item.note); if (!holder) { say(`Comment skipped: no document "${item.note}" in "${target.name}".`); continue; } blocks = holder.blocks || []; }
    const block = item.block ? blocks.find(b => lower(b.text).includes(lower(item.block))) : null;
    holder.comments ||= [];
    if (holder.comments.length >= 500) continue;
    holder.comments.push({ id: makeId(), text: item.text, author: agent.name, agentId: agent.id, createdAt: stamp(), resolved: false, ...(block ? { blockId: block.id } : {}) });
  }
  for (const link of (actions.links || []).slice(0, 8)) {
    const source = findProject(state, current, link.from?.project);
    if (!source) { say(`Link skipped: there is no project named "${link.from?.project}".`); continue; }
    let destProject = link.to.project ? findProject(state, current, link.to.project) : null, destNote = null;
    if (link.to.note) {
      for (const candidate of destProject ? [destProject] : [source, ...state.projects.filter(p => p !== source)]) {
        const found = findNote(candidate, link.to.note);
        if (found) { destNote = found; destProject = candidate; break; }
      }
      if (!destNote) { say(`Link skipped: no document "${link.to.note}".`); continue; }
    } else if (!destProject) { say(`Link skipped: there is no project named "${link.to.project}".`); continue; }
    const text = destNote ? `[[${destNote.title}]]` : `[[@${destProject.name}]]`, label = link.label ? `${link.label}: ` : 'Related: ';
    if (link.from?.page) {
      const page = pageOf(source), blocks = trimBlank(page.blocks);
      if (!destNote && destProject !== source) blocks.push({ id: makeId(), type: 'embed', text: '', refType: 'folder', refId: destProject.id });
      else if (destNote && destProject === source) blocks.push({ id: makeId(), type: 'embed', text: '', refType: 'note', refId: destNote.id });
      else blocks.push({ id: makeId(), type: 'p', text: label + text });
      page.blocks = blocks; page.updatedAt = stamp();
    } else {
      const note = link.from?.note ? findNote(source, link.from.note) : null;
      if (!note) { say(`Link skipped: no document "${link.from?.note}" to put it in.`); continue; }
      const next = note.format === 'blocks'
        ? { ...note, blocks: [...trimBlank([...note.blocks]), { id: makeId(), type: 'p', text: label + text }] }
        : { ...note, content: `${note.content.replace(/\s+$/, '')}\n\n${label}${text}\n` };
      next.updatedAt = stamp();
      source.notes[source.notes.findIndex(n => n.id === note.id)] = saveNoteRecord(note, next);
    }
  }
}
