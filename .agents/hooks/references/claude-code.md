# Registering hooks in Claude Code

Registered in the project-root `.claude/settings.json` (project) or `~/.claude/settings.json` (global):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node ${CLAUDE_PROJECT_DIR}/bin/gitflow-guard.mjs check --platform claude" }
        ]
      }
    ]
  }
}
```

## Payload shape (stdin JSON)

- `tool_input.command` — the shell command text.
- `cwd` — the working directory the tool runs in.
- `tool_use_id` — identifier of this tool invocation (echoed through as-is).
- `hook_event_name` — `PreToolUse` / `PostToolUse` / `PostToolUseFailure`.

## Exit-code semantics

- **exit 2** = hard block; the text on **stderr** is shown to the model as the denial reason. This is how this guard denies.
- exit 0 = allowed; stdout is not interpreted for PreToolUse decisions.

## Environment & misc

- `${CLAUDE_PROJECT_DIR}` expands to the project root and is available inside hook commands — use it to build an absolute script path (hook subprocesses may not inherit your shell `PATH`).
- matcher: match rule that restricts which tool or command the hook applies to.
- Event and key names are mandated by the format and cannot be changed.
