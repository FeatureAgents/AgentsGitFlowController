# E2E 实机测试总览

> 本目录按客户端分文件,记录各平台**实机测试用例**(真实客户端进程 + 真实 hook 通道 + 真实 git 操作)。
> 用例执行与结果证据规范见 `TestResult/`(每个客户端一个证据文件)。
> 基础决策矩阵与生命周期放行流见本仓库 `scripts/test-git-matrix.sh`(135 项决策矩阵)与 `scripts/test-git-realflow.sh`。

## 客户端用例文件

| 客户端 | 接入形态 | 用例文件 | 本机状态 |
|---|---|---|---|
| DSH | 进程内插件 | `dsh.md` | ✅ 已实测(0.0.21,2026-08-29) |
| Claude Code | stdin hook (exit 2) | `claude-code.md` | ✅ 已安装 2.1.224 |
| Codex | stdin hook (exit 0+JSON) | `codex.md` | ✅ 已实测(codex-cli 0.150.1, 2026-08-29) |
| OpenCode | stdin hook (exit 2) | `opencode.md` | ✅ 已安装 1.18.15 |
| Antigravity | stdin hook (exit 0+{decision}) | `antigravity.md` | ✅ 已实测(agy 1.1.22,2026-08-29);拦截/放行全通,2 处协议差异待修复 |
| CodeBuddy | stdin hook (exit 2) | `codebuddy.md` | 📝 用例已就绪 |
| ZCode | stdin hook (exit 2) | `zcode.md` | 📝 用例已就绪 |
| Pi | 进程内扩展 | `pi.md` | ✅ 已安装 0.84.3 |

## 统一前置条件(所有客户端)

1. **守卫二进制为当前 develop 构建产物**:`npm run build` 后 `bin/gitflow-guard.mjs`(或安装包 `node_modules/.bin/gitflow-guard`)。
2. **受控测试仓库**:采用标准分支角色划分:
   - `master` = integration(`update: pr`,禁直推)、`beta` = preview、`(fix|task)/<名>` = feature;
   - 配置 `gitflow-guard.config.json`;
   - 本地裸远端 `/tmp/e2e-<client>-origin.git`。
3. **远端 ref 前后对比**是核心证据:拦截用例断言远端受保护 ref(origin/master 等)在命令后 sha 不变。
4. **快照证据**:每个用例记录输出摘录 / 会话日志 / 审计条目(`gitflow-guard audit` 或 `~/.local/state/gitflow-guard/repos/*/audit.jsonl`)。
5. 沙箱/受限环境(如 DSH 会话内)执行客户端时,把其配置/数据目录指到临时路径并复制凭证。

## 用例 ID 体系

- `<CLIENT>-A*` 真实拦截(deny);`B*` 真实放行(allow);`C*` wire 接线/卸载;`D*` 平台特有(如 Pi 拆条、DSH 审计)。
- 每个用例含:命令 / 前置分支 / 期望 / 断言要点。
- 各客户端共享同一组核心命令(受保护 push/force push/B -D/merge/链式/sudo/checkout -B),差异只在触发通道与证据形态。

## 判定标准(DoD)

- 拦截用例:命令未执行(远端 ref 未动、无副作用)+ 客户端展示拒绝原因(block/deny/exit 2)。
- 放行用例:命令真实执行成功且有可观察副作用(feature 分支远端 ref 被创建等)。
- wire 用例:配置文件出现对应 hook 条目;重复执行幂等;unwire 后条目消失。