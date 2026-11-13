release-sync:
    vendir sync
    : "${RELEASE_TAG_SOURCE:?set RELEASE_TAG_SOURCE to the existing rice-release checkout}"
    RELEASE_DIR=release-packages RELEASE_LOCK=release-packages.lock bash release-packages/scripts/vendor-lock.sh write

release-check:
    RELEASE_DIR=release-packages RELEASE_LOCK=release-packages.lock bash release-packages/scripts/vendor-lock.sh check

ci:
    just release-check
    claude plugin validate --strict .claude-plugin/marketplace.json
    node --test scripts/*.test.mjs
    node scripts/validate-marketplace.mjs
    bash scripts/plugin-source-check.sh

marketplace-lock-generate:
    node scripts/marketplace-lock.mjs generate

marketplace-lock-verify:
    node scripts/marketplace-lock.mjs verify

marketplace-lock-verify-online:
    node scripts/marketplace-lock.mjs verify-online

# Local gate: live release check against the private release repos. Needs a developer token
# that can read them (for example GITHUB_TOKEN="$(gh auth token)"); never skips.
validate-live:
    LIVE_RELEASE_CHECK=required node scripts/validate-marketplace.mjs
