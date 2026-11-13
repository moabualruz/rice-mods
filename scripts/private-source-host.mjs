import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const profile = JSON.parse(readFileSync(new URL('./private-source-host.json', import.meta.url), 'utf8'));

export function verifyHostExecutable(configuration, name) {
  if (configuration.version !== 1 || configuration.platform !== process.platform || configuration.architecture !== process.arch) throw new Error('supported native host profile required');
  const entry = configuration.executables[name];
  if (!entry || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error('pinned native executable required');
  const path = realpathSync(entry.homeRelative ? join(homedir(), entry.homeRelative) : entry.path);
  const info = lstatSync(path);
  if (!info.isFile() || (info.uid !== process.getuid() && info.uid !== 0) || (info.mode & 0o022)) throw new Error('trusted native executable ownership required');
  const bytes = readFileSync(path);
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('native executable differs from reviewed host profile');
  if (name === 'gh' && bytes.subarray(0, 4).toString('hex') !== '7f454c46') throw new Error('native ELF gh executable required');
  return { path, sha256: entry.sha256 };
}

export function trustedHostExecutable(name) {
  return verifyHostExecutable(profile, name);
}
