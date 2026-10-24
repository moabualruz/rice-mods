ci:
    claude plugin validate --strict .claude-plugin/marketplace.json
    node --test scripts/marketplace-validation.test.mjs scripts/marketplace-validation-mutation.test.mjs
    node scripts/validate-marketplace.mjs
