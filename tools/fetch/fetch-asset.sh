#!/usr/bin/env bash
# fetch-asset.sh: download one release asset, verify its pinned SHA-256 and move it into place atomically.
# The single download path for the family's pinned tool installers (vendir, GoReleaser, Syft,
# cyclonedx-gomod, cosign, minisign, Maestro and the like), vendored with Carvel vendir.
#
# Only transient failures are retried, with exponential backoff that honors a numeric Retry-After: HTTP 5xx,
# 408, 425 and 429, and the curl transport errors in TRANSIENT_CURL_EXITS (connect, timeout, partial transfer,
# empty reply, send and receive errors). Everything else, such as a certificate failure, an unresolvable host or
# any other HTTP status, fails at once.
#
# When RICE_ASSET_MIRROR names a raw proxy of the origin (a caching raw proxy repository on the runner's private
# network), the mirror is tried first. The origin is used only when the mirror is unavailable: its transient
# failures are exhausted or it answers 404 (not cached). A checksum mismatch from the mirror fails closed (a
# poisoned or stale mirror must be surfaced; unset RICE_ASSET_MIRROR to bypass it), and so does any other
# mirror failure. A checksum mismatch from the origin fails closed.
set -euo pipefail

usage() {
  cat <<EOF
Usage: fetch-asset.sh [options] URL SHA256 DEST

Download URL to DEST only when its SHA-256 equals SHA256. DEST's directory must exist; DEST is
replaced atomically and keeps the temporary file's mode (callers chmod as needed).

Options:
  --attempts N     attempts per source, 1 to 10 (default 5, env RICE_FETCH_ATTEMPTS)
  --base-delay S   first backoff in seconds, doubled per retry (default 2, env RICE_FETCH_BASE_DELAY)
  --max-delay S    backoff and Retry-After cap in seconds (default 30, env RICE_FETCH_MAX_DELAY)
  --max-time S     per-attempt transfer limit in seconds (default 300, env RICE_FETCH_MAX_TIME)
  -h, --help       show this help

Environment:
  RICE_ASSET_MIRROR         base URL of a raw proxy for RICE_ASSET_MIRROR_ORIGIN; tried first
  RICE_ASSET_MIRROR_ORIGIN  URL prefix the mirror proxies (default https://github.com/)

Exit codes:
  0  DEST written and verified
  1  download failed (retries exhausted, a non-retryable status or transport error, or a mirror failure)
  2  usage error
  3  curl missing
  4  mirror or origin content did not match the pinned SHA-256
EOF
}

die_usage() {
  echo "fetch-asset: $1; see --help" >&2
  exit 2
}

attempts="${RICE_FETCH_ATTEMPTS:-5}"
base_delay="${RICE_FETCH_BASE_DELAY:-2}"
max_delay="${RICE_FETCH_MAX_DELAY:-30}"
max_time="${RICE_FETCH_MAX_TIME:-300}"
args=()
while [ "$#" -gt 0 ]; do
  case "$1" in
  -h | --help)
    usage
    exit 0
    ;;
  --attempts) attempts="${2:-}"; shift ;;
  --base-delay) base_delay="${2:-}"; shift ;;
  --max-delay) max_delay="${2:-}"; shift ;;
  --max-time) max_time="${2:-}"; shift ;;
  --)
    shift
    args+=("$@")
    break
    ;;
  -*) die_usage "unknown option $1" ;;
  *) args+=("$1") ;;
  esac
  shift
done
[ "${#args[@]}" -eq 3 ] || die_usage "expected URL SHA256 DEST"
url="${args[0]}" want="${args[1]}" dest="${args[2]}"

is_uint() { case "$1" in '' | *[!0-9]*) return 1 ;; *) return 0 ;; esac }
is_uint "$attempts" && [ "$attempts" -ge 1 ] && [ "$attempts" -le 10 ] || die_usage "--attempts must be 1 to 10"
is_uint "$base_delay" || die_usage "--base-delay must be a whole number of seconds"
is_uint "$max_delay" || die_usage "--max-delay must be a whole number of seconds"
is_uint "$max_time" && [ "$max_time" -ge 1 ] || die_usage "--max-time must be a positive number of seconds"
case "$url" in https://* | http://*) ;; *) die_usage "URL must be http or https" ;; esac
want="$(printf '%s' "$want" | tr 'A-F' 'a-f')"
case "$want" in *[!0-9a-f]* | '') die_usage "SHA256 must be 64 hex digits" ;; esac
[ "${#want}" -eq 64 ] || die_usage "SHA256 must be 64 hex digits"
[ -d "$(dirname "$dest")" ] || die_usage "DEST directory $(dirname "$dest") does not exist"
command -v curl >/dev/null 2>&1 || {
  echo "fetch-asset: curl is required" >&2
  exit 3
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}
# Log URLs without any userinfo a mirror base might carry.
show() { printf '%s' "$1" | sed -E 's#^([a-z]+://)[^/@]*@#\1#'; }

