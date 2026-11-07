#!/usr/bin/env bash
# oci-image.sh MODE [flags]: private OCI images on a plain-HTTP registry (release ticket 14).
#
#   oci-image.sh build  --dist DIR --binary NAME --version V --repo HOST:PORT/PATH [--archive-version AV] [--out FILE]
#       builds a linux/amd64 + linux/arm64 image from the verified release archives in DIR (NAME_V_linux_ARCH.tar.gz),
#       pushes it to --repo:V, writes the image index digest to --out (default ./image-digest.txt). No provenance or
#       buildx SBOM attestation (--provenance=false --sbom=false): the SBOM is produced separately by `sbom`.
#   oci-image.sh pull   --repo R --digest sha256:HEX --binary NAME [--arg ARG]
#       pulls by digest and runs the image once (`NAME ARG`, default `version`)
#   oci-image.sh scan   --repo R --digest D [--server URL] [--out FILE]   Trivy in client/server mode (--server or RELEASE_TRIVY_SERVER)
#   oci-image.sh sbom   --repo R --digest D --out FILE                    Syft CycloneDX of the image, apart from the build
#   oci-image.sh sign   --repo R --digest D --bao-path P --pubkey F       operator: cosign key mode, --tlog-upload=false
#   oci-image.sh verify --repo R --digest D --pubkey F                    cosign verify, offline (--insecure-ignore-tlog=true)
#   oci-image.sh cleanup --repo R [--volume NAME]                         remove the probe repository from the registry
#
# Configuration, none of it built in: RELEASE_TRIVY_SERVER is the Trivy server URL (the --server flag overrides it);
# RELEASE_OCI_REFUSED_PORTS is an optional space or comma separated list of registry ports a reference may not use (a
# pipeline lists the ports of registries that must never receive these images); BAO_ADDR is the OpenBao address that the
# operator wrapper exports with BAO_TOKEN.
# The registry is plain HTTP: loopback (127.0.0.1:PORT) is allowed by the container tools without configuration; a remote
# client names the registry host and cosign gets --allow-http-registry. A registry without delete support is cleaned by
# `cleanup`, which tries the API first and otherwise removes exactly the probe repository directory from the registry
# volume NAME with a throwaway container, after checking that the repository path starts with "rice-release-probe".
# Operator modes run under an OpenBao operator wrapper that exports BAO_ADDR and BAO_TOKEN to the child only.
# Exit 0 ok, 1 failure, 2 usage or refusal.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=versions.env
. "$script_dir/versions.env"
die() { echo "oci-image: $*" >&2; exit 1; }
refuse() { echo "oci-image: $*" >&2; exit 2; }
usage() { awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "${BASH_SOURCE[0]}" >&2; exit 2; }

[ $# -ge 1 ] || usage
mode="$1"
shift
dist="" binary="" version="" archive_version="" repo="" out="" digest="" server="${RELEASE_TRIVY_SERVER:-}" bao_path="" pubkey="" volume="" arg="version"
while [ $# -gt 0 ]; do
  case "$1" in
  --dist) dist="${2:?}"; shift 2 ;;
  --binary) binary="${2:?}"; shift 2 ;;
  --version) version="${2:?}"; shift 2 ;;
  --archive-version) archive_version="${2:?}"; shift 2 ;;
  --repo) repo="${2:?}"; shift 2 ;;
  --out) out="${2:?}"; shift 2 ;;
  --digest) digest="${2:?}"; shift 2 ;;
  --server) server="${2:?}"; shift 2 ;;
  --bao-path) bao_path="${2:?}"; shift 2 ;;
  --pubkey) pubkey="${2:?}"; shift 2 ;;
  --volume) volume="${2:?}"; shift 2 ;;
  --arg) arg="${2:?}"; shift 2 ;;
  *) usage ;;
  esac
