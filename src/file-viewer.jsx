import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, ExternalLink, ZoomIn, ZoomOut, PanelLeft, ChevronLeft, ChevronRight, Maximize, BookOpen, Film, Music, File as FileIcon, AArrowUp, AArrowDown, List } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import JSZip from 'jszip';
import DOMPurify from 'dompurify';
import { api } from './api';
import { Markdown } from './ui';
import './file-viewer.css';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const ext = name => (/\.([^.]+)$/.exec(name || '')?.[1] || '').toLowerCase();
const TEXT = new Set(['txt', 'md', 'markdown', 'json', 'log', 'xml', 'yml', 'yaml', 'toml', 'ini', 'js', 'mjs', 'ts', 'tsx', 'jsx', 'css', 'html', 'py', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'sh', 'sql', 'csv', 'tsv']);
const VIDEO = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']), AUDIO = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac']);
export const viewerKind = name => { const e = ext(name); return e === 'pdf' ? 'pdf' : e === 'epub' ? 'epub' : VIDEO.has(e) ? 'video' : AUDIO.has(e) ? 'audio' : TEXT.has(e) && !['csv', 'tsv'].includes(e) ? 'text' : null; };
const size = bytes => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const MIME = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4', ogv: 'video/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac' };

// Bytes of a stored file, loaded once.
function useBytes(projectId, fileId) {
  const [state, setState] = useState({ bytes: null, error: '' });
  useEffect(() => {
    let live = true; setState({ bytes: null, error: '' });
    api.readFile(projectId, fileId).then(b => live && setState({ bytes: b instanceof Uint8Array ? b : new Uint8Array(b), error: '' })).catch(e => live && setState({ bytes: null, error: e.message }));
    return () => { live = false; };
  }, [projectId, fileId]);
  return state;
}

