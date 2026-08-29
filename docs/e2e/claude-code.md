# Claude Code 实机测试用例

> stdin hook:`claude -p`(headless)或交互会话在项目目录内触发 Bash 工具时,Claude Code 读 `.claude/settings.json` 的 PreToolUse hook,以 **exit 2 + stderr** 拦截。
> 实现细节见 `docs/design/claude-code.md`;协议见 `.agents/hooks/references/claude-code.md`。

## 前置条件

- 本机 `claude` CLI 可用且已登录(凭证:API key / 代理均可,以冒烟 `claude -p "Reply with exactly: OK"` 通过为准)。
- 受控测试仓库(见总览)。
- wire 落位:`gitflow-guard wire --client claude --project --yes`(可在受控仓库内执行,生成 `.claude/settings.json`)。
- headless 会话须授予 Bash 工具权限(`--allowedTools "Bash(npm:*)"` 之类按需;核心用例直接用 `Bash`),否则模型不会真实执行 git 命令。
- `${CLAUDE_PROJECT_DIR}` 由 Claude Code 展开;会话 cwd 必须在受控仓库内(cwd 决定守卫定位的仓库)。

## 用例

### A. 真实拦截(deny)

| ID | 提示词(让模型执行) | 期望 | 断言要点 |
|---|---|---|---|
| CLAUDE-A1 | `git push origin master` | 命令被 hook 拦截,模型报告失败 | 会话输出含 `blocked:`/`Protected branch`;`origin/master` sha 不变 |
| CLAUDE-A2 | `git push --force origin master` | 拦截 | 同上 |
| CLAUDE-A3 | `git branch -D beta` | 拦截 | beta 本地未删 |
| CLAUDE-A4 | `git merge fix/verify-01`(在 master) | 拦截 | 无 merge 提交产生 |
| CLAUDE-A5 | `git add -A && git commit -m x && git push origin master` | 链式整段拦截 | 无提交、远端未动 |
| CLAUDE-A6 | `sudo git push origin master` | 拦截 | sudo 剥壳生效 |
| CLAUDE-A7 | `git checkout -B master`(在 fix 分支) | 拦截 | 分支未被强制重建 |

### B. 真实放行(allow)

| ID | 提示词 | 期望 | 断言要点 |
|---|---|---|---|
| CLAUDE-B1 | `git push origin fix/verify-01`(在 fix/verify-01) | 真实执行 | `origin/fix/verify-01` 被创建 |
| CLAUDE-B2 | `git merge beta`(在 master) | 真实执行 | 真实 merge 提交 |
| CLAUDE-B3 | `npm test` 或 `ls -la` | 真实执行 | 非 git 命令直通 |
| CLAUDE-B4 | `git branch -b 新建 feature 分支`(如 `git checkout -b task/new-feature`) | 真实执行 | feature 分支创建成功 |

### C. 接线

| ID | 操作 | 期望 |
|---|---|---|
| CLAUDE-C1 | `gitflow-guard wire --client claude --project --yes` | `.claude/settings.json` 出现 `"matcher": "Bash"` + `check --platform claude` 条目 |
| CLAUDE-C2 | 再次执行 wire | 输出 already 存在,文件幂等不重复 |
| CLAUDE-C3 | `gitflow-guard wire --client claude --project --unwire --yes` | 条目被移除;再跑 B1 用例不再拦截(feature push 成功) |
| CLAUDE-C4 | `gitflow-guard status`(wired 后) | 接线提示不再包含 claude |

### D. 平台特有

| ID | 用例 | 说明 |
|---|---|---|
| CLAUDE-D1 | PostToolUse 不透传拦截 | 守卫只拦 PreToolUse;PostToolUse payload 解析为 event=post 后仍放行(单测覆盖,实机仅冒烟) |
| CLAUDE-D2 | 全局 vs 项目作用域 | `wire --global` 需 `--yes`;写入 `~/.claude/settings.json` 前确认 |

## 运行方式

```bash
# 冒烟
claude -p "Reply with exactly: OK"
# 拦截用例(从受控仓库目录启动;若提示词被模型改写,用 --allowedTools Bash 限制)
cd <受控仓库> && claude -p "Execute exactly: git push origin master" --allowedTools "Bash" --max-turns 3
# 放行用例
cd <受控仓库> && git checkout -q fix/verify-01 && claude -p "Execute exactly: git push origin fix/verify-01" --allowedTools "Bash" --max-turns 3
# 证据: 对比远端 ref
git ls-remote origin master fix/verify-01
```

- 每组用例前记录远端 ref;用例后对比。
- headless 输出即证据摘录(含 hook 的 stderr 回流)。