done
[ -n "$repo" ] || usage
refused_ports="${RELEASE_OCI_REFUSED_PORTS:-}"
refused_ports="${refused_ports//,/ }"
refused_ports="${refused_ports//$'\n'/ }"
if [[ "$refused_ports" =~ [^[:space:]] ]]; then
  IFS=$' \t\n' read -r -a refused_port_list <<<"$refused_ports"
  for p in "${refused_port_list[@]}"; do
    [[ "$p" =~ ^[0-9]{1,5}$ ]] || refuse "RELEASE_OCI_REFUSED_PORTS must list port numbers, got \"$p\""
  done
fi
[[ "$repo" =~ ^[A-Za-z0-9.-]+:([0-9]{1,5})/[a-z0-9][a-z0-9._/-]*$ ]] || refuse "--repo must look like HOST:PORT/PATH"
repo_port="${BASH_REMATCH[1]}"
if [[ "$refused_ports" =~ [^[:space:]] ]]; then
  for p in "${refused_port_list[@]}"; do
    if [ "$((10#$p))" = "$((10#$repo_port))" ]; then refuse "registry port $p is refused by RELEASE_OCI_REFUSED_PORTS ($repo)"; fi
  done
fi
digest_re='^sha256:[0-9a-f]{64}$'
need_digest() { [[ "$digest" =~ $digest_re ]] || refuse "--digest must be sha256:<64 lowercase hex>"; }
is_loopback() { [[ "$repo" == 127.0.0.1:* || "$repo" == localhost:* ]]; }

case "$mode" in
build)
  [ -d "$dist" ] && [ -n "$binary" ] && [ -n "$version" ] || usage
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || refuse "image version \"$version\" must be MAJOR.MINOR.PATCH (stable tags only, R-4)"
  command -v docker >/dev/null || die "docker not found"
  ctx="$(mktemp -d "${TMPDIR:-/tmp}/oci-build.XXXXXX")"
  trap 'rm -rf "$ctx"' EXIT
  for arch in amd64 arm64; do
    archive="$dist/${binary}_${archive_version:-$version}_linux_${arch}.tar.gz"
    [ -f "$archive" ] || die "missing $archive"
    mkdir -p "$ctx/linux/$arch"
    tar -xzf "$archive" -C "$ctx/linux/$arch" "$binary"
    chmod 755 "$ctx/linux/$arch/$binary"
  done
  mkdir "$ctx/state"
  : >"$ctx/state/.keep"
  { grep -v '^ENTRYPOINT\|^# ENTRYPOINT' "$script_dir/../oci/Dockerfile"; echo "ENTRYPOINT [\"/${binary}\"]"; } >"$ctx/Dockerfile"
  builder="rice-release-oci"
  docker buildx inspect "$builder" >/dev/null 2>&1 || docker buildx create --name "$builder" --driver docker-container --driver-opt network=host >/dev/null
  docker buildx build --builder "$builder" --platform linux/amd64,linux/arm64 --provenance=false --sbom=false \
    --build-arg "BINARY=$binary" --build-arg "VERSION=$version" -t "$repo:$version" --push --metadata-file "$ctx/meta.json" "$ctx" >"$ctx/build.log" 2>&1 || { tail -n 25 "$ctx/build.log" >&2; die "buildx build failed"; }
  d="$(jq -r '."containerimage.digest"' "$ctx/meta.json")"
  [[ "$d" =~ $digest_re ]] || die "no image digest in the build metadata"
  printf '%s\n' "$d" >"${out:-image-digest.txt}"
  echo "oci-image: pushed $repo:$version $d (platforms linux/amd64, linux/arm64; no provenance attestation)"
  ;;
pull)
  need_digest
  [ -n "$binary" ] || usage
  docker pull "$repo@$digest" >/dev/null
  echo "oci-image: pulled $repo@$digest"
  echo "oci-image: platform $(docker image inspect "$repo@$digest" --format '{{.Os}}/{{.Architecture}}')"
  docker run --rm "$repo@$digest" "$arg"
  ;;
