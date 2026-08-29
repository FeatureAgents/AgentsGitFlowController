# TestResult — Antigravity 实机测试证据

## 测试信息

| 项 | 值 |
|---|---|
| 测试日期 | —(未测) |
| 守卫版本 | 0.0.21(待测) |
| 客户端 | Antigravity(**本机未安装**;官方文档:antigravity.google/docs/ide/hooks —— Google 编码 agent,2.0 已并入 Gemini CLI,旧 `~/.gemini/settings.json` 格式过期) |
| 测试场 | 建议 `/tmp/e2e-antigravity-repo`(master=integration/(fix|task)/*=feature + 本地裸远端),wire 后真实会话触发 |
| 挂载方式 | `gitflow-guard wire --client antigravity --project --yes` 生成 `.agents/hooks.json`(`matcher: run_command`,相对 `bin/...` 路径) |

## 结果汇总

| 用例 | 命令 | 结果 |
|---|---|---|
| AGY-A1..A6 | 拦截组 | ⛔ NOT RUN(客户端未安装) |
| AGY-B1..B4 | 放行组 | ⛔ NOT RUN(客户端未安装) |
| AGY-C1..C4 | wire 组 | ⛔ NOT RUN(客户端未安装) |
| AGY-D1..D4 | **协议核验定稿点** | ⛔ 待测 —— 决定"实验支持"能否摘帽 |

## 待办(用户准备后执行;本平台为实验支持,核验结果直接影响定稿)

1. 安装 Antigravity(或 Gemini CLI)并登录;冒烟通过为准。
2. 按 `docs/e2e/antigravity.md` 全量执行,结果与 **AGY-D1..D4 核验结论**填回本文件:
   - stdout 顶层 `{decision, reason}` 形状是否被识别(包裹 hookSpecificOutput 会校验失败?);
   - hook 进程 cwd 与相对路径 `bin/...` 是否可解析(官方文档未注明 cwd 语义);
   - stdin envelope `toolCall.args.CommandLine` 与真实 payload 是否一致;
   - `decision: deny` 是否真实阻断工具。
3. **偏差处理**:任何一项与 `docs/design/antigravity.md` 不符 → 先记录证据,再决定改实现/改文档;全部通过后摘除"实验支持"标注(AGENTS.md §8 / wire experimental / README)。