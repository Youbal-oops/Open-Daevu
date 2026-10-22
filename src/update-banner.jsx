import React, { useEffect, useState } from 'react';
import { Download, X, ExternalLink, RefreshCw } from 'lucide-react';
import { api } from './api';

export function useUpdates() {
  const [state, setState] = useState(null);
  useEffect(() => { let live = true; api.updateState().then(s => live && setState(s)).catch(() => {}); const off = api.onUpdate(setState); return () => { live = false; off(); }; }, []);
  return state;
}

// Shown when a newer version is out: notes, download here, then install.
export function UpdateBanner({ update, onError }) {
  const [hidden, setHidden] = useState(false), u = update?.available;
  useEffect(() => { setHidden(false); }, [u?.version]);
  if (!u || hidden) return null;
  const busy = update.progress != null, ready = Boolean(update.downloaded);
  const run = fn => fn().catch(error => onError?.(error.message));
  return <aside className="update-banner" role="status" aria-label="Update available">
    <div className="update-text"><strong>Daevu {u.version} is available</strong><small>You have {update.current}.{u.size ? ` ${(u.size / 1048576).toFixed(0)} MB.` : ''}{update.error ? ' ' + update.error : ''}</small>
      {busy && <div className="update-bar"><i style={{ width: Math.round(update.progress * 100) + '%' }}/></div>}</div>
    <div className="update-actions">
      {ready ? <button className="button primary small-button" onClick={() => run(api.updateInstall)}>Install and restart</button>
        : <button className="button primary small-button" disabled={busy} onClick={() => run(api.updateDownload)}><Download size={13}/>{busy ? Math.round(update.progress * 100) + '%' : 'Download'}</button>}
      <button className="icon-button" aria-label="Read the release notes" title="Release notes" onClick={() => api.updatePage()}><ExternalLink size={15}/></button>
      <button className="icon-button" aria-label="Skip this version" title="Skip this version" onClick={() => { api.updateSkip(); setHidden(true); }}><X size={15}/></button>
    </div>
  </aside>;
}

// A row for the settings dialog.
export function UpdateRow({ update, onError }) {
  const [busy, setBusy] = useState(false), [note, setNote] = useState('');
  async function check() { setBusy(true); setNote(''); try { const s = await api.updateCheck(); setNote(s?.available ? `Version ${s.available.version} is available.` : s?.error || 'You are on the latest version.'); } catch (e) { onError?.(e.message); } finally { setBusy(false); } }
  return <div className="update-row"><span>Daevu {update?.current || ''}{note ? ' · ' + note : ''}</span><button type="button" className="button secondary small-button" disabled={busy} onClick={check}><RefreshCw size={13}/>{busy ? 'Checking…' : 'Check for updates'}</button></div>;
}
