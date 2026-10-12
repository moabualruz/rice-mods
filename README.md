# rice-mods

A Claude Code plugin marketplace. Add it once, then install any of its mods.

```bash
claude plugin marketplace add moabualruz/rice-mods
claude plugin install rice-session-accounts@rice-mods
claude plugin install rice-multi-models@rice-mods
```

Inside a session the same works as `/plugin marketplace add moabualruz/rice-mods`
and `/plugin install <name>@rice-mods`. `claude plugin marketplace update rice-mods`
picks up new versions.

| Mod | Repository | What it does |
| --- | --- | --- |
| `rice-session-accounts` | [moabualruz/rice-session-accounts](https://github.com/moabualruz/rice-session-accounts) | Several Anthropic accounts (claude.ai login or token, Console API key, gateway, Bedrock, Vertex, Foundry); `/rice-account <name>` switches only the current session and what it starts. |
| `rice-multi-models` | [moabualruz/rice-multi-models](https://github.com/moabualruz/rice-multi-models) | Non-Anthropic models as ordinary session and subagent models with Claude Code's own tools: Codex through a ChatGPT subscription today, more providers on the way. No proxy. |

Each mod lives in its own repository with its own README, tests and third-party
notices. `docs/PLAN.md` records the design, what was verified and what is next.
