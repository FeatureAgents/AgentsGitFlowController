# Registering hooks in Gemini

Experimental. Defined in the `hooks` object of `settings.json` (global `~/.gemini/settings.json`).

## Supported events

| Category | Events |
|---|---|
| Tools | BeforeTool / AfterTool |
| Agents | BeforeAgent / AfterAgent |
| Models | BeforeModel / BeforeToolSelection / AfterModel |
| Lifecycle | SessionStart / SessionEnd / Notification / PreCompress |

## Example config

```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "read_file",
        "sequential": true,
        "hooks": [
          { "type": "command", "command": "bash .agents/hooks/guard-dangerous.sh", "timeout": 60000 }
        ]
      }
    ]
  }
}
```

## Key points

- Receives JSON on stdin; stdout carries only JSON; stderr is for logging.
- Exit code 2 means system-level block (stderr content is the denial reason).
- To block tool execution: output `decision: "deny"` with a `reason`.
- Built-in tools match by name (e.g. read_file); MCP tools are named `mcp_<server>_<tool>`; regex is supported.
