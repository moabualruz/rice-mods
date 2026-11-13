# Package templates: npm, OCI and Claude plugin

Vendorable scripts and skeletons for the three artifact classes that are not binaries or desktop and mobile
bundles: npm packages on a configured Nexus registry, OCI images on a configured registry, and Claude Code plugin packages (mods).
Rules: R-2 (vendored with a lock), R-3 (shell glue, no Python), R-5 and T12 (signing is an operator step, never CI), T8
(`@moabualruz/*`), no provenance, attestation or public log anywhere. Proven on `npm-stub`, `plugin-stub` and the `toyd`
fixture image (this repository), not on a Rice product.

## npm (`scripts/npm-package.sh`, skeleton `npm-skeleton/`)

```
npm-package.sh lint DIR                          # @moabualruz/NAME, not private, lockfile present, no provenance/credential/@rice/
npm-package.sh pack DIR OUT                      # tarball, npm sbom CycloneDX, NAME.pack.json (sha256, sha512 integrity, lockfile sha512)
OPERATOR_WRAPPER -- npm-package.sh publish DIR OUT [--tag TAG] [--nexus URL]   # idempotent operator publish and verified install
npm-package.sh verify DIR OUT                   # CI: anonymous readback, clean install and offline reinstall
OPERATOR_WRAPPER -- npm-package.sh sign OUT --bao-path KV_MOUNT/PATH/TO/PRODUCT/archive-signing --pubkey keys/PRODUCT/minisign.pub
npm-package.sh verify-signature OUT --pubkey keys/PRODUCT/minisign.pub     # offline, public key only
OPERATOR_WRAPPER -- npm-package.sh roundtrip DIR --admin-sops ADMIN_ENCRYPTED_FILE   # probe proof, see below
```

Nexus facts (release ticket 03): publish to `npm-hosted`, install and view through `npm-group`. The group is readable
anonymously; the `rice-publisher` identity comes from the configured OpenBao item at `RELEASE_NEXUS_BAO_PATH` (fields
`username` and `rice-publisher-password`) and can publish only within the hosted `@moabualruz` scope. It cannot read the
group or delete packages. Deletes use the Nexus admin identity from the encrypted file passed with `--admin-sops`,
decrypted in-process only. `roundtrip` publishes with `--tag probe`, reads and installs back through the group with the
integrity compared with the pack record, shows that the publisher cannot delete, deletes as admin, and proves that the
hosted repository and group list nothing afterwards. An EXIT trap deletes a leftover component after any failure. npm 12
needs `--tag` for a prerelease and prints `npm pack --json` keyed by package name; the script handles both shapes.

### Operator publication and credential-free runner verification

Publication follows the signing custody model: only a trusted operator environment can publish, never CI. Self-hosted
runner slots receive no publishing credential. Do not provision a runner credential or copy an operator access file into
a slot. CI builds unsigned artifacts and anonymously verifies an already-published immutable version. Set
`RELEASE_NEXUS_URL` and `RELEASE_NEXUS_BAO_PATH` in the operator environment, then run:

```sh
OPERATOR_WRAPPER -- \
  bash release-packages/scripts/npm-package.sh publish packages/api ./npm-evidence --tag latest

# After the operator command succeeds, verify locally or on a self-hosted runner without credentials:
bash release-packages/scripts/npm-package.sh verify packages/api ./npm-evidence
```

The operator wrapper obtains and revokes a temporary session using its configured login. The template reads publisher
data only from `RELEASE_NEXUS_BAO_PATH`; publishing needs no admin credential, encrypted delete file or delete privilege.
Other trusted environments provide `BAO_ADDR` and `BAO_TOKEN` through their established OpenBao operator wrapper. Use the
same package directory and immutable version for both commands; finish package generation first.
`publish` and signing refuse CI. `verify` never reads OpenBao or sends publisher auth, even if ambient credentials exist.