tmp="$(mktemp "${dest}.XXXXXX")"
hdr="$(mktemp "${dest}.hdr.XXXXXX")"
trap 'rm -f "$tmp" "$hdr"' EXIT

# curl exit codes that mean a transient transport failure: 7 connect failed, 18 partial transfer, 28 timeout,
# 52 empty reply, 55 send error, 56 receive error, 92 HTTP/2 stream error. An allowlist: any other curl failure
# (a certificate problem, an unresolvable host, a bad URL, a local write error) is permanent.
TRANSIENT_CURL_EXITS=" 7 18 28 52 55 56 92 "

# try_source LABEL URL ATTEMPTS: 0 verified, 1 permanent failure, 4 checksum mismatch, 5 unavailable (transient
# failures exhausted, or a mirror 404 meaning not cached).
try_source() {
  local label="$1" src="$2" n="$3" i=1 rc code delay retry_after got
  while :; do
    rc=0
    code="$(curl -q -sS -L --retry 0 --connect-timeout 10 --max-time "$max_time" -D "$hdr" -o "$tmp" -w '%{http_code}' "$src")" || rc=$?
    if [ "$rc" -eq 0 ] && [ "$code" = 200 ]; then
      got="$(sha256_of "$tmp")"
      if [ "$got" = "$want" ]; then
        echo "fetch-asset: ok from $label $(show "$src") (sha256 $want, attempt $i/$n)" >&2
        return 0
      fi
      echo "fetch-asset: checksum mismatch from $label $(show "$src"): got $got, want $want" >&2
      return 4
    fi
    if [ "$rc" -ne 0 ]; then
      case "$TRANSIENT_CURL_EXITS" in
      *" $rc "*) echo "fetch-asset: $label attempt $i/$n curl exit $rc for $(show "$src")" >&2 ;;
      *)
        echo "fetch-asset: $label curl exit $rc for $(show "$src"); not retryable" >&2
        return 1
        ;;
      esac
    else
      case "$label-$code" in
      mirror-404)
        echo "fetch-asset: mirror HTTP 404 for $(show "$src") (not cached)" >&2
        return 5
        ;;
      *-408 | *-425 | *-429 | *-5[0-9][0-9]) echo "fetch-asset: $label attempt $i/$n HTTP $code for $(show "$src")" >&2 ;;
      *)
        echo "fetch-asset: $label HTTP $code for $(show "$src"); not retryable" >&2
        return 1
        ;;
      esac
    fi
    [ "$i" -lt "$n" ] || return 5
    delay=$((base_delay << (i - 1)))
    [ "$delay" -le "$max_delay" ] || delay="$max_delay"
    retry_after="$(tr -d '\r' <"$hdr" | sed -n 's/^[Rr][Ee][Tt][Rr][Yy]-[Aa][Ff][Tt][Ee][Rr]:[[:space:]]*\([0-9][0-9]*\)[[:space:]]*$/\1/p' | tail -1)"
    if [ -n "$retry_after" ] && [ "$retry_after" -gt "$delay" ]; then
      delay="$retry_after"
      [ "$delay" -le "$max_delay" ] || delay="$max_delay"
    fi
    echo "fetch-asset: retrying $label in ${delay}s" >&2
    sleep "$delay"
    i=$((i + 1))
  done
}

origin_prefix="${RICE_ASSET_MIRROR_ORIGIN:-https://github.com/}"
mirror="${RICE_ASSET_MIRROR:-}"
if [ -n "$mirror" ] && [ "${url#"$origin_prefix"}" != "$url" ]; then
  mirror_attempts=2
  [ "$attempts" -ge 2 ] || mirror_attempts="$attempts"
  rc=0
  try_source mirror "${mirror%/}/${url#"$origin_prefix"}" "$mirror_attempts" || rc=$?
  case "$rc" in
  0)
    mv "$tmp" "$dest"
    exit 0
    ;;
  5) echo "fetch-asset: mirror unavailable; falling back to the origin" >&2 ;;
  4)
    echo "fetch-asset: the mirror served content that does not match the pin; failing closed (unset RICE_ASSET_MIRROR to bypass the mirror)" >&2
    exit 4
    ;;
  *)
    echo "fetch-asset: mirror failed permanently; failing closed (unset RICE_ASSET_MIRROR to bypass the mirror)" >&2
    exit 1
    ;;
  esac
fi

rc=0
try_source origin "$url" "$attempts" || rc=$?
case "$rc" in
0) mv "$tmp" "$dest" ;;
4) exit 4 ;;
*)
  echo "fetch-asset: giving up on $(show "$url")" >&2
  exit 1
  ;;
esac
