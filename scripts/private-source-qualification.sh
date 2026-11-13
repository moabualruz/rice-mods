#!/bin/bash
# Linux host entrypoint; the binding references native writer custody, not authority granted by this file.
set -euo pipefail
set +x
umask 077

[ "$#" -eq 2 ] || { echo 'usage: private-source-qualification.sh BINDING_JSON OPERATION_DIRECTORY' >&2; exit 64; }
binding=$1
operation=$2
case "$binding" in /*) ;; *) echo 'binding path must be absolute' >&2; exit 64 ;; esac
case "$operation" in /*) ;; *) echo 'operation path must be absolute' >&2; exit 64 ;; esac
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
mkdir -m 0700 -- "$operation" || { echo 'operation directory must be fresh' >&2; exit 65; }
lock_root="${XDG_STATE_HOME:-$HOME/.local/state}/agent-execution/rice-mods"
mkdir -p -- "$lock_root"
[ ! -L "$lock_root/private-source-secret.lock" ] || { echo 'secret lock must not be a symlink' >&2; exit 65; }
exec 9>> "$lock_root/private-source-secret.lock"
flock -n 9 || { echo 'JIT controller already owns this operation' >&2; exit 73; }

helper=/workspace/backbone/rice-observe/rice-observe
helper_sha=$(jq -er '.helperSHA256 | select(test("^[0-9a-f]{64}$"))' "$binding")
operator=$(command -v bao-run)
host_root=$(CDPATH='' cd -- "$here/.." && pwd)
app_id=4018471
source_repository=$(jq -er '.sourceRepository | select(test("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"))' "$binding")
jq -e --arg repository "$source_repository" 'index($repository) != null' "$here/private-repositories.json" >/dev/null || { echo 'source repository is not declared private' >&2; exit 65; }
node=$(mise which --tool node@24.18.0 node)
timeout=$(command -v timeout)
[ -x "$helper" ] && [ -x "$operator" ] || { echo 'required delivered host executable unavailable' >&2; exit 69; }
actual=$(sha256sum -- "$helper")
[ "${actual%% *}" = "$helper_sha" ] || { echo 'delivered helper digest mismatch' >&2; exit 65; }
cd -- "$host_root"

supervisor=
supervisor_birth=
recover() {
  status=$?
  trap - EXIT INT TERM
  if [ -n "$supervisor" ] && [ "$(ps -p "$supervisor" -o lstart= || true)" = "$supervisor_birth" ]; then
    kill -TERM "$supervisor" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
      [ "$(ps -p "$supervisor" -o lstart= || true)" = "$supervisor_birth" ] || break
      sleep 1
    done
    if [ "$(ps -p "$supervisor" -o lstart= || true)" = "$supervisor_birth" ]; then kill -KILL "$supervisor" 2>/dev/null || true; fi
    wait "$supervisor" 2>/dev/null || true
  fi
  cleanup=0
  if [ -f "$operation/operation.json" ]; then
    "$timeout" --signal=TERM --kill-after=5s 3m "$node" "$here/private-source-controller.mjs" recover "$binding" "$operation" > "$operation/recovery-command.log" 2>&1 || cleanup=$?
  fi
  jq -n --arg ended "$(date -u +%FT%TZ)" --argjson exit "$status" --argjson cleanup "$cleanup" '{endedAt:$ended,launcherExit:$exit,recoveryExit:$cleanup,scope:"Owned controller closeout, no native product qualification inferred"}' > "$operation/launcher-terminal.json"
  [ "$status" -ne 0 ] || status=$cleanup
  exit "$status"
}
trap recover EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Native timeout forwards cancellation to the owned helper group; its defer revokes the token.
"$timeout" --signal=TERM --kill-after=15s 17m "$operator" -- "$helper" github with-contents-read --repo "$source_repository" --timeout 15m --app-id "$app_id" --key bao://kv/homelab/rice-observe-app#private-key -- "$node" "$here/private-source-controller.mjs" operate "$binding" "$operation" > "$operation/helper-command.log" 2>&1 &
supervisor=$!
supervisor_birth=$(ps -p "$supervisor" -o lstart=)
jq -n --arg at "$(date -u +%FT%TZ)" --arg birth "$supervisor_birth" --arg helper "$helper_sha" --argjson pid "$supervisor" '{startedAt:$at,supervisorPID:$pid,supervisorBirth:$birth,helperSHA256:$helper,scope:"Actual JIT contents-read controller, bounded native helper"}' > "$operation/launcher-start.json"
wait "$supervisor"
supervisor=
