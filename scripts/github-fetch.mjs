const GITHUB_HOSTS = new Set(["github.com", "api.github.com"]);
const MAX_REDIRECTS = 5;

export function isGithubHost(url) {
  const parsed = new URL(url);
  return parsed.protocol === "https:" && GITHUB_HOSTS.has(parsed.hostname);
}

export function createGithubJsonFetcher({ token, fetchImpl = fetch } = {}) {
  return async function fetchJson(url) {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const headers = { accept: "application/vnd.github+json" };
      if (token && isGithubHost(current)) headers.authorization = `Bearer ${token}`;
      const response = await fetchImpl(current, { headers, redirect: "manual" });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error(`GitHub returned HTTP ${response.status} without a redirect target for ${url}`);
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) {
        const hint = !token && (response.status === 401 || response.status === 403 || response.status === 404)
          ? "; no GITHUB_TOKEN was provided, so private repositories are refused"
          : "";
        throw Object.assign(new Error(`GitHub returned HTTP ${response.status} for ${url}${hint}`), { status: response.status });
      }
      return response.json();
    }
    throw new Error(`Too many redirects fetching ${url}`);
  };
}
