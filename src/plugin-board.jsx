import React, { useMemo, useRef } from 'react';
import { Database as DataIcon, Puzzle } from 'lucide-react';
import { chartRows } from '../shared/chart-data.mjs';
import { PluginPage } from './plugins';
import { SourcePicker } from './chart-editor';
import { useInstalledPlugins } from './chart-kinds';

// A board a plugin draws. The plugin is handed the table and the state it saved last, and hands back new state.
export function PluginBoard({ artifact, project, change, compact = false }) {
  const plugins = useInstalledPlugins(), data = artifact.data, plugin = plugins.find(p => p.id === data.pluginId && p.enabled), board = plugin?.contributes?.boards?.find(b => b.id === data.boardId);
  const table = useMemo(() => chartRows(data, project), [data, project.notes]);
  const latest = useRef({}); latest.current = { artifact, table, change };
  const local = useMemo(() => ({
    'board:get': () => ({ title: latest.current.artifact.title, boardId: latest.current.artifact.data.boardId, editable: Boolean(latest.current.change), state: latest.current.artifact.data.state ?? null, table: latest.current.table }),
    'board:set': state => {
      const { change, artifact } = latest.current;
      if (!change) throw Error('This board is read-only here.');
      if (JSON.stringify(state ?? null).length > 200000) throw Error('Keep a board’s state under 200 KB.');
      change({ data: { ...artifact.data, state } }); return true;
    }
  }), []);
  if (!plugin || !board) return <MissingPlugin info={{ name: plugin?.name || data.pluginId || 'its plugin' }} compact={compact}/>;
  if (compact) return <div className="plugin-board-tile"><Puzzle size={24}/><span>{board.name}</span></div>;
  const stage = <PluginPage plugin={plugin} pageId={'board:' + board.id} title={artifact.title} project={project} local={local} signal={table} className="plugin-board-frame"/>;
  if (!change) return <div className="plugin-board-stage">{stage}</div>;
  return <div className="chart-editor">
    <div className="chart-side"><section className="ce-section"><h4><DataIcon size={14}/>Data</h4><SourcePicker data={data} project={project} set={patch => change({ data: { ...data, ...patch } })} table={table}/></section></div>
    <div className="chart-stage plugin-board-stage">{stage}</div>
  </div>;
}

// Shown in place of a board whose plugin is off or gone. Its data stays untouched.
export function MissingPlugin({ info, compact = false }) {
  return <div className={`plugin-missing${compact ? ' compact' : ''}`}><Puzzle size={compact ? 20 : 26}/><strong>{info.name}</strong>{!compact && <span>Turn this plugin on to open this board.</span>}</div>;
}
