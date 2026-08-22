# Changelog

本仓库/包统一为 **`agents-gitflow-guard`**(放弃旧包名, 旧包已不维护)。
自 0.0.12 起条目改为**中英双语**(国际化发布面); 历史条目保留中文不追溯。

## 0.0.13

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
- feat(i18n): new `registerLocale(name, dict)` runtime extension point for downstream packages; `Locale` widened to a hinted string; config `locale` accepts any string — unregistered locales warn (not error) and fall back to English —— 新增 `registerLocale(name, dict)` 运行时扩展点(键一致性复用内置校验); `Locale` 类型放宽; 配置 locale 放开为任意字符串, 未注册语言告警不禁用并回退英文(status 可见告警)。Entry 形态维持 `(vars) => string`, 复数/ICU 留待真实多语言需求(决策留档 docs/issues.md P2-6)。
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
