# Changelog

本仓库/包统一为 **`agents-gitflow-guard`**(放弃旧包名, 旧包已不维护)。
自 0.0.12 起条目改为**中英双语**(国际化发布面); 历史条目保留中文不追溯。

## 0.0.33

- feat(gate): working tree clean state & upstream baseline divergence guard — added optional `worktree` guard configuration (`requireCleanOnPr`, `requireCleanOnMerge`, `allowUntracked`, `requireUpstreamSynced`) in `gitflow-guard.config.json` to prevent agents from creating PRs or merging with dirty working trees, untracked files, or stale upstream baselines; implemented real-time local status fact inspection in `src/repo.ts` (`getWorktreeStatus`, `getUpstreamDivergence`), pure gate decision rules in `src/gate.ts`, localized why/next guidance in `src/i18n.ts`, and simulated clean tracking across multi-segment compound commands (`git add . && git commit && gh pr create`) in `src/index.ts` —— 工作区脏状态与上游基线偏离门禁: 在 `gitflow-guard.config.json` 引入可选 `worktree` 保护配置（`requireCleanOnPr`、`requireCleanOnMerge`、`allowUntracked`、`requireUpstreamSynced`），阻断 Agent 在工作区存在未提交改动、未追踪文件或落后上游基线时发起 PR 或执行合并；在 `src/repo.ts` 接入毫秒级本地状态查询（`getWorktreeStatus`、`getUpstreamDivergence`），在 `src/gate.ts` 实现纯函数门禁校验与双语下一步引导，并在 `src/index.ts` 支持多段复合命令（如包含前序 `commit`/`stash`/`reset --hard` 时）的干净状态动态模拟。

## 0.0.32

- docs(readme): achieve 100% full-length structural parity across all 11 languages & add readme-sync skill — expanded all 9 non-EN/ZH README files (Traditional Chinese, Japanese, Korean, German, French, Spanish, Italian, Portuguese, Russian) to 100% full-length structural parity with the English master (44 headings, 7 tables, 24 code blocks, 17 TOC anchors, 9 FAQs, and 8 glossary terms); audited and corrected native developer terminology; created `.agents/skills/readme-sync/SKILL.md`, `scripts/check-readme-equality.mjs`, and `tests/readme-equality.spec.ts` to mechanically enforce document equality across the repository —— 11 语种文档 100% 全量结构对称对齐与引入 readme-sync 规范: 将全部 9 份外语 README 扩充为与英文母本 100% 结构对称的全量版本（44 标题、7 表格、24 代码块、17 TOC 锚点、9 FAQ 与 8 术语表）；深度校验并修正本土化开发者术语；新增 `.agents/skills/readme-sync/SKILL.md` 技能规范、`scripts/check-readme-equality.mjs` 校验脚本及 `tests/readme-equality.spec.ts` 测试用例，通过 CI 与发版门禁机械化守卫多语言文档绝对平等。

## 0.0.31

- chore(repo): streamline repository layout, synchronize architecture specs & refactor test suites — removed legacy build artifacts and obsolete empty directories (`dist/`, `.tmp-verify-install/`); fully synchronized `AGENTS.md` §3 and `docs/design.md` §13 architecture trees to reflect the complete project layout (including `src/wire.ts`, `src/pi.ts`, distribution assets, and all 7 test/release scripts across 6 platforms); refactored `tests/*.spec.mjs` test files into TypeScript (`tests/extract-changelog.spec.ts`, `tests/version-pins.spec.ts`) for unified type safety —— 仓库架构精简、规范同步与测试套件重构: 清理历史构建产物 `dist/` 与冗余空目录 `.tmp-verify-install/`; 彻底同步 `AGENTS.md` §3 与 `docs/design.md` §13 项目结构定义，完整体现核心源码、分发目录与 7 个脚本的全貌; 将 `tests/` 下的 `.spec.mjs` 统一重构为 TypeScript (`.spec.ts`), 提升测试套件类型安全与规范性。

## 0.0.30

- docs(readme): multi-platform documentation neutrality & comprehensive from-source guide — balanced all 11-language README suites, blog post, AGENTS.md, and design specifications to treat all supported AI coding agents (Claude Code, Codex, OpenCode, Antigravity, DSH, Pi) with complete platform neutrality; categorized Quick Start into distinct installation modes (CLI Hook clients, DSH in-process plugin, Pi in-process extension) without subordinate phrasing; expanded the "From Source" guide in installation sections across all platforms to provide complete local build, link, and mounting commands for every client —— 全量文档去中心化与多平台中立化重构: 对 11 语 README 矩阵、博客导读、AGENTS.md 与设计文档进行全量中立化梳理，消除历史遗留的 DSH 单一基准偏向；将快速开始重构为清晰平等的安装模式分类（CLI Hook 客户端、DSH 进程内插件、Pi 进程内扩展）；在各语言安装详解中补齐覆盖所有客户端（CLI Hook、DSH、Pi）的完整从源码构建、链接与挂载指引。

## 0.0.29

- docs(skills): localize all agent skills to pure English — translated `design-sync`, `e2e-cases`, `e2e-run`, and `start-work` skill definitions and documentation completely into standardized English for international agent and developer usability —— Agent Skills 全量英语化: 将 `design-sync`、`e2e-cases`、`e2e-run` 与 `start-work` 全部 Skill 定义与文档统一英语化，提升跨智能体与全球开发者协作一致性。

## 0.0.28

