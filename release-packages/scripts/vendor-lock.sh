#!/usr/bin/env bash
# vendor-lock.sh write|check [--published]: per-file SHA-256 lock (rule R-2).
# Canonical source; scripts/sync-template-vendor-locks.sh refreshes the template copies.
# Run from the product root. RELEASE_DIR defaults to release, RELEASE_LOCK to release.lock.
# write requires RELEASE_TAG_SOURCE, the existing trusted canonical producer checkout.
# Its exact local tag and origin's exact published tag must both resolve to the vendir commit.
# check is offline byte/metadata coherence only; check --published repeats the origin proof.
set -euo pipefail

dir="${RELEASE_DIR:-release}"
lock="${RELEASE_LOCK:-release.lock}"
dir="${dir%/}"
fail() { echo "vendor-lock: $*" >&2; exit 1; }
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}
hashes() {
  local f digest
  while IFS= read -r f; do
    digest="$(sha256_of "$f")" || return 1
    [[ "$digest" =~ ^[0-9a-f]{64}$ ]] || return 1
    printf '%s  %s\n' "$digest" "$f"
  done < <(find "$dir" -type f | LC_ALL=C sort)
}
read_selection() {
  [ -f vendir.lock.yml ] || fail "no vendir.lock.yml; run vendir sync first"
  read -r commit tag < <(awk -v d="$dir" '
    function flush() { if (path == d && sha != "") { print sha, tag; exit } }
    /^- / { flush(); path = ""; sha = ""; tag = ""; intags = 0 }
    /^  path: / { path = $2 }
    /^      sha: / { sha = $2 }
    /^      tags:/ { intags = 1; next }
    intags && /^      - / { if (tag == "") tag = $2; next }
    /^      [a-z]/ { intags = 0 }
    END { flush() }
  ' vendir.lock.yml) || true
  commit="${commit:-}"
  tag="${tag:-}"
  [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || fail "no commit for $dir in vendir.lock.yml"
  [ -n "$tag" ] || fail "no tag for $dir in vendir.lock.yml (vendor a tag, not a branch)"
  git check-ref-format "refs/tags/$tag" >/dev/null 2>&1 || fail "invalid exact tag ref"
}
verify_published_tag() {
  local source="${RELEASE_TAG_SOURCE:-}" local_commit refs sha ref direct="" peeled=""
  [ -n "$source" ] && [ -d "$source" ] || fail "RELEASE_TAG_SOURCE must name the existing trusted canonical producer checkout"
  local_commit="$(git -C "$source" rev-parse --verify "refs/tags/$tag^{commit}" 2>/dev/null)" || fail "selected tag is not an existing exact producer tag (git-describe is not a tag)"
  [ "$local_commit" = "$commit" ] || fail "exact producer tag differs from vendir commit"
  # Use the configured native remote name, never place a resolved credential-bearing URL in argv or output.
  refs="$(git -C "$source" ls-remote --exit-code --tags origin "refs/tags/$tag" "refs/tags/$tag^{}" 2>/dev/null)" || fail "exact producer tag is not available from origin; publication remains unverified"
  while read -r sha ref; do
    [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "invalid origin tag response"
    case "$ref" in
      "refs/tags/$tag") direct="$sha" ;;
      "refs/tags/$tag^{}") peeled="$sha" ;;
      *) fail "unexpected origin tag response" ;;
    esac
  done <<<"$refs"
  [ -n "$direct" ] && [ "${peeled:-$direct}" = "$commit" ] || fail "published exact tag differs from vendir commit"
}

[ $# -ge 1 ] && [ $# -le 2 ] || { echo "usage: vendor-lock.sh write|check [--published]" >&2; exit 2; }
[ $# -eq 1 ] || { [ "$1" = check ] && [ "$2" = --published ]; } || exit 2
case "$1" in
write)
  [ -d "$dir" ] || fail "no directory $dir"
  read_selection
  verify_published_tag
  pending="$(mktemp "$lock.XXXXXX")"
  trap 'rm -f "$pending"' EXIT
  {
    echo "# rice-release template lock: exact published tag, commit and SHA-256 per file. Written by vendor-lock.sh; do not edit."
    echo "tag $tag"
    echo "commit $commit"
    hashes
  } >"$pending"
  chmod 644 "$pending"
  mv "$pending" "$lock"
  echo "vendor-lock: wrote $lock ($tag, exact origin ref verified)"
  ;;
check)
  [ -f "$lock" ] || fail "no $lock"
  [ -d "$dir" ] || fail "no directory $dir"
  read_selection
  [ "$(grep '^tag ' "$lock")" = "tag $tag" ] && [ "$(grep '^commit ' "$lock")" = "commit $commit" ] || fail "native vendir selection differs from whole-file lock metadata"
  if [ "${2:-}" = --published ]; then verify_published_tag; fi
  work="$(mktemp -d "${TMPDIR:-/tmp}/vendor-lock.XXXXXX")"
  trap 'rm -rf "$work"' EXIT
  grep -E '^[0-9a-f]{64}  ' "$lock" | LC_ALL=C sort -k2 >"$work/want"
  hashes >"$work/have"
  failed=0
  while IFS= read -r line; do
    file="${line#*  }"
    want="${line%%  *}"
    got="$(awk -v p="$file" 'substr($0, 67) == p {print substr($0, 1, 64); exit}' "$work/have")"
    if [ -z "$got" ]; then echo "vendor-lock: MISSING  $file" >&2; failed=1
    elif [ "$got" != "$want" ]; then echo "vendor-lock: MODIFIED $file" >&2; failed=1; fi
  done <"$work/want"
  while IFS= read -r line; do
    file="${line#*  }"
    [ -n "$(awk -v p="$file" 'substr($0, 67) == p {print "x"; exit}' "$work/want")" ] || { echo "vendor-lock: UNEXPECTED $file" >&2; failed=1; }
  done <"$work/have"
  [ "$failed" = 0 ] || fail "$dir differs from $lock; re-vendor the tag instead of editing the copy"
  if [ "${2:-}" = --published ]; then
    echo "vendor-lock: $dir matches $lock; exact origin tag verified"
  else
    echo "vendor-lock: $dir matches $lock (offline byte/metadata coherence only; publication not checked)"
  fi
  ;;
*) echo "usage: vendor-lock.sh write|check [--published]" >&2; exit 2 ;;
esac
