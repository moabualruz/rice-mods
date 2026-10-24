import assert from "node:assert/strict";
import test from "node:test";
import { validateMarketplace } from "./marketplace-validation.mjs";

const repository = "moabualruz/rice-example";
const commit = "a".repeat(40);
const tag = "rice-example--v1.2.3";
const marketplace = {
  plugins: [
    {
      name: "rice-example",
      source: { source: "github", repo: repository, sha: commit },
    },
  ],
};
const readme = `| [Rice Example](https://github.com/${repository}#readme) 1.2.3 | Example plugin |`;
const release = { tag_name: tag, draft: false, prerelease: false, published_at: "2026-01-01T00:00:00Z" };
const manifest = { name: "rice-example", version: "1.2.3" };

function input(overrides = {}) {
  return {
    marketplace,
    readme,
    getRelease: async () => release,
    getManifest: async () => manifest,
    getCommit: async () => commit,
    ...overrides,
  };
}

test("accepts a published stable release pinned to its exact commit", async () => {
  const refs = [];
  const result = await validateMarketplace(
    input({
      getRelease: async (repo, ref) => {
        refs.push([repo, ref]);
        return release;
      },
      getManifest: async (repo, ref) => {
        refs.push([repo, ref]);
        return manifest;
      },
      getCommit: async (repo, ref) => {
        refs.push([repo, ref]);
        return commit;
      },
    }),
  );
  assert.deepEqual(result, [{ name: "rice-example", version: "1.2.3", tag, commit }]);
  assert.deepEqual(refs, [[repository, tag], [repository, tag], [repository, tag]]);
});

test("rejects missing and duplicate README version rows", async () => {
  await assert.rejects(() => validateMarketplace(input({ readme: "" })), /README has no version row/);
  await assert.rejects(
    () => validateMarketplace(input({ readme: `${readme}\n${readme}` })),
    /README lists .* more than once/,
  );
});

test("rejects duplicate repositories and non-GitHub marketplace sources", async () => {
  await assert.rejects(
    () => validateMarketplace(input({ marketplace: { plugins: [...marketplace.plugins, ...marketplace.plugins] } })),
    /Marketplace lists .* more than once/,
  );
  await assert.rejects(
    () =>
      validateMarketplace(
        input({ marketplace: { plugins: [{ name: "rice-example", source: { source: "directory", path: "plugins/example" } }] } }),
      ),
    /must use a GitHub repository source/,
  );
});

test("requires an exact source.sha commit pin", async () => {
  for (const sha of [undefined, commit.slice(1), commit.toUpperCase()]) {
    const source = { source: "github", repo: repository, ...(sha === undefined ? {} : { sha }) };
    await assert.rejects(
      () => validateMarketplace(input({ marketplace: { plugins: [{ name: "rice-example", source }] } })),
      /must set source.sha to an exact commit SHA/,
    );
  }
});

test("rejects a commit pin that differs from the published release", async () => {
  await assert.rejects(() => validateMarketplace(input({ getCommit: async () => "b".repeat(40) })),
    /marketplace commit pin does not match/);
});

test("rejects unpublished, draft, prerelease, and mismatched release tags", async () => {
  for (const invalidRelease of [
    { ...release, published_at: null },
    { ...release, draft: true },
    { ...release, prerelease: true },
    { ...release, tag_name: "other-tag" },
  ]) {
    await assert.rejects(
      () => validateMarketplace(input({ getRelease: async () => invalidRelease })),
      /not a published stable release/,
    );
  }
});

test("rejects plugin manifest name and version mismatches", async () => {
  await assert.rejects(
    () => validateMarketplace(input({ getManifest: async () => ({ ...manifest, name: "other-plugin" }) })),
    /does not match its release manifest/,
  );
  await assert.rejects(
    () => validateMarketplace(input({ getManifest: async () => ({ ...manifest, version: "1.2.2" }) })),
    /does not match its release manifest/,
  );
});

test("rejects README rows not backed by a marketplace source", async () => {
  await assert.rejects(
    () => validateMarketplace(input({ readme: `${readme}\n| [Other](https://github.com/owner/other#readme) 1.0.0 | Other |` })),
    /not present in marketplace.json/,
  );
});
