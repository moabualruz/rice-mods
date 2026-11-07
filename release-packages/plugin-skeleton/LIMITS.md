# Mod limits

Complete every bracketed item with facts verified from the plugin's manifest, hooks, README and qualification evidence before packaging. Do not ship unresolved placeholders or infer compatibility from a current runtime alone.

## Claude Code support

- Supported range: [state the minimum and maximum, or the exact supported pin]
- Current verified runtime: [record the current verified version; 2.1.310 is the current environment]
- Minimum source: [declared engine/host requirement or recorded qualification pin]

## Managed policy

[Describe how managed policy affects the plugin, including whether it changes policy or grants permissions.]

## Safe mode

[Describe actual behavior under `--safe-mode`, or state that it is not implemented or qualified.]

## Takeover default

[State whether native tool or permission takeover exists and its default.]

## Unsupported surfaces

- Claude Code VS Code panel: [supported, unsupported, or unqualified]
- Claude Code cloud sessions: [supported, unsupported, or unqualified]

## Early-access API

[List the early-access Claude Code APIs used, or state that none are used. Include the version qualification boundary.]
