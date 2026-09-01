# ZCode 实机测试用例

> stdin hook: ZCode 在项目目录内触发 Bash 工具时, 读 `.zcode/config.json` 的 `hooks.events.PreToolUse` hook, 以 **exit 2 + stderr** 拦截。
> 注意: ZCode 配置文件必须显式包含 `hooks.enabled: true`。
> 实现细节见 `docs/design/zcode.md`; 协议速查见 `.agents/hooks/references/zcode.md`。

## 前置条件

- ZCode 客户端环境可用。
- 受控测试仓库(见总览)。
- wire 落位: `gitflow-guard wire --client zcode --project --yes`(生成 `.zcode/config.json`)。
- `${ZCODE_PROJECT_DIR}` 由 ZCode 官方环境变量展开; 会话 cwd 在受控仓库内。

## 用例

### A. 真实拦截(deny)

| ID | 提示词(让模型执行) | 期望 | 断言要点 |
|---|---|---|---|
| ZCODE-A1 | `git push origin master` | 命令被 hook 拦截, 模型报告失败 | 会话输出含 `blocked:`/`Protected branch`; `origin/master` sha 不变 |
| ZCODE-A2 | `git push --force origin master` | 拦截 | 同上 |
| ZCODE-A3 | `git branch -D beta` | 拦截 | beta 本地未删 |
| ZCODE-A4 | `git merge fix/verify-01`(在 master) | 拦截 | 无 merge 提交产生 |
| ZCODE-A5 | `git add -A && git commit -m x && git push origin master` | 链式整段拦截 | 无提交、远端未动 |
| ZCODE-A6 | `sudo git push origin master` | 拦截 | sudo 剥壳生效 |
| ZCODE-A7 | `git checkout -B master`(在 fix 分支) | 拦截 | 分支未被强制重建 |

### B. 真实放行(allow)

| ID | 提示词 | 期望 | 断言要点 |
|---|---|---|---|
| ZCODE-B1 | `git push origin fix/verify-01`(在 fix/verify-01) | 真实执行 | `origin/fix/verify-01` 被创建 |
| ZCODE-B2 | `git merge beta`(在 master) | 真实执行 | 真实 merge 提交 |
| ZCODE-B3 | `npm test` 或 `ls -la` | 真实执行 | 非 git 命令直通 |
| ZCODE-B4 | `git checkout -b task/new-feature` | 真实执行 | feature 分支创建成功 |

### C. 接线

| ID | 操作 | 期望 |
|---|---|---|
| ZCODE-C1 | `gitflow-guard wire --client zcode --project --yes` | `.zcode/config.json` 出现 `hooks.enabled: true` + `hooks.events.PreToolUse` 条目 |
| ZCODE-C2 | 再次执行 wire | 输出 already 存在, 文件幂等不重复 |
| ZCODE-C3 | `gitflow-guard wire --client zcode --project --unwire --yes` | 条目被移除 |
| ZCODE-C4 | `gitflow-guard status`(wired 后) | 接线提示不再包含 zcode |
