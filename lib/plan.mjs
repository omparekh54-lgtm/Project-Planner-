export function composePlan(context) {
  const idea = String(context.originalIdea || '').trim();
  const scope = String(context.scope || 'Usable MVP').trim();
  const accepted = Array.isArray(context.acceptedSuggestions) ? context.acceptedSuggestions.filter(s => typeof s === 'string' && s.trim()) : [];
  const rejected = Array.isArray(context.rejectedSuggestions) ? context.rejectedSuggestions.filter(s => typeof s === 'string' && s.trim()) : [];
  const questions = Array.isArray(context.openQuestions) ? context.openQuestions.filter(q => typeof q?.question === 'string' && q.question.trim()) : [];
  const feasibility = Array.isArray(context.feasibility) ? context.feasibility.filter(f => typeof f?.item === 'string' && f.item.trim()) : [];
  const list = values => values.length ? values.map(s => `- ${s.trim()}`).join('\n') : '- None specified.';

  return [
    '# Project plan',
    '## Original idea', idea,
    '## Goal and scope', `Build a ${scope.toLowerCase()} based on the original idea and the choices below.`,
    '## Intended users', 'Use the people described in the original idea. If none are named, confirm the target users during the build.',
    '## Approved improvements', list(accepted),
    '## Excluded suggestions', list(rejected),
    '## Open decisions and assumptions', questions.length ? questions.map(q => `- ${q.question.trim()} — decide during the build; do not assume an answer.`).join('\n') : '- Do not assume unspecified requirements; record decisions as they arise.',
    '## Feasibility checks', feasibility.length ? feasibility.map(f => `- ${f.item.trim()}: ${String(f.detail || 'Verify before implementation').trim()}${f.fallback ? `; fallback: ${String(f.fallback).trim()}` : ''}`).join('\n') : '- Validate external services and technical constraints before depending on them.',
    '## Acceptance criteria', '- The core journey described in the original idea works end to end.\n- Approved improvements are included; excluded suggestions are left out.\n- Important assumptions are identified and checked.\n- Errors and incomplete states are handled clearly.'
  ].join('\n\n');
}
