# fetch template

`fetch-asset.sh` is the family's single download path for pinned release assets. Every tool installer
(vendir, GoReleaser, Syft, cyclonedx-gomod, cosign, minisign, Maestro and the like) calls it instead of
its own `curl`, so retry, mirror and checksum rules live in one place.

```
fetch-asset.sh [--attempts N] [--base-delay S] [--max-delay S] [--max-time S] URL SHA256 DEST
```

- Writes DEST only when the content's SHA-256 equals the pin; the move is atomic.
- Retries only transient failures, up to 5 attempts per source with exponential backoff (2, 4, 8, 16
  seconds, capped at 30), honoring a numeric `Retry-After` up to the cap: HTTP 5xx, 408, 425 and 429, and
  the curl transport errors 7 (connect), 18 (partial transfer), 28 (timeout), 52 (empty reply), 55 and 56
  (send and receive) and 92 (HTTP/2 stream). Anything else, such as a certificate failure, an unresolvable
  host or another HTTP status, fails at once.
- `RICE_ASSET_MIRROR` names a raw proxy of `https://github.com/` (override the prefix with
  `RICE_ASSET_MIRROR_ORIGIN`). The mirror gets 2 attempts first. The origin is used only when the mirror
  is unavailable: its transient failures are exhausted or it answers 404 (not cached). A checksum
  mismatch from the mirror fails closed with exit 4 and any other mirror failure with exit 1, without
  contacting the origin: a poisoned or stale mirror is surfaced, and operators unset `RICE_ASSET_MIRROR`
  to bypass it. A checksum mismatch from the origin fails closed with exit 4.
- Exit codes: 0 written, 1 download failed, 2 usage, 3 curl missing, 4 checksum mismatch (mirror or
  origin).

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
