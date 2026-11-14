import { createHash } from 'node:crypto';

export const qualification = { kind: 'qualification', workflow: '.github/workflows/private-source-qualification.yml', title: 'Private source qualification', job: 'qualify', marker: 'mods-source-token-receipt:' };
export const receiptRecovery = { kind: 'receipt-recovery', workflow: '.github/workflows/private-source-receipt.yml', title: 'Private source receipt recovery', job: 'receipt', marker: 'mods-source-recovery-receipt:' };
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const exactCommit = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
export const exactDigest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
export const positiveID = value => Number.isSafeInteger(value) && value > 0;

export function inspectRunIdentity(run, { id, repository, head, source, protocol }) {
  const expected = { id, repository, head_sha: head, head_branch: 'main', event: 'workflow_dispatch', path: protocol.workflow, run_attempt: 1, display_title: `${protocol.title}: ${source}` };
  const actual = { ...run, repository: run?.repository?.full_name };
  return Object.entries(expected).filter(([field, value]) => actual[field] !== value || (field === 'id' && !positiveID(value))).map(([field, value]) => {
    const observed = actual[field];
    const encoded = observed === undefined ? 'undefined' : JSON.stringify(observed);
    return { field, present: observed !== undefined && observed !== null, type: observed === null ? 'null' : typeof observed, bytes: Buffer.byteLength(encoded), actualSHA256: sha256(encoded), expectedSHA256: sha256(value === undefined ? 'undefined' : JSON.stringify(value)) };
  });
}

export function admittedRun(run, target) {
  if (inspectRunIdentity(run, target).length) throw new Error('run identity mismatch');
  const status = ['queued', 'in_progress', 'completed', 'waiting', 'pending', 'requested'].includes(run.status) ? run.status : 'unknown';
  const conclusion = [null, 'success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required', 'stale', 'startup_failure'].includes(run.conclusion) ? run.conclusion : 'unknown';
  const time = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
  return { id: target.id, attempt: 1, status, conclusion, head: target.head, repository: target.repository, workflow: target.protocol.workflow, event: 'workflow_dispatch', createdAt: time(run.created_at), updatedAt: time(run.updated_at), url: `https://github.com/${target.repository}/actions/runs/${target.id}` };
}

export function verifyReceipt(receipt, expected) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || Object.keys(receipt).length !== Object.keys(expected).length || Object.entries(expected).some(([key, value]) => receipt[key] !== value)) throw new Error('token ownership receipt mismatch');
}
