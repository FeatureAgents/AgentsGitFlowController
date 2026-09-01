# Cursor 实机测试用例

> stdin hook: Cursor 在项目目录内执行 shell 命令时, 读 `.cursor/hooks.json` 的 `beforeShellExecution` hook, 以 **exit 0 + stdout JSON** (`permission: "deny"`) 拦截。
> 协议速查见 `.agents/hooks/references/cursor.md`。

## 前置条件

- Cursor IDE / Headless CLI 环境可用。
- 受控测试仓库(见总览)。
- wire 落位: `gitflow-guard wire --client cursor --project --yes` (生成 `.cursor/hooks.json`)。
- 会话 cwd 在受控仓库内。

## 用例

### A. 真实拦截(deny)

| ID | 提示词(让模型执行) | 期望 | 断言要点 |
|---|---|---|---|
| CURSOR-A1 | `git push origin master` | 命令被 hook 拦截, 模型报告失败 | stdout 含 `{"permission":"deny",...}`; `origin/master` sha 不变 |
| CURSOR-A2 | `git push --force origin master` | 拦截 | 同上 |
| CURSOR-A3 | `git branch -D beta` | 拦截 | beta 本地未删 |
| CURSOR-A4 | `git merge fix/verify-01`(在 master) | 拦截 | 无 merge 提交产生 |
| CURSOR-A5 | `git add -A && git commit -m x && git push origin master` | 链式整段拦截 | 无提交、远端未动 |
| CURSOR-A6 | `sudo git push origin master` | 拦截 | sudo 剥壳生效 |
| CURSOR-A7 | `git checkout -B master`(在 fix 分支) | 拦截 | 分支未被强制重建 |

### B. 真实放行(allow)

| ID | 提示词 | 期望 | 断言要点 |
|---|---|---|---|
| CURSOR-B1 | `git push origin fix/verify-01`(在 fix/verify-01) | 真实执行 | `origin/fix/verify-01` 被创建 |
| CURSOR-B2 | `git merge beta`(在 master) | 真实执行 | 真实 merge 提交 |
| CURSOR-B3 | `npm test` 或 `ls -la` | 真实执行 | 非 git 命令直通, exit 0 无输出 |
| CURSOR-B4 | `git checkout -b task/new-feature` | 真实执行 | feature 分支创建成功 |

### C. 接线

| ID | 操作 | 期望 |
|---|---|---|
| CURSOR-C1 | `gitflow-guard wire --client cursor --project --yes` | `.cursor/hooks.json` 出现 `beforeShellExecution` + `check --platform cursor` 条目 |
| CURSOR-C2 | 再次执行 wire | 输出 already 存在, 文件幂等不重复 |
| CURSOR-C3 | `gitflow-guard wire --client cursor --project --unwire --yes` | 条目被移除 |
| CURSOR-C4 | `gitflow-guard status`(wired 后) | 接线提示不再包含 cursor |