Both modes pack once, anonymously inspect npm-group, install into an empty consumer with a fresh cache, compare registry
and consumer lock integrity with the packed sha512, then run `npm ci --offline`. `publish` uploads that exact tarball only
when the version is absent. If the same version and integrity already exist, a repeat command skips publication and
credentials entirely and repeats verification. Different bytes at that version fail with `immutable-version-conflict`;
there is no overwrite, tag mutation or deletion. Missing versions in `verify` fail with `version-not-published`.

npm pack, SBOM, read and install run with isolated HOME/config/environment, disabled lifecycle scripts, no audits or
update notifier. Registry requests have no retry and bounded timeouts. The publishing credential exists only in process
memory and the publish child's environment, delivered via stdin, never argv. The npmrc contains a literal environment
reference, not the credential. OpenBao headers use curl stdin. Stable error codes never echo server response bytes.

Outputs: tarball, SBOM, pack record, clean consumer lock and `NAME-VERSION.publish.json` or `.verify.json`. Receipts bind
version, digests, registries and successful checks, and distinguish `publication: created` from `existing`. Default tag is
`latest`; prereleases require an explicit non-latest tag on both modes. `--nexus URL` selects a credential-free Nexus
origin for isolated tests. After partial publication, rerun the idempotent operator command to verify existing bytes rather
than republishing or deleting. Released versions are retained; `roundtrip` is the separate operator-only cleanup drill.

This repository's manual `npm-runner.yml` verifies the exact operator-published fixture version supplied at dispatch,
including local pack equality, anonymous readback, a clean install and offline reinstall, with no OpenBao prerequisite.

## OCI (`scripts/oci-image.sh`, `oci/Dockerfile`)

```
oci-image.sh build  --dist DIR --binary NAME --version V --repo HOST:PORT/PATH       # linux/amd64 + linux/arm64, from verified archives
oci-image.sh pull   --repo R --digest sha256:HEX --binary NAME                      # pull by digest and run once
oci-image.sh scan   --repo R --digest D --server "$RELEASE_TRIVY_SERVER" [--out FILE]
oci-image.sh sbom   --repo R --digest D --out FILE                                  # Syft image SBOM, apart from the build
OPERATOR_WRAPPER -- oci-image.sh sign --repo R --digest D --bao-path KV_MOUNT/PATH/TO/PRODUCT/image-signing --pubkey keys/PRODUCT/cosign.pub
oci-image.sh verify --repo R --digest D --pubkey keys/PRODUCT/cosign.pub            # cosign, --insecure-ignore-tlog=true, offline
oci-image.sh cleanup --repo R [--volume NAME]                                       # probe repositories only
```

