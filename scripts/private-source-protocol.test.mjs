import assert from 'node:assert/strict';
import test from 'node:test';
import { qualification, receiptRecovery, inspectRunIdentity, inspectDispatchOwnership, admittedRun, sha256, verifyReceipt } from './private-source-protocol.mjs';

const target = { id: 91, repository: 'moabualruz/rice-mods', head: 'a'.repeat(40), source: 'moabualruz/rice-session-accounts', protocol: qualification };
const native = { id: 91, repository: { full_name: target.repository }, head_sha: target.head, head_branch: 'main', event: 'workflow_dispatch', path: qualification.workflow, run_attempt: 1, display_title: `${qualification.title}: ${target.source}`, status: 'completed', conclusion: 'success', created_at: '2026-11-14T00:00:00Z', updated_at: '2026-11-14T00:00:01Z' };

test('native run admission requires every exact identity field', () => {
  assert.deepEqual(inspectRunIdentity(native, target), []);
  assert.equal(admittedRun(native, target).id, 91);
  for (const field of ['id', 'head_sha', 'head_branch', 'event', 'path', 'run_attempt', 'display_title']) {
    assert.throws(() => admittedRun({ ...native, [field]: 'different' }, target), /identity mismatch/);
  }
  assert.throws(() => admittedRun({ ...native, repository: { full_name: 'foreign/repository' } }, target), /identity mismatch/);
  assert.throws(() => admittedRun(native, { ...target, protocol: receiptRecovery }), /identity mismatch/);
});

test('mismatch facts preserve predicate evidence without provider strings', () => {
  const privateBody = 'fixture-provider-body-must-not-be-retained';
  const facts = inspectRunIdentity({ ...native, display_title: privateBody, path: null, run_attempt: undefined }, target);
  assert.deepEqual(facts.map(v => v.field), ['path', 'run_attempt', 'display_title']);
  assert.equal(facts[1].present, false);
  assert.equal(facts[2].actualSHA256, sha256(JSON.stringify(privateBody)));
  assert.ok(!JSON.stringify(facts).includes(privateBody));
});

test('receipt equality refuses missing, foreign and additional fields', () => {
  const expected = { version: 1, runID: 91, runAttempt: 1, tokenSHA256: sha256('fixture-current-value') };
  verifyReceipt({ ...expected }, expected);
  for (const value of [{ ...expected, runAttempt: 2 }, { ...expected, tokenSHA256: sha256('fixture-foreign-value') }, { ...expected, extra: true }, { ...expected, runID: undefined }]) assert.throws(() => verifyReceipt(value, expected), /receipt mismatch/);
});

test('native handles must be new since the recorded dispatch intent', () => {
  const scope = { beforeRunIDs: [11, 12], attemptedAt: '2026-11-13T23:59:59Z', createdAt: native.created_at };
  assert.deepEqual(inspectDispatchOwnership(native, scope), []);
  assert.equal(inspectDispatchOwnership(native, { ...scope, beforeRunIDs: [91] })[0].field, 'dispatch_baseline');
  assert.equal(inspectDispatchOwnership({ ...native, created_at: '2026-11-13T00:00:00Z' }, scope)[0].field, 'dispatch_created_at');
  assert.equal(inspectDispatchOwnership({ ...native, created_at: '2026-11-14T00:00:02Z' }, scope)[0].field, 'immutable_created_at');
});
