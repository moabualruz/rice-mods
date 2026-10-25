# Clean-directory collaborator install check

Executed 2026-10-25 against an accessible private product marketplace using the owner's existing GitHub CLI credential. The run used a fresh directory and an empty `CLAUDE_CONFIG_DIR`; the normal `HOME` remained available to the installed `gh` authentication. A process-scoped Git config selected `gh auth git-credential` as the helper. No token was created, displayed, written to a file, or placed in argv. The private repository identity and local directory are intentionally omitted from this public record.

```sh
CLEAN_ROOT=/path/to/fresh-directory
mkdir -p "$CLEAN_ROOT/claude-config"
CLAUDE_CONFIG_DIR="$CLEAN_ROOT/claude-config" \
GIT_TERMINAL_PROMPT=0 \
GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=credential.helper \
GIT_CONFIG_VALUE_0='!gh auth git-credential' \
claude plugin marketplace add OWNER/PRIVATE-REPOSITORY
# exit 0
CLAUDE_CONFIG_DIR="$CLEAN_ROOT/claude-config" claude plugin marketplace list
# exit 0; the private marketplace was listed
```

The actual marketplace-add and marketplace-list commands both exited 0 in the clean directory. This demonstrates access with the owner's existing credential and an isolated Claude plugin configuration; it does not claim a separate collaborator identity was tested. The public marketplace is not used as evidence for private-repository access.