- feat(ci): fully automated release upon PR merge into develop — added automated release detection in `.github/workflows/release.yml` and a dedicated changelog extraction utility `scripts/extract-changelog.mjs`: when a PR containing a version bump and CHANGELOG entry is merged into `develop`, CI automatically validates all matrix tests, creates and pushes the annotated Git tag (`vX.Y.Z`), publishes to npm with provenance attestation, and generates the GitHub Release with extracted release notes, eliminating manual local tag creation and push commands —— 自动化合并发版体系: 在 `.github/workflows/release.yml` 引入自动化版本检测与发布机制，并新增 CHANGELOG 提取工具 `scripts/extract-changelog.mjs`; 当包含版本更新与 CHANGELOG 的 PR 合并入 `develop` 时，CI 自动执行全矩阵回归测试、在 `develop` 自动打 Git Tag (`vX.Y.Z`) 并推送、发布 npm (带 provenance 认证) 及自动创建包含更新日志的 GitHub Release，实现零本地命令的全自动化发版闭环。

## 0.0.27

- docs(i18n): launch 11-language documentation suite & relax global contribution policy — added complete localized documentation for Japanese (`README.ja.md`), Traditional Chinese (`README.zh-tw.md`), Korean (`README.ko.md`), German (`README.de.md`), French (`README.fr.md`), Italian (`README.it.md`), Portuguese (`README.pt.md`), Spanish (`README.es.md`), and Russian (`README.ru.md`) alongside English (`README.md`) and Simplified Chinese (`README.zh.md`); standardized synchronized 11-language navigation headers across all READMEs; updated `CONTRIBUTING.md` to welcome issues, PRs, and discussions in any supported language with AI-assisted review support; wired all 11 READMEs into `package.json` package distribution files and automated consistency checks in `scripts/check-version-pins.mjs` —— 推出全球 11 大主流语种全量文档矩阵与放宽贡献语言政策: 新增日文(`README.ja.md`)、繁体中文(`README.zh-tw.md`)、韩文(`README.ko.md`)、德文(`README.de.md`)、法文(`README.fr.md`)、意大利文(`README.it.md`)、葡萄牙文(`README.pt.md`)、西班牙文(`README.es.md`)与俄文(`README.ru.md`), 与英文(`README.md`)和简体中文(`README.zh.md`)组成 11 语文档矩阵; 全量对齐 11 语顶部导航栏; 更新 `CONTRIBUTING.md` 全面放宽 PR/Issue 语言限制, 依托 AI 翻译辅助支持全球开发者无障碍协作; 11 份 README 全量纳入 `package.json` 发布白名单与 `scripts/check-version-pins.mjs` 自动化版本一致性守护。

## 0.0.26

- test(codex): complete real-device e2e verification — executed all 16 live test cases against `codex-cli 0.150.1` (PreToolUse hook blocking, JSON wire protocol with `exit 0` + `permissionDecision: deny`, physical Git ref isolation on bare remotes, and payload captures) with 100% pass rate; captured live payloads and recorded evidence in `docs/e2e/TestResult/codex.md` —— 完成 Codex 全量实机测试与证据闭环: 针对 `codex-cli 0.150.1` 执行全部 16 项用例(PreToolUse 钩子拦截、`exit 0` + `permissionDecision: deny` 协议编码、裸远端物理 SHA 零污染对比与真实 Payload 抓取), 16/16 用例全绿通过; 证据与 Payload 记录入 `docs/e2e/TestResult/codex.md`。
- feat(test): consolidate test suite into self-contained scripts & unified commands — migrated external e2e testing assets into repository scripts (`scripts/test-git-matrix.sh` for the 135-case Git command decision matrix, `scripts/test-git-realflow.sh` for feature lifecycle realflow, and `scripts/test-pi-extension.sh` for Pi extension verification), each self-provisioning temporary `/tmp` Git sandboxes; exposed intuitive npm scripts (`test:platforms`, `test:git-matrix`, `test:realflow`, `test:pi`, `test:all`); removed external test repository dependency —— 测试套件自包含收拢与统一命令体系: 将外部散落测试资产全量收拢入本仓库 `scripts/`(`scripts/test-git-matrix.sh` 承载 135 项 Git 决策矩阵、`scripts/test-git-realflow.sh` 承载 Feature 声明周期放行流、`scripts/test-pi-extension.sh` 承载 Pi 扩展测试), 内置 `/tmp` 动态沙箱创建与自动销毁; 在 `package.json` 暴露语义化测试命令(`test:platforms`/`test:git-matrix`/`test:realflow`/`test:pi`/`test:all`); 彻底解耦并清理外部测试仓库。
- fix(skills): add missing YAML frontmatter across all skills — added standard `--- name: ... description: ... ---` headers to `e2e-run`, `e2e-cases`, and `design-sync` skills, fixing skill loading errors across AI agent runtimes —— 补全全部 Skill 的 YAML frontmatter 元数据: 为 `e2e-run`、`e2e-cases` 与 `design-sync` 补齐标准 YAML 头, 解决各 Agent 运行时加载 Skill 时的解析报错。

## 0.0.25

