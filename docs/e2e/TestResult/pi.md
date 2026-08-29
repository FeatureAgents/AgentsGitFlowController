# TestResult — Pi 实机测试证据

## 测试信息

| 项 | 值 |
|---|---|
| 测试日期 | 2026-08-29 |
| 守卫版本 | 0.0.21(当前 develop;gfguard-e2e `node_modules/agents-gitflow-guard` 以本仓库 lib/bin 现场替换挂载) |
| 客户端 | Pi 0.84.3(Homebrew) |
| 测试场 | `/Users/kean/Workspace/gfguard-e2e`(master=integration/beta=preview/(fix|task)/*=feature;裸远端 `/tmp/gfguard-e2e-origin.git`) |
| LLM provider/model | opencode-go / kimi-k2.6 |
| 挂载方式 | `npm i -D agents-gitflow-guard@^0.0.17`(语义版本未覆盖 0.0.21,故现场替换 node_modules)+ `.pi/settings.json` → `extensions/gitflow-guard.ts`(用户真实安装路径) |
| 执行模式 | `pi --mode json --print -t bash --no-session --thinking minimal`;沙箱复制配置 `PI_CODING_AGENT_DIR=/tmp/pi-test/agent` |
| 历史基线 | 2026-08-28 首测(Pi 0.84.3):拦截 4 用例 ✓、矩阵 108/135、真实放行流;本次为 0.0.21 重跑 |

## 结果汇总

| 用例 | 命令 | 结果 | 证据 |
|---|---|---|---|
| PI-A1 | `git push origin master` | **PASS** | 模型报告 "push was **blocked** by a pre-push hook (`gitflow-guard`)";`origin/master` 前后 sha 不变 |
| PI-A2 | `git branch -D beta` | **PASS** | 模型报告 "`git branch -D beta` was **blocked**";beta 分支未删(POST-STATE beta UNCHANGED ✓) |
| PI-A3 | `git add -A && git commit -m x && git push origin master` | **PASS** | 链式整段执行前拦截;模型报告 blocked;无提交产物、远端未动 |
| PI-B1 | `git push origin task/pi-e2e` | **PASS** | 首次跑 FAIL(`error: src refspec task/pi-e2e does not match any`)= 脚本前置分支缺失,非守卫缺陷;补建分支后重跑:远端真实创建 `refs/heads/task/pi-e2e` ✓ |
| PI-B2 | feature 全生命周期(realflow) | **PASS** | `gfguard-realflow.sh` 10 步全 OK:commit / amend / reset --soft / re-commit / merge master→feature / push -u / force push / rename / push renamed / remote delete / local delete |
| PI-D2 | fail-open(spawn 失败) | NOT RUN | 用例已列入 docs/e2e,本次未破坏性复测(破坏后需还原) |

## 证据细节

- 拦截文案(模型引出,即扩展 `{block:true, reason}` 的 reason 内容):
  `The push was blocked by a pre-push hook (gitflow-guard). Protected branch master forbids direct push... Push your changes to a feature branch first, then open a PR/MR: git push origin <feature>`
- 放行证据:
  ```
  `git push origin task/pi-e2e` succeeded:
  To /tmp/gfguard-e2e-origin.git
   * [new branch]      task/pi-e2e -> task/pi-e2e
  ```
  远端后:`refs/heads/beta / refs/heads/master / refs/heads/task/pi-e2e`
- 原始日志:`/tmp/e2e-pi-A.jsonl` ~ `/tmp/e2e-pi-D.jsonl`、`/tmp/e2e-pi-D2.jsonl`(临时目录,重启后可能失效;关键内容已摘录如上)。

## 发现与遗留

1. **脚本前置缺失**:`gfguard-pi-cases.sh` 用例 D 依赖本地已存在 `task/pi-e2e` 分支,脚本未自建。已重跑验证;建议脚本补建分支(随测试场维护,不属守卫发布物)。
2. **版本挂载方式**:`^0.0.17` 不解析到 0.0.21(0.0.x 的 caret 锁 patch),现场以 node_modules 替换挂载;正式复测建议直接 `npm i -D agents-gitflow-guard@0.0.21`。
3. **Pi 会话拆条风险**:2026-08-28 事故(拆条后普通 commit 放行、push 仍拦、远端零污染)为已知设计,复测未再现该路径。
4. 决策矩阵 135 用例(CLI 文本级)与扩展通道联动:本次未全量重跑矩阵(需 `GUARD_BIN` 指向被测 bin),下次守卫逻辑变更时按 docs/e2e/pi.md PI-D3 执行。