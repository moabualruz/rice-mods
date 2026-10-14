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
| `rice-multi-models` | [moabualruz/rice-multi-models](https://github.com/moabualruz/rice-multi-models) | Non-Anthropic models as ordinary session and subagent models: Codex through a ChatGPT subscription; any OpenAI-style, Anthropic-style or Bedrock endpoint (Ollama, LM Studio, vLLM, llama.cpp, OpenRouter, OpenCode Go, clouds); Antigravity and Grok as workers. No proxy. |

rice-multi-models requires Node.js 22 or newer, not Bun. Its helper and runtime dependencies ship with the mod; every session start refreshes supported model lists and reported metadata, synchronizes discovered candidates into `/model`, and explains unavailable sources or missing login/approval. Unknown limits stay unknown, not cached or guessed. Discovered facts constrain mod requests; Claude Code 2.1.296 cannot register per-model native context metadata through its plugin API, so the host meter can still show its fallback. Use `/rice-models setup` for repair and `/rice-models doctor` for read-only diagnostics. Fresh native installation activates immediately; after an update, `/reload-plugins` or restart loads the new copy. See the mod's README for provider-specific login, optional CLI installation, candidate readiness, quota and per-session restrictions.

Each mod lives in its own repository with its own README, tests and third-party
notices. `docs/PLAN.md` records the design, what was verified and what is next.

## License

MIT, see `LICENSE`. Each mod carries its own license and third-party notices.