- docs(design): synchronize per-client design notes & streamline design spec — update `docs/design/opencode.md` to document the OpenCode 1.18+ plugins mechanism and `docs/design/antigravity.md` with the verified absolute-path and `toolCall.args.Cwd` envelope; remove the redundant §15 evolution table from `docs/design.md` to establish `CHANGELOG.md` as the single authoritative version history; remove obsolete temporary handoff notes and historical 0.0.2 verification report —— 同步平台设计分册与精简总设计规格: 更新 `docs/design/opencode.md` 记录 OpenCode 1.18+ 插件机制, 更新 `docs/design/antigravity.md` 记录绝对路径与真机 payload 形状并移除实验标记; 从 `docs/design.md` 移除冗余的 §15 演进记录表, 确立 `CHANGELOG.md` 为唯一版本演进权威来源; 清理已闭环的临时交接文档与历史 0.0.2 验证报告。
- docs(community): add open-source community health files — add `CONTRIBUTING.md` (supporting PRs in English, Japanese, and Chinese), `SECURITY.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `.github/FUNDING.yml` (ko-fi: keanz21), and GitHub issue templates for bug reports and feature requests —— 补全开源社区协作文件: 新增 `CONTRIBUTING.md`(支持英/日/中三语 PR 与 GitFlow 规约)、`SECURITY.md`、`CODE_OF_CONDUCT.md`(行为准则)、`.github/FUNDING.yml`(赞助配置)与 GitHub issue 模板。

## 0.0.24

- docs(readme): remove misleading legacy design doc reference — bilingual READMEs previously referenced docs/design.md with a stale 0.0.13-era banner labeling it superseded historical decisions; in reality docs/design.md was rewritten in 0.0.14 into the authoritative technical design specification; the confusing link in the License section is removed —— 移除双语 README 结尾误导性的历史设计文档链接:原描述残留 0.0.13 时期横幅并把 docs/design.md 错标为废弃决策,实际上该文件已在 0.0.14 重写为现行技术规格;现移除 License 节后的冗余链接。

## 0.0.23

- docs(readme): refresh roadmap to future focus & unpin install commands — Roadmap in bilingual READMEs now focuses purely on upcoming exploratory directions (new agent integrations, audit aggregation, workflow presets, CI hard-gating) while referencing CHANGELOG.md for shipped history; install commands across all clients unpinned to standard latest-resolving forms (`dsh plugin add agents-gitflow-guard`, `npm i -g/D agents-gitflow-guard`); `check-version-pins.mjs` relaxed to allow unpinned READMEs while continuing to guard against stale version pins and verifying CHANGELOG headings —— 双语 README 路线图纯粹化与安装命令去版本号:路线图精简为面向未来的演进方向(新 Agent 平台接入、审计汇总与导出、流程预设模板、CI 门禁联动),已落地功能由 CHANGELOG.md 与正文权威承载;全客户端安装命令统一为标准无版本号写法;`check-version-pins.mjs` 放宽对 README 写死版本的硬性要求,继续拦截陈旧版本并校验 CHANGELOG 标题。

## 0.0.22

- feat(opencode): migrate to the official plugins mechanism — OpenCode 1.18+ dropped hooks.yaml entirely (real-device test showed zero hook invocations, see docs/e2e/TestResult/opencode.md), so the package now ships `opencode/gitflow-guard.ts` — a zero-dependency plugin (no @opencode-ai/plugin import) subscribing to `tool.execute.before`: it intercepts bash/powershell commands, hands them to `gitflow-guard check --platform opencode --command <cmd>`, and **throws on deny (exit 2) to block the tool** (same semantics as the official env-protection example); the guard CLI is located via the plugin's parent directory `bin/` → `$OPENCODE_PROJECT_DIR/bin/` → PATH, failing open when unavailable. `wire --client opencode` now copies this plugin into `.opencode/plugins/gitflow-guard.ts` (global: `~/.config/opencode/plugins/`) instead of writing the dead hooks.yaml; `--unwire` deletes only that file. Reference doc, dogfood config, bilingual README, matrix section F and unit tests updated accordingly — OpenCode 接入迁移到官方 plugins 机制:OpenCode 1.18+ 已整体移除 hooks.yaml(实机测试 hook 零调用),随包新增零依赖插件 `opencode/gitflow-guard.ts`:订阅 `tool.execute.before`,拦截 bash/powershell,把命令交给 `gitflow-guard check --platform opencode --command <cmd>`,deny(exit 2)时**抛错阻断工具**(与官方 env-protection 示例同语义);守卫 CLI 依次按插件上两级目录 `bin/` → `$OPENCODE_PROJECT_DIR/bin/` → PATH 定位,不可用时 fail-open。`wire --client opencode` 改为把插件复制到 `.opencode/plugins/gitflow-guard.ts`(全局 `~/.config/opencode/plugins/`),不再写已废弃的 hooks.yaml;`--unwire` 只删该文件。参考文档、dogfood 配置、双语 README、矩阵 F 节与单测同步。
- fix(antigravity): real-device protocol gaps closed — AGY-D2: `wire` now writes the antigravity hook command as an **absolute path** (`node <repo-root>/bin/gitflow-guard.mjs check --platform antigravity`) because agy runs hook processes with cwd = the config file's directory (relative `bin/…` resolved to `.agents/bin/…` → MODULE_NOT_FOUND); global scope falls back to `gitflow-guard` from PATH. AGY-D3: `extractHookPayload` reads the working directory from **`toolCall.args.Cwd`** (nested, capital C) instead of the top-level `j.cwd` that the real agy payload doesn't carry — the previous fallback chain silently allowed when a global hook could not locate the repo. Unit tests + matrix E section use the real payload shape. With both fixes verified, the Antigravity "experimental" label is removed from wire hints and the bilingual README — Antigravity 实机协议缺口修复:AGY-D2 `wire` 的 antigravity hook 命令改为**绝对路径**(`node <仓库根>/bin/gitflow-guard.mjs check --platform antigravity`)——agy 的 hook 进程 cwd 实测为配置文件所在目录,相对 `bin/…` 会解析成 `.agents/bin/…` 导致 MODULE_NOT_FOUND;全局落位回退 PATH 上的 `gitflow-guard`。AGY-D3 `extractHookPayload` 改取 **`toolCall.args.Cwd`**(嵌套大写 C)而非真实 payload 中不存在的顶层 `j.cwd`——原兜底链在全局 hook 定位不到仓库时会静默放行。单测与矩阵 E 节改用真机 payload 形状;两处修复闭环后摘除 Antigravity「实验支持」标注(wire 提示与双语 README)。

## 0.0.21

- docs(readme): complete en/zh parity pass — README.md and README.zh.md now align at every paragraph and content point: the Quick Start Step 3 lost its DSH-only parenthetical, the zh Why section regains the four-paragraph structure, the English locale note mirrors the Chinese message sample and the config file name, and the glossary archive row gains the (array) / agents-may-create-PR/MRs points —— README 双语逐段逐内容点对齐:Quick Start 第 3 步移除 DSH-only 括号、「为什么」节中文版恢复四段结构、英文 locale 提示补齐中文效果示例与配置文件文件名、术语表 archive 行补全「(数组)/ agent 可创建 PR/MR」两点。

## 0.0.20

- feat(config): built-in defaults & deep-merge override — the guard now ships with zero-config defaults that protect develop (integration) + main (archive) and is ON without any gitflow-guard.config.json; a custom config deep-merges over the defaults (write only what you change — roles you don't write keep the default, enabled defaults to true, disable with `enabled: false`), and `status` reports when the built-in defaults are in effect plus a trunk/single-branch opt-out notice (missing integration is no longer an error) —— 内置默认配置 + 深度合并覆盖:无 gitflow-guard.config.json 也默认保护 develop(integration)+main(archive) 并开启守卫;自定义配置在默认之上按字段深度合并(只写想改的,未写的角色沿用默认;enabled 默认 true,写 `enabled: false` 关闭);status 会提示「当前为内置默认」与 trunk/单分支关闭路径(缺 integration 不再报错)。
- feat(cli): per-client default hooks via `gitflow-guard wire` / `setup` — new subcommands that write each stdin-hook client's hook entry into its own config file (claude .claude/settings.json, codex .codex/hooks.json, opencode .opencode/hook/hooks.yaml, antigravity .agents/hooks.json) non-destructively (idempotent, deduped, never touches existing entries), with `--unwire` removal, `--dry-run` preview, interactive scope choice (project default; global always asks or needs `--yes`), experimental flag for Antigravity, and guidance-only output for in-process DSH/Pi; `setup` is the interactive one-shot wizard; `status` now hints which clients are not wired yet — 新增 wire/setup 子命令:一条命令把各 stdin-hook 客户端的默认 hook 写进各自配置文件(.claude/settings.json / .codex/hooks.json / .opencode/hook/hooks.yaml / .agents/hooks.json),非破坏性(幂等、去重、不动已有条目),支持 `--unwire` 移除、`--dry-run` 预览、作用域交互选择(默认项目级;全局写入必先确认或 `--yes`)、Antigravity 实验标注;进程内 DSH/Pi 仅打印引导;setup 为交互一步式向导;status 提示未接线的客户端。
- docs(readme): bilingual Quick Start & config sections rewritten around the default-on model — wire is now the primary path for the four hook clients (one command each), built-in defaults table, deep-merge override example, prominent "main is protected by default; trunk users disable" notice, and everywhere "integration required / opt-in" wording replaced by "default role / deep merge" —— 双语 README 快速开始与配置段改写为默认开启模型:四个 hook 客户端主路径改为一条 wire 命令、默认配置表、深度合并示例、醒目的「main 默认受保护,trunk 请关闭」提示,全文「integration 必填 / opt-in」措辞改为「默认角色 / 深度合并」。

## 0.0.19

- feat(guard): Pi agent 真机实测空隙修复(G1/G2/G3/G5) —— `sudo` 前置剥壳(含 `-u <user>` 参数消费, 与 `env` 同型)后递归分类, 特权包装的受保护推送不再放行; `git symbolic-ref` 收编 plumbing 直改面(双参重定向与 `-d/--delete` 删除送 `ref-update` 门禁, 查询形态/`--short` 不误伤); `git cherry-pick`/`git revert` 收编为 `ref-move`(受保护分支上改写历史拒绝、feature 自由, `-n`/`--no-commit` 只改工作树/索引与 `--abort`/`--continue`/`--skip`/`--quit` 恢复旗标豁免); `git checkout -B`/`switch -C`(含 `-Bf` 等短旗标簇)目标名送 `ref-update` 门禁 + checkout 模拟切换两段——强制重建受保护分支拒绝, feature 目标正常放行且按段模拟。G4(`git tag -f` 移动 tag)与 G6(受保护分支上普通 `git commit`)经拍板维持现状, 双语 README 门禁矩阵与 design.md §5 明示豁免理由防回归; 单测/对抗语料/复测矩阵 A 节与 G 节(Pi wire)同步扩充, 矩阵 51 PASS —— Pi 真机空隙修复:G1 `sudo` 剥壳(含 `-u` 参数消费)后递归分类,特权包装的受保护推送不再放行;G2 `symbolic-ref` 收编 plumbing 直改面(重定向/删除送 ref-update,查询形态不误伤);G3 `cherry-pick`/`revert` 收编 ref-move(受保护分支拒绝、feature 自由,`-n`/`--no-commit` 与恢复旗标豁免);G5 `checkout -B`/`switch -C`(含旗标簇)目标名送 ref-update + checkout 模拟切换,G4(tag -f)与 G6(普通 commit)经拍板维持现状并文档明示理由。

## 0.0.18

- docs(readme): unified install entry & client enumeration — the README install section now opens with a per-agent table around one npm source (`dsh plugin add` for DSH, `npm i -g` for the four stdin-hook clients Claude Code / Codex / OpenCode / Antigravity, `npm i -D` for Pi), the hook examples reference the globally-installed `gitflow-guard` binary, and the Quick Start points non-DSH users at that table; client lists made complete everywhere — blog intro `五个平台`→`六个平台` (+Pi), `docs/design.md` platform table and matrix section gain Pi, `HOOKS.md` registration table gains DSH/Pi as in-process clients —— 安装段统一为「一个 npm 包 + 逐客户端表」:DSH 走 `dsh plugin add`、四个 stdin-hook 客户端 `npm i -g` 后引用 `gitflow-guard`、Pi 用 `npm i -D`;Quick Start 补跨客户端跳转;各文档客户端清单补全——博客「五个平台」→「六个平台」加 Pi、design.md 平台表与矩阵小节补 Pi、HOOKS.md 注册表补 DSH/Pi(进程内客户端)。

## 0.0.17

- feat(pi): Pi agent support — the guard now loads as an **in-process Pi extension** ([earendil-works/pi-mono](https://github.com/earendil-works/pi-mono), pi.dev): the shipped `pi/gitflow-guard.ts` (copy into `.pi/extensions/`, mount via `.pi/settings.json` → `extensions`) wraps `createPiExtension()` from `src/pi.ts`, which listens on the official `tool_call` event for `bash`/`powershell` git-family commands, delegates to the guard CLI (`--platform claude` is only the internal exit-2 deny encoding, not a Pi protocol), and expresses deny via the official `{ block: true, reason }` return; non-2 exits and internal errors fail open, matching the DSH in-process path. Unit tests in `tests/pi.spec.ts`, matrix section G drives the real CLI, reference doc at `.agents/hooks/references/pi.md`, this repo's dogfood config at `.pi/settings.json` + `.pi/extensions/gitflow-guard.ts`, bilingual README / `package.json` / AGENTS.md §8 checklist synced —— 新增 Pi agent 接入:守卫以**进程内 Pi 扩展**形态装载(官方 `tool_call` 事件 + `{block:true, reason}` 拒绝返回值),随包发布 `pi/gitflow-guard.ts` 可直接复制进 `.pi/extensions/` 并经 `.pi/settings.json` 挂载;`src/pi.ts` 的 `createPiExtension()` 拦截 bash/powershell 的 git 系命令、委托守卫 CLI(`--platform claude` 仅为内部 exit-2 契约,非 Pi 协议),非 2 退出与内部异常一律 fail-open 放行,与 DSH 进程内路径一致。新增单测 `tests/pi.spec.ts`、复测矩阵 G 节(真实 CLI)、参考文档 `.agents/hooks/references/pi.md`、本仓库 dogfood 配置 `.pi/settings.json`;双语 README / `package.json` / AGENTS.md §8 清单同步。

## 0.0.16

- feat(repo): publish-time discoverability — add the `dsh-plugin` npm keyword, the term the DeepSeek Harness ecosystem indexes plugins by (the official repo topic and community plugin markets key on it); as part of the release, both README lock-version examples are synced to 0.0.16 —— 增加 `dsh-plugin` npm 关键词: DeepSeek Harness 生态索引插件所依的术语(官方仓库 topic 与社区插件市场均以其为键);本次发布同步双语 README 锁版本示例为 0.0.16。

## 0.0.15

- fix(guard): runtime state is now keyed by the shared repository via git-authoritative resolution (rev-parse --git-common-dir; fs gitdir-pointer parsing replaced after it broke on Windows 8.3 short paths) — previously each linked worktreehistory across directories (a silent semantic change from ≤0.0.13, where state lived inside the shared .git); the key now resolves the worktree gitdir pointer back to the main repository root, restoring shared semantics while keeping state outside any workspace —— 运行时状态改按共享仓库为键,而非每个 linked worktree:0.0.14 起按工作树根哈希,同一仓库的审计历史被分散到多个目录(相对 ≤0.0.13 存于共享 .git 是一次静默语义变化);现解析工作树 .git 指针回主仓库根,恢复共享语义且状态仍在任何工作区之外。新增真实 git worktree 集成测试。
- feat(repo): version-pin consistency guard — new `scripts/check-version-pins.mjs` asserts package.json version matches every `agents-gitflow-guard@x.y.z` pin in both READMEs and the `## <version>` CHANGELOG heading; wired into CI and `prepublishOnly`, so forgetting the README lock-version sync now fails machines instead of review eyes —— 新增版本锁定一致性守卫:`scripts/check-version-pins.mjs` 校验 package.json 版本与双语 README 全部 `agents-gitflow-guard@x.y.z` 锁定安装示例及 CHANGELOG `## <版本>` 小节标题一致;接入 CI 与 `prepublishOnly` 双挂载,漏改 README 锁版本从靠人眼变成机器拦截。
- docs(agents): stale-checkout pitfall recorded in AGENTS.md §7 (evidence: workspace parked on a 0.0.6-era main while develop was at 0.0.13) — pairs with the start-work skill —— AGENTS.md §7 补「会话工作区可能停在陈旧检出」陷阱条目(实证 0.0.6 main vs 0.0.13 develop),与 start-work 技能互为指路。

