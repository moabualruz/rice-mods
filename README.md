# rice-mods

A marketplace for two Claude Code mods. Choose the one that matches what you
want to change, or install both.

| Your goal | Mod | What changes |
| --- | --- | --- |
| Use several Anthropic OAuth accounts | [Rice Accounts (`rice-session-accounts`)](https://github.com/moabualruz/rice-session-accounts#readme) | Choose an account by name, email and tier for the current session. Other sessions and the machine's configuration keep their settings. |
| Use models from other providers or model subscriptions | [Rice MultiModels (`rice-multi-models`)](https://github.com/moabualruz/rice-multi-models#readme) | Use supported provider models in Claude Code's main session or subagents, with direct provider calls and no inference proxy. |

Rice Accounts manages Anthropic OAuth sign-ins and setup tokens. API keys,
provider endpoints, cloud providers and other model subscriptions belong in
Rice MultiModels.

## Before installing

Use macOS or Linux, including WSL, with Node.js 22 or newer. Run installation
commands in the environment where Claude Code runs; use a WSL terminal for WSL.
You do not need to build either plugin or install its development dependencies.

**Rice MultiModels 0.7.0's full native adapter supports the official Claude Code
2.1.299 executable. Claude Code 2.1.300 is not qualified for that adapter.** Its
`rice-claude` launcher checks the host version. Check the
[MultiModels requirements](https://github.com/moabualruz/rice-multi-models#requirements-and-platform-scope)
before setting up provider inference. Rice Accounts has its own compatibility
requirements in its [README](https://github.com/moabualruz/rice-session-accounts#readme).

## Install

Run the command for the mod you want, or run both commands:

```bash
claude plugin install rice-session-accounts --marketplace moabualruz/rice-mods
claude plugin install rice-multi-models --marketplace moabualruz/rice-mods
```

Each command adds the marketplace if needed and installs that plugin. Restart
Claude Code after installation. `claude plugin list` shows installed plugins.

Alternatively, add the marketplace once and install by its short name:

```bash
claude plugin marketplace add moabualruz/rice-mods
claude plugin install rice-session-accounts@rice-mods
claude plugin install rice-multi-models@rice-mods
```

## Use Rice Accounts

Start Claude Code, then add an extra Anthropic account:

```text
/rice-account add personal-live
```

The command saves the account name and prints **one terminal setup command**.
Copy that generated command into a terminal and complete Claude's browser or
terminal sign-in. The helper checks whether the account is already ready and
resumes unfinished setup. Use `/rice-account setup personal-live` to show the
command again.

Return to Claude Code and open the account list:

```text
/rice-account
```

Choose a row showing the account's name, email and tier. Arrow keys and Enter
select an account; Escape closes the list. The selected account applies to this
session and the subagents or child Claude processes it starts afterward.

These commands also work directly:

| Command | Result |
| --- | --- |
| `/rice-account check personal-live` | Check that saved account's credential. |
| `/rice-account personal-live` | Switch this session to that account. |
| `/rice-account login` | Return this session to its original machine login. |
| `/rice-account add work-live` | Save another extra account and show its setup command. |

Each extra login has its own credential directory. Switching accounts keeps the
machine's normal settings, models, skills, plugins, MCP configuration and
permissions. Other running sessions keep their accounts. New independent
sessions start on the machine's normal login.

See the [Rice Accounts guide](https://github.com/moabualruz/rice-session-accounts#readme)
for setup tokens, storage details and troubleshooting.

## Use Rice MultiModels

Use the supported Claude Code version listed above. In an ordinary Claude Code
session, check setup and follow the instructions for your chosen provider:

```text
/rice-models setup
```

Existing provider logins are reused. For Codex with a ChatGPT subscription, run
`codex login` in a terminal if a login is needed. If Codex is missing,
`/rice-models setup codex` installs its scoped CLI and prints the exact login
command. API endpoints, local models, OpenCode and other providers have their
own [setup instructions](https://github.com/moabualruz/rice-multi-models#provider-specific-setup).

Install the native launcher from that Claude session:

```text
/rice-models setup native
```

Then start a new session from your terminal:

```bash
rice-claude
```

For a declared provider, run `/rice-models providers` in that new session, then
approve its actual provider name with `/rice-models approve <provider>`. Complete
this before discovery so the provider can supply its model list.

Refresh setup and list the available models:

```text
/rice-models setup
/rice-models models
```

Copy an actual model ID from the returned list and select it with
`/model <model-id>`, replacing the placeholder. `/rice-models doctor` reports
whether the native adapter is active;
`/rice-models status` shows session state. Continue starting native provider
sessions with `rice-claude`.

See the [Rice MultiModels guide](https://github.com/moabualruz/rice-multi-models#readme)
for provider configuration, subagents and supported native behavior. If you use
both mods, `/rice-account` chooses the Anthropic OAuth account and `/model`
chooses the model; the chosen provider still needs its own authentication.

## Update and recover

Refresh the marketplace, then update each plugin you installed:

```bash
claude plugin marketplace update rice-mods
claude plugin update rice-session-accounts@rice-mods
claude plugin update rice-multi-models@rice-mods
```

Restart Claude Code to load the updated plugins. Use `rice-claude` when you need
the native provider adapter.

- **An account is saved but setup is unfinished:** run `/rice-account setup <name>`
  and rerun its generated terminal command. Keep the existing account entry.
- **An older WSL install tries `/usr/bin/security`:** update Rice Accounts,
  restart Claude Code and resume that saved account's setup command.
- **Provider models are missing or unavailable:** run `/rice-models doctor`,
  then `/rice-models setup` and follow its runtime, login or approval instructions.
- **`rice-claude` is missing from PATH:** use `"$HOME/.local/bin/rice-claude"`, the
  launcher's installed location, or follow the path printed by native setup.
- **The native host version is refused:** use the version supported by the
  installed MultiModels release, as listed in its README.

Each mod lives in its own repository with its own README, tests and third-party
notices.

## License

MIT, see `LICENSE`. Each mod carries its own license and third-party notices.
