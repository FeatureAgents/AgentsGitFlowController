# TestResult — OpenCode 实机测试证据

## 测试信息

| 项 | 值 |
|---|---|
| 测试日期 | 2026-08-29 |
| 守卫版本 | 0.0.21(`bin/gitflow-guard.mjs` + `lib/` 复制进受控仓库) |
| 客户端 | OpenCode 1.18.15(Homebrew;XDG 重定向 `/tmp/oc-data` + auth.json 复制,provider=opencode-go/deepseek-v4-flash) |
| 测试场 | `/tmp/e2e-opencode-repo`(master=integration/beta=preview/(fix|task)/*=feature;裸远端 `/tmp/e2e-origin-opencode.git`) |
| 挂载方式 | `gitflow-guard wire --client opencode --project --yes` 生成 `.opencode/hook/hooks.yaml`(语义 id gitflow-guard,tool.before.bash) |
| 执行模式 | `opencode run "..."`(cwd=受控仓库;`$OPENCODE_PROJECT_DIR` 由客户端展开) |

## 结果汇总

| 用例 | 命令 | 结果 | 证据 |
|---|---|---|---|
| OPENCODE-C1 | wire 落位 | **PASS**(文件层面) | `.opencode/hook/hooks.yaml` 正确生成(`id: gitflow-guard` + `tool.before.bash` + `check --platform opencode`) |
| OPENCODE-A1 | `git push origin master` | **FAIL** | **hook 完全未生效**:模型执行了 push 且真实推送成功 —— 受控仓库制造新提交后 `origin/master` 被真实推到 `47e0554a...`;hook 调用日志 `/tmp/oc-hook-calls.log` **零调用**;会话无任何拦截痕迹 |
| OPENCODE-A1' | 直连 hook 命令(对照) | PASS(CLI 层) | 手工喂 payload:`check --platform opencode` exit=2 + stderr blocked 文案 —— **CLI 协议层正常,问题在客户端未加载 hook** |
| OPENCODE-B1..D2 | 其余用例 | NOT RUN | 通道已证伪,放行侧再无意义;修复后全量重跑 |

## 追溯分析(为什么失败)

1. **`hooks.yaml` 机制在 OpenCode 1.18 已被移除/废弃**:
   - 官方文档站(`opencode.ai/docs/`)整个站点**不存在 hooks 页面**(`/docs/hooks` 404;全站侧栏无 hooks 条目);
   - 当前官方扩展机制为 **plugins**:`.opencode/plugins/*.ts` + 事件订阅(`"tool.execute.before"` 等),见 `opencode.ai/docs/plugins/`;
   - 本仓库 `.agents/hooks/references/opencode.md` 记载的 `hooks.yaml` + `tool.before.bash` 属旧版协议,与该版本客户端**不对齐**。
2. **协议层与实机脱节**:`verify:matrix` F 节(OpenCode wire 断言)与 `platform.spec` 全绿——它们直接喂 payload 给 CLI,不经真实 opencode 进程,故无法暴露"客户端根本不加载 hook"这类问题;本次实机测试首次暴露该缺陷。

## 发现与遗留(产品缺陷,需修复)

1. **OpenCode 接入在当前版本无效**:wire 产物不被读取,守卫对 opencode 会话零防护(受保护分支真实推送成功)。**服务端分支保护仍是最终边界**,但插件声称支持的客户端清单含 opencode,属虚假承诺,必须处理。
2. 修复方向(候选,待拍板):
   - **A. 迁移到 plugins 机制**:新增 `.opencode/plugins/gitflow-guard.ts`(随包发布 + wire 落位改为 plugins 路径),在 `tool.execute.before` 事件中调用守卫 CLI,deny 时通过抛错/输出阻断工具——**插件错误语义与阻断强度需先做最小实验验证**;
   - B. 在真实 opencode 版本上确认是否存在可用的旧版 hooks 通道(如配置开关),再决定去留;
   - C. 若短期无法修复:文档与 status 明确标注 OpenCode 支持状态,避免误导用户依赖。

## 修复(2026-08-29,feature/antigravity-opencode-fix)

- **决议:方案 A(迁移到 plugins 机制)** —— hooks.yaml 在 OpenCode 1.18 已废弃(官方文档站无 hooks 页、实机零调用),方案 B 无旧通道可寻;C 只是兜底。
- 随包新增 **`opencode/gitflow-guard.ts`**(零外部依赖,不 import @opencode-ai/plugin):订阅 `tool.execute.before`,仅拦 bash/powershell,把命令交给 `check --platform opencode --command <cmd>`,deny(exit 2)时**抛错阻断**工具(官方 env-protection 示例同款语义);守卫 CLI 不可用时 fail-open 放行。
- `wire --client opencode` 落位改为**复制插件文件**到 `.opencode/plugins/gitflow-guard.ts`(全局 `~/.config/opencode/plugins/gitflow-guard.ts`);`--unwire` 删文件,不动其他插件。
- 守卫 CLI 定位:插件上两级目录(项目根)`bin/` → `$OPENCODE_PROJECT_DIR/bin/` → PATH,规避 hook 进程 cwd 不确定性。
- 协议参考 `.agents/hooks/references/opencode.md` 重写;README 双语、复测矩阵 F 节、wire/cli 单测同步;dogfood 配置由 `.opencode/hook/hooks.yaml` 换为 `.opencode/plugins/gitflow-guard.ts`。
- **修复后需全量重跑 A/B 组并更新结果**(本机 opencode 1.18.15 可复测)。

## 修复后复测(2026-08-29,真机会话,deepseek-v4-flash)

| 用例 | 命令 | 结果 | 证据 |
|---|---|---|---|
| OPENCODE-A1 | `git push origin master` | **PASS** | 会话输出 `✗ git push origin master failed` + `Error: [gitflow-guard] blocked: Protected branch "master" forbids direct push / Next: ...`;`origin/master` 前后同为 `6935065...` 未动 |
| OPENCODE-A1' | 插件加载 | **PASS** | 首版插件日志 `failed to load plugin ... Plugin export is not a function` → 改函数工厂;再版 `process.execPath` 是 opencode 自身(非 node)导致 check exit 1 fail-open → 改 shebang 直跑(Unix)/PATH node(Windows);两坑修复后插件加载并正确阻断 |
| OPENCODE-B1 | `git push origin fix/verify-01` | **PASS** | 真实执行:远端出现 `refs/heads/fix/verify-01` = `ff6fafe...`(与本地 commit 一致) |

> 插件实现要点(防再踩坑):① 插件导出必须是**函数**(工厂)返回事件处理器对象;② 插件运行在 opencode 进程内,`process.execPath` 是 opencode 自身,不能当解释器,Unix 靠脚本 shebang 直跑、Windows 用 PATH 上的 `node`;③ 守卫定位:插件上两级(项目根)`bin/` → `$OPENCODE_PROJECT_DIR/bin/` → `GITFLOW_GUARD_BIN` → PATH;④ 拒绝语义 = handler 抛错,其余 fail-open。

## 边界核验(2026-08-29,追加)

| 场景 | 结果 | 证据/说明 |
|---|---|---|
| 从仓库子目录启动会话 | **PASS(修正前次误报)** | 前次记录「子目录不加载项目插件」系**实验布置错误**(setup commit 打在 fix 分支后 checkout master,会话在无 config 的空工作树跑,内置默认不保护 master 故放行)。干净对照(reflog 自洽、config 保护 master):根目录与 sub/proj 子目录启动**均拦截** `git push origin master`(会话输出 blocked 文案,远端 ref 未动) |
| 全局插件形态 | **加载确认,拦截依赖全局守卫** | XDG 全局插件 `/tmp/oc-data/opencode/plugins/gitflow-guard.ts` 被加载(每次命令输出其 fail-open 告警为证);**纯全局(无项目插件)+ 无 GITFLOW_GUARD_BIN/PATH 守卫 → fail-open 放行,受保护 push 真实推送成功**(远端 23c8228→c2a1cab,随后回滚)——全局形态必须配全局安装的 `gitflow-guard` 或 `GITFLOW_GUARD_BIN` |
| 项目+全局双接线 | **双加载会留噪音日志** | 两者同加载:每次命令先一条全局插件的 fail-open 告警,再由项目插件拦截;文档已注明避免双接 |
| 守卫不可用 fail-open 真机 | 覆盖 | 上述纯全局无守卫场景即真实 fail-open 链路:push 放行 + 告警输出,与单测语义一致 |

> 沙箱注记:本机受限 shell 下 `~/.npm`、`~/.gemini` 等主目录写操作被拒,影响全局安装与 agy 会话缓存;项目级形态(受控仓库在 /tmp)不受影响。

---

## 2026-08-29 复测（feature/fix-major-issues · 0.0.33）

| 用例 | 操作 | 结果 | 证据 |
|---|---|---|---|
| OPENCODE-C1 | 插件落位 | **PASS(文件层面)** | 受控仓库 `.opencode/plugins/gitflow-guard.ts` 存在，含 3 处 `tool.execute.before`（复制挂载形态手拷插件） |
| OPENCODE-A1 | `git push origin master` | **NOT RUN** | 真机会话 `opencode run -m opencode-go/deepseek-v4-flash --auto` 卡在 `> build · deepseek-v4-flash` 3 分钟无输出，中断；疑模型/额度/网络挂起。协议层已由 verify:matrix 覆盖 |
| OPENCODE-B1 | `git push origin task/e2e-oc` | **NOT RUN** | A1 会话未完成故未跑；协议层已覆盖 |

> 本次 0.0.33 复测中 opencode 真实会话通道未能完成（模型挂起），此前 0.0.21 时代「修复后复测（真机会话）」已有 PASS 记录，本次仅作增量确认受限于运行环境。
