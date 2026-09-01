# CodeBuddy 实机测试用例

> stdin hook: CodeBuddy 在项目目录内触发 Bash 工具时, 读 `.codebuddy/settings.json` 的 PreToolUse hook, 以 **exit 2 + stderr** 拦截。
> 实现细节见 `docs/design/codebuddy.md`; 协议速查见 `.agents/hooks/references/codebuddy.md`。

## 前置条件

- CodeBuddy 客户端环境可用。
- 受控测试仓库(见总览)。
- wire 落位: `gitflow-guard wire --client codebuddy --project --yes`(生成 `.codebuddy/settings.json`)。
- `${CODEBUDDY_PROJECT_DIR}` 由 CodeBuddy 官方环境变量展开; 会话 cwd 在受控仓库内。

## 用例

### A. 真实拦截(deny)

| ID | 提示词(让模型执行) | 期望 | 断言要点 |
|---|---|---|---|
| CODEBUDDY-A1 | `git push origin master` | 命令被 hook 拦截, 模型报告失败 | 会话输出含 `blocked:`/`Protected branch`; `origin/master` sha 不变 |
| CODEBUDDY-A2 | `git push --force origin master` | 拦截 | 同上 |
| CODEBUDDY-A3 | `git branch -D beta` | 拦截 | beta 本地未删 |
| CODEBUDDY-A4 | `git merge fix/verify-01`(在 master) | 拦截 | 无 merge 提交产生 |
| CODEBUDDY-A5 | `git add -A && git commit -m x && git push origin master` | 链式整段拦截 | 无提交、远端未动 |
| CODEBUDDY-A6 | `sudo git push origin master` | 拦截 | sudo 剥壳生效 |
| CODEBUDDY-A7 | `git checkout -B master`(在 fix 分支) | 拦截 | 分支未被强制重建 |

### B. 真实放行(allow)

| ID | 提示词 | 期望 | 断言要点 |
|---|---|---|---|
| CODEBUDDY-B1 | `git push origin fix/verify-01`(在 fix/verify-01) | 真实执行 | `origin/fix/verify-01` 被创建 |
| CODEBUDDY-B2 | `git merge beta`(在 master) | 真实执行 | 真实 merge 提交 |
| CODEBUDDY-B3 | `npm test` 或 `ls -la` | 真实执行 | 非 git 命令直通 |
| CODEBUDDY-B4 | `git checkout -b task/new-feature` | 真实执行 | feature 分支创建成功 |

### C. 接线

| ID | 操作 | 期望 |
|---|---|---|
| CODEBUDDY-C1 | `gitflow-guard wire --client codebuddy --project --yes` | `.codebuddy/settings.json` 出现 `"matcher": "^Bash$"` + `check --platform codebuddy` 条目 |
| CODEBUDDY-C2 | 再次执行 wire | 输出 already 存在, 文件幂等不重复 |
| CODEBUDDY-C3 | `gitflow-guard wire --client codebuddy --project --unwire --yes` | 条目被移除 |
| CODEBUDDY-C4 | `gitflow-guard status`(wired 后) | 接线提示不再包含 codebuddy |
