#!/usr/bin/env bash
# check-policy.sh [DIR...]: the package release policy (R-5, T8, T12, D2), checked offline over npm, OCI and plugin files.
#
#   - No npm provenance, attestation, keyless signing or public transparency log; every cosign signing command carries
#     --tlog-upload=false and every buildx build carries --provenance=false.
#   - No @rice/ npm scope: private packages are @moabualruz/NAME (T8).
#   - No registry port listed in RELEASE_OCI_REFUSED_PORTS (space or comma separated, empty by default) appears as :PORT/.
#   - No npm credential (_authToken, _auth=, _password) in .npmrc or scripts; credentials come from OpenBao only.
#   - A plugin name does not start with a reserved prefix (claude-, anthropic-, cc-plugin-).
# Scans YAML, shell, JSON, env, Dockerfile, .npmrc and plugin.json files; Markdown is documentation. Skips .git,
# node_modules, dist, and the scripts of this template itself. Exit 0 clean, 1 violation.
set -euo pipefail

roots=("$@")
[ ${#roots[@]} -gt 0 ] || roots=(.)
fail=0
report() { echo "check-policy: $1: $2" >&2; fail=1; }
tmpl="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rules=$'--provenance[[:space:]]*(=[[:space:]]*)?true\tprovenance attestation
NPM_CONFIG_PROVENANCE\tnpm provenance
"provenance"[[:space:]]*:[[:space:]]*true\tnpm provenance
id-token:[[:space:]]*write\tOIDC token permission (keyless signing or attestations)
attestations:[[:space:]]*write\tGitHub artifact attestations
actions/attest\tGitHub artifact attestations
attest-build-provenance\tGitHub artifact attestations
sigstore\tSigstore service reference
rekor\tpublic Rekor transparency log
fulcio\tkeyless Fulcio certificate authority
COSIGN_EXPERIMENTAL\tkeyless cosign mode
--keyless\tkeyless signing
@rice/\tthe superseded @rice/ npm scope (T8: use @moabualruz/)
_authToken\tan npm auth token
_auth=\tan npm credential
_password\tan npm password'

refused_ports="${RELEASE_OCI_REFUSED_PORTS:-}"
refused_ports="${refused_ports//,/ }"
refused_ports="${refused_ports//$'\n'/ }"
if [[ "$refused_ports" =~ [^[:space:]] ]]; then
  IFS=$' \t\n' read -r -a refused_port_list <<<"$refused_ports"
  for p in "${refused_port_list[@]}"; do
    [[ "$p" =~ ^[0-9]{1,5}$ ]] || { echo "check-policy: RELEASE_OCI_REFUSED_PORTS must list port numbers, got \"$p\"" >&2; exit 2; }
    p="$((10#$p))"
    rules+=$'\n'":0*$p/"$'\t'"registry port $p is refused by RELEASE_OCI_REFUSED_PORTS"
  done
fi

files="$(find "${roots[@]}" \( -name .git -o -name node_modules -o -name dist \) -prune -o -type f \
  \( -name '*.yml' -o -name '*.yaml' -o -name '*.sh' -o -name '*.json' -o -name '*.env' -o -name Dockerfile -o -name .npmrc -o -name justfile \) -print)"
while IFS= read -r f; do
  [ -n "$f" ] || continue
  d="$(cd "$(dirname "$f")" && pwd)"
  [ "$d" != "$tmpl" ] || continue # the template's own scripts name the forbidden patterns on purpose
  case "$f" in */pack.json | */baseline.json | */capabilities.baseline.json) continue ;; esac
  while IFS=$'\t' read -r pat reason; do
    if grep -Eiq -- "$pat" "$f"; then report "$f" "$reason ($pat)"; fi
  done <<<"$rules"
  case "$f" in *.sh | *.yml | *.yaml | justfile)
    joined="$(sed -e ':a' -e '/\\$/N; s/\\\n//; ta' "$f")"
    if grep -E 'cosign[[:space:]].*(sign|sign-blob|sign-attestation)([[:space:]]|$)' <<<"$joined" | grep -Evq -- '--tlog-upload=false'; then report "$f" "cosign signing without --tlog-upload=false"; fi
    if grep -E 'buildx[[:space:]]+build' <<<"$joined" | grep -Evq -- '--provenance=false'; then report "$f" "buildx build without --provenance=false"; fi
    ;;
  esac
  case "$f" in */.claude-plugin/plugin.json)
    name="$(jq -r '.name // empty' "$f")"
    if [[ "$name" =~ ^(claude-|anthropic-|cc-plugin-) ]]; then report "$f" "plugin name \"$name\" starts with a reserved prefix"; fi
    ;;
  esac
done <<<"$files"

if [ "$fail" -ne 0 ]; then exit 1; fi
echo "check-policy: clean (${roots[*]})"
