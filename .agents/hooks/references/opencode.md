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
- 守卫 CLI 返回 `exit 2`(阻断)或执行超过 45s 超时(`SIGKILL` 终止子进程)时一律抛错阻断; 其余 spawn/退出故障按 fail-open 打印 stderr 告警后放行.

## 与本插件对接

- 随包发布 `opencode/gitflow-guard.ts`: 零外部依赖(不 import @opencode-ai/plugin),
  订阅 `tool.execute.before` 拦截 bash/powershell, 以静态参数调用守卫 CLI
  (`gitflow-guard check --platform opencode`), 并通过 stdin JSON 透传 `{ tool_args: { command }, cwd }`, 避免命令行拼接导致的 shell 注入.
- 接线: `gitflow-guard wire --client opencode --project --yes` 会把插件复制到
  `<项目>/.opencode/plugins/gitflow-guard.ts`(全局 `--global`: `~/.config/opencode/plugins/gitflow-guard.ts`), 并就地注入当前安装包的 `WIRED_RUNNER_PATH` 与 `WIRED_NODE_PATH` 绝对路径;
  - 幂等与迁移: 重跑 `wire` 时同内容返回 `exists`, 检测到旧版守卫插件就地升级并返回 `migrated`; 若目标路径为非本插件的自定义文件则拒绝覆盖并报错.
  - `--unwire` 移除该插件文件(不影响用户其他插件)。也可手工复制。
- 守卫 CLI 5 级定位顺序(按可用性取第一个):
  1. `process.env.GITFLOW_GUARD_BIN` 显式覆盖(脚本走 `nodeBin`, Windows `.cmd`/`.bat` 或裸命令走 `shell: true`);
  2. `wire` 注入的 `WIRED_RUNNER_PATH` + `WIRED_NODE_PATH`(存在即用);
  3. 插件上两级目录(项目根)的 `bin/gitflow-guard.mjs`;
  4. `$OPENCODE_PROJECT_DIR/bin/gitflow-guard.mjs`;
  5. PATH 兜底(Unix: `gitflow-guard` + `shell: false`, Windows: `gitflow-guard.cmd` + `shell: true`);
  均不可用时 fail-open 放行。

## Example (等价于 wire 产物)

```ts
// .opencode/plugins/gitflow-guard.ts — 由 wire 复制 opencode/gitflow-guard.ts 并注入 WIRED_RUNNER_PATH / WIRED_NODE_PATH
```

## Key points

- 只有 bash/powershell 工具会执行 shell 命令, 插件只拦这两个工具面; read/edit 等工具不经过守卫.
- 目录与分目录解析: 插件工厂从 `ctx.directory` / `ctx.worktree`(兜底 `process.cwd()`)获取 `baseCwd`, 每次拦截优先读取 `output.args.workdir ?? output.args.cwd` 相对于 `baseCwd` 解析候选目录, 若候选目录非有效目录(不存在或为普通文件)则回退到有效目录 `baseCwd` 或 `process.cwd()` 作为 `effectiveCwd`(防止不存在或非目录路径触发 `spawn ENOENT/ENOTDIR` 导致 fail-open 绕过), 再经 stdin JSON 传给守卫 CLI 的 `resolveCommandRepo` 执行分目录(worktree / `cd` / `git -C`)判定与跨目录拦截.
- OpenCode 原生加载 TS/JS 插件(bun 运行时), 无需 build 步骤.