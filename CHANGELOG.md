# Changelog

本仓库/包统一为 **`agents-gitflow-guard`**(放弃旧包名, 旧包已不维护)。

## 0.0.5 (2026-08-21)

- feat: OpenCode 支持 —— 新增 `.opencode/hook/hooks.yaml`(tool.before.bash → `gitflow-guard check --platform opencode`, stdin `tool_args.command`, bash action exit 2 阻断);`platform.ts` 加 opencode 判别/extract/encode, 单测与复测矩阵同步覆盖。
- docs: 宣传语/description/keywords 追加上 OpenCode(hook 段补齐三方配置示例);USAGE 的平台枚举同步。

## 0.0.4 (2026-08-21)

- feat: Codex 支持 —— 新增 `.codex/hooks.json`(PreToolUse → `gitflow-guard check --platform codex`), 复用已有 `permissionDecision:"deny"` 协议; 宣传语从"for DSH"改口为"for AI coding agents (DSH / Claude Code / Codex)", keywords 补 claude-code/codex/hook。
- tooling: 新增连续复测矩阵 `scripts/verify-matrix.mjs`(`npm run verify:matrix`)—— DSH 核心逻辑 + Claude Code / Codex / antigravity + zh 全链路回归, 已接入 CI 每次 push/PR 执行。
- docs: AGENTS.md §8「客户端支持清单」固化"每加一个客户端必须逐项同步"的 9 项检查;README 双语补 Codex hook 配置与宣传语。

## 0.0.3 (2026-08-20)

- feat: i18n —— 拦截/CLI 文案默认英文, 项目可用 `"locale": "zh"` 切中文。
- docs: README 首页改纯英文; 新增 `docs/verify-0.0.2.md` 普通用户端到端验证报告。

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
