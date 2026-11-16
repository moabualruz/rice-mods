#!/usr/bin/env bash
# Run the vendored release-packages/scripts/plugin.sh check against each exact marketplace source pin.
# The sources are meant to be public, but gh api still needs a token (GITHUB_TOKEN or `gh auth token`; any
# authenticated identity can read them). It is passed to gh through the environment only. While a declared source is still
# unreadable, hosted CI (GITHUB_ACTIONS=true without LIVE_RELEASE_CHECK=required) skips it explicitly and reports
# it. A source that downloads is always checked, and every other failure fails.
set -euo pipefail
set +x
cd "$(dirname "${BASH_SOURCE[0]}")/.."

selected_repository=""
if [ "$#" -ne 0 ]; then
  if [ "$#" -ne 2 ] || [ "$1" != --repo ]; then
    echo "usage: plugin-source-check.sh [--repo OWNER/REPOSITORY]" >&2
    exit 2
  fi
  selected_repository="$2"
  [[ "$selected_repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || {
    echo "plugin source check: invalid selected repository" >&2
    exit 1
  }
fi

sources="$(jq -er '
  .plugins
  | if type != "array" or length == 0 then error("invalid plugins") else . end
  | if ([.[].name] | unique | length) != length then error("duplicate plugin name") else . end
  | if ([.[].source.repo] | unique | length) != length then error("duplicate plugin repository") else . end
  | .[]
  | if (.name | type != "string") or (.source.repo | type != "string") or (.source.sha | type != "string")
    then error("invalid source fields") else . end
  | if (.name | test("^[a-z][a-z0-9-]*$")) and .source.source == "github"
      and (.source.repo | test("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"))
      and (.source.sha | test("^[0-9a-f]{40}$"))
    then [.name, .source.repo, .source.sha] | @tsv else error("invalid source") end
' .claude-plugin/marketplace.json 2>/dev/null)" || {
  echo "plugin source check: invalid marketplace source input" >&2
  exit 1
}
private_repositories="$(jq -er '
  if type != "array" then error("invalid private repositories") else . end
  | if all(.[]; type == "string" and test("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"))
      and (unique | length) == length
    then join("\n") else error("invalid private repositories") end
' scripts/private-repositories.json 2>/dev/null)" || {
  echo "plugin source check: invalid private repository allowlist" >&2
  exit 1
}
if [ -n "$selected_repository" ]; then
  sources="$(printf '%s\n' "$sources" | awk -F '\t' -v repository="$selected_repository" '$2 == repository')"
  [ -n "$sources" ] || { echo "plugin source check: selected repository is not in the marketplace" >&2; exit 1; }
  printf '%s\n' "$private_repositories" | grep -Fqx -- "$selected_repository" || {
    echo "plugin source check: selected repository is not declared private" >&2
    exit 1
  }
fi

hosted_skip=false
if [ "${GITHUB_ACTIONS:-}" = true ] && [ "${LIVE_RELEASE_CHECK:-}" != required ]; then hosted_skip=true; fi
if [ -n "${RICE_RELEASE_DOWNLOAD_TOKEN:-}" ] && [ -z "$selected_repository" ]; then
  echo "plugin source check: a repository-scoped session requires --repo" >&2
  exit 1
fi
export -n plugin_source_read_token
plugin_source_read_token="${RICE_RELEASE_DOWNLOAD_TOKEN:-${GITHUB_TOKEN:-$(gh auth token 2>/dev/null || true)}}"
unset GH_TOKEN GITHUB_TOKEN MISE_GITHUB_TOKEN RICE_RELEASE_DOWNLOAD_TOKEN RICE_RELEASE_DOWNLOAD_TOKEN_EXPIRES_AT
if [ -z "$plugin_source_read_token" ] && [ "$hosted_skip" = false ]; then
  echo "plugin source check: no token that can read the plugin sources" >&2
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
  if failure="$(GH_TOKEN="$plugin_source_read_token" gh api "repos/$repo/tarball/$sha" 2>&1 > "$work/$name.tgz")"; then
    :
  else
    status=native-command
    if [[ "$failure" =~ HTTP\ ([0-9]{3}) ]]; then status="HTTP ${BASH_REMATCH[1]}"; fi
    if [ "$hosted_skip" = true ] && [[ "$status" =~ ^HTTP\ (401|403|404)$ ]] \
      && printf '%s\n' "$private_repositories" | grep -Fqx -- "$repo"; then
      echo "plugin source check skipped in hosted CI: $name source is not readable by the workflow token"
      skipped=$((skipped + 1))
      continue
    fi
    echo "plugin source check: cannot download $name at $sha ($status)" >&2
    exit 1
  fi
  tar -xz --strip-components=1 -C "$dest" -f "$work/$name.tgz"
  echo "== $name $repo@$sha"
  bash release-packages/scripts/plugin.sh check "$dest"
  checked=$((checked + 1))
done <<< "$sources"
[ $((checked + skipped)) -gt 0 ] || { echo "plugin source check: no github plugin sources in marketplace" >&2; exit 1; }
echo "plugin source check: $checked checked, $skipped skipped"
