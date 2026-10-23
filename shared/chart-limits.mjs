// Bound SVG work without silently sampling or changing the meaning of a chart.
export function chartRenderError(rows, limit = 20000) {
  let cells = 0;
  for (const row of rows || []) {
    cells += row.length;
    if (cells > limit) return `This chart exceeds the ${limit.toLocaleString('en-US')}-cell rendering limit. Choose a smaller source range or summarize the data in a spreadsheet.`;
  }
  return '';
}
