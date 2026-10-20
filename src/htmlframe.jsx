import React, { useEffect, useState } from 'react';
import { api, desktop } from './api';

// Agent-made pages run in an opaque origin with no network, so they can compute and draw but cannot reach your data.
// In the desktop app the page is served from its own sandboxed scheme; the browser preview uses srcdoc.
export function HtmlFrame({ html, title, className = '', frameRef, onLoad }) {
  const [src, setSrc] = useState('');
  useEffect(() => { if (!desktop) return; let live = true; api.previewHtml(html).then(url => { if (live) setSrc(url); }).catch(() => {}); return () => { live = false; }; }, [html]);
  if (!desktop) return <iframe ref={frameRef} onLoad={onLoad} className={`html-frame ${className}`} title={title} sandbox="allow-scripts" srcDoc={html} referrerPolicy="no-referrer"/>;
  return src ? <iframe ref={frameRef} onLoad={onLoad} className={`html-frame ${className}`} title={title} sandbox="allow-scripts" src={src} referrerPolicy="no-referrer"/> : <div className={`html-frame loading ${className}`}/>;
}
