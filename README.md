# rice-mods

A marketplace for two Claude Code mods. Choose the one that matches what you
want to change, or install both.

Use the ordinary, unmodified `claude` command. These mods introduce no launcher,
replacement executable, inference proxy or gateway.

**Release progress:** [Accounts **0.4.0** is published](https://github.com/moabualruz/rice-session-accounts/releases/tag/rice-session-accounts--v0.4.0),
with ordinary-Claude acceptance, independent review and all five required Linux
and native Windows checks passed. MultiModels **0.8.0** remains published
while its public-hook replacement is being completed.

| Mod | Available through ordinary Claude | Current limitation |
| --- | --- | --- |
| [Rice Accounts](https://github.com/moabualruz/rice-session-accounts#readme) | 0.4.0: session OAuth switching, email/tier picker, selected usage/status, existing agents and child-process inheritance | Some internal native panels retain machine metadata; `/usage`, interactive `/status` and the plugin status entry report the selection. |
| [Rice MultiModels](https://github.com/moabualruz/rice-multi-models#readme) | Provider setup, discovery, approvals and main/child routing. Source candidate adds public compaction, session naming, web tools, classifiers and configured evaluators. | Full auxiliary coverage remains open, including ambiguous concurrent callers and complete loaded evaluator-source coverage. |

The complete plugin-only behavior remains the requirement; these available
parts are not a replacement acceptance scope. See the
[implementation status](https://github.com/moabualruz/rice-multi-models/blob/main/docs/specs/direct-native-inference.md).

Rice Accounts manages Anthropic OAuth sign-ins and setup tokens. API keys,
provider endpoints, cloud providers and other model subscriptions belong in
Rice MultiModels. Provider requests use direct calls, without an inference proxy.

## Before installing

Use macOS, Linux (including WSL), or native Windows, with Node.js 22 or newer.
Accounts 0.4.0's complete current proof uses Claude Code 2.1.301. Keep Claude
updated with its normal updater.
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

The picker displays saved names, emails and tiers. In Accounts 0.4.0, select a
row or enter `/rice-account personal-live` to switch this session from its next
request. `/usage` shows that account's usage; interactive `/status` shows its
email and tier. Escape closes the picker. If an older installation refuses named
switches, update it to 0.4.0:

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
