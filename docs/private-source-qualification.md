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

The trusted source step emits a SHA256 comparison receipt for its received token, bound to the exact repository, head, workflow, source commit, run, job and attempt. The token value is never logged. Cleanup uses the attempt-specific native job endpoint, verifies run/head/job identity and reads bounded native job logs into memory. It requires exactly one matching receipt, then rechecks secret metadata under live repository custody. Missing, mismatched or ambiguous receipts preserve the secret and return nonzero. Neither the fingerprint nor metadata equality is presented as an atomic GitHub compare-and-delete operation.

## Recover an interrupted operation

The launcher first stops only its retained native PID and birth identity, then invokes cleanup-only recovery. Recovery never redispatches. It must obtain fresh native repository custody, discovers an interrupted dispatch from the retained baseline, stops only the exact owned workflow run and verifies its token receipt before removing an unchanged owned secret. A preexisting or replaced secret is preserved. An interrupted set without acknowledged ownership and a matching job receipt is not inferred from timestamps. The host helper independently revokes the source token. Busy or lost custody refuses provider cleanup and retains nonzero recovery evidence.

If automatic recovery is interrupted, retain the binding, operation records, and writer custody. Use the same delivered source and existing operator credential store:

```sh
mise exec node@24.18.0 -- node scripts/private-source-controller.mjs recover /absolute/binding.json /absolute/owned-operation
```

Recovery failure stays nonzero and retains its failure phase and fingerprints. Do not repeat the dispatch or substitute an expired static secret. A successful controller run proves its exact selected-source workflow only; it does not imply model turns, native runtime qualification, packaging, signing, publishing, or unrelated acceptance.
