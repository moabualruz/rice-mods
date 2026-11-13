# Private source qualification

The ordinary CI workflow validates public metadata and local tests without receiving private source credentials. The manual `Private source qualification` workflow checks one exact private marketplace source. Both source rows are required to qualify the marketplace consumer.

The supported controller runs on the trusted Linux host with Bash, native `gh`, `jq`, GNU `timeout`, `flock`, and Node 24.18.0 from mise. It uses the installed Rice `github with-contents-read` command and the existing configured GitHub operator credential store. The source token reads exactly one repository; the independent operator identity manages only the explicitly bound destination operation.

## Bind the operation

The integration owner supplies a nonsecret binding containing:

| Field | Required binding |
| --- | --- |
| `repository` | `moabualruz/rice-mods` |
| `sourceRepository` | One repository declared in `scripts/private-repositories.json` and the marketplace lock |
| `sourceCommit`, `sourceLimitsBlob` | Exact values from that source's marketplace lock row |
| `head` | Exact delivered `main` commit |
| `workflowSHA256` | SHA256 of the delivered `.github/workflows/private-source-qualification.yml` |
| `requiredCIRunID` | Successful ordinary CI run for that exact delivered head |
| `workflowWriterLeaseRef`, `sourceWriterLeaseRef`, `secretWriterLeaseRef` | Current native custody references held for the entire operation and recovery |
| `helperDeliveryRef` | Delivered native helper evidence |
| `helperBinary`, `helperSHA256` | Actual installed host helper path and SHA256 |
| `operatorScript`, `hostRoot`, `appID` | Existing operator wrapper, trusted host working directory, and Rice App identity |

These references bind existing authority. Creating a binding file or taking the local lock does not grant writer custody. The operation directory must be fresh, private, and owned by the operator. Run the launcher through Bash:

```sh
bash scripts/private-source-qualification.sh /absolute/binding.json /absolute/owned-operation
```

Run the two source operations serially. The launcher holds a destination-wide local secret lock, verifies the helper digest, and starts one 15-minute contents-read session. The returned token must have at least 16 minutes of actual lifetime. The workflow has a 10-minute timeout and refuses an expiry with less than 11 minutes remaining. Native observation is bounded to 12 minutes, with a final status read before deciding the outcome.

The controller verifies the private repository, exact main head, workflow digest, successful CI, source pin, and absent `MODS_SOURCE_READ_TOKEN` baseline before changing destination state. It supplies the token only to native `gh secret set` through stdin, dispatches once with explicit source/head/expiry inputs, and records only decoded nonsecret operation and runner metadata. Workflow jobs receive the token only for the required selected-source check. Extraction and validation run without credential variables.

## Recover an interrupted operation

The launcher first stops only its retained native PID and birth identity, then invokes cleanup-only recovery. Recovery never redispatches. It discovers an interrupted dispatch from the retained baseline, stops only the exact owned workflow run, and removes only the secret whose metadata still matches the owned set. A preexisting or replaced secret is preserved. The host helper independently revokes the source token.

If automatic recovery is interrupted, retain the binding, operation records, and writer custody. Use the same delivered source and existing operator credential store:

```sh
mise exec node@24.18.0 -- node scripts/private-source-controller.mjs recover /absolute/binding.json /absolute/owned-operation
```

Recovery failure stays nonzero and retains its failure phase and fingerprints. Do not repeat the dispatch or substitute an expired static secret. A successful controller run proves its exact selected-source workflow only; it does not imply model turns, native runtime qualification, packaging, signing, publishing, or unrelated acceptance.
