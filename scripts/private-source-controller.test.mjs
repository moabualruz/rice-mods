import { createServer } from 'node:https';
import { createServer as createProxy, connect } from 'node:net';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, lstatSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = dirname(fileURLToPath(import.meta.url));
const target = mkdtempSync(join(tmpdir(), 'mods-private-native-gh-'));
mkdirSync(target, { recursive: true, mode: 0o700 });
const tls = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = tls.privateKey.export({ type: 'pkcs8', format: 'pem' });
const certFile = join(target, 'fixture-public-cert.pem');
execFileSync('openssl', ['req', '-new', '-x509', '-key', '/dev/stdin', '-subj', '/CN=fixture.invalid', '-addext', 'subjectAltName=DNS:fixture.invalid', '-days', '1', '-out', certFile], { input: key, stdio: ['pipe', 'pipe', 'pipe'] });
const seal = generateKeyPairSync('x25519').publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
const workflow = readFileSync(new URL('../.github/workflows/private-source-qualification.yml', import.meta.url));
const entry = JSON.parse(readFileSync(new URL('../.claude-plugin/marketplace.lock.json', import.meta.url), 'utf8')).plugins[0];
const gh = execFileSync('which', ['gh'], { encoding: 'utf8' }).trim();
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
const [, , mode, bindingFile, directory] = process.argv;
const withDeliveryLease = async ({ repository, run }) => {
  if (repository !== 'moabualruz/rice-mods' || process.env.FIXTURE_MODE === 'lease-busy') throw Error('fixture custody refused');
  appendFileSync(process.env.FIXTURE_CUSTODY_LOG, 'acquire\\n');
  try { return await run({ assertHeld() {
    if (process.env.FIXTURE_MODE === 'custody-lost' && existsSync(process.env.FIXTURE_CUSTODY_LOST)) throw Error('fixture custody lost');
    appendFileSync(process.env.FIXTURE_CUSTODY_LOG, 'held\\n');
  } }); } finally { appendFileSync(process.env.FIXTURE_CUSTODY_LOG, 'release\\n'); }
};
try { process.exitCode = await runPrivateSourceController({ mode, bindingFile, directory, withDeliveryLease }); }
catch { process.exitCode = 1; }
`);
let scenario;
const now = () => new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
const run = () => ({ id: 91001, repository: { full_name: repo }, head_sha: head, head_branch: 'main', event: 'workflow_dispatch', path: '.github/workflows/private-source-qualification.yml', status: scenario.status, conclusion: scenario.conclusion, created_at: scenario.dispatchedAt || now(), updated_at: now(), html_url: `https://github.com/${repo}/actions/runs/91001`, workflow_id: 123, name: 'Private source qualification', display_title: `Private source qualification: ${entry.repo}`, run_number: 1, run_attempt: 1, jobs_url: `https://api.github.com/repos/${repo}/actions/runs/91001/jobs`, check_suite_id: 44 });
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
  if (path === `/repos/${repo}`) return json(200, { id: 77, full_name: repo, name: 'rice-mods', owner: { login: 'moabualruz' }, private: true, default_branch: 'main', permissions: { admin: true } });
  if (path === `/repos/${repo}/git/ref/heads/main`) return json(200, { object: { sha: scenario.mode === 'moved-head' ? 'b'.repeat(40) : head } });
  if (path === `/repos/${repo}/git/commits/${head}`) return json(200, { sha: head, tree: { sha: 'c'.repeat(40) } });
  if (path === `/repos/${repo}/git/trees/${'c'.repeat(40)}`) return json(200, { truncated: false, tree: sourceTree.map(value => scenario.mode === 'stale-source' && value.path === 'scripts/plugin-source-check.sh' ? { ...value, sha: 'b'.repeat(40) } : value) });
  if (path.endsWith('/contents/.github/workflows/private-source-qualification.yml')) return json(200, { encoding: 'base64', content: (scenario.mode === 'changed-workflow' ? Buffer.from('different workflow') : workflow).toString('base64') });
  if (path.endsWith('/actions/runs/38939673060')) return json(200, { head_sha: head, repository: { full_name: repo }, status: 'completed', conclusion: 'success', name: scenario.mode === 'unrelated-ci' ? 'Security' : 'CI', path: scenario.mode === 'unrelated-ci' ? '.github/workflows/security.yml' : '.github/workflows/ci.yml', event: 'push', head_branch: 'main', run_attempt: 1, workflow_id: 456 });
  if (path.endsWith('/actions/workflows/ci.yml')) return json(200, { id: 456, name: 'CI', path: '.github/workflows/ci.yml' });
  if (path.endsWith('/actions/secrets')) return json(200, { total_count: scenario.secret ? 1 : 0, secrets: scenario.secret ? [scenario.secret] : [] });
  if (path.endsWith('/actions/secrets/public-key')) return json(200, { key_id: '123', key: seal });
  if (path.endsWith('/actions/secrets/MODS_SOURCE_READ_TOKEN')) {
    if (req.method === 'PUT') {
      const value = JSON.parse(raw);
      assert.equal(value.key_id, '123'); assert.ok(value.encrypted_value.length > fake.length);
      scenario.secret = { name: 'MODS_SOURCE_READ_TOKEN', created_at: now(), updated_at: now() };
      scenario.setAt = Date.now();
      scenario.sets++;
      return json(201, {});
    }
    if (req.method === 'DELETE') { scenario.secret = null; scenario.deletes++; return json(204); }
  }
  if (path.endsWith('/actions/workflows/private-source-qualification.yml/runs')) {
    if (scenario.mode === 'custody-lost') writeFileSync(lostCustody, 'lost');
    return json(200, { total_count: scenario.dispatched ? 1 : 0, workflow_runs: scenario.dispatched ? [run()] : [] });
  }
  if (path.endsWith('/actions/workflows/private-source-qualification.yml') || path.endsWith('/actions/workflows/123')) return json(200, { id: 123, name: 'Private source qualification', path: '.github/workflows/private-source-qualification.yml', state: 'active' });
  if (path.endsWith('/actions/workflows/123/dispatches')) {
    const value = JSON.parse(raw);
    assert.equal(value.ref, 'main');
    assert.ok(Date.now() - scenario.setAt >= 1000, 'dispatch must follow the set timestamp second');
    assert.deepEqual(value.inputs, { source_repository: entry.repo, expected_head: head, token_expires_at: env.RICE_RELEASE_DOWNLOAD_TOKEN_EXPIRES_AT });
    scenario.dispatches++; scenario.dispatched = true; scenario.dispatchedAt = now();
    if (scenario.mode === 'foreign') scenario.secret.updated_at = '2099-01-01T00:00:00Z';
    if (scenario.mode === 'recover') { scenario.status = 'in_progress'; scenario.conclusion = null; }
    return json(204);
  }
  if (path.endsWith('/actions/runs/91001')) {
    if (scenario.mode === 'watch-transport' && !scenario.failedWatch) { scenario.failedWatch = true; res.setHeader('Retry-After', '1'); return json(503, { message: 'owned retry fixture' }); }
    return json(200, run());
  }
  if (path.endsWith('/actions/runs/91001/jobs')) return json(200, { total_count: 1, jobs: [{ id: 91101, name: 'qualify', run_id: 91001, run_attempt: 1, status: scenario.status, conclusion: scenario.conclusion, runner_id: 72, runner_name: 'fixture-linux', runner_group_id: 1, labels: ['ubuntu-latest'], steps: [] }] });
  if (path.endsWith('/actions/jobs/91101/logs')) {
    const value = scenario.mode === 'same-second-foreign' ? 'fixture-foreign-token' : fake;
    const receipt = { version: 1, repository: repo, head, workflow: '.github/workflows/private-source-qualification.yml', sourceRepository: entry.repo, sourceCommit: entry.commit, runID: 91001, runAttempt: 1, job: 'qualify', tokenSHA256: createHash('sha256').update(value).digest('hex') };
    if (scenario.mode === 'late-foreign') scenario.secret.updated_at = now();
    res.writeHead(200, { 'content-type': 'text/plain' });
    const marker = 'timestamp mods-source-token-receipt:' + JSON.stringify(receipt) + '\n';
    return res.end(scenario.mode === 'missing-receipt' ? 'no ownership receipt\n' : scenario.mode === 'ambiguous-receipt' ? marker + marker : marker);
  }
  if (path.endsWith('/actions/runs/91001/cancel')) { scenario.cancels++; scenario.status = 'completed'; scenario.conclusion = 'cancelled'; return json(202); }
  if (path === '/graphql') return json(200, { data: {} });
  scenario.unknown.push({ method: req.method, path });
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
writeFileSync(join(config, 'hosts.yml'), 'github.com:\n    api_host: fixture.invalid\n    git_protocol: https\n    oauth_token: fixture-native-operator\n');
const env = { ...process.env, HTTPS_PROXY: `http://127.0.0.1:${proxy.address().port}`, HTTP_PROXY: `http://127.0.0.1:${proxy.address().port}`, NO_PROXY: '', ALL_PROXY: '', GH_CONFIG_DIR: config, GH_HOST: 'github.com', GH_TOKEN: 'fixture-native-operator', SSL_CERT_FILE: certFile, GH_NO_UPDATE_NOTIFIER: '1', RICE_RELEASE_DOWNLOAD_TOKEN: fake, RICE_RELEASE_DOWNLOAD_TOKEN_EXPIRES_AT: new Date(Date.now() + 60 * 60_000).toISOString() };
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
async function execute(mode, name) {
  const bindingFile = join(target, name + '-binding.json');
  const operation = join(target, name);
  writeFileSync(bindingFile, JSON.stringify({ repository: repo, sourceRepository: scenario.mode === 'wrong-source' ? 'owner/unknown' : entry.repo, sourceCommit: scenario.mode === 'wrong-pin' ? 'b'.repeat(40) : entry.commit, sourceLimitsBlob: entry.limits, requiredCIRunID: 38939673060, requiredCIAttempt: 1, head, workflowSHA256: createHash('sha256').update(workflow).digest('hex'), helperDeliveryRef: 'fixture://helper', ...(scenario.mode === 'arbitrary-gh' ? { gh: '/untrusted/recipient' } : {}) }));
  const childEnv = { ...env, FIXTURE_MODE: scenario.mode, FIXTURE_CUSTODY_LOG: custodyLog, FIXTURE_CUSTODY_LOST: lostCustody, ...(scenario.mode === 'short-lifetime' ? { RICE_RELEASE_DOWNLOAD_TOKEN_EXPIRES_AT: new Date(Date.now() + 15 * 60_000).toISOString() } : {}) };
  const child = spawn(process.execPath, [harness, mode, bindingFile, operation], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 20_000);
  if (scenario.mode === 'recover' && mode === 'operate') {
    const poll = setInterval(() => { if (scenario.dispatched && scenario.calls.some(v => v.path.endsWith('/actions/runs/91001/jobs'))) {
      const active = JSON.parse(readFileSync(join(operation, 'operation.json'), 'utf8')).activeCommand;
      assert.ok(active?.pid && active.birth);
      const argv = execFileSync('/bin/ps', ['-p', String(active.pid), '-o', 'command='], { encoding: 'utf8' });
      assert.ok(!argv.includes(fake));
      scenario.nativeArgvExcludesToken = true;
      clearInterval(poll); child.kill('SIGKILL');
    } }, 20);
    child.on('close', () => clearInterval(poll));
  }
  const code = await new Promise(r => child.on('close', (code, signal) => r(signal || code)));
  clearTimeout(timeout);
  assert.ok(!output.includes(fake)); assert.ok(!output.includes(env.GH_TOKEN));
  const statePath = join(operation, 'operation.json');
  return { code, output, operation, state: existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null };
}
try {
  for (const name of ['success204', 'watch-transport', 'failure', 'preexisting', 'foreign', 'recover', 'wrong-source', 'wrong-pin', 'short-lifetime', 'moved-head', 'changed-workflow', 'stale-source', 'unrelated-ci', 'arbitrary-gh', 'lease-busy', 'custody-lost', 'same-second-foreign', 'late-foreign', 'missing-receipt', 'ambiguous-receipt']) {
    scenario = { mode: name, secret: name === 'preexisting' ? { name: 'MODS_SOURCE_READ_TOKEN', created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z' } : null, status: 'completed', conclusion: name === 'failure' ? 'failure' : 'success', sets: 0, deletes: 0, dispatches: 0, cancels: 0, calls: [], unknown: [] };
    let result = await execute('operate', name);
    if (name === 'recover') { assert.equal(result.code, 'SIGKILL'); result = await execute('recover', name); assert.equal(scenario.cancels, 1); }
    const expected = ['success204', 'watch-transport', 'recover'].includes(name) ? 0 : 1;
    writeFileSync(join(target, name + '-native.json'), JSON.stringify({ scenario, result: { code: result.code, state: result.state } }, null, 2));
    if (result.code !== expected) console.log(JSON.stringify({ name, code: result.code, state: result.state, unknown: scenario.unknown }));
    assert.equal(result.code, expected, name);
    const refused = ['preexisting', 'wrong-source', 'wrong-pin', 'short-lifetime', 'moved-head', 'changed-workflow', 'stale-source', 'unrelated-ci', 'arbitrary-gh', 'lease-busy', 'custody-lost'].includes(name);
    assert.equal(scenario.dispatches, refused ? 0 : 1, 'one native dispatch, including empty204');
    assert.equal(scenario.deletes, refused || ['foreign', 'same-second-foreign', 'late-foreign', 'missing-receipt', 'ambiguous-receipt'].includes(name) ? 0 : 1, 'only owned secret deleted');
    if (refused) assert.equal(scenario.sets, 0, 'refusal precedes secret mutation');
    assert.equal(scenario.unknown.length, 0, 'all native endpoints bound: ' + JSON.stringify(scenario.unknown));
    assert.ok(!JSON.stringify(result.state).includes(fake), 'no token persisted in operation metadata');
    if (name === 'watch-transport') { assert.equal(result.state.watch.code, 1); assert.equal(result.state.run.conclusion, 'success'); }
    proof.push({ name, exit: result.code, sets: scenario.sets, dispatches: scenario.dispatches, deletes: scenario.deletes, cancels: scenario.cancels, nativeCalls: scenario.calls, state: join(result.operation, 'operation.json') });
  }
  writeFileSync(join(target, 'proof.json'), JSON.stringify({ at: new Date().toISOString(), gh: execFileSync(gh, ['--version'], { encoding: 'utf8' }).split('\n')[0], scope: 'Real installed gh against owned TLS fixture only; no App mint, live provider or product qualification', cases: proof }, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'PASS', cases: proof.length, proof: join(target, 'proof.json') }));
} finally { server.closeAllConnections(); await new Promise(r => server.close(r)); await new Promise(r => proxy.close(r)); }
