# rice-mods

A marketplace for two Claude Code mods. Choose the one that matches what you
want to change, or install both.

**Current status:** published Accounts **0.3.0** and MultiModels **0.8.0** do not
meet the full requirement inside ordinary, unmodified `claude`. Their complete
native behavior depended on a startup preload integration that is no longer an
accepted installation mechanism. The previous launcher-based installation path
is withdrawn. There is currently no recommended command that restores full
coverage through the exposed plugin API. Do not recreate the historical launchers.

| Mod | Available through ordinary Claude | Current limitation |
| --- | --- | --- |
| [Rice Accounts](https://github.com/moabualruz/rice-session-accounts#readme) | Account setup, email/tier picker, saved-account checks and credential storage | The current guard refuses named account switches without the rejected native bridge. Complete per-session identity and usage switching remain unresolved. |
| [Rice MultiModels](https://github.com/moabualruz/rice-multi-models#readme) | Provider setup, fresh discovery, approvals, search configuration and main/subagent turn routing through exposed hooks | Native compaction, internal inference, automatic evaluators and full native search do not have complete selected-provider coverage. |

The complete plugin-only behavior remains the requirement; these available
parts are not a replacement acceptance scope. See the
[plugin API findings](https://github.com/moabualruz/rice-multi-models/blob/main/docs/research/plugin-only-activation-20261016.md).

Rice Accounts manages Anthropic OAuth sign-ins and setup tokens. API keys,
provider endpoints, cloud providers and other model subscriptions belong in
Rice MultiModels. Provider requests use direct calls, without an inference proxy.

## Before installing

Use macOS, Linux (including WSL), or native Windows, with Node.js 22 or newer.
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
plugins. Installing these published versions does not resolve the native
coverage limitations above.

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
Claude's browser or terminal sign-in. The helper checks whether the account is
already ready and resumes unfinished setup. Use `/rice-account setup personal-live`
to show the command again.

Return to Claude Code to check the saved credential and inspect its cached
identity:

```text
/rice-account check personal-live
/rice-account
```

The picker displays saved names, emails and tiers. Escape closes it. Selecting a
named account currently returns a native-bridge refusal in ordinary Claude;
setup, a successful check and a picker entry do not mean the session switched.
There is no current compliant activation command for that missing behavior.

| Command | Result |
| --- | --- |
| `/rice-account check personal-live` | Check that saved account's credential. |
| `/rice-account list` | Show saved names and cached email/tier metadata as text. |
| `/rice-account login` | Restore this process's starting credential environment, including recovery in an existing session. |
| `/rice-account add work-live` | Save another extra account and show its setup command. |

Each extra login has its own credential directory. Setup preserves the machine's
normal settings, models, skills, plugins, MCP configuration, permissions and login.
Independent ordinary Claude sessions keep that machine login. See the
[Rice Accounts guide](https://github.com/moabualruz/rice-session-accounts#readme)
for setup tokens, storage details and current switching limitations.

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
own [setup instructions](https://github.com/moabualruz/rice-multi-models#provider-specific-setup).

For a declared provider, run `/rice-models providers`, then approve its actual
name with `/rice-models approve <provider>`. Refresh and list the catalogue:

```text
/rice-models setup
/rice-models models
```

Select an actual returned model ID with `/model <model-id>`. Use
`/rice-models doctor` and `/rice-models status` to inspect current state. An
inactive native adapter is expected in ordinary Claude under the current
limitation. A successful main or subagent turn confirms that routed path only;
it does not establish native compaction, evaluator, internal-tool or full search
coverage. Ignore historical activation instructions in published command output.

Continue using ordinary `claude` for later sessions. There is no replacement
startup command or account-selection startup flag to use. See the
[Rice MultiModels guide](https://github.com/moabualruz/rice-multi-models#readme)
for provider configuration and the explicit capability table.

### Configure web search

Search endpoint configuration remains available:

```text
/rice-models search setup
/rice-models search
```

The dialog supports SearXNG, Brave and Tavily. Give a self-hosted or free service
a lower priority number than cloud fallbacks. Supply endpoint URLs and credential
references, with key values kept in the environment or a credential helper.
Saved edits apply on the next retrieval through the configured helper.

The full native search chain in published 0.8.0 tried the selected provider,
then saved services, then native Claude search. Its Anthropic fallback was
specific to dedicated WebSearch, not ordinary inference or compaction. That
complete integration depended on the rejected adapter. A working saved service
does not prove that native WebSearch in ordinary Claude will use it or bypass a
Claude quota refusal. The [MultiModels search guide](https://github.com/moabualruz/rice-multi-models#web-search)
retains the configuration commands and provider-specific reference material.

## Update and recover

Refresh the marketplace, then update each plugin you installed:

```bash
claude plugin marketplace update rice-mods
claude plugin update rice-session-accounts@rice-mods
claude plugin update rice-multi-models@rice-mods
```

Restart ordinary Claude to load updated function hooks. `/reload-plugins` can
reload function hooks in a running session; it cannot add the missing native
integration. Published release archives remain historical. This documentation
correction is not a new runtime release or a claim that the full requirement is
fixed. Never open the same session UUID concurrently in two processes.

- **An account is saved but setup is unfinished:** run `/rice-account setup <name>`
  and rerun its generated terminal command. Keep the existing account entry.
- **An older WSL install tries `/usr/bin/security`:** update Rice Accounts,
  restart ordinary Claude and resume the saved account's setup command.
- **A named account switch is refused:** the required bridge is unavailable in
  ordinary Claude. Do not follow the historical launcher setup suggestion.
- **Provider models are missing or unavailable:** run `/rice-models doctor`,
  then `/rice-models setup` and follow Node, login or provider-approval guidance.
  Historical native-adapter setup output is not a recommended recovery path.

Each mod has its own repository, README, tests and third-party notices.

## License

MIT, see `LICENSE`. Each mod carries its own license and third-party notices.
