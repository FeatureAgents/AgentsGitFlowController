# TestResult — Antigravity 实机测试证据

## 测试信息

| 项 | 值 |
|---|---|
| 测试日期 | 2026-08-29(协议层链路);真机会话 **NOT RUN(环境受限)** |
| 守卫版本 | 0.0.21 |
| 客户端 | Antigravity CLI(agy 1.1.22,已安装已登录;官方文档:antigravity.google/docs/ide/hooks —— Google 编码 agent,2.0 已并入 Gemini CLI,旧 `~/.gemini/settings.json` 格式过期) |
| 测试场 | `/tmp/e2e-antigravity-repo`(master=integration/beta=preview/(fix|task)/*=feature + 本地裸远端 `/tmp/e2e-origin-antigravity.git`) |
| 挂载方式 | `gitflow-guard wire --client antigravity --project --yes` 生成 `.agents/hooks.json`(`matcher: run_command`,相对 `bin/...` 路径);bin/+lib/ 复制进受控仓库 |

## 结果汇总

| 用例 | 命令 | 结果 |
|---|---|---|
| AGY-C1 | wire 落位 | **PASS** —— `.agents/hooks.json` 正确生成(`gitflow-guard.PreToolUse` + `matcher: run_command` + `check --platform antigravity`);experimental 提示输出 |
| AGY-D1 | encode 形状(协议链路) | **PASS** —— 真实 hook 命令喂官方 envelope payload:`git push origin master` → exit 0 + stdout `{"decision":"deny","reason":"...[gitflow-guard] blocked: Protected branch \"master\"...Next: ..."}`(顶层形状正确,无 hookSpecificOutput 包裹) |
| AGY-D3 | payload envelope 解析(协议链路) | **PASS** —— `toolCall.args.CommandLine` 被正确提取并判定 |
| AGY-A1 | 非 git 命令 / feature push 放行(协议链路) | **PASS** —— exit 0 无输出 |
| AGY-A1..B4 | 真机会话(模型实际执行命令) | ⛔ **NOT RUN(环境受限)** —— 模型调用不可用,真实会话拦截/放行未能执行 |
| AGY-D2 | hook 进程 cwd 核验 | ⛔ NOT RUN —— 需真机会话确认 |

## 待办(真机会话恢复可用后执行;本平台为实验支持,核验结果直接影响定稿)

1. 冒烟 `agy --print` 通过后,按 `docs/e2e/antigravity.md` 全量执行 AGY-A/B 组,结果填回本文件。
2. 补核验 AGY-D2(hook 进程 cwd 与相对路径 `bin/...` 解析)。
3. **偏差处理**:任何一项与 `docs/design/antigravity.md` 不符 → 先记录证据,再决定改实现/改文档;全部通过后摘除"实验支持"标注(AGENTS.md §8 / wire experimental / README)。

## 备注

- 协议层链路已在真实 wire 产物 + 官方 payload 形状 + 受控仓库上闭合;README 已如实标注「实验支持、尚未真机验证」。