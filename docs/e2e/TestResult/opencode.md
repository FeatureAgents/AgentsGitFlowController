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