scan)
  need_digest
  [ -n "$server" ] || refuse "scan needs a Trivy server: pass --server URL or set RELEASE_TRIVY_SERVER"
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/oci-scan.XXXXXX")"
  trap 'rm -rf "$tmp"' EXIT
  docker run --rm --network host -v "$tmp:/out" "$TRIVY_IMAGE" image --server "$server" --insecure --format json --output /out/trivy.json --quiet "$repo@$digest" >"$tmp/scan.log" 2>&1 || { tail -n 15 "$tmp/scan.log" >&2; die "trivy scan failed"; }
  jq -e '.SchemaVersion' "$tmp/trivy.json" >/dev/null || die "trivy output is not a report"
  critical="$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "CRITICAL")] | length' "$tmp/trivy.json")"
  high="$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "HIGH")] | length' "$tmp/trivy.json")"
  total="$(jq '[.Results[]?.Vulnerabilities[]?] | length' "$tmp/trivy.json")"
  [ -z "$out" ] || cp "$tmp/trivy.json" "$out"
  echo "oci-image: trivy ($TRIVY_IMAGE via $server): $total vulnerabilities, $critical critical, $high high; results $(jq '[.Results[]?] | length' "$tmp/trivy.json")"
  ;;
sbom)
  need_digest
  [ -n "$out" ] || usage
  command -v syft >/dev/null || die "syft not found"
  [ "$(syft version 2>&1 | awk '/^Version/{print $2}')" = "$SYFT_VERSION" ] || die "syft $SYFT_VERSION is pinned"
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/oci-sbom.XXXXXX")"
  trap 'rm -rf "$tmp"' EXIT
  SYFT_REGISTRY_INSECURE_USE_HTTP=true syft scan "registry:$repo@$digest" --platform linux/amd64 --quiet --source-name "$repo" --output "cyclonedx-json=$tmp/raw.json"
  jq -S 'del(.serialNumber, .metadata.timestamp)' "$tmp/raw.json" >"$out"
  jq -e '.bomFormat == "CycloneDX" and ((.components // []) | length) >= 1' "$out" >/dev/null || die "the image SBOM has no components"
  echo "oci-image: SBOM $out ($(jq '.components | length' "$out") components, Syft $SYFT_VERSION)"
  ;;
