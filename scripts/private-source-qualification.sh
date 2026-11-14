#!/bin/bash
# Linux host entrypoint; the binding references native writer custody, not authority granted by this file.
set -euo pipefail
set +x
umask 077
unset GH_TOKEN GITHUB_TOKEN MISE_GITHUB_TOKEN RICE_RELEASE_DOWNLOAD_TOKEN RICE_RELEASE_DOWNLOAD_TOKEN_EXPIRES_AT

mode=operate
resume=false
if [ "${1:-}" = --receipt-recovery ]; then
  [ "$#" -eq 5 ] || { echo 'usage: private-source-qualification.sh --receipt-recovery CURRENT_BINDING NEW_OPERATION ORIGINAL_BINDING ORIGINAL_OPERATION' >&2; exit 64; }
  mode=receipt-recover
  shift
elif [ "${1:-}" = --resume-receipt ]; then
  [ "$#" -eq 4 ] || { echo 'usage: private-source-qualification.sh --resume-receipt RECEIPT_BINDING EXISTING_RECOVERY_OPERATION CURRENT_READER_DELIVERY' >&2; exit 64; }
  mode=recover
  resume=true
  shift
elif [ "$#" -ne 2 ]; then
  echo 'usage: private-source-qualification.sh BINDING_JSON OPERATION_DIRECTORY' >&2
  exit 64
