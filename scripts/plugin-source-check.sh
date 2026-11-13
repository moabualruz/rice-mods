#!/usr/bin/env bash
# Run the vendored release-packages/scripts/plugin.sh check against each exact marketplace source pin.
# Sources are private, so a token that can read them is required (GITHUB_TOKEN or `gh auth token`), passed to gh
# through the environment only. Hosted CI cannot read them (the default token is limited to this repository):
# there, and only there (GITHUB_ACTIONS=true without LIVE_RELEASE_CHECK=required), an unreadable source is skipped
# explicitly and reported. A source that downloads is always checked, and every other failure fails.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

hosted_skip=false
if [ "${GITHUB_ACTIONS:-}" = true ] && [ "${LIVE_RELEASE_CHECK:-}" != required ]; then hosted_skip=true; fi
token="${GITHUB_TOKEN:-$(gh auth token 2>/dev/null || true)}"
if [ -z "$token" ] && [ "$hosted_skip" = false ]; then
  echo "plugin source check: no token that can read the private sources" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
checked=0
skipped=0
while IFS=$'\t' read -r name repo sha; do
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "plugin source check: $name has no exact sha pin" >&2; exit 1; }
  dest="$work/$name"
  mkdir -p "$dest"
  if ! GH_TOKEN="$token" gh api "repos/$repo/tarball/$sha" > "$work/$name.tgz" 2> "$work/$name.err"; then
    if [ "$hosted_skip" = true ] && grep -Eq 'HTTP (401|403|404)' "$work/$name.err"; then
      echo "plugin source check skipped in hosted CI: $name source is not readable by the workflow token"
      skipped=$((skipped + 1))
      continue
    fi
    echo "plugin source check: cannot download $name at $sha" >&2
    exit 1
  fi
  tar -xz --strip-components=1 -C "$dest" -f "$work/$name.tgz"
  echo "== $name $repo@$sha"
  bash release-packages/scripts/plugin.sh check "$dest"
  checked=$((checked + 1))
done < <(jq -r '.plugins[] | select(.source.source == "github") | [.name, .source.repo, .source.sha] | @tsv' .claude-plugin/marketplace.json)
[ $((checked + skipped)) -gt 0 ] || { echo "plugin source check: no github plugin sources in marketplace" >&2; exit 1; }
echo "plugin source check: $checked checked, $skipped skipped"
