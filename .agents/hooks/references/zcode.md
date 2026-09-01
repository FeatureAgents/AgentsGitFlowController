# Registering hooks in ZCode

> Source: official ZCode client guide (bundled zcode-guide plugin, "Diagnosing Hook Configuration" — mirrors the official hooks documentation).
> Client status: **supported** — `HookPlatform` member, wire spec (`.zcode/config.json` with `hooks.enabled: true` and `events` nesting), and matrix cases implemented.

> ⚠ **The stdin payload shape is NOT documented** — `extractHookPayload` / `detectPlatform` support must stay marked *pending real-device verification* until a live payload is captured.

Registered in the workspace `<repo>/.zcode/config.json` (or `zcode.json`) or globally in `~/.zcode/cli/config.json`, under the top-level `hooks` key. **Configuration-file hooks are disabled by default** — `hooks.enabled: true` is required for them to run (plugin hooks auto-enable the runner):

```json
{
  "hooks": {
    "enabled": true,
    "events": {
      "PreToolUse": [
        {
          "matcher": "^Bash$",
          "hooks": [
            { "type": "command", "command": "node ${ZCODE_PROJECT_DIR}/bin/gitflow-guard.mjs check --platform zcode" }
          ]
        }
      ]
    }
  }
}
```

## Events & matcher

- Exactly seven events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `Stop`. Any other name is unsupported (`Notification`, `SubagentStop`, `PreCompact` are **not** supported).
- matcher: **case-sensitive regular expression** tested against the tool name (`Bash`, `Read`, `Write`, `Edit`, `Agent`; aliases `Task` ↔ `Agent`, `Write`/`Edit` ← `ApplyPatch`). An omitted matcher matches everything; an invalid regex silently never matches.

## Hook entry types

- `type: "command"`: `command` (a shell string), optional `shell`, `timeout` (**seconds**), `timeoutMs` (milliseconds, takes precedence), `statusMessage`. (`async` currently has no runtime effect.)
- `type: "process"`: `command` (an executable) plus `args[]` run without a shell (the most portable choice), `timeoutMs` (milliseconds), `statusMessage`.
- Mixing the two field sets drops the hook. Timeout chain: `timeoutMs` → `timeout × 1000` → config-level `timeoutMs` → default 60000 ms.

## Exit-code semantics

- exit 0 = pass; **exit 2 = deny** for `PreToolUse` / `PermissionRequest`; any other non-zero raises an error (run marked failed).
- stdout may carry JSON, but the schema is **strict — any extra key fails validation** (output discarded, run marked failed). `PreToolUse` JSON may alternatively return a permission decision of `allow` / `ask` / `deny`. This guard therefore denies via exit 2 + stderr and emits no stdout JSON.

## Payload shape (stdin JSON) — PENDING REAL-DEVICE VERIFICATION

Not documented in the official guide. The `${CLAUDE_*}` variable aliases and Claude-style tool names strongly suggest a Claude-shaped payload (`tool_input.command` + `cwd` + `hook_event_name`), but this must be confirmed by capturing a live payload before `extractHookPayload` / `detectPlatform` support is finalized.

## Environment & misc

- Template variables expand in the command and each argument and are also injected as environment variables: `${CLAUDE_PROJECT_DIR}` / `${ZCODE_PROJECT_DIR}`, `${CLAUDE_SESSION_ID}`; plugin hooks additionally get `${CLAUDE_PLUGIN_ROOT}` / `${ZCODE_PLUGIN_ROOT}`. A skill-directory variable is invalid inside a hook and raises an error.
- Hook scripts need the executable bit, or are invoked through an interpreter (`node` / `bash`) so the bit is irrelevant — this guard's wire command goes through `node`.
- Fired / timed-out / blocked executions are recorded in the ZCode log with source, matcher, outcome, duration and an stderr preview — the primary debugging surface.
- Forgetting `hooks.enabled: true` is the top pitfall: the entry registers but silently never fires.
