import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const sha = "a".repeat(40);
const source = (name = "example", repo = "owner/example") => ({ name, source: { source: "github", repo, sha } });

function fixture(plugins = [source()]) {
  const root = mkdtempSync(join(tmpdir(), "plugin-source-check-"));
  for (const path of ["scripts", "bin", ".claude-plugin", "release-packages/scripts", "source/.claude-plugin", "source/hooks"]) {
    mkdirSync(join(root, path), { recursive: true });
  }
  for (const path of ["scripts/plugin-source-check.sh", "release-packages/scripts/plugin.sh"]) {
    copyFileSync(new URL(`../${path}`, import.meta.url), join(root, path));
  }
  writeFileSync(join(root, ".claude-plugin/marketplace.json"), JSON.stringify({ plugins }));
  writeFileSync(join(root, "scripts/private-repositories.json"), '["owner/example"]');
  writeFileSync(join(root, "source/.claude-plugin/plugin.json"), JSON.stringify({ name: "example", version: "1.0.0", description: "Fixture", license: "MIT" }));
  writeFileSync(join(root, "source/hooks/hooks.json"), '{"modules":["register.ts"]}');
  writeFileSync(join(root, "source/hooks/register.ts"), "export default () => {};\n");
  const archive = spawnSync("tar", ["-czf", join(root, "source.tgz"), "-C", root, "source"], { encoding: "utf8" });
  assert.equal(archive.status, 0, archive.stderr);
  writeFileSync(join(root, "bin/gh"), `#!/usr/bin/env bash
set -euo pipefail
[ "$1" = api ] || exit 90
[ "$GH_TOKEN" = "$FIXTURE_EXPECTED_TOKEN" ] || exit 91
printf '%s\\n' "$2" >> "$FIXTURE_ROOT/requests"
if [ "$FIXTURE_STATUS" != success ]; then
  printf 'HTTP %s %s\\n' "$FIXTURE_STATUS" "$GH_TOKEN" >&2
  exit 1
fi
cat "$FIXTURE_ROOT/source.tgz"
`, { mode: 0o755 });
  writeFileSync(join(root, "bin/claude"), `#!/usr/bin/env bash
set -euo pipefail
for variable in GH_TOKEN GITHUB_TOKEN MISE_GITHUB_TOKEN RICE_RELEASE_DOWNLOAD_TOKEN RICE_RELEASE_DOWNLOAD_TOKEN_EXPIRES_AT plugin_source_read_token; do
  if printenv "$variable" >/dev/null; then exit 92; fi
done
if [ "$1" = --version ]; then echo '0.0.0 fixture'; exit 0; fi
printf 'validate\\n' >> "$FIXTURE_ROOT/validations"
[ "$FIXTURE_VALIDATOR_FAIL" != true ] || exit 1
printf '{"success":true,"manifest":{"errors":[]},"contents":[]}\\n'
`, { mode: 0o755 });
  writeFileSync(join(root, "bin/tar"), `#!/usr/bin/env bash
set -euo pipefail
for variable in GH_TOKEN GITHUB_TOKEN MISE_GITHUB_TOKEN RICE_RELEASE_DOWNLOAD_TOKEN RICE_RELEASE_DOWNLOAD_TOKEN_EXPIRES_AT plugin_source_read_token; do
  if printenv "$variable" >/dev/null; then exit 93; fi
done
exec /usr/bin/tar "$@"
`, { mode: 0o755 });
  return root;
}

function run(root, extra = {}, args = []) {
  return spawnSync("bash", [join(root, "scripts/plugin-source-check.sh"), ...args], {
    encoding: "utf8",
    env: { PATH: `${join(root, "bin")}:${process.env.PATH}`, HOME: root, FIXTURE_ROOT: root, FIXTURE_STATUS: "404", FIXTURE_VALIDATOR_FAIL: "false", FIXTURE_EXPECTED_TOKEN: "synthetic-token-sentinel", GITHUB_ACTIONS: "true", GITHUB_TOKEN: "synthetic-token-sentinel", ...extra },
  });
}