## 0.0.14

- feat(agents): new project skill `.agents/skills/start-work` — makes the "step-zero baseline check" loadable instead of memorized: every work session starts by fetching origin, verifying which ref the workspace sits on, deriving `feature/<topic>` from the latest `origin/develop`, with an inline branch-rule digest; pointer rule added to AGENTS.md §4 (the skill stays a soft constraint by design; mechanical enforcement remains hook-layer territory) —— 新增项目级技能 start-work,把「开工第零步·基线先行」做成可加载清单而非靠记忆:每次工作开始先 fetch、核对工作区停在哪个 ref、再从最新 `origin/develop` 切 `feature/<主题>`,内附分支规矩速览;AGENTS.md §4 补指路条目(skill 定位仍是软约束,机械兜底属 hook 层另议)。
- fix(guard): runtime data moved out of the repository — the audit log used to live at `<repo>/.git/gitflow-guard/audit.jsonl`, inside the agent-writable sandbox, where an agent could forge its own authorization trail to self-authorize; it now lives in the user-level state directory `~/.local/state/gitflow-guard/repos/<repo>-<path-hash>/` (`%LOCALAPPDATA%` on Windows), keyed by a realpath hash (macOS symlink / Windows 8.3 short-name safe), overridable via `GITFLOW_GUARD_STATE_ROOT`; the vitest setup redirects the root to the OS temp dir —— 运行时数据迁出仓库: 审计日志原位于 agent 可写区(`<repo>/.git/gitflow-guard/audit.jsonl`), agent 可伪造自身授权痕迹实现自我授权; 现改存用户级状态目录(键=真实路径哈希, 兼容 macOS 符号链接与 Windows 8.3 短名; `GITFLOW_GUARD_STATE_ROOT` 可覆盖); 测试经 setup 统一重定向到系统临时目录。双语 README 审计表述同步, design.md §10 记载防伪论证。
- docs(design): design.md rewritten as the single current spec for the role-driven model — goals & non-goals, gate matrix (incl. ref-move/ref-update), classifier hardening surface, config validation & strict fail-open grading, five-platform deny protocols, CLI, runtime-data storage (§10), testing strategy, and an evolution table from v0 to date — replacing the "historical banner" approach; the v0 text stays reachable via git history —— design.md 重写为角色驱动现行唯一规格(目标/门禁矩阵含 ref-move/ref-update/分类器硬化面/配置校验与 strict 失效分级/五平台拦截协议/CLI/运行时数据存储 §10/测试策略/v0 至今演进表), 取代「历史横幅」方案; v0 原文经 git 历史可达。