fi
binding=$1
operation=$2
original_binding=${3:-}
original_operation=${4:-}
reader_delivery=
if [ "$resume" = true ]; then
  reader_delivery=${3:-}
  case "$reader_delivery" in /*) ;; *) echo 'reader delivery binding path must be absolute' >&2; exit 64 ;; esac
fi
case "$binding" in /*) ;; *) echo 'binding path must be absolute' >&2; exit 64 ;; esac
case "$operation" in /*) ;; *) echo 'operation path must be absolute' >&2; exit 64 ;; esac
if [ "$mode" = receipt-recover ]; then
  case "$original_binding" in /*) ;; *) echo 'original binding path must be absolute' >&2; exit 64 ;; esac
  case "$original_operation" in /*) ;; *) echo 'original operation path must be absolute' >&2; exit 64 ;; esac
fi
here=$(CDPATH='' cd -P -- "${BASH_SOURCE[0]%/*}" && pwd -P)
if [ "$resume" = true ]; then
  [ "$(/usr/bin/uname -s)" = Linux ] || exit 69
  [ -d "$operation" ] && [ ! -L "$operation" ] || { echo 'owned recovery directory required' >&2; exit 65; }
  [ "$(/usr/bin/stat -c '%u' "$operation")" = "$(/usr/bin/id -u)" ] && [ "$(/usr/bin/stat -c '%a' "$operation")" = 700 ] || { echo 'private owned recovery directory required' >&2; exit 65; }
  [ -f "$operation/operation.json" ] && [ ! -L "$operation/operation.json" ] && [ "$(/usr/bin/stat -c '%u' "$operation/operation.json")" = "$(/usr/bin/id -u)" ] && [ "$(/usr/bin/stat -c '%a' "$operation/operation.json")" = 600 ] || { echo 'private owned recovery record required' >&2; exit 65; }
  /usr/bin/jq -e '.kind == "receipt-recovery"' "$operation/operation.json" >/dev/null || { echo 'receipt recovery record required' >&2; exit 65; }
else
  /bin/mkdir -m 0700 -- "$operation" || { echo 'operation directory must be fresh' >&2; exit 65; }
fi
lock_root="${XDG_STATE_HOME:-$HOME/.local/state}/agent-execution/rice-mods"
/bin/mkdir -p -- "$lock_root"
[ ! -L "$lock_root/private-source-secret.lock" ] || { echo 'secret lock must not be a symlink' >&2; exit 65; }
exec 9>> "$lock_root/private-source-secret.lock"
/usr/bin/flock -n 9 || { echo 'JIT controller already owns this operation' >&2; exit 73; }

host_profile="$here/private-source-host.json"
native_executable() {
  local native_name="$1" native_path native_sha native_actual native_uid native_mode native_parent
  /usr/bin/jq -e '.version == 1 and .platform == "linux" and .architecture == "x64"' "$host_profile" >/dev/null || return 1
  [ "$(/usr/bin/uname -s)" = Linux ] && [ "$(/usr/bin/uname -m)" = x86_64 ] || return 1
  native_path=$(/usr/bin/jq -er --arg name "$native_name" --arg home "$HOME" '.executables[$name] | (if .homeRelative then $home + "/" + .homeRelative else .path end) | select(type == "string" and startswith("/"))' "$host_profile") || return 1
  native_sha=$(/usr/bin/jq -er --arg name "$native_name" '.executables[$name].sha256 | select(test("^[0-9a-f]{64}$"))' "$host_profile") || return 1
  native_path=$(/usr/bin/readlink -f -- "$native_path") || return 1
  [ -f "$native_path" ] && [ -x "$native_path" ] || return 1
  native_uid=$(/usr/bin/stat -c '%u' -- "$native_path") || return 1
  native_mode=$(/usr/bin/stat -c '%a' -- "$native_path") || return 1
  [ "$native_uid" -eq 0 ] || [ "$native_uid" -eq "$(/usr/bin/id -u)" ] || return 1
  case "$native_mode" in ''|*[!0-7]*) return 1 ;; esac
  (( (8#$native_mode & 8#022) == 0 )) || return 1
  native_actual=$(/usr/bin/sha256sum -- "$native_path") || return 1
  [ "${native_actual%% *}" = "$native_sha" ] || return 1
  if [ "$native_name" = gh ]; then
    [ "$(/usr/bin/od -An -tx1 -N4 -- "$native_path" | /usr/bin/tr -d ' \n')" = 7f454c46 ] || return 1
  fi
  native_parent=${native_path%/*}
  while [ -n "$native_parent" ]; do
    [ -d "$native_parent" ] || return 1
    native_uid=$(/usr/bin/stat -c '%u' -- "$native_parent") || return 1
    native_mode=$(/usr/bin/stat -c '%a' -- "$native_parent") || return 1
    [ "$native_uid" -eq 0 ] || [ "$native_uid" -eq "$(/usr/bin/id -u)" ] || return 1
    case "$native_mode" in ''|*[!0-7]*) return 1 ;; esac
    (( (8#$native_mode & 8#022) == 0 )) || return 1
    [ "$native_parent" != / ] || break
    native_parent=${native_parent%/*}
    [ -n "$native_parent" ] || native_parent=/
  done
  printf '%s\n' "$native_path"
}

native_executable gh >/dev/null || { echo 'reviewed native gh executable unavailable' >&2; exit 69; }
helper_sha=
issuer_used=false
if [ "$mode" = operate ]; then
  helper=$(native_executable rice-helper) || { echo 'reviewed Rice helper unavailable' >&2; exit 69; }
  helper_sha=$(/usr/bin/jq -er '.executables["rice-helper"].sha256' "$host_profile")
  operator=$(native_executable bao-run) || { echo 'reviewed operator executable unavailable' >&2; exit 69; }
  issuer_used=true
fi
host_root=$(CDPATH='' cd -- "$here/.." && pwd)
source_repository=$(/usr/bin/jq -er '.sourceRepository | select(test("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"))' "$binding")
/usr/bin/jq -e --arg repository "$source_repository" 'index($repository) != null' "$here/private-repositories.json" >/dev/null || { echo 'source repository is not declared private' >&2; exit 65; }
node=$(native_executable node) || { echo 'reviewed mise Node executable unavailable' >&2; exit 69; }
timeout=$(native_executable timeout) || { echo 'reviewed timeout executable unavailable' >&2; exit 69; }
cd -- "$host_root"

supervisor=
supervisor_birth=
command_log="$operation/controller-command.log"
start_file="$operation/launcher-start.json"
terminal_file="$operation/launcher-terminal.json"
if [ "$resume" = true ]; then
  command_log=$(/usr/bin/mktemp "$operation/resume-command.XXXXXXXX")
  start_file="$command_log.start.json"
  terminal_file="$command_log.terminal.json"
fi
recover() {
  status=$?
  trap - EXIT INT TERM
  if [ -n "$supervisor" ] && [ "$(/bin/ps -p "$supervisor" -o lstart= || true)" = "$supervisor_birth" ]; then
    kill -TERM "$supervisor" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
      [ "$(/bin/ps -p "$supervisor" -o lstart= || true)" = "$supervisor_birth" ] || break
      /bin/sleep 1
    done
    if [ "$(/bin/ps -p "$supervisor" -o lstart= || true)" = "$supervisor_birth" ]; then kill -KILL "$supervisor" 2>/dev/null || true; fi
    wait "$supervisor" 2>/dev/null || true
  fi
  cleanup=0
  cleanup_log=
  if [ -f "$operation/operation.json" ]; then
    cleanup_log=$(/usr/bin/mktemp "$operation/cleanup-command.XXXXXXXX") || cleanup=1
    if [ "$cleanup" -eq 0 ]; then
      cleanup_args=(recover "$binding" "$operation")
      if [ -n "$reader_delivery" ]; then cleanup_args+=("$reader_delivery"); fi
      "$timeout" --signal=TERM --kill-after=5s 3m "$node" "$here/private-source-controller.mjs" "${cleanup_args[@]}" > "$cleanup_log" 2>&1 || cleanup=$?
    fi
  fi
  /usr/bin/jq -n --arg ended "$(/bin/date -u +%FT%TZ)" --arg cleanupLog "$cleanup_log" --argjson exit "$status" --argjson cleanup "$cleanup" '{endedAt:$ended,launcherExit:$exit,recoveryExit:$cleanup,cleanupLog:$cleanupLog,scope:"Owned controller closeout, no native product qualification inferred"}' > "$terminal_file"
  [ "$status" -ne 0 ] || status=$cleanup
  exit "$status"
}
trap recover EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [ "$mode" = receipt-recover ]; then
  "$timeout" --signal=TERM --kill-after=15s 17m "$node" "$here/private-source-controller.mjs" receipt-recover "$binding" "$operation" "$original_binding" "$original_operation" > "$command_log" 2>&1 &
elif [ "$mode" = recover ]; then
  "$timeout" --signal=TERM --kill-after=15s 17m "$node" "$here/private-source-controller.mjs" recover "$binding" "$operation" "$reader_delivery" > "$command_log" 2>&1 &
else
  # Native timeout forwards cancellation to the owned helper group; its defer revokes the token.
  "$timeout" --signal=TERM --kill-after=15s 17m /bin/bash "$operator" -- "$helper" github with-contents-read --repo "$source_repository" --timeout 15m --app-id 4018471 --key bao://kv/homelab/rice-observe-app#private-key -- "$node" "$here/private-source-controller.mjs" operate "$binding" "$operation" > "$operation/helper-command.log" 2>&1 &
fi
supervisor=$!
supervisor_birth=$(/bin/ps -p "$supervisor" -o lstart=)
/usr/bin/jq -n --arg at "$(/bin/date -u +%FT%TZ)" --arg birth "$supervisor_birth" --arg helper "$helper_sha" --arg mode "$mode" --argjson issuer "$issuer_used" --argjson pid "$supervisor" '{startedAt:$at,supervisorPID:$pid,supervisorBirth:$birth,mode:$mode,issuerUsed:$issuer,scope:"Owned native controller operation"} + (if $issuer then {helperSHA256:$helper} else {} end)' > "$start_file"
wait "$supervisor"
supervisor=
