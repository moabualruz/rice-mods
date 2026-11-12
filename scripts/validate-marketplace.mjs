import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createGithubJsonFetcher } from "./github-fetch.mjs";
import { validateMarketplace } from "./marketplace-validation.mjs";

const live = process.env.LIVE_RELEASE_CHECK === "required";
const lockCheck = spawnSync(process.execPath, [new URL("./marketplace-lock.mjs", import.meta.url).pathname, live ? "verify-online" : "verify"], { stdio: "inherit" });
if (lockCheck.status !== 0) process.exit(lockCheck.status || 1);
if (!live) process.exit(0);

const marketplace = JSON.parse(await readFile(".claude-plugin/marketplace.json", "utf8"));
const readme = await readFile("README.md", "utf8");
const fetchJson = createGithubJsonFetcher({ token: process.env.GITHUB_TOKEN });
const privateRepositories = JSON.parse(await readFile(new URL("./private-repositories.json", import.meta.url), "utf8"));
const hostedSkipAllowed = process.env.GITHUB_ACTIONS === "true" && process.env.LIVE_RELEASE_CHECK !== "required";

const validated = await validateMarketplace({
  marketplace,
  readme,
  lock: JSON.parse(await readFile(".claude-plugin/marketplace.lock.json", "utf8")),
  skippableRepositories: hostedSkipAllowed ? new Set(privateRepositories) : new Set(),
  onSkip: ({ repository, tag, status }) =>
    console.log(
      `live release check skipped in hosted CI: private repos not readable by GITHUB_TOKEN (${repository} ${tag}, HTTP ${status})`,
    ),
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
  if (!plugin.skipped) console.log(`Validated ${plugin.name} ${plugin.version} at ${plugin.commit} against published release ${plugin.tag}`);
}
