# Pi 实机测试用例

> 进程内扩展:`.pi/settings.json` → `extensions/gitflow-guard.ts`(jiti 加载)→ 监听官方 `tool_call` 事件,拒绝以返回值 `{block:true, reason}` 表达。
> 实现细节见 `docs/design/pi.md`;协议见 `.agents/hooks/references/pi.md`。
> 测试脚本见本仓库 `scripts/test-git-matrix.sh` / `scripts/test-git-realflow.sh` / `scripts/test-pi-extension.sh`,本文件用例与之一一对应。

## 前置条件

- 本机 `pi` CLI 可用且已登录(`~/.pi/agent/auth.json`;版本记录于 TestResult)。
- 受控测试仓库: 由 `npm run test:pi` 自动在 `/tmp/` 创建自包含沙箱(master=integration / beta=preview / fix/*=feature; 裸远端自动管理)。
- 守卫扩展由测试脚本自动挂载(`.pi/settings.json` + `pi/gitflow-guard.ts`)。
- `GITFLOW_GUARD_BIN` 自动指向本仓库构建产物 `bin/gitflow-guard.mjs`。
- 沙箱环境(如 DSH 会话内):脚本已处理——`PI_CODING_AGENT_DIR=/tmp/pi-test/agent`,从 `~/.pi/agent/` 复制 settings/auth 并设 `defaultProjectTrust = "always"`。
- Pi 执行策略:无头 JSON 模式 + `-t bash --no-session --thinking minimal` + 收紧提示词(一次一条命令,防拆条/循环;见 2026-08-28 事故记录)。

## 用例

### A. 真实拦截(deny)——gfguard-pi-cases.sh 用例 A-C

| ID | 命令 | 前置 | 期望 | 断言要点 |
|---|---|---|---|---|
| PI-A1 | `git push origin master` | master | `{block:true}` | origin/master 未动(脚本比对 BEFORE_M/AFTER) |
| PI-A2 | `git branch -D beta` | master | `{block:true}` | beta 未删(脚本比对分支存在性) |
| PI-A3 | `git add -A && git commit -m x && git push origin master` | master | 整段执行前拦截 | 无提交、origin/master 未动 |
| PI-A4 | `git push --force origin master` | master | `{block:true}` | origin/master 未动 |
| PI-A5 | `sudo git push origin master` | master | `{block:true}` | 0.0.19 修复面:sudo 剥壳 |
| PI-A6 | `git checkout -B master` | fix 分支 | `{block:true}` | 0.0.19 修复面:强制重建拒绝 |
| PI-A7 | 受保护分支上 `git cherry-pick <sha>` | master | `{block:true}` | 0.0.19 修复面:HEAD 不变 |

### B. 真实放行(allow)——gfguard-pi-cases.sh 用例 D + gfguard-realflow.sh

| ID | 命令 | 前置 | 期望 | 断言要点 |
|---|---|---|---|---|
| PI-B1 | `git push origin task/pi-e2e` | task/pi-e2e | 真实执行 | 远端真实创建(脚本比对 AFTER) |
| PI-B2 | feature 全生命周期(建/改/amend/reset/merge master/push -u/force push/rename/删除) | 见脚本 | 全部真实执行 | 走通 `gfguard-realflow.sh`(含 `merge master` 受保护合入 feature、feature 上 `commit --amend`/`reset --soft`/force push) |
| PI-B3 | 受保护分支间 `git merge master`(在 beta) | beta | 真实执行 | 设计内:preview 可合入 integration |
| PI-B4 | tags-only `git push --tags origin` | master | 真实执行 | 设计豁免 |
| PI-B5 | 非 git 命令(如 `npm test`) | 任意 | 真实执行 | 扩展快路径不 spawn |

### C. 接线(进程内客户端,无 hook 文件)

| ID | 操作 | 期望 |
|---|---|---|
| PI-C1 | `gitflow-guard wire --client pi` | 仅打印引导(拷 `pi/gitflow-guard.ts` + `.pi/settings.json`),不写文件 |
| PI-C2 | `.pi/settings.json` 已声明扩展(测试场现状) | 扩展随 Pi 会话加载,拦截生效 |

### D. 平台特有

| ID | 用例 | 说明 |
|---|---|---|
| PI-D1 | 拆条执行 | 模型把链式命令拆成单条时,`git commit -m x`(受保护分支普通 commit)按设计放行、`git push origin master` 仍被拦(2026-08-28 事故复盘;证据:事故记录 + 重跑确认 push 侧拦截) |
| PI-D2 | fail-open | 令 `GITFLOW_GUARD_BIN` 指向不存在路径(spawn 失败)→ 命令放行(降级不阻断);恢复后拦截恢复 |
| PI-D3 | 决策矩阵联动 | `gfguard-matrix.sh`(135 用例 CLI 文本级)变动的命令族须在 Pi 扩展通道至少各抽 1 条真机复核 |

## 运行方式

```bash
# 决策矩阵(135 用例,CLI 级)
npm run test:git-matrix
# 真实拦截(Pi 扩展通道,用例 A-D)
npm run test:pi
# 真实放行流(feature 全生命周期)
npm run test:realflow
```

- 每次守卫逻辑变更后:重跑矩阵 + 抽取受影响命令族真机复核(PI-D3);结果记入 TestResult/pi.md。