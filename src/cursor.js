// Chooses the app's own pointer for whatever is under the mouse: an arrow, a hand for things you can click, a text bar,
// open and closed hands for panning, resize arrows, a pen, an eraser and so on. It reads the cursor each element asks for
// in its styles, so every part of the app is covered without each one having to know about it.
const NAMES = {
  default: 'arrow', auto: 'arrow', pointer: 'hand', text: 'ibeam', 'vertical-text': 'ibeam',
  grab: 'grab', grabbing: 'grabbing', move: 'move', 'all-scroll': 'move', crosshair: 'crosshair', cell: 'cell',
  'ew-resize': 'ew', 'col-resize': 'ew', 'e-resize': 'ew', 'w-resize': 'ew',
  'ns-resize': 'ns', 'row-resize': 'ns', 'n-resize': 'ns', 's-resize': 'ns',
  'nwse-resize': 'nwse', 'nw-resize': 'nwse', 'se-resize': 'nwse', 'nesw-resize': 'nesw', 'ne-resize': 'nesw', 'sw-resize': 'nesw',
  'not-allowed': 'no', 'no-drop': 'no', wait: 'wait', progress: 'progress', 'zoom-in': 'zoomin', 'zoom-out': 'zoomout', copy: 'copy', alias: 'copy', help: 'help'
};
const original = new WeakMap();
const ours = value => value.startsWith('var(--cursor-');
// What the person is doing with a tool: a pen draws with a pencil, the eraser rubs out, and so on.
function toolCursor(target, name) {
  const tool = target.closest('[data-tool]')?.dataset.tool;
  if (name === 'crosshair' || name === 'cell') {
    if (tool === 'pen') return 'pen';
    if (tool === 'highlight') return 'highlighter';
    if (tool === 'erase') return 'eraser';
  }
  if (tool === 'text' && name === 'crosshair') return 'ibeam';
  return name;
}
function clear(el) {
  if (!el || !ours(el.style.getPropertyValue('cursor'))) return;
  const before = original.get(el);
  el.style.removeProperty('cursor');
  if (before && before.value) el.style.setProperty('cursor', before.value, before.priority);
  original.delete(el);
}
let current = null, pending = null, timer = 0;
function update(target) {
  if (!(target instanceof Element) || !target.isConnected) return;
  if (current && current !== target) clear(current);
  if (ours(target.style.getPropertyValue('cursor'))) clear(target);
  const asked = getComputedStyle(target).cursor, word = asked.startsWith('url') ? 'default' : asked.split(',').pop().trim();
  const name = toolCursor(target, NAMES[word] || 'arrow');
  current = target;
  if (name === 'arrow' && asked.startsWith('url')) return;
  original.set(target, { value: target.style.getPropertyValue('cursor'), priority: target.style.getPropertyPriority('cursor') });
  target.style.setProperty('cursor', `var(--cursor-${name})`, 'important');
}
function run() { timer = 0; if (document.documentElement.dataset.cursor !== 'system') update(pending); }
// A new element under the pointer is handled at once; the same element is looked at again at most every 16ms (a drag can change its pointer).
function schedule(event) {
  pending = event.target;
  if (pending !== current) { clearTimeout(timer); run(); return; }
  if (!timer) timer = setTimeout(run, 16);
}
if (typeof document !== 'undefined') {
  for (const type of ['pointermove', 'pointerdown', 'pointerup', 'pointerover']) document.addEventListener(type, schedule, { passive: true, capture: true });
  // A tool or state can change while the mouse is still, so look again after keys and clicks.
  for (const type of ['keydown', 'keyup', 'click']) document.addEventListener(type, () => { if (current) setTimeout(() => update(current), 30); }, { passive: true, capture: true });
}
