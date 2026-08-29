# Codex 实机测试用例

> stdin hook:Codex 会话在项目目录内触发 Bash(matcher `^Bash$`)时,读 `.codex/hooks.json` 的 PreToolUse hook,以 **exit 0 + stdout JSON**(`permissionDecision`)表达拦截。
> 实现细节见 `docs/design/codex.md`;协议见 `.agents/hooks/references/codex.md`。
>
> ⛔ 本机当前**未安装 Codex**。安装并配置凭证后,按本文件执行;结果证据写入 `TestResult/codex.md`。

## 前置条件

- 本机 `codex` CLI 可用且已登录(`codex login`;凭证可用 API key/订阅)。
- 受控测试仓库(见总览)。
- wire 落位:`gitflow-guard wire --client codex --project --yes`(生成 `.codex/hooks.json`;相对路径 `bin/...` 依赖 Codex 进程 cwd,必要时在受控仓库放 `bin/` 软链或确认 cwd)。
- Codex 会话 cwd 必须在受控仓库内。

## 用例

### A. 真实拦截(deny)

| ID | 提示词 | 期望 | 断言要点 |
|---|---|---|---|
| CODEX-A1 | `git push origin master` | 工具调用被 hook deny | 会话/调试输出含 `permissionDecision: deny` 或模型报告失败;`origin/master` sha 不变 |
| CODEX-A2 | `git push --force origin master` | 拦截 | 同上 |
| CODEX-A3 | `git branch -D beta` | 拦截 | beta 本地未删 |
| CODEX-A4 | `git merge fix/verify-01`(在 master) | 拦截 | 无 merge 提交 |
| CODEX-A5 | `sudo git push origin master` | 拦截 | sudo 剥壳生效 |
| CODEX-A6 | `git checkout -B master`(在 fix 分支) | 拦截 | 分支未被强制重建 |

### B. 真实放行(allow)

| ID | 提示词 | 期望 | 断言要点 |
|---|---|---|---|
| CODEX-B1 | `git push origin fix/verify-01`(在 fix/verify-01) | 真实执行 | `origin/fix/verify-01` 被创建 |
| CODEX-B2 | `git merge beta`(在 master) | 真实执行 | 真实 merge 提交 |
| CODEX-B3 | `ls -la` 等非 git 命令 | 真实执行 | hook 快路径 exit 0 无输出 |
| CODEX-B4 | `git checkout -b task/new-feature` | 真实执行 | feature 分支创建成功 |

### C. 接线

| ID | 操作 | 期望 |
|---|---|---|
| CODEX-C1 | `gitflow-guard wire --client codex --project --yes` | `.codex/hooks.json` 出现 `^Bash$` + `check --platform codex` 条目 |
| CODEX-C2 | 再次执行 wire | 幂等 already |
| CODEX-C3 | `wire --client codex --project --unwire --yes` | 条目移除;B1 不再拦截 |
| CODEX-C4 | `gitflow-guard status` | 接线提示不含 codex |

### D. 平台特有

| ID | 用例 | 说明 |
|---|---|---|
| CODEX-D1 | wire 格式断言 | hook 实际输出必须**只含** `hookEventName`/`permissionDecision`/`permissionDecisionReason` 三个字段(Codex 拒绝未知字段);拦截时 exit 0 |
| CODEX-D2 | 多来源 hook 并存 | `.codex/hooks.json` 与全局 hook 同时存在时都执行;守卫条目不覆盖其他工具 hook |

## 运行方式

```bash
# 冒烟
codex exec "Reply with exactly: OK"
# 拦截用例(受控仓库)
cd <受控仓库> && codex exec "Execute exactly: git push origin master"
# 证据: 远端 ref 前后 + hook JSON(hook stdout 会回流到会话/日志;必要时临时在 hook 命令后加 tee 落盘取证,测完还原)
git ls-remote origin master
```

- Codex headless 子命令(`codex exec`)支持;hook 输出回流路径以实际版本日志为准,以远端 ref 对比为核心证据。