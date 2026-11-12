import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("./marketplace-lock.mjs", import.meta.url).pathname;
const sha = "a".repeat(40);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "marketplace-lock-"));
  mkdirSync(join(root, ".claude-plugin"));
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, ".claude-plugin/marketplace.json"), JSON.stringify({ plugins: [{ name: "example", source: { source: "github", repo: "owner/example", sha } }] }));
  writeFileSync(join(root, "README.md"), "| [Example](https://github.com/owner/example#readme) 1.2.3 | Example |\n");
  writeFileSync(join(root, "bin/gh"), `#!/usr/bin/env node
const {createHash} = require('node:crypto');
if (process.argv[2] === 'auth') process.exit(process.env.UNAUTH ? 1 : 0);
const arg = process.argv[3];
if (arg.includes('/commits/')) console.log(JSON.stringify({sha: process.env.MOVED ? '${"b".repeat(40)}' : '${sha}'}));
else if (process.env.NO_LIMITS) process.exit(1);
else {
 const text = process.env.PLACEHOLDER ? '- Host: [fill in]\\n' : '# Limits\\n\\nHost permissions remain in force. Network access depends on provider configuration.\\n';
 const bytes = Buffer.from(text);
 const blob = createHash('sha1').update('blob ' + bytes.length + '\\0').update(bytes).digest('hex');
 console.log(JSON.stringify({type: 'file', encoding: 'base64', content: bytes.toString('base64'), sha: blob}));
}
`, { mode: 0o755 });
  return root;
}

function run(root, command, extra = {}) {
  return spawnSync(process.execPath, [script, command, "--root", root], { encoding: "utf8", env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, GITHUB_ACTIONS: "false", ...extra } });
}

function generated() {
  const root = fixture();
  const result = run(root, "generate");
  assert.equal(result.status, 0, result.stderr);
  return root;
}

test("rejects an invalid limits blob id offline", () => {
  const root = generated();
  const path = join(root, ".claude-plugin/marketplace.lock.json");
  const lock = JSON.parse(readFileSync(path, "utf8"));
  lock.plugins[0].limits = "invalid";
  writeFileSync(path, JSON.stringify(lock));
  assert.notEqual(run(root, "verify").status, 0);
});

test("rejects a marketplace entry without a lock entry", () => {
  const root = generated();
  const path = join(root, ".claude-plugin/marketplace.json");
  const marketplace = JSON.parse(readFileSync(path, "utf8"));
  marketplace.plugins.push({ name: "extra", source: { source: "github", repo: "owner/extra", sha } });
  writeFileSync(path, JSON.stringify(marketplace));
  assert.notEqual(run(root, "verify").status, 0);
});

test("rejects a moved tag in online mode", () => {
  const root = generated();
  assert.equal(run(root, "verify-online").status, 0);
  assert.notEqual(run(root, "verify-online", { MOVED: "1" }).status, 0);
});

test("rejects an absent or placeholder LIMITS.md", () => {
  const root = generated();
  assert.notEqual(run(root, "generate", { NO_LIMITS: "1" }).status, 0);
  assert.notEqual(run(root, "generate", { PLACEHOLDER: "1" }).status, 0);
});

test("rejects a changed limits blob online", () => {
  const root = generated();
  const path = join(root, ".claude-plugin/marketplace.lock.json");
  const lock = JSON.parse(readFileSync(path, "utf8"));
  lock.plugins[0].limits = "b".repeat(40);
  writeFileSync(path, JSON.stringify(lock));
  assert.notEqual(run(root, "verify-online").status, 0);
});

test("offline verification reports its source verification boundary", () => {
  const root = generated();
  const result = run(root, "verify", { UNAUTH: "1" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /source and LIMITS verification skipped: requires authenticated access to private plugin repositories/);
});

test("generator refuses unauthenticated access", () => {
  const root = fixture();
  assert.notEqual(run(root, "generate", { UNAUTH: "1" }).status, 0);
});
