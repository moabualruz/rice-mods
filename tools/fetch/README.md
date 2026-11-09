# fetch template

`fetch-asset.sh` is the family's single download path for pinned release assets. Every tool installer
(vendir, GoReleaser, Syft, cyclonedx-gomod, cosign, minisign, Maestro and the like) calls it instead of
its own `curl`, so retry, mirror and checksum rules live in one place.

```
fetch-asset.sh [--attempts N] [--base-delay S] [--max-delay S] [--max-time S] URL SHA256 DEST
```

- Writes DEST only when the content's SHA-256 equals the pin; the move is atomic.
- Retries an HTTP 5xx, 408, 425 or 429, or a transport error, up to 5 attempts per source with
  exponential backoff (2, 4, 8, 16 seconds, capped at 30) and honors a numeric `Retry-After` up to the
  cap. Any other status fails at once.
- `RICE_ASSET_MIRROR` names a raw proxy of `https://github.com/` (override the prefix with
  `RICE_ASSET_MIRROR_ORIGIN`). The mirror gets 2 attempts first; on failure or a checksum mismatch the
  origin is used. A checksum mismatch from the origin fails closed with exit 4.
- Exit codes: 0 written, 1 download failed, 2 usage, 3 curl missing, 4 origin checksum mismatch.

## Vendoring

Products vendor this directory at `tools/fetch` with vendir and a pinned `templates-v*` tag:

```yaml
  - path: tools/fetch
    contents:
      - path: .
        git:
          url: git@github.com:moabualruz/rice-release.git
          ref: templates-vX.Y.Z
        includePaths:
          - templates/fetch/**/*
        newRootPath: templates/fetch
```

The vendored installers (`scripts/install-vendir.sh`, `release/scripts/install-tools.sh`,
`release-mobile/scripts/install-mobile-tools.sh`) find it at `tools/fetch/fetch-asset.sh` from the
repository root, or at the path in `RICE_FETCH_ASSET`.

## Mirror on self-hosted runners

Point `RICE_ASSET_MIRROR` at a caching raw proxy repository of `https://github.com` that the runner can
reach (the operator supplies the URL through runner or workflow configuration, never a committed
default). Leave it unset where the proxy is unreachable, such as GitHub-hosted runners; those use the
origin with the same retries.
