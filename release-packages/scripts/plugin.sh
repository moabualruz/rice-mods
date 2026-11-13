#!/usr/bin/env bash
# plugin.sh MODE DIR [...]: package a Claude Code plugin or mod (research 61, release ticket 14).
#
#   plugin.sh check DIR                   layout, name rules and `claude plugin validate` must pass
#   plugin.sh baseline DIR OUT.json       write the capability baseline (the validate report, paths made relative)
#   plugin.sh diff DIR BASELINE.json      fail when hooked events, `$` calls or env reads/writes differ from the baseline
#   plugin.sh zip DIR OUT.zip             deterministic zip of the plugin (sorted entries, fixed timestamps)
#   plugin.sh sbom DIR OUT.json           CycloneDX document naming the plugin as the main module (no third-party code)
#
# Layout checked: .claude-plugin/plugin.json (name, version MAJOR.MINOR.PATCH, description, license), hooks/hooks.json
# whose "modules" exist, and optional LIMITS.md, skills/NAME/SKILL.md and .mcp.json metadata when present.
# paths. The name must not start with a reserved prefix (claude-, anthropic-, cc-plugin-). Nothing is published to a
# marketplace: the zip is attached to a private release only. The capability baseline is the reviewable diff of
# `claude plugin validate --json` (hooked events, `$` calls, env reads and writes); a mod calling `$.http.fetch`, an
# env writer or `prompt.submit` with asUser shows up as a baseline change. Exit 0 ok, 1 failure/diff, 2 usage.
set -euo pipefail

die() { echo "plugin: $*" >&2; exit 1; }
usage() { awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "${BASH_SOURCE[0]}" >&2; exit 2; }
[ $# -ge 2 ] || usage
mode="$1"
dir="$2"
shift 2
[ -d "$dir" ] || die "no directory $dir"
dir="$(cd "$dir" && pwd -P)"
for t in jq claude; do command -v "$t" >/dev/null 2>&1 || die "$t not found on PATH"; done

reserved_re='^(claude-|anthropic-|cc-plugin-)'
semver_re='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'

layout_check() {
  local manifest="$dir/.claude-plugin/plugin.json" limits="$dir/LIMITS.md" skills="$dir/skills" mcp="$dir/.mcp.json" name version hooks mod grep_status=0 skill skills_found=0
  if [ -e "$limits" ] || [ -L "$limits" ]; then
    [ -f "$limits" ] && [ ! -L "$limits" ] && [ -s "$limits" ] || die "LIMITS.md is not a nonempty regular file"
    grep -Eq '^[[:space:]]*-[[:space:]]+[^:]+:[[:space:]]*\[[^]]+\][[:space:]]*$|^[[:space:]]*\[[^]]+\][[:space:]]*$' "$limits" || grep_status=$?
    case "$grep_status" in
      0) die "LIMITS.md contains unresolved placeholders" ;;
      1) ;;
      *) die "cannot read LIMITS.md" ;;
    esac
  fi
  [ -f "$manifest" ] || die "no .claude-plugin/plugin.json"
  jq -e . "$manifest" >/dev/null 2>&1 || die "plugin.json is not valid JSON"
  name="$(jq -r '.name // empty' "$manifest")"
  version="$(jq -r '.version // empty' "$manifest")"
  [ -n "$name" ] || die "plugin.json has no name"
  [[ "$name" =~ ^[a-z][a-z0-9-]*$ ]] || die "plugin name \"$name\" must be lowercase letters, digits and hyphens"
  if [[ "$name" =~ $reserved_re ]]; then die "plugin name \"$name\" starts with a reserved prefix (claude-, anthropic-, cc-plugin-)"; fi
  [[ "$version" =~ $semver_re ]] || die "plugin version \"$version\" is not MAJOR.MINOR.PATCH (stable only, R-4)"
  [ -n "$(jq -r '.description // empty' "$manifest")" ] || die "plugin.json has no description"
  [ -n "$(jq -r '.license // empty' "$manifest")" ] || die "plugin.json has no license"
  hooks="$dir/hooks/hooks.json"
  [ -f "$hooks" ] || die "no hooks/hooks.json"
  while IFS= read -r mod; do
    [ -f "$dir/hooks/$mod" ] || die "hooks/hooks.json names module $mod, which does not exist"
  done < <(jq -r '.modules[]? // empty' "$hooks")
  if [ -e "$skills" ] || [ -L "$skills" ]; then
    [ -d "$skills" ] && [ ! -L "$skills" ] || die "skills is not a directory"
    while IFS= read -r -d '' skill; do
      [ -f "$skill" ] && [ ! -L "$skill" ] && [ -s "$skill" ] || die "skills contains a non-regular or empty NAME/SKILL.md"
      skills_found=1
    done < <(find "$skills" -mindepth 2 -maxdepth 2 -name SKILL.md -print0 2>/dev/null)
    [ "$skills_found" -eq 1 ] || die "skills has no nonempty NAME/SKILL.md"
  fi
  if [ -e "$mcp" ] || [ -L "$mcp" ]; then
    [ -f "$mcp" ] && [ ! -L "$mcp" ] || die ".mcp.json is not a regular file"
    jq -e '.mcpServers | type == "object" and length > 0' "$mcp" >/dev/null 2>&1 || die ".mcp.json has no mcpServers entry"
    if jq -r '.mcpServers[] | (.command // ""), (.args // [])[]' "$mcp" | grep -E '^(/|~|[A-Za-z]:\\)' >/dev/null; then die ".mcp.json uses an absolute path; use \${CLAUDE_PLUGIN_ROOT}"; fi
  fi
  echo "plugin: layout ok ($name $version)"
}

