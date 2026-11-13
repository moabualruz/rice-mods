import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, writeFileSync, readFileSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { trustedHostExecutable, verifyHostExecutable } from './private-source-host.mjs';

function fixture() {
  const root = mkdtempSync(join(homedir(), '.mods-host-profile-'));
  const path = join(root, 'native-tool');
  const bytes = '#!/bin/sh\nexit 0\n';
  writeFileSync(path, bytes, { mode: 0o755 });
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const profile = { version: 1, platform: process.platform, architecture: process.arch, executables: { tool: { path, sha256 } } };
  return { path, bytes, profile };
}

test('the production executable verifier admits only owned pinned bytes', () => {
  const { path, profile } = fixture();
  const verified = verifyHostExecutable(profile, 'tool');
  assert.equal(verified.path, realpathSync(path));
  assert.equal(spawnSync(verified.path).status, 0);
});

test('the production executable verifier rejects tampered and writable code', () => {
  const changed = fixture();
  writeFileSync(changed.path, changed.bytes + '# changed\n');
  assert.throws(() => verifyHostExecutable(changed.profile, 'tool'), /differs from reviewed/);
  const writable = fixture();
  chmodSync(writable.path, 0o775);
  assert.throws(() => verifyHostExecutable(writable.profile, 'tool'), /ownership required/);
});

test('the production profile and verifier refuse missing or unknown recipients', () => {
  assert.throws(() => trustedHostExecutable('unreviewed-recipient'));
  const { profile } = fixture();
  profile.executables.tool.path += '.missing';
  assert.throws(() => verifyHostExecutable(profile, 'tool'));
  assert.throws(() => verifyHostExecutable({ ...profile, platform: 'unsupported' }, 'tool'), /host profile required/);
});

test('a pinned gh wrapper is refused before credential preparation or execution', () => {
  const { path, profile } = fixture();
  profile.executables.gh = profile.executables.tool;
  assert.throws(() => verifyHostExecutable(profile, 'gh'), /native ELF gh executable required/);
  if (process.platform !== 'linux' || process.arch !== 'x64') return;
  const root = mkdtempSync(join(tmpdir(), 'mods-gh-launcher-'));
  writeFileSync(join(root, 'private-source-qualification.sh'), readFileSync(new URL('./private-source-qualification.sh', import.meta.url)));
  writeFileSync(join(root, 'private-source-host.json'), JSON.stringify(profile));
  const operation = join(root, 'operation');
  const result = spawnSync('/bin/bash', [join(root, 'private-source-qualification.sh'), join(root, 'absent-binding.json'), operation], { encoding: 'utf8', env: { ...process.env, XDG_STATE_HOME: root } });
  assert.equal(result.status, 69);
  assert.match(result.stderr, /reviewed native gh executable unavailable/);
  assert.ok(!existsSync(join(operation, 'helper-command.log')));
});

test('each credential recipient under a writable parent is refused before credential preparation', () => {
  const names = { gh: 'reviewed native gh executable unavailable', 'rice-helper': 'reviewed Rice helper unavailable', 'bao-run': 'reviewed operator executable unavailable', node: 'reviewed mise Node executable unavailable', timeout: 'reviewed timeout executable unavailable' };
  for (const [name, reason] of Object.entries(names)) {
    const { path, profile } = fixture();
    const bytes = Buffer.from('7f454c4600000000', 'hex');
    writeFileSync(path, bytes);
    profile.executables[name] = { path, sha256: createHash('sha256').update(bytes).digest('hex') };
    chmodSync(join(path, '..'), 0o775);
    assert.throws(() => verifyHostExecutable(profile, name), /trusted native executable ancestors required/);
    if (process.platform !== 'linux' || process.arch !== 'x64') continue;
    const trustedPath = realpathSync('/usr/bin/true');
    const trustedSHA256 = createHash('sha256').update(readFileSync(trustedPath)).digest('hex');
    for (const recipient of Object.keys(names)) if (recipient !== name) profile.executables[recipient] = { path: trustedPath, sha256: trustedSHA256 };
    const root = mkdtempSync(join(tmpdir(), 'mods-gh-parent-launcher-'));
    writeFileSync(join(root, 'private-source-qualification.sh'), readFileSync(new URL('./private-source-qualification.sh', import.meta.url)));
    writeFileSync(join(root, 'private-source-host.json'), JSON.stringify(profile));
    const allowlist = readFileSync(new URL('./private-repositories.json', import.meta.url));
    writeFileSync(join(root, 'private-repositories.json'), allowlist);
    const binding = join(root, 'binding.json');
    writeFileSync(binding, JSON.stringify({ sourceRepository: JSON.parse(allowlist)[0] }));
    const operation = join(root, 'operation');
    const result = spawnSync('/bin/bash', [join(root, 'private-source-qualification.sh'), binding, operation], { encoding: 'utf8', env: { ...process.env, XDG_STATE_HOME: root } });
    assert.equal(result.status, 69);
    assert.ok(result.stderr.includes(reason));
    assert.ok(!existsSync(join(operation, 'helper-command.log')));
  }
});
