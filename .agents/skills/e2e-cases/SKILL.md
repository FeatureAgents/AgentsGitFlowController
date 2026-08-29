---
name: e2e-cases
description: Synchronize and expand real-machine E2E test cases after guard logic/protocol changes. 守卫逻辑/协议修改后同步增加实机测试用例并执行。
---

# e2e-cases · 修改后同步增加实机测试用例并执行

在**任何守卫逻辑/协议/接线修改**通过单测与复测矩阵后,本技能负责把改动同步进实机测试用例并**真实执行取证**(与 design-sync 搭配:一个管文档,一个管测试)。

## 触发场景

- 判定内核变化(classify/gate/config):新增拦截面/豁免、修复空隙
- 协议/接线变化(platform/wire/pi/index):编码、payload、落位文件、hook 命令

## 步骤

1. **判断影响面**:按改动类型映射受影响客户端——
   | 改动层 | 受影响客户端 |
   |---|---|
   | classify/gate/config/i18n(判定内核) | **全部 6 客户端**(共用 evaluateCommand 内核) |
   | platform.ts(编码/payload) | 对应平台文件(claude/codex/opencode/antigravity) |
   | pi.ts / index.ts(进程内) | pi / dsh |
   | wire.ts(落位) | 对应 stdin-hook 客户端 |
2. **同步 docs/e2e/<client>.md**:按统一用例 ID 体系(`<CLIENT>-A*` 拦截 / `B*` 放行 / `C*` 接线 / `D*` 平台特有)增补或更新用例——注明命令/前置分支/期望/断言要点;改动涉及新命令族时,同时把用例加入 `scripts/test-git-matrix.sh`(135 用例决策矩阵)。
3. **执行测试**:调用 **e2e-run** 技能真实执行受影响客户端的用例;判定内核改动须在**至少一个真实客户端通道**(如 Codex / Pi 扩展通道)抽测被改命令族;wire/协议改动须该客户端实测(wire 产物真实触发拦截/放行,仅文件出现不算)。
4. **更新 TestResult**:执行结果与证据(输出摘录 + 远端 ref 前后 + 审计)写入 `docs/e2e/TestResult/<client>.md`,按"证据规范"保留历史节。
5. **收尾**:QA 连环测(`npm run test:all`,含类型检查/单测/平台矩阵/Git 135 矩阵/生命周期流);用例文档/TestResult 与代码改动走同一 PR。

## 判定口径(与 TestResult/README.md 一致)

- 拦截用例通过 = 命令**未真实执行**(受保护远端 ref 未动/无副作用)+ 客户端展示拒绝原因;
- 放行用例通过 = 命令**真实执行且副作用可见**;
- 协议层全绿(verify:matrix)不构成实机证据——必须真实客户端通道验证。

## 陷阱记录

- **前置状态**:Pi 用例 D 依赖本地 feature 分支存在(`gfguard-pi-cases.sh` 未自建)——先建分支再跑,失败先怀疑脚本前置而非守卫。
- **版本挂载**:`^0.0.17` 不解析 0.0.21(0.0.x caret 锁 patch);实机测试前核对测试场挂载的守卫版本 = 被测版本(DSH profile 曾长期挂 0.0.11 的实证)。
- **真实远端污染**:受控仓库一律用本地裸远端(/tmp),禁止对真实远端执行会成功推送的用例。
- **模型改写命令**:headless 会话可能改写命令(如自动加 `--set-upstream`),断言以远端 ref 前后为准,不依赖模型措辞。