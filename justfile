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
