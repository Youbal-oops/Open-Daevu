import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, ArrowLeft, Check, Moon, Sun, HardDrive, Cloud, Sparkles, Hand } from 'lucide-react';
import { APP_NAME } from '../shared/brand.mjs';
import { uid } from './ui';
import './onboarding.css';

// The first thing a new person sees: a short, skippable set-up. AI helpers are an option here, never a requirement.
const STEPS = ['welcome', 'name', 'look', 'storage', 'ai', 'project', 'done'];
const ease = [0.22, 1, 0.36, 1];

function Mark() {
  return <div className="ob-mark" aria-hidden="true"><span className="ob-blob a"/><span className="ob-blob b"/><span className="ob-blob c"/></div>;
}
function Option({ on, icon: Icon, title, text, onClick }) {
  return <button type="button" className={`ob-option${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}><span className="ob-option-icon"><Icon size={20}/></span><span><strong>{title}</strong><small>{text}</small></span><span className="ob-tick">{on && <Check size={15}/>}</span></button>;
}

export function Onboarding({ state, act, onDone }) {
  const [step, setStep] = useState(0), [direction, setDirection] = useState(1), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [name, setName] = useState(state.settings.userName || ''), [theme, setTheme] = useState(state.theme || 'light'), [storage, setStorage] = useState('local'), [ai, setAi] = useState(false), [project, setProject] = useState('');
  const field = useRef(null), key = STEPS[step];
  useEffect(() => { const t = setTimeout(() => field.current?.focus(), 350); return () => clearTimeout(t); }, [step]);
  const go = to => { setDirection(to > step ? 1 : -1); setStep(to); setError(''); };
  const pickTheme = value => { setTheme(value); act({ type: 'theme', value }).catch(() => {}); };
  async function finish(skip = false) {
    setBusy(true); setError('');
    try {
      const settings = { onboarded: true, aiAgents: skip ? false : ai, ...(name.trim() && !skip ? { userName: name.trim().slice(0, 80) } : {}) };
      await act({ type: 'settings', value: settings });
      let created = null;
      if (!skip && project.trim()) {
        created = { id: uid(), name: project.trim().slice(0, 80), description: '', parentId: null, status: 'active', kpis: [], agentIds: [], color: 'green', notes: [], files: [], tasks: [], messages: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
        await act({ type: 'project', value: created });
      }
      onDone({ projectId: created?.id || null, next: skip ? null : ai ? 'connections' : storage === 'drive' ? 'connections' : null });
    } catch (e) { setError(e.message); setBusy(false); }
  }
  const advance = e => { e?.preventDefault(); if (key === 'done') finish(); else go(step + 1); };
  const last = step === STEPS.length - 1;
  return <div className="onboarding" role="dialog" aria-modal="true" aria-label={`Welcome to ${APP_NAME}`}>
    <div className="ob-glow" aria-hidden="true"/>
    {key !== 'welcome' && key !== 'done' && <button className="ob-skip" onClick={() => finish(true)} disabled={busy}>Skip setup</button>}
    <form className="ob-card" onSubmit={advance}>
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div key={key} className="ob-step" custom={direction}
          initial={{ opacity: 0, x: 36 * direction, filter: 'blur(6px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: -36 * direction, filter: 'blur(6px)' }} transition={{ duration: 0.38, ease }}>
          {key === 'welcome' && <>
            <Mark/>
            <h1 className="ob-title">{`Welcome to ${APP_NAME}`.split(' ').map((w, i) => <React.Fragment key={i}><motion.span style={{ display: 'inline-block' }} initial={{ y: 22, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 + i * 0.09, duration: 0.5, ease }}>{w}</motion.span>{' '}</React.Fragment>)}</h1>
            <motion.p className="ob-lead" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.5, ease }}>One calm place for your projects, notes, canvas and calendar. It takes a minute to set up, and you can skip any step.</motion.p>
          </>}
          {key === 'name' && <>
            <p className="ob-kicker">Step 1 of 5</p><h2 className="ob-title small">What should we call you?</h2>
            <p className="ob-lead">Used to greet you and to sign what you write. You can change it any time.</p>
            <input ref={field} className="ob-input" aria-label="Your name" placeholder="Your name" maxLength={80} value={name} onChange={e => setName(e.target.value)}/>
          </>}
          {key === 'look' && <>
            <p className="ob-kicker">Step 2 of 5</p><h2 className="ob-title small">Pick a look</h2>
            <p className="ob-lead">Light or dark. It changes right now so you can see it.</p>
            <div className="ob-options two"><Option on={theme === 'light'} icon={Sun} title="Light" text="Bright and soft" onClick={() => pickTheme('light')}/><Option on={theme === 'dark'} icon={Moon} title="Dark" text="Easy on the eyes" onClick={() => pickTheme('dark')}/></div>
          </>}
          {key === 'storage' && <>
            <p className="ob-kicker">Step 3 of 5</p><h2 className="ob-title small">Where should your work live?</h2>
            <p className="ob-lead">Everything stays in plain files you own.</p>
            <div className="ob-options"><Option on={storage === 'local'} icon={HardDrive} title="On this computer" text="Private and fast. The default." onClick={() => setStorage('local')}/><Option on={storage === 'drive'} icon={Cloud} title="In my Google Drive folder" text="Use it on two computers. You will pick the folder next." onClick={() => setStorage('drive')}/></div>
          </>}
          {key === 'ai' && <>
            <p className="ob-kicker">Step 4 of 5</p><h2 className="ob-title small">Do you want AI helpers?</h2>
            <p className="ob-lead">Optional. Helpers can search your work, write pages and plan your calendar. Without them, {APP_NAME} is a complete workspace, and you can add them later in Settings.</p>
            <div className="ob-options"><Option on={!ai} icon={Hand} title="Not now" text="Just my own notes, canvas and calendar." onClick={() => setAi(false)}/><Option on={ai} icon={Sparkles} title="Yes, set up AI helpers" text="Connect an account or a tool after setup." onClick={() => setAi(true)}/></div>
          </>}
          {key === 'project' && <>
            <p className="ob-kicker">Step 5 of 5</p><h2 className="ob-title small">Start your first project</h2>
            <p className="ob-lead">A project is a room for one piece of work. Leave it empty to start from a blank workspace.</p>
            <input ref={field} className="ob-input" aria-label="Project name" placeholder="For example: Launch research" maxLength={80} value={project} onChange={e => setProject(e.target.value)}/>
          </>}
          {key === 'done' && <>
            <svg className="ob-check" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34" pathLength="1"/><path d="M26 41l10 10 19-22" pathLength="1"/></svg>
            <h2 className="ob-title">{name.trim() ? `You are all set, ${name.trim().split(' ')[0]}` : 'You are all set'}</h2>
            <p className="ob-lead">{ai ? 'Next you will connect your AI helpers.' : storage === 'drive' ? 'Next you will choose your Drive folder.' : 'Your workspace is ready.'}</p>
          </>}
        </motion.div>
      </AnimatePresence>
      {error && <p className="ob-error" role="alert">{error}</p>}
      <div className="ob-actions">
        {step > 0 && !last ? <button type="button" className="ob-back" onClick={() => go(step - 1)} disabled={busy}><ArrowLeft size={16}/>Back</button> : <span/>}
        <button className="ob-next" disabled={busy}>{key === 'welcome' ? 'Get started' : last ? 'Open my workspace' : key === 'project' && !project.trim() ? 'Skip for now' : 'Continue'}<ArrowRight size={16}/></button>
      </div>
      <div className="ob-dots" aria-hidden="true">{STEPS.map((_, i) => <i key={i} className={i === step ? 'on' : i < step ? 'past' : ''}/>)}</div>
    </form>
  </div>;
}
