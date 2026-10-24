import { readFile } from "node:fs/promises";

const marketplacePath = ".claude-plugin/marketplace.json";
const readmePath = "README.md";

function fail(message) {
  throw new Error(message);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail(`Cannot parse ${path}: ${error.message}`);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/vnd.github+json" },
  });
  if (!response.ok) fail(`GitHub returned HTTP ${response.status} for ${url}`);
  return response.json();
}

const marketplace = await readJson(marketplacePath);
const readme = await readFile(readmePath, "utf8");
const readmeVersions = new Map();
const versionRows = readme.matchAll(
  /^\|\s*\[[^\]]+\]\(https:\/\/github\.com\/([^)#]+)(?:#readme)?\)\s+(\d+\.\d+\.\d+)\s+\|/gm,
);

for (const [, repository, version] of versionRows) {
  if (readmeVersions.has(repository)) fail(`README lists ${repository} more than once`);
  readmeVersions.set(repository, version);
}

if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
  fail("Marketplace must contain at least one plugin");
}

const seenRepositories = new Set();
for (const plugin of marketplace.plugins) {
  const repository = plugin.source?.repo;
  if (plugin.source?.source !== "github" || typeof repository !== "string") {
    fail(`Marketplace plugin ${plugin.name ?? "(unnamed)"} must use a GitHub repository source`);
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    fail(`Marketplace plugin ${plugin.name} has an invalid GitHub repository source`);
  }
  if (seenRepositories.has(repository)) fail(`Marketplace lists ${repository} more than once`);
  seenRepositories.add(repository);

  const version = readmeVersions.get(repository);
  if (!version) fail(`README has no version row for ${repository}`);

  const repositoryName = repository.split("/").at(-1);
  const tag = `${repositoryName}--v${version}`;
  const releaseUrl = `https://api.github.com/repos/${repository}/releases/tags/${tag}`;
  const release = await fetchJson(releaseUrl);
  if (release.tag_name !== tag || release.draft || release.prerelease) {
    fail(`${repository} ${tag} is not a published stable release`);
  }

  const manifestUrl = `https://raw.githubusercontent.com/${repository}/${tag}/.claude-plugin/plugin.json`;
  const manifestResponse = await fetch(manifestUrl);
  if (!manifestResponse.ok) {
    fail(`Could not fetch .claude-plugin/plugin.json for ${repository} ${tag} (HTTP ${manifestResponse.status})`);
  }
  let manifest;
  try {
    manifest = await manifestResponse.json();
  } catch (error) {
    fail(`Could not parse the plugin manifest for ${repository} ${tag}: ${error.message}`);
  }

  if (manifest.name !== plugin.name || manifest.version !== version) {
    fail(
      `${repository} README version ${version} does not match its release manifest ` +
        `(${manifest.name ?? "unnamed"} ${manifest.version ?? "unversioned"})`,
    );
  }
  console.log(`Validated ${plugin.name} ${version} against published release ${tag}`);
}

for (const repository of readmeVersions.keys()) {
  if (!seenRepositories.has(repository)) fail(`README has a version row not present in marketplace.json: ${repository}`);
}
