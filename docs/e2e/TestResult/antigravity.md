# TestResult — Antigravity 实机测试证据

## 测试信息

| 项 | 值 |
|---|---|
| 测试日期 | 2026-08-29(协议层链路)→ **2026-08-29(真机会话核验完成)** |
| 守卫版本 | 0.0.21(绝对路径挂载 `bin/gitflow-guard.mjs`) |
| 客户端 | Antigravity CLI(agy 1.1.22;model: gemini-3.7-flash-high) |
| 测试场 | `/tmp/e2e-antigravity-repo`(master=integration/beta=preview/(fix|task)/*=feature + 裸远端 `/tmp/e2e-origin-antigravity.git`) |
| 挂载方式 | `gitflow-guard wire --client antigravity --project --yes` 生成 `.agents/hooks.json`;hook 命令**经真机核验须为绝对路径**(见 AGY-D2 发现) |
| 会话模式 | `agy --add-dir <repo> --dangerously-skip-permissions --print="..."`(workspace 必须显式加入仓库;`--print` 取 prompt 参数) |

## 结果汇总(真机会话)

| 用例 | 命令 | 结果 | 证据 |
|---|---|---|---|
| AGY-C1 | wire 落位 | **PASS** | `.agents/hooks.json` 正确生成(experimental 提示输出) |
| AGY-A1 | `git push origin master` | **PASS** | 会话输出 `tool call denied by pre-tool hook: [gitflow-guard] blocked: Protected branch "master" forbids direct push / Next...`;`origin/master` 前后同为 `799a68ff...` 未动 |
| AGY-A7 | `git checkout -B master` | **PASS** | `tool call denied by pre-tool hook`(ref-update 面文案);本地 HEAD 未变(仍 `799a68ff...`) |
| AGY-B1 | `git push origin fix/verify-01` | **PASS** | 真实执行:裸远端出现 `refs/heads/fix/verify-01` = `799a68ff...` |
| AGY-D1 | stdout 顶层形状 | **核验通过** | `{decision:"deny", reason}` 顶层直出被 agy 识别并阻断工具("tool call denied by pre-tool hook") |
| AGY-D2 | hook 进程 cwd | **核验通过(有差异)** | 实测 hook 进程 cwd = **hook 配置文件所在目录**(`.agents/`);相对 `node bin/...` 路径解析为 `.agents/bin/...` → MODULE_NOT_FOUND → 必须绝对路径(**wire 模板需修**) |
| AGY-D3 | payload envelope | **核验通过(有差异)** | 抓取真实 payload:`toolCall.args.CommandLine` ✅ 与实现一致;但 **cwd 在 `toolCall.args.Cwd`(嵌套大写 C),不在 payload 顶层** —— 当前实现取顶层 `j.cwd` 拿不到,守卫靠 hook 进程 cwd 向上找仓库兜底。**全局 hook 配置(cwd 不在仓库祖先链)时会定位失败放行,需修 `extractHookPayload`** |
| AGY-D4 | decision:deny 真实阻断 | **核验通过** | deny 后命令真实未执行(远端 ref 未动) |

## 真实 payload 摘录(agy 1.1.22,run_command)

```json
{
  "artifactDirectoryPath": ".../brain/<id>",
  "conversationId": "...",
  "modelName": "gemini-3.7-flash-high",
  "stepIdx": 2,
  "toolCall": {
    "args": {
      "CommandLine": "git push origin master",
      "Cwd": "/tmp/e2e-antigravity-repo",
      "WaitMsBeforeAsync": 10000,
      "toolAction": "Running git push",
      "toolSummary": "Git push"
    },
    "name": "run_command"
  },
  "transcriptPath": "...",
  "workspacePaths": ["/tmp/e2e-antigravity-repo"]
}
```

## 发现与遗留(需修复,另开 PR)

1. **`wire` 模板相对路径失效**:`COMMANDS.antigravity = node bin/gitflow-guard.mjs ...` 在 agy 上 hook 进程 cwd 为 `.agents/` → 相对路径解析错。修法候选:模板改为支持路径变量或绝对路径指引;README/reference 同步。
2. **`extractHookPayload` antigravity 分支应取 `toolCall.args.Cwd`**:当前取顶层 `j.cwd`(真实 payload 无此字段)——仓库定位依赖兜底链,全局 hook 场景会静默放行。`platform.ts` 一行级修复 + 单测与复测矩阵 E 节补用例。
3. **核验后定稿条件已满足**:AGY-D1/D4 行为符合设计,真机拦截/放行全通——上述两点修复后可摘除"实验支持"标注。
4. 会话模式注记:`--add-dir` 显式加入 workspace 是前置;`--print` 的 prompt 须紧跟标志(参数顺序敏感)。

## 修复(2026-08-29,feature/antigravity-opencode-fix)

- **AGY-D2(已修)**:`wire` antigravity 项目级命令改为**仓库根绝对路径**(`node <root>/bin/gitflow-guard.mjs check --platform antigravity`);全局落位用 PATH 上的 `gitflow-guard`。dogfood `.agents/hooks.json`、`references/antigravity.md`、README 双语同步;wire/cli 单测与矩阵 E 节补落位断言。
- **AGY-D3(已修)**:`extractHookPayload` antigravity 分支改为取 **`toolCall.args.Cwd`**(嵌套大写 C,顶层无 cwd 字段);`platform.spec.ts` 补真实 payload 用例,矩阵 E 节 payload 换用真机形状。
- 修复后按结论 3 **摘除「实验支持」标注**(README 注释与 wire 提示)。

## 修复后复测(2026-08-29,真机会话,agy 1.1.22 / gemini-3.7-flash-high)

| 用例 | 命令 | 结果 | 证据 |
|---|---|---|---|
| AGY-A1 | `git push origin master` | **PASS** | 会话输出「命令被 `gitflow-guard` 钩子拦截,原因:受保护分支 `master` 禁止直接推送到远程分支」+ 建议 PR/MR 流程;`origin/master` 前后同为 `6c0d022...` 未动 |
| AGY-C1 | wire 落位(修复后) | **PASS** | wire 产物为**绝对路径**命令 `node /private/tmp/e2e-agy-repo/bin/gitflow-guard.mjs check --platform antigravity`(AGY-D2 修复面),真机加载并生效 |
| AGY-D3' | 全局 hook 场景(cwd 定位差异) | PASS(矩阵级) | verify:matrix E 节新增「hook 进程 cwd 在仓库外 + payload 仅凭 toolCall.args.Cwd 定位」用例,旧实现会静默放行、新实现正常拦截——防回归断言成立 |

> 注:会话期间 agy 向 `~/.gemini/antigravity-cli/` 写缓存报 operation not permitted(沙箱限制),拦截链路不受影响。