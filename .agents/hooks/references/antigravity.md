# Registering hooks in Antigravity

> Google 的编码 agent 产品线已把 **Gemini CLI 并入 Antigravity**(Antigravity 2.0,参见官方 [Hooks 文档](https://antigravity.google/docs/ide/hooks))。一律按 **antigravity** 命名;旧 Gemini `~/.gemini/settings.json` 的 hook 格式已过期,不要沿用。

## Config file locations

- 项目: `.agents/hooks.json`
- 全局: `~/.gemini/config/`(customization 目录)

## Format (hook 名 → 事件 → handlers)

```json
{
  "gitflow-guard": {
    "PreToolUse": [
      { "matcher": "run_command", "hooks": [ { "type": "command", "command": "node /abs/path/to/bin/gitflow-guard.mjs check --platform antigravity" } ] }
    ]
  }
}
```

## Supported events (与守卫相关)

| Event | 说明 |
|---|---|
| PreToolUse / PostToolUse | 可配 matcher(工具名或正则,如 `run_command`) |
| PreInvocation / PostInvocation / Stop | matcher 忽略 |

## Key points

- **stdin**: `toolCall` 对象 —— `toolCall.name`(如 `run_command`)、`toolCall.args`(shell 命令在 `toolCall.args.CommandLine`、**cwd 在 `toolCall.args.Cwd`**,顶层无 cwd 字段 —— agy 1.1.22 实机核验, TestResult/antigravity.md AGY-D3),另有 conversationId/workspacePaths/stepIdx 等。
- **stdout 判决**: 顶层 JSON `{ "decision": "allow" | "deny" | "ask" | "force_ask", "reason": "..." }`。
- **必须 exit 0**(即使拒绝);非零退出按 hook 执行失败处理。**不要**包 `hookSpecificOutput`。`decision` 没有 `"block"` 值,拦截用 `"deny"`。
- **hook 命令必须绝对路径**: 实测 hook 进程 cwd = hook 配置文件所在目录(项目级 `.agents/`),相对 `bin/...` 解析为 `.agents/bin/...` → MODULE_NOT_FOUND(AGY-D2)。项目级 wire 落位自动写绝对路径;全局落位用 PATH 上的 `gitflow-guard`。

## 与本插件对接

- 插件 CLI: `gitflow-guard check --platform antigravity`(读 stdin 的 `toolCall.args.CommandLine`, 返回 exit 0 + `{"decision":"deny","reason":...}`)。
- 真机核验闭环(agy 1.1.22): 拦截/放行/wire 形状/阻断语义全 PASS(AGY-A/B/D 组),  已摘除「实验支持」标注。
