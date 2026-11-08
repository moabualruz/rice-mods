import { readFile } from "node:fs/promises";
import { createGithubJsonFetcher } from "./github-fetch.mjs";
import { validateMarketplace } from "./marketplace-validation.mjs";

const marketplace = JSON.parse(await readFile(".claude-plugin/marketplace.json", "utf8"));
const readme = await readFile("README.md", "utf8");
const fetchJson = createGithubJsonFetcher({ token: process.env.GITHUB_TOKEN });

const validated = await validateMarketplace({
  marketplace,
  readme,
  getRelease: (repository, tag) =>
    fetchJson(`https://api.github.com/repos/${repository}/releases/tags/${tag}`),
  getManifest: async (repository, tag) => {
    const file = await fetchJson(
      `https://api.github.com/repos/${repository}/contents/.claude-plugin/plugin.json?ref=${tag}`,
    );
    return JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
  },
  getCommit: async (repository, tag) =>
    (await fetchJson(`https://api.github.com/repos/${repository}/commits/${tag}`)).sha,
});

for (const plugin of validated) {
  console.log(`Validated ${plugin.name} ${plugin.version} at ${plugin.commit} against published release ${plugin.tag}`);
}
