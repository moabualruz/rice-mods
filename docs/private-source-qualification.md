# Private source qualification

The ordinary CI workflow validates public metadata and local tests without receiving private source credentials. The manual `Private source qualification` workflow checks one exact private marketplace source. Both source rows are required to qualify the marketplace consumer.

The supported controller runs on the trusted Linux host with Bash, native `gh`, `jq`, GNU `timeout`, `flock`, `bao-run`, the installed workspace toolkit, and Node 24.18.0 from mise. It uses the installed Rice `github with-contents-read` command and the existing configured GitHub operator credential store. The source token reads exactly one repository; the independent operator identity manages only the explicitly bound destination operation. The launcher uses the deployed helper at `/workspace/backbone/rice-observe/rice-observe` and the existing Rice App identity; operation JSON cannot select executable recipients.

## Bind the operation

The integration owner supplies a nonsecret binding containing:

| Field | Required binding |
| --- | --- |
| `repository` | `moabualruz/rice-mods` |
| `sourceRepository` | One repository declared in `scripts/private-repositories.json` and the marketplace lock |
| `sourceCommit`, `sourceLimitsBlob` | Exact values from that source's marketplace lock row |
| `head` | Exact delivered `main` commit |
| `workflowSHA256` | SHA256 of the delivered `.github/workflows/private-source-qualification.yml` |
| `requiredCIRunID`, `requiredCIAttempt` | Successful ordinary CI workflow, main push and exact attempt for that delivered head |
| `helperDeliveryRef` | Delivered native helper evidence |

The installed toolkit's `withRiceDeliveryLease` acquires and renews repository-wide exclusive ownership across machines and harnesses. It covers source, workflow and secret writers and checks its live keeper before provider calls. Private grant nonces stay in memory; strings in a binding file grant no custody. `scripts/private-source-host.json` pins the actual installed Rice helper, native `gh`, `bao-run`, GNU timeout and mise Node paths and SHA256 digests outside operation input. Ownership, modes and bytes are verified before use. Every executable and its resolved ancestors must belong to the owner or root without group or world write permissions. The profile selects the existing closed-root mise Node installation. Native `gh` and the operator are unchanged copies of the installed CLIs in private directories keyed by their hashes; original global tools stay untouched. A `gh` script wrapper is refused before credential preparation. Tool upgrades need a reviewed profile refresh. Scoped token and expiry variables are captured and removed before any child process. A caller-supplied executable or helper digest field is refused.

The binding and operation paths must be absolute. The launcher creates the private operation directory exclusively before opening logs or minting a token, preserving existing and symlinked paths. Run it through Bash:

```sh
bash scripts/private-source-qualification.sh /absolute/binding.json /absolute/owned-operation
```

Run the two source operations serially. The launcher holds a destination-wide local secret lock, verifies the helper digest, and starts one 15-minute contents-read session. The returned token must have at least 16 minutes of actual lifetime. The workflow has a 10-minute timeout and refuses an expiry with less than 11 minutes remaining. Native observation is bounded to 12 minutes, with a final status read before deciding the outcome.

The controller verifies the private repository, exact main head, critical local file bytes and modes against that immutable remote Git tree, workflow digest, exact ordinary CI identity and attempt, source pin, and absent `MODS_SOURCE_READ_TOKEN` baseline before changing destination state. It supplies the token only to native `gh secret set` through stdin, waits beyond the set timestamp second, dispatches once with explicit source/head/expiry inputs, and records only decoded nonsecret operation and runner metadata. Workflow jobs receive the token only for the required selected-source check. Extraction and validation run without credential variables.

Run metadata can be incomplete just after dispatch. The controller permits at most seven identity observations within ten seconds after a candidate appears, while still requiring every exact repository, run, head, branch, event, workflow, attempt and title predicate. It records the first mismatch and a bounded recent history using predicate names, presence, type, length and hashes. Arbitrary provider strings are not copied into those records. An unproven or foreign run is never cancelled.