The image is `FROM scratch` plus the already built and verified Go binary, so a two-platform build needs no emulation
and no compile step; `--provenance=false --sbom=false` keep BuildKit attestations out of the index (the SBOM is Syft's).
`--repo` and `RELEASE_TRIVY_SERVER` are explicit pipeline inputs; no registry or scan endpoint is built in.
`RELEASE_OCI_REFUSED_PORTS` optionally lists registry ports this pipeline must not use, separated by spaces or commas.
Loopback plain-HTTP references need no registry configuration; cosign uses `--allow-http-registry` for non-loopback
references. Cosign 3 key mode needs `--tlog-upload=false --use-signing-config=false --new-bundle-format=false` for a
plain signature stored as the `sha256-DIGEST.sig` tag. `cleanup` tries the registry API first; when deletion is unsupported,
it removes only the probe repository directory from the configured registry volume with a throwaway container. Blobs remain
until garbage collection. Enabling `REGISTRY_STORAGE_DELETE_ENABLED` is an owner infrastructure change, not made here. The
fixture scan reported the Go standard library 1.27.1 linked into the binary (13 findings, 3 high); products pin a newer
toolchain in `release.env`.

OCI signing reads the existing OpenBao key with native curl and checks its HTTP status before parsing. Product items use `key` and `password`; the historical probe also accepts `cosign-key` and `cosign-password`. The response, key and password stay in shell memory. The Vault token travels through curl stdin and is removed from child environments; only the signing child receives `COSIGN_PRIVATE_KEY` and `COSIGN_PASSWORD`, using `--key env://COSIGN_PRIVATE_KEY`. No response, private key or native signing output is written to a temporary file. Native failures emit a phase and exit/status code without raw credential-bearing output. The existing curl20-second limit and no-automatic-retry behavior are preserved, and CI refuses before any custody read. Run `verify` separately with the configured public key as part of artifact qualification.

## Claude plugin (`scripts/plugin.sh`, skeleton `plugin-skeleton/`)

```
plugin.sh check DIR                  # layout, reserved names, claude plugin validate
plugin.sh baseline DIR OUT.json      # capability baseline: hooked events, $ calls, env reads and writes, gating hooks and .catch
plugin.sh diff DIR BASELINE.json     # fails when any of those changes (the reviewable diff on every release)
plugin.sh sbom DIR OUT.json          # CycloneDX naming the plugin as the main module
plugin.sh zip DIR OUT.zip            # deterministic zip: PRODUCT_VERSION_any_all.zip is the asset name the verifier knows
```

Required layout: `.claude-plugin/plugin.json` (name, stable version, description, license) and `hooks/hooks.json` with
`"modules": ["./register.ts"]`. Optional `LIMITS.md`, `skills/NAME/SKILL.md`, and `.mcp.json` metadata are validated when present;
MCP server paths must use `${CLAUDE_PLUGIN_ROOT}`. Names may not start with `claude-`, `anthropic-` or `cc-plugin-`. No marketplace
publication: the zip, its SBOM, `checksums.txt` and the minisign signature are assets of a private release (`rice-release verify
artifacts` accepts the directory). The `claude` CLI version is recorded in the baseline; mod behavior qualification stays with the
mods track (research 61).

## Evidence and inventory

Each class has an evidence record (`PKG-npm-hosted`, `PKG-oci-ci-registry`, `PKG-plugin-zip`) and an `inventory-row/v1`
sample in `evidence/release-14/`, pinned by a stable version and the SHA-256 of the tarball, image index digest or zip.
Registry credentials come only from configured OpenBao references; the cleanup probe reads an encrypted admin file passed with `--admin-sops`. No credential value is stored in the template.

## Vendoring (rule R-2)

```yaml
directories:
  - path: release-packages
    contents:
      - path: .
        git:
          url: git@github.com:moabualruz/rice-release.git
          ref: templates-v0.3.1
        includePaths:
          - templates/packages/**/*
        newRootPath: templates/packages
```

then, from the product root:

```sh
export RELEASE_TAG_SOURCE=/path/to/rice-release   # existing trusted rice-release checkout
export RELEASE_DIR=release-packages RELEASE_LOCK=release-packages.lock
git -C "$RELEASE_TAG_SOURCE" fetch --tags origin
vendir sync
bash release-packages/scripts/vendor-lock.sh write
bash release-packages/scripts/vendor-lock.sh check
bash release-packages/scripts/vendor-lock.sh check --published
```

`write` refuses unless the exact tag selected in `vendir.lock.yml` exists in `RELEASE_TAG_SOURCE` and on its
`origin`, both at the vendored commit. Plain `check` is the offline drift check (byte and metadata coherence
only); `check --published` repeats the origin tag proof. Never edit the copy.

## Pinned tools

| Tool | Version | License |
| --- | --- | --- |
| npm | 12.0.2 (proof) | Artistic-2.0 |
| cosign | v3.1.3 | Apache-2.0 |
| minisign | 0.12 | ISC |
| Syft | 1.54.1 | Apache-2.0 |
| Trivy (container, client/server) | 0.55.0 | Apache-2.0 |
| Docker Buildx | the host's | Apache-2.0 |
| Claude Code (validate) | 2.1.316 | proprietary CLI, free to run |
