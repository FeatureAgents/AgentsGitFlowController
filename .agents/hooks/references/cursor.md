# Registering hooks in Cursor

> Source: official docs `cursor.com/docs/reference/hooks` (v0.45.0+).
> Client status: **supported** — `HookPlatform` member, wire spec (`.cursor/hooks.json`), and matrix cases implemented.

Registered in the project-root `.cursor/hooks.json` (project) or `~/.cursor/hooks.json` (user/global):

```json
{
  "version": 1,
  "hooks": {
    "beforeShellExecution": [
      {
        "command": "node bin/gitflow-guard.mjs check --platform cursor"
      }
    ]
  }
}
```

## Payload shape (stdin JSON)

- `command` — the shell command string to be executed (`beforeShellExecution`).
- `cwd` — current working directory.
- `cursor_version` — version of the Cursor IDE (used by `detectPlatform` as primary discriminator).
- `workspace_roots` — array of absolute workspace root paths.
- `hook_event_name` — lifecycle event name (`beforeShellExecution`, `preToolUse`, etc.).
- `conversation_id` / `generation_id` — conversation and turn identifiers.

## Blocking protocol (stdout JSON)

Cursor hooks intercept actions by evaluating stdout JSON and exit codes:

- **exit 0** + stdout JSON:
  ```json
  {
    "permission": "deny",
    "user_message": "Blocked reason shown to user",
    "agent_message": "Blocked reason fed back to AI model"
  }
  ```
- `permission`: `"allow"` | `"deny"` | `"ask"`.
- `user_message`: explanation presented in the UI to the user.
- `agent_message`: contextual guidance sent to the AI agent to correct its action.
- **Fail-closed**: configure `"failClosed": true` on hook entries when strict enforcement is required.

## Environment & misc

- Hook commands execute with the workspace root as the working directory.
- Hooks run synchronously with the agent decision loop.
