# Registering the guard in OpenCode (plugins)

> OpenCode 1.18+ 已**移除 hooks.yaml 机制**(官方文档站无 hooks 页, 实机验证 hook 零调用,
> 见 docs/e2e/TestResult/opencode.md); 当前官方扩展点为 **plugins**:
> `.opencode/plugins/*.ts` + 事件订阅(`tool.execute.before` 等), 官方文档 https://opencode.ai/docs/plugins/。

## Plugin directory

- 项目: `.opencode/plugins/`
- 全局: `~/.config/opencode/plugins/`

## Blocking semantics

- `tool.execute.before` handler 中**抛错**即阻断该工具调用(官方 env-protection 示例同款:
  `throw new Error("Do not read .env files")`).
- 不抛错 = 放行; handler 也可改写 `output.args`(如转义命令)后放行.

## 与本插件对接

- 随包发布 `opencode/gitflow-guard.ts`: 零外部依赖(不 import @opencode-ai/plugin),
  订阅 `tool.execute.before` 拦截 bash/powershell, 把命令交给守卫 CLI
  (`gitflow-guard check --platform opencode --command <cmd>`), deny(exit 2) 时抛错阻断, 其余放行.
- 接线: `gitflow-guard wire --client opencode --project --yes` 会把插件复制到
  `<项目>/.opencode/plugins/gitflow-guard.ts`(全局: `~/.config/opencode/plugins/`);
  `--unwire` 移除。也可手工复制。
- 守卫 CLI 定位顺序: 插件上两级目录(项目根)的 `bin/gitflow-guard.mjs` →
  `$OPENCODE_PROJECT_DIR/bin/gitflow-guard.mjs` → PATH 上的 `gitflow-guard`;
  均不可用时 fail-open 放行。

## Example (等价于 wire 产物)

```ts
// .opencode/plugins/gitflow-guard.ts — 内容即随包 opencode/gitflow-guard.ts
```

## Key points

- 只有 bash/powershell 工具会执行 shell 命令, 插件只拦这两个工具面; read/edit 等工具不经过守卫.
- 插件进程 cwd = opencode 启动目录; 仓库定位由守卫 CLI 的 findRepoRoot 从 cwd 向上查找.
- OpenCode 原生加载 TS/JS 插件(bun 运行时), 无需 build 步骤.