import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { HtmlFrame } from './htmlframe';
import { withSdk, THEMES } from './rw-sdk';
import { bridgeRead } from './bridge';

export const AppBridge = createContext({ act: null, ask: () => {}, theme: 'dark' });

// Runs an agent-made page in the sandbox and answers its workspace requests. A message is only trusted when it
// comes from this page's own frame, and the page can read project values, save its own state, and use scoped database operations.
export function LiveApp({ artifact, project, className = '', title, draft = false, sourceFiles, onDiagnostic }) {
  const { act, ask, theme } = useContext(AppBridge);
  const frame = useRef(null), latest = useRef({});
  latest.current = { artifact, project, act, ask, theme, onDiagnostic };
  const [built,setBuilt]=useState(''),[buildError,setBuildError]=useState('');
  const signatureSource=JSON.stringify(sourceFiles || (draft ? artifact.data.files || artifact.data.html : artifact.data.published?.files || artifact.data.files || artifact.data.html));
  useEffect(()=>{let live=true;setBuildError('');api.appBuild(project.id,artifact.id,{draft,files:sourceFiles}).then(output=>{if(live)setBuilt(output.html);}).catch(e=>{if(live)setBuildError(e.message);});return()=>{live=false;};},[project.id,artifact.id,signatureSource,draft]);
  const html = useMemo(() => withSdk(built), [built]);
  const post = message => frame.current?.contentWindow?.postMessage({ rw: 1, ...message }, '*');
  const init = () => post({ push: 'init', state: latest.current.artifact.data.state || {}, heads:latest.current.artifact._rwSyncHeads, theme: THEMES[latest.current.theme] || THEMES.dark });
  useEffect(() => {
    const onMessage = async e => {
      if (e.source !== frame.current?.contentWindow) return;
      const m = e.data; if (!m || m.rw !== 1) return;
      if (m.op === 'hello') return init();
      const { artifact, project, act, ask } = latest.current;
      if(m.op==='diagnostic'){latest.current.onDiagnostic?.(m.entry);api.appReport(project.id,artifact.id,m.entry).catch(()=>{});return;}
      try {
        let value;
        if (m.op === 'save') { if (!act) throw new Error('Saving is unavailable here.'); await act({ type: 'artifact:state', projectId: project.id, _rwSyncHeads:m.args?.[1] || artifact._rwSyncHeads,value: { artifactId: artifact.id, state: m.args?.[0] } }); value = true; }
        else if(m.op==='db-schema')value=await api.databaseSchema(project.id,artifact.id);
        else if(m.op==='db-query')value=await api.databaseQuery(project.id,m.args?.[0],m.args?.[1]);
        else if(m.op==='db-write')value=await api.appDatabaseWrite(project.id,artifact.id,m.args?.[0]);
        else if(m.op==='db-create')value=await api.appDatabaseCreate(project.id,artifact.id,m.args?.[0],m.args?.[1]);
        else if (m.op === 'ask') { ask(String(m.args?.[0] || '').slice(0, 4000)); value = true; }
        else if (m.op === 'export') { const data = m.args?.[1]; if (typeof data !== 'string' && !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) throw new Error('rw.export needs text, an ArrayBuffer, a typed array or a Blob.'); value = await api.appSaveFile(String(m.args?.[0] || 'export'), data instanceof ArrayBuffer || typeof data === 'string' ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)); }
        else if (m.op === 'import') { const file = await api.appOpenFile({ accept: Array.isArray(m.args?.[0]?.accept) ? m.args[0].accept.slice(0, 20).map(String) : [] }); value = file && { name: file.name, type: file.type, size: file.bytes.byteLength, bytes: file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) }; }
        else if (m.op === 'file') value = await api.fileData(project.id, String(m.args?.[0] || ''));
        else value = bridgeRead(project, m.op, m.args || []);
        post({ id: m.id, ok: true, value });
      } catch (err) { post({ id: m.id, ok: false, error: err.message || 'Request failed.' }); }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  // Tell the page when project data changes. Its own saved data is left out so saving never triggers itself.
  const signature = useMemo(() => JSON.stringify([project.kpis, project.refs, project.page, project.files.map(f=>[f.id,f.name,f.size]), project.notes.map(n => [n.id,n.title,n.content]), (project.artifacts || []).filter(a => a.id !== artifact.id && a.kind==='database').map(a => [a.id,a.title,a.data])]), [project.kpis, project.refs, project.page, project.files, project.notes, project.artifacts, artifact.id]);
  useEffect(() => { const t = setTimeout(() => post({ push: 'update' }), 250); return () => clearTimeout(t); }, [signature]);
  useEffect(() => { post({ push: 'theme', theme: THEMES[theme] || THEMES.dark }); }, [theme]);
  useEffect(() => { post({push:'state',state:artifact.data.state || {},heads:artifact._rwSyncHeads}); }, [artifact.data.state,artifact._rwSyncHeads]);
  if(buildError)return <p className="inline-error" role="alert">{buildError}</p>;
  if(!built)return <div className="html-frame loading">Building app…</div>;
  return <HtmlFrame frameRef={frame} onLoad={init} html={html} title={title || artifact.title} className={className}/>;
}