## 0.0.13

- docs(agents): releases now tag the post-merge develop tip instead of the feature branch (rebase merges rewrite SHAs — a branch-side tag dangles off-develop, as v0.0.12 did); new iron rule: one branch, one PR, delete the branch after merge —— 发版 tag 改为合并后从 `origin/develop` 打(annotated)；新增「一分支一 PR、合并即弃分支」铁律——复用已合并分支会形成两份平行履历并制造大面积假冲突(v0.0.12 悬空 tag 与 0.0.13 整改的复盘沉淀)。
- fix(guard): the classifier now covers the local ref-rewrite command family — `git reset` / `git rebase` / `git commit --amend` / `git filter-branch` classify as a new `ref-move` kind (denied on protected branches, free on feature branches, mirroring local-merge semantics); `git branch -m/-M/--move` renames and `-f/--force` pointer resets go through the ref-update gate; branch parsing scans all flags, closing the combined-flag bypass (`git branch -d --force develop`, `--delete --force`) —— 分类器收编「本地改写 refs」命令族(reset/rebase/amend/filter-branch → ref-move, 受保护分支上一律拒绝、feature 自由, 与 local-merge 同型)；branch 改名(移动受保护 ref)与强制复位按 ref-update 同级处理；parseBranch 改为全旗标扫描，堵住组合长旗标绕过。对抗语料同步进 accuracy-audit 与复测矩阵 A 节。
- fix(config): invalid regexes in role branch entries now fail validation at load time instead of silently never matching —— 角色条目非法正则在 normalizeRole 预编译报错(此前 matchBranchSpec 对编译失败 catch→return false，条目静默永不命中、保护无声消失且 status 无告警)；按既有 strict/fail-open 分级生效。
- feat(i18n): `MESSAGE_KEYS` is now re-exported from the package root, and both READMEs document custom locales with a copyable fenced example —— 包根补导出 `MESSAGE_KEYS`(自定义字典的必需键清单可发现，下游不必翻源码数键)，双语 README 的 registerLocale 说明补可复制示例。
- docs(readme): FAQ and the zh gate matrix corrected on archive PR creation — creating a PR/MR into archive has been allowed since 0.0.9; only the *merge* is denied —— 双语 FAQ 与中文门禁矩阵 archive 行修正为「✅ 可创建；🚫 合并被拦」(与 0.0.9 起的实现一致，消除同页自相矛盾)。另含第三轮文档整改：en「Adding a new agent client」示例改为真正未接入平台(Cursor/Windsurf)并补译 zh 段；zh 术语表 archive 行串列修复；Quick Start 引语块补空行(Step 2 不再被吞进引语框)；安装前置补 Node ≥ 22；开发段测试枚举更新(i18n/index/accuracy-audit)。
- docs(references): platform reference docs aligned with the implementation — codex.md now states the real deny encoding (always exit 0 + full `hookSpecificOutput` JSON shape + `turn_id` discriminator) instead of "exit code 2"; claude-code.md documents payload fields (`tool_input.command`/`cwd`/`tool_use_id`), exit-2 semantics, `${CLAUDE_PROJECT_DIR}` and points at an existing script; opencode.md notes the `$OPENCODE_PROJECT_DIR` path premise; new dsh.md records the DSH in-process protocol —— codex.md 对齐 encodeDeny 实际协议；claude-code.md 补三要素并修正不存在的示例脚本；opencode.md 补环境变量前提注记；新增 `.agents/hooks/references/dsh.md`(挂载经 patch.yml + dsh.bundle.patch、拦截经 apply() 返回值)，AGENTS.md §8 与 platform.ts 头注释写明 DSH 不走 stdin-hook 清单的例外。
- docs(design): design.md now carries a historical banner (v0 decisions superseded by the role-driven model shipped in 0.0.2) instead of claiming to be the current spec; verify-0.0.2.md got a time-point banner; stale local handoff notes removed —— design.md 顶部改历史横幅并修正「唯一规格/当前实现规格」表述，双语 README 链接文案同步为「已被 0.0.2 取代」；verify-0.0.2.md 加时点横幅(§3.4 记录 0.0.9 反转前行为)；删除过期本地交接记录(.gitignore 条目保留防复发)。
- chore(test): verify-matrix header comment lists all six sections (A-F); section E gains an allow case so all five hook platforms assert deny+allow pairs; explicit extract tests for codex/antigravity platforms —— 复测矩阵头注释补 F 节；E 节(Antigravity)补放行用例(五平台拦截+放行成对，27→36 PASS)；platform.spec 补 codex/antigravity 显式平台分支用例。
- chore(release): `npm publish --provenance` for supply-chain attestation at zero cost under GitHub Actions; patch.yml comments switched to English as part of the published file surface —— release.yml 发布加 provenance；patch.yml 注释改英文(该文件经 files 白名单随包发布)。

## 0.0.12
- fix(i18n): plugin degrade log and i18n load-time validation error are now English (`gitflow-guard: gate internal error, allowed through: …` / `dictionary keys mismatch`), aligned with the CLI wording —— 插件降级日志与 i18n 加载期校验异常统一为英文(与 CLI 口径一致), 遵循项目语言规范; `tests/index.spec.ts` 补 apply 降级日志断言。
- feat(cli): all CLI framework text (`--help`, unknown-command notice, repo-not-found, empty-audit) now follows the message locale instead of hardcoded English, and every subcommand accepts `--locale <en|zh>` (priority: CLI flag > project config > English) —— CLI 框架文案不再硬编码英文, 与 status 输出同口径; 新增 `--locale` 旗标(优先级: 旗标 > 项目配置 > en), 并同步传入门禁保证拦截正文与封装同语言。
- feat(i18n): new `registerLocale(name, dict)` runtime extension point for downstream packages; `Locale` widened to a hinted string; config `locale` accepts any string — unregistered locales warn (not error) and fall back to English —— 新增 `registerLocale(name, dict)` 运行时扩展点(键一致性复用内置校验); `Locale` 类型放宽; 配置 locale 放开为任意字符串, 未注册语言告警不禁用并回退英文(status 可见告警)。Entry 形态维持 `(vars) => string`, 复数/ICU 留待真实多语言需求出现时再评估。
- fix(cli): audit timestamps render as ISO 8601 UTC instead of machine-locale `toLocaleString()` —— audit 时间戳改为 ISO 8601(UTC), 不随机器 locale/时区变化。
- chore(package): add missing npm metadata — `bugs`, `homepage`, `engines` (`node >=22`, floor aligned with the CI matrix; Node 20 is EOL) and `"sideEffects": false` for consumer tree-shaking —— 补全包元数据(bugs/homepage/engines/sideEffects), engines 下限与 CI 矩阵最低档一致(Node 20 已 EOL), `sideEffects: false` 支持下游 tree-shaking。
- feat(i18n): `registerLocale` is now re-exported from the package root so downstream packages can actually import it; bilingual README documents custom locales (register → set `"locale"`) and where the unknown-locale warning shows —— 包根补导出 `registerLocale` 与字典类型(此前仅内部模块可见, 下游无法导入); README 双语新增「自定义语言 / 未注册语言」说明, locale 字段注释同步更新(未注册值 status 告警并回退英文)。
- docs(readme): bilingual parity fixes — the zh Development section now lists `npm run verify:matrix` and requires a green matrix in the iron rule; the verify:matrix description matches all six regression sections (DSH logic, zh locale, Claude Code / Codex / OpenCode / Antigravity); the config-mistake FAQ no longer mislabels the default warn-and-allow behavior as failing closed; pinned install examples bumped to 0.0.12 —— zh 版开发段补 `npm run verify:matrix` 与矩阵全绿铁律(双语文档对等); verify:matrix 描述与脚本六节(A-F)一一对应; FAQ「配置写错」不再把默认告警放行误称为 fail-closed; 锁版本示例统一为 0.0.12。
- docs: bilingual README notes on regex safety (branch patterns are project-authored; avoid catastrophic backtracking) and on CLI language behavior —— README 双语补分支正则 ReDoS 提示与 CLI 文案语言行为说明。
- test(platform): cover the `check --command` platform fallback (empty payload → claude protocol, exit 2) with in-code comments documenting the semantics —— `--command + auto` 平台回退语义(claude 协议)补注释与断言。

