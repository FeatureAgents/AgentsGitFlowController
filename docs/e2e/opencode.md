# OpenCode 实机测试用例

> stdin hook:OpenCode 会话触发 `tool.before.bash` 时,读 `.opencode/hook/hooks.yaml`(YAML,语义 id `gitflow-guard`),以 **exit 2 + stderr** 拦截。
> 实现细节见 `docs/design/opencode.md`;协议见 `.agents/hooks/references/opencode.md`。

## 前置条件

- 本机 `opencode` CLI 可用且已登录(`opencode auth`;冒烟 `opencode run "Reply with exactly: OK"` 通过为准)。
- 受控测试仓库(见总览)。
- wire 落位:`gitflow-guard wire --client opencode --project --yes`(生成 `.opencode/hook/hooks.yaml`)。
- `$OPENCODE_PROJECT_DIR` 由 OpenCode 展开;会话 cwd 必须在受控仓库内。

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
| OPENCODE-C1 | `gitflow-guard wire --client opencode --project --yes` | `hooks.yaml` 出现 `id: gitflow-guard` + `tool.before.bash` + `check --platform opencode` |
| OPENCODE-C2 | 再次执行 wire | 按语义 id 判重,幂等 already |
| OPENCODE-C3 | `wire --client opencode --project --unwire --yes` | gitflow-guard 块被移除;若列表空则连顶层 `hooks:` 清理;B1 恢复放行 |
| OPENCODE-C4 | `gitflow-guard status` | 接线提示不含 opencode |

### D. 平台特有

| ID | 用例 | 说明 |
|---|---|---|
| OPENCODE-D1 | YAML 语义 id 判重 | hooks.yaml 中的其他 `- id:` 条目(custom guard 等)不受影响,只操作 `gitflow-guard` |
| OPENCODE-D2 | 全局作用域 | `wire --client opencode --global` 写 `~/.config/opencode/hook/hooks.yaml`,非交互需 `--yes` |

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

- OpenCode hook 的 stderr 会在工具输出中回流;以会话输出 + 远端 ref 对比为证据。