// ---- PDF: pages drawn as they scroll into view, with selectable text, zoom, thumbnails and page jump.
function PdfPage({ doc, number, scale, root }) {
  const box = useRef(null), canvas = useRef(null), text = useRef(null), [dims, setDims] = useState(null), [near, setNear] = useState(false);
  useEffect(() => { let live = true; doc.getPage(number).then(page => { if (live) setDims(page.getViewport({ scale })); }); return () => { live = false; }; }, [doc, number, scale]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const watch = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root: root.current, rootMargin: '900px 0px' });
    watch.observe(el); return () => watch.disconnect();
  }, [root, number]);
  useEffect(() => {
    if (!near || !dims) return;
    let live = true, task, layer;
    doc.getPage(number).then(async page => {
      if (!live) return;
      const ratio = window.devicePixelRatio || 1, c = canvas.current, viewport = page.getViewport({ scale });
      c.width = Math.floor(viewport.width * ratio); c.height = Math.floor(viewport.height * ratio);
      task = page.render({ canvasContext: c.getContext('2d'), viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
      await task.promise.catch(() => {});
      if (!live || !text.current) return;
      text.current.replaceChildren(); text.current.style.setProperty('--scale-factor', scale); text.current.style.setProperty('--total-scale-factor', scale);
      layer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: text.current, viewport });
      layer.render().catch(() => {});
    });
    return () => { live = false; task?.cancel(); layer?.cancel(); };
  }, [near, dims, doc, number, scale]);
  return <div ref={box} className="pdf-page" data-page={number} style={{ width: dims?.width, height: dims?.height || 800 }}>{dims && <><canvas ref={canvas} style={{ width: dims.width, height: dims.height }}/><div ref={text} className="textLayer"/></>}</div>;
}
function PdfThumb({ doc, number, current, onGo }) {
  const ref = useRef(null), [shown, setShown] = useState(false);
  useEffect(() => { const watch = new IntersectionObserver(([e]) => e.isIntersecting && setShown(true), { rootMargin: '300px' }); ref.current && watch.observe(ref.current); return () => watch.disconnect(); }, []);
  useEffect(() => {
    if (!shown) return; let live = true, task;
    doc.getPage(number).then(page => { if (!live) return; const viewport = page.getViewport({ scale: 120 / page.getViewport({ scale: 1 }).width }), c = ref.current.querySelector('canvas'); c.width = viewport.width; c.height = viewport.height; task = page.render({ canvasContext: c.getContext('2d'), viewport }); });
    return () => { live = false; task?.cancel(); };
  }, [shown, doc, number]);
  return <button ref={ref} type="button" className={`pdf-thumb${current ? ' on' : ''}`} aria-label={`Page ${number}`} onClick={() => onGo(number)}><canvas/><span>{number}</span></button>;
}
function PdfViewer({ bytes }) {
  const [doc, setDoc] = useState(null), [error, setError] = useState(''), [zoom, setZoom] = useState('fit'), [fit, setFit] = useState(1), [page, setPage] = useState(1), [thumbs, setThumbs] = useState(true), [jump, setJump] = useState('1'), root = useRef(null);
  useEffect(() => {
    let live = true, loaded;
    const task = pdfjs.getDocument({ data: bytes.slice() });
    task.promise.then(d => { if (live) { loaded = d; setDoc(d); } else d.destroy(); }).catch(e => live && setError(e.name === 'PasswordException' ? 'This PDF is password protected.' : 'This PDF could not be opened.'));
    return () => { live = false; Promise.resolve(task.destroy()).catch(() => {}); };
  }, [bytes]);
  useEffect(() => {
    if (!doc || !root.current) return;
    const measure = async () => { const p = await doc.getPage(1), w = p.getViewport({ scale: 1 }).width; setFit(Math.max(0.3, Math.min(3, (root.current.clientWidth - 48) / w))); };
    measure(); const watch = new ResizeObserver(measure); watch.observe(root.current); return () => watch.disconnect();
  }, [doc]);
  useEffect(() => setJump(String(page)), [page]);
  // The page being read is the first one that still reaches below the top of the view.
  const onScroll = e => { const top = e.currentTarget.scrollTop + 60; for (const el of e.currentTarget.children) if (el.offsetTop + el.offsetHeight > top) { setPage(Number(el.dataset.page)); break; } };
  const scale = zoom === 'fit' ? fit : zoom, go = n => { const at = Math.max(1, Math.min(doc.numPages, n)); root.current?.querySelector(`[data-page="${at}"]`)?.scrollIntoView({ block: 'start' }); setPage(at); };
  const step = factor => setZoom(Math.max(0.25, Math.min(4, +(scale * factor).toFixed(2))));
  if (error) return <Message icon={FileText}>{error}</Message>;
  if (!doc) return <Message icon={FileText}>Opening…</Message>;
  return <div className="pdf-viewer">
    <div className="fv-tools">
      <button type="button" className={`icon-button${thumbs ? ' on' : ''}`} aria-label="Pages" title="Pages" onClick={() => setThumbs(v => !v)}><PanelLeft size={16}/></button>
      <span className="fv-sep"/>
      <button type="button" className="icon-button" aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}><ChevronLeft size={16}/></button>
      <form onSubmit={e => { e.preventDefault(); go(Number(jump) || 1); }}><input aria-label="Page number" value={jump} onChange={e => setJump(e.target.value)} onBlur={() => setJump(String(page))}/><span>of {doc.numPages}</span></form>
      <button type="button" className="icon-button" aria-label="Next page" disabled={page >= doc.numPages} onClick={() => go(page + 1)}><ChevronRight size={16}/></button>
      <span className="fv-sep"/>
      <button type="button" className="icon-button" aria-label="Zoom out" onClick={() => step(1 / 1.2)}><ZoomOut size={16}/></button>
      <button type="button" className="fv-zoom" onClick={() => setZoom('fit')} title="Fit to width">{Math.round(scale * 100)}%</button>
      <button type="button" className="icon-button" aria-label="Zoom in" onClick={() => step(1.2)}><ZoomIn size={16}/></button>
      <button type="button" className="icon-button" aria-label="Fit to width" title="Fit to width" onClick={() => setZoom('fit')}><Maximize size={15}/></button>
    </div>
    <div className="fv-body">
      {thumbs && <div className="pdf-thumbs">{Array.from({ length: doc.numPages }, (_, i) => <PdfThumb key={i} doc={doc} number={i + 1} current={page === i + 1} onGo={go}/>)}</div>}
      <div className="pdf-scroll" ref={root} onScroll={onScroll}>{Array.from({ length: doc.numPages }, (_, i) => <PdfPage key={i} doc={doc} number={i + 1} scale={scale} root={root}/>)}</div>
    </div>
  </div>;
}

