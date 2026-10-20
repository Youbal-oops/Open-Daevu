// App-wide motion for selection. Any tab-like control listed below gets a highlight that glides to the selected item,
// instead of each control painting its own instant background. The highlight is drawn by CSS (see motion.css) from the
// variables this file keeps up to date, so components need no changes: they only mark the selected child as usual.
const SLIDERS = ['.tab-strip', '.segmented', '.agent-panel-tabs', '.filter-pills', '.theme-options', '.workspace-nav', '.project-tree', '[role="tablist"][aria-label="Views"]'].join(',');
const ACTIVE = '[aria-selected="true"], [aria-pressed="true"], [aria-current="true"], .active, .selected';
let started = false, frame = 0, resizer = null;

function place(box) {
  const target = [...box.querySelectorAll(ACTIVE)].find(el => el.offsetParent !== null && el.closest(SLIDERS) === box && !el.closest('.context-menu'));
  const style = box.style;
  if (!target) { style.setProperty('--thumb-o', '0'); return; }
  const outer = box.getBoundingClientRect(), inner = target.getBoundingClientRect(), round = n => Math.round(n * 10) / 10;
  style.setProperty('--thumb-x', `${round(inner.left - outer.left - box.clientLeft + box.scrollLeft)}px`);
  style.setProperty('--thumb-y', `${round(inner.top - outer.top - box.clientTop + box.scrollTop)}px`);
  style.setProperty('--thumb-w', `${round(inner.width)}px`);
  style.setProperty('--thumb-h', `${round(inner.height)}px`);
  style.setProperty('--thumb-o', '1');
  // The first placement of a new control is instant; only later moves glide.
  if (!box.hasAttribute('data-thumb-ready')) requestAnimationFrame(() => requestAnimationFrame(() => box.setAttribute('data-thumb-ready', '')));
}

// Only the controls whose contents changed are measured again, not every control on the page after each change anywhere.
const dirty = new Set();
let everything = true;
function refresh() {
  frame = 0;
  const boxes = everything ? document.querySelectorAll(SLIDERS) : [...dirty];
  everything = false; dirty.clear();
  for (const box of boxes) {
    if (!box.isConnected) continue;
    if (!box.hasAttribute('data-thumb')) { box.setAttribute('data-thumb', ''); resizer.observe(box); }
    place(box);
  }
}

const schedule = () => { if (!frame) frame = requestAnimationFrame(refresh); };

function seen(records) {
  for (const record of records) {
    if (record.type === 'childList') for (const node of record.addedNodes) if (node.nodeType === 1 && (node.matches(SLIDERS) || node.querySelector(SLIDERS))) everything = true;
    for (let el = record.target.nodeType === 1 ? record.target : record.target.parentElement; el; el = el.parentElement) if (el.matches(SLIDERS)) dirty.add(el);
  }
  if (everything || dirty.size) schedule();
}

export function startMotion() {
  if (started || typeof document === 'undefined') return;
  started = true;
  resizer = new ResizeObserver(entries => { for (const entry of entries) dirty.add(entry.target); schedule(); });
  new MutationObserver(seen).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'aria-pressed', 'aria-current', 'hidden'] });
  window.addEventListener('resize', () => { everything = true; schedule(); });
  schedule();
}
