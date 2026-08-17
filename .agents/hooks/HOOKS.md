# Hooks 规范

Hooks 是智能体在事件节点触发的命令。各家工具的 hooks 机制互不通用（Claude Code / Codex / OpenCode / Gemini 各有实现）。脚本自建于本目录，按工具各自注册。

## 事件一览

下表为 Claude Code 的事件；其他家的事件名不同，见「各家注册方式」中的参考文档。

| 事件 | 时机 | 用途 |
|---|---|---|
| SessionStart / SessionEnd | 会话开始 / 结束 | 初始化、清理 |
| UserPromptSubmit | 用户提问前 | 注入上下文 |
| PreToolUse | 工具执行前 | 拦截危险操作 |
| PostToolUse | 工具执行后 | 自动格式化 / lint |
| Stop | 回复结束时 | 收尾检查 |
| PreCompact | 上下文压缩前 | 保留现场 |
| SubagentStop | 子智能体结束时 | 汇总结果 |

## 推荐 hooks（按优先级）

> 示例中的 `guard-dangerous.sh` 为示意名，脚本需自建；注册写法见各家参考文档。

1. **危险命令拦截**（PreToolUse Bash）——拦截 `rm -rf`、`git push --force`、`curl | sh` 等危险命令。零项目依赖，新项目必带。
2. **提交前检查**（PreToolUse git commit）——自动跑测试 / 格式检查，不过关拦截提交。
3. **保存后格式化**（PostToolUse Edit/Write）——写完代码自动格式化。
4. **压缩前保现场**（PreCompact）——把 git status / diff 写入提示，压缩后不丢上下文。

## 各家注册方式

各家的注册实现见独立参考文档：

| 工具 | 注册文件 | 参考文档 |
|---|---|---|
| Claude Code | `.claude/settings.json` | [claude-code.md](references/claude-code.md) |
| OpenCode | `.opencode/hook/hooks.yaml` | [opencode.md](references/opencode.md) |
| Codex | `.codex/hooks.json` 或 `.codex/config.toml` | [codex.md](references/codex.md) |
| Gemini | `~/.gemini/settings.json`（hooks 对象） | [gemini.md](references/gemini.md) |

> 配置中的英文键名与事件名是各家格式规定的写法，不能修改。含义见文末「术语对照」。

## 术语对照

| 术语 | 含义 |
|---|---|
| matcher | 匹配规则：限定钩子作用于哪个工具或命令 |
| hooks | 挂载的钩子列表 |
| type: command | 钩子以 shell 命令方式执行 |
| command | 要执行的命令 |
| tool.before.<工具名> | 指定工具执行前触发（OpenCode） |
| PreToolUse / PostToolUse | 工具使用前 / 工具使用后触发 |
| BeforeTool / AfterTool | 工具使用前 / 工具使用后触发（Gemini） |
| .claude/settings.json | Claude Code 的项目级配置文件 |
| .opencode/hook/hooks.yaml | OpenCode 的钩子配置文件 |
| .codex/hooks.json | Codex 的钩子配置文件 |
| ~/.gemini/settings.json | Gemini 的全局配置文件 |