// ---- EPUB: the book's chapters, read from the file itself.
const resolvePath = (base, href) => { const parts = (base.includes('/') ? base.slice(0, base.lastIndexOf('/')) : '').split('/').filter(Boolean); for (const piece of href.split('#')[0].split('/')) { if (piece === '..') parts.pop(); else if (piece && piece !== '.') parts.push(decodeURIComponent(piece)); } return parts.join('/'); };
async function openEpub(bytes) {
  const zip = await JSZip.loadAsync(bytes), text = async path => { const f = zip.file(path); if (!f) throw new Error('missing ' + path); return f.async('string'); };
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const rootPath = xml(await text('META-INF/container.xml')).querySelector('rootfile')?.getAttribute('full-path');
  if (!rootPath) throw new Error('not an epub');
  const opf = xml(await text(rootPath)), manifest = new Map([...opf.querySelectorAll('manifest > item')].map(i => [i.getAttribute('id'), { href: resolvePath(rootPath, i.getAttribute('href')), type: i.getAttribute('media-type'), props: i.getAttribute('properties') || '' }]));
  const spine = [...opf.querySelectorAll('spine > itemref')].map(r => manifest.get(r.getAttribute('idref'))).filter(i => i && /x?html/.test(i.type));
  const title = opf.querySelector('metadata > *|title, title')?.textContent?.trim() || '';
  // Chapter names come from the book's contents page when it has one.
  const names = new Map(); const nav = [...manifest.values()].find(i => i.props.includes('nav')), ncx = [...manifest.values()].find(i => i.type === 'application/x-dtbncx+xml');
  try {
    if (nav) { const doc = new DOMParser().parseFromString(await text(nav.href), 'text/html'); doc.querySelectorAll('nav a[href]').forEach(a => names.set(resolvePath(nav.href, a.getAttribute('href')), a.textContent.trim())); }
    else if (ncx) { const doc = xml(await text(ncx.href)); doc.querySelectorAll('navPoint').forEach(p => { const src = p.querySelector('content')?.getAttribute('src'), label = p.querySelector('navLabel > text')?.textContent.trim(); if (src && label) names.set(resolvePath(ncx.href, src), label); }); }
  } catch {}
  return { zip, title, chapters: spine.map((item, i) => ({ ...item, label: names.get(item.href) || `Section ${i + 1}` })) };
}
function EpubViewer({ bytes }) {
  const [book, setBook] = useState(null), [error, setError] = useState(''), [at, setAt] = useState(0), [html, setHtml] = useState(''), [contents, setContents] = useState(true), [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('rw-epub-size')) || 17), body = useRef(null), urls = useRef([]);
  useEffect(() => { let live = true; openEpub(bytes).then(b => live && setBook(b)).catch(() => live && setError('This book could not be opened.')); return () => { live = false; }; }, [bytes]);
  useEffect(() => {
    if (!book?.chapters[at]) return; let live = true;
    (async () => {
      const chapter = book.chapters[at], doc = new DOMParser().parseFromString(await book.zip.file(chapter.href).async('string'), 'text/html');
      urls.current.forEach(u => URL.revokeObjectURL(u)); urls.current = [];
      for (const img of [...doc.querySelectorAll('img[src], image')]) {
        const src = img.getAttribute('src') || img.getAttribute('href') || img.getAttribute('xlink:href'), file = src && !/^(https?:|data:)/.test(src) ? book.zip.file(resolvePath(chapter.href, src)) : null;
        if (file) { const url = URL.createObjectURL(new Blob([await file.async('uint8array')], { type: /\.png$/i.test(src) ? 'image/png' : /\.svg$/i.test(src) ? 'image/svg+xml' : /\.gif$/i.test(src) ? 'image/gif' : 'image/jpeg' })); urls.current.push(url); img.setAttribute('src', url); } else img.removeAttribute('src');
      }
      doc.querySelectorAll('link,style,script').forEach(n => n.remove());
      if (live) { setHtml(DOMPurify.sanitize(doc.body.innerHTML, { ADD_ATTR: ['src'], ALLOW_DATA_ATTR: false })); body.current?.scrollTo(0, 0); }
    })().catch(() => live && setHtml('<p>This section could not be shown.</p>'));
    return () => { live = false; };
  }, [book, at]);
  useEffect(() => () => urls.current.forEach(u => URL.revokeObjectURL(u)), []);
  if (error) return <Message icon={BookOpen}>{error}</Message>;
  if (!book) return <Message icon={BookOpen}>Opening…</Message>;
  const resize = d => setFontSize(v => { const n = Math.max(12, Math.min(28, v + d)); try { localStorage.setItem('rw-epub-size', n); } catch {} return n; });
  return <div className="epub-viewer">
    <div className="fv-tools">
      <button type="button" className={`icon-button${contents ? ' on' : ''}`} aria-label="Contents" title="Contents" onClick={() => setContents(v => !v)}><List size={16}/></button>
      <span className="fv-sep"/>
      <button type="button" className="icon-button" aria-label="Previous section" disabled={at <= 0} onClick={() => setAt(at - 1)}><ChevronLeft size={16}/></button>
      <span className="fv-count">{at + 1} of {book.chapters.length}</span>
      <button type="button" className="icon-button" aria-label="Next section" disabled={at >= book.chapters.length - 1} onClick={() => setAt(at + 1)}><ChevronRight size={16}/></button>
      <span className="fv-sep"/>
      <button type="button" className="icon-button" aria-label="Smaller text" onClick={() => resize(-1)}><AArrowDown size={16}/></button>
      <button type="button" className="icon-button" aria-label="Larger text" onClick={() => resize(1)}><AArrowUp size={16}/></button>
    </div>
    <div className="fv-body">
      {contents && <nav className="epub-contents" aria-label="Contents">{book.title && <strong>{book.title}</strong>}{book.chapters.map((c, i) => <button key={i} type="button" className={i === at ? 'on' : ''} onClick={() => setAt(i)}>{c.label}</button>)}</nav>}
      <div className="epub-scroll" ref={body}><article className="epub-page" style={{ fontSize }} dangerouslySetInnerHTML={{ __html: html }}/></div>
    </div>
  </div>;
}