The trusted source step emits a SHA256 comparison receipt for its received token, bound to the exact repository, head, workflow, source commit, run, job and attempt. The token value is never logged. Cleanup uses the attempt-specific native job endpoint, verifies run/head/job identity and reads bounded native job logs into memory. It requires exactly one matching receipt, then rechecks secret metadata under live repository custody. Missing, mismatched or ambiguous receipts preserve the secret and return nonzero. Neither the fingerprint nor metadata equality is presented as an atomic GitHub compare-and-delete operation.

## Recover an interrupted operation

The launcher first stops only its retained native PID and birth identity, then invokes cleanup-only recovery. Recovery never redispatches. It must obtain fresh native repository custody, discovers an interrupted dispatch from the retained baseline, stops only the exact owned workflow run and verifies its token receipt before removing an unchanged owned secret. A preexisting or replaced secret is preserved. An interrupted set without acknowledged ownership and a matching job receipt is not inferred from timestamps. The host helper independently revokes the source token. Busy or lost custody refuses provider cleanup and retains nonzero recovery evidence.

If automatic recovery is interrupted, retain the binding, operation records, and writer custody. Use the same delivered source and existing operator credential store:

```sh
/opt/mise/installs/node/24.18.0/bin/node scripts/private-source-controller.mjs recover /absolute/binding.json /absolute/owned-operation
```

Recovery failure stays nonzero and retains its failure phase and fingerprints. Do not repeat the dispatch or substitute an expired static secret. A successful controller run proves its exact selected-source workflow only; it does not imply model turns, native runtime qualification, packaging, signing, publishing, or unrelated acceptance.

## Recover a missing secret receipt without minting

If the original workflow ended before its source-check step, its token receipt does not exist. Keep that failed operation immutable. A separate receipt recovery uses the current delivered controller and the main-only `Private source receipt recovery` workflow. Its two steps validate context and hash the current secret. It has no token permissions, checkout, actions, runtime installation or source download. The secret reaches only native Bash and the hash command through stdin; no value is written to files, arguments or logs.

Create a fresh nonsecret recovery binding with these fields:

| Field | Required binding |
| --- | --- |
| `repository` | `moabualruz/rice-mods` |
| `sourceRepository`, `sourceCommit`, `sourceLimitsBlob` | The original exact source, still declared by the marketplace and private allowlist |
| `head` | Exact current delivered main |
| `workflowSHA256` | SHA256 of the current `.github/workflows/private-source-receipt.yml` |
| `requiredCIRunID`, `requiredCIAttempt` | Successful ordinary main-push CI for that current head |
| `originalBindingSHA256` | SHA256 of the original binding file |
| `originalOperationSHA256` | SHA256 of the frozen original `operation.json` |

The original binding and state must remain owned and private. Their source, secret acknowledgement, issuer fingerprint, terminal failed operation and exact original run are checked. Their original workflow bytes are verified against its immutable head. A current repository lease and local lock cover the new operation. The receipt binds both the original context and the current trusted workflow, head, run, attempt and source. Exactly one authentic successful job receipt must match the original token fingerprint. Secret metadata and both original file hashes are checked again before deletion. Missing, conflicting, changed or ambiguous evidence preserves the secret and returns nonzero; timestamp equality alone never grants ownership.

Use a new private recovery directory:

```sh
bash scripts/private-source-qualification.sh --receipt-recovery \
  /absolute/current-recovery-binding.json /absolute/new-recovery-operation \
  /absolute/original-binding.json /absolute/original-operation
```

This mode cannot invoke Bao or the issuer and never creates or replaces a token. It leaves the original failed operation unchanged. Its recovery result is not source qualification. Resume only the existing receipt run with the same binding and directory:

```sh
bash scripts/private-source-qualification.sh --resume-receipt \
  /absolute/current-recovery-binding.json /absolute/existing-recovery-operation
```

Resume obtains fresh custody, preserves prior logs and never dispatches another run. It can stop only the recorded native command PID and birth identity, then observe the already-owned receipt workflow. Any incomplete cleanup remains nonzero. A later source qualification is a new normal operation with its own current binding, issuer session and one dispatch.
