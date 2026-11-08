#!/usr/bin/env bash
# npm-package.sh MODE [flags]: private npm packages on a Nexus npm registry (release ticket 14, Nexus facts from ticket 03).
#
#   npm-package.sh lint DIR                         scope, provenance and credential policy of a package directory
#   npm-package.sh pack DIR OUT                     tarball, CycloneDX SBOM (npm sbom) and a record of the digests
#   npm-package.sh sign OUT --bao-path P --pubkey F  operator: detached minisign signature over the tarball, verified offline
#   npm-package.sh verify-signature OUT --pubkey F  verify that signature with only the public key
#   npm-package.sh publish DIR OUT [--tag TAG] [--nexus URL]  operator: idempotent unsigned publish, read/install, offline reinstall
#   npm-package.sh verify DIR OUT [--nexus URL]  CI: anonymous read/install of the exact packed version, offline reinstall
#   npm-package.sh roundtrip DIR --admin-sops FILE [--nexus URL]  operator: publish, read back, install back, delete, prove nothing remains
#
# Policy: every package is named @moabualruz/NAME (the T8 scope; the @rice/ wording of research 60 is superseded);
# no provenance flag or attestation anywhere (R-5, T12); no credential in the package directory. Publication goes to the
# npm-hosted repository only; installs and views go through npm-group, which is readable anonymously (an identity
# without group read is refused with 403, so group requests carry no credentials). The rice-publisher identity
# (the OpenBao item at RELEASE_NEXUS_BAO_PATH, fields username and rice-publisher-password) publishes; it cannot delete. The
# Nexus admin identity (a SOPS file passed as --admin-sops, decrypted in this process) deletes by REST.
# Configuration, none of it built in: RELEASE_NEXUS_URL is the Nexus origin (--nexus overrides it); RELEASE_NEXUS_BAO_PATH
# is the OpenBao KV path of the publisher item (publish and roundtrip); BAO_ADDR is the OpenBao address. Run operator modes
# under an OpenBao operator wrapper that exports BAO_ADDR and BAO_TOKEN to the child, so BAO_TOKEN reaches this process
# only. Credentials stay in process memory: curl headers and minisign passwords use
# stdin, signing keys use a pipe, and npm userconfigs contain only environment references to scoped basic auth.
# Private scratch contains no credential values; output is statuses and digests. Exit 0 ok, 1 failure, 2 usage.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=versions.env
. "$script_dir/versions.env"

die() { echo "npm-package: $*" >&2; exit 1; }
usage() { awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "${BASH_SOURCE[0]}" >&2; exit 2; }
sha256_of() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
for t in jq npm; do command -v "$t" >/dev/null 2>&1 || die "$t not found on PATH"; done
# The OpenBao address comes from the operator wrapper; no endpoint is built in.
need_bao_addr() { addr="${BAO_ADDR:-}"; [ -n "$addr" ] || die "BAO_ADDR is not set; the OpenBao operator wrapper exports it with BAO_TOKEN"; }
# Required configuration is refused with exit 2 before any tool or network call.
need_config() { # NAME VALUE
  [ -n "$2" ] || { echo "npm-package: $1 is not set; there is no built-in default" >&2; exit 2; }
}
# KV v2 read URL path of an OpenBao KV path such as mount/some/item.
kv_data_path() { printf '%s/data/%s' "${1%%/*}" "${1#*/}"; }

