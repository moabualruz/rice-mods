import { readFile } from "node:fs/promises";
import { validateMarketplace } from "./marketplace-validation.mjs";

const marketplace = JSON.parse(await readFile(".claude-plugin/marketplace.json", "utf8"));
const readme = await readFile("README.md", "utf8");

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status} for ${url}`);
  return response.json();
}

const validated = await validateMarketplace({
  marketplace,
  readme,
  getRelease: (repository, tag) =>
    fetchJson(`https://api.github.com/repos/${repository}/releases/tags/${tag}`),
  getManifest: (repository, tag) =>
    fetchJson(`https://raw.githubusercontent.com/${repository}/${tag}/.claude-plugin/plugin.json`),
  getCommit: async (repository, tag) =>
    (await fetchJson(`https://api.github.com/repos/${repository}/commits/${tag}`)).sha,
});

for (const plugin of validated) {
  console.log(`Validated ${plugin.name} ${plugin.version} at ${plugin.commit} against published release ${plugin.tag}`);
}
