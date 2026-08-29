# TestResult — Claude Code 实机测试证据

## 测试信息

| 项 | 值 |
|---|---|
| 测试日期 | 2026-08-29 |
| 守卫版本 | 0.0.21(当前 develop,`bin/gitflow-guard.mjs` + `lib/` 复制进受控仓库) |
| 客户端 | Claude Code 2.1.224(Homebrew;代理 API key 方式登录) |
| 测试场 | `/tmp/e2e-claude-repo`(master=integration(update:pr)/beta=preview/(fix|task)/*=feature;裸远端 `/tmp/e2e-origin-claude.git`;config 文件置于仓库根) |
| 挂载方式 | `gitflow-guard wire --client claude --project --yes` 生成 `.claude/settings.json`;hook 命令 `node ${CLAUDE_PROJECT_DIR}/bin/gitflow-guard.mjs check --platform claude`(受控仓库内复制 bin/+lib/) |
| 执行模式 | `claude -p "<指令>" --allowedTools "Bash" --max-turns 2`(cwd=受控仓库) |

## 结果汇总

| 用例 | 命令 | 结果 | 证据 |
|---|---|---|---|
| CLAUDE-C1 | wire 落位 | **PASS** | `.claude/settings.json` 正确生成:`"matcher": "Bash"` + `check --platform claude` 条目 |
| CLAUDE-A1 | `git push origin master` | **PASS** | 会话报告 "The push was blocked by the pre-push hook";hook stderr 完整文案;`origin/master` 前后同为 `5a82fd01...` 未动 |
| CLAUDE-B1 | `git push origin fix/verify-01`(fix/verify-01 分支) | **PASS** | 会话报告 "Push succeeded: fix/verify-01 was created on origin";远端真实出现 `refs/heads/fix/verify-01` |
| CLAUDE-A7 | `git checkout -B master`(master 上) | **PASS** | 会话报告 "The command was blocked by the pre-tool hook and did not run";本地 master ref 未动(HEAD 仍 `5a82fd01...`);文案为 ref-update 面("forbids direct ref updates (update-ref / symbolic-ref / branch -m|-f / checkout -B)") |

## 证据细节

- A1 拦截输出(会话原样):
  ```
  PreToolUse:Bash hook error: [node ${CLAUDE_PROJECT_DIR}/bin/gitflow-guard.mjs check --platform claude]:
  [gitflow-guard] blocked: Protected branch "master" forbids direct push
  Next: Integration branch (master) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base master` / `glab mr create --target-branch master`.
  ```
  "No push occurred; the working tree and remote are unchanged."
- A7 拦截输出:同构文案(source 为 ref-update 面),命令未执行。
- 远端 ref 证据:
  ```
  deny 前: 5a82fd01...(refs/heads/master)
  放行后: 5a82fd01...(refs/heads/fix/verify-01)  ← 真实创建
  ```

## 发现与遗留

1. **Claude Code 通道完整可用**:wire 产物真实生效;exit-2 编码、stderr 文案展示、远端零污染均符合设计。
2. 本次覆盖 A1/B1/A7(+C1);A2–A6(force push/分支删除/merge/链式/sudo)未逐条跑——与 A1/A7 同通道同内核,建议逻辑变更后按 docs/e2e/claude-code.md 全量补跑。
3. headless 模式下模型偶发改写命令(如自动加 `--set-upstream`),用例断言以远端 ref 前后为准,不依赖模型措辞。