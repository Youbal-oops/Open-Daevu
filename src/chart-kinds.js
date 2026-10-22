import { createContext, useContext, useMemo } from 'react';
import { Kanban, BarChart3, LineChart, PieChart, AreaChart, Puzzle, LayoutDashboard, Database as DatabaseIcon } from 'lucide-react';

// [id, name, icon, one-line description, group]. Everything beyond these comes from plugins.
export const KINDS = [
  ['kanban', 'Kanban board', Kanban, 'Columns and cards you drag between stages.', 'work'],
  ['dashboard', 'Dashboard', LayoutDashboard, 'Several charts on one board. Add as many as you like.', 'work'],
  ['database', 'Database', DatabaseIcon, 'Rows with table, board and gallery views.', 'work'],
  ['bar', 'Bar chart', BarChart3, 'Compare values across categories, stacked or side by side.', 'basic'],
  ['line', 'Line chart', LineChart, 'Show change over time, smooth or straight.', 'basic'],
  ['area', 'Area chart', AreaChart, 'Lines with the volume underneath, stacked if you like.', 'basic'],
  ['pie', 'Pie chart', PieChart, 'Shares of a whole, as a pie or a donut.', 'basic']
];
export const GROUPS = [['basic', 'Basic'], ['stats', 'Statistics'], ['business', 'Business'], ['science', 'Science and maths'], ['other', 'From plugins']];
export const CHART_IDS = ['bar', 'line', 'area', 'pie'];

export const InstalledPlugins = createContext([]);
export const useInstalledPlugins = () => useContext(InstalledPlugins);
export const pluginKind = (pluginId, boardId) => `plugin:${pluginId}:${boardId}`;
// The board and chart types on offer: the built-in ones and those of plugins that are on.
export function boardKinds(plugins) {
  const own = plugins.filter(p => p.enabled).flatMap(p => (p.contributes?.boards || []).map(b => [pluginKind(p.id, b.id), b.name, Puzzle, b.hint || p.name, b.group || 'other']));
  return [...KINDS, ...own];
}
export const useBoardKinds = () => { const plugins = useInstalledPlugins(); return useMemo(() => boardKinds(plugins), [plugins]); };
// Starting data for a new board of a plugin's type, if the plugin gave some.
const samples = new Map();
export const setBoardSamples = plugins => { samples.clear(); for (const p of plugins) for (const b of p.contributes?.boards || []) if (b.sample) samples.set(`${p.id}:${b.id}`, b.sample); };
export const boardSample = (pluginId, boardId) => samples.get(`${pluginId}:${boardId}`);
// Themes that enabled plugins add, keyed by plugin and theme ID.
export const pluginThemes = plugins => plugins.filter(p => p.enabled).flatMap(p => (p.contributes?.themes || []).map(t => ({ ...t, key: `${p.id}:${t.id}`, plugin: p.name })));
// What a plugin adds, as short names for the plugin list and the install review.
export const contributionNames = plugin => [...(plugin.contributes?.boards || []).map(b => b.name), ...(plugin.contributes?.fileEditors || []).map(e => `${e.name} (.${e.extensions.join(', .')})`), ...(plugin.contributes?.sheetFunctions || []).map(f => `${f.name}(${f.args.join(', ')})`), ...(plugin.contributes?.themes || []).map(t => `${t.name} theme`), ...Object.entries(plugin.contributes?.browser || {}).flatMap(([kind, list]) => kind === 'blocks' ? (list.length ? [`Blocks ${list.length} kind${list.length === 1 ? '' : 's'} of request`] : []) : list.map(x => `${x.name} (${kind === 'tools' ? 'browser tool' : kind === 'styles' ? 'page style' : 'page script'})`))];
// The plugin a board needs before it can open, or null. A board keeps its data while the plugin is off.
export function missingPlugin(artifact, plugins) {
  if (artifact.kind !== 'plugin-board') return null;
  const p = plugins.find(p => p.id === artifact.data?.pluginId);
  return p?.enabled && (p.contributes?.boards || []).some(b => b.id === artifact.data.boardId) ? null : { id: artifact.data?.pluginId, name: p?.name || artifact.data?.pluginId || 'its plugin' };
}

const SAMPLES = {
  bar: 'Category,Value\nResearch,12\nDesign,8\nBuild,15\nLaunch,6',
  line: 'Month,Revenue,Costs\nJan,12,9\nFeb,15,10\nMar,14,11\nApr,19,12\nMay,23,13\nJun,27,15',
  area: 'Month,Web,Mobile\nJan,12,5\nFeb,15,8\nMar,14,11\nApr,19,14\nMay,23,18\nJun,27,22',
  pie: 'Category,Value\nRent,1200\nFood,450\nTransport,150\nSavings,600'
};
export function newChartData(kind) {
  if (kind === 'dashboard') return { tiles: [] };
  return { csv: SAMPLES[kind] || SAMPLES.bar, sheetId: '' };
}
