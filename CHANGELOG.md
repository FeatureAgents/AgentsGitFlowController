# Changelog

## 0.1.1 (2026-08-18)

- fix: 拦截 `checkout && merge` 串联命令绕过分支状态判定(按段模拟分支切换, 无法绕序)。
- fix: 拦截文案预览分支名硬编码——改用配置的自定义名(自定义命名时引导不再写错分支)。
- fix: 审计目录不存在时静默失败(deny 无留痕), 补 mkdir。
- ci: 打 `v*` 标签自动发布(release.yml: 校验版本 → 测试 → 构建 → npm publish → GitHub Release)。
- ci: pnpm 改从 npm registry 安装, 避免 codeload 429 限流。
- docs: README 出版级打磨(倒金字塔结构、双语 TOC、场景/原理/FAQ/术语/路线图)、服务器端分支保护对比章节、锚点修复。
- 174 个单元/集成测试全绿。

## 0.1.0 (2026-08-17)

- 首个公开发布版本。DSH 插件: 基于本地 git 事实强制 feature → 预览 → 基线 合入顺序。
- 门禁矩阵: 直推/强推/删除受保护分支、绕序合入基线、agent 自我授权 —— 全部硬拦截并引导。
- 用户唯一例外权: 聊天确认(session/event, 仅真人消息)与终端 CLI 双通道特许(P1/P2/P3, 一次性消费, 可设有效期)。
- 项目 opt-in 配置(gitflow-guard.config.json): 分支角色化(无硬编码分支名)、pr/flexible 双模式、确认关键词可自定义。
- gh 适配器: `gh pr view` 解析 PR 目标、`gh pr checks` 日志参考(查不到自动跳过); 核心平台无关。
- 审计留痕: `.git/gitflow-guard/`(audit.jsonl + state.json), deny/grant/consume 全记录。
- 命令行拦截缺陷修复: `checkout && merge` 串联命令按段模拟分支状态, 无法绕序。
- 172 个单元/集成测试(命令分类、门禁矩阵、配置、特许、会话解析、真实 git 集成)。