validate_json() { # prints the validate report with the plugin directory made relative
  local raw
  raw="$(claude plugin validate "$dir" --json)" || { echo "$raw" >&2; die "claude plugin validate failed"; }
  jq -S --arg d "$dir" '
    def rel: if type == "string" then gsub($d; ".") else . end;
    walk(rel)' <<<"$raw"
}

capabilities() { # stdin: normalized report; prints {hooks, calls, envReads, envWrites, other} from the module notes
  jq -S '
    [.contents[]?.notes[]?] as $n
    | {
        hooks: [$n[] | select(test(" hooks: ")) | sub("^.* hooks: "; "")] | sort,
        calls: [$n[] | select(test(" calls: ")) | sub("^.* calls: "; "")] | sort,
        envReads: [$n[] | select(test(" env reads: ")) | sub("^.* env reads: "; "")] | sort,
        envWrites: [$n[] | select(test(" env writes: ")) | sub("^.* env writes: "; "")] | sort,
        gating: [.contents[]?.gatingHooks[]? | {hook, hasCatch}] | sort_by(.hook)
      }'
}

case "$mode" in
check)
  layout_check
  report="$(validate_json)"
  jq -e '.success == true and ([.manifest.errors[]?, .contents[]?.errors[]?] | length) == 0' <<<"$report" >/dev/null || { jq -c '{success, manifest: .manifest.errors, contents: [.contents[]?.errors]}' <<<"$report" >&2; die "claude plugin validate reports errors"; }
  echo "plugin: validate ok (claude $(claude --version | awk '{print $1}'))"
  ;;
baseline)
  [ $# -eq 1 ] || usage
  layout_check >/dev/null
  report="$(validate_json)"
  jq -e '.success == true' <<<"$report" >/dev/null || die "claude plugin validate does not succeed; fix it before taking a baseline"
  jq -S --argjson cap "$(capabilities <<<"$report")" --arg claude "$(claude --version | awk '{print $1}')" '{claudeCode: $claude, capabilities: $cap, report: .}' <<<"$report" >"$1"
  echo "plugin: baseline written to $1 (hooks: $(jq -c '.capabilities.hooks | length' "$1"), calls: $(jq -c '.capabilities.calls | length' "$1"))"
  ;;
diff)
  [ $# -eq 1 ] && [ -f "$1" ] || usage
  report="$(validate_json)"
  now="$(capabilities <<<"$report")"
  rc=0
  for key in hooks calls envReads envWrites gating; do
    before="$(jq -S ".capabilities.$key" "$1")"
    after="$(jq -S ".$key" <<<"$now")"
    if [ "$before" != "$after" ]; then
      echo "plugin: capability change in $key" >&2
      diff <(echo "$before") <(echo "$after") >&2 || true
      rc=1
    fi
  done
  [ "$rc" = 0 ] || die "capability baseline differs; review the change and take a new baseline (plugin.sh baseline)"
  echo "plugin: capabilities equal the baseline"
  ;;
sbom)
  [ $# -eq 1 ] || usage
  layout_check >/dev/null
  jq -n --slurpfile m "$dir/.claude-plugin/plugin.json" '{bomFormat: "CycloneDX", specVersion: "1.5", version: 1,
    metadata: {component: {type: "application", name: $m[0].name, version: $m[0].version, licenses: [{license: {id: $m[0].license}}]}}, components: []}' >"$1"
  echo "plugin: wrote $1"
  ;;
zip)
  [ $# -eq 1 ] || usage
  layout_check >/dev/null
  command -v zip >/dev/null || die "zip not found"
  out="$1"
  case "$out" in /*) ;; *) out="$PWD/$out" ;; esac
  rm -f "$out"
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/plugin-zip.XXXXXX")"
  trap 'rm -rf "$tmp"' EXIT
  cp -R "$dir/." "$tmp/p/" 2>/dev/null || { mkdir -p "$tmp/p" && cp -R "$dir/." "$tmp/p/"; }
  # Fixed modification time so the same tree always yields the same bytes.
  find "$tmp/p" -exec touch -t 202001010000 {} +
  (cd "$tmp/p" && find . -type f ! -name .DS_Store | LC_ALL=C sort | sed 's|^\./||' | zip -q -X -@ "$out")
  echo "plugin: wrote $out ($(wc -c <"$out" | tr -d ' ') bytes, $(unzip -l "$out" | tail -n1 | awk '{print $2}') files)"
  ;;
*) usage ;;
esac
