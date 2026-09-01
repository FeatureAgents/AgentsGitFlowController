# Registering hooks in CodeBuddy Code

> Source: official docs `codebuddy.ai/docs/zh/cli/hooks` (v1.16.0+). The hook feature is a **Claude Code Hooks-compatible implementation**, currently **Beta** — interfaces may change; re-verify on a real device when wiring.
> Client status: **planned integration** — `HookPlatform` member, wire spec and matrix cases land with the implementation PR (AGENTS.md §8).

Registered in the project-root `.codebuddy/settings.json` (project; `settings.local.json` for personal overrides) or `~/.codebuddy/settings.json` (user); enterprise policy takes precedence. Scopes **merge** (not override):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
        "hooks": [
          { "type": "command", "command": "node ${CODEBUDDY_PROJECT_DIR}/bin/gitflow-guard.mjs check --platform codebuddy" }
        ]
      }
    ]
  }
}
```

## Payload shape (stdin JSON)

- `tool_input.command` — the shell command text (Bash tool).
- `cwd` — the working directory the tool runs in.
- `session_id` / `transcript_path` / `permission_mode` — session context. No `tool_use_id` field is documented (Claude Code has one).
- `hook_event_name` — nine events: `PreToolUse` / `PostToolUse` / `Notification` / `UserPromptSubmit` / `Stop` / `SubagentStop` / `PreCompact` / `SessionStart` / `SessionEnd`.

Shape is identical to Claude Code's and carries **no distinguishing field**, so `detectPlatform` classifies CodeBuddy payloads as `claude`. This is harmless: the deny encoding (exit 2 + stderr) is identical for both.

## Exit-code semantics

- **exit 2** = block; for `PreToolUse` the tool call is denied. Message priority: **stdout (plain text, or JSON `reason` / `stopReason`) > stderr** — stderr is only the fallback. This guard denies with exit 2, the reason on stderr and stdout left empty, so stderr is picked up.
- exit 0 = allowed; stdout is not interpreted for PreToolUse decisions.
- any other non-zero = non-blocking error (shown to the user, execution continues).

## JSON output (alternative encoding, not used by this guard)

```json
{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "..." } }
```

`allow` / `deny` / `ask`; `modifiedInput` rewrites tool arguments before execution.

## Environment & misc

- `$CODEBUDDY_PROJECT_DIR` expands to the absolute project root inside hook commands — use it to build an absolute script path (hook subprocesses may not inherit your shell `PATH`). `${CODEBUDDY_PLUGIN_ROOT}` is available for plugin hooks.
- matcher: case-sensitive regex on the tool name with **substring semantics** (`Write` matches `NotebookWrite`); use `^Write$` for exact matching, `*` or omitted for all. Applies to `PreToolUse` / `PostToolUse` only.
- Shell: macOS/Linux use `$SHELL` (fallback `/bin/sh`); **Windows forces Git Bash** — point at `bash.exe` via `CODEBUDDY_CODE_GIT_BASH_PATH`, or substitute a POSIX shell via `CODEBUDDY_CODE_SHELL`. The guard's wire command (`node …`) is shell-agnostic.
- Default per-hook timeout 60 s (`timeout` field, seconds); matched hooks run in parallel, identical commands are deduplicated.
- Hooks are snapshotted at startup: external edits to settings files (e.g. written by `gitflow-guard wire` while a session is running) must be reviewed in the `/hooks` panel before they take effect.
- Debug: `codebuddy --debug` traces hook execution.