sign)
  need_digest
  [ -z "${CI:-}${GITHUB_ACTIONS:-}" ] || refuse "refusing to sign in CI (R-5, T12)"
  [ -n "$bao_path" ] && [ -f "$pubkey" ] || usage
  [ -n "${BAO_TOKEN:-}" ] || die "BAO_TOKEN is not set; run under the OpenBao operator wrapper"
  command -v cosign >/dev/null || die "cosign not found"
  export -n oci_token oci_response oci_body oci_key oci_password
  oci_token="$BAO_TOKEN"
  unset BAO_TOKEN VAULT_TOKEN COSIGN_PRIVATE_KEY COSIGN_PASSWORD
  trap 'unset oci_token oci_response oci_body oci_key oci_password' EXIT
  addr="${BAO_ADDR:-}"
  [ -n "$addr" ] || die "BAO_ADDR is not set; the OpenBao operator wrapper exports it with BAO_TOKEN"
  [[ "$addr" =~ ^https?://(\[[0-9A-Fa-f:]+\]|[A-Za-z0-9.-]+)(:[0-9]+)?/?$ ]] || die "OpenBao address must be an HTTP origin without credentials"
  if oci_response="$(printf 'X-Vault-Token: %s\n' "$oci_token" | curl -q --noproxy '*' -sS --max-time 20 -H @- -w '\n%{http_code}' "${addr%/}/v1/${bao_path%%/*}/data/${bao_path#*/}" 2>/dev/null)"; then
    unset oci_token
  else
    code=$?
    unset oci_token oci_response
    die "OpenBao transport failure (curl exit $code)"
  fi
  code="${oci_response##*$'\n'}"
  [ "$code" = 200 ] || die "OpenBao GET $bao_path returned HTTP $code"
  oci_body="${oci_response%$'\n'*}"
  unset oci_response
  oci_key="$(printf '%s' "$oci_body" | jq -je '(.data.data["cosign-key"] // .data.data.key) | select(type == "string" and length > 0 and index("\u0000") == null)' 2>/dev/null && printf .)" || die "OpenBao signing key field is invalid"
  oci_key="${oci_key%.}"
  oci_password="$(printf '%s' "$oci_body" | jq -je '(.data.data["cosign-password"] // .data.data.password) | select(type == "string" and index("\u0000") == null)' 2>/dev/null && printf .)" || die "OpenBao signing password field is invalid"
  oci_password="${oci_password%.}"
  unset oci_body
  http_flag=()
  is_loopback || http_flag=(--allow-http-registry)
  if COSIGN_PRIVATE_KEY="$oci_key" COSIGN_PASSWORD="$oci_password" cosign sign --key env://COSIGN_PRIVATE_KEY --tlog-upload=false --use-signing-config=false --new-bundle-format=false --yes ${http_flag[@]+"${http_flag[@]}"} "$repo@$digest" >/dev/null 2>&1; then
    unset oci_key oci_password
  else
    code=$?
    unset oci_key oci_password
    die "cosign sign failed (exit $code)"
  fi
  echo "oci-image: signed $repo@$digest (cosign $(cosign version 2>&1 | awk '/GitVersion/{print $2}'), key mode, --tlog-upload=false)"
  ;;
verify)
  need_digest
  [ -f "$pubkey" ] || usage
  http_flag=()
  is_loopback || http_flag=(--allow-http-registry)
  cosign verify --key "$pubkey" --insecure-ignore-tlog=true --new-bundle-format=false ${http_flag[@]+"${http_flag[@]}"} "$repo@$digest" >/dev/null 2>"${TMPDIR:-/tmp}/oci-verify.err" || { tail -n 5 "${TMPDIR:-/tmp}/oci-verify.err" >&2; rm -f "${TMPDIR:-/tmp}/oci-verify.err"; die "cosign verify failed"; }
  rm -f "${TMPDIR:-/tmp}/oci-verify.err"
  echo "oci-image: signature verifies offline for $repo@$digest"
  ;;
cleanup)
  path="${repo#*/}"
  [[ "$path" == rice-release-probe* ]] || refuse "cleanup removes probe repositories only (path must start with rice-release-probe), got $path"
  host="${repo%%/*}"
  base="http://$host"
  tags="$(curl -sS -m 15 "$base/v2/$path/tags/list" | jq -r '.tags[]?' 2>/dev/null || true)"
  removed_via=""
  for t in $tags; do
    d="$(curl -sS -m 15 -I -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json' "$base/v2/$path/manifests/$t" | awk -F': ' 'tolower($1)=="docker-content-digest"{print $2}' | tr -d '\r')"
    [ -z "$d" ] || { code="$(curl -sS -m 15 -o /dev/null -w '%{http_code}' -X DELETE "$base/v2/$path/manifests/$d")"; [ "$code" = 202 ] && removed_via=api; }
  done
  if [ -n "$tags" ] && [ -z "$removed_via" ]; then
    [ -n "$volume" ] || die "the registry refuses deletes (405); pass --volume NAME to remove the probe repository directory from the registry volume, or enable REGISTRY_STORAGE_DELETE_ENABLED on the registry"
    docker run --rm -v "$volume:/data" alpine:3 sh -c "rm -rf \"/data/docker/registry/v2/repositories/$path\"" >/dev/null
    removed_via="volume directory of $path"
  fi
  code="$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$base/v2/$path/tags/list")"
  [ "$code" = 404 ] || { echo "oci-image: tags/list for $path still answers HTTP $code" >&2; exit 1; }
  echo "oci-image: $path removed (${removed_via:-nothing to remove}); tags/list now HTTP 404"
  ;;
*) usage ;;
esac