[ $# -ge 2 ] || usage
mode="$1"
shift

pkg_field() { jq -r "$2" "$1/package.json"; }

lint() { # DIR
  local dir="$1" name f
  [ -f "$dir/package.json" ] || die "no $dir/package.json"
  name="$(pkg_field "$dir" '.name // empty')"
  [[ "$name" =~ ^${NPM_SCOPE//@/\\@}/[a-z0-9][a-z0-9-]*$ ]] || die "package name \"$name\" is not $NPM_SCOPE/NAME (T8)"
  [ "$(pkg_field "$dir" '.private // false')" != true ] || die "package.json is private: true, which npm refuses to publish"
  [[ "$(pkg_field "$dir" '.version // empty')" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || die "version is not MAJOR.MINOR.PATCH[-pre]"
  [ -f "$dir/package-lock.json" ] || die "no package-lock.json (npm install --package-lock-only); the SBOM and the lockfile digest need it"
  if jq -e '.publishConfig.provenance // false' "$dir/package.json" >/dev/null 2>&1 && [ "$(pkg_field "$dir" '.publishConfig.provenance // false')" = true ]; then die "publishConfig.provenance is set; provenance is never used (R-5)"; fi
  while IFS= read -r f; do
    if grep -Eiq -- '--provenance|NPM_CONFIG_PROVENANCE|provenance[[:space:]]*=[[:space:]]*true|id-token|sigstore|rekor' "$f"; then die "$f mentions provenance or a public log"; fi
    if grep -Eq -- '_authToken|_auth=|_password' "$f"; then die "$f carries an npm credential; credentials come from OpenBao only"; fi
    if grep -Eq '@rice/' "$f"; then die "$f uses the superseded @rice/ scope; use $NPM_SCOPE/ (T8)"; fi
  done < <(find "$dir" \( -name node_modules -o -name .git \) -prune -o -type f \( -name '*.md' -o -name '*.json' -o -name '.npmrc' -o -name '*.js' -o -name '*.sh' -o -name '*.yml' -o -name '*.yaml' \) ! -name package-lock.json -print)
  echo "npm-package: lint ok ($name@$(pkg_field "$dir" .version))"
}

case "$mode" in
lint) lint "$1" ;;

pack)
  [ $# -eq 2 ] || usage
  dir="$1"
  out="$2"
  lint "$dir" >/dev/null
  mkdir -p "$out"
  out="$(cd "$out" && pwd -P)"
  work="$(mktemp -d "${TMPDIR:-/tmp}/npm-pack.XXXXXX")"
  trap 'rm -rf "$work"' EXIT
  mkdir "$work/home"
  : >"$work/user.npmrc"
  : >"$work/global.npmrc"
  npm_pack() {
    env -i PATH="$PATH" HOME="$work/home" TMPDIR="${TMPDIR:-/tmp}" npm \
      --userconfig "$work/user.npmrc" --globalconfig "$work/global.npmrc" --cache "$work/cache" \
      --logs-max=0 --ignore-scripts --no-audit --no-fund --update-notifier=false "$@"
  }
  (cd "$dir" && npm_pack pack --pack-destination "$work" --json >"$work/pack.json")
  fname="$(jq -r '(if type=="array" then .[0] else .[keys[0]] end).filename' "$work/pack.json")"
  integrity="$(jq -r '(if type=="array" then .[0] else .[keys[0]] end).integrity' "$work/pack.json")"
  [ -f "$work/$fname" ] || die "packed tarball not found"
  cp "$work/$fname" "$out/$fname"
  base="${fname%.tgz}"
  (cd "$dir" && npm_pack sbom --package-lock-only --sbom-format cyclonedx >"$work/sbom.json")
  jq -S 'del(.serialNumber, .metadata.timestamp)' "$work/sbom.json" >"$out/$base.sbom.cdx.json"
  jq -e '.bomFormat == "CycloneDX" and (.metadata.component.name | length) > 0' "$out/$base.sbom.cdx.json" >/dev/null || die "the SBOM does not parse as CycloneDX with a main module"
  lock_sha512="$(if command -v openssl >/dev/null 2>&1; then openssl dgst -sha512 "$dir/package-lock.json" | awk '{print $NF}'; else shasum -a 512 "$dir/package-lock.json" | cut -d' ' -f1; fi)"
  jq -n --arg name "$(pkg_field "$dir" .name)" --arg version "$(pkg_field "$dir" .version)" --arg file "$fname" --arg sha256 "$(sha256_of "$out/$fname")" \
    --arg integrity "$integrity" --arg lock "$lock_sha512" --arg npm "$(npm --version)" \
    '{name: $name, version: $version, file: $file, tarballSha256: $sha256, tarballIntegritySha512: $integrity, lockfileSha512: $lock, npm: $npm}' >"$out/$base.pack.json"
  echo "npm-package: packed $fname sha256 $(jq -r .tarballSha256 "$out/$base.pack.json") integrity $integrity lockfile sha512 ${lock_sha512:0:16}..."
  ;;

sign)
  set +x
  ulimit -c 0
  out="$1"
  shift
  bao_path="" pubkey=""
  while [ $# -gt 0 ]; do
    case "$1" in
    --bao-path) bao_path="${2:?}"; shift 2 ;;
    --pubkey) pubkey="${2:?}"; shift 2 ;;
    *) usage ;;
    esac
  done
  [ -d "$out" ] && [ -n "$bao_path" ] && [ -f "$pubkey" ] || usage
  [ -z "${CI:-}${GITHUB_ACTIONS:-}" ] || { echo "npm-package: refusing to sign in CI (R-5, T12)" >&2; exit 2; }
  [ -n "${BAO_TOKEN:-}" ] || die "BAO_TOKEN is not set; run under the OpenBao operator wrapper"
  command -v minisign >/dev/null || die "minisign not found"
  command -v curl >/dev/null || die "curl not found"
  tarball="$(find "$out" -maxdepth 1 -name '*.tgz' | head -n1)"
  [ -f "$tarball" ] || die "no tarball in $out"
  need_bao_addr
  response="$(printf 'X-Vault-Token: %s\n' "$BAO_TOKEN" | curl -q --noproxy '*' -sS --max-time 20 -H @- -w '\n%{http_code}' "$addr/v1/${bao_path%%/*}/data/${bao_path#*/}" 2>/dev/null)" || die "OpenBao transport failure"
  code="${response##*$'\n'}"
  [ "$code" = 200 ] || die "OpenBao GET $bao_path returned HTTP $code"
  response="${response%$'\n'*}"
  # Product archive-signing items use only the standard fields key and password; the single probe item holds two pairs.
  case "$bao_path" in */probe) key_field=minisign-key pw_field=minisign-password ;; *) key_field=key pw_field=password ;; esac
  key="$(printf '%s' "$response" | jq -er --arg f "$key_field" '.data.data[$f] | select(type == "string" and length > 0)' 2>/dev/null)" || die "OpenBao signing key missing or invalid"
  password="$(printf '%s' "$response" | jq -er --arg f "$pw_field" '.data.data[$f] | select(type == "string")' 2>/dev/null)" || die "OpenBao signing password missing or invalid"
  unset response
  umask 077
  rm -f "$tarball.minisig"
  printf '%s\n' "$password" | minisign -S -s <(printf '%s\n' "$key") -m "$tarball" -x "$tarball.minisig" -c "rice-release npm tarball" -t "$(basename "$tarball")" >/dev/null 2>&1 || die "minisign signing failed"
  unset key password
  minisign -V -p "$pubkey" -m "$tarball" -x "$tarball.minisig" >/dev/null 2>&1 || die "signature does not verify"
  echo "npm-package: signed $(basename "$tarball") (minisign $(minisign -v 2>&1 | head -n1 | awk '{print $2}')), verified with $(basename "$pubkey")"
  ;;

