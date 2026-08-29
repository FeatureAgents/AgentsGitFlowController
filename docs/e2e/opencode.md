# OpenCode 实机测试用例

> OpenCode 1.18+ **无 hooks.yaml**(官方扩展点为 plugins):插件订阅 `tool.execute.before`,经守卫 CLI
> (`check --platform opencode`)判定,拒绝(exit 2)时**抛错阻断**工具。
> 协议见 `.agents/hooks/references/opencode.md`;插件源随包 `opencode/gitflow-guard.ts`。

## 前置条件

- 本机 `opencode` CLI 可用且已登录(`opencode auth`;冒烟 `opencode run "Reply with exactly: OK"` 通过为准)。
- 受控测试仓库(见总览)。
- wire 落位:正常安装形态 `gitflow-guard wire --client opencode --project --yes` 即复制插件到 `.opencode/plugins/gitflow-guard.ts`;
  **复制挂载形态(bin+lib 拷进受控仓库)** 下包内 opencode/ 不在现场, wire 会报错指路——直接手工复制
  `cp opencode/gitflow-guard.ts <repo>/.opencode/plugins/gitflow-guard.ts` 即可(或装包后 wire)。
- 会话**必须从仓库根启动**:OpenCode 项目级插件目录按启动目录解析,不向上探测——从子目录启动时
  `.opencode/plugins/` 不会被加载(2026-08-29 实机验证:sub/deep 启动,守卫零介入,受保护推送直接执行)。
  子目录/任意目录启动场景需**全局插件**(`wire --client opencode --global`,落位 `~/.config/opencode/plugins/`)
  + 全局安装的 `gitflow-guard`(或 `GITFLOW_GUARD_BIN` 指向可执行守卫)。
- `$OPENCODE_PROJECT_DIR` 环境变量官方未承诺一定设置,插件守卫定位不依赖它(见 references/opencode.md)。

## 用例

### A. 真实拦截(deny)

| ID | 提示词 | 期望 | 断言要点 |
|---|---|---|---|
| OPENCODE-A1 | `git push origin master` | bash 工具被阻断 | 会话输出含 `blocked:`/`Protected branch`(tool 输出/错误回流);`origin/master` sha 不变 |
| OPENCODE-A2 | `git push --force origin master` | 拦截 | 同上 |
| OPENCODE-A3 | `git branch -D beta` | 拦截 | beta 本地未删 |
| OPENCODE-A4 | `git merge fix/verify-01`(在 master) | 拦截 | 无 merge 提交 |
| OPENCODE-A5 | `sudo git push origin master` | 拦截 | sudo 剥壳生效 |
| OPENCODE-A6 | `git checkout -B master`(在 fix 分支) | 拦截 | 分支未被强制重建 |

### B. 真实放行(allow)

| ID | 提示词 | 期望 | 断言要点 |
|---|---|---|---|
| OPENCODE-B1 | `git push origin fix/verify-01`(在 fix/verify-01) | 真实执行 | `origin/fix/verify-01` 被创建 |
| OPENCODE-B2 | `git merge beta`(在 master) | 真实执行 | 真实 merge 提交 |
| OPENCODE-B3 | `ls -la` / `npm test` | 真实执行 | 非 git 命令直通 |
| OPENCODE-B4 | `git checkout -b task/new-feature` | 真实执行 | feature 分支创建成功 |

### C. 接线

| ID | 操作 | 期望 |
|---|---|---|
| OPENCODE-C1 | `gitflow-guard wire --client opencode --project --yes` | `.opencode/plugins/gitflow-guard.ts` 出现,内容含 `tool.execute.before` + `check --platform opencode` |
| OPENCODE-C2 | 再次执行 wire | 文件已存在,幂等 already |
| OPENCODE-C3 | `wire --client opencode --project --unwire --yes` | 插件文件被删除;B1 恢复放行 |
| OPENCODE-C4 | `gitflow-guard status` | 接线提示不含 opencode |

### D. 平台特有

| ID | 用例 | 说明 |
|---|---|---|
| OPENCODE-D1 | 插件目录共存 | `.opencode/plugins/` 中其他插件文件不受影响,unwire 只删 `gitflow-guard.ts` |
| OPENCODE-D2 | 全局作用域 | `wire --client opencode --global` 把插件复制到 `~/.config/opencode/plugins/gitflow-guard.ts`,非交互需 `--yes`;守卫定位回退 PATH 上的 `gitflow-guard` |
| OPENCODE-D3 | 阻断语义 | 插件对非 bash/powershell 工具不拦(read/edit 直通);守卫 CLI 不可用(未安装)时 fail-open 放行 |

## 运行方式

```bash
# 冒烟(如沙箱受限,用 XDG_* 指向临时目录并复制 auth.json,见 TestResult/opencode.md 的沙箱处理)
opencode run "Reply with exactly: OK"
# 拦截用例
cd <受控仓库> && opencode run "Execute exactly: git push origin master"
# 放行用例
cd <受控仓库> && git checkout -q fix/verify-01 && opencode run "Execute exactly: git push origin fix/verify-01"
# 证据: 远端 ref 前后
git ls-remote origin master fix/verify-01
```

- 插件抛错的错误消息会在工具输出中回流;以会话输出 + 远端 ref 对比为证据。