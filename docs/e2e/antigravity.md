# Antigravity 实机测试用例

> stdin hook:Antigravity(Google 编码 agent,2.0 已并入 Gemini CLI)触发 `run_command` 的 PreToolUse 时,读 `.agents/hooks.json`,以 **exit 0 + stdout `{decision:"deny", reason}`** 表达拦截。
> 实现细节见 `docs/design/antigravity.md`;协议见 `.agents/hooks/references/antigravity.md`。
>
> ⚠️ 该平台为**实验支持**:wire 格式依据官方文档实现,真机核验后定稿——**本文件即核验入口**。
> ⛔ 本机当前**未安装** Antigravity。安装后按本文件执行,结果写入 `TestResult/antigravity.md`。

## 前置条件

- 本机 `antigravity`(或 `gemini`)CLI 可用且已登录;冒烟通过为准。
- 受控测试仓库(见总览)。
- wire 落位:`gitflow-guard wire --client antigravity --project --yes`(生成 `.agents/hooks.json`;相对路径 `bin/...`)。
- **核验重点**:官方文档未注明 hook 的 cwd/环境变量展开——真机确认 hook 进程 cwd 与受控仓库的对应关系,若 `bin/` 相对路径解析失败,改用绝对路径并记录到 TestResult。

## 用例

### A. 真实拦截(deny)

| ID | 提示词 | 期望 | 断言要点 |
|---|---|---|---|
| AGY-A1 | `git push origin master` | 工具调用被 hook deny | 会话报告 denied/拒绝;`origin/master` sha 不变 |
| AGY-A2 | `git push --force origin master` | 拦截 | 同上 |
| AGY-A3 | `git branch -D beta` | 拦截 | beta 本地未删 |
| AGY-A4 | `git merge fix/verify-01`(在 master) | 拦截 | 无 merge 提交 |
| AGY-A5 | `sudo git push origin master` | 拦截 | sudo 剥壳生效 |
| AGY-A6 | `git checkout -B master`(在 fix 分支) | 拦截 | 分支未被强制重建 |

### B. 真实放行(allow)

| ID | 提示词 | 期望 | 断言要点 |
|---|---|---|---|
| AGY-B1 | `git push origin fix/verify-01`(在 fix/verify-01) | 真实执行 | `origin/fix/verify-01` 被创建 |
| AGY-B2 | `git merge beta`(在 master) | 真实执行 | 真实 merge 提交 |
| AGY-B3 | `ls -la` 等非 git 命令 | 真实执行 | hook 快路径 exit 0 无输出 |
| AGY-B4 | `git checkout -b task/new-feature` | 真实执行 | feature 分支创建成功 |

### C. 接线

| ID | 操作 | 期望 |
|---|---|---|
| AGY-C1 | `gitflow-guard wire --client antigravity --project --yes` | 输出实验支持提示(experimental);`.agents/hooks.json` 出现 `gitflow-guard.PreToolUse` + `matcher: run_command` + `check --platform antigravity` |
| AGY-C2 | 再次执行 wire | 幂等 already |
| AGY-C3 | `wire --client antigravity --project --unwire --yes` | `gitflow-guard` 键被移除 |
| AGY-C4 | `gitflow-guard status` | 接线提示不含 antigravity |

### D. 平台特有(核验定稿点)

| ID | 用例 | 说明 |
|---|---|---|
| AGY-D1 | stdout 顶层形状 | hook 输出必须顶层 `{decision, reason}`(包裹 hookSpecificOutput 会校验失败);拦截时 exit 0 |
| AGY-D2 | cwd/相对路径 | 确认 hook 进程 cwd;`node bin/gitflow-guard.mjs` 是否可解析;如有偏差**记录并回写 design/wire 默认值** |
| AGY-D3 | payload envelope | 确认 stdin 形状 `toolCall.args.CommandLine` 与真实一致;若有出入更新 `platform.ts` 解析并补矩阵用例 |
| AGY-D4 | decision 取值 | 确认 `deny` 值被客户端识别(官方无 "block" 值) |

## 运行方式

```bash
# 冒烟
antigravity run "Reply with exactly: OK"   # 以实际 CLI 为准
# 拦截用例
cd <受控仓库> && antigravity run "Execute exactly: git push origin master"
# 证据: 远端 ref 前后 + hook stdout(stdout 回流路径以实际版本为准)
git ls-remote origin master
```

- 核验发现的任何协议偏差:**先记录到 TestResult,再决定是否改实现**(实验支持 → 定稿流程)。