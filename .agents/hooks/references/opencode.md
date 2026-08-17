# OpenCode hooks 注册

注意：配置是 `hooks.yaml`，不是 opencode.json。

## 配置文件位置

- 全局：`~/.config/opencode/hook/hooks.yaml`
- 项目：`.opencode/hook/hooks.yaml`

## 支持的事件

| 事件 | 触发时机 |
|---|---|
| session.created / session.deleted | 会话创建 / 删除 |
| session.idle | 会话空闲 |
| file.changed | 文件修改后（文件类工作流推荐优先用） |
| tool.before.<工具名> | 指定工具执行前（`*` 表示所有） |
| tool.after.<工具名> | 指定工具执行后（`*` 表示所有） |

## 配置示例（.opencode/hook/hooks.yaml）

```yaml
hooks:
  - id: guard-dangerous
    event: tool.before.bash
    actions:
      - bash: |
          cmd=$(cat | jq -r '.tool_args.command // .tool_args.cmd')
          if echo "$cmd" | grep -qE 'rm -rf /|rm -rf ~'; then
            echo "危险命令被拦截" >&2
            exit 2
          fi
```

## 关键要点

- 只有 `tool.before.*` 的 bash 动作能以**退出码 2** 阻塞执行。
- bash 动作通过 stdin 接收 JSON（含 tool_name、tool_args、cwd 等）。
- 全局钩子可在项目级用 `override` 替换或 `disable: true` 禁用。
