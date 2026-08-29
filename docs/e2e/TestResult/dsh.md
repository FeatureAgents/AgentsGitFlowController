# TestResult — DSH 实机测试证据

## 测试信息

| 项 | 值 |
|---|---|
| 测试日期 | 2026-08-29(环境就绪);真实拦截验证**待 DSH 重启后**执行 |
| 守卫版本 | 0.0.21(已装入 web profile) |
| 客户端 | DSH(DeepSeek Harness,Web GUI profile = web) |
| 测试场 | 计划用受控仓库(如 `/tmp/e2e-dsh-repo`,master=integration/(fix|task)/*=feature + 本地裸远端),在真实 DSH 会话内执行 bash 工具触发 `tools/pre-execute` |
| 挂载方式 | `node scripts/install-dsh.mjs web`(bundle 层 `agents-gitflow-guard`;`.dsh/profiles/web/cordis.patch.yml` 可覆盖 `toolNames`) |

## 环境就绪证据(本次已完成)

```
[install] 完成。web profile 的 bundles 已包含 agents-gitflow-guard。
web profile mounted guard: 0.0.21   ← 此前挂载 0.0.11(版本漂移实证:曾长期停留在旧版)
```

- **背景问题确认**:去往 profile 挂载 `0.0.11`(2026-08-29 前),而 develop 已 0.0.21——本机 DSH 对最新守卫逻辑长期无真机回归;本次已升级。
- **注意**:本会话内 DSH 进程仍运行旧版插件实例,**必须重启 DSH 后**新版守卫才加载(`tools/pre-execute` 监听在进程启动时注册)。

## 结果汇总(重启后按 docs/e2e/dsh.md 执行)

| 用例 | 命令 | 结果 | 证据 |
|---|---|---|---|
| DSH-A1 | `git push origin master`(受控仓库) | ⏳ 待重启后验证 | 预期:工具返回 deny 理由;remote master 未动;审计出 deny 条目 |
| DSH-B1 | `git push origin fix/verify-01` | ⏳ 待重启后验证 | 预期:远端真实创建 feature ref |
| DSH-D1 | `gitflow-guard audit` | ⏳ 待重启后验证 | 预期:deny 条目落 `~/.local/state/gitflow-guard/repos/*/audit.jsonl` |
| DSH-D3 | 插件版本核对 | 环境就绪 | `~/.dsh/profiles/web/node_modules/agents-gitflow-guard/package.json` version = 0.0.21 |

## 复现方式(重启 DSH 后)

1. 建受控仓库(或复用 `/tmp/e2e-claude-repo` 同构仓库)。
2. 在 DSH 会话内以 bash 工具执行 `git push origin master` → 应被 deny(命令不执行)。
3. 执行 `git push origin fix/verify-01` → 应放行。
4. 取证据:`git ls-remote origin` 前后对比 + `gitflow-guard audit` 输出。
5. 更新本文件:填结果汇总表并摘录工具返回文案。

## 发现与遗留

1. **版本漂移风险实证**:dogfood profile 曾挂 0.0.11 达数个版本周期;建议 `install-dsh.mjs` 的执行纳入发布流程(发布后重装 DSH profile),或至少在 TestResult 上每版本核对一次。
2. 沙箱模式下 DSH 插件仍会拦截(拦截发生在 DSH 内核,不依赖 agent 会话文件权限);受控仓库建议放 `/tmp` 之外可写区。