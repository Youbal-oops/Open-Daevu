// Ready-made starting points for the canvas. Each template returns plain items and connectors; the app saves them in one step.
const item = (id, type, text, color, x, y, w, h, extra = {}) => ({ id, type, text, color, position: { x: Math.round(x), y: Math.round(y) }, size: { w, h }, ...extra });
export const TEMPLATES = [
  { id: 'brainstorm', name: 'Brainstorm', hint: 'A frame with sticky notes to fill in' },
  { id: 'retro', name: 'Retrospective', hint: 'Went well, to improve, actions' },
  { id: 'swot', name: 'SWOT analysis', hint: 'Strengths, weaknesses, opportunities, threats' },
  { id: 'flowchart', name: 'Flowchart', hint: 'Start, step, decision, end' },
  { id: 'mindmap', name: 'Mind map', hint: 'A central idea with branches' },
  { id: 'timeline', name: 'Timeline', hint: 'A line with five milestones' }
];
export function buildTemplate(id, at, uid) {
  const x = at.x, y = at.y, items = [], edges = [];
  const link = (a, b, type = 'default', label, from, to) => edges.push({ id: uid(), source: a, target: b, type, ...(label ? { label } : {}), ...(from ? { sourceHandle: from } : {}), ...(to ? { targetHandle: to } : {}), markerEnd: { type: 'arrowclosed' } });
  if (id === 'brainstorm') {
    items.push(item(uid(), 'frame', 'Brainstorm', 'gray', x - 460, y - 290, 920, 580));
    for (let i = 0; i < 6; i++) items.push(item(uid(), 'sticky', i === 0 ? 'Write an idea here' : '', ['yellow', 'green', 'blue', 'pink', 'orange', 'purple'][i], x - 430 + (i % 3) * 290, y - 240 + Math.floor(i / 3) * 250, 240, 200));
  } else if (id === 'retro') {
    ['Went well', 'To improve', 'Actions'].forEach((title, i) => {
      items.push(item(uid(), 'frame', title, 'gray', x - 570 + i * 390, y - 300, 360, 600));
      items.push(item(uid(), 'sticky', '', ['green', 'orange', 'blue'][i], x - 540 + i * 390, y - 230, 300, 150));
    });
  } else if (id === 'swot') {
    ['Strengths', 'Weaknesses', 'Opportunities', 'Threats'].forEach((title, i) => {
      items.push(item(uid(), 'frame', title, 'gray', x - 440 + (i % 2) * 450, y - 320 + Math.floor(i / 2) * 330, 430, 310));
      items.push(item(uid(), 'sticky', '', ['green', 'orange', 'blue', 'pink'][i], x - 410 + (i % 2) * 450, y - 250 + Math.floor(i / 2) * 330, 240, 140));
    });
  } else if (id === 'flowchart') {
    const a = uid(), b = uid(), c = uid(), d = uid(), e = uid();
    items.push(item(a, 'roundrect', 'Start', 'green', x - 480, y - 40, 150, 80), item(b, 'rect', 'Do the first step', 'white', x - 270, y - 40, 190, 80), item(c, 'diamond', 'Good enough?', 'yellow', x - 20, y - 70, 200, 140), item(d, 'rect', 'Improve it', 'white', x + 80, y + 120, 190, 80), item(e, 'roundrect', 'Done', 'blue', x + 260, y - 40, 150, 80));
    link(a, b, 'smoothstep', '', 'right', 'left'); link(b, c, 'smoothstep', '', 'right', 'left'); link(c, e, 'smoothstep', 'Yes', 'right', 'left'); link(c, d, 'smoothstep', 'No', 'bottom', 'top'); link(d, b, 'smoothstep', '', 'left', 'bottom');
  } else if (id === 'mindmap') {
    const root = uid();
    items.push(item(root, 'ellipse', 'Central idea', 'yellow', x - 100, y - 60, 200, 120));
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy], i) => { const n = uid(); items.push(item(n, 'roundrect', 'Branch ' + (i + 1), ['blue', 'green', 'pink', 'orange'][i], x + sx * 300 - 80, y + sy * 170 - 35, 160, 70)); link(root, n, 'default', '', sx > 0 ? 'right' : 'left', sx > 0 ? 'left' : 'right'); });
  } else if (id === 'timeline') {
    items.push(item(uid(), 'arrow', '', 'gray', x - 520, y - 15, 1040, 30));
    ['Kick-off', 'Research', 'Draft', 'Review', 'Launch'].forEach((name, i) => items.push(item(uid(), 'sticky', name, ['blue', 'green', 'yellow', 'orange', 'pink'][i], x - 500 + i * 205, i % 2 ? y + 50 : y - 190, 170, 140)));
  } else return { items: [], edges: [] };
  return { items, edges };
}