// ---- Text, code, audio and video.
function TextViewer({ bytes, name }) {
  const text = useMemo(() => new TextDecoder().decode(bytes.length > 2 * 1024 * 1024 ? bytes.slice(0, 2 * 1024 * 1024) : bytes), [bytes]);
  return <div className="text-viewer"><div className="fv-scroll">{/\.(md|markdown)$/i.test(name) ? <article className="text-doc"><Markdown>{text}</Markdown></article> : <pre>{text}</pre>}</div></div>;
}
function MediaViewer({ bytes, name, kind }) {
  const url = useMemo(() => URL.createObjectURL(new Blob([bytes], { type: MIME[ext(name)] || '' })), [bytes, name]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <div className="media-viewer">{kind === 'video' ? <video src={url} controls/> : <div className="audio-card"><Music size={40}/><strong>{name}</strong><audio src={url} controls/></div>}</div>;
}
function Message({ icon: Icon, children }) { return <div className="fv-message"><Icon size={34}/><p>{children}</p></div>; }

// ---- The frame around every viewer.
export function FileViewer({ project, file, onExternal }) {
  const kind = viewerKind(file.name), { bytes, error } = useBytes(project.id, file.id), Icon = kind === 'video' ? Film : kind === 'audio' ? Music : kind === 'epub' ? BookOpen : kind ? FileText : FileIcon;
  return <div className="file-viewer">
    <header className="fv-head"><span className="fv-tile"><Icon size={16}/></span><div><strong>{file.name}</strong><small>{ext(file.name).toUpperCase() || 'File'} · {size(file.size)}</small></div><button type="button" className="button secondary small-button" onClick={onExternal}><ExternalLink size={14}/>Open in another app</button></header>
    {!kind ? <Message icon={FileIcon}>No preview for this kind of file.</Message> : error ? <Message icon={Icon}>{error}</Message> : !bytes ? <Message icon={Icon}>Opening…</Message> : kind === 'pdf' ? <PdfViewer key={file.id} bytes={bytes}/> : kind === 'epub' ? <EpubViewer key={file.id} bytes={bytes}/> : kind === 'text' ? <TextViewer bytes={bytes} name={file.name}/> : <MediaViewer bytes={bytes} name={file.name} kind={kind}/>}
  </div>;
}

// First page of a PDF as a small picture for the Files cards. Big files keep their tile.
const thumbs = new Map();
export function PdfCardThumb({ projectId, file }) {
  const ref = useRef(null), [url, setUrl] = useState(thumbs.get(file.id) || null);
  useEffect(() => {
    if (url || file.size > 30 * 1024 * 1024) return; let live = true, doc;
    const watch = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return; watch.disconnect();
      try {
        const bytes = await api.readFile(projectId, file.id); doc = await pdfjs.getDocument({ data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes) }).promise;
        const page = await doc.getPage(1), base = page.getViewport({ scale: 1 }), viewport = page.getViewport({ scale: 440 / base.width }), c = document.createElement('canvas');
        c.width = viewport.width; c.height = viewport.height;
        await page.render({ canvasContext: c.getContext('2d'), viewport }).promise;
        const data = c.toDataURL('image/jpeg', 0.8); thumbs.set(file.id, data); while (thumbs.size > 60) thumbs.delete(thumbs.keys().next().value); if (live) setUrl(data);
      } catch {} finally { Promise.resolve(doc?.destroy?.()).catch(() => {}); }
    }, { rootMargin: '200px' });
    ref.current && watch.observe(ref.current);
    return () => { live = false; watch.disconnect(); };
  }, [projectId, file.id, file.size, url]);
  return <div ref={ref} className="pdf-card-thumb">{url ? <img src={url} alt="" draggable={false}/> : <span className="file-ext red">PDF</span>}</div>;
}
