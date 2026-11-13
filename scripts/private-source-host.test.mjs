import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, writeFileSync, readFileSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { trustedHostExecutable, verifyHostExecutable } from './private-source-host.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mods-host-profile-'));
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
