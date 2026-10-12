# Plan and checkpoint

Target: Claude Code 2.1.296 on macOS (arm64). Mods run in-process through
function hooks; nothing here sets `ANTHROPIC_BASE_URL` or proxies Claude traffic.

## Mods

Each mod is its own repository (moabualruz/rice-session-accounts and
moabualruz/rice-multi-models); this repository is the marketplace listing them.

1. `rice-session-accounts`: several saved Anthropic auths (claude.ai OAuth
   login or token, Console API key, gateway, Bedrock, Vertex, Foundry), stored
   separately. Every session starts on the machine login. `/rice-account <name>` switches only the
   current session (its main loop, its subagents and any `claude -p` it starts).
   Other sessions are unaffected.
2. `rice-multi-models`: non-Anthropic models as native-feeling models. Selected
   with `/model` or as the model of ordinary subagents, mixed with Claude models,
   running Claude Code's own tools and loop. First provider: ChatGPT/Codex
   subscription over the Responses API (WebSocket with SSE fallback). Later: Zen,
   API-key providers, Cursor, Antigravity, Grok.

## Verified facts (2026-10-12, Claude Code 2.1.296)

- A `turn.step` async-generator hook can answer a request itself: yield
  `text`/`thinking`/`tool`/`input`/`stop` chunks and return a `TurnStepResult`
  (returning nothing is refused as "wrong shape"). Tool calls it yields are run
  by the engine and the next step sees the results.
- `--model codex/gpt-6.1-sol` and an agent definition with that `model` both
  reach the hook; a Claude main session with a routed subagent works.
- `prompt.compose` does not fire for a subagent's own system prompt;
  `$.tool.list()` returns all session tools without schemas.
- Setting `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`,
  `CLAUDE_CODE_USE_BEDROCK` (+AWS vars) or `CLAUDE_CODE_USE_VERTEX` (+vars) with
  `$.env.set` mid-session changes the credential/provider of the next request.
- A function receiving `$` must be a top-level declaration (static rule).
- Hook budget: 10 s of the hook's own code; `$` calls in flight do not count, so
  long model calls must stream through `$.process.spawn`.
- Codex backend: `chatgpt.com/backend-api/codex/responses` accepts SSE and
  WebSocket (`OpenAI-Beta: responses_websockets=2026-02-06`), custom
  `instructions`, function tools, and an honest `originator`
  (`claude_code_codex_bridge`, now `rice_multi_models`, both accepted). WebSocket also emits `codex.rate_limits`.
- `modelPicker` (user settings) lists custom model ids in `/model`.

## Decisions

- Helper transport: one process per request over stdio by default (no listening
  endpoint). Optional private session helper on a token-protected Unix socket
  for persistent WebSocket connections. Owner chose the session helper as the default.
- Secrets: macOS Keychain items; never in files, argv or logs.

## Status

- [x] Repo scaffold and third-party notices
- [x] rice-session-accounts mod (renamed: "anthropic-" names are reserved); 15 unit tests; live switch test passed
- [x] rice-multi-models: mod side (routing, prompts, schemas, subagents, compaction, model.complete and model.fork)
- [x] rice-multi-models: Codex provider (auth via codex app-server, Responses translation, WS with SSE fallback)
- [x] Live: Codex main with tools, Claude main with Codex subagent, agent file on Codex, Codex main with Claude subagent, compaction
- [x] Tests: 6 mod (claude plugin test), 6 helper (bun test, captured streams); helper type-checks
- [x] One repository per mod plus this marketplace (GitHub, public); `/model` rows for the visible Codex models
- [x] Session helper (private socket, token) as the default: one WebSocket per conversation; one-shot fallback
- [x] Declared providers (claude-styx format): OpenAI-style, Anthropic-style, Bedrock; live: LM Studio, OpenRouter; OpenCode Go reaches the service (needs an active Go subscription)
- [x] OpenCode Zen and Go (rice-multi-models 0.5.0, 2026-10-12): per-model kinds, Responses and Gemini codecs, /rice-models opencode; live: Responses kind on LM Studio and OpenRouter, Anthropic kind under a /v1 base on LM Studio; all four protocols reach OpenCode authenticated (Zen 402 no credit, Go 403 no subscription); Gemini replies unit-tested only (owner: Zen credit or a Go subscription to finish)
- [x] Workers: Antigravity (live) and Grok (parser-tested; needs grok login)
- [x] /model picker rows for every routed model (/rice-models picker write)
- [ ] Cursor worker: needs the Cursor CLI or SDK and a Cursor login (owner)
