import React, { useEffect, useRef, useState } from 'react';
import { Settings2, Palette, Bot, HardDrive, Download, Info, Sun, Moon, Check, ChevronsUpDown, Power, User, Link2, RefreshCw, FolderOpen, X, PanelLeft, PanelRight, Pencil, Trash2, Puzzle, Wrench } from 'lucide-react';
import { api } from './api';
import { UserAvatar } from './ui';
import { useDock } from './dock';
import { useInstalledPlugins, pluginThemes } from './chart-kinds';

// The menu that opens from your name at the bottom of the project list.
export function ProfileMenu({ settings, theme, storage, update, onProfile, onSettings, onConnections, onTools, onPlugins, onTheme, onUpdates }) {
  const [open, setOpen] = useState(false), root = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = e => { if (!root.current?.contains(e.target)) setOpen(false); }, key = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);
  const go = fn => () => { setOpen(false); fn(); };
  const where = window.workspace ? (storage?.mode === 'drive' ? 'Drive folder' : 'On this computer') : 'Browser preview';
  return <div className="profile-bar" ref={root}>
    {open && <div className="profile-menu" role="menu" aria-label="Account">
      <div className="profile-menu-head"><UserAvatar settings={settings}/><div><strong>{settings.userName || 'My workspace'}</strong><small>{where}</small></div></div>
      <button role="menuitem" onClick={go(onProfile)}><Pencil size={15}/>Edit profile</button>
      <button role="menuitem" onClick={go(onSettings)}><Settings2 size={15}/>Settings<kbd>Ctrl ,</kbd></button>
      <button role="menuitem" onClick={go(onPlugins)}><Puzzle size={15}/>Plugins</button>
      <button role="menuitem" onClick={go(onTools)}><Wrench size={15}/>Tools & MCP</button>
      <button role="menuitem" onClick={go(onConnections)}><Link2 size={15}/>Connections</button>
      <div className="profile-menu-theme" role="group" aria-label="Appearance">
        {[['light', Sun, 'Light'], ['dark', Moon, 'Dark']].map(([value, Icon, label]) => <button key={value} type="button" className={theme === value ? 'on' : ''} aria-pressed={theme === value} onClick={() => onTheme(value)}><Icon size={14}/>{label}</button>)}
      </div>
      <button role="menuitem" onClick={go(onUpdates)}><Download size={15}/>{update?.available ? `Update to ${update.available.version}` : 'Check for updates'}{update?.available && <i className="menu-dot"/>}</button>
      {window.workspace?.quitApp && <><div className="profile-menu-sep"/><button role="menuitem" className="danger" onClick={go(() => window.workspace.quitApp())}><Power size={15}/>Quit Daevu</button></>}
    </div>}
    <button className="profile-open" aria-haspopup="menu" aria-expanded={open} aria-label="Account and settings" onClick={() => setOpen(v => !v)}>
      <UserAvatar settings={settings}/><div>{settings.userName || 'My workspace'}<small>{where}</small></div><ChevronsUpDown size={14} className="profile-chevron"/>
    </button>
  </div>;
}

const Switch = ({ on, onChange, label }) => <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}><i/></button>;
const Row = ({ title, hint, children }) => <div className="set-row"><div className="set-text"><strong>{title}</strong>{hint && <small>{hint}</small>}</div><div className="set-control">{children}</div></div>;
const Group = ({ title, note, children }) => <section className="set-group">{title && <h3>{title}</h3>}<div className="set-card">{children}</div>{note && <p className="set-note">{note}</p>}</section>;
function Stepper({ value, min, max, onChange, label }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = v => { const n = Math.max(min, Math.min(max, Math.round(Number(v)))); if (Number.isFinite(n)) onChange(n); setText(String(Number.isFinite(n) ? n : value)); };
  return <div className="stepper"><button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => commit(value - 1)}>−</button><input aria-label={label} inputMode="numeric" value={text} onChange={e => setText(e.target.value)} onBlur={e => commit(e.target.value)} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}/><button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => commit(value + 1)}>+</button></div>;
}
function Segmented({ value, options, onChange, label }) {
  return <div className="segment" role="radiogroup" aria-label={label}>{options.map(([v, text, Icon]) => <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{Icon && <Icon size={14}/>}{text}</button>)}</div>;
}

