import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './base.css';
import { Chart } from './charts.jsx';
import { Options, defaults } from './options.jsx';

// The board's own settings are kept as the plugin's state; the table comes from the host.
function App() {
  const sdk = window.workspacePlugin, [board, setBoard] = useState(null), [state, setState] = useState(null), timer = useRef(0), pending = useRef(null);
  async function load() {
    const [info, next] = await Promise.all([sdk.ready(), sdk.board.get()]);
    document.documentElement.dataset.theme = info.theme === 'light' ? 'light' : 'dark';
    setBoard(next); setState(old => old || { ...defaults(next.boardId), ...(next.state || {}) });
  }
  useEffect(() => {
    load().catch(() => {});
    const flush = () => { if (pending.current) { sdk.board.set(pending.current).catch(() => {}); pending.current = null; } };
    window.addEventListener('pagehide', flush);
    const off = sdk.onChange(() => load().catch(() => {}));
    return () => { off(); window.removeEventListener('pagehide', flush); flush(); };
  }, []);
  if (!board || !state) return null;
  const change = patch => { const next = { ...state, ...patch }; setState(next); pending.current = next; clearTimeout(timer.current); timer.current = setTimeout(() => { sdk.board.set(next).catch(() => {}); pending.current = null; }, 250); };
  const kind = board.boardId, chart = <Chart kind={kind} table={board.table} data={state} compact={!board.editable}/>;
  return board.editable ? <div className="editor"><aside><Options kind={kind} data={state} table={board.table} change={change}/></aside><main>{chart}</main></div> : <main className="solo">{chart}</main>;
}
createRoot(document.getElementById('root')).render(<App/>);
