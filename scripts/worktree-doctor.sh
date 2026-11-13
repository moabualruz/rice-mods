#!/usr/bin/env bash
set -euo pipefail
cd "${BASH_SOURCE[0]%/*}/.."

missing=0
require_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'worktree-doctor: missing %s\nFix: %s\n' "$1" "$2" >&2
    missing=1
  fi
}
require_tool node 'mise install node@24.18.0; mise exec node@24.18.0 -- just worktree-doctor'
require_tool just 'mise install just'
require_tool jq 'mise install jq'
require_tool gh 'mise install github-cli'
require_tool tar 'install the platform tar package'
require_tool git 'install the platform Git package'
require_tool claude 'npm install --global @anthropic-ai/claude-code@2.1.309'
require_tool git-canonical-gate 'rice-agent install'
[ "$missing" -eq 0 ] || exit 1

[ "$(node --version)" = v24.18.0 ] || {
  echo 'worktree-doctor: Node 24.18.0 from mise is required' >&2
  echo 'Fix: mise exec node@24.18.0 -- just worktree-doctor' >&2
  exit 1
}
for path in release-packages/scripts/plugin.sh release-packages/scripts/vendor-lock.sh release-packages.lock vendir.lock.yml; do
  [ -f "$path" ] || {
    printf 'worktree-doctor: missing %s\nFix: vendir sync --locked\n' "$path" >&2
    exit 1
  }
done
echo 'worktree-doctor: ready'
