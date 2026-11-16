import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const shaPattern = /^[0-9a-f]{40}$/;
const skipMessage = "source and LIMITS verification skipped: requires authenticated GitHub access to the plugin repositories";

function fail(message) { throw new Error(message); }

function marketplaceEntries(marketplace, readme) {
  const versions = new Map();
  for (const [, repo, version] of readme.matchAll(/^\|\s*\[[^\]]+\]\(https:\/\/github\.com\/([^)#]+)(?:#readme)?\)\s+(\d+\.\d+\.\d+)\s+\|/gm)) {
    if (versions.has(repo)) fail(`Duplicate README entry: ${repo}`);
    versions.set(repo, version);
  }
  if (!Array.isArray(marketplace.plugins) || !marketplace.plugins.length) fail("Marketplace has no plugins");
  const seen = new Set();
  const entries = marketplace.plugins.map((plugin) => {
    const { source, repo, sha } = plugin.source || {};
    if (source !== "github" || typeof repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !shaPattern.test(sha || "")) fail("Invalid marketplace source");
    if (seen.has(repo)) fail(`Duplicate marketplace entry: ${repo}`);
    seen.add(repo);
    const version = versions.get(repo);
    if (!version) fail(`Missing README version: ${repo}`);
    if (plugin.version !== undefined && plugin.version !== version) fail(`Marketplace version mismatch: ${repo}`);
    return { repo, tag: `${repo.split("/")[1]}--v${version}`, commit: sha };
  });
  if (versions.size !== seen.size) fail("README contains an extra marketplace version");
  return entries;
}

export function validateMarketplaceLock(marketplace, readme, lock) {
  const entries = marketplaceEntries(marketplace, readme);
  if (lock?.version !== 1 || !Array.isArray(lock.plugins) || lock.plugins.length !== entries.length) fail("Lock entries do not match marketplace");
  const byRepo = new Map();
  for (const entry of lock.plugins) {
    if (!entry || Object.keys(entry).sort().join(",") !== "commit,limits,repo,tag" || byRepo.has(entry.repo) || !shaPattern.test(entry.limits || "")) fail("Invalid or duplicate lock entry");
    byRepo.set(entry.repo, entry);
  }
  for (const entry of entries) {
    const locked = byRepo.get(entry.repo);
    if (!locked || locked.tag !== entry.tag || locked.commit !== entry.commit) fail(`Lock mismatch: ${entry.repo}`);
  }
  return lock.plugins;
}

function gh(...args) {
  try { return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 4 * 1024 * 1024 }); }
  catch { fail("GitHub request or authentication failed"); }
}

function authenticated() {
  try { gh("auth", "status"); return true; } catch { return false; }
}

function verifySource(entry) {
  const commit = JSON.parse(gh("api", `repos/${entry.repo}/commits/${entry.tag}`));
  if (commit.sha !== entry.commit) fail(`Tag does not resolve to pinned commit: ${entry.repo}`);
  const file = JSON.parse(gh("api", `repos/${entry.repo}/contents/LIMITS.md?ref=${entry.commit}`));
  if (file.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string" || !shaPattern.test(file.sha || "")) fail(`Invalid LIMITS.md: ${entry.repo}`);
  const bytes = Buffer.from(file.content, "base64");
  const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  const text = bytes.toString("utf8");
  let visible = "";
  let position = 0;
  while (position < text.length) {
    const start = text.indexOf("<!--", position);
    if (start === -1) { visible += text.slice(position); break; }
    visible += text.slice(position, start);
    const normal = text.indexOf("-->", start + 4);
    const alternate = text.indexOf("--!>", start + 4);
    const end = normal === -1 ? alternate : alternate === -1 ? normal : Math.min(normal, alternate);
    if (end === -1) break;
    position = end + (end === alternate ? 4 : 3);
  }
  const prose = visible.split(/\r?\n/).filter((line) => !/^\s*#/.test(line)).join(" ").replace(/[^\p{L}\p{N}]/gu, "");
  if (prose.length < 40 || /^[\t ]*-[\t ]+[^:]+:[\t ]*\[[^\]]+\][\t ]*$|^[\t ]*\[[^\]]+\][\t ]*$/m.test(text)) fail(`LIMITS.md is not substantive or contains placeholders: ${entry.repo}`);
  if (blob !== file.sha) fail(`Invalid LIMITS.md blob: ${entry.repo}`);
  return blob;
}

function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);
  if (!["generate", "verify", "verify-online"].includes(command) || (args.length && (args.length !== 2 || args[0] !== "--root"))) fail("Usage: marketplace-lock.mjs generate|verify|verify-online [--root directory]");
  const root = args[1] || process.cwd();
  const marketplace = JSON.parse(readFileSync(join(root, ".claude-plugin/marketplace.json"), "utf8"));
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const path = join(root, ".claude-plugin/marketplace.lock.json");
  if (command === "generate") {
    if (!authenticated()) fail("Lock generation requires authenticated GitHub access");
    const plugins = marketplaceEntries(marketplace, readme).map((entry) => ({ ...entry, limits: verifySource(entry) }));
    writeFileSync(path, `${JSON.stringify({ version: 1, plugins }, null, 2)}\n`);
    console.log("Generated marketplace lock from authenticated sources");
    return;
  }
  const entries = validateMarketplaceLock(marketplace, readme, JSON.parse(readFileSync(path, "utf8")));
  if (command === "verify") { console.log(skipMessage); return; }
  if (!authenticated()) fail("Online verification requires authenticated GitHub access");
  for (const entry of entries) if (verifySource(entry) !== entry.limits) fail(`LIMITS.md blob mismatch: ${entry.repo}`);
  console.log("Verified marketplace sources and LIMITS.md at pinned commits");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
