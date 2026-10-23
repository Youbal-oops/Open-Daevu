import {agentOffline} from '../shared/agent-status.mjs';
import { conversationMessages, conversationParticipants, agentChats, legacyChatId, messageChatId } from '../shared/conversations.mjs';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AppWindow, MessageSquare, MoreHorizontal, X, FileText, Paperclip, Folder, FolderOpen, Network, Globe2, ArrowUp, ArrowUpRight, Square, Loader2, Plus, Image as ImageIcon, Wrench, Gauge, ChevronDown, Check, Circle, Eye, Table2, HardDrive, Pencil, Upload, Users } from 'lucide-react';
import { api } from './api';
import { DockControls, ResizeEdge } from './dock';
import { Avatar, UserAvatar, IconButton, Markdown, clean, providerName, uid } from './ui';
import GroundingWidget from './grounding';
import AgentPicker from './agent-picker';
import {useAgentDraft} from './agent-draft';
import {showSavedEffort} from '../shared/agent-contacts.mjs';
import { useToolCatalog, ToolChecklist } from './tools';
import { toolBlock } from '../shared/domain.mjs';
import { ArtifactPreview, kindIcon, kindName } from './boards';

const EFFORT_LEVELS = [['', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['max', 'Max']];
const effortKey = id => `rw-effort-${id}`;
function savedEffort(agent) { try { return localStorage.getItem(effortKey(agent?.id)) ?? agent?.effort ?? ''; } catch { return agent?.effort || ''; } }
const SHOW_KEY = 'rw-show-effort';
const noop = () => {};
const loadShow = () => { try { return showSavedEffort(localStorage); } catch { return false; } };
const refKey = r => `${r.type}:${r.id || r.path}`;
const refIcon = r => r.type === 'folder' ? Folder : r.type === 'file' ? Paperclip : r.type === 'path' ? (r.dir ? FolderOpen : Paperclip) : r.kind === 'sheet' ? Table2 : FileText;
// Formatting a date creates a locale formatter each time unless one is kept, which adds up over a long chat.
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dayLabel = value => { const d = new Date(value); return d.toDateString() === new Date().toDateString() ? 'Today' : dayFormat.format(d); };
const timeLabel = value => timeFormat.format(new Date(value));

export default function Chat({ onHide, act, availability, connection, project, projects, agents, agent, setAgent, onSetup, onEditAgent, perform, onNote, settings, onOpenNote, onOpenArtifact, agentsOpen=false, onAgentsOpen=noop }) {
  const [sending, setSending] = useState(false), [activity, setActivity] = useState(null), [panel, setPanel] = useState('chat');
  const [showEffort, setShowEffort] = useState(loadShow), [effort, setEffort] = useState(() => savedEffort(agent)), [tools, setTools] = useState(null), [menu, setMenu] = useState(''), [slash, setSlash] = useState(null), [pick, setPick] = useState(0);
  const chatRoot=useRef(null);
  const bottom = useRef(null), input = useRef(null),imageInput=useRef(null),currentChat=useRef('');
  const [uploading,setUploading]=useState(false);
  useEffect(()=>()=>onAgentsOpen(false),[onAgentsOpen]);
  useEffect(()=>{onAgentsOpen(false);},[project.id]);
  const catalog = useToolCatalog(settings?.claudeMcpPath || '');
  const [selections,setSelections]=useState({});
  const chatKey=`rw-chat-${project.id}-${agent?.id}`,chats=agent?agentChats(project,agent.id):[];
  let remembered;try{remembered=localStorage.getItem(chatKey);}catch{}
  const desired=selections[chatKey] || remembered,chatId=chats.find(c=>c.id===desired)?.id || chats[0]?.id || legacyChatId(agent?.id);
  const {text,setText,refs,setRefs,error:draftError}=useAgentDraft(project.id,agent?.id||'',chatId);
  currentChat.current=chatKey+':'+chatId;
  const hasImages=refs.some(r=>/\.(png|jpe?g|webp|gif)$/i.test(r.name || ''));
  async function uploadImages(files){const images=[...files].filter(file=>/^image\/(png|jpeg|webp|gif)$/.test(file.type));if(!images.length)return;if(images.length>4 || images.some(file=>file.size>5000000) || images.reduce((sum,file)=>sum+file.size,0)>12000000)return perform(()=>Promise.reject(Error('Attach up to four images, under 5 MB each and 12 MB total.')));const key=chatKey+':'+chatId;setUploading(true);try{const values=await Promise.all(images.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,dataUrl:reader.result});reader.onerror=()=>reject(Error('Image could not be read.'));reader.readAsDataURL(file);})));const added=await api.attachImages(project.id,values);if(currentChat.current===key)setRefs(list=>[...list,...added].slice(0,20));}catch(e){await perform(()=>Promise.reject(e));}finally{setUploading(false);}}
  function chooseChat(id,owner=agent?.id){const key=`rw-chat-${project.id}-${owner}`;setSelections(s=>({...s,[key]:id}));try{localStorage.setItem(key,id);}catch{}}
  useEffect(()=>{if(agent){setSelections(s=>s[chatKey]===chatId?s:{...s,[chatKey]:chatId});try{localStorage.setItem(chatKey,chatId);}catch{}}},[chatKey,chatId]);
  async function newChat(){if(!agent || sending)return;const id=uid();try{await act({type:'chat:create',projectId:project.id,value:{id,agentId:agent.id}});chooseChat(id);setPanel('chat');input.current?.focus();}catch(e){await perform(()=>Promise.reject(e));}}
  const messages = conversationMessages(project.messages,agent?.id,chatId);
  const participants = conversationParticipants(project.messages,agent?.id,chatId).map(id=>agents.find(a=>a.id===id)).filter(Boolean);
  const allRunning=project.tasks.filter(t=>t.agentId===agent?.id && t.status==='running');
  const running = allRunning.filter(t=>messageChatId(t)===chatId);
  const [statusTime,setStatusTime]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setStatusTime(Date.now()),15000);return()=>clearInterval(timer);},[]);
  const offline=a=>agentOffline({agentAvailability:availability},a,statusTime),unread=messages.filter(m=>m.role==='user' && m.delivery==='unread');
  const busy = id => project.tasks.some(t => t.agentId === id && t.status === 'running');
  const [dismissedBanners,setDismissedBanners]=useState({});
  const bannerKey=kind=>'rw-chat-banner:'+JSON.stringify([kind,project.id,agent?.id,kind==='plan'?connection?.id||'':chatId,kind==='reporting'?participants.map(a=>a.id).sort().join(','):kind==='limit'?offline(agent)?.detectedAt||'unread':'']);
  const reportingKey=bannerKey('reporting'),planKey=bannerKey('plan'),limitKey=bannerKey('limit');
  const isDismissed=key=>{if(dismissedBanners[key])return true;try{return localStorage.getItem(key)==='hidden';}catch{return false;}};
  function dismissBanner(key){try{localStorage.setItem(key,'hidden');}catch{}setDismissedBanners(old=>({...old,[key]:true}));}
  function restoreBanners(){const keys=[reportingKey,planKey,limitKey];for(const key of keys)try{localStorage.removeItem(key);}catch{}setDismissedBanners(old=>Object.fromEntries(Object.entries(old).filter(([key])=>!keys.includes(key))));}
  const hasHiddenBanners=participants.length>0&&isDismissed(reportingKey)||agent?.provider==='chatgpt'&&isDismissed(planKey)||(offline(agent)||unread.length>0)&&isDismissed(limitKey);
  const selectedTools = tools ?? agent?.toolIds ?? [];
  useEffect(() => { const compose = e => { setPanel('chat'); setText(e.detail); input.current?.focus(); }; window.addEventListener('research:compose', compose); return () => window.removeEventListener('research:compose', compose); }, [project.id,agent?.id,chatId]);
  useEffect(() => api.onProgress(e => { if (e.projectId === project.id && e.agentId === agent?.id) setActivity(e.at); }), [project.id, agent?.id]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages.length, running.length, panel,chatId]);
  useEffect(() => { setActivity(null); setPanel('chat'); setTools(null); setMenu(''); setSlash(null); }, [project.id, agent?.id,chatId]);
  useEffect(() => { setEffort(savedEffort(agent)); }, [agent?.id]);
  function toggleEffort() { const next = !showEffort; setShowEffort(next); try { localStorage.setItem(SHOW_KEY, next ? 'yes' : 'no'); } catch {} }
  function changeEffort(value) { setEffort(value); try { localStorage.setItem(effortKey(agent.id), value); } catch {} }
  const addRef = ref => setRefs(list => list.some(r => refKey(r) === refKey(ref)) ? list : [...list, ref].slice(0, 20));
  const candidates = useMemo(() => {
    const q = (slash?.query || '').toLowerCase();
    const folders = projects.map(p => ({ ref: { type: 'folder', id: p.id, name: p.name }, label: p.name, hint: p.parentId ? 'Work folder' : 'Project', Icon: p.parentId ? Folder : FolderOpen }));
    const notes = project.notes.map(n => ({ ref: { type: 'note', id: n.id, name: n.title, kind: n.kind }, label: n.title, hint: n.kind === 'sheet' ? 'Spreadsheet' : 'Document', Icon: n.kind === 'sheet' ? Table2 : FileText }));
    const files = project.files.map(f => ({ ref: { type: 'file', id: f.id, name: f.name }, label: f.name, hint: 'Attachment', Icon: Paperclip }));
    const local = [{ computer: 'file', label: 'Browse for a file…', hint: 'This computer', Icon: Paperclip }, { computer: 'folder', label: 'Browse for a folder…', hint: 'This computer', Icon: FolderOpen }];
    return [...notes, ...files, ...folders, ...local].filter(c => c.computer || !q || c.label.toLowerCase().includes(q)).slice(0, 9);
  }, [slash?.query, project, projects]);
  function onType(value, caret) {
    setText(value);
    const match = /(^|\s)\/([^\s/]*)$/.exec(value.slice(0, caret));
    if (match) { setSlash({ query: match[2], start: caret - match[2].length - 1 }); setPick(0); } else setSlash(null);
  }
  async function choose(candidate) {
    const end = input.current?.selectionStart ?? text.length, start = slash?.start ?? end;
    let ref = candidate.ref;
    if (candidate.computer) { try { ref = await api.pickRef(candidate.computer,project.id); } catch (e) { setSlash(null); return perform(() => Promise.reject(e)); } if (!ref) { setSlash(null); return; } }
    const mention = `/${ref.name.replace(/\s+/g, '-')} `;
    setText(text.slice(0, start) + mention + text.slice(end)); setSlash(null); addRef(ref);
    setTimeout(() => input.current?.focus(), 0);
  }
  async function pickComputer(kind) {
    setMenu('');
    try { const ref = await api.pickRef(kind,project.id); if (ref) addRef(ref); } catch (e) { perform(() => Promise.reject(e)); }
  }
  async function send(e) {
    e?.preventDefault();
    if ((!text.trim() && !hasImages) || !agent || sending || uploading || allRunning.length) return;
    setSending(true);
    try { await api.start(project.id, agent.id, text.trim() || 'Describe the attached image(s).', { effort, tools: tools ?? undefined, refs,chatId }); setText(''); setRefs([]); setSlash(null); setPanel('chat'); } catch (err) { await perform(() => Promise.reject(err)); } finally { setSending(false); }
  }
  function keyDown(e) {
    if (slash && candidates.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setPick(i => (i + 1) % candidates.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPick(i => (i + candidates.length - 1) % candidates.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(candidates[pick]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSlash(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(e); }
  }
  let lastSender = '', lastDay = '';
  return <section ref={chatRoot} className="chat-panel messenger" aria-label="Agent conversation" onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();}} onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();uploadImages(e.dataTransfer.files);}}}><input ref={imageInput} type="file" aria-label="Choose chat images" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={e=>{uploadImages(e.target.files);e.target.value='';}}/><ResizeEdge panel="chat"/><div className="chat-header"><span><MessageSquare size={16}/>Messages</span><DockControls panel="chat"/><button type="button" className="agent-picker-toggle" aria-label="Choose agent" aria-expanded={agentsOpen} aria-controls="agent-contact-drawer" onClick={()=>onAgentsOpen(!agentsOpen)}><Users size={15}/>Agents<span>{agents.length}</span></button></div>
    {agentsOpen&&<AgentPicker project={project} agents={agents} activeId={agent?.id} anchor={chatRoot} statusFor={a=>busy(a.id)?'working':offline(a)?'offline':'online'} onClose={()=>onAgentsOpen(false)} onManage={()=>{onAgentsOpen(false);onSetup();}} onSelect={row=>{chooseChat(row.chatId,row.agent.id);setAgent(row.agent.id);onAgentsOpen(false);}}/>}
    {agent ? <div className="chat-agent"><Avatar agent={agent} status={running.length ? 'working' : offline(agent) ? 'offline' : 'online'}/><div><strong className="contact-name">{agent.name}</strong><small>{running.length ? 'Working on it…' : offline(agent) ? 'Offline · usage limit' : 'Online'}<span>·</span>{providerName(agent.provider)}<span>·</span>{agent.model || 'CLI default model'}</small></div>{hasHiddenBanners&&<IconButton icon={Eye} label="Show hidden chat banners" onClick={restoreBanners}/>}<IconButton icon={Pencil} label={`Edit ${agent.name}`} onClick={() => onEditAgent(agent)}/><IconButton icon={MoreHorizontal} label="Manage agent profiles" onClick={onSetup}/><IconButton icon={X} label="Close agent panel" onClick={onHide}/></div> : <button className="button secondary" onClick={onSetup}>Add an agent</button>}
    {agent&&<div className="conversation-switcher"><select aria-label="Chat history" value={chatId} disabled={sending} onChange={e=>chooseChat(e.target.value)}>{chats.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select><button className="text-button" disabled={sending} onClick={newChat}><Plus size={13}/>New chat</button></div>}
    {agent && !allRunning.length && !isDismissed(limitKey) && (offline(agent) || unread.length>0) && <div className="chat-offline" role="status"><button className="banner-dismiss" type="button" aria-label="Dismiss usage limit notice" title="Dismiss notice" onClick={()=>dismissBanner(limitKey)}><X size={13}/></button>{offline(agent)?<><strong>{agent.name} is offline</strong><span>{offline(agent).resetLabel?`Usage limit · resets ${offline(agent).resetLabel}`:'Usage limit reached. Retry when your allowance is available.'}</span></>:<span>{unread.length} unread message{unread.length===1?'':'s'}</span>}{unread.length>0 && <button className="text-button" disabled={sending} onClick={async()=>{setSending(true);try{await api.retry(project.id,agent.id,chatId);}catch(e){await perform(()=>Promise.reject(e));}finally{setSending(false);}}}>Retry unread messages</button>}</div>}
    {allRunning.length>0&&!running.length&&<div className="chat-notice"><span>{agent.name} is working in another chat.</span><button className="text-button" onClick={()=>{const task=allRunning[0],owner=task.threadAgentId || task.agentId;setAgent(owner);chooseChat(messageChatId(task),owner);}}>Open running chat</button></div>}
    <div className="agent-panel-tabs" role="tablist" aria-label="Agent panel views">{[['chat', 'Chat'], ['context', 'Context'], ['sources', 'Sources'], ['tasks', 'Tasks']].map(([value, label]) => <button key={value} role="tab" aria-label={`Agent ${label.toLowerCase()}`} aria-selected={panel === value} className={panel === value ? 'active' : ''} onClick={() => setPanel(value)}>{label}{value === 'tasks' && running.length > 0 && <span className="live-dot"/>}{value === 'sources' && refs.length > 0 && <span className="tab-count">{refs.length}</span>}</button>)}</div>
    {participants.length>0 && !isDismissed(reportingKey) && <div className="collaboration-strip" aria-label="Specialists in this conversation"><Users size={12}/><span>Reporting to {agent?.name}:</span>{participants.map(a=><span key={a.id}><Avatar agent={a} small/>{a.name}</span>)}<button className="banner-dismiss" type="button" aria-label="Hide reporting specialists" title="Hide reporting specialists" onClick={()=>dismissBanner(reportingKey)}><X size={13}/></button></div>}
    {agent?.provider === 'chatgpt' && !isDismissed(planKey) && <div className="plan-usage"><span>{connection?.connected && connection.planEnabled ? 'Using ChatGPT plan' : 'ChatGPT sign-in required'}{connection?.label ? ` · ${connection.label}` : ''}</span><button onClick={() => api.openURL('https://chatgpt.com/settings/usage')}>Manage usage</button><button className="banner-dismiss" type="button" aria-label="Hide usage banner" title="Hide usage banner" onClick={()=>dismissBanner(planKey)}><X size={13}/></button></div>}
    {panel === 'chat' ? <div role="tabpanel" aria-label="Agent chat" className={`messages ${!messages.length ? 'no-messages' : ''}`}>
      {!messages.length && <div className="chat-welcome"><div className="welcome-orbit">{agent ? <Avatar agent={agent}/> : <MessageSquare size={25}/>}</div><span className="eyebrow">{agent ? 'NEW CONVERSATION' : 'YOUR TEAM'}</span><h2>{agent ? <>Say hi to<br/>{agent.name}.</> : <>Give this work<br/>a specialist.</>}</h2><p>{agent ? `Ask ${agent.name} a question or describe the task. Type / to link a document, file, or folder.` : 'Create an agent profile, then assign it to this project or folder with Manage team.'}</p>{agent ? <div className="suggestions">{['Review the brief and suggest next steps', 'Help me shape a research plan'].map(s => <button key={s} onClick={() => { setText(s); input.current?.focus(); }}><ArrowUpRight size={14}/><span>{s}</span></button>)}</div> : <button className="button secondary" onClick={onSetup}><Plus size={15}/>Set up agents</button>}</div>}
      {messages.map(m => {
        const day = new Date(m.createdAt).toDateString(), separator = day !== lastDay; lastDay = day;
        const speaker = agents.find(a=>a.id===m.agentId) || agent;
        const sender = m.role === 'user' ? 'user' : m.role === 'assistant' ? `agent:${m.agentId}` : m.role; const grouped = !separator && sender === lastSender && (sender==='user' || sender.startsWith('agent:')); lastSender = sender;
        return <React.Fragment key={m.id}>{separator && <div className="day-separator"><span>{dayLabel(m.createdAt)}</span></div>}
          {m.role === 'artifact' ? <div className="bubble-row assistant"><Avatar agent={speaker} small/><div className="bubble-stack"><ArtifactCard project={project} id={m.artifactId} title={m.text} onOpen={onOpenArtifact} perform={perform}/><div className="bubble-meta"><time>{timeLabel(m.createdAt)}</time></div></div></div>
            : m.role === 'system' ? <div className="chat-notice"><span>{m.text}</span></div>
            : m.role === 'tool' ? <div className="chat-notice tool"><Wrench size={12}/><span>{speaker?.name}: {m.text} · {m.phase}</span></div>
            : m.role === 'handoff' ? <div className="chat-notice handoff"><Network size={12}/><span><strong>{m.from}</strong> asked {speaker?.name}: {m.text.slice(0, 140)}</span></div>
            : <div className={`bubble-row ${m.role} ${grouped ? 'grouped' : ''}`}>{m.role === 'user' ? <UserAvatar settings={settings} small/> : <Avatar agent={speaker} small/>}
              <div className="bubble-stack">{m.audience==='agent' && <strong className="specialist-recipient">{speaker?.name} → {agents.find(a=>a.id===m.recipientId)?.name || agent?.name} · specialist report</strong>}<div className="bubble"><div className="message-body">{m.role === 'user' ? <p>{m.text}</p> : <Markdown>{clean(m.text)}</Markdown>}{m.searchSuggestions && <GroundingWidget html={m.searchSuggestions}/>}</div></div>
                {m.refs?.length > 0 && <div className="bubble-refs">{m.refs.map((r, i) => { const Icon = refIcon(r); return r.image&&r.id?<ChatImage key={i} reference={r} projects={projects}/>:<span key={i}><Icon size={11}/>{r.name}</span>; })}</div>}
                <div className="bubble-meta"><time>{timeLabel(m.createdAt)}</time>{m.effort && <span>· {m.effort} effort</span>}{m.role==='user' && m.delivery && <span className={`message-receipt ${m.delivery}`}>{m.delivery==='unread'?'Unread':'Read'}</span>}{m.role === 'assistant' && <><button className="save-message" onClick={() => onNote(m)}><FileText size={11}/>Save as note</button><button className="save-message" title="Ask the agent to turn this answer into an interactive page" onClick={() => { setText('Turn your last answer into a visual, interactive live app that I can keep in this project: '); setPanel('chat'); input.current?.focus(); }}><AppWindow size={11}/>Visualize</button></>}</div></div></div>}</React.Fragment>;
      })}
      {running.length > 0 && <div className="bubble-row assistant typing"><Avatar agent={agent} small/><div className="bubble-stack"><div className="bubble typing-bubble" aria-label={`${agent.name} is typing`}><i/><i/><i/></div><div className="bubble-meta"><span>{activity ? 'Receiving research…' : `${agent.name} is researching…`}</span></div></div></div>}<div ref={bottom}/>
    </div> : <ChatInspector chatId={chatId} panel={panel} project={project} agent={agent} perform={perform} refs={refs} addRef={addRef} removeRef={ref => setRefs(list => list.filter(r => refKey(r) !== refKey(ref)))} onOpenNote={onOpenNote}/>}
    <form className="composer-area" onSubmit={send}>
      {slash && candidates.length > 0 && <div className="slash-menu" role="listbox" aria-label="Link a document, file, or folder"><div className="slash-title">Link to this message</div>{candidates.map((c, i) => <button type="button" role="option" aria-selected={i === pick} key={c.ref ? refKey(c.ref) : c.computer} className={i === pick ? 'active' : ''} onMouseEnter={() => setPick(i)} onMouseDown={e => { e.preventDefault(); choose(c); }}><c.Icon size={15}/><span>{c.label}</span><small>{c.hint}</small></button>)}</div>}
      {showEffort && <div className="effort-row"><Gauge size={13}/><label htmlFor="effort-slider">Effort</label><input id="effort-slider" type="range" min="0" max="4" step="1" value={Math.max(0, EFFORT_LEVELS.findIndex(([v]) => v === effort))} aria-valuetext={EFFORT_LEVELS.find(([v]) => v === effort)?.[1]} onChange={e => changeEffort(EFFORT_LEVELS[Number(e.target.value)][0])}/><strong>{EFFORT_LEVELS.find(([v]) => v === effort)?.[1] || 'Auto'}</strong><button type="button" className="icon-button" aria-label="Hide effort bar" title="Hide effort bar" onClick={toggleEffort}><X size={13}/></button></div>}
      {refs.length > 0 && <div className="ref-chips">{refs.map(r => { const Icon = refIcon(r); return <span className={'ref-chip '+(/\.(png|jpe?g|webp|gif)$/i.test(r.name||'')&&r.id?'image-ref':'')} key={refKey(r)}>{/\.(png|jpe?g|webp|gif)$/i.test(r.name || '')&&r.id?<ChatImage reference={r} projects={projects}/>:<><Icon size={12}/>{r.name}</>}<button type="button" aria-label={`Remove ${r.name}`} onClick={() => setRefs(list => list.filter(x => refKey(x) !== refKey(r)))}><X size={11}/></button></span>; })}</div>}
      {draftError&&<p className="field-help" role="status">{draftError}</p>}<div className="composer"><textarea ref={input} aria-label="Message your agent" placeholder={`Message ${agent?.name || 'your research team'}… (type / to link)`} onPaste={e=>{const images=[...e.clipboardData.files].filter(file=>file.type.startsWith('image/'));if(images.length){e.preventDefault();uploadImages(images);}}} value={text} onChange={e => onType(e.target.value, e.target.selectionStart)} onKeyDown={keyDown} onClick={e => onType(text, e.target.selectionStart)} rows={2}/>
        <div className="composer-tools"><IconButton icon={ImageIcon} label="Upload images" disabled={uploading} onClick={()=>imageInput.current?.click()}/><div className="popover-anchor"><IconButton icon={Plus} label="Attach" aria-expanded={menu === 'attach'} onClick={() => setMenu(menu === 'attach' ? '' : 'attach')}/>{menu === 'attach' && <div className="popover attach-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setMenu(''); setText(t => t + (t && !/\s$/.test(t) ? ' /' : '/')); setSlash({ query: '', start: text.length + (text && !/\s$/.test(text) ? 1 : 0) }); setPick(0); input.current?.focus(); }}><FileText size={15}/>Document or folder from this app</button><button type="button" role="menuitem" onClick={() => pickComputer('file')}><Paperclip size={15}/>File from this computer</button><button type="button" role="menuitem" onClick={() => pickComputer('folder')}><FolderOpen size={15}/>Folder from this computer</button><button type="button" role="menuitem" onClick={() => { setMenu(''); perform(() => api.importFiles(project.id)); }}><Upload size={15}/>Import files into this project</button></div>}</div>
          <div className="popover-anchor"><button type="button" className={`tools-button ${selectedTools.length ? 'on' : ''}`} aria-expanded={menu === 'tools'} onClick={() => setMenu(menu === 'tools' ? '' : 'tools')}><Wrench size={13}/>Tools{selectedTools.length > 0 && <b>{selectedTools.length}</b>}<ChevronDown size={11}/></button>{menu === 'tools' && <div className="popover tools-menu"><div className="popover-head"><strong>Tools for this message</strong>{tools && <span className="popover-actions"><button type="button" className="text-button" onClick={() => perform(async () => { await act({ type: 'agent:tools', value: { id: agent.id, toolIds: tools } }); setTools(null); }, 'Saved as the default')}>Make default</button><button type="button" className="text-button" onClick={() => setTools(null)}>Use {agent.name}’s defaults</button></span>}</div><ToolChecklist tools={catalog.tools.filter(t=>!toolBlock(t,agent))} selected={selectedTools} onChange={setTools} empty={catalog.loading ? 'Looking for tools…' : 'No tools found.'}/><small className="popover-note">{agent.provider === 'claude' ? 'Only the selected tools are allowed for this request.' : ['codex', 'custom'].includes(agent.provider) ? 'Selected tools are added to this agent’s instructions.' : 'The selected tools are offered to the model for this request. MCP servers use the approval mode set in Tools & MCP. Web search for this connection is switched on in the agent profile.'}</small></div>}</div>
          {!showEffort && <button type="button" className={`tools-button ${effort ? 'on' : ''}`} aria-label="Show effort bar" title={effort ? `Effort: ${effort} (click to show the bar)` : 'Show effort bar'} onClick={toggleEffort}><Gauge size={13}/>{effort ? EFFORT_LEVELS.find(([v]) => v === effort)[1] : 'Effort'}</button>}
          <span className="composer-spacer"/>
          {running.length ? <button type="button" className="send-button stop" title="Stop this research run" aria-label="Stop this research run" onClick={() => perform(() => api.stop(running[0].groupId))}><Square size={14}/></button> : <button className="send-button" aria-label="Send message" disabled={(!text.trim() && !hasImages) || !agent || sending || uploading || allRunning.length>0}>{sending ? <Loader2 size={16} className="spin"/> : <ArrowUp size={17}/>}</button>}</div></div>
      <div className="composer-caption"><HardDrive size={11}/>{uploading?'Saving image…':offline(agent)?'Saved · agent is offline':'Saved locally'}<span>Enter to send · Shift + Enter for a new line</span></div></form>
  </section>;
}
function ChatImage({reference,projects}){const [src,setSrc]=useState(''),owner=projects.find(p=>p.files.some(f=>f.id===reference.id));useEffect(()=>{let live=true;if(owner)api.fileData(owner.id,reference.id).then(value=>{if(live)setSrc(value);}).catch(()=>{});return()=>{live=false;};},[owner?.id,reference.id]);return <span className="chat-image" title={reference.name}>{src?<img src={src} alt={reference.name}/>:<ImageIcon size={18}/>}<small>{reference.name}</small></span>;}
function ArtifactCard({ project, id, title, onOpen, perform }) {
  const artifact = (project.artifacts || []).find(a => a.id === id);
  if (!artifact) return <div className="chat-notice"><span>{title} was removed from this project.</span></div>;
  const Icon = kindIcon(artifact.kind);
  return <div className="artifact-card"><div className="artifact-card-head"><Icon size={15}/><strong>{artifact.title}</strong><small>{kindName(artifact.kind)}</small></div><div className={`artifact-card-body ${artifact.kind}`}><ArtifactPreview artifact={artifact} project={project}/></div><div className="artifact-card-actions"><button className="button secondary small-button" onClick={() => onOpen(artifact.id)}><ArrowUpRight size={13}/>Open in a tab</button>{artifact.kind === 'html' && <button className="button secondary small-button" onClick={() => perform(() => api.exportArtifact(project.id, artifact.id))}>Save as file</button>}</div></div>;
}
function ChatInspector({ chatId,panel, project, agent, perform, refs, addRef, removeRef, onOpenNote }) {
  const tasks = (agent?conversationMessages(project.tasks,agent.id,chatId):project.tasks).slice().reverse();
  const attached = r => refs.some(x => refKey(x) === refKey(r));
  const AttachButton = ({ r }) => attached(r) ? <button className="attach-toggle on" onClick={() => removeRef(r)} aria-label={`Detach ${r.name}`}><Check size={12}/>Attached</button> : <button className="attach-toggle" onClick={() => addRef(r)} aria-label={`Attach ${r.name} to message`}><Plus size={12}/>Attach</button>;
  return <section className="chat-inspector" role="tabpanel" aria-label={`Agent ${panel}`}>
    {panel === 'context' && <><div className="inspector-label">CURRENT WORK</div><h3>{project.name}</h3><p>{project.description || 'Add a brief in project details to give your agents more context.'}</p><div className="context-counts"><span><FileText size={14}/>{project.notes.length} documents</span><span><Paperclip size={14}/>{project.files.length} attachments</span></div><div className="inspector-divider"/><div className="inspector-label">SELECTED SPECIALIST</div>{agent ? <><h3>{agent.name}</h3><p>{agent.role}</p><span className="inspector-model">{providerName(agent.provider)} · {agent.model || 'CLI default model'}</span><details className="inspector-instructions"><summary>Agent instructions<ChevronDown size={14}/></summary><Markdown>{agent.prompt}</Markdown></details></> : <p>No profile assigned to this work.</p>}<div className="inspector-divider"/><div className="inspector-label">SAVED KNOWLEDGE</div>{project.notes.length ? project.notes.map(n => <button className="inspector-document" key={n.id} onClick={() => onOpenNote(n.id)}><FileText size={14}/><span>{n.title}</span></button>) : <p>Important findings saved as notes will appear here.</p>}</>}
    {panel === 'sources' && <><div className="inspector-label">ATTACH FROM THIS APP</div><p className="inspector-help">Attached items are sent with your next message. You can also type <kbd>/</kbd> in the message box.</p>
      {project.notes.map(n => { const r = { type: 'note', id: n.id, name: n.title, kind: n.kind }; return <div className="inspector-source attachable" key={n.id}>{n.kind === 'sheet' ? <Table2 size={15}/> : <FileText size={15}/>}<span><strong>{n.title}</strong><small>{n.kind === 'sheet' ? 'Spreadsheet' : 'Document'}</small></span><AttachButton r={r}/></div>; })}
      {project.files.map(f => { const r = { type: 'file', id: f.id, name: f.name }; return <div className="inspector-source attachable" key={f.id}><Paperclip size={15}/><span><strong>{f.name}</strong><small>Attachment</small></span><AttachButton r={r}/><IconButton icon={ArrowUpRight} label={`Open ${f.name}`} onClick={() => perform(() => api.openFile(project.id, f.id))}/></div>; })}
      {!project.notes.length && !project.files.length && <p>Create a document or import files, then attach them here.</p>}
      <div className="inspector-divider"/><div className="inspector-label">SAVED WEB SOURCES</div>{(project.sources || []).map(s => <button className="inspector-source" key={s.id} onClick={() => perform(() => api.openURL(s.url))}><Globe2 size={15}/><span><strong>{s.title}</strong><small>{new URL(s.url).hostname}</small></span><ArrowUpRight size={14}/></button>)}{!project.sources?.length && <p>Save pages from the Browser tab to keep the evidence with this project.</p>}</>}
    {panel === 'tasks' && <><div className="inspector-label">RESEARCH ACTIVITY</div>{tasks.map(t => <article className="inspector-task" key={t.id}><div><span className={`activity-status ${t.status}`}>{t.status === 'running' ? <Loader2 className="spin" size={13}/> : t.status === 'done' ? <Check size={13}/> : <Circle size={11}/>}</span><strong>{t.title}</strong></div><p>{t.status}<span> · </span>{new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>{t.error && <small className="error-text">{t.error}</small>}{t.status === 'running' && <button className="text-button" onClick={() => perform(() => api.stop(t.groupId))}><Square size={12}/>Stop run</button>}</article>)}{!tasks.length && <p>Research runs and delegated tasks will appear here when your team starts working.</p>}</>}
  </section>;
}
