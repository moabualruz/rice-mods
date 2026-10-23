# rice-mods

A marketplace for two Claude Code mods. Choose the one that matches what you
want to change, or install both.

Use the ordinary, unmodified `claude` command. These mods work through Claude
Code's plugin hooks only: no launcher, replacement executable, MCP server,
inference proxy or gateway.

| Mod | What it does |
| --- | --- |
| [Rice Accounts](https://github.com/moabualruz/rice-session-accounts#readme) 0.6.0 | Switch this session between saved Anthropic OAuth accounts, picked by email and tier; `/usage` and `/status` report the selection; agents and child processes inherit it, and commands run exactly as typed. |
| [Rice MultiModels](https://github.com/moabualruz/rice-multi-models#readme) 0.15.0 | Codex (ChatGPT subscription), OpenCode, any Chat Completions, Responses, Anthropic, Gemini or Bedrock endpoint, and local servers as session and subagent models. Each conversation stays on its own provider for subagents, skills, compaction, titles, permission judgments, web search and fetch. |

Rice Accounts manages Anthropic OAuth sign-ins and setup tokens. API keys,
provider endpoints, cloud providers and other model subscriptions belong in
Rice MultiModels. Provider requests are direct calls.

## Before installing

Use macOS, Linux (including WSL), or native Windows, with Node.js 22 or newer.
Both mods are checked with Claude Code 2.1.301 and 2.1.302. Keep Claude updated
with its normal updater.
Run installation commands in the environment where ordinary Claude Code runs;
use a WSL terminal for WSL. You do not need to build either plugin or install
its development dependencies. Keep your normal Claude executable and updater.

## Install

Run the command for the mod you want, or run both commands:

```bash
claude plugin install rice-session-accounts --marketplace moabualruz/rice-mods
claude plugin install rice-multi-models --marketplace moabualruz/rice-mods
```

Each command adds the marketplace if needed and installs that plugin. Restart
ordinary Claude Code after installation. `claude plugin list` shows installed
plugins. Check the installed version before using a newly published feature.

Alternatively, add the marketplace once and install by its short name:

```bash
claude plugin marketplace add moabualruz/rice-mods
claude plugin install rice-session-accounts@rice-mods
claude plugin install rice-multi-models@rice-mods
```

## Use Rice Accounts

In ordinary Claude Code, save an extra Anthropic account:

```text
/rice-account add personal-live
```

The command saves the account name and prints **one terminal setup command**.
Copy that generated command into a terminal on the same machine and complete
Claude's browser or terminal sign-in. If a different browser holds the account
you want, append `--manual --email you@example.com` to that command. Open its URL
in that browser, authorize, and paste the returned code into the terminal. The
helper verifies the account email. It checks whether the account is
already ready and resumes unfinished setup. Use `/rice-account setup personal-live`
to show the command again.

Return to Claude Code to check the saved credential and inspect its cached
identity:

```text
/rice-account check personal-live
/rice-account
```

The picker displays saved names, emails and tiers. In Accounts 0.6.0, select a
row or enter `/rice-account personal-live` to switch this session from its next
request. `/usage` shows that account's usage; interactive `/status` shows its
email and tier. Escape closes the picker. If an older installation refuses named
switches, update it to 0.6.0:

```bash
claude plugin update rice-session-accounts@rice-mods
```

Start a new ordinary Claude session after updating. Each new independent session
uses the normal machine login until you select an account in that session.

| Command | Result |
| --- | --- |
| `/rice-account check personal-live` | Check that saved account's credential. |
| `/rice-account list` | Show saved names and cached email/tier metadata as text. |
| `/rice-account personal-live` | Use that saved OAuth account for this session's next request and its descendants. |
| `/usage` | After selection, show the selected account's current usage. |
| `/rice-account login` | Restore this process's starting credential environment, including recovery in an existing session. |
| `/rice-account add work-live` | Save another extra account and show its setup command. |

Each extra login has its own credential directory. Setup preserves the machine's
normal settings, models, skills, plugins, MCP configuration, permissions and login.
Independent ordinary Claude sessions keep that machine login. See the
[Rice Accounts guide](https://github.com/moabualruz/rice-session-accounts#readme)
for setup tokens, storage details and native-panel reporting limits.

## Use Rice MultiModels

In ordinary Claude Code, check setup and follow the instructions for your chosen
provider:

```text
/rice-models setup
```

Existing provider logins are reused. For Codex with a ChatGPT subscription, run
`codex login` in a terminal if needed. If Codex is missing,
`/rice-models setup codex` installs its scoped CLI and prints the exact login
command. API endpoints, local models, OpenCode and other providers have their
own [setup instructions](https://github.com/moabualruz/rice-multi-models#provider-setup).

For a declared provider, run `/rice-models providers`, then approve its actual
name with `/rice-models approve <provider>`. Refresh and list the catalogue:

```text
/rice-models setup
/rice-models models
```

Select a model with `/model <model-id>` using an id from `/rice-models models`.
Built-in agents use the session's provider. Set `model: provider/model` in a
custom agent's frontmatter to route it to an exact model. Agent definitions stay
native to Claude Code; `/model` selects the main session's model.
`/rice-models doctor` and `/rice-models status` show the current state.

See the [Rice MultiModels guide](https://github.com/moabualruz/rice-multi-models#readme)
for families and tiers, provider configuration and known limits.

### Configure web search

```text
/rice-models search setup
/rice-models search
```

WebSearch in a routed session tries the selected provider's own search first,
then your saved services by priority (SearXNG, Brave, Tavily), then Claude's
native search with the session's account. Give a self-hosted or free service a
lower priority number than cloud services. Keep keys in the environment or a
credential helper; never paste them into the session. See the
[search guide](https://github.com/moabualruz/rice-multi-models#web-search).

## Update and recover

Refresh the marketplace, then update each plugin you installed:

```bash
claude plugin marketplace update rice-mods
claude plugin update rice-session-accounts@rice-mods
claude plugin update rice-multi-models@rice-mods
```

Restart ordinary Claude, or run `/reload-plugins` in a running session, to load
the updated hooks. Never open the same session UUID concurrently in two processes.

- **An account is saved but setup is unfinished:** run `/rice-account setup <name>`
  and rerun its generated terminal command. Keep the existing account entry.
- **An older WSL install tries `/usr/bin/security`:** update Rice Accounts,
  restart ordinary Claude and resume the saved account's setup command.
- **A named account switch is refused:** update Rice Accounts to 0.4.0 or newer
  and start a new session.
- **Provider models are missing or unavailable:** run `/rice-models doctor`,
  then `/rice-models setup` and follow Node, login or provider-approval guidance.

Each mod has its own repository, README, tests and third-party notices.

## License

MIT, see `LICENSE`. Each mod carries its own license and third-party notices.
