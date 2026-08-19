# Changelog

本仓库/包统一为 **`agents-gitflow-guard`**(放弃旧包名, 旧包已不维护)。

## 0.0.2 (2026-08-19)

- **feat: 可自由配置的分支角色守卫** —— 把固定「feature → 预览 → 基线 → 主干」模型重构为角色驱动:
  - 配置入口 `gitflow-guard.config.json`:`integration` 为唯一必填;`preview` / `production` / `archive` 均为可选数组(支持精确分支名或正则), 按需启用。
  - 每角色独立规则:`update`(pr=只走 PR/MR / flexible=允许直推)、`mergeBy`(production 默认 user=只能你点合并)。
  - 门禁按角色驱动;受保护分支 = integration/preview/production/archive;生产与归档合并**仅限用户**(agent 可建 MR, 但合并必须你点)。
  - 移除不再需要的特许系统(permit/confirm/session/permits), 以「你的合并点击」为唯一确认。
  - 平台: 新增 GitLab `glab`(MR)适配, 与 GitHub `gh` 并存。
  - CLI: 仅保留 status/audit/check;status 按角色列出本地分支。
  - typecheck 0 Error, 106 个单元/集成测试全绿。
- feat: Claude Code hook —— 新增 `gitflow-guard check` 子命令(读 hook payload 做门禁, exit 0=放行 / 2=拦截), `.claude/settings.json` 自带 PreToolUse + PostToolUse/PostToolUseFailure 配置; 非 git 命令快路径零开销, 内部错误 fail-open。

## 0.0.1 (2026-08-18)

- 首版以 `agents-gitflow-guard` 发布 npm(由曾用包名更名而来)。
- docs: `.agents/` 全部改英文(开源就绪), 子智能体去掉 `model:` 字段(模型选择本地化)。
