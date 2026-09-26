'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { newProject, approveBrief, reviseBrief, acceptSuggestions, canGenerate, registerEvaluation, steps, scopeNames, destinations } from '../lib/workflow.mjs';

const STORAGE = 'project-planner-v1';
const cloudUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cloudKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const cloud = cloudUrl && cloudKey ? createClient(cloudUrl, cloudKey) : null;
const example = 'I want to make an app where someone uploads a file, gets a six-digit code, and another person enters the code to download it. Files should expire after seven days.';
function date(ts) { return new Date(ts).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }); }
function icon(name) { return ({idea:'✦', improve:'✧', decide:'◇', brief:'▤', build:'▣'})[name]; }

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
  const [feedbackText, setFeedbackText] = useState('');
  const [changeText, setChangeText] = useState('');
  const [changePreview, setChangePreview] = useState(null);
  const [copied, setCopied] = useState(false);
  const importRef = useRef(null);

  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}'); if (Array.isArray(saved.projects)) { setProjects(saved.projects); setActive(saved.active || saved.projects[0]?.id || null); } } catch {} setReady(true); }, []);
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
      const remote = data.map(row => row.document).filter(item => item && typeof item.id === 'string');
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
  function add() { const p = newProject(); setProjects(all => [p, ...all]); setActive(p.id); setError(''); setFeedbackText(''); }
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
  async function makeBrief() {
    const data = await run('brief', { originalIdea: project.idea, scope: scopeNames[project.scope], acceptedSuggestions: acceptSuggestions(project), rejectedSuggestions: project.suggestions.filter(s => s.status === 'rejected').map(s => s.text), questionsAndAnswers: project.questions.map(q => ({ question: q.question, answer: project.answers[q.id] || 'Unanswered' })), feasibility: project.feasibility });
    if (data) update({ brief: data.brief, step: 'brief' });
  }
  async function generate() {
    if (!canGenerate(project)) { setError('Confirm the current brief before generating prompts.'); return; }
    const data = await run('roadmap', { approvedBrief: project.versions.find(v => v.version === project.approvedVersion)?.text, scope: scopeNames[project.scope], builder: destinations[project.destination] });
    if (data) update({ prompts: data.prompts, currentPrompt: 0, feedback: [] });
  }
  async function evaluate() {
    if (!feedbackText.trim()) { setError('Paste the builder result, an error, or verification evidence first.'); return; }
    const data = await run('evaluate', { approvedBrief: project.versions.find(v => v.version === project.approvedVersion)?.text, prompt: project.prompts[project.currentPrompt], builderResult: feedbackText, priorFeedback: project.feedback.filter(f => f.step === project.currentPrompt).slice(-2) });
    if (data) { replace(registerEvaluation(project, data, feedbackText)); setFeedbackText(''); }
  }
  async function impact() {
    if (!changeText.trim()) return;
    const data = await run('impact', { currentApprovedBrief: project.versions.find(v => v.version === project.approvedVersion)?.text, currentPrompt: project.currentPrompt, remainingPrompts: project.prompts.slice(project.currentPrompt).map(p => p.title), requestedChange: changeText });
    if (data) setChangePreview(data);
  }
  function exportProject() { const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `project-plan-${project.id.slice(0, 8)}.json`; a.click(); URL.revokeObjectURL(url); }
  async function importProject(file) { if (!file || file.size > 2000000) { setError('Choose a project export under 2 MB.'); return; } try { const data = JSON.parse(await file.text()); if (!data || typeof data.idea !== 'string' || !Array.isArray(data.versions) || !Array.isArray(data.prompts)) throw new Error(); const p = { ...newProject(), ...data, id: crypto.randomUUID(), title: `${data.title || 'Imported idea'} (imported)`, approvedVersion: null, prompts: [], currentPrompt: 0, step: data.brief ? 'brief' : 'idea' }; setProjects(all => [p, ...all]); setActive(p.id); setError('Imported as a draft. Review and confirm its brief before generating prompts.'); } catch { setError('This is not a valid project export.'); } }
  const canNavigate = name => name === 'idea' || (name === 'improve' && project.suggestions.length > 0) || (name === 'decide' && project.suggestions.length > 0) || (name === 'brief' && !!project.brief) || (name === 'build' && !!project.approvedVersion);
  const current = project?.prompts?.[project.currentPrompt];
  const lastReview = project?.feedback?.filter(f => f.step === project.currentPrompt).at(-1);

  if (!ready) return <div className="loading">Opening workspace…</div>;
  if (cloud && !cloudUser) return <div className="login"><div className="brand"><div className="brand-mark">✳</div><div><strong>FORMA</strong><small>idea → execution</small></div></div><section className="card"><div className="eyebrow">YOUR PRIVATE WORKSPACE</div><h1>Make your next idea real.</h1><p>Sign in to save your plans and pick up where you left off on any device.</p><label className="field-label" htmlFor="login-email">EMAIL ADDRESS</label><input id="login-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/><button className="primary full" onClick={signIn}>Email me a sign-in link ↗</button>{loginMessage && <p role="status">{loginMessage}</p>}</section></div>;
  if (cloud && !cloudLoaded) return <div className="loading">Loading your workspace…</div>;
  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">✳</div><div><strong>FORMA</strong><small>idea → execution</small></div></div>
      <div className="side-heading">YOUR WORKSPACE</div>
      <button className="new-button" onClick={add}>＋ &nbsp; New idea <span>↗</span></button>
      <div className="side-heading projects-heading">RECENT IDEAS</div>
      <div className="project-list">{projects.length ? projects.map(p => <button key={p.id} className={'project-link ' + (p.id === active ? 'selected' : '')} onClick={() => { setActive(p.id); setError(''); setFeedbackText(''); }}><span className="project-dot"/><span className="project-name">{p.title || 'Untitled idea'}<small>{date(p.updatedAt)}</small></span></button>) : <p className="side-empty">Your next big thing starts here.</p>}</div>
      <div className="side-footer"><div className="side-footer-icon">✦</div><div><strong>Start with a thought.</strong><span>Leave with a build plan.</span></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> {project ? project.title : 'Overview'}</div><div className="top-actions"><button className="text-button" onClick={() => importRef.current?.click()}>Import</button><input ref={importRef} type="file" accept="application/json" hidden onChange={e => { importProject(e.target.files?.[0]); e.target.value = ''; }}/>{cloudUser && <button className="text-button" onClick={() => cloud.auth.signOut()}>Sign out</button>}<button className="settings-button" onClick={() => setSettings(true)}>⚙ <span>Settings</span></button></div></header>
      {!project ? <section className="empty-state"><div className="eyebrow">THE SPACE BETWEEN WHAT IF AND WHAT'S NEXT</div><h1>Good ideas deserve<br/><em>a clear way forward.</em></h1><p>Turn a rough thought into an approved plan, then build it one verified prompt at a time.</p><button className="primary" onClick={add}>Start a new idea <span>↗</span></button><div className="empty-stages"><span>01 &nbsp; Shape it</span><span>02 &nbsp; Confirm it</span><span>03 &nbsp; Build it</span></div></section> : <div className="workspace">
        <div className="page-head"><div><div className="eyebrow">YOUR PROJECT WORKSPACE · {scopeNames[project.scope].toUpperCase()}</div><h1>{project.step === 'idea' ? 'Start with a spark.' : project.step === 'improve' ? 'Make it stronger.' : project.step === 'decide' ? 'Make the key calls.' : project.step === 'brief' ? 'Get aligned.' : 'Let’s make it real.'}</h1><p>{project.step === 'idea' ? 'Tell us what you want to make. It does not have to be polished.' : project.step === 'improve' ? 'Review each idea on its own terms. Your decisions shape the final plan.' : project.step === 'decide' ? 'A few answers now will make the build instructions much clearer.' : project.step === 'brief' ? 'Edit the plan until it says exactly what you mean. Then confirm it.' : 'Work through one prompt at a time, checking the result before moving on.'}</p></div><div className="head-tools"><button className="outline tiny" onClick={exportProject}>↓ Export</button><button className="outline tiny danger" onClick={remove}>Delete</button></div></div>
        <nav className="steps">{steps.map((s, i) => <button key={s} disabled={!canNavigate(s)} onClick={() => { update({ step:s }); setError(''); }} className={'step ' + (project.step === s ? 'active' : '')}><span>{icon(s)}</span><div><small>0{i+1}</small>{({idea:'The idea',improve:'Improve',decide:'Decisions',brief:'The brief',build:'Build'})[s]}</div></button>)}</nav>
        {error && <div className="alert" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}
        {project.step === 'idea' && <div className="columns"><section className="card wide"><div className="card-number">01 / THE STARTING POINT</div><h2>What are you thinking about?</h2><p>No need for a perfect pitch. Describe what it should do, who it’s for, and anything you already know.</p><textarea className="idea-input" placeholder="I want to create…" value={project.idea} onChange={e => update({ idea: e.target.value, title: project.title === 'Untitled idea' ? 'New idea' : project.title, suggestions: [], questions: [], brief: null, approvedVersion: null, prompts: [] })}/><div className="input-bottom"><button className="text-button" onClick={() => update({ idea: example })}>Try an example ↗</button><span>{project.idea.length} characters</span></div><div className="divider"/><h3>How far do you want to take it?</h3><div className="scope-options">{Object.entries(scopeNames).map(([id, name]) => <button key={id} className={'scope ' + (project.scope === id ? 'chosen' : '')} onClick={() => update({ scope: id, suggestions: [], questions: [], brief: null, approvedVersion: null, prompts: [] })}><span className="radio"/><strong>{name}</strong><small>{id === 'prototype' ? 'Explore the concept' : id === 'mvp' ? 'A real first release' : 'A complete product plan'}</small></button>)}</div><button className="primary full" disabled={!!busy} onClick={analyze}>{busy === 'analyze' ? 'Exploring your idea…' : 'Explore this idea'} <span>↗</span></button></section><aside className="helper"><div className="helper-symbol">✳</div><h3>Every great build starts somewhere.</h3><p>We’ll help you uncover what’s missing, make the important decisions, and turn your thinking into actionable steps.</p><div className="helper-line"/><small>YOUR IDEA STAYS YOURS</small><p>AI suggestions are always optional. Nothing enters the final plan until you approve it.</p></aside></div>}
        {project.step === 'improve' && <div className="columns"><section className="card wide"><div className="card-number">02 / POSSIBILITIES</div><h2>A few ways to sharpen it.</h2><p>Choose what belongs in your idea. Edit a suggestion if you like part of it.</p><div className="suggestions">{project.suggestions.map((s, i) => <div key={s.id + i} className={'suggestion ' + s.status}><div className="suggestion-top"><span className="chip">{s.type}</span><span className="suggestion-index">{String(i+1).padStart(2,'0')}</span></div><textarea aria-label={'Suggestion ' + (i+1)} value={s.text} onChange={e => update({ suggestions: project.suggestions.map((x,j) => j === i ? { ...x, text:e.target.value } : x) })}/><p>{s.reason}</p><div className="suggestion-actions"><button className={s.status === 'accepted' ? 'pill chosen-pill' : 'pill'} onClick={() => update({ suggestions: project.suggestions.map((x,j) => j === i ? { ...x, status: 'accepted' } : x) })}>✓ Accept</button><button className={s.status === 'rejected' ? 'pill rejected-pill' : 'pill'} onClick={() => update({ suggestions: project.suggestions.map((x,j) => j === i ? { ...x, status: 'rejected' } : x) })}>× Pass</button><span>{s.status === 'pending' ? 'Awaiting your decision' : s.status === 'accepted' ? 'Added to the plan' : 'Excluded from the plan'}</span></div></div>)}</div><div className="card-actions"><button className="outline" onClick={() => update({ step:'idea' })}>← Back</button><button className="primary" onClick={() => update({ step:'decide' })}>Continue to decisions <span>↗</span></button></div></section><aside className="helper"><div className="helper-symbol">✧</div><h3>Your judgment comes first.</h3><p>{project.suggestions.filter(s => s.status === 'accepted').length} accepted · {project.suggestions.filter(s => s.status === 'rejected').length} passed · {project.suggestions.filter(s => s.status === 'pending').length} open</p><div className="helper-line"/><p>Unanswered suggestions stay out of the final brief.</p>{project.feasibility?.length > 0 && <><div className="helper-line"/><small>FEASIBILITY TO CHECK</small>{project.feasibility.map((f,i) => <p key={i}><strong>{f.item}:</strong> {f.detail}<br/><span>Fallback: {f.fallback}</span></p>)}</>}</aside></div>}
        {project.step === 'decide' && <div className="columns"><section className="card wide"><div className="card-number">03 / THE DETAILS</div><h2>Make the important calls.</h2><p>Answer what you know. Leave anything uncertain blank and we’ll mark it as an assumption.</p>{project.questions.length ? project.questions.map((q,i) => <div className="question" key={q.id + i}><label htmlFor={'q'+i}><span>{String(i+1).padStart(2,'0')}</span> {q.question}</label><small>{q.why}</small><textarea id={'q'+i} rows={2} placeholder="Your answer (or leave blank for now)" value={project.answers[q.id] || ''} onChange={e => update({ answers: { ...project.answers, [q.id]: e.target.value } })}/></div>) : <p>No further decisions needed yet.</p>}<div className="card-actions"><button className="outline" onClick={() => update({ step:'improve' })}>← Back</button><button className="primary" disabled={!!busy} onClick={makeBrief}>{busy === 'brief' ? 'Framing your idea…' : 'Create my project brief'} <span>↗</span></button></div></section><aside className="helper"><div className="helper-symbol">◇</div><h3>Clear decisions, better prompts.</h3><p>The brief will show unanswered questions as assumptions. You can edit everything before confirming.</p></aside></div>}
        {project.step === 'brief' && <div className="columns"><section className="card wide"><div className="card-number">04 / SOURCE OF TRUTH</div><div className="title-row"><h2>The project brief.</h2><span className="chip">{project.approvedVersion ? `Approved v${project.approvedVersion}` : 'Draft'}</span></div><p>Review and edit this carefully. The build prompts will follow this version exactly.</p><textarea className="brief-input" value={project.brief || ''} onChange={e => replace(reviseBrief(project, e.target.value))}/><div className="brief-meta"><span>{project.versions.length} approved version{project.versions.length === 1 ? '' : 's'} in history</span><span>Changes require approval again</span></div><div className="card-actions"><button className="outline" onClick={() => update({ step:'decide' })}>← Decisions</button><button className="primary" onClick={() => { try { replace(approveBrief(project)); setError(''); } catch(e) { setError(e.message); } }}>Confirm this brief <span>✓</span></button></div>{project.versions.length > 0 && <details className="history"><summary>Previously approved versions</summary>{project.versions.map(v => <details key={v.version}><summary>Version {v.version} · {date(v.at)}</summary><pre>{v.text}</pre></details>)}</details>}</section><aside className="helper"><div className="helper-symbol">▤</div><h3>This is your checkpoint.</h3><p>Only the confirmed version can generate build prompts. Later changes create a new draft and clear prompts that no longer match.</p></aside></div>}
        {project.step === 'build' && <div className="columns"><section className="card wide"><div className="card-number">05 / MAKE IT REAL · APPROVED BRIEF V{project.approvedVersion}</div><h2>Build with direction.</h2><p>Choose where you’ll use the prompts. Each step has a specific outcome and a review before moving ahead.</p>{!project.prompts.length ? <><label className="field-label" htmlFor="destination">WHERE WILL YOU BUILD?</label><select id="destination" value={project.destination} onChange={e => update({ destination:e.target.value })}>{Object.entries(destinations).map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select><button className="primary full" disabled={!!busy} onClick={generate}>{busy === 'roadmap' ? 'Creating your roadmap…' : 'Generate build roadmap'} <span>↗</span></button></> : <><div className="roadmap-progress"><span>STEP {Math.min(project.currentPrompt+1, project.prompts.length)} OF {project.prompts.length}</span><div className="meter"><div style={{ width: `${project.currentPrompt/project.prompts.length*100}%` }}/></div><strong>{Math.round(project.currentPrompt/project.prompts.length*100)}%</strong></div><div className="roadmap-list">{project.prompts.map((p,i) => <div key={i} className={'roadmap-item ' + (i === project.currentPrompt ? 'current' : '')}><span>{i < project.currentPrompt ? '✓' : String(i+1).padStart(2,'0')}</span><span>{p.title}</span><small>{i < project.currentPrompt ? 'Checked' : i === project.currentPrompt ? 'In progress' : 'Up next'}</small></div>)}</div>{current ? <div className="current-prompt"><div className="prompt-header"><span className="chip">CURRENT PROMPT</span><button className="text-button" onClick={async () => { await navigator.clipboard.writeText(current.prompt); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>{copied ? 'Copied ✓' : 'Copy prompt ↗'}</button></div><h3>{current.title}</h3>{current.goal && <p>{current.goal}</p>}<pre>{current.prompt}</pre><h4>What to check</h4><ul>{current.checks.map((c,i) => <li key={i}>{c}</li>)}</ul><div className="divider"/><h4>What happened when you used it?</h4><textarea rows={5} placeholder="Paste the builder’s response, specific test results, or error details. A claim that it’s done alone may need more evidence." value={feedbackText} onChange={e => setFeedbackText(e.target.value)}/><button className="primary full" disabled={!!busy} onClick={evaluate}>{busy === 'evaluate' ? 'Reviewing the result…' : 'Review this result'} <span>↗</span></button>{lastReview && <div className="review-result"><strong>{lastReview.passed ? 'Step verified' : 'More work needed'}</strong><p>{lastReview.explanation}</p>{lastReview.repairPrompt && <><h4>Use this repair prompt</h4><pre>{lastReview.repairPrompt}</pre><button className="text-button" onClick={() => navigator.clipboard.writeText(lastReview.repairPrompt)}>Copy repair prompt ↗</button></>}</div>}</div> : <div className="complete"><span>✳</span><h3>Roadmap complete.</h3><p>All steps have been reviewed. Export your project to keep a copy of the prompts and history.</p></div>}<div className="change-panel"><h3>Need to change the plan?</h3><p>See what the change affects before replacing the approved brief.</p><textarea rows={2} placeholder="For example: add user accounts and private projects" value={changeText} onChange={e => setChangeText(e.target.value)}/><button className="outline" disabled={!!busy || !changeText.trim()} onClick={impact}>{busy === 'impact' ? 'Checking impact…' : 'Preview change impact'}</button>{changePreview && <div className="impact"><strong>{changePreview.summary}</strong><ul>{(changePreview.affected || []).map((x,i) => <li key={i}>{x}</li>)}</ul><button className="primary" onClick={() => { replace(reviseBrief(project, changePreview.suggestedBrief)); setChangePreview(null); setChangeText(''); }}>Review revised brief ↗</button></div>}</div></>}</section><aside className="helper"><div className="helper-symbol">▣</div><h3>One step at a time.</h3><p>Copy the current prompt into {destinations[project.destination]}. Bring the result back here, and we’ll review what to do next.</p><div className="helper-line"/><small>STAY IN CONTROL</small><p>Every prompt uses your approved project brief. Your pasted results guide the next step.</p></aside></div>}
      </div>}
    </main>
    {settings && <div className="modal-backdrop" onClick={() => setSettings(false)}><div className="modal" role="dialog" aria-modal="true" aria-label="Settings" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setSettings(false)}>×</button><div className="card-number">WORKSPACE SETTINGS</div><h2>AI connection</h2><p>If the site owner configured a server key, enter the access code they gave you. Otherwise you can use your own Gemini API key for this browser session.</p><label htmlFor="access">App access code</label><input id="access" type="password" autoComplete="off" value={accessCode} onChange={e => setAccessCode(e.target.value)} placeholder="Optional if using your own key"/><label htmlFor="key">Your Gemini API key</label><input id="key" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder="Optional if the site has a protected key"/><p className="setting-note">Keys and access codes are kept only in this tab’s memory. Project drafts are saved in this browser. Export them to keep a backup.</p><button className="primary full" onClick={() => setSettings(false)}>Done</button></div></div>}
  </div>;
}
