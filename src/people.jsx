import React, { useState } from 'react';
import { Search, Plus, MessageSquare, Pencil, UserPlus, UserMinus, Check } from 'lucide-react';
import { Avatar, Modal, IconButton, AvatarPicker, UserAvatar, providerName } from './ui';

export function ContactsDialog({ state, project, onClose, onToggle, onMessage, onEdit, onCreate }) {
  const [filter, setFilter] = useState('');
  const busy = id => project.tasks.some(t => t.agentId === id && t.status === 'running');
  const match = a => `${a.name} ${a.role}`.toLowerCase().includes(filter.toLowerCase());
  const team = state.agents.filter(a => project.agentIds.includes(a.id) && match(a)), others = state.agents.filter(a => !project.agentIds.includes(a.id) && match(a));
  const Row = ({ a, member }) => <div className="contact-row"><Avatar agent={a} status={member ? (busy(a.id) ? 'working' : 'online') : 'offline'}/><button className="contact-main" onClick={() => onEdit(a)} aria-label={`Open ${a.name}'s profile`}><strong>{a.name}</strong><small>{a.role}</small><em>{providerName(a.provider)}{a.model ? ` · ${a.model}` : ''}</em></button><div className="contact-actions">{member && <IconButton icon={MessageSquare} label={`Message ${a.name}`} onClick={() => onMessage(a.id)}/>}<IconButton icon={Pencil} label={`Edit ${a.name}`} onClick={() => onEdit(a)}/><button className={`button small-button ${member ? 'secondary' : 'primary'}`} onClick={() => onToggle(a, !member)}>{member ? <><UserMinus size={13}/>Remove</> : <><UserPlus size={13}/>Add</>}</button></div></div>;
  return <Modal title="Team contacts" subtitle={`Choose who works on ${project.name}.`} onClose={onClose} wide>
    <div className="search-field compact"><Search size={15}/><input aria-label="Search contacts" placeholder="Search contacts…" value={filter} onChange={e => setFilter(e.target.value)}/></div>
    <div className="contact-list"><div className="contact-group">ON THIS TEAM · {team.length}</div>{team.map(a => <Row key={a.id} a={a} member/>)}{!team.length && <p className="contact-empty">{filter ? 'No matches on this team.' : 'Nobody is assigned yet.'}</p>}
      <div className="contact-group">ALL CONTACTS · {others.length}</div>{others.map(a => <Row key={a.id} a={a}/>)}{!others.length && <p className="contact-empty">{filter ? 'No other matches.' : 'Everyone you have created is on this team.'}</p>}</div>
    <div className="modal-footer"><button className="button secondary" onClick={onCreate}><Plus size={15}/>New contact</button><button className="button primary" onClick={onClose}>Done<Check size={15}/></button></div>
  </Modal>;
}
export function ProfileDialog({ settings, onClose, onSave }) {
  const [name, setName] = useState(settings.userName || ''), [avatar, setAvatar] = useState(settings.userAvatar || ''), [error, setError] = useState('');
  return <Modal title="Your profile" subtitle="Shown next to your messages." onClose={onClose}><form onSubmit={async e => { e.preventDefault(); try { await onSave({ userName: name.trim(), userAvatar: avatar }); } catch (err) { setError(err.message); } }}><AvatarPicker value={avatar} fallback={<UserAvatar settings={{}}/>} onChange={setAvatar} onError={setError}/><label className="form-label">Display name<input maxLength={80} placeholder="Your name" value={name} onChange={e => setName(e.target.value)}/></label>{error && <p className="inline-error">{error}</p>}<div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Save profile</button></div></form></Modal>;
}