test("hosted skips only declared private repositories for unreadable status codes", () => {
  for (const status of ["401", "403", "404"]) {
    const root = fixture();
    const result = run(root, { FIXTURE_STATUS: status });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /0 checked, 1 skipped/);
    assert.ok(!existsSync(join(root, "validations")));
  }
  const root = fixture([source("other", "owner/other")]);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot download other.*HTTP 404/);
});

test("arguments are rejected before any download", () => {
  const root = fixture();
  assert.notEqual(run(root, {}, ["--repo", "owner/example"]).status, 0);
  assert.ok(!existsSync(join(root, "requests")));
});

test("the extractor and validator refuse inherited credential variables after a download", () => {
  const root = fixture();
  const result = run(root, {
    FIXTURE_STATUS: "success",
    LIVE_RELEASE_CHECK: "required",
    GH_TOKEN: "synthetic-operator-token",
    MISE_GITHUB_TOKEN: "synthetic-mise-token",
    plugin_source_read_token: "synthetic-exported-parent-token",
    GITHUB_TOKEN: "synthetic-scoped-token",
    FIXTURE_EXPECTED_TOKEN: "synthetic-scoped-token",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(root, "validations"), "utf8"), "validate\n");
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-(operator|mise|scoped|exported-parent)-token|synthetic-expiry/);
});

test("local and required checks refuse unreadable private repositories", () => {
  for (const extra of [{ GITHUB_ACTIONS: "false" }, { LIVE_RELEASE_CHECK: "required" }]) {
    const result = run(fixture(), extra);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /skipped/);
  }
});

test("an empty private allowlist permits no hosted skips", () => {
  const root = fixture();
  writeFileSync(join(root, "scripts/private-repositories.json"), "[]");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot download example.*HTTP 404/);
});

test("server and native command failures cannot become hosted skips or disclose diagnostics", () => {
  for (const status of ["500", "transport"]) {
    const result = run(fixture(), { FIXTURE_STATUS: status });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-token-sentinel|skipped/);
    assert.match(result.stderr, status === "500" ? /HTTP 500/ : /native-command/);
  }
});

test("downloads run the actual vendored checker for every source even when not allowlisted", () => {
  const root = fixture([source(), source("other", "owner/other")]);
  const result = run(root, { FIXTURE_STATUS: "success" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 checked, 0 skipped/);
  assert.equal(readFileSync(join(root, "validations"), "utf8"), "validate\nvalidate\n");
  assert.equal(readFileSync(join(root, "requests"), "utf8"), `repos/owner/example/tarball/${sha}\nrepos/owner/other/tarball/${sha}\n`);
});

test("a downloaded source failing validation always fails hosted checking", () => {
  const result = run(fixture(), { FIXTURE_STATUS: "success", FIXTURE_VALIDATOR_FAIL: "true" });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /skipped/);
});

test("malformed or partially valid source input fails before any download", () => {
  for (const bad of [null, source("../escape"), { ...source("other"), source: { source: "url" } }, source("other", "bad"), { ...source("other"), source: { ...source().source, sha: "bad" } }, source()]) {
    const root = fixture([source(), bad]);
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid marketplace source input/);
    assert.ok(!existsSync(join(root, "requests")));
  }
  for (const input of ["{", '{"plugins":[]}', '{"plugins":{}}']) {
    const root = fixture();
    writeFileSync(join(root, ".claude-plugin/marketplace.json"), input);
    assert.notEqual(run(root).status, 0);
    assert.ok(!existsSync(join(root, "requests")));
  }
});

test("invalid or partially valid private allowlists fail before any download", () => {
  for (const input of ['["owner/example",42]', '["owner/example","owner/example"]', "{", "{}"]) {
    const root = fixture();
    writeFileSync(join(root, "scripts/private-repositories.json"), input);
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid private repository allowlist/);
    assert.ok(!existsSync(join(root, "requests")));
  }
});
