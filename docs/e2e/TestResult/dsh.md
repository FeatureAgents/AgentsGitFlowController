# TestResult — DSH 实机测试证据

## 测试信息

| 项 | 值 |
|---|---|
| 测试日期 | 2026-08-29(环境就绪)→ **2026-08-29(DSH 重启后真机验证完成)** |
| 守卫版本 | 0.0.21(web profile 已装,重启后进程内生效) |
| 客户端 | DSH(DeepSeek Harness,Web GUI profile = web) |
| 测试场 | 本仓库(dogfood config:develop=integration/main=archive),push 目标指向本地裸远端 `/tmp/e2e-dsh-origin.git`——**对真实远端零接触,守卫失效时也仅推到本地裸库,无任何真实后果** |
| 挂载方式 | `node scripts/install-dsh.mjs web` → 重启 DSH;`patch.yml` 挂载 `tools/pre-execute`;`toolNames` 默认 `pwsh/bash` 匹配 |
| 执行模式 | 在 DSH 会话内以 bash 工具真实执行 git 命令,观察工具返回/审计/裸远端状态 |

## 结果汇总(2026-08-29,DSH 重启后)

| 用例 | 命令 | 结果 | 证据 |
|---|---|---|---|
| DSH-A1 | `git push /tmp/e2e-dsh-origin.git develop` | **PASS** | 工具返回 `Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push / Next: ...`;命令未执行(裸远端无任何 ref);审计新增 deny 条目(含完整命令文本与 reason) |
| DSH-A5 | 链式整段拦截(`git push ... ; echo ...` 组合进一条命令) | **PASS** | 整条命令在预执行阶段被 deny(审计记录完整命令文本)——首个受保护段命中即整段拦截,后续段均未执行 |
| DSH-A6 | `sudo git push /tmp/e2e-dsh-origin.git develop` | **PASS** | sudo 剥壳后仍判 deny(0.0.19 修复面);工具返回 blocked;裸远端无 ref |
| DSH-B1 | `git push /tmp/e2e-dsh-origin.git feature/e2e-test-docs` | **PASS** | 放行并真实执行:裸远端出现 `refs/heads/feature/e2e-test-docs` = `95d58fe9...` |
| DSH-D1 | 审计留痕 | **PASS** | `~/.local/state/gitflow-guard/repos/AgentsGitFlowController-08e046909886/audit.jsonl` 尾部连续 3 条 deny(原始/链式/sudo),event=deny + command + reason 齐全 |
| DSH-D3 | 插件版本核对 | **PASS** | web profile 挂载 0.0.21(此前为 0.0.11 漂移实证);重启后拦截行为与 0.0.21 判定一致(0.0.19 修复面 sudo 剥壳生效,旧版不具备) |

## 证据细节

- 工具返回(DSH deny 表达形态 = `{kind:'deny', reason}`,两行文案):
  ```
  Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
  Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
  ```
- 审计新增条目(时间戳 1787975877121 起):
  ```json
  {"time":...,"event":"deny","command":"git push /tmp/e2e-dsh-origin.git develop","reason":"Protected branch \"develop\" forbids direct push"}
  {"time":...,"event":"deny","command":"...完整链式命令...","reason":"Protected branch \"develop\" forbids direct push"}
  {"time":...,"event":"deny","command":"sudo git push /tmp/e2e-dsh-origin.git develop","reason":"Protected branch \"develop\" forbids direct push"}
  ```
- 裸远端 refs(拦截组后为空;放行组后):`refs/heads/feature/e2e-test-docs 95d58fe9...`。

## 发现与遗留

1. **版本漂移已修复并实证**:0.0.11 → 0.0.21 后拦截/审计/0.0.19 修复面全部按新逻辑生效;建议把 `install-dsh.mjs` 的重新安装纳入每次发布会话(防再次漂移)。
2. **链式整段行为确认**:守卫对整条命令文本分段判定,任一 deny 段 → 整段不执行(本测试中伪装"完整命令"的 echo 包装亦被连带拦截)。
3. 用「push 到本地裸远端」作为 DSH 通道的安全实验法:拦截用例零真实后果、放行用例有真实副作用可取证,不污染真实远端、不触碰本地 develop/main ref。