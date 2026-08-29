# TestResult — Codex 实机测试证据

## 测试信息

| 项 | 值 |
|---|---|
| 测试日期 | 2026-08-29 |
| 守卫版本 | 0.0.25(`bin/gitflow-guard.mjs` + `lib/` 复制进受控仓库) |
| 客户端 | Codex CLI 0.150.1(Homebrew / npm, model: deepseek-v4-flash-vision-exp, provider: custom) |
| 测试场 | `/tmp/e2e-codex-repo`(master=integration(`update: pr`), beta=preview, (fix|task)/*=feature; 裸远端 `/tmp/e2e-codex-origin.git`) |
| 挂载方式 | `gitflow-guard wire --client codex --project --yes` 生成 `.codex/hooks.json`(`^Bash$` matcher, `node bin/gitflow-guard.mjs check --platform codex`) |
| 执行模式 | `codex exec --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust "<指令>" < /dev/null`(cwd=受控仓库) |

## 结果汇总

| 用例 | 命令 | 结果 | 证据 |
|---|---|---|---|
| CODEX-C1 | wire 落位 | **PASS** | `.codex/hooks.json` 正确生成: `"matcher": "^Bash$"` + `check --platform codex` 条目 |
| CODEX-C2 | 再次执行 wire | **PASS** | 幂等跳过: 输出 `codex: hook already wired` |
| CODEX-C3 | wire --unwire | **PASS** | 条目精确移除: 输出 `codex: hook removed` |
| CODEX-C4 | gitflow-guard status | **PASS** | status 动态反映 wire 状态(unwire 时提示需 wire, wire 后不再提示) |
| CODEX-A1 | `git push origin master` | **PASS** | 拦截: `Command blocked by PreToolUse hook: [gitflow-guard] blocked: Protected branch "master" forbids direct push`; `origin/master` ref 未变(`b612947...`) |
| CODEX-A2 | `git push --force origin master` | **PASS** | 拦截: `Command blocked by PreToolUse hook: [gitflow-guard] blocked: Protected branch "master" forbids direct push (force)` |
| CODEX-A3 | `git branch -D beta` | **PASS** | 拦截: `Command blocked by PreToolUse hook: [gitflow-guard] blocked: Protected branch "beta" may not be deleted or force-pushed`; 本地 `beta` 分支未被删除 |
| CODEX-A4 | `git merge fix/verify-01`(在 master) | **PASS** | 拦截: `Command blocked by PreToolUse hook: [gitflow-guard] blocked: integration branch(master) forbids local merge of a feature: use PR/MR`; `master` 无 merge 提交 |
| CODEX-A5 | `sudo git push origin master` | **PASS** | 拦截: sudo 剥壳生效, `Command blocked by PreToolUse hook: [gitflow-guard] blocked: Protected branch "master" forbids direct push` |
| CODEX-A6 | `git checkout -B master`(在 fix 分支) | **PASS** | 拦截: `Command blocked by PreToolUse hook: [gitflow-guard] blocked: Protected branch "master" forbids direct ref updates`; 分支未被重建 |
| CODEX-B1 | `git push origin fix/verify-01`(在 fix 分支) | **PASS** | 放行: `exec /bin/zsh -lc 'git push origin fix/verify-01' succeeded`; 裸远端真实生成 `refs/heads/fix/verify-01` = `31335aa...` |
| CODEX-B2 | `git merge beta`(在 master) | **PASS** | 放行: `Already up to date.`, 命令正常执行 |
| CODEX-B3 | `ls -la` 等非 git 命令 | **PASS** | 放行: 快路径 exit 0 无输出, 正常列出目录 |
| CODEX-B4 | `git checkout -b task/new-feature` | **PASS** | 放行: 成功切换至新分支 `task/new-feature` |
| CODEX-D1 | wire 格式断言 | **PASS** | hook 严格输出 3 字段 JSON(`hookSpecificOutput`: `hookEventName`, `permissionDecision`, `permissionDecisionReason`), exit 0, 被 Codex 0.150.1 权威识别 |
| CODEX-D2 | 多来源 hook 并存 | **PASS** | `.codex/hooks.json` 中保留用户自定义 hook 条目(`hook-spy.sh`), 守卫条目并存且互不覆盖 |

## 真实 payload 摘录(codex-cli 0.150.1, Bash)

```json
{
  "session_id": "01a04cc8-456f-7b43-a3e1-56daf2ee5bd1",
  "turn_id": "01a04cc8-45ac-70b0-8571-fe2c5c6e1794",
  "transcript_path": "/Users/kean/.codex/sessions/2026/08/29/rollout-2026-08-29T17-09-48-01a04cc8-456f-7b43-a3e1-56daf2ee5bd1.jsonl",
  "cwd": "/private/tmp/e2e-codex-repo",
  "hook_event_name": "PreToolUse",
  "model": "deepseek-v4-flash-vision-exp",
  "permission_mode": "bypassPermissions",
  "tool_name": "Bash",
  "tool_input": {
    "command": "git push origin master"
  },
  "tool_use_id": "call_00_KQsEreYsC1nl4fqGfeVI0184"
}
```

## 证据细节

- **A1 拦截日志与会话输出**:
  ```text
  hook: PreToolUse
  2026-08-29T09:10:30.447107Z ERROR codex_core::tools::router: error=Command blocked by PreToolUse hook: [gitflow-guard] blocked: Protected branch "master" forbids direct push
  Next: Integration branch (master) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base master` / `glab mr create --target-branch master`.. Command: git push origin master
  hook: PreToolUse Blocked
  ```
  模型最终响应:
  > "The `git push origin master` command was blocked by a `PreToolUse` hook (`gitflow-guard`), not by git itself... `master` is configured as a protected integration branch in gitflow-guard.config.json, so direct pushes to it are forbidden."

- **远端 ref 保持证据(origin/master)**:
  ```text
  执行前: b6129475ba46e63e6798b8e3b8c4fa68ac57279b
  执行后: b6129475ba46e63e6798b8e3b8c4fa68ac57279b (未被推送 68ac8e2 污染)
  ```

- **B1 远端 feature ref 真实创建证据**:
  ```text
  创建后: refs/heads/fix/verify-01 = 31335aa4ceb38c6362658c2b2d9cf04d315c850b
  ```

## 结论

1. **Codex 协议与通道实机全通**: wire 落位、PreToolUse hook 触发、JSON 编码识别(`exit 0` + `permissionDecision: "deny"`)、远端零污染、放行执行均 100% 符合设计规格。
2. **无需代码修复**: 现有 `src/platform.ts`、`src/wire.ts` 对 Codex 的实现完全准确，真机测试全量通过（16/16 用例 PASS）。