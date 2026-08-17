# Codex hooks 注册

## 配置文件位置

- 全局：`~/.codex/hooks.json` 或 `~/.codex/config.toml`
- 项目：`.codex/hooks.json` 或 `.codex/config.toml`

多个来源的钩子会**全部运行**，不互相替换。

## 支持的事件

SessionStart / SessionEnd / SubagentStart / SubagentStop / PreToolUse / PermissionRequest / PostToolUse / PreCompact / PostCompact / UserPromptSubmit / Stop

## 配置示例（.codex/hooks.json）

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

## 关键要点

- 阻止工具调用：PreToolUse 输出 `permissionDecision: "deny"`，或退出码 2（拒绝原因写 stderr）。
- matcher 用正则匹配工具名（如 `^Bash$`）。
- hooks 命令以会话工作目录运行。
