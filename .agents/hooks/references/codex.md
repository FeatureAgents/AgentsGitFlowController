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
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash .agents/hooks/guard-dangerous.sh" }
        ]
      }
    ]
  }
}
```

## Key points

- To block a tool call: PreToolUse outputs `permissionDecision: "deny"`, or exits with code 2 (denial reason goes to stderr).
- matcher uses a regex against the tool name (e.g. `^Bash$`).
- Hook commands run in the session working directory.
