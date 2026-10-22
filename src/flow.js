import { prepareRichInline, layoutNextRichInlineLineRange, measureRichInlineStats } from '@chenglou/pretext/rich-inline';

// Text that runs past a picture: lines beside it get shorter and the blocks below move down. Pretext breaks the lines
// one row at a time (each row can have its own width); the result is a plan of spacers the real text wraps around.
export const GAP = 14;
export const MIN_TEXT = 120;

// A picture left of centre has its text on the right, and the other way round.
export const sideOf = (image, width) => image.x + image.w / 2 < width / 2 ? 'left' : 'right';
const wraps = image => image.wrap !== 'over';

// Wrap modes: 'around', 'break' (text above and below only), 'over' (text ignores it).
// Free span of one row, in the block's own coordinates.
function freeSpan(images, width, block, top, height) {
  let left = 0, right = 0;
  for (const image of images) {
    if (top >= image.y + image.h + GAP / 2 || top + height <= image.y - GAP / 2) continue;
    if (image.wrap === 'break') { left = width; continue; }
    if (sideOf(image, block.columnWidth) === 'left') left = Math.max(left, image.x + image.w + GAP - block.left);
    else right = Math.max(right, block.left + width - (image.x - GAP));
  }
  left = Math.min(width, Math.max(0, left)); right = Math.min(width, Math.max(0, right));
  const free = width - left - right;
  return free < MIN_TEXT && (left || right) ? { left: width, right: 0, free: 0, blocked: true } : { left, right, free, blocked: false };
}

// Rows of one block with the pictures in the way; fit.next(cursor, width) gives the end of the next line.
export function planText(block, images, fit) {
  const rows = [], limit = 4000;
  let cursor, y = block.rowsTop;
  while (rows.length < limit) {
    const span = freeSpan(images, block.width, block, y, block.lineHeight);
    // Rows with no room only count while text is left.
    if (span.blocked) { if (!fit.next(cursor, block.width)) break; rows.push(span); y += block.lineHeight; continue; }
    const line = fit.next(cursor, span.free);
    if (!line) break;
    rows.push(span); cursor = line.end; y += block.lineHeight;
  }
  if (!rows.length) rows.push(freeSpan(images, block.width, block, y, block.lineHeight));
  return rows;
}

// Consecutive rows with the same gap become one floated spacer.
function floatsOf(rows, block) {
  const out = [];
  for (const side of ['left', 'right']) {
    let run = null;
    rows.forEach((row, index) => {
      const size = row[side];
      if (size > 0) {
        if (run && run.w === size) run.rows++;
        else { run = { side, w: Math.round(size), start: index, rows: 1 }; out.push(run); }
      } else run = null;
    });
  }
  return out.map(f => ({ side: f.side, w: f.w + Math.round(f.side === 'left' ? block.padLeft || 0 : block.padRight || 0), mt: Math.round(block.rowsTop - block.wrapTop + f.start * block.lineHeight), h: f.rows * block.lineHeight }));
}

// blocks are measured with no pictures; returns { plan: { [id]: { floats, push, height } }, extra }.
export function planFlow(blocks, images, columnWidth, corrections = {}) {
  const active = images.filter(wraps), plan = {};
  let shift = 0;
  for (const block of blocks) {
    const top = block.top + shift;
    if (block.solid) {
      let push = 0, end = top + block.height;
      for (let again = true, guard = 0; again && guard < 12; guard++) {
        again = false;
        for (const image of active) if (top + push < image.y + image.h + GAP && end + push > image.y - GAP) { const next = image.y + image.h + GAP - top; if (next > push + 0.5) { push = next; again = true; } }
      }
      push += corrections[block.id] || 0;
      if (push > 0) { plan[block.id] = { push: Math.round(push), floats: [] }; shift += push; }
      continue;
    }
    const naturalRows = Math.max(1, block.naturalRows), reach = block.rowsTop + shift + naturalRows * block.lineHeight;
    const near = active.filter(image => image.y - GAP / 2 < reach + block.lineHeight * 4 && image.y + image.h + GAP / 2 > block.rowsTop + shift);
    if (!near.length) continue;
    const shifted = { ...block, columnWidth, rowsTop: block.rowsTop + shift, wrapTop: block.wrapTop + shift };
    const rows = planText(shifted, near, block.fit);
    const floats = floatsOf(rows, shifted);
    if (!floats.length) continue;
    const added = (rows.length - naturalRows) * block.lineHeight;
    plan[block.id] = { floats, push: 0, height: Math.round(block.height + added) };
    shift += added + (corrections[block.id] || 0);
  }
  return { plan, extra: shift };
}

// runs: [{ text, font }] from the drawn text, so bold, italic and code are measured in their own faces.
export function makeFit(runs, whiteSpace) {
  const items = runs.filter(r => r.text);
  if (!items.length) return { next: (cursor) => cursor ? null : { end: { itemIndex: 0, segmentIndex: 0, graphemeIndex: 0 } }, rows: () => 1 };
  const prepared = prepareRichInline(items.map(r => ({ text: r.text, font: r.font })), { whiteSpace: whiteSpace === 'pre-wrap' || whiteSpace === 'pre-line' ? 'pre-wrap' : 'normal' });
  return {
    next: (cursor, width) => { const range = layoutNextRichInlineLineRange(prepared, Math.max(20, width), cursor); return range ? { end: range.end } : null; },
    rows: width => Math.max(1, measureRichInlineStats(prepared, Math.max(20, width)).lineCount)
  };
}
