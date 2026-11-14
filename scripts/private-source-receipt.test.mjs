import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import test from 'node:test';
import { sha256 } from './private-source-protocol.mjs';

const workflow = readFileSync(new URL('../.github/workflows/private-source-receipt.yml', import.meta.url), 'utf8');
function script(name) {
  const section = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name:')[0];
  const body = section?.split('        run: |\n')[1];
  assert.ok(body, 'actual workflow step must exist');
  return body.split('\n').filter(Boolean).map(line => line.slice(10)).join('\n');
}
const context = script('Require the exact recovery context');
const emit = script('Emit the current secret fingerprint receipt');
const env = { PATH: '/usr/bin:/bin', HOME: homedir(), GITHUB_REPOSITORY: 'moabualruz/rice-mods', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: 'a'.repeat(40), EXPECTED_HEAD: 'a'.repeat(40), SOURCE_REPOSITORY: 'moabualruz/rice-session-accounts', SOURCE_COMMIT: 'b'.repeat(40), ORIGINAL_BINDING_SHA256: 'c'.repeat(64), ORIGINAL_HEAD: 'd'.repeat(40), ORIGINAL_WORKFLOW_SHA256: 'e'.repeat(64), ORIGINAL_RUN_ID: '91', ORIGINAL_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '92', GITHUB_RUN_ATTEMPT: '1', GITHUB_JOB: 'receipt' };

test('receipt workflow exposes only a private main-bound hash operation', () => {
  assert.match(workflow, /permissions: \{\}/);
  assert.ok(!/\buses:|checkout|npm install|curl|gh api/.test(workflow));
  assert.equal((workflow.match(/secrets\.MODS_SOURCE_READ_TOKEN/g) || []).length, 1);
  assert.equal(spawnSync('/bin/bash', ['-n', '-c', context]).status, 0);
  assert.equal(spawnSync('/bin/bash', ['-n', '-c', emit]).status, 0);
  assert.equal(spawnSync('/bin/bash', ['-c', context], { env }).status, 0);
  for (const changed of [{ GITHUB_REF: 'refs/pull/1/merge' }, { GITHUB_SHA: 'f'.repeat(40) }, { SOURCE_REPOSITORY: 'foreign/repository' }, { ORIGINAL_BINDING_SHA256: 'malformed' }, { ORIGINAL_RUN_ATTEMPT: '0' }]) assert.notEqual(spawnSync('/bin/bash', ['-c', context], { env: { ...env, ...changed } }).status, 0, Object.keys(changed).join(','));
});

test('actual Linux workflow hashes the current value without outputting it', { skip: process.platform !== 'linux' }, () => {
  const fake = 'fixture-current-secret-value';
  const result = spawnSync('/bin/bash', ['-x', '-c', emit], { env: { ...env, CURRENT_SECRET: fake, receipt_token: 'fixture-inherited-export', GH_TOKEN: 'fixture-gh', GITHUB_TOKEN: 'fixture-github', MISE_GITHUB_TOKEN: 'fixture-mise' }, encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.ok(!result.stdout.includes(fake));
  assert.ok(!result.stderr.includes(fake));
  const receipt = JSON.parse(result.stdout.trim().replace(/^mods-source-recovery-receipt:/, ''));
  assert.equal(receipt.tokenSHA256, sha256(fake));
  assert.equal(receipt.originalBindingSHA256, env.ORIGINAL_BINDING_SHA256);
  assert.equal(receipt.originalRunID, 91);
  assert.equal(receipt.runID, 92);
  assert.equal(receipt.kind, 'current-secret-value');
  assert.notEqual(spawnSync('/bin/bash', ['-c', emit], { env: { ...env, CURRENT_SECRET: '' } }).status, 0);
});

test('receipt-only launcher never resolves or invokes an issuer', { skip: process.platform !== 'linux' || process.arch !== 'x64' }, () => {
  const root = mkdtempSync(join(homedir(), '.mods-receipt-launcher-'));
  const scripts = join(root, 'scripts'); mkdirSync(scripts);
  writeFileSync(join(scripts, 'private-source-qualification.sh'), readFileSync(new URL('./private-source-qualification.sh', import.meta.url)));
  writeFileSync(join(scripts, 'private-repositories.json'), JSON.stringify([env.SOURCE_REPOSITORY]));
  const receiver = join(root, 'managed-receiver');
  const marker = join(root, 'receiver-proof');
  writeFileSync(receiver, `#!/bin/bash
set -eu
test -z "\${GH_TOKEN+x}\${GITHUB_TOKEN+x}\${MISE_GITHUB_TOKEN+x}\${RICE_RELEASE_DOWNLOAD_TOKEN+x}\${RICE_RELEASE_DOWNLOAD_TOKEN_EXPIRES_AT+x}"
out=$(/usr/bin/readlink "/proc/$$/fd/1")
ready=
case "$out" in
  */controller-command.log) ready="$4/launcher-start.json" ;;
  */resume-command.*) ready="$out.start.json" ;;
esac
if [ -n "$ready" ]; then
  for _ in $(/usr/bin/seq 1 100); do [ ! -s "$ready" ] || break; /bin/sleep 0.01; done
  test -s "$ready"
fi
printf '%s\\n' "$2" >> '${marker}'
`, { mode: 0o755 });
  const gh = execFileSync('which', ['gh'], { encoding: 'utf8' }).trim();
  const pin = path => ({ path, sha256: sha256(readFileSync(path)) });
  writeFileSync(join(scripts, 'private-source-host.json'), JSON.stringify({ version: 1, platform: 'linux', architecture: 'x64', executables: { gh: pin(gh), node: pin(receiver), timeout: pin('/usr/bin/timeout') } }));
  const binding = join(root, 'binding.json'); writeFileSync(binding, JSON.stringify({ sourceRepository: env.SOURCE_REPOSITORY }));
  const operation = join(root, 'operation');
  const result = spawnSync('/bin/bash', [join(scripts, 'private-source-qualification.sh'), '--receipt-recovery', binding, operation, join(root, 'original-binding.json'), join(root, 'original-operation')], { env: { ...process.env, XDG_STATE_HOME: root, GH_TOKEN: 'fixture-gh', GITHUB_TOKEN: 'fixture-github', MISE_GITHUB_TOKEN: 'fixture-mise', RICE_RELEASE_DOWNLOAD_TOKEN: 'fixture-source', RICE_RELEASE_DOWNLOAD_TOKEN_EXPIRES_AT: 'fixture-expiry' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(marker, 'utf8'), 'receipt-recover\n');
  assert.ok(!existsSync(join(operation, 'helper-command.log')));
  const start = JSON.parse(readFileSync(join(operation, 'launcher-start.json')));
  assert.equal(start.issuerUsed, false);
  assert.ok(!('helperSHA256' in start));
  const originalStart = readFileSync(join(operation, 'launcher-start.json'), 'utf8');
  writeFileSync(join(operation, 'operation.json'), JSON.stringify({ kind: 'receipt-recovery' }), { mode: 0o600 });
  const resumed = spawnSync('/bin/bash', [join(scripts, 'private-source-qualification.sh'), '--resume-receipt', binding, operation], { env: { ...process.env, XDG_STATE_HOME: root }, encoding: 'utf8' });
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(readFileSync(marker, 'utf8'), 'receipt-recover\nrecover\nrecover\n');
  assert.equal(readFileSync(join(operation, 'launcher-start.json'), 'utf8'), originalStart);
});
