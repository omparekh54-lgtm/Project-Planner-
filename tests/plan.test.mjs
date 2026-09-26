import test from 'node:test';
import assert from 'node:assert/strict';
import { composePlan } from '../lib/plan.mjs';

test('plan keeps the original idea, chosen improvements and open decisions distinct', () => {
  const plan = composePlan({ originalIdea: 'Let students turn class notes into practice quizzes.', scope: 'Usable MVP', acceptedSuggestions: ['Track learning progress'], rejectedSuggestions: ['Add classroom chat'], openQuestions: [{ question: 'Should a quiz have a time limit?' }], feasibility: [] });
  assert.match(plan, /Let students turn class notes into practice quizzes/);
  assert.match(plan, /## Approved improvements\n\n- Track learning progress/);
  assert.match(plan, /## Excluded suggestions\n\n- Add classroom chat/);
  assert.match(plan, /Should a quiz have a time limit\? — decide during the build/);
  assert.match(plan, /## Acceptance criteria/);
});