const SECTIONS = [['general', 'General', Settings2, 'gray'], ['appearance', 'Appearance', Palette, 'purple'], ['agents', 'Agents', Bot, 'green'], ['storage', 'Storage', HardDrive, 'blue'], ['updates', 'Updates', Download, 'orange'], ['about', 'About', Info, 'gray']];

export function SettingsWindow({ state, act, perform, update, section = 'general', onClose, onConnections }) {
  const themes = pluginThemes(useInstalledPlugins()), chosen = state.settings.pluginTheme || '';
  const [active, setActive] = useState(section), [error, setError] = useState(''), [leaving, setLeaving] = useState(false), [wipe, setWipe] = useState(false), [checking, setChecking] = useState(false), [note, setNote] = useState('');
  const settings = state.settings, { dock, setSide, resetWidth, swap } = useDock(), desktop = Boolean(window.workspace);
  useEffect(() => { const key = e => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, []);
  const save = patch => act({ type: 'settings', value: patch }).catch(e => setError(e.message));
  async function check() { setChecking(true); setNote(''); try { const s = await api.updateCheck(); setNote(s?.available ? `Daevu ${s.available.version} is available.` : s?.error || 'You are up to date.'); } catch (e) { setNote(e.message); } finally { setChecking(false); } }
  const shown = SECTIONS.filter(([id]) => id !== 'agents' || settings.aiAgents !== false);

  const pages = {
    general: <>
      <Group title="Workspace"><Row title="AI agents"><Switch label="Use AI agents" on={settings.aiAgents !== false} onChange={v => save({ aiAgents: v })}/></Row></Group>
      <Group title="Startup"><Row title="Open when I sign in to Windows"><Switch label="Launch at login" on={Boolean(settings.launchAtLogin)} onChange={v => save({ launchAtLogin: v })}/></Row><Row title="Keep running when the window closes"><Switch label="Keep running in the tray" on={settings.keepRunning !== false} onChange={v => save({ keepRunning: v })}/></Row></Group>
    </>,
    appearance: <>
      <Group title="Theme"><div className="theme-cards">{[['light', Sun, 'Light'], ['dark', Moon, 'Dark']].map(([value, Icon, label]) => <button key={value} type="button" className={`theme-card ${value}${state.theme === value ? ' on' : ''}`} aria-pressed={state.theme === value && !chosen} onClick={() => perform(async () => { await act({ type: 'theme', value }); if (chosen) await act({ type: 'settings', value: { pluginTheme: '' } }); })}><span className="theme-preview"><i/><i/><i/></span><span className="theme-label"><Icon size={14}/>{label}{state.theme === value && !chosen && <Check size={14}/>}</span></button>)}{themes.map(t => <button key={t.key} type="button" className={`theme-card ${t.mode}${chosen === t.key ? ' on' : ''}`} aria-pressed={chosen === t.key} onClick={() => perform(async () => { await act({ type: 'theme', value: t.mode }); await act({ type: 'settings', value: { pluginTheme: t.key } }); })}><span className="theme-preview" style={t.vars}><i/><i/><i/></span><span className="theme-label">{t.name}{chosen === t.key && <Check size={14}/>}</span></button>)}</div></Group>
      <Group title="Layout"><Row title="Project list"><Segmented label="Project list side" value={dock.sidebarSide} options={[['left', 'Left', PanelLeft], ['right', 'Right', PanelRight]]} onChange={v => setSide('sidebar', v)}/></Row><Row title="Chat"><Segmented label="Chat side" value={dock.chatSide} options={[['left', 'Left', PanelLeft], ['right', 'Right', PanelRight]]} onChange={v => setSide('chat', v)}/></Row><Row title="Swap sides"><button type="button" className="button secondary small-button" onClick={swap}>Swap</button></Row><Row title="Column widths"><button type="button" className="button secondary small-button" onClick={() => { resetWidth('chat'); resetWidth('sidebar'); }}>Reset</button></Row></Group>
    </>,
    agents: <>
      <Group title="Connections"><Row title="Accounts and API keys"><button type="button" className="button secondary small-button" onClick={onConnections}><Link2 size={14}/>Manage</button></Row></Group>
      <Group title="Collaboration"><Row title="Handoffs per run"><Stepper label="Handoffs per run" value={settings.maxHandoffs ?? 4} min={0} max={12} onChange={v => save({ maxHandoffs: v })}/></Row><Row title="Time limit per CLI call"><Stepper label="Time limit in minutes" value={settings.timeoutMinutes ?? 15} min={1} max={60} onChange={v => save({ timeoutMinutes: v })}/></Row><Row title="Let agents schedule follow-ups"><Switch label="Agent schedules" on={settings.allowAgentSchedules !== false} onChange={v => save({ allowAgentSchedules: v })}/></Row></Group>
      <Group title="MCP"><Row title="Extra Claude MCP file"><input className="set-input" placeholder="C:\path\to\mcp.json" aria-label="Claude MCP file" defaultValue={settings.claudeMcpPath || ''} onBlur={e => e.target.value !== (settings.claudeMcpPath || '') && save({ claudeMcpPath: e.target.value })}/></Row></Group>
    </>,
    storage: <Group title="Your workspace"><Row title="Where it lives"><button type="button" className="button secondary small-button" onClick={onConnections}>Storage options</button></Row>{desktop && <Row title="Workspace folder"><button type="button" className="button secondary small-button" onClick={() => perform(() => api.openFolder())}><FolderOpen size={14}/>Open</button></Row>}</Group>,
    updates: <Group title="Daevu">
      <Row title={`Version ${update?.current || __APP_VERSION__}${note ? ' · ' + note : update?.available ? ' · ' + update.available.version + ' is available' : ''}`}><button type="button" className="button secondary small-button" disabled={checking} onClick={check}><RefreshCw size={14} className={checking ? 'spin' : ''}/>{checking ? 'Checking…' : 'Check now'}</button></Row>
      {update?.available && <Row title={`Daevu ${update.available.version}${update.downloaded ? ' · ready' : update.progress != null ? ` · ${Math.round(update.progress * 100)}%` : ''}`}>{update.downloaded ? <button type="button" className="button primary small-button" onClick={() => perform(() => api.updateInstall())}>Install and restart</button> : <button type="button" className="button primary small-button" disabled={update.progress != null} onClick={() => perform(() => api.updateDownload())}><Download size={14}/>Download</button>}</Row>}
    </Group>,
    about: <>
      <Group title="Daevu"><Row title="Version"><span className="set-value">v{__APP_VERSION__}</span></Row><Row title="License"><span className="set-value">MIT</span></Row></Group>
      {desktop && window.workspace.uninstall && <Group title="Remove">{!leaving ? <Row title="Uninstall Daevu"><button type="button" className="button secondary danger small-button" onClick={() => setLeaving(true)}><Trash2 size={14}/>Uninstall…</button></Row> : <><Row title="Also delete my data on this computer"><Switch label="Delete data too" on={wipe} onChange={setWipe}/></Row><Row title="Are you sure?"><span className="set-actions"><button type="button" className="button secondary small-button" onClick={() => setLeaving(false)}>Cancel</button><button type="button" className="button danger-fill small-button" onClick={() => perform(() => window.workspace.uninstall({ wipe }))}>Uninstall now</button></span></Row></>}</Group>}
    </>
  };
  const current = shown.find(([id]) => id === active) || shown[0];
  return <div className="modal-backdrop settings-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="settings-window" role="dialog" aria-modal="true" aria-label="Settings">
      <nav className="settings-nav" aria-label="Settings sections">
        <h2>Settings</h2>
        {shown.map(([id, label, Icon, tone]) => <button key={id} type="button" className={id === current[0] ? 'on' : ''} aria-current={id === current[0] ? 'page' : undefined} onClick={() => setActive(id)}><span className={`set-icon tone-${tone}`}><Icon size={14}/></span>{label}{id === 'updates' && update?.available && <i className="menu-dot"/>}</button>)}
      </nav>
      <div className="settings-pane">
        <header><h1>{current[1]}</h1><button type="button" className="icon-button" aria-label="Close settings" onClick={onClose}><X size={17}/></button></header>
        <div className="settings-scroll">{pages[current[0]]}{error && <p className="inline-error">{error}</p>}</div>
      </div>
    </section>
  </div>;
}