## 0.0.11

- feat: fail-open 分级告警与 strict 策略位 —— 配置损坏/校验失败导致「未启用」时 stderr 输出一行告警(不再静默; exit 仍 0, 不破坏各平台工具管道); 新增可选 `"strict": true` 配置位, 该模式下配置异常与内部错误改为 fail-closed(拦截), 供高风险仓库选用; 配置文件缺失与显式 `enabled: false` 维持静默(opt-in 语义不变)。README 双语补 strict 字段说明。
- fix: 分类器硬化(第二批) —— 通配 refspec(`refs/heads/*:refs/heads/*` 等)按 `--all` 同级拦截; `git pull` 提取 refspec 目标走本地合入门禁(fetch+merge 不再绕过); plumbing 收编(`send-pack` 按推送语义分类, `update-ref` 直改受保护分支 refs 一律拒绝); 裸推与 `HEAD` 推送的目标延迟到门禁按模拟分支解析(修复「切到集成分支后裸推」从 feature 发起被放行的缺口), 单个非 flag 参数的 remote/refspec 歧义按双解释保守判定。对抗语料扩充覆盖 §1.1 全部可本地防御样本; README 双语局限一节更新为硬化后事实(仅 forge API 直连与解释器子进程不可本地防御)。
- fix: 分类器硬化(第一批) —— 拆分 `||` 与 `|` 后半段独立分类; 识别 shell 包装(`sh/bash/zsh -c`, 含 `-lc` 合并短旗标)与执行前缀(`env`/`command`/`nohup`/`xargs`/绝对路径/`VAR=x`)递归解包; 反引号与 `$()` 内层命令一并送分类(单引号内不展开); 子 shell 括号包裹剥离; 剥离子命令前的 git 全局选项(`-C`/`-c k=v`/`--git-dir`/`--work-tree` 等)再取子命令。整改 §1.1 对抗样本(shell 包装/git 形态两类)收编为回归语料。
- fix: pr-merge 目标无法解析(gh/glab 未装/未认证/离线)时一律拒绝 —— 原先按 feature head 放行,而该场景下 PR 可能实际指向 production/archive,「生产仅用户点合并」的承诺曾在此失效; 同步移除失效文案键。
- docs: README 双语「安全工具」问答如实化 —— 移除「角色边界本身无法绕过」过度承诺,列出实测穿透文本层的混淆形态与已知本地不可防通道(forge API 直连、解释器子进程内嵌),明确服务端分支保护为最终边界; gh/glab FAQ 改为与新行为一致; AGENTS.md §8 Copilot 口径对齐官方 hooks 现状。

