# Registering hooks in Codex

## Config file locations

- Global: `~/.codex/hooks.json` or `~/.codex/config.toml`
- Project: `.codex/hooks.json` or `.codex/config.toml`

Hooks from multiple sources **all run**; they don't replace each other.

## Supported events

SessionStart / SessionEnd / SubagentStart / SubagentStop / PreToolUse / PermissionRequest / PostToolUse / PreCompact / PostCompact / UserPromptSubmit / Stop

## Example config (.codex/hooks.json)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
        "hooks": [
          { "type": "command", "command": "node <npm-global>/agents-gitflow-guard/bin/gitflow-guard.mjs check --platform codex" }
        ]
      }
    ]
  }
}
```

> `<npm-global>/agents-gitflow-guard/bin/...` is a placeholder — `gitflow-guard wire` resolves it to the absolute path of the **installed package's own runner** at wire time. The written command is fully self-anchored: no client variable expansion, no hook-cwd assumption (the previous relative `node bin/...` form broke whenever the hook process cwd was not the repo root), no PATH dependency, and nothing needs to be deployed into the target repo. Re-running `wire` migrates legacy entries in place.

## Key points

- Blocking protocol: print **exactly** `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"}}` on stdout and **always exit 0** — non-zero exits or unknown extra fields are rejected by Codex, so `exit 2` is not a valid deny channel here.
- Payload discriminator: a non-empty `turn_id` field marks a Codex payload (`tool_input.command` + `cwd` carry the command; this repo's `detectPlatform` relies on `turn_id`).
- matcher uses a regex against the tool name (e.g. `^Bash$`).
- Hook commands run in the session working directory.
