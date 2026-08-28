# Hooks specification

Hooks are commands triggered by agents at event points. Each tool's hooks mechanism is not interchangeable (Claude Code / Codex / OpenCode / Antigravity each have their own). Scripts live in this directory and are registered per tool.

## Events

The table below lists Claude Code's events; other tools use different names — see the per-tool reference docs in "Registration per tool".

| Event | When | Purpose |
|---|---|---|
| SessionStart / SessionEnd | Session start / end | Initialization, cleanup |
| UserPromptSubmit | Before the user asks | Context injection |
| PreToolUse | Before a tool executes | Block dangerous operations |
| PostToolUse | After a tool executes | Auto-format / lint |
| Stop | At the end of a reply | Final checks |
| PreCompact | Before context compaction | Preserve state |
| SubagentStop | When a subagent finishes | Summarize results |

## Recommended hooks (by priority)

> `guard-dangerous.sh` in the examples is a placeholder name — the script must be built; registration syntax is in each tool's reference doc.

1. **Dangerous-command guard** (PreToolUse Bash) — block dangerous commands such as `rm -rf`, `git push --force`, `curl | sh`. Zero project dependency; include in every new project.
2. **Pre-commit checks** (PreToolUse git commit) — auto-run tests / formatting; block the commit if they fail.
3. **Format on save** (PostToolUse Edit/Write) — auto-format after writing code.
4. **Preserve context before compaction** (PreCompact) — write `git status` / diff into the prompt so context isn't lost after compaction.

## Registration per tool

Each tool's registration is documented in its own reference doc:

| Tool | Config file | Reference |
|---|---|---|
| Claude Code | `.claude/settings.json` | [claude-code.md](references/claude-code.md) |
| OpenCode | `.opencode/hook/hooks.yaml` | [opencode.md](references/opencode.md) |
| Codex | `.codex/hooks.json` or `.codex/config.toml` | [codex.md](references/codex.md) |
| Antigravity | `.agents/hooks.json` | [antigravity.md](references/antigravity.md) |
| DSH | `patch.yml` + `dsh.bundle.patch` (in-process, no hook config) | [dsh.md](references/dsh.md) |
| Pi | `.pi/settings.json` + `.pi/extensions/` (in-process, no hook config) | [pi.md](references/pi.md) |

> The English keys and event names in the config are mandated by each format and cannot be changed. Meanings are in the glossary below.

> DSH and Pi are **in-process** clients, not stdin-hook tools — DSH mounts as a plugin (`patch.yml`) and Pi loads as an extension; neither registers a hook config. See [dsh.md](references/dsh.md) and [pi.md](references/pi.md).

## Glossary

| Term | Meaning |
|---|---|
| matcher | Match rule: restricts which tool or command the hook applies to |
| hooks | The list of hooks attached |
| type: command | The hook runs as a shell command |
| command | The command to execute |
| tool.before.<tool> | Triggered before a specific tool executes (OpenCode) |
| PreToolUse / PostToolUse | Triggered before / after tool use |
| PreToolUse / PostToolUse | Triggered before / after tool use (Antigravity) |
| .claude/settings.json | Claude Code project-level config file |
| .opencode/hook/hooks.yaml | OpenCode hooks config file |
| .codex/hooks.json | Codex hooks config file |
| .agents/hooks.json | Antigravity project hooks config file (global: ~/.gemini/config/) |
