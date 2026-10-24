function fail(message) {
  throw new Error(message);
}

export async function validateMarketplace({ marketplace, readme, getRelease, getManifest }) {
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
  const validated = [];
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
    const release = await getRelease(repository, tag);
    if (release.tag_name !== tag || release.draft || release.prerelease || !release.published_at) {
      fail(`${repository} ${tag} is not a published stable release`);
    }

    const manifest = await getManifest(repository, tag);
    if (manifest.name !== plugin.name || manifest.version !== version) {
      fail(
        `${repository} README version ${version} does not match its release manifest ` +
          `(${manifest.name ?? "unnamed"} ${manifest.version ?? "unversioned"})`,
      );
    }
    validated.push({ name: plugin.name, version, tag });
  }

  for (const repository of readmeVersions.keys()) {
    if (!seenRepositories.has(repository)) fail(`README has a version row not present in marketplace.json: ${repository}`);
  }

  return validated;
}
