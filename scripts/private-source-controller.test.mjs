import { createServer } from 'node:https';
import { createServer as createProxy, connect } from 'node:net';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, lstatSync, symlinkSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { qualification, receiptRecovery } from './private-source-protocol.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const target = mkdtempSync(join(tmpdir(), 'mods-private-native-gh-'));
mkdirSync(target, { recursive: true, mode: 0o700 });
const tls = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = tls.privateKey.export({ type: 'pkcs8', format: 'pem' });
const certFile = join(target, 'fixture-public-cert.pem');
const openssl = execFileSync('which', ['openssl'], { encoding: 'utf8' }).trim();
const certificatePipe = '/bin/cat | "$1" req -new -x509 -key /dev/stdin -subj /CN=fixture.invalid -addext subjectAltName=DNS:fixture.invalid -days 1 -out "$2"';
execFileSync('/bin/bash', ['-n', '-c', certificatePipe], { stdio: ['ignore', 'pipe', 'pipe'] });
execFileSync('/bin/bash', ['-o', 'pipefail', '-c', certificatePipe, 'fixture-certificate', openssl, certFile], { input: key, stdio: ['pipe', 'pipe', 'pipe'] });
const seal = generateKeyPairSync('x25519').publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
const workflow = readFileSync(new URL('../.github/workflows/private-source-qualification.yml', import.meta.url));
const receiptWorkflow = readFileSync(new URL('../.github/workflows/private-source-receipt.yml', import.meta.url));
const entry = JSON.parse(readFileSync(new URL('../.claude-plugin/marketplace.lock.json', import.meta.url), 'utf8')).plugins[0];
const gh = execFileSync('which', ['gh'], { encoding: 'utf8' }).trim();
const ghSHA256 = createHash('sha256').update(readFileSync(gh)).digest('hex');
const repo = 'moabualruz/rice-mods';
const head = 'a'.repeat(40);
const fake = 'fixture-owned-installation-token';
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: join(root, '..'), encoding: 'utf8' }).split('\0').filter(Boolean);
const blobs = execFileSync('git', ['hash-object', '--stdin-paths'], { cwd: join(root, '..'), input: tracked.join('\n') + '\n', encoding: 'utf8' }).trim().split('\n');
const sourceTree = tracked.map((path, index) => ({ path, type: 'blob', mode: lstatSync(join(root, '..', path)).mode & 0o111 ? '100755' : '100644', sha: blobs[index] }));
const custodyLog = join(target, 'custody.log');
const lostCustody = join(target, 'lost-custody');
const harness = join(target, 'harness.mjs');
writeFileSync(harness, `import { runPrivateSourceController } from ${JSON.stringify(pathToFileURL(join(root, 'private-source-controller.mjs')).href)};
import { appendFileSync, existsSync } from 'node:fs';
const [, , mode, bindingFile, directory, originalBindingFile, originalDirectory] = process.argv;
const withDeliveryLease = async ({ repository, run }) => {
  if (process.env.MISE_GITHUB_TOKEN) throw Error('fixture inherited mise credential');
  if (repository !== 'moabualruz/rice-mods' || process.env.FIXTURE_MODE === 'lease-busy') throw Error('fixture custody refused');
  appendFileSync(process.env.FIXTURE_CUSTODY_LOG, 'acquire\\n');
  try { return await run({ assertHeld() {
    if (process.env.FIXTURE_MODE === 'custody-lost' && existsSync(process.env.FIXTURE_CUSTODY_LOST)) throw Error('fixture custody lost');
    appendFileSync(process.env.FIXTURE_CUSTODY_LOG, 'held\\n');
  } }); } finally { appendFileSync(process.env.FIXTURE_CUSTODY_LOG, 'release\\n'); }
};
try { process.exitCode = await runPrivateSourceController({ mode, bindingFile, directory, originalBindingFile, originalDirectory, withDeliveryLease, nativeGH: ${JSON.stringify({path:gh,sha256:ghSHA256})} }); }
catch { process.exitCode = 1; }
`);
let scenario;
const now = () => new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
const recovery = () => scenario.kind === receiptRecovery.kind;
const currentProtocol = () => recovery() ? receiptRecovery : qualification;
const runID = () => recovery() ? 92001 : 91001;
const jobID = () => recovery() ? 92101 : 91101;
const run = () => ({ id: runID(), repository: { full_name: repo }, head_sha: head, head_branch: 'main', event: 'workflow_dispatch', path: currentProtocol().workflow, status: scenario.status, conclusion: scenario.conclusion, created_at: scenario.dispatchedAt || now(), updated_at: now(), html_url: `https://github.com/${repo}/actions/runs/${runID()}`, workflow_id: 123, name: currentProtocol().title, display_title: `${currentProtocol().title}: ${entry.repo}`, run_number: 1, run_attempt: 1, jobs_url: `https://fixture.invalid/repos/${repo}/actions/runs/${runID()}/jobs`, check_suite_id: 44 });
const originalRun = () => ({ ...run(), id: 91001, head_sha: 'd'.repeat(40), path: qualification.workflow, status: scenario.mode === 'receipt-original-active' ? 'in_progress' : 'completed', conclusion: 'cancelled', display_title: `${qualification.title}: ${entry.repo}` });
const server = createServer({ key, cert: readFileSync(certFile) }, async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  assert.ok(!raw.includes(fake), 'native gh must encrypt token before HTTP');
  assert.ok(req.headers.authorization?.endsWith(' fixture-native-operator'), 'control calls must use the independent native operator store');
  const url = new URL(req.url, 'https://localhost');
  const path = url.pathname.replace(/^\/api\/v3/, '');
  scenario.calls.push({ method: req.method, path });
  if (req.method !== 'GET') assert.match(readFileSync(custodyLog, 'utf8'), /held\n$/);
  const json = (status, value) => { res.writeHead(status, { 'content-type': 'application/json', 'x-github-request-id': 'FIXTURE' }); res.end(value === undefined ? undefined : JSON.stringify(value)); };
  if (path === '/meta') return json(200, { installed_version: '3.20.0' });
  if (path === `/repos/${repo}`) return json(200, { id: 77, full_name: repo, name: 'rice-mods', owner: { login: 'moabualruz' }, private: true, default_branch: 'main', permissions: { admin: true } });
  if (path === `/repos/${repo}/git/ref/heads/main`) return json(200, { object: { sha: scenario.mode === 'moved-head' ? 'b'.repeat(40) : head } });
  if (path === `/repos/${repo}/git/commits/${head}`) return json(200, { sha: head, tree: { sha: 'c'.repeat(40) } });
  if (path === `/repos/${repo}/git/trees/${'c'.repeat(40)}`) return json(200, { truncated: false, tree: sourceTree.map(value => scenario.mode === 'stale-source' && value.path === 'scripts/plugin-source-check.sh' ? { ...value, sha: 'b'.repeat(40) } : value) });
  if (path.endsWith('/contents/' + qualification.workflow)) return json(200, { encoding: 'base64', content: (scenario.mode === 'changed-workflow' || scenario.mode === 'receipt-original-workflow' ? Buffer.from('different workflow') : workflow).toString('base64') });
  if (path.endsWith('/contents/' + receiptRecovery.workflow)) return json(200, { encoding: 'base64', content: (scenario.mode === 'receipt-current-workflow' ? Buffer.from('different workflow') : receiptWorkflow).toString('base64') });
  if (path.endsWith('/actions/runs/38939673060')) return json(200, { head_sha: head, repository: { full_name: repo }, status: 'completed', conclusion: 'success', name: scenario.mode === 'unrelated-ci' ? 'Security' : 'CI', path: scenario.mode === 'unrelated-ci' ? '.github/workflows/security.yml' : '.github/workflows/ci.yml', event: 'push', head_branch: 'main', run_attempt: 1, workflow_id: 456 });
  if (path.endsWith('/actions/workflows/ci.yml')) return json(200, { id: 456, name: 'CI', path: '.github/workflows/ci.yml' });
  if (path.endsWith('/actions/secrets')) return json(200, { total_count: scenario.secret ? 1 : 0, secrets: scenario.secret ? [scenario.secret] : [] });
  if (path.endsWith('/actions/secrets/public-key')) return json(200, { key_id: '123', key: seal });
  if (path.endsWith('/actions/secrets/MODS_SOURCE_READ_TOKEN')) {
    if (req.method === 'PUT') {
      assert.equal(recovery(), false, 'receipt recovery must never set or mint a token');
      const value = JSON.parse(raw);
      assert.equal(value.key_id, '123'); assert.ok(value.encrypted_value.length > fake.length);
      scenario.secret = { name: 'MODS_SOURCE_READ_TOKEN', created_at: now(), updated_at: now() };
      scenario.setAt = Date.now();
      scenario.sets++;
      return json(201, {});
    }
    if (req.method === 'DELETE') { scenario.secret = null; scenario.deletes++; return json(204); }
  }
  if (path.endsWith('/actions/workflows/' + currentProtocol().workflow.split('/').at(-1) + '/runs')) {
    if (scenario.mode === 'custody-lost') writeFileSync(lostCustody, 'lost');
    return json(200, { total_count: scenario.dispatched ? 1 : 0, workflow_runs: scenario.dispatched ? [run()] : [] });
  }
  if (path.endsWith('/actions/workflows/' + currentProtocol().workflow.split('/').at(-1)) || path.endsWith('/actions/workflows/123')) return json(200, { id: 123, name: currentProtocol().title, path: currentProtocol().workflow, state: 'active' });
  if (path.endsWith('/actions/workflows/123/dispatches')) {
    const value = JSON.parse(raw);
    assert.equal(value.ref, 'main');
    assert.ok(Date.now() - scenario.setAt >= 1000, 'dispatch must follow the set timestamp second');
    assert.deepEqual(value.inputs, recovery() ? { source_repository: entry.repo, source_commit: entry.commit, expected_head: head, original_binding_sha256: scenario.originalBindingSHA256, original_head: 'd'.repeat(40), original_workflow_sha256: createHash('sha256').update(workflow).digest('hex'), original_run_id: '91001', original_run_attempt: '1' } : { source_repository: entry.repo, expected_head: head, token_expires_at: env.RICE_RELEASE_DOWNLOAD_TOKEN_EXPIRES_AT });
    scenario.dispatches++; scenario.dispatched = true; scenario.dispatchedAt = now();
    if (scenario.mode === 'foreign') scenario.secret.updated_at = '2099-01-01T00:00:00Z';
    if (scenario.mode === 'recover' || scenario.mode === 'receipt-resume') { scenario.status = 'in_progress'; scenario.conclusion = null; }
    return json(204);
  }
  if (recovery() && path.endsWith('/actions/runs/91001')) return json(200, originalRun());
  if (path.endsWith('/actions/runs/' + runID())) {
    const active = scenario.operation && existsSync(join(scenario.operation, 'operation.json')) ? JSON.parse(readFileSync(join(scenario.operation, 'operation.json'))).activeCommand : null;
    if (scenario.mode === 'watch-transport' && !scenario.failedWatch && active?.phase === 'watch') { scenario.failedWatch = true; res.setHeader('Retry-After', '1'); return json(503, { message: 'owned retry fixture' }); }
    scenario.runReads = (scenario.runReads || 0) + 1;
    const value = run();
    if (scenario.mode === 'publication' && scenario.runReads === 1) { delete value.run_attempt; value.display_title = 'fixture-private-pending-title'; }
    if (scenario.mode === 'wrong-run') value.repository = { full_name: 'foreign/repository' };
    return json(200, value);
  }
  if (path.endsWith('/actions/runs/' + runID() + '/jobs') || path.endsWith('/actions/runs/' + runID() + '/attempts/1/jobs')) return json(200, { total_count: 1, jobs: [{ id: jobID(), name: currentProtocol().job, run_id: runID(), head_sha: head, status: scenario.status, conclusion: scenario.conclusion, runner_id: 72, runner_name: 'fixture-linux', runner_group_id: 1, labels: ['ubuntu-latest'], steps: [] }] });
  if (path === `/repos/${repo}/check-runs/${jobID()}/annotations`) return json(200, []);
  if (path.endsWith('/actions/jobs/' + jobID() + '/logs')) {
    const value = ['same-second-foreign', 'receipt-foreign-value'].includes(scenario.mode) ? 'fixture-foreign-token' : fake;
    const receipt = { version: 1, repository: repo, head, workflow: currentProtocol().workflow, sourceRepository: entry.repo, sourceCommit: entry.commit, runID: runID(), runAttempt: 1, job: currentProtocol().job, tokenSHA256: createHash('sha256').update(value).digest('hex') };
    if (recovery()) Object.assign(receipt, { kind: 'current-secret-value', originalBindingSHA256: scenario.originalBindingSHA256, originalHead: 'd'.repeat(40), originalWorkflowSHA256: createHash('sha256').update(workflow).digest('hex'), originalRunID: 91001, originalRunAttempt: 1 });
    if (scenario.mode === 'late-foreign' || scenario.mode === 'receipt-late-metadata') scenario.secret.updated_at = '2099-01-01T00:00:00Z';
    if (scenario.mode === 'receipt-original-changed') writeFileSync(join(scenario.originalDirectory, 'operation.json'), '{}', { mode: 0o600 });
    res.writeHead(200, { 'content-type': 'text/plain' });
    const marker = 'timestamp ' + currentProtocol().marker + JSON.stringify(receipt) + '\n';
    return res.end(['missing-receipt', 'receipt-missing'].includes(scenario.mode) ? 'no ownership receipt\n' : ['ambiguous-receipt', 'receipt-duplicate'].includes(scenario.mode) ? marker + marker : marker);
  }
  if (path.endsWith('/actions/runs/' + runID() + '/cancel')) { scenario.cancels++; scenario.status = 'completed'; scenario.conclusion = 'cancelled'; return json(202); }
  if (path === '/graphql' || path === '/api/graphql') return json(200, { data: {} });
  scenario.unknown.push({ method: req.method, path });
  writeFileSync(join(target, 'unknown-native-routes.json'), JSON.stringify(scenario.unknown));
  return json(404, { message: 'fixture route missing' });
});
await new Promise((r, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', r); });
const proxy = createProxy(socket => {
  socket.once('data', header => {
    if (!header.toString('utf8').startsWith('CONNECT fixture.invalid:443 HTTP/1.1\r\n')) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const upstream = connect(server.address().port, '127.0.0.1', () => { socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); socket.pipe(upstream); upstream.pipe(socket); });
    socket.on('error', () => upstream.destroy()); upstream.on('error', () => socket.destroy());
  });
});
await new Promise(r => proxy.listen(0, '127.0.0.1', r));
const config = join(target, 'gh-config'); mkdirSync(config, { recursive: true });
const cache = join(target, 'cache'); mkdirSync(cache, { mode: 0o700 });
writeFileSync(join(config, 'hosts.yml'), 'fixture.invalid:\n    git_protocol: https\n    oauth_token: fixture-native-operator\n');
const env = { ...process.env, HTTPS_PROXY: `http://127.0.0.1:${proxy.address().port}`, HTTP_PROXY: `http://127.0.0.1:${proxy.address().port}`, NO_PROXY: '', ALL_PROXY: '', GH_CONFIG_DIR: config, XDG_CACHE_HOME: cache, GH_HOST: 'fixture.invalid', GH_TOKEN: 'fixture-native-operator', SSL_CERT_FILE: certFile, GH_NO_UPDATE_NOTIFIER: '1', RICE_RELEASE_DOWNLOAD_TOKEN: fake, RICE_RELEASE_DOWNLOAD_TOKEN_EXPIRES_AT: new Date(Date.now() + 60 * 60_000).toISOString() };
const proof = [];
const preserved = join(target, 'existing-operation');
mkdirSync(preserved);
writeFileSync(join(preserved, 'helper-command.log'), 'preserved owned log\n');
const linked = join(target, 'linked-operation');
symlinkSync(preserved, linked);
for (const operation of [preserved, linked]) {
  const refused = spawnSync('bash', [join(root, 'private-source-qualification.sh'), join(target, 'absent-binding.json'), operation], { encoding: 'utf8' });
  assert.notEqual(refused.status, 0);
  assert.equal(readFileSync(join(preserved, 'helper-command.log'), 'utf8'), 'preserved owned log\n');
}
const relativeOperation = join(target, 'relative-refusal');
assert.equal(spawnSync('bash', [join(root, 'private-source-qualification.sh'), 'relative-binding.json', relativeOperation]).status, 64);
assert.ok(!existsSync(relativeOperation));
const emptyHome = join(target, 'empty-home');
const hostileBin = join(target, 'hostile-bin');
mkdirSync(emptyHome);
mkdirSync(hostileBin);
const hostileMarker = join(target, 'untrusted-executable-called');
for (const executable of ['bao-run', 'timeout', 'jq', 'mkdir', 'flock', 'dirname', 'ps']) {
  writeFileSync(join(hostileBin, executable), `#!/bin/sh\nprintf called > '${hostileMarker}'\nexit 90\n`, { mode: 0o755 });
}
const refusedBinding = join(target, 'host-profile-refusal.json');
writeFileSync(refusedBinding, JSON.stringify({ sourceRepository: entry.repo }));
const refusedOperation = join(target, 'host-profile-refusal');
const hostRefusal = spawnSync('/bin/bash', [join(root, 'private-source-qualification.sh'), refusedBinding, refusedOperation], { encoding: 'utf8', env: { ...process.env, HOME: emptyHome, PATH: hostileBin + ':/usr/bin:/bin' } });
assert.notEqual(hostRefusal.status, 0);
assert.ok(!existsSync(hostileMarker));
assert.ok(!existsSync(join(refusedOperation, 'helper-command.log')));
if (process.platform === 'linux' && process.arch === 'x64') {
  const helperFixture = join(target, 'writable-helper-parent');
  mkdirSync(helperFixture);
  const helper = join(helperFixture, 'rice-helper');
  const helperBytes = '#!/bin/sh\nexit 91\n';
  writeFileSync(helper, helperBytes, { mode: 0o755 });
  writeFileSync(join(helperFixture, 'private-source-qualification.sh'), readFileSync(join(root, 'private-source-qualification.sh')));
  writeFileSync(join(helperFixture, 'private-source-host.json'), JSON.stringify({ version: 1, platform: 'linux', architecture: 'x64', executables: { gh: { path: gh, sha256: ghSHA256 }, 'rice-helper': { path: helper, sha256: createHash('sha256').update(helperBytes).digest('hex') } } }));
  chmodSync(helperFixture, 0o775);
  const writableParentOperation = join(target, 'writable-helper-refusal');
  const writableParent = spawnSync('/bin/bash', [join(helperFixture, 'private-source-qualification.sh'), refusedBinding, writableParentOperation], { encoding: 'utf8', env: { ...process.env, HOME: emptyHome, PATH: hostileBin + ':/usr/bin:/bin' } });
  assert.notEqual(writableParent.status, 0);
  assert.match(writableParent.stderr, /reviewed Rice helper unavailable/);
  assert.ok(!existsSync(join(writableParentOperation, 'helper-command.log')));
  assert.ok(!existsSync(hostileMarker));
}
async function execute(mode, name) {
  const bindingFile = join(target, name + '-binding.json');
  const operation = join(target, name);
  scenario.operation = operation;
  if (recovery() && !scenario.originalDirectory) {
    scenario.originalDirectory = join(target, name + '-original'); mkdirSync(scenario.originalDirectory, { mode: 0o700 });
    scenario.originalBindingFile = join(target, name + '-original-binding.json');
    const originalBinding = { repository: repo, sourceRepository: entry.repo, sourceCommit: entry.commit, sourceLimitsBlob: entry.limits, requiredCIRunID: 38939673060, requiredCIAttempt: 1, head: 'd'.repeat(40), workflowSHA256: createHash('sha256').update(workflow).digest('hex'), helperDeliveryRef: 'fixture://original-helper' };
    const bytes = JSON.stringify(originalBinding); writeFileSync(scenario.originalBindingFile, bytes, { mode: 0o600 });
    scenario.originalBindingSHA256 = createHash('sha256').update(bytes).digest('hex');
    const originalState = { version: 1, bindingSHA256: scenario.originalBindingSHA256, repository: repo, sourceRepository: entry.repo, sourceCommit: entry.commit, sourceLimitsBlob: entry.limits, head: originalBinding.head, workflow: qualification.workflow, secret: 'MODS_SOURCE_READ_TOKEN', tokenSHA256: createHash('sha256').update(fake).digest('hex'), secretOwned: { ...scenario.secret }, custody: { repository: repo, kind: 'native-repository-delivery-lease' }, activeCommand: null, controllerExit: 1, controllerEndedAt: now(), setAttemptedAt: now(), dispatchAttemptedAt: now(), run: { id: 91001, attempt: 1, repository: repo, head: originalBinding.head, workflow: qualification.workflow, event: 'workflow_dispatch', status: 'completed', conclusion: 'cancelled' }, primaryError: { phase: 'fixture-original-failure' } };
    scenario.originalBytes = JSON.stringify(originalState);
    writeFileSync(join(scenario.originalDirectory, 'operation.json'), scenario.originalBytes, { mode: 0o600 });
    scenario.originalOperationSHA256 = createHash('sha256').update(scenario.originalBytes).digest('hex');
    if (scenario.mode === 'receipt-metadata-changed') scenario.secret.updated_at = '2099-01-01T00:00:00Z';
  }
  const bound = { repository: repo, sourceRepository: scenario.mode === 'wrong-source' ? 'owner/unknown' : entry.repo, sourceCommit: scenario.mode === 'wrong-pin' ? 'b'.repeat(40) : entry.commit, sourceLimitsBlob: entry.limits, requiredCIRunID: 38939673060, requiredCIAttempt: 1, head, workflowSHA256: createHash('sha256').update(recovery() ? receiptWorkflow : workflow).digest('hex'), ...(recovery() ? { originalBindingSHA256: scenario.mode === 'receipt-original-binding' ? 'f'.repeat(64) : scenario.originalBindingSHA256, originalOperationSHA256: scenario.originalOperationSHA256 } : { helperDeliveryRef: 'fixture://helper' }), ...(scenario.mode === 'arbitrary-gh' ? { gh: '/untrusted/recipient' } : {}) };
  writeFileSync(bindingFile, JSON.stringify(bound));
  const childEnv = { ...env, FIXTURE_MODE: scenario.mode, FIXTURE_CUSTODY_LOG: custodyLog, FIXTURE_CUSTODY_LOST: lostCustody, ...(scenario.mode === 'short-lifetime' ? { RICE_RELEASE_DOWNLOAD_TOKEN_EXPIRES_AT: new Date(Date.now() + 15 * 60_000).toISOString() } : {}) };
  if (recovery()) { delete childEnv.RICE_RELEASE_DOWNLOAD_TOKEN; delete childEnv.RICE_RELEASE_DOWNLOAD_TOKEN_EXPIRES_AT; }
  childEnv.MISE_GITHUB_TOKEN = 'fixture-mise-token';
  const child = spawn(process.execPath, [harness, mode, bindingFile, operation, ...(recovery() ? [scenario.originalBindingFile, scenario.originalDirectory] : [])], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
  let fixtureTimedOut = false;
  const timeout = setTimeout(() => { fixtureTimedOut = true; child.kill('SIGTERM'); }, 20_000);
  const hardStop = setTimeout(() => { if (fixtureTimedOut) child.kill('SIGKILL'); }, 25_000);
  if ((scenario.mode === 'recover' && mode === 'operate') || (scenario.mode === 'receipt-resume' && mode === 'receipt-recover')) {
    const poll = setInterval(() => { if (scenario.dispatched && scenario.calls.some(v => v.path.endsWith('/actions/runs/' + runID() + '/jobs'))) {
      const active = JSON.parse(readFileSync(join(operation, 'operation.json'), 'utf8')).activeCommand;
      if (!active?.pid || !active.birth || active.phase !== 'watch') return;
      const birth = spawnSync('/bin/ps', ['-p', String(active.pid), '-o', 'lstart='], { encoding: 'utf8' });
      if (birth.status !== 0 || birth.stdout.trim() !== active.birth) return;
      const argv = spawnSync('/bin/ps', ['-p', String(active.pid), '-o', 'command='], { encoding: 'utf8' });
      if (argv.status !== 0) return;
      scenario.nativeArgvExcludesToken = !argv.stdout.includes(fake);
      clearInterval(poll); child.kill(scenario.nativeArgvExcludesToken ? 'SIGKILL' : 'SIGTERM');
    } }, 20);
    child.on('close', () => clearInterval(poll));
  }
  const code = await new Promise(r => child.on('close', (code, signal) => r(signal || code)));
  clearTimeout(timeout); clearTimeout(hardStop);
  assert.equal(fixtureTimedOut, false, `${name}/${mode}: native fixture child exceeded its deadline; unknown routes ${JSON.stringify(scenario.unknown)}`);
  assert.ok(!output.includes(fake)); assert.ok(!output.includes(env.GH_TOKEN));
  const statePath = join(operation, 'operation.json');
  return { code, output, operation, state: existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null };
}
try {
  for (const name of ['success204', 'publication', 'wrong-run', 'watch-transport', 'failure', 'preexisting', 'foreign', 'recover', 'wrong-source', 'wrong-pin', 'short-lifetime', 'moved-head', 'changed-workflow', 'stale-source', 'unrelated-ci', 'arbitrary-gh', 'lease-busy', 'custody-lost', 'same-second-foreign', 'late-foreign', 'missing-receipt', 'ambiguous-receipt']) {
    scenario = { mode: name, secret: name === 'preexisting' ? { name: 'MODS_SOURCE_READ_TOKEN', created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z' } : null, status: 'completed', conclusion: name === 'failure' ? 'failure' : 'success', sets: 0, deletes: 0, dispatches: 0, cancels: 0, calls: [], unknown: [] };
    let result = await execute('operate', name);
    if (name === 'recover') { assert.equal(scenario.nativeArgvExcludesToken, true, 'recovery interruption requires the recorded live watch command and token-free argv'); assert.equal(result.code, 'SIGKILL'); result = await execute('recover', name); assert.equal(scenario.cancels, 1); }
    const expected = ['success204', 'publication', 'watch-transport', 'recover'].includes(name) ? 0 : 1;
    writeFileSync(join(target, name + '-native.json'), JSON.stringify({ scenario, result: { code: result.code, state: result.state } }, null, 2));
    if (result.code !== expected) console.log(JSON.stringify({ name, code: result.code, state: result.state, unknown: scenario.unknown }));
    assert.equal(result.code, expected, name);
    const refused = ['preexisting', 'wrong-source', 'wrong-pin', 'short-lifetime', 'moved-head', 'changed-workflow', 'stale-source', 'unrelated-ci', 'arbitrary-gh', 'lease-busy', 'custody-lost'].includes(name);
    assert.equal(scenario.dispatches, refused ? 0 : 1, 'one native dispatch, including empty204');
    assert.equal(scenario.deletes, refused || ['wrong-run', 'foreign', 'same-second-foreign', 'late-foreign', 'missing-receipt', 'ambiguous-receipt'].includes(name) ? 0 : 1, 'only owned secret deleted');
    if (refused) assert.equal(scenario.sets, 0, 'refusal precedes secret mutation');
    assert.equal(scenario.unknown.length, 0, 'all native endpoints bound: ' + JSON.stringify(scenario.unknown));
    assert.ok(!JSON.stringify(result.state).includes(fake), 'no token persisted in operation metadata');
    if (name === 'watch-transport') { assert.equal(result.state.watch.code, 1); assert.equal(result.state.run.conclusion, 'success'); }
    if (name === 'publication') { assert.ok(result.state.firstRunIdentityMismatch.fields.some(v => v.field === 'display_title')); assert.ok(!JSON.stringify(result.state).includes('fixture-private-pending-title')); assert.equal(scenario.cancels, 0); }
    if (name === 'wrong-run') { assert.equal(scenario.cancels, 0); assert.ok(result.state.firstRunIdentityMismatch.fields.some(v => v.field === 'repository')); }
    proof.push({ name, exit: result.code, sets: scenario.sets, dispatches: scenario.dispatches, deletes: scenario.deletes, cancels: scenario.cancels, nativeCalls: scenario.calls, state: join(result.operation, 'operation.json') });
  }
  for (const name of ['receipt-success', 'receipt-resume', 'receipt-foreign-value', 'receipt-missing', 'receipt-duplicate', 'receipt-metadata-changed', 'receipt-late-metadata', 'receipt-original-binding', 'receipt-original-changed', 'receipt-original-active', 'receipt-original-workflow', 'receipt-current-workflow']) {
    scenario = { kind: receiptRecovery.kind, mode: name, secret: { name: 'MODS_SOURCE_READ_TOKEN', created_at: '2026-11-13T23:59:18Z', updated_at: '2026-11-13T23:59:18Z' }, setAt: Date.now() - 2_000, status: 'completed', conclusion: 'success', sets: 0, deletes: 0, dispatches: 0, cancels: 0, calls: [], unknown: [] };
    let result = await execute('receipt-recover', name);
    if (name === 'receipt-resume') {
      assert.equal(result.code, 'SIGKILL');
      assert.equal(scenario.nativeArgvExcludesToken, true);
      scenario.status = 'completed'; scenario.conclusion = 'success';
      result = await execute('recover', name);
    }
    const successful = ['receipt-success', 'receipt-resume'].includes(name);
    assert.equal(result.code, successful ? 0 : 1, name);
    assert.equal(scenario.sets, 0, 'no-mint recovery never sets a secret');
    assert.equal(scenario.dispatches, ['receipt-metadata-changed', 'receipt-original-binding', 'receipt-original-active', 'receipt-original-workflow', 'receipt-current-workflow'].includes(name) ? 0 : 1, 'receipt recovery dispatches once or refuses before mutation');
    assert.equal(scenario.deletes, successful ? 1 : 0, 'only an authentic current-value receipt permits deletion');
    assert.equal(scenario.cancels, 0, 'original or unproven runs are never cancelled');
    assert.equal(scenario.unknown.length, 0, JSON.stringify(scenario.unknown));
    if (name !== 'receipt-original-changed') assert.equal(readFileSync(join(scenario.originalDirectory, 'operation.json'), 'utf8'), scenario.originalBytes, 'original failed operation remains immutable');
    assert.ok(!JSON.stringify(result.state).includes(fake));
    if (successful) { assert.equal(result.state.issuerAccess, false); assert.equal(result.state.qualification, false); assert.equal(result.state.tokenReceipt.kind, 'current-secret-value'); }
    writeFileSync(join(target, name + '-native.json'), JSON.stringify({ scenario, result: { code: result.code, state: result.state } }, null, 2));
    proof.push({ name, exit: result.code, sets: scenario.sets, dispatches: scenario.dispatches, deletes: scenario.deletes, cancels: scenario.cancels, nativeCalls: scenario.calls, state: join(result.operation, 'operation.json') });
  }
  writeFileSync(join(target, 'proof.json'), JSON.stringify({ at: new Date().toISOString(), gh: execFileSync(gh, ['--version'], { encoding: 'utf8' }).split('\n')[0], scope: 'Real installed gh against owned TLS fixture only; no App mint, live provider or product qualification', cases: proof }, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'PASS', cases: proof.length, proof: join(target, 'proof.json') }));
} finally { server.closeAllConnections(); await new Promise(r => server.close(r)); await new Promise(r => proxy.close(r)); }
