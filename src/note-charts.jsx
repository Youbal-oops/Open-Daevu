import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from './ui';
import { Plus, X, ArrowUpRight, BarChart3, Eye, EyeOff } from 'lucide-react';
import { sourceOf } from '../shared/chart-data.mjs';
import { ArtifactPreview, newArtifact, kindIcon } from './boards';
import { useBoardKinds, useInstalledPlugins, missingPlugin, CHART_IDS } from './chart-kinds';
import { kindName } from './boards';

const EMBEDDABLE = a => !['html', 'database', 'dashboard'].includes(a.kind);

// Boards in a document float like pictures with the text wrapping round them. "Board" in the slash menu, or Insert board in the right-click menu, lets you pick one you have made.
export function useDocCharts({ project, onOpen }) {
  const plugins = useInstalledPlugins(), [asking, setAsking] = useState(null), usable = (project.artifacts || []).filter(a => EMBEDDABLE(a) && !missingPlugin(a, plugins));
  const finish = id => { asking?.resolve(id); setAsking(null); };
  return {
    entries: [['chart:pick', 'Board', 'Place one of your boards or charts']],
    // Gives back the ID of the board to place, or nothing if you change your mind.
    create: () => new Promise(resolve => setAsking({ resolve })),
    open: id => onOpen(id),
    render: id => <ChartCard artifact={(project.artifacts || []).find(a => a.id === id)} project={project}/>,
    picker: asking && createPortal(<Modal title="Insert a board" subtitle="Pick one of your boards or charts to place in this document." onClose={() => finish(null)}>
      {usable.length ? <div className="board-pick">{usable.map(a => { const Icon = kindIcon(a.kind); return <button key={a.id} type="button" onClick={() => finish(a.id)}><span className="document-icon blue"><Icon size={16}/></span><strong>{a.title}</strong><small>{kindName(a.kind)}</small></button>; })}</div> : <p className="board-pick-empty">No boards yet. Make one in Boards and it will be here.</p>}
    </Modal>, document.body)
  };
}

export function ChartCard({ artifact, project, header }) {
  if (!artifact) return <div className="chart-embed gone"><span>This chart was removed.</span></div>;
  const Icon = kindIcon(artifact.kind);
  return <div className="chart-embed">
    {header || <header><Icon size={14}/><strong>{artifact.title}</strong></header>}
    <div className="chart-embed-body"><ArtifactPreview artifact={artifact} project={project}/></div>
  </div>;
}

// Charts that read from a spreadsheet and sit on top of it. They never move a cell. Each one is an ordinary board whose source is this sheet; where it sits is kept on the board.
export function SheetCharts({ note, project, act, onOpen }) {
  const kinds = useBoardKinds().filter(k => CHART_IDS.includes(k[0]) || k[0].startsWith('plugin:')), [adding, setAdding] = useState(false), [live, setLive] = useState(null), [hidden, setHidden] = useState(false), layer = useRef(null);
  const mine = (project.artifacts || []).filter(a => a.kind !== 'dashboard' && a.data && sourceOf(a.data).type === 'sheet' && sourceOf(a.data).sheetId === note.id);
  const placed = mine.filter(a => a.data.place), save = (artifact, place) => act({ type: 'artifact', projectId: project.id, value: { ...artifact, data: { ...artifact.data, place } } });
  const add = async (kind, label) => {
    const artifact = newArtifact(kind, label), n = placed.length;
    artifact.data = { ...artifact.data, csv: '', source: { type: 'sheet', sheetId: note.id, sheet: '' }, place: { x: 70 + n * 28, y: 90 + n * 28, w: 380, h: 260 } };
    artifact.title = `${note.title} ${label.toLowerCase()}`; setAdding(false); setHidden(false);
    await act({ type: 'artifact', projectId: project.id, value: artifact });
  };
  // Dragging by the title or a corner; saved once on release.
  function begin(event, artifact, mode) {
    if (event.button !== 0) return; event.preventDefault(); event.stopPropagation();
    const from = { ...artifact.data.place }, start = { x: event.clientX, y: event.clientY }, box = layer.current.getBoundingClientRect(); let last = from;
    const move = e => {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      last = mode === 'move' ? { ...from, x: Math.round(Math.max(0, Math.min(box.width - 80, from.x + dx))), y: Math.round(Math.max(0, Math.min(box.height - 40, from.y + dy))) } : { ...from, w: Math.round(Math.max(200, from.w + dx)), h: Math.round(Math.max(140, from.h + dy)) };
      setLive({ id: artifact.id, place: last });
    };
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); setLive(null); if (last !== from) save(artifact, last); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end);
  }
  return <div className="sheet-chart-layer" ref={layer}>
    <div className="sheet-chart-tools">
      {placed.length > 0 && <button type="button" className="sheet-chart-pill" aria-label={hidden ? 'Show charts' : 'Hide charts'} title={hidden ? 'Show charts' : 'Hide charts'} onClick={() => setHidden(!hidden)}>{hidden ? <Eye size={14}/> : <EyeOff size={14}/>}</button>}
      <div className="popover-anchor"><button type="button" className="sheet-chart-pill" aria-expanded={adding} onClick={() => setAdding(!adding)}><BarChart3 size={14}/>Chart<Plus size={13}/></button>
        {adding && <><div className="dash-scrim" onClick={() => setAdding(false)}/><div className="dash-menu down" role="menu">{kinds.map(([kind, name, Icon]) => <button key={kind} role="menuitem" onClick={() => add(kind, name)}><Icon size={15}/>{name}</button>)}</div></>}</div>
    </div>
    {!hidden && placed.map(a => { const place = live?.id === a.id ? live.place : a.data.place, Icon = kindIcon(a.kind);
      return <div key={a.id} className="sheet-chart" style={{ left: place.x, top: place.y, width: place.w, height: place.h }}>
        <ChartCard artifact={a} project={project} header={<header onPointerDown={e => begin(e, a, 'move')}><Icon size={14}/><strong>{a.title}</strong>
          <button type="button" className="icon-button" aria-label="Open chart" title="Open" onPointerDown={e => e.stopPropagation()} onClick={() => onOpen(a.id)}><ArrowUpRight size={14}/></button>
          <button type="button" className="icon-button" aria-label="Take off the sheet" title="Take off the sheet" onPointerDown={e => e.stopPropagation()} onClick={() => save(a, undefined)}><X size={14}/></button></header>}/>
        <span className="sheet-chart-grip" onPointerDown={e => begin(e, a, 'size')}/>
      </div>; })}
  </div>;
}
