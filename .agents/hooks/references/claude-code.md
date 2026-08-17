# Claude Code hooks 注册

注册于项目根 `.claude/settings.json`，脚本路径指向 `.agents/hooks/`：

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

- matcher：匹配规则，限定钩子作用于哪个工具或命令。
- 事件名与键名为格式规定，不能修改。
