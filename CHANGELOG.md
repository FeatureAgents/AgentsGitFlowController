# Changelog

本仓库/包统一为 **`agents-gitflow-guard`**(放弃旧包名, 旧包已不维护)。

## 0.0.11 (待发布)

- fix: 分类器硬化(第一批) —— 拆分 `||` 与 `|` 后半段独立分类; 识别 shell 包装(`sh/bash/zsh -c`, 含 `-lc` 合并短旗标)与执行前缀(`env`/`command`/`nohup`/`xargs`/绝对路径/`VAR=x`)递归解包; 反引号与 `$()` 内层命令一并送分类(单引号内不展开); 子 shell 括号包裹剥离; 剥离子命令前的 git 全局选项(`-C`/`-c k=v`/`--git-dir`/`--work-tree` 等)再取子命令。整改 §1.1 对抗样本(shell 包装/git 形态两类)收编为回归语料。
- fix: pr-merge 目标无法解析(gh/glab 未装/未认证/离线)时一律拒绝 —— 原先按 feature head 放行,而该场景下 PR 可能实际指向 production/archive,「生产仅用户点合并」的承诺曾在此失效; 同步移除失效文案键。
- docs: README 双语「安全工具」问答如实化 —— 移除「角色边界本身无法绕过」过度承诺,列出实测穿透文本层的混淆形态与已知本地不可防通道(forge API 直连、解释器子进程内嵌),明确服务端分支保护为最终边界; gh/glab FAQ 改为与新行为一致; AGENTS.md §8 Copilot 口径对齐官方 hooks 现状。

## 0.0.10 (待发布)

- docs: 安装文档准确性 —— 快速开始/registry 安装补「锁版本」姿势与版本坑提示(registry 缓存/镜像陈旧时裸 add 可能拿旧版); 说明 pnpm peer WARN 属预期(DSH 启动经共享回退提供 cordis/dsh-tools)。README 双语随包发布。

## 0.0.9 (2026-08-21)

- feat: 归档(archive)策略调整 —— agent 允许**创建**指向 archive 的 PR/MR(便于起草 develop→main 归档 PR), 合并仍限用户亲手; 移除旧「agent 不得创建归档 PR」限制。
- fix: 命令解析准确性 —— `git push +src:dst` 的 `+` 前缀正确识别为强推; `git push --tags` 不再被误判为分支推送(消除受保护分支上的误拦); 新增 15 项对抗性回归测试。
- ci: 跨平台矩阵 —— ubuntu / macOS / Windows × Node 22/24 全量运行(含 verify:matrix); .gitattributes 强制 LF; 修复 Windows 8.3 短名路径的测试规范化。

## 0.0.8 (2026-08-21)

- docs: GitHub Copilot 明确不提供 hook(原生规则覆盖) —— 移除 copilot 占位平台(3 行未完成分支), README 双语/AGENTS.md §8 说明原因并附官方文档链接; 同步 bump。

## 0.0.7 (2026-08-21)

- chore: 发布同步 —— PR #9(AGENTS.md 流程规范化) 合入后 bump 版本; 无功能变更(0.0.7 tarball 与 0.0.6 一致)。

## 0.0.6 (2026-08-21)

- fix: Antigravity 拦截协议修正 —— Gemini CLI 已并入 Antigravity 2.0; 官方 decision 合法值仅 allow|deny|ask|force_ask, 拦截须输出 `{"decision":"deny","reason":...}` 且 **exit 0**(不能包 hookSpecificOutput、不能用非法值 "block")。
- feat: Antigravity 支持(dogfood `.agents/hooks.json` + 参考文档 gemini.md → antigravity.md + HOOKS.md 同步; 宣传语/description/keywords 追加 Antigravity)。
- docs: 平台清单补 Antigravity(位于 AGENTS.md §8 已管理的五个客户端)。

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
