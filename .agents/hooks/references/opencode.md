# Registering hooks in OpenCode

Note: the config is `hooks.yaml`, not `opencode.json`.

## Config file locations

- Global: `~/.config/opencode/hook/hooks.yaml`
- Project: `.opencode/hook/hooks.yaml`

## Supported events

| Event | When |
|---|---|
| session.created / session.deleted | Session created / deleted |
| session.idle | Session idle |
| file.changed | After a file is modified (preferred for file workflows) |
| tool.before.<tool> | Before a specific tool executes (`*` = all) |
| tool.after.<tool> | After a specific tool executes (`*` = all) |

## Example config (.opencode/hook/hooks.yaml)

```yaml
hooks:
  - id: guard-dangerous
    event: tool.before.bash
    actions:
      - bash: |
          cmd=$(cat | jq -r '.tool_args.command // .tool_args.cmd')
          if echo "$cmd" | grep -qE 'rm -rf /|rm -rf ~'; then
            echo "Dangerous command blocked" >&2
            exit 2
          fi
```

## Key points

- Only `tool.before.*` bash actions can block with **exit code 2**.
- Bash actions receive JSON on stdin (includes tool_name, tool_args, cwd, etc.).
- Global hooks can be overridden (`override`) or disabled (`disable: true`) at the project level.
- Path premise (this repo's dogfood config): `.opencode/hook/hooks.yaml` invokes `node "$OPENCODE_PROJECT_DIR/bin/gitflow-guard.mjs"` — it assumes that variable resolves to this checkout's root. A relative `bin/...` path breaks when the session starts from a subdirectory; verify the variable resolution on your setup before relying on it.
