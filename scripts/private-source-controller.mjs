import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { validateMarketplaceLock } from './marketplace-lock.mjs';
import { trustedHostExecutable } from './private-source-host.mjs';
import { qualification, receiptRecovery, sha256, exactCommit, exactDigest, positiveID, inspectRunIdentity, admittedRun, verifyReceipt } from './private-source-protocol.mjs';

const require = createRequire(import.meta.url);
async function installedDeliveryLease({ repository, run }) {
  const toolkit = realpathSync(join(homedir(), '.local/share/rice-observe/workspace-toolkit/current/workspace'));
  const { withRiceDeliveryLease } = require(join(toolkit, 'scripts/lib/rice-delivery-lease.js'));
  return withRiceDeliveryLease({ repository, root: toolkit, run });
}

export async function runPrivateSourceController({ mode, bindingFile, directory, originalBindingFile, originalDirectory, withDeliveryLease = installedDeliveryLease, nativeGH }) {
const token = process.env.RICE_RELEASE_DOWNLOAD_TOKEN || '';
const expires = Date.parse(process.env.RICE_RELEASE_DOWNLOAD_TOKEN_EXPIRES_AT || '');
delete process.env.RICE_RELEASE_DOWNLOAD_TOKEN;
delete process.env.RICE_RELEASE_DOWNLOAD_TOKEN_EXPIRES_AT;
delete process.env.GH_TOKEN;
delete process.env.GITHUB_TOKEN;
delete process.env.MISE_GITHUB_TOKEN;
const repo = 'moabualruz/rice-mods';
const productRoot = fileURLToPath(new URL('../', import.meta.url));
const selectedGH = nativeGH || trustedHostExecutable('gh');
const ghBinary = realpathSync(selectedGH.path);
const ghInfo = lstatSync(ghBinary);
if (!ghInfo.isFile() || (ghInfo.uid !== process.getuid() && ghInfo.uid !== 0) || (ghInfo.mode & 0o022)) throw new Error('trusted native gh installation required');
const ghSHA256 = createHash('sha256').update(readFileSync(ghBinary)).digest('hex');
if (ghSHA256 !== selectedGH.sha256) throw new Error('trusted native gh digest required');
if (!['operate', 'recover', 'receipt-recover'].includes(mode) || !bindingFile || !directory) {
  console.error('usage: node private-source-controller.mjs operate|recover|receipt-recover BINDING_JSON OPERATION_DIRECTORY [ORIGINAL_BINDING ORIGINAL_OPERATION]');
  return 64;
}
const dir = resolve(directory);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const directoryInfo = lstatSync(dir);
if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || directoryInfo.uid !== process.getuid() || (directoryInfo.mode & 0o077)) throw new Error('operation directory must be private and owned');
const stateFile = join(dir, 'operation.json');
const digest = sha256;
function ownedJSON(path, privateMode = false) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & (privateMode ? 0o077 : 0o022)) || info.size > 512 * 1024) throw new Error('owned bounded operation metadata required');
  const bytes = readFileSync(path);
  let value;
  try { value = JSON.parse(bytes); } catch { throw new Error('operation metadata JSON invalid'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('operation metadata object required');
  return { value, sha256: digest(bytes) };
}
const load = () => existsSync(stateFile) ? ownedJSON(stateFile, true).value : null;
const previous = load();
const protocol = mode === 'receipt-recover' || (mode === 'recover' && previous?.kind === receiptRecovery.kind) ? receiptRecovery : qualification;
const workflow = protocol.workflow;
const workflowName = workflow.split('/').at(-1);
const workflowSHA256 = digest(readFileSync(new URL('../' + workflow, import.meta.url)));
const secret = 'MODS_SOURCE_READ_TOKEN';
const entries = validateMarketplaceLock(
  JSON.parse(readFileSync(new URL('../.claude-plugin/marketplace.json', import.meta.url), 'utf8')),
  readFileSync(new URL('../README.md', import.meta.url), 'utf8'),
  JSON.parse(readFileSync(new URL('../.claude-plugin/marketplace.lock.json', import.meta.url), 'utf8')),
);
const privateRepositories = JSON.parse(readFileSync(new URL('./private-repositories.json', import.meta.url), 'utf8'));
if (!Array.isArray(privateRepositories) || !privateRepositories.every(value => typeof value === 'string')) throw new Error('invalid private repository allowlist');
const bindingRecord = ownedJSON(bindingFile);
const binding = bindingRecord.value;
const source = binding.sourceRepository;
const head = binding.head;
const entry = entries.find(value => value.repo === source);
const bindingFields = new Set(['repository', 'sourceRepository', 'sourceCommit', 'sourceLimitsBlob', 'head', 'workflowSHA256', 'requiredCIRunID', 'requiredCIAttempt', ...(protocol === receiptRecovery ? ['originalBindingSHA256', 'originalOperationSHA256'] : ['helperDeliveryRef'])]);
if (binding.repository !== repo || !entry || !privateRepositories.includes(source) ||
    binding.sourceCommit !== entry.commit || binding.sourceLimitsBlob !== entry.limits ||
    !/^[0-9a-f]{40}$/.test(head || '') || binding.workflowSHA256 !== workflowSHA256 ||
    !Number.isSafeInteger(binding.requiredCIRunID) || binding.requiredCIRunID <= 0 ||
    !Number.isSafeInteger(binding.requiredCIAttempt) || binding.requiredCIAttempt < 1 ||
    Object.keys(binding).some(field => !bindingFields.has(field)) ||
    (protocol === receiptRecovery ? !exactDigest(binding.originalBindingSHA256) || !exactDigest(binding.originalOperationSHA256) : typeof binding.helperDeliveryRef !== 'string' || !binding.helperDeliveryRef)) {
  throw new Error('binding: exact delivery and native lease references required');
}
// The installed repository-wide native keeper owns provider custody; binding strings grant none.
const bindingSHA256 = bindingRecord.sha256;
if (previous && previous.bindingSHA256 !== bindingSHA256) throw new Error('binding changed');
function save(patch) {
  const current = load();
  if (current && current.bindingSHA256 !== bindingSHA256) throw new Error('binding changed');
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  const temporary = join(dir, '.operation-' + randomUUID() + '.json');
  writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(temporary, stateFile);
  return next;
}
if (mode !== 'recover' && previous) throw new Error('operation already exists; use recovery, never redispatch');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const failure = (phase, result) => Object.assign(new Error(`phase=${phase} exit=${result.code} timeout=${result.timeout} output_bytes=${result.bytes} output_sha256=${result.sha256}`), { phase });
const birth = pid => spawnSync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' }).stdout.trim();
function stopOwned(command) {
  if (!command || !command.birth || birth(command.pid) !== command.birth) return;
  try { process.kill(-command.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
}
let activeChild;
let cancelled = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  cancelled = true;
  if (activeChild) {
    const command = activeChild;
    stopOwned(command);
    setTimeout(() => { if (birth(command.pid) === command.birth) { try { process.kill(-command.pid, 'SIGKILL'); } catch {} } }, 2_000).unref();
  }
});

let assertProviderCustody = () => { throw new Error('native repository custody unavailable'); };
async function gh(phase, args, { stdin, limit = 30_000, allowFailure = false } = {}) {
  assertProviderCustody();
  if (ownedJSON(bindingFile).sha256 !== bindingSHA256) throw new Error('binding changed during operation');
  if (createHash('sha256').update(readFileSync(ghBinary)).digest('hex') !== ghSHA256) throw new Error('native gh installation changed');
  let output = Buffer.alloc(0);
  let bytes = 0;
  const hash = createHash('sha256');
  const child = spawn(ghBinary, args, { detached: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat', NO_COLOR: '1' } });
  const command = { pid: child.pid, birth: child.pid ? birth(child.pid) : '', phase, startedAt: new Date().toISOString() };
  if (!command.pid || !command.birth) { child.kill(); throw new Error(`phase=${phase} command identity unavailable`); }
  activeChild = command;
  save({ activeCommand: command });
  const collect = part => { bytes += part.length; hash.update(part); if (output.length + part.length <= 2 * 1024 * 1024) output = Buffer.concat([output, part]); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.stdin.on('error', () => {});
  child.stdin.end(stdin);
  let timeout = false;
  const timer = setTimeout(() => { timeout = true; stopOwned(command); }, limit);
  const hardStop = setTimeout(() => { if (birth(command.pid) === command.birth) { try { process.kill(-command.pid, 'SIGKILL'); } catch {} } }, limit + 2_000);
  const code = await new Promise(resolve => { child.on('error', () => resolve(127)); child.on('close', code => resolve(code ?? 128)); });
  clearTimeout(timer); clearTimeout(hardStop);
  activeChild = null;
  const result = { code, timeout, bytes, sha256: hash.digest('hex') };
  save({ activeCommand: null, lastCommand: { phase, ...result } });
  if (code !== 0 && !allowFailure) throw failure(phase, result);
  if (bytes > 2 * 1024 * 1024) throw failure(phase, result);
  // Native CLI output stays in memory. Persist only allowlisted decoded metadata.
  return { ...result, text: output.toString('utf8') };
}
async function api(phase, path, options) { return JSON.parse((await gh(phase, ['api', path], options)).text); }
async function secretMetadata() {
  const value = await api('secret-metadata', `repos/${repo}/actions/secrets?per_page=100`);
  if (value.total_count > 100 || !Array.isArray(value.secrets)) throw new Error('secret inventory must fit one native page');
  const item = value.secrets.find(v => v.name === secret);
  if (item && ![item.created_at, item.updated_at].every(value => typeof value === 'string' && Number.isFinite(Date.parse(value)))) throw new Error('secret metadata timestamps unavailable');
  return item ? { name: item.name, created_at: item.created_at, updated_at: item.updated_at } : null;
}
const sameSecret = (a, b) => a && b && a.name === b.name && a.created_at === b.created_at && a.updated_at === b.updated_at;
function originalSnapshot() {
  const reference = load()?.original || { bindingFile: originalBindingFile, directory: originalDirectory };
  if (typeof reference.bindingFile !== 'string' || typeof reference.directory !== 'string' || resolve(reference.bindingFile) !== reference.bindingFile || resolve(reference.directory) !== reference.directory || reference.directory === dir) throw new Error('exact original operation references required');
  const info = lstatSync(reference.directory);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077)) throw new Error('original operation must be private and owned');
  const originalBinding = ownedJSON(reference.bindingFile);
  const originalState = ownedJSON(join(reference.directory, 'operation.json'), true);
  if (originalBinding.sha256 !== binding.originalBindingSHA256 || originalState.sha256 !== binding.originalOperationSHA256) throw new Error('original immutable operation changed');
  const b = originalBinding.value, s = originalState.value;
  const fields = ['repository', 'sourceRepository', 'sourceCommit', 'sourceLimitsBlob', 'head', 'workflowSHA256', 'requiredCIRunID', 'requiredCIAttempt', 'helperDeliveryRef'];
  if (Object.keys(b).length !== fields.length || Object.keys(b).some(key => !fields.includes(key)) || b.repository !== repo || b.sourceRepository !== source || b.sourceCommit !== entry.commit || b.sourceLimitsBlob !== entry.limits || !exactCommit(b.head) || !exactDigest(b.workflowSHA256) || !positiveID(b.requiredCIRunID) || !positiveID(b.requiredCIAttempt) || typeof b.helperDeliveryRef !== 'string' || !b.helperDeliveryRef) throw new Error('original source binding mismatch');
  if (s.version !== 1 || (s.kind && s.kind !== qualification.kind) || s.bindingSHA256 !== originalBinding.sha256 || s.repository !== repo || s.sourceRepository !== source || s.sourceCommit !== entry.commit || s.sourceLimitsBlob !== entry.limits || s.head !== b.head || s.workflow !== qualification.workflow || s.secret !== secret || !exactDigest(s.tokenSHA256) || s.custody?.repository !== repo || s.custody?.kind !== 'native-repository-delivery-lease' || s.activeCommand !== null || s.controllerExit !== 1 || !Number.isFinite(Date.parse(s.controllerEndedAt)) || !Number.isFinite(Date.parse(s.setAttemptedAt)) || !Number.isFinite(Date.parse(s.dispatchAttemptedAt)) || s.secretDeletedAt || !positiveID(s.run?.id) || s.run.attempt !== 1 || s.run.head !== b.head || s.run.repository !== repo || s.run.workflow !== qualification.workflow || s.run.event !== 'workflow_dispatch' || s.secretOwned?.name !== secret || ![s.secretOwned.created_at, s.secretOwned.updated_at].every(value => typeof value === 'string' && Number.isFinite(Date.parse(value)))) throw new Error('original failed operation authority mismatch');
  return { binding: b, state: s, reference: { bindingFile: reference.bindingFile, directory: reference.directory } };
}
async function verifyOriginalOperation() {
  const original = originalSnapshot();
  const content = await api('original-workflow', `repos/${repo}/contents/${qualification.workflow}?ref=${original.binding.head}`);
  if (content.encoding !== 'base64' || digest(Buffer.from(content.content, 'base64')) !== original.binding.workflowSHA256) throw new Error('original workflow digest mismatch');
  const run = await admitRun(original.state.run.id, 'original-run', { targetHead: original.binding.head, targetProtocol: qualification });
  if (run.status !== 'completed') throw new Error('original operation run must be terminal');
  return original;
}
async function verifyDeliveredSource() {
  const commit = await api('delivered-commit', `repos/${repo}/git/commits/${head}`);
  if (commit.sha !== head || !/^[0-9a-f]{40}$/.test(commit.tree?.sha || '')) throw new Error('delivered commit identity mismatch');
  const tree = await api('delivered-tree', `repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated !== false || !Array.isArray(tree.tree)) throw new Error('complete delivered source tree required');
  const paths = ['.claude-plugin/marketplace.json', '.claude-plugin/marketplace.lock.json', 'README.md', 'scripts/private-repositories.json', 'scripts/plugin-source-check.sh', 'scripts/marketplace-lock.mjs', 'release-packages/scripts/plugin.sh', 'release-packages/scripts/vendor-lock.sh', 'release-packages.lock', 'vendir.yml', 'vendir.lock.yml', 'scripts/private-source-controller.mjs', 'scripts/private-source-protocol.mjs', 'scripts/private-source-qualification.sh', 'scripts/private-source-host.json', 'scripts/private-source-host.mjs', '.github/workflows/ci.yml', qualification.workflow, receiptRecovery.workflow];
  for (const path of paths) {
    const info = lstatSync(join(productRoot, path));
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('regular delivered source file required');
    const bytes = readFileSync(join(productRoot, path));
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    const matching = tree.tree.filter(value => value.path === path);
    if (matching.length !== 1 || matching[0].type !== 'blob' || matching[0].sha !== blob || matching[0].mode !== (info.mode & 0o111 ? '100755' : '100644')) throw new Error('local source differs from exact delivered head');
  }
}
async function verifyCurrentDelivery() {
  const repository = await api('repository', `repos/${repo}`);
  if (repository.full_name !== repo || repository.private !== true || repository.default_branch !== 'main' || repository.permissions?.admin !== true) throw new Error('destination repository identity mismatch');
  const branch = await api('main-head', `repos/${repo}/git/ref/heads/main`);
  if (branch.object?.sha !== head) throw new Error('delivered head moved');
  await verifyDeliveredSource();
  const content = await api('workflow-content', `repos/${repo}/contents/${workflow}?ref=${head}`);
  if (content.encoding !== 'base64' || digest(Buffer.from(content.content, 'base64')) !== workflowSHA256) throw new Error('workflow digest mismatch');
  const ci = await api('required-ci', `repos/${repo}/actions/runs/${binding.requiredCIRunID}`);
  const ordinaryWorkflow = await api('ordinary-ci-workflow', `repos/${repo}/actions/workflows/ci.yml`);
  if (ci.head_sha !== head || ci.repository?.full_name !== repo || ci.status !== 'completed' || ci.conclusion !== 'success' || ci.name !== 'CI' || ci.path !== '.github/workflows/ci.yml' || ci.event !== 'push' || ci.head_branch !== 'main' || ci.run_attempt !== binding.requiredCIAttempt || !positiveID(ordinaryWorkflow.id) || ci.workflow_id !== ordinaryWorkflow.id) throw new Error('exact required CI is not successful');
}
async function verifyTokenReceipt(run) {
  const jobs = await api('receipt-jobs', `repos/${repo}/actions/runs/${run.id}/attempts/${run.attempt}/jobs?per_page=100`);
  if (!Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length) throw new Error('complete receipt job inventory required');
  const matches = jobs.jobs.filter(value => value.name === protocol.job && value.run_id === run.id && value.head_sha === head);
  if (matches.length !== 1 || !positiveID(matches[0].id)) throw new Error('exact receipt-producing job required');
  const job = matches[0];
  if (protocol === receiptRecovery && (run.status !== 'completed' || run.conclusion !== 'success' || job.status !== 'completed' || job.conclusion !== 'success')) throw new Error('receipt recovery must complete successfully');
  const logs = await gh('token-receipt', ['api', `repos/${repo}/actions/jobs/${job.id}/logs`]);
  const markers = [...logs.text.matchAll(new RegExp(protocol.marker + '({[^\\r\\n]*})', 'g'))];
  if (markers.length !== 1) throw new Error('token ownership receipt missing or ambiguous');
  const receipt = JSON.parse(markers[0][1]);
  const expected = { version: 1, repository: repo, head, workflow, sourceRepository: source, sourceCommit: entry.commit, runID: run.id, runAttempt: run.attempt, job: protocol.job, tokenSHA256: load().tokenSHA256 };
  if (protocol === receiptRecovery) {
    const original = originalSnapshot();
    Object.assign(expected, { kind: 'current-secret-value', originalBindingSHA256: binding.originalBindingSHA256, originalHead: original.binding.head, originalWorkflowSHA256: original.binding.workflowSHA256, originalRunID: original.state.run.id, originalRunAttempt: original.state.run.attempt });
  }
  verifyReceipt(receipt, expected);
  save({ tokenReceipt: { ...expected, jobID: job.id } });
}
async function runs() {
  const result = await api('dispatch-inventory', `repos/${repo}/actions/workflows/${workflowName}/runs?event=workflow_dispatch&branch=main&head_sha=${head}&per_page=100`);
  if (result.total_count > 100 || !Array.isArray(result.workflow_runs)) throw new Error('dispatch inventory exceeds bounded page');
  return result.workflow_runs;
}
async function admitRun(id, phase, { publication = false, targetHead = head, targetProtocol = protocol } = {}) {
  if (!positiveID(id)) throw new Error('exact native run ID required');
  const target = { id, repository: repo, head: targetHead, source, protocol: targetProtocol };
  const deadline = Date.now() + (publication ? 10_000 : 30_000);
  for (let attempt = 0; attempt < (publication ? 7 : 1); attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const value = await api(phase, `repos/${repo}/actions/runs/${id}`, { limit: remaining });
    const mismatches = inspectRunIdentity(value, target);
    if (!mismatches.length) return admittedRun(value, target);
    const facts = { at: new Date().toISOString(), phase, runID: id, fields: mismatches };
    save({ ...(load().firstRunIdentityMismatch ? {} : { firstRunIdentityMismatch: facts }), runIdentityMismatches: [...(load().runIdentityMismatches || []), facts].slice(-7) });
    if (!publication || cancelled || attempt === 6 || deadline - Date.now() <= 1_000) break;
    await sleep(1_000);
  }
  throw new Error('run identity mismatch');
}
async function discoverRun(publication = false) {
  const state = load();
  if (state.run) return state.run;
  const candidates = (await runs()).filter(v => !state.beforeRunIDs.includes(v.id) && Date.parse(v.created_at) >= Math.floor(Date.parse(state.dispatchAttemptedAt) / 1000) * 1000);
  if (candidates.length > 1) throw new Error('ambiguous dispatch handle; no redispatch');
  if (candidates.length === 1) { const run = await admitRun(candidates[0].id, 'dispatch-handle', { publication }); save({ run }); return run; }
  return null;
}
async function finalRun() {
  const state = load();
  if (!state.run) return null;
  const run = await admitRun(state.run.id, 'run-status');
  save({ run });
  return run;
}
async function stopRecordedCommand() {
  const command = load()?.activeCommand;
  if (!command) return;
  stopOwned(command);
  await sleep(200);
  if (birth(command.pid) === command.birth) { try { process.kill(-command.pid, 'SIGKILL'); } catch {} }
  save({ activeCommand: null });
}
async function cleanup({ receiptDeletion = true } = {}) {
  let state = load();
  if (!state) return;
  const errors = [];
  await stopRecordedCommand();
  try {
    if (state.dispatchAttemptedAt && !state.run && !await discoverRun()) throw new Error('unresolved dispatch intent; no redispatch');
    let run = await finalRun();
    if (run && run.status !== 'completed') {
      await gh('cancel-owned-run', ['run', 'cancel', String(run.id), '--repo', repo], { allowFailure: true });
      const deadline = Date.now() + 60_000;
      do { await sleep(2_000); run = await finalRun(); } while (run.status !== 'completed' && Date.now() < deadline);
      if (run.status !== 'completed') throw new Error('owned run is not terminal after cancellation; cleanup still required');
    }
  } catch (error) { errors.push(error); }
  if (protocol === receiptRecovery && (!receiptDeletion || errors.length)) throw new AggregateError(errors.length ? errors : [new Error('receipt recovery failed; secret preserved')], 'owned cleanup incomplete');
  state = load();
  try { if ((state.setAttemptedAt || state.kind === receiptRecovery.kind) && !state.secretDeletedAt) {
    const current = await secretMetadata();
    if (!current && protocol === receiptRecovery) { save({ secretAbsentObservedAt: new Date().toISOString() }); throw new Error('original secret absent; no owned deletion inferred'); }
    if (current) {
      const owned = state.secretOwned;
      if (!owned || !sameSecret(owned, current)) throw new Error('secret ownership unknown or metadata changed; preserve it');
      if (protocol === receiptRecovery) { await verifyCurrentDelivery(); await verifyOriginalOperation(); }
      const run = await finalRun();
      if (!run) throw new Error('owned run receipt unavailable; preserve secret');
      await verifyTokenReceipt(run);
      if (protocol === receiptRecovery) { await verifyCurrentDelivery(); await verifyOriginalOperation(); }
      assertProviderCustody();
      if (!sameSecret(owned, await secretMetadata())) throw new Error('secret changed after receipt; preserve it');
      if (protocol === receiptRecovery) originalSnapshot();
      await gh('delete-owned-secret', ['secret', 'delete', secret, '--repo', repo]);
      if (await secretMetadata()) throw new Error('secret deletion readback failed');
    }
    save({ secretDeletedAt: new Date().toISOString() });
  } } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'owned cleanup incomplete');
  save({ cleanupCompletedAt: new Date().toISOString() });
}

async function dispatchOnce(fields) {
  if (load().dispatchAttemptedAt) throw new Error('dispatch already attempted; recovery never redispatches');
  if (cancelled) throw new Error('cancelled before dispatch');
  assertProviderCustody();
  save({ dispatchAttemptedAt: new Date().toISOString() });
  const args = ['workflow', 'run', workflowName, '--repo', repo, '--ref', 'main'];
  for (const [key, value] of Object.entries(fields)) args.push('-f', `${key}=${value}`);
  const dispatched = await gh('dispatch', args, { allowFailure: true });
  const urls = dispatched.text.match(/https:\/\/github\.com\/moabualruz\/rice-mods\/actions\/runs\/(\d+)/g) || [];
  const ids = [...new Set(urls.map(url => Number(url.split('/').at(-1))))];
  if (ids.length > 1) throw new Error('ambiguous native dispatch handles; no redispatch');
  if (ids.length === 1) save({ run: await admitRun(ids[0], 'dispatch-handle', { publication: true }) });
  else for (let i = 0; i < 7 && !load().run; i++) { if (i) await sleep(5_000); await discoverRun(true); }
  if (!load().run) throw new Error('dispatch handle not published; intent retained for recovery');
  if (dispatched.code !== 0 || cancelled) throw failure('dispatch', dispatched);
  await watchExistingRun();
}

async function watchExistingRun() {
  const watched = await gh('watch', ['run', 'watch', String(load().run.id), '--repo', repo, '--interval', '15', '--exit-status'], { limit: 12 * 60_000, allowFailure: true });
  const run = await finalRun();
  const jobs = await api('runner-attribution', `repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`);
  if (!Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length) throw new Error('complete runner attribution required');
  save({ jobs: jobs.jobs.map(v => ({ id: v.id, name: v.name, status: v.status, conclusion: v.conclusion, runnerID: v.runner_id, runnerName: v.runner_name, runnerGroupID: v.runner_group_id, labels: v.labels, startedAt: v.started_at, completedAt: v.completed_at })), watch: { code: watched.code, timeout: watched.timeout } });
  if (run.status !== 'completed' || run.conclusion !== 'success') throw new Error('native consumer did not complete successfully');
}

try { return await withDeliveryLease({ repository: repo, run: async ({ assertHeld }) => {
assertProviderCustody = assertHeld;
assertProviderCustody();
let primaryError;
try {
  if (mode === 'recover') {
    if (!load()) throw new Error('no owned operation to recover');
    if (protocol === receiptRecovery) {
      await stopRecordedCommand();
      await verifyCurrentDelivery();
      await verifyOriginalOperation();
      if (load().dispatchAttemptedAt && !load().run && !await discoverRun(true)) throw new Error('receipt recovery run unavailable; no redispatch');
      const run = await finalRun();
      if (run && run.status !== 'completed') await watchExistingRun();
    }
  }
  else if (protocol === receiptRecovery) {
    const original = originalSnapshot();
    save({ version: 1, kind: receiptRecovery.kind, bindingSHA256, repository: repo, sourceRepository: source, sourceCommit: entry.commit, sourceLimitsBlob: entry.limits, head, workflow, secret, startedAt: new Date().toISOString(), tokenSHA256: original.state.tokenSHA256, secretOwned: original.state.secretOwned, original: original.reference, originalBindingSHA256: binding.originalBindingSHA256, originalOperationSHA256: binding.originalOperationSHA256, custody: { repository: repo, kind: 'native-repository-delivery-lease' }, issuerAccess: false, qualification: false });
    await verifyCurrentDelivery();
    await verifyOriginalOperation();
    if (!sameSecret(original.state.secretOwned, await secretMetadata())) throw new Error('original secret absent or metadata changed; preserve it');
    save({ beforeRunIDs: (await runs()).map(v => v.id) });
    await dispatchOnce({ source_repository: source, source_commit: entry.commit, expected_head: head, original_binding_sha256: binding.originalBindingSHA256, original_head: original.binding.head, original_workflow_sha256: original.binding.workflowSHA256, original_run_id: original.state.run.id, original_run_attempt: original.state.run.attempt });
  }
  else {
    if (load()) throw new Error('operation already exists; use recovery, never redispatch');
    if (!token || !Number.isFinite(expires) || expires - Date.now() < 16 * 60_000) throw new Error('actual token lifetime must cover 15m controller plus 1m margin');
    save({ version: 1, kind: qualification.kind, bindingSHA256, repository: repo, sourceRepository: source, head, workflow, secret, startedAt: new Date().toISOString(), tokenExpiresAt: new Date(expires).toISOString(), sourceCommit: entry.commit, sourceLimitsBlob: entry.limits, tokenSHA256: digest(token), custody: { repository: repo, kind: 'native-repository-delivery-lease' }, helperDeliveryRef: binding.helperDeliveryRef });
    await verifyCurrentDelivery();
    if (await secretMetadata()) throw new Error('existing download secret preserved; baseline must be absent');
    const beforeRunIDs = (await runs()).map(v => v.id);
    save({ beforeRunIDs });
    if (cancelled) throw new Error('cancelled before mutation');
    save({ setAttemptedAt: new Date().toISOString() });
    await gh('set-owned-secret', ['secret', 'set', secret, '--repo', repo], { stdin: token });
    const secretOwned = await secretMetadata();
    if (!secretOwned) throw new Error('secret set readback missing');
    save({ secretOwned });
    await sleep(1100);
    await dispatchOnce({ source_repository: source, expected_head: head, token_expires_at: new Date(expires).toISOString() });
  }
} catch (error) {
  primaryError = { phase: error.phase || 'controller', class: error.name, messageBytes: Buffer.byteLength(String(error.message)), messageSHA256: digest(String(error.message)) };
  if (load()) save({ [mode === 'recover' ? 'recoveryError' : 'primaryError']: primaryError });
} finally {
  try { await cleanup({ receiptDeletion: !primaryError }); } catch (error) {
    if (load()) save({ cleanupFailures: [...(load().cleanupFailures || []), { at: new Date().toISOString(), class: error.name, causes: (error.errors || [error]).map(cause => ({ phase: cause.phase || 'cleanup', class: cause.name, messageSHA256: digest(String(cause.message)) })) }] });
    primaryError ||= { phase: 'cleanup', class: 'incomplete' };
  }
}
if (load()) save({ controllerEndedAt: new Date().toISOString(), controllerExit: primaryError ? 1 : 0 });
console.log(JSON.stringify({ repository: repo, mode, exit: primaryError ? 1 : 0, operation: stateFile }));
return primaryError ? 1 : 0;
} }); } catch (error) {
  if (load()) save({ custodyFailure: { code: error.code || 'CUSTODY_FAILURE', fingerprint: digest(String(error.message)) }, controllerExit: 1 });
  throw error;
}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , mode, bindingFile, directory, originalBindingFile, originalDirectory] = process.argv;
  try { process.exitCode = await runPrivateSourceController({ mode, bindingFile, directory, originalBindingFile, originalDirectory }); }
  catch (error) { console.error(JSON.stringify({ phase: 'controller-setup', class: error.name, fingerprint: createHash('sha256').update(String(error.message)).digest('hex') })); process.exitCode = 1; }
}
