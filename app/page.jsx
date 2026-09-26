'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { newProject, approveBrief, acceptSuggestions, choicesComplete, canGenerate, steps, scopeNames, destinations } from '../lib/workflow.mjs';

const STORAGE = 'project-planner-v1';
const cloudUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cloudKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const cloud = cloudUrl && cloudKey ? createClient(cloudUrl, cloudKey) : null;
const example = 'I want to make an app where someone uploads a file, gets a six-digit code, and another person enters the code to download it. Files should expire after seven days.';
function date(ts) { return new Date(ts).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }); }
function icon(name) { return ({idea:'✦', improve:'✧', build:'▣'})[name]; }
function normalizeProject(p) { return { ...p, step: ['decide', 'brief'].includes(p.step) ? (p.approvedVersion ? 'build' : 'improve') : p.step }; }

export default function Home() {
  const [projects, setProjects] = useState([]);
  const [active, setActive] = useState(null);
  const [ready, setReady] = useState(false);
  const [cloudUser, setCloudUser] = useState(null);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [email, setEmail] = useState('');
  const [loginMessage, setLoginMessage] = useState('');
  const [key, setKey] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const importRef = useRef(null);

  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}'); if (Array.isArray(saved.projects)) { setProjects(saved.projects.map(normalizeProject)); setActive(saved.active || saved.projects[0]?.id || null); } } catch {} setReady(true); }, []);
  useEffect(() => { if (ready) { try { localStorage.setItem(STORAGE, JSON.stringify({ projects, active })); } catch { setError('Browser storage is full. Export a backup of your idea.'); } } }, [projects, active, ready]);
  useEffect(() => {
    if (!cloud) return;
    let mounted = true;
    async function load(user) {
      setCloudLoaded(false); setCloudUser(user);
      if (!user) return;
      const { data, error: loadError } = await cloud.from('projects').select('id,document').order('updated_at', { ascending: false });
      if (!mounted) return;
      if (loadError) { setError('Could not load cloud projects. Check the database setup and try reloading.'); return; }
      const remote = data.map(row => row.document).filter(item => item && typeof item.id === 'string').map(normalizeProject);
      setProjects(remote);
      setActive(current => remote.some(p => p.id === current) ? current : remote[0]?.id || null);
      setCloudLoaded(true);
    }
    cloud.auth.getUser().then(({data}) => load(data.user));
    const {data: {subscription}} = cloud.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) load(session.user);
      if (event === 'SIGNED_OUT') { setCloudUser(null); setCloudLoaded(false); setProjects([]); setActive(null); }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!cloud || !cloudUser || !cloudLoaded || !ready) return;
    const timer = setTimeout(async () => {
      if (!projects.length) return;
      const {error: saveError} = await cloud.from('projects').upsert(projects.map(p => ({id:p.id,user_id:cloudUser.id,document:p,updated_at:new Date(p.updatedAt || Date.now()).toISOString()})));
      if (saveError) setError('Could not sync your latest changes. Export a backup before leaving this page.');
    }, 850);
    return () => clearTimeout(timer);
  }, [projects, cloudUser, cloudLoaded, ready]);
  const project = projects.find(p => p.id === active);
  function update(change) { setProjects(all => all.map(p => p.id === active ? { ...p, ...change, updatedAt: Date.now() } : p)); }
  function replace(updated) { setProjects(all => all.map(p => p.id === active ? updated : p)); }
  function decideSuggestion(index, status) { update({ suggestions: project.suggestions.map((s, i) => i === index ? { ...s, status } : s), approvedVersion: null, prompts: [], currentPrompt: 0 }); }
  function add() { const p = newProject(); setProjects(all => [p, ...all]); setActive(p.id); setError(''); }
  async function remove() { if (!confirm('Delete this idea and its history?')) return; if (cloud && cloudUser) { const {error: deleteError} = await cloud.from('projects').delete().eq('id', active); if (deleteError) { setError('Could not delete this cloud project. Please retry.'); return; } } setProjects(all => all.filter(p => p.id !== active)); setActive(null); }
  async function signIn() { if (!cloud || !email.trim()) return; const {error: authError} = await cloud.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:window.location.origin}}); setLoginMessage(authError ? authError.message : 'Check your email for your sign-in link.'); }
  async function run(mode, context) {
    setBusy(mode); setError('');
    try {
      const res = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key.trim() ? { 'x-gemini-key': key.trim() } : {}), ...(accessCode.trim() ? { 'x-app-access-code': accessCode.trim() } : {}) }, body: JSON.stringify({ mode, context }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      return data;
    } catch (e) { setError(e.message || 'Request failed.'); return null; } finally { setBusy(''); }
  }
  async function analyze() {
    if (project.idea.trim().length < 24) { setError('Describe the idea in a little more detail first.'); return; }
    const data = await run('analyze', { idea: project.idea, scope: scopeNames[project.scope] });
    if (data) update({ title: data.summary?.slice(0, 65) || 'New idea', suggestions: data.suggestions.map((s, i) => ({ id: s.id || String(i), text: s.text || '', reason: s.reason || '', type: s.type || 'feature', status: 'pending' })), questions: data.questions, feasibility: data.feasibility, answers: {}, brief: null, approvedVersion: null, prompts: [], step: 'improve' });
  }
  async function confirmChoices() {
    if (!choicesComplete(project)) { setError('Accept or pass every suggestion first.'); return; }
    const data = await run('brief', { originalIdea: project.idea, scope: scopeNames[project.scope], acceptedSuggestions: acceptSuggestions(project), rejectedSuggestions: project.suggestions.filter(s => s.status === 'rejected').map(s => s.text), openQuestions: project.questions, feasibility: project.feasibility });
    if (!data) return;
    const approved = approveBrief({ ...project, brief: data.brief });
    replace(approved);
    const roadmap = await run('roadmap', { approvedBrief: data.brief, scope: scopeNames[project.scope], builder: destinations[project.destination] });
    if (roadmap) replace({ ...approved, prompts: roadmap.prompts, currentPrompt: 0, feedback: [] });
  }
  async function generate() {
    if (!canGenerate(project)) { setError('Confirm your suggestions before generating prompts.'); return; }
    const data = await run('roadmap', { approvedBrief: project.versions.find(v => v.version === project.approvedVersion)?.text, scope: scopeNames[project.scope], builder: destinations[project.destination] });
    if (data) update({ prompts: data.prompts, currentPrompt: 0, feedback: [] });
  }
  function exportProject() { const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `project-plan-${project.id.slice(0, 8)}.json`; a.click(); URL.revokeObjectURL(url); }
  async function importProject(file) { if (!file || file.size > 2000000) { setError('Choose a project export under 2 MB.'); return; } try { const data = JSON.parse(await file.text()); if (!data || typeof data.idea !== 'string' || !Array.isArray(data.versions) || !Array.isArray(data.prompts)) throw new Error(); const p = { ...newProject(), ...data, id: crypto.randomUUID(), title: `${data.title || 'Imported idea'} (imported)`, approvedVersion: null, prompts: [], currentPrompt: 0, step: data.suggestions?.length ? 'improve' : 'idea' }; setProjects(all => [p, ...all]); setActive(p.id); setError('Imported as a draft. Choose which suggestions to include, then generate your plan.'); } catch { setError('This is not a valid project export.'); } }
  const canNavigate = name => name === 'idea' || (name === 'improve' && project.suggestions.length > 0) || (name === 'build' && !!project.approvedVersion);
  const current = project?.prompts?.[project.currentPrompt];

  if (!ready) return <div className="loading">Opening workspace…</div>;
  if (cloud && !cloudUser) return <div className="login"><div className="brand"><div className="brand-mark">✳</div><div><strong>FORMA</strong><small>idea → execution</small></div></div><section className="card"><div className="eyebrow">YOUR PRIVATE WORKSPACE</div><h1>Make your next idea real.</h1><p>Sign in to save your plans and pick up where you left off on any device.</p><label className="field-label" htmlFor="login-email">EMAIL ADDRESS</label><input id="login-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/><button className="primary full" onClick={signIn}>Email me a sign-in link ↗</button>{loginMessage && <p role="status">{loginMessage}</p>}</section></div>;
  if (cloud && !cloudLoaded) return <div className="loading">Loading your workspace…</div>;
  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">✳</div><div><strong>FORMA</strong><small>idea → execution</small></div></div>
      <div className="side-heading">YOUR WORKSPACE</div>
      <button className="new-button" onClick={add}>＋ &nbsp; New idea <span>↗</span></button>
      <div className="side-heading projects-heading">RECENT IDEAS</div>
      <div className="project-list">{projects.length ? projects.map(p => <button key={p.id} className={'project-link ' + (p.id === active ? 'selected' : '')} onClick={() => { setActive(p.id); setError(''); }}><span className="project-dot"/><span className="project-name">{p.title || 'Untitled idea'}<small>{date(p.updatedAt)}</small></span></button>) : <p className="side-empty">Your next big thing starts here.</p>}</div>
      <div className="side-footer"><div className="side-footer-icon">✦</div><div><strong>Start with a thought.</strong><span>Leave with a build plan.</span></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> {project ? project.title : 'Overview'}</div><div className="top-actions"><button className="text-button" onClick={() => importRef.current?.click()}>Import</button><input ref={importRef} type="file" accept="application/json" hidden onChange={e => { importProject(e.target.files?.[0]); e.target.value = ''; }}/>{cloudUser && <button className="text-button" onClick={() => cloud.auth.signOut()}>Sign out</button>}<button className="settings-button" onClick={() => setSettings(true)}>⚙ <span>Settings</span></button></div></header>
      {!project ? <section className="empty-state"><div className="eyebrow">THE SPACE BETWEEN WHAT IF AND WHAT'S NEXT</div><h1>Good ideas deserve<br/><em>a clear way forward.</em></h1><p>Turn a rough thought into a plan, then build it one prompt at a time.</p><button className="primary" onClick={add}>Start a new idea <span>↗</span></button><div className="empty-stages"><span>01 &nbsp; Shape it</span><span>02 &nbsp; Confirm it</span><span>03 &nbsp; Build it</span></div></section> : <div className="workspace">
        <div className="page-head"><div><div className="eyebrow">YOUR PROJECT WORKSPACE · {scopeNames[project.scope].toUpperCase()}</div><h1>{project.step === 'idea' ? 'Start with a spark.' : project.step === 'improve' ? 'Make it stronger.' : 'Let’s make it real.'}</h1><p>{project.step === 'idea' ? 'Tell us what you want to make. It does not have to be polished.' : project.step === 'improve' ? 'Tick what you want. Cross what you do not. We’ll take it from there.' : 'Your project plan and prompts are ready.'}</p></div><div className="head-tools"><button className="outline tiny" onClick={exportProject}>↓ Export</button><button className="outline tiny danger" onClick={remove}>Delete</button></div></div>
        <nav className="steps">{steps.map((s, i) => <button key={s} disabled={!canNavigate(s)} onClick={() => { update({ step:s }); setError(''); }} className={'step ' + (project.step === s ? 'active' : '')}><span>{icon(s)}</span><div><small>0{i+1}</small>{({idea:'The idea',improve:'Choose suggestions',build:'Your plan'})[s]}</div></button>)}</nav>
        {error && <div className="alert" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}
        {project.step === 'idea' && <div className="columns"><section className="card wide"><div className="card-number">01 / THE STARTING POINT</div><h2>What are you thinking about?</h2><p>No need for a perfect pitch. Describe what it should do, who it’s for, and anything you already know.</p><textarea className="idea-input" placeholder="I want to create…" value={project.idea} onChange={e => update({ idea: e.target.value, title: project.title === 'Untitled idea' ? 'New idea' : project.title, suggestions: [], questions: [], brief: null, approvedVersion: null, prompts: [] })}/><div className="input-bottom"><button className="text-button" onClick={() => update({ idea: example })}>Try an example ↗</button><span>{project.idea.length} characters</span></div><div className="divider"/><h3>How far do you want to take it?</h3><div className="scope-options">{Object.entries(scopeNames).map(([id, name]) => <button key={id} className={'scope ' + (project.scope === id ? 'chosen' : '')} onClick={() => update({ scope: id, suggestions: [], questions: [], brief: null, approvedVersion: null, prompts: [] })}><span className="radio"/><strong>{name}</strong><small>{id === 'prototype' ? 'Explore the concept' : id === 'mvp' ? 'A real first release' : 'A complete product plan'}</small></button>)}</div><button className="primary full" disabled={!!busy} onClick={analyze}>{busy === 'analyze' ? 'Exploring your idea…' : 'Explore this idea'} <span>↗</span></button></section><aside className="helper"><div className="helper-symbol">✳</div><h3>Every great build starts somewhere.</h3><p>We’ll suggest improvements for you to accept or pass, then create your plan and prompts.</p><div className="helper-line"/><small>YOUR IDEA STAYS YOURS</small><p>AI suggestions are always optional. Nothing enters the final plan until you approve it.</p></aside></div>}
        {project.step === 'improve' && <div className="columns"><section className="card wide"><div className="card-number">02 / POSSIBILITIES</div><h2>A few ways to sharpen it.</h2><p>Accept or pass each suggestion. No writing needed.</p><div className="suggestions">{project.suggestions.map((s, i) => <div key={s.id + i} className={'suggestion ' + s.status}><div className="suggestion-top"><span className="chip">{s.type}</span><span className="suggestion-index">{String(i+1).padStart(2,'0')}</span></div><strong className="suggestion-text">{s.text}</strong><p>{s.reason}</p><div className="suggestion-actions"><button className={s.status === 'accepted' ? 'pill chosen-pill' : 'pill'} aria-pressed={s.status === 'accepted'} onClick={() => decideSuggestion(i, 'accepted')}>✓ Accept</button><button className={s.status === 'rejected' ? 'pill rejected-pill' : 'pill'} aria-pressed={s.status === 'rejected'} onClick={() => decideSuggestion(i, 'rejected')}>× Pass</button><span>{s.status === 'pending' ? 'Awaiting your decision' : s.status === 'accepted' ? 'Added to the plan' : 'Excluded from the plan'}</span></div></div>)}</div><label className="field-label" htmlFor="destination">WHERE WILL YOU USE THE PROMPTS?</label><select id="destination" value={project.destination} onChange={e => update({ destination:e.target.value, approvedVersion: null, prompts: [], currentPrompt: 0 })}>{Object.entries(destinations).map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select><div className="card-actions"><button className="outline" onClick={() => update({ step:'idea' })}>← Back</button><button className="primary" disabled={!!busy || !choicesComplete(project)} onClick={confirmChoices}>{busy === 'brief' ? 'Creating your plan…' : busy === 'roadmap' ? 'Generating prompts…' : 'Confirm choices & generate prompts'} <span>↗</span></button></div></section><aside className="helper"><div className="helper-symbol">✧</div><h3>Your judgment comes first.</h3><p>{project.suggestions.filter(s => s.status === 'accepted').length} accepted · {project.suggestions.filter(s => s.status === 'rejected').length} passed · {project.suggestions.filter(s => s.status === 'pending').length} open</p><div className="helper-line"/><p>Choose every suggestion to generate your plan. Unchosen ideas stay out.</p>{project.feasibility?.length > 0 && <><div className="helper-line"/><small>FEASIBILITY TO CHECK</small>{project.feasibility.map((f,i) => <p key={i}><strong>{f.item}:</strong> {f.detail}<br/><span>Fallback: {f.fallback}</span></p>)}</>}</aside></div>}
        {project.step === 'build' && <div className="columns"><section className="card wide"><div className="card-number">03 / MAKE IT REAL · PLAN V{project.approvedVersion}</div><h2>Build with direction.</h2><p>Made from your idea and the suggestions you chose. Each prompt has a specific goal and checklist.</p><details className="history plan-summary"><summary>See your generated project plan</summary><pre>{project.versions.find(v => v.version === project.approvedVersion)?.text}</pre></details>{!project.prompts.length ? <><p>The prompts could not be generated. Retry below to finish your plan.</p><button className="primary full" disabled={!!busy} onClick={generate}>{busy === 'roadmap' ? 'Creating your roadmap…' : 'Retry generating prompts'} <span>↗</span></button></> : <><div className="roadmap-progress"><span>STEP {Math.min(project.currentPrompt+1, project.prompts.length)} OF {project.prompts.length}</span><div className="meter"><div style={{ width: `${project.currentPrompt/project.prompts.length*100}%` }}/></div><strong>{Math.round(project.currentPrompt/project.prompts.length*100)}%</strong></div><div className="roadmap-list">{project.prompts.map((p,i) => <div key={i} className={'roadmap-item ' + (i === project.currentPrompt ? 'current' : '')}><span>{i < project.currentPrompt ? '✓' : String(i+1).padStart(2,'0')}</span><span>{p.title}</span><small>{i < project.currentPrompt ? 'Viewed' : i === project.currentPrompt ? 'In progress' : 'Up next'}</small></div>)}</div>{current ? <div className="current-prompt"><div className="prompt-header"><span className="chip">CURRENT PROMPT</span><button className="text-button" onClick={async () => { await navigator.clipboard.writeText(current.prompt); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>{copied ? 'Copied ✓' : 'Copy prompt ↗'}</button></div><h3>{current.title}</h3>{current.goal && <p>{current.goal}</p>}<pre>{current.prompt}</pre><h4>What to check</h4><ul>{current.checks.map((c,i) => <li key={i}>{c}</li>)}</ul><div className="card-actions"><button className="outline" disabled={project.currentPrompt === 0} onClick={() => update({ currentPrompt: project.currentPrompt - 1 })}>← Previous prompt</button><button className="primary" onClick={() => update({ currentPrompt: project.currentPrompt + 1 })}>{project.currentPrompt + 1 === project.prompts.length ? "Finish roadmap" : "Next prompt →"}</button></div></div> : <div className="complete"><span>✳</span><h3>Roadmap complete.</h3><p>You have reached the end of your prompts. Export your project to keep a copy of the plan.</p><button className="outline" onClick={() => update({ currentPrompt: project.prompts.length - 1 })}>← Previous prompt</button></div>}</>}</section><aside className="helper"><div className="helper-symbol">▣</div><h3>One step at a time.</h3><p>Copy the current prompt into {destinations[project.destination]}. Move to the next prompt when you are ready.</p><div className="helper-line"/><small>STAY IN CONTROL</small><p>Every prompt follows the idea and suggestions you confirmed.</p></aside></div>}
      </div>}
    </main>
    {settings && <div className="modal-backdrop" onClick={() => setSettings(false)}><div className="modal" role="dialog" aria-modal="true" aria-label="Settings" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setSettings(false)}>×</button><div className="card-number">WORKSPACE SETTINGS</div><h2>AI connection</h2><p>If the site owner configured a server key, enter the access code they gave you. Otherwise you can use your own Gemini API key for this browser session.</p><label htmlFor="access">App access code</label><input id="access" type="password" autoComplete="off" value={accessCode} onChange={e => setAccessCode(e.target.value)} placeholder="Optional if using your own key"/><label htmlFor="key">Your Gemini API key</label><input id="key" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder="Optional if the site has a protected key"/><p className="setting-note">Keys and access codes are kept only in this tab’s memory. Project drafts are saved in this browser. Export them to keep a backup.</p><button className="primary full" onClick={() => setSettings(false)}>Done</button></div></div>}
  </div>;
}
