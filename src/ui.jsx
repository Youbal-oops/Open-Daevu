import React, { useEffect, useRef } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fixMarkdown } from '../shared/markdown-fix.mjs';
import { X, FileText, ArrowUpRight, Camera, Trash2, User } from 'lucide-react';
import { api } from './api';

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const clean = text => text.replace(/```research-actions[\s\S]*?```/g, '').trim();
export const excerpt = (text, length = 140) => clean(text).replace(/[#*`>]/g, '').replace(/\s+/g, ' ').slice(0, length);
export const date = value => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const providerName = p => ({ codex: 'Codex', claude: 'Claude', custom: 'Custom CLI', chatgpt: 'ChatGPT', gemini: 'Gemini', 'claude-api': 'Claude API', 'openai-api': 'OpenAI API',openrouter:'OpenRouter',compatible:'Custom API' }[p] || p);
export const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function Avatar({ agent, small = false, status }) {
  return <span className={`avatar ${agent?.color || 'green'} ${small ? 'small' : ''} ${agent?.avatar ? 'has-photo' : ''} ${status || ''}`}>{agent?.avatar ? <img src={agent.avatar} alt=""/> : (agent?.initials || agent?.name?.slice(0, 2) || 'RW')}</span>;
}
export function UserAvatar({ settings, small = false }) {
  return <span className={`avatar user-photo ${small ? 'small' : ''}`}>{settings?.userAvatar ? <img src={settings.userAvatar} alt=""/> : <User size={small ? 12 : 15}/>}</span>;
}
export function IconButton({ icon: Icon, label, onClick, ...props }) { return <button type="button" className="icon-button" aria-label={label} title={label} onClick={onClick} {...props}><Icon size={17}/></button>; }
export function Markdown({ children, onDoc }) {
  const text = fixMarkdown(onDoc ? (children || '').replace(/\[\[([^\[\]\n]{1,120})\]\]/g, (_, title) => `[${title}](rwdoc:${encodeURIComponent(title.trim())})`) : children || '');
  return <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={url => url.startsWith('rwdoc:') ? url : defaultUrlTransform(url)} components={{ table: ({ children }) => <div className="md-table"><table>{children}</table></div>, a: ({ href, children }) => href?.startsWith('rwdoc:') ? <a className="doc-link" href="#" onClick={e => { e.preventDefault(); onDoc?.(decodeURIComponent(href.slice(6))); }}>{children}</a> : <a href={href} onClick={e => { e.preventDefault(); if (href) api.openURL(href); }}>{children}<ArrowUpRight size={12}/></a> }}>{text}</ReactMarkdown>;
}
export function Modal({ title, subtitle, children, onClose, wide }) {
  const root = useRef(null), close = useRef(onClose); close.current = onClose;
  useEffect(() => { const old = document.activeElement; root.current?.querySelector('input, textarea, button')?.focus(); const key = e => { if (e.key === 'Escape') close.current(); if (e.key === 'Tab') { const items = [...root.current.querySelectorAll('button,input,select,textarea,a[href]')].filter(el => !el.disabled && el.offsetParent !== null); const first = items[0], last = items.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } }; document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); old?.focus(); }; }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={root}><div className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><IconButton icon={X} label="Close dialog" onClick={onClose}/></div>{children}</section></div>;
}
export function Empty({ icon: Icon = FileText, title, children, action }) { return <div className="empty"><div className="empty-icon"><Icon size={23}/></div><h3>{title}</h3><p>{children}</p>{action}</div>; }

// Crops to a square and scales to 192px so a profile picture stays small in the workspace file.
export function imageToAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type)) return reject(new Error('Choose a PNG, JPEG, or WebP image.'));
    if (file.size > 12 * 1024 * 1024) return reject(new Error('Choose an image under 12 MB.'));
    const url = URL.createObjectURL(file), image = new Image();
    image.onload = () => {
      const side = Math.min(image.width, image.height), canvas = document.createElement('canvas');
      canvas.width = canvas.height = 192;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 192, 192);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read.')); };
    image.src = url;
  });
}
export function AvatarPicker({ value, fallback, onChange, onError, label = 'Profile picture' }) {
  const input = useRef(null);
  return <div className="avatar-picker"><span className="avatar large has-photo-slot">{value ? <img src={value} alt=""/> : fallback}</span><div><strong>{label}</strong><small>Square photos work best.</small><div className="avatar-picker-actions"><button type="button" className="button secondary small-button" onClick={() => input.current?.click()}><Camera size={14}/>{value ? 'Change photo' : 'Add photo'}</button>{value && <button type="button" className="text-button" onClick={() => onChange('')}><Trash2 size={13}/>Remove</button>}</div></div><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; try { onChange(await imageToAvatar(file)); } catch (err) { onError?.(err.message); } }}/></div>;
}
