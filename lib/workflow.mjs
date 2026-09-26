export const steps = ['idea', 'improve', 'build'];
export const scopeNames = { prototype: 'Quick prototype', mvp: 'Usable MVP', full: 'Full product' };
export const destinations = { lovable: 'Lovable', codex: 'Codex', cursor: 'Cursor', developer: 'Developer' };
export function newProject() {
  return { id: crypto.randomUUID(), title: 'Untitled idea', idea: '', scope: 'mvp', destination: 'lovable', step: 'idea', suggestions: [], questions: [], answers: {}, feasibility: [], brief: null, versions: [], approvedVersion: null, prompts: [], currentPrompt: 0, feedback: [], createdAt: Date.now(), updatedAt: Date.now() };
}
export function approveBrief(project) {
  if (!project.brief?.trim()) throw new Error('Write a project brief before confirming it.');
  const version = project.versions.length + 1;
  return { ...project, approvedVersion: version, versions: [...project.versions, { version, text: project.brief, at: Date.now() }], prompts: [], currentPrompt: 0, feedback: [], step: 'build', updatedAt: Date.now() };
}
export function reviseBrief(project, text) {
  if (!text?.trim()) throw new Error('The brief cannot be empty.');
  return { ...project, brief: text, approvedVersion: null, prompts: [], currentPrompt: 0, feedback: [], step: 'brief', updatedAt: Date.now() };
}
export function acceptSuggestions(project) {
  return project.suggestions.filter(s => s.status === 'accepted').map(s => s.text);
}
export function choicesComplete(project) {
  return project.suggestions.length > 0 && project.suggestions.every(s => s.status === 'accepted' || s.status === 'rejected');
}
export function canGenerate(project) {
  return Boolean(project.approvedVersion && project.versions.some(v => v.version === project.approvedVersion) && project.prompts.length === 0);
}
export function registerEvaluation(project, result, submitted) {
  const index = project.currentPrompt;
  if (!project.prompts[index]) throw new Error('No current prompt.');
  const entry = { step: index, at: Date.now(), submitted, passed: result.passed === true, explanation: result.explanation || '', repairPrompt: result.repairPrompt || '' };
  return { ...project, feedback: [...project.feedback, entry], currentPrompt: result.passed === true ? Math.min(index + 1, project.prompts.length) : index, updatedAt: Date.now() };
}