verify-signature)
  out="$1"
  shift
  [ "${1:-}" = --pubkey ] && [ -f "${2:-}" ] || usage
  tarball="$(find "$out" -maxdepth 1 -name '*.tgz' | head -n1)"
  [ -f "$tarball" ] && [ -f "$tarball.minisig" ] || die "tarball or signature missing in $out"
  minisign -V -p "$2" -m "$tarball" -x "$tarball.minisig" >/dev/null || die "signature does not verify"
  echo "npm-package: signature verifies ($(basename "$tarball"))"
  ;;

publish | verify)
  set +x
  ulimit -c 0
  if [ "$mode" = publish ] && [ -n "${CI:-}${GITHUB_ACTIONS:-}" ]; then
    echo "npm-package: refusing to publish in CI (operator custody, R-5, T12)" >&2
    exit 2
  fi
  [ $# -ge 2 ] || usage
  dir="$1" out="$2"
  shift 2
  tag=latest nexus="${RELEASE_NEXUS_URL:-}"
  while [ $# -gt 0 ]; do
    case "$1" in
    --tag) tag="${2:?}"; shift 2 ;;
    --nexus) nexus="${2:?}"; shift 2 ;;
    *) usage ;;
    esac
  done
  need_config RELEASE_NEXUS_URL "$nexus"
  if [ "$mode" = publish ]; then need_config RELEASE_NEXUS_BAO_PATH "${RELEASE_NEXUS_BAO_PATH:-}"; fi
  [[ "$tag" =~ ^[a-z][a-z0-9-]*$ ]] || die "invalid-tag: use a named dist-tag"
  [[ "$nexus" =~ ^https?://[a-zA-Z0-9.-]+(:[0-9]+)?/?$ ]] || die "invalid-registry: expected a credential-free Nexus origin"
  nexus="${nexus%/}"
  lint "$dir" >/dev/null
  name="$(pkg_field "$dir" .name)" version="$(pkg_field "$dir" .version)"
  if [[ "$version" == *-* ]] && [ "$tag" = latest ]; then die "invalid-tag: prerelease publication requires an explicit non-latest tag"; fi
  for t in curl base64; do command -v "$t" >/dev/null || die "missing-tool: $t"; done
  "$0" pack "$dir" "$out"
  out="$(cd "$out" && pwd -P)"
  base="${name#@}" base="${base/\//-}-$version"
  tarball="$out/$base.tgz" record="$out/$base.pack.json"
  [ -f "$tarball" ] && [ -f "$record" ] || die "pack-failed: expected exact package tarball and record"
  work="$(mktemp -d "${TMPDIR:-/tmp}/npm-publish.XXXXXX")"
  chmod 700 "$work"
  trap 'rm -rf "$work"' EXIT
  umask 077
  mkdir "$work/home" "$work/consumer"
  : >"$work/anon.npmrc"
  : >"$work/global.npmrc"
  # This file contains an environment reference, never a credential value.
  # shellcheck disable=SC2016
  printf '//%s/repository/npm-hosted/:_auth=${RICE_NPM_AUTH}\n' "${nexus#*://}" >"$work/publish.npmrc"
  # Isolate npm from project/global config, ambient auth/proxy settings and package lifecycle scripts.
  npm_isolated() {
    printf '%s\n' "${auth:-}" | env -i PATH="$PATH" HOME="$work/home" TMPDIR="${TMPDIR:-/tmp}" \
      bash -c 'IFS= read -r RICE_NPM_AUTH; export RICE_NPM_AUTH; exec npm "$@"' npm-stdin \
      --userconfig "$1" --globalconfig "$work/global.npmrc" --update-notifier=false --cache "$work/${npm_cache:-publish-cache}" --logs-max=0 \
      --loglevel=silent --fetch-retries=0 --fetch-timeout=30000 --ignore-scripts --no-audit --no-fund "${@:2}"
  }
  hosted="$nexus/repository/npm-hosted/" group="$nexus/repository/npm-group/"
  packed="$(jq -r .tarballIntegritySha512 "$record")"
  encoded="${name/\//%2f}"
  code="$(curl -q --noproxy '*' -sS --max-time 30 -o "$work/view.json" -w '%{http_code}' "${group}${encoded}" 2>/dev/null)" || die "readback-transport: npm-group request failed"
  case "$code" in
  200) existing="$(jq -er --arg v "$version" '(.versions // {}) | if has($v) then .[$v].dist.integrity | select(type == "string" and length > 0) else "" end' "$work/view.json" 2>/dev/null)" || die "readback-invalid: malformed registry metadata" ;;
  404) existing="" ;;
  *) die "readback-http: npm-group returned HTTP $code" ;;
  esac
  publication=existing
  if [ -n "$existing" ]; then
    [ "$existing" = "$packed" ] || die "immutable-version-conflict: existing version differs from packed tarball"
  elif [ "$mode" = verify ]; then
    die "version-not-published: operator must publish this exact version before CI verification"
  else
    [ -n "${BAO_TOKEN:-}" ] || die "missing-credential: inject BAO_TOKEN with the existing OpenBao helper"
    need_bao_addr
    [[ "$addr" =~ ^https?://[a-zA-Z0-9.-]+(:[0-9]+)?/?$ ]] || die "invalid-openbao: expected a credential-free origin"
    response="$(printf 'X-Vault-Token: %s\n' "$BAO_TOKEN" | curl -q --noproxy '*' -sS --max-time 20 -H @- -w '\n%{http_code}' "${addr%/}/v1/$(kv_data_path "$RELEASE_NEXUS_BAO_PATH")" 2>/dev/null)" || die "credential-transport: OpenBao request failed"
    code="${response##*$'\n'}"
    [ "$code" = 200 ] || die "credential-http: OpenBao returned HTTP $code"
    response="${response%$'\n'*}"
    pub_user="$(printf '%s' "$response" | jq -er '.data.data.username | select(type == "string" and length > 0)' 2>/dev/null)" || die "missing-credential: OpenBao username"
    pub_pass="$(printf '%s' "$response" | jq -er '.data.data["rice-publisher-password"] | select(type == "string" and length > 0)' 2>/dev/null)" || die "missing-credential: OpenBao publisher password"
    auth="$(printf '%s:%s' "$pub_user" "$pub_pass" | base64 | tr -d '\n')"
    unset response pub_user pub_pass
    # Publish exactly the packed bytes; a retry reads this immutable version before any mutation.
    (cd "$work" && npm_isolated "$work/publish.npmrc" publish "$tarball" --registry "$hosted" --tag "$tag" --provenance=false >/dev/null 2>&1) || die "publish-failed: npm-hosted publication refused"
    unset auth
    publication=created
  fi
  npm_cache=consumer-cache
  viewed="$(cd "$work" && npm_isolated "$work/anon.npmrc" view "$name@$version" dist.integrity --registry "$group" 2>/dev/null)" || die "readback-failed: npm-group view refused"
  [ "$viewed" = "$packed" ] || die "integrity-mismatch: registry differs from packed tarball"
  printf '{"name":"consumer","version":"0.0.0","private":true}\n' >"$work/consumer/package.json"
  (cd "$work/consumer" && npm_isolated "$work/anon.npmrc" install "$name@$version" --registry "$group" >/dev/null 2>&1) || die "install-failed: clean npm-group install refused"
  locked="$(jq -r --arg p "node_modules/$name" '.packages[$p].integrity' "$work/consumer/package-lock.json")"
  [ "$locked" = "$packed" ] || die "integrity-mismatch: consumer lock differs from packed tarball"
  [ "$(jq -r .version "$work/consumer/node_modules/$name/package.json")" = "$version" ] || die "version-mismatch: installed package"
  cp "$work/consumer/package-lock.json" "$out/$base.consumer-lock.json"
  (cd "$work/consumer" && npm_isolated "$work/anon.npmrc" ci --offline --registry "$group" >/dev/null 2>&1) || die "offline-install-failed: cached lockfile reinstall refused"
  [ "$(jq -r .version "$work/consumer/node_modules/$name/package.json")" = "$version" ] || die "version-mismatch: offline installed package"
  jq --arg tag "$tag" --arg hosted "$hosted" --arg group "$group" --arg mode "$mode" --arg publication "$publication" \
    '. + {mode: $mode, publication: $publication, tag: $tag, publishRegistry: $hosted, readRegistry: $group, published: true, readback: true, cleanInstall: true, offlineInstall: true}' \
    "$record" >"$out/$base.$mode.json"
  echo "npm-package: $mode $name@$version ($publication); anonymous readback, clean install and offline reinstall verified"
  ;;

roundtrip)
  set +x
  ulimit -c 0
  dir="$1"
  shift
  admin_sops="" nexus="${RELEASE_NEXUS_URL:-}"
  while [ $# -gt 0 ]; do
    case "$1" in
    --admin-sops) admin_sops="${2:?}"; shift 2 ;;
    --nexus) nexus="${2:?}"; shift 2 ;;
    *) usage ;;
    esac
  done
  [ -n "$admin_sops" ] || usage
  [ -z "${CI:-}${GITHUB_ACTIONS:-}" ] || { echo "npm-package: refusing to run in CI (R-5, T12)" >&2; exit 2; }
  need_config RELEASE_NEXUS_URL "$nexus"
  need_config RELEASE_NEXUS_BAO_PATH "${RELEASE_NEXUS_BAO_PATH:-}"
  [ -n "${BAO_TOKEN:-}" ] || die "BAO_TOKEN is not set; run under the OpenBao operator wrapper"
  for t in curl sops base64; do command -v "$t" >/dev/null || die "$t not found"; done
  lint "$dir" >/dev/null
  name="$(pkg_field "$dir" .name)"
  version="$(pkg_field "$dir" .version)"
  short="${name#*/}"
  enc="${name/\//%2f}"
  host="${nexus#*://}"
  hosted="$nexus/repository/npm-hosted/"
  group="$nexus/repository/npm-group/"
  work="$(mktemp -d "${TMPDIR:-/tmp}/npm-roundtrip.XXXXXX")"
  chmod 700 "$work"
  trap 'rm -rf "$work"' EXIT
  umask 077
  need_bao_addr
  response="$(printf 'X-Vault-Token: %s\n' "$BAO_TOKEN" | curl -q --noproxy '*' -sS --max-time 20 -H @- -w '\n%{http_code}' "$addr/v1/$(kv_data_path "$RELEASE_NEXUS_BAO_PATH")" 2>/dev/null)" || die "OpenBao transport failure"
  code="${response##*$'\n'}"
  [ "$code" = 200 ] || die "OpenBao publisher GET returned HTTP $code"
  response="${response%$'\n'*}"
  pub_user="$(printf '%s' "$response" | jq -er '.data.data.username | select(type == "string" and length > 0)' 2>/dev/null)" || die "cannot read the publisher username"
  pub_pass="$(printf '%s' "$response" | jq -er '.data.data["rice-publisher-password"] | select(type == "string" and length > 0)' 2>/dev/null)" || die "cannot read the publisher password"
  unset response
  admin_pass="$(sops -d "$admin_sops" 2>/dev/null)" || die "cannot decrypt the admin password"
  fail=0 deleted=""
  step() { printf '%-64s %s\n' "$1" "$2"; }
  check() { if [ "$2" = "$3" ]; then step "$1" "ok ($3)"; else step "$1" "FAIL expected $2 got $3"; fail=1; fi; }
  http() { # USER PASS METHOD URL ("-" user: anonymous); body in $work/http.json
    if [ "$1" = "-" ]; then curl -q -sS --max-time 30 -X "$3" -o "$work/http.json" -w '%{http_code}' "$4"
    else printf 'user = "%s:%s"\n' "$1" "$2" | curl -q -sS --max-time 30 --config - -X "$3" -o "$work/http.json" -w '%{http_code}' "$4"; fi
  }
  component_id=""
  find_component() {
    local code
    code="$(http admin "$admin_pass" GET "$nexus/service/rest/v1/search?repository=npm-hosted&name=$short&version=$version")"
    [ "$code" = 200 ] || return 1
    component_id="$(jq -r '.items[0].id // empty' "$work/http.json")"
  }
  cleanup() {
    if [ -z "$deleted" ] && find_component && [ -n "$component_id" ]; then
      echo "npm-package: cleanup delete of the probe component: HTTP $(http admin "$admin_pass" DELETE "$nexus/service/rest/v1/components/$component_id")" >&2
    fi
    rm -rf "$work"
  }
  trap cleanup EXIT
  # shellcheck disable=SC2016
  printf '//%s/repository/npm-hosted/:_auth=${NPM_AUTH}\n' "$host" >"$work/npmrc"
  : >"$work/npmrc-anon"
  : >"$work/global.npmrc"
  mkdir "$work/home"

  find_component || die "admin search failed"
  [ -z "$component_id" ] || { step "precondition: leftover component" "deleting (HTTP $(http admin "$admin_pass" DELETE "$nexus/service/rest/v1/components/$component_id"))"; sleep 2; }
  "$0" pack "$dir" "$work/out" | sed 's/^/  /'
  tarball="$(find "$work/out" -maxdepth 1 -name '*.tgz' | head -n1)"
  packed="$(jq -r .tarballIntegritySha512 "$work"/out/*.pack.json)"

  auth="$(printf '%s:%s' "$pub_user" "$pub_pass" | base64 | tr -d '\n')"
  (cd "$dir" && printf '%s\n' "$auth" | env -i PATH="$PATH" HOME="$work/home" TMPDIR="${TMPDIR:-/tmp}" \
    bash -c 'IFS= read -r NPM_AUTH; export NPM_AUTH; exec npm "$@"' npm-stdin \
    publish --tag probe --userconfig "$work/npmrc" --globalconfig "$work/global.npmrc" --registry "$hosted" \
    --cache "$work/publish-cache" --logs-max=0 --loglevel=silent --fetch-retries=0 --fetch-timeout=30000 \
    --ignore-scripts --no-audit --no-fund --update-notifier=false >/dev/null 2>&1) || { step "npm publish to npm-hosted" "FAIL: publication refused"; exit 1; }
  unset auth
  step "npm publish to npm-hosted (no provenance flag)" "ok"
  check "hosted packument (publisher)" 200 "$(http "$pub_user" "$pub_pass" GET "${hosted}${enc}")"
  check "group packument (anonymous)" 200 "$(http - - GET "${group}${enc}")"
  check "npm view through npm-group, integrity equals the pack" "$packed" "$(npm view "$name@$version" dist.integrity --userconfig "$work/npmrc-anon" --registry "$group")"
  mkdir -p "$work/consumer"
  printf '{"name":"consumer","version":"0.0.0","private":true}\n' >"$work/consumer/package.json"
  (cd "$work/consumer" && npm install "$name@$version" --userconfig "$work/npmrc-anon" --registry "$group" --no-audit --no-fund >"$work/install.log" 2>&1) || { step "npm install through npm-group" "FAIL: $(tail -n 3 "$work/install.log" | tr '\n' ' ' | cut -c1-200)"; exit 1; }
  check "npm install through npm-group, lockfile integrity equals the pack" "$packed" "$(jq -r --arg p "node_modules/$name" '.packages[$p].integrity' "$work/consumer/package-lock.json")"
  installed_sha="$(sha256_of "$work/consumer/node_modules/$name/package.json")"
  check "installed package.json equals the source package.json" "$(sha256_of "$dir/package.json")" "$installed_sha"

  component_id=""
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    find_component || die "admin search failed"
    [ -n "$component_id" ] && break
    sleep 3
  done
  [ -n "$component_id" ] || die "the component never appeared in the admin search"
  pub_del="$(http "$pub_user" "$pub_pass" DELETE "$nexus/service/rest/v1/components/$component_id")"
  case "$pub_del" in 403 | 404) step "publisher delete is refused" "ok (HTTP $pub_del)" ;; *) step "publisher delete is refused" "FAIL HTTP $pub_del"; fail=1 ;; esac
  check "admin DELETE /service/rest/v1/components/{id}" 204 "$(http admin "$admin_pass" DELETE "$nexus/service/rest/v1/components/$component_id")"
  deleted=1
  sleep 2
  check "hosted tarball after delete" 404 "$(http - - GET "${hosted}${enc}/-/${short}-${version}.tgz")"
  http admin "$admin_pass" GET "$nexus/service/rest/v1/search?repository=npm-hosted&name=$short" >/dev/null
  check "search npm-hosted after delete (items)" 0 "$(jq -r '.items | length' "$work/http.json")"
  http - - GET "${group}${enc}" >/dev/null
  check "npm-group lists the probe version after delete" 0 "$(jq -r --arg v "$version" '[(.versions // {}) | keys[] | select(. == $v)] | length' "$work/http.json" 2>/dev/null || echo 0)"
  unset admin_pass pub_pass
  if [ "$fail" = 0 ]; then echo "npm-package: roundtrip passed"; else echo "npm-package: roundtrip FAILED" >&2; exit 1; fi
  ;;
*) usage ;;
esac
