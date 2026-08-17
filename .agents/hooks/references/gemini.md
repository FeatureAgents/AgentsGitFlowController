# Gemini hooks 注册

实验性功能。定义在 `settings.json` 的 `hooks` 对象中（全局 `~/.gemini/settings.json`）。

## 支持的事件

| 类别 | 事件 |
|---|---|
| 工具 | BeforeTool / AfterTool |
| Agent | BeforeAgent / AfterAgent |
| 模型 | BeforeModel / BeforeToolSelection / AfterModel |
| 生命周期 | SessionStart / SessionEnd / Notification / PreCompress |

## 配置示例

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

## 关键要点

- 通过 stdin 接收 JSON，stdout 只输出 JSON，stderr 写日志。
- 退出码 2 表示系统阻止（stderr 内容为拒绝原因）。
- 阻止工具执行：输出 `decision: "deny"` 并附 `reason`。
- 内置工具直接按名称匹配（如 read_file），MCP 工具按 `mcp_<服务器名>_<工具名>` 命名，支持正则。