## 0.0.10

- docs: 安装文档准确性 —— 快速开始/registry 安装补「锁版本」姿势与版本坑提示(registry 缓存/镜像陈旧时裸 add 可能拿旧版); 说明 pnpm peer WARN 属预期(DSH 启动经共享回退提供 cordis/dsh-tools)。README 双语随包发布。

## 0.0.9

- feat: 归档(archive)策略调整 —— agent 允许**创建**指向 archive 的 PR/MR(便于起草 develop→main 归档 PR), 合并仍限用户亲手; 移除旧「agent 不得创建归档 PR」限制。
- fix: 命令解析准确性 —— `git push +src:dst` 的 `+` 前缀正确识别为强推; `git push --tags` 不再被误判为分支推送(消除受保护分支上的误拦); 新增 15 项对抗性回归测试。
- ci: 跨平台矩阵 —— ubuntu / macOS / Windows × Node 22/24 全量运行(含 verify:matrix); .gitattributes 强制 LF; 修复 Windows 8.3 短名路径的测试规范化。

## 0.0.8

- docs: GitHub Copilot 明确不提供 hook(原生规则覆盖) —— 移除 copilot 占位平台(3 行未完成分支), README 双语/AGENTS.md §8 说明原因并附官方文档链接; 同步 bump。

## 0.0.7

- chore: 发布同步 —— PR #9(AGENTS.md 流程规范化) 合入后 bump 版本; 无功能变更(0.0.7 tarball 与 0.0.6 一致)。

## 0.0.6

- fix: Antigravity 拦截协议修正 —— Gemini CLI 已并入 Antigravity 2.0; 官方 decision 合法值仅 allow|deny|ask|force_ask, 拦截须输出 `{"decision":"deny","reason":...}` 且 **exit 0**(不能包 hookSpecificOutput、不能用非法值 "block")。
- feat: Antigravity 支持(dogfood `.agents/hooks.json` + 参考文档 gemini.md → antigravity.md + HOOKS.md 同步; 宣传语/description/keywords 追加 Antigravity)。
- docs: 平台清单补 Antigravity(位于 AGENTS.md §8 已管理的五个客户端)。

## 0.0.5

- feat: OpenCode 支持 —— 新增 `.opencode/hook/hooks.yaml`(tool.before.bash → `gitflow-guard check --platform opencode`, stdin `tool_args.command`, bash action exit 2 阻断);`platform.ts` 加 opencode 判别/extract/encode, 单测与复测矩阵同步覆盖。
- docs: 宣传语/description/keywords 追加上 OpenCode(hook 段补齐三方配置示例);USAGE 的平台枚举同步。

## 0.0.4

- feat: Codex 支持 —— 新增 `.codex/hooks.json`(PreToolUse → `gitflow-guard check --platform codex`), 复用已有 `permissionDecision:"deny"` 协议; 宣传语从"for DSH"改口为"for AI coding agents (DSH / Claude Code / Codex)", keywords 补 claude-code/codex/hook。
- tooling: 新增连续复测矩阵 `scripts/verify-matrix.mjs`(`npm run verify:matrix`)—— DSH 核心逻辑 + Claude Code / Codex / antigravity + zh 全链路回归, 已接入 CI 每次 push/PR 执行。
- docs: AGENTS.md §8「客户端支持清单」固化"每加一个客户端必须逐项同步"的 9 项检查;README 双语补 Codex hook 配置与宣传语。

## 0.0.3

- feat: i18n —— 拦截/CLI 文案默认英文, 项目可用 `"locale": "zh"` 切中文。
- docs: README 首页改纯英文; 新增 `docs/verify-0.0.2.md` 普通用户端到端验证报告。

## 0.0.2

- **feat: 可自由配置的分支角色守卫** —— 把固定「feature → 预览 → 基线 → 主干」模型重构为角色驱动:
  - 配置入口 `gitflow-guard.config.json`:`integration` 为唯一必填;`preview` / `production` / `archive` 均为可选数组(支持精确分支名或正则), 按需启用。
  - 每角色独立规则:`update`(pr=只走 PR/MR / flexible=允许直推)、`mergeBy`(production 默认 user=只能你点合并)。
  - 门禁按角色驱动;受保护分支 = integration/preview/production/archive;生产与归档合并**仅限用户**(agent 可建 MR, 但合并必须你点)。
  - 移除不再需要的特许系统(permit/confirm/session/permits), 以「你的合并点击」为唯一确认。
  - 平台: 新增 GitLab `glab`(MR)适配, 与 GitHub `gh` 并存。
  - CLI: 仅保留 status/audit/check;status 按角色列出本地分支。
  - typecheck 0 Error, 106 个单元/集成测试全绿。
- feat: Claude Code hook —— 新增 `gitflow-guard check` 子命令(读 hook payload 做门禁, exit 0=放行 / 2=拦截), `.claude/settings.json` 自带 PreToolUse + PostToolUse/PostToolUseFailure 配置; 非 git 命令快路径零开销, 内部错误 fail-open。

## 0.0.1

- 首版以 `agents-gitflow-guard` 发布 npm(由曾用包名更名而来)。
- docs: `.agents/` 全部改英文(开源就绪), 子智能体去掉 `model:` 字段(模型选择本地化)。
