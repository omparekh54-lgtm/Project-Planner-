import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, approveBrief, reviseBrief, acceptSuggestions, choicesComplete, canGenerate, registerEvaluation, steps } from '../lib/workflow.mjs';

test('only accepted suggestions enter brief input', () => {
  const p = newProject(); p.suggestions = [{ text: 'Add accounts', status: 'rejected' }, { text: 'Add expiry', status: 'accepted' }];
  assert.deepEqual(acceptSuggestions(p), ['Add expiry']);
});
test('all suggestions must be accepted or passed before generating a plan', () => {
  const p = newProject();
  assert.deepEqual(steps, ['idea', 'improve', 'build']);
  assert.equal(choicesComplete(p), false);
  p.suggestions = [{ text: 'Add accounts', status: 'pending' }, { text: 'Add expiry', status: 'accepted' }];
  assert.equal(choicesComplete(p), false);
  p.suggestions[0].status = 'rejected';
  assert.equal(choicesComplete(p), true);
  assert.deepEqual(acceptSuggestions(p), ['Add expiry']);
});
test('approval versions the brief and edits invalidate generated prompts', () => {
  const p = newProject(); p.brief = 'Build an expiry-aware file transfer app.';
  const approved = approveBrief(p);
  assert.equal(approved.approvedVersion, 1);
  assert.equal(canGenerate(approved), true);
  const changed = reviseBrief({ ...approved, prompts: [{ title: 'Build it' }] }, 'Add login.');
  assert.equal(changed.approvedVersion, null);
  assert.equal(changed.prompts.length, 0);
  assert.equal(canGenerate(changed), false);
});
test('failed review keeps current step and successful review advances', () => {
  const p = newProject(); p.prompts = [{ title: 'One' }, { title: 'Two' }];
  const failed = registerEvaluation(p, { passed: false, repairPrompt: 'Fix the missing form.' }, 'The form is missing');
  assert.equal(failed.currentPrompt, 0);
  assert.equal(registerEvaluation(failed, { passed: true }, 'Done').currentPrompt, 1);
});
