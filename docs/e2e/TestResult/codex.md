# TestResult — Codex 实机测试证据

## 测试信息

| 项 | 值 |
|---|---|
| 测试日期 | —(未测) |
| 守卫版本 | 0.0.21(待测) |
| 客户端 | Codex(**本机未安装**) |
| 测试场 | 建议 `/tmp/e2e-codex-repo`(master=integration/(fix|task)/*=feature + 本地裸远端),wire 后 `codex exec` 触发 |
| 挂载方式 | `gitflow-guard wire --client codex --project --yes` 生成 `.codex/hooks.json`(`^Bash$` matcher,相对 `bin/...` 路径) |

## 结果汇总

| 用例 | 命令 | 结果 |
|---|---|---|
| CODEX-A1..A6 | 拦截组 | ⛔ NOT RUN(客户端未安装) |
| CODEX-B1..B4 | 放行组 | ⛔ NOT RUN(客户端未安装) |
| CODEX-C1..C4 | wire 组 | ⛔ NOT RUN(客户端未安装) |
| CODEX-D1 | wire 格式断言(exit 0 + 三字段 JSON) | ⛔ 待测(协议层矩阵已绿,实机待补) |

## 待办(用户准备后执行)

1. 安装 Codex 并登录(`codex login`,需要 GitHub/OpenAI 凭证)。
2. 按 `docs/e2e/codex.md` 全量执行,将结果填回本文件(含 hook stdout 的 `permissionDecision: deny` 证据与远端 ref 前后)。
3. 重点核验 **CODEX-D1**:Codex 拒绝 hook 输出未知字段,当前实现只输出三个规定字段——真机确认该形状可被识别;若 Codex 对 `exit 0 + JSON` 的拦截语义与本文档不符(如需要 `permissionDecision` 之外字段),记录偏差并回写实现。