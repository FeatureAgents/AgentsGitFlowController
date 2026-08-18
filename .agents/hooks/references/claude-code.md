# Registering hooks in Claude Code

Registered in the project-root `.claude/settings.json`; script paths point to `.agents/hooks/`:

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

- matcher: match rule that restricts which tool or command the hook applies to.
- Event and key names are mandated by the format and cannot be changed.
