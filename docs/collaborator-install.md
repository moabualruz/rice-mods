# Clean-directory collaborator install check

Executed 2026-10-25 against the public marketplace. `CLEAN_ROOT` was a fresh scratch directory with separate empty `home` and `claude-config` directories. No credentials were placed in a URL, argv, or file.

```sh
CLEAN_ROOT=/path/to/empty-clean-root
mkdir -p "$CLEAN_ROOT/home" "$CLEAN_ROOT/claude-config"
HOME="$CLEAN_ROOT/home" CLAUDE_CONFIG_DIR="$CLEAN_ROOT/claude-config" GIT_TERMINAL_PROMPT=0 claude plugin marketplace add https://github.com/moabualruz/rice-mods.git
# exit 0
HOME="$CLEAN_ROOT/home" CLAUDE_CONFIG_DIR="$CLEAN_ROOT/claude-config" claude plugin marketplace list
# exit 0; rice-mods present
HOME="$CLEAN_ROOT/home" CLAUDE_CONFIG_DIR="$CLEAN_ROOT/claude-config" claude plugin install rice-session-accounts@rice-mods
# exit 0
HOME="$CLEAN_ROOT/home" CLAUDE_CONFIG_DIR="$CLEAN_ROOT/claude-config" claude plugin list
# exit 0; rice-session-accounts present
```

The installed plugin and marketplace were confirmed in the CLI listings. The Git credential-helper lookup for GitHub returned exit 128 and no credential, so the successful install used the public repository path and does not prove authentication as a collaborator. No credential was printed or stored. Row 16 remains open until the same clean-directory sequence succeeds using a collaborator's own Git credential.
