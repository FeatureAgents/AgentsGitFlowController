# Changelog

## 0.1.0 (2026-08-17)

- 首个公开发布版本。DSH 插件: 基于本地 git 事实强制 feature → 预览 → 基线 合入顺序。
- 门禁矩阵: 直推/强推/删除受保护分支、绕序合入基线、agent 自我授权 —— 全部硬拦截并引导。
- 用户唯一例外权: 聊天确认(session/event, 仅真人消息)与终端 CLI 双通道特许(P1/P2/P3, 一次性消费, 可设有效期)。
- 项目 opt-in 配置(gitflow-guard.config.json): 分支角色化(无硬编码分支名)、pr/flexible 双模式、确认关键词可自定义。
- gh 适配器: `gh pr view` 解析 PR 目标、`gh pr checks` 日志参考(查不到自动跳过); 核心平台无关。
- 审计留痕: `.git/gitflow-guard/`(audit.jsonl + state.json), deny/grant/consume 全记录。
- 命令行拦截缺陷修复: `checkout && merge` 串联命令按段模拟分支状态, 无法绕序。
- 172 个单元/集成测试(命令分类、门禁矩阵、配置、特许、会话解析、真实 git 集成)。
