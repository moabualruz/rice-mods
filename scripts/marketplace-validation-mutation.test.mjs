import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = "moabualruz/rice-example";
const commit = "a".repeat(40);
const tag = "rice-example--v1.2.3";
const manifestCheck = "if (manifest.name !== plugin.name || manifest.version !== version) {";

test("the manifest mismatch assertion detects a weakened name/version check", async () => {
  const source = await readFile(new URL("./marketplace-validation.mjs", import.meta.url), "utf8");
  assert.equal(source.split(manifestCheck).length - 1, 1, "expected exactly one manifest identity check to mutate");
  const weakenedSource = source.replace(manifestCheck, "if (false) {");
  const weakenedModule = await import(
    `data:text/javascript;base64,${Buffer.from(weakenedSource).toString("base64")}`
  );

  const behavioralAssertion = assert.rejects(
    () =>
      weakenedModule.validateMarketplace({
        marketplace: {
          plugins: [{ name: "rice-example", source: { source: "github", repo: repository, sha: commit } }],
        },
        readme: `| [Rice Example](https://github.com/${repository}#readme) 1.2.3 | Example plugin |`,
        getRelease: async () => ({
          tag_name: tag,
          draft: false,
          prerelease: false,
          published_at: "2026-01-01T00:00:00Z",
        }),
        getManifest: async () => ({ name: "different-plugin", version: "9.9.9" }),
        getCommit: async () => commit,
      }),
    /does not match its release manifest/,
  );
  await assert.rejects(behavioralAssertion, { name: "AssertionError" });
});
