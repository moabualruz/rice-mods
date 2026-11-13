#!/usr/bin/env bash
# Run the vendored release-packages/scripts/plugin.sh check against each exact marketplace source pin.
# Sources are private, so a token that can read them is required (GITHUB_TOKEN or `gh auth token`).
# Hosted CI cannot read them: it skips explicitly unless LIVE_RELEASE_CHECK=required. Never skips locally.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ "${GITHUB_ACTIONS:-}" = true ] && [ "${LIVE_RELEASE_CHECK:-}" != required ]; then
  echo "plugin source check skipped in hosted CI: private source repos are not readable by GITHUB_TOKEN"
  exit 0
fi
token="${GITHUB_TOKEN:-$(gh auth token 2>/dev/null || true)}"
[ -n "$token" ] || { echo "plugin source check: no token that can read the private sources" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
count=0
while IFS=$'\t' read -r name repo sha; do
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "plugin source check: $name has no exact sha pin" >&2; exit 1; }
  dest="$work/$name"
  mkdir -p "$dest"
  curl -fsSL -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$repo/tarball/$sha" | tar -xz --strip-components=1 -C "$dest"
  echo "== $name $repo@$sha"
  bash release-packages/scripts/plugin.sh check "$dest"
  count=$((count + 1))
done < <(jq -r '.plugins[] | select(.source.source == "github") | [.name, .source.repo, .source.sha] | @tsv' .claude-plugin/marketplace.json)
[ "$count" -gt 0 ] || { echo "plugin source check: no github plugin sources in marketplace" >&2; exit 1; }
echo "plugin source check: $count sources passed plugin.sh check"
