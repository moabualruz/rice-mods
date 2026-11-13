import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const profile = JSON.parse(readFileSync(new URL('./private-source-host.json', import.meta.url), 'utf8'));

export function trustedHostExecutable(name) {
  if (profile.version !== 1 || profile.platform !== process.platform || profile.architecture !== process.arch) throw new Error('supported native host profile required');
  const entry = profile.executables[name];
  if (!entry || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error('pinned native executable required');
  const path = realpathSync(entry.homeRelative ? join(homedir(), entry.homeRelative) : entry.path);
  const info = lstatSync(path);
  if (!info.isFile() || (info.uid !== process.getuid() && info.uid !== 0) || (info.mode & 0o022)) throw new Error('trusted native executable ownership required');
  if (createHash('sha256').update(readFileSync(path)).digest('hex') !== entry.sha256) throw new Error('native executable differs from reviewed host profile');
  return { path, sha256: entry.sha256 };
}
