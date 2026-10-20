import React, { useState } from 'react';
import { Check, Trash2, Undo2, CornerDownRight, X, Send } from 'lucide-react';
import { uid, date } from './ui';

const time = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// A side panel of comment threads. `block` narrows it to one block; replies hang under their comment.
export function CommentsPanel({ comments = [], blocks = [], block, onShowAll, actions, onClose, title = 'Comments' }) {
  const [text, setText] = useState(''), [replyTo, setReplyTo] = useState(null), [resolved, setResolved] = useState(false), [error, setError] = useState('');
  const roots = comments.filter(c => !c.replyTo && (!block || c.blockId === block));
  const open = roots.filter(c => !c.resolved), done = roots.filter(c => c.resolved);
  const excerpt = id => { const hit = blocks.find(b => b.id === id)?.text?.trim(); return hit ? (hit.length > 60 ? hit.slice(0, 60) + '…' : hit) : ''; };
  async function send() {
    const value = text.trim();
    if (!value) return;
    try { await actions.add({ id: uid(), text: value, author: 'You', ...(block && !replyTo ? { blockId: block } : {}), ...(replyTo ? { replyTo } : {}) }); setText(''); setReplyTo(null); setError(''); }
    catch (e) { setError(e.message); }
  }
  const run = async fn => { try { await fn(); setError(''); } catch (e) { setError(e.message); } };
  const thread = c => <div className={`comment ${c.resolved ? 'resolved' : ''}`} key={c.id}>
    <div className="comment-head"><span className="comment-avatar">{(c.author || '?').slice(0, 1).toUpperCase()}</span><strong>{c.author}</strong><small>{date(c.createdAt)} · {time(c.createdAt)}{c.edited ? ' · edited' : ''}</small></div>
    {c.blockId && !block && excerpt(c.blockId) && <div className="comment-quote">{excerpt(c.blockId)}</div>}
    <p>{c.text}</p>
    <div className="comment-actions"><button onClick={() => setReplyTo(c.id)}><CornerDownRight size={12}/>Reply</button><button onClick={() => run(() => actions.update({ id: c.id, resolved: !c.resolved }))}>{c.resolved ? <><Undo2 size={12}/>Reopen</> : <><Check size={12}/>Resolve</>}</button><button className="danger-text" onClick={() => run(() => actions.remove({ id: c.id }))}><Trash2 size={12}/>Delete</button></div>
    {comments.filter(r => r.replyTo === c.id).map(r => <div className="comment reply" key={r.id}><div className="comment-head"><span className="comment-avatar small">{(r.author || '?').slice(0, 1).toUpperCase()}</span><strong>{r.author}</strong><small>{date(r.createdAt)} · {time(r.createdAt)}</small><button className="icon-button" aria-label="Delete reply" onClick={() => run(() => actions.remove({ id: r.id }))}><X size={12}/></button></div><p>{r.text}</p></div>)}
  </div>;
  return <aside className="comment-panel" aria-label={title}>
    <div className="comment-panel-head"><strong>{title}</strong><span>{open.length} open</span><button className="icon-button" aria-label="Close comments" onClick={onClose}><X size={15}/></button></div>
    {block && <div className="comment-filter">This block only<button className="text-button" onClick={onShowAll}>Show all</button></div>}
    <div className="comment-list">
      {open.length ? open.map(thread) : <p className="comment-empty">{block ? 'No comments on this block yet.' : 'No open comments. Start a conversation below.'}</p>}
      {done.length > 0 && <button className="text-button comment-resolved-toggle" onClick={() => setResolved(v => !v)}>{resolved ? 'Hide' : 'Show'} {done.length} resolved</button>}
      {resolved && done.map(thread)}
    </div>
    {error && <p className="inline-error">{error}</p>}
    <div className="comment-composer">
      {replyTo && <div className="comment-replying">Replying<button className="icon-button" aria-label="Cancel reply" onClick={() => setReplyTo(null)}><X size={12}/></button></div>}
      <textarea rows={2} value={text} aria-label="Write a comment" placeholder={replyTo ? 'Write a reply…' : block ? 'Comment on this block…' : 'Add a comment…'} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}/>
      <button className="button primary" disabled={!text.trim()} onClick={send}><Send size={13}/>Comment</button>
    </div>
  </aside>;
}
