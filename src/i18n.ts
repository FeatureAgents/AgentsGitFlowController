// i18n: 用户可见文案(内置 en/zh, 可经 registerLocale 运行时扩展)。默认 en; 项目可在 gitflow-guard.config.json 用 "locale" 切换。
// 设计: 所有用户/agent 可见的拦截文案、CLI 输出都走 makeT(locale)(key, vars) 插值;
// 配置文件校验报错属开发者诊断信息, 统一英文, 不随 locale 变。
// 日志/异常信息遵循项目规范用英文。
// 复数/ICU(P2-6 决策留档): Entry 保持 `(vars) => string` 单条目函数形态——当前全部文案无单复数变化,
// 不引入 ICU 依赖; 未来扩展多复数语言(ja/es/de/ru)时可在 Entry 内部按 Intl.PluralRules 选变体, 或届时报数后再引入 MessageFormat 依赖。

import type { Locale } from './types'

export type { Locale }

/** 可插值变量(分支名/角色名等) */
export type I18nVars = Record<string, string>

/** 单一文案条目: (vars) => 最终文本 */
export type Entry = (v: I18nVars) => string

/** 一门语言的文案字典: key 集合必须与内置 en 完全一致(registerLocale / 加载期校验) */
export type Dict = Record<string, Entry>

const en: Dict = {
  // —— 角色名(roleLabel 用) ——
  'role.integration': () => 'integration branch',
  'role.preview': () => 'preview branch',
  'role.production': () => 'production branch',
  'role.archive': () => 'archive branch',
  'role.feature': () => 'feature branch',
  'role.other': () => 'other branch',
  'head.unknown': () => 'current branch',

  // —— gate: 拦截(why)与引导(next) ——
  'denyDeleteOrForce.why': (v) => `Protected branch "${v.branch}" may not be deleted or force-pushed`,
  'denyDeleteOrForce.next': () =>
    'Delete/force-push on a feature branch outside the protected branches; protected branches are managed by you.',
  'refUpdateProtected.why': (v) =>
    `Protected branch "${v.branch}" forbids direct ref updates (update-ref / symbolic-ref / branch -m|-f / checkout -B)`,
  'refUpdateProtected.next': () => 'Update protected branches via PR/MR; they are managed by you.',
  'refMoveProtected.why': () =>
    'Rewriting history on a protected branch (reset / rebase / commit --amend / filter-branch / cherry-pick / revert) is not allowed',
  'refMoveProtected.next': () => 'Do history rewrites on a feature branch; protected branches advance via PR/MR and are managed by you.',
  'pushAll.why': () => '--all/--mirror push would include protected branches',
  'pushAll.next': () => 'Push branch by branch with an explicit refspec.',
  'pushDetached.why': () => 'Cannot determine the push target (detached HEAD?)',
  'pushDetached.next': () => 'Specify the refspec explicitly, e.g. `git push origin <branch>`.',
  'pushProtectedDelete.why': (v) => `Protected branch "${v.branch}" may not be deleted`,
  'pushProtectedDirect.why': (v) => `Protected branch "${v.branch}" forbids direct push`,
  'pushProtectedDirectForce.why': (v) => `Protected branch "${v.branch}" forbids direct push (force)`,
  'mergeProtected.why': (v) => `Merging into ${v.role} is allowed only by the user`,
  'mergeProtected.next': () => `Do the merge in your own terminal (or UI); the agent can't do it for you.`,
  'mergeFeature.why': (v) => `${v.role} forbids local merge of a feature: use PR/MR`,
  'mergeFeature.next': (v) => `Push the feature branch first, then open a PR/MR into ${v.branch}.`,
  'prCreateNoTarget.why': () => 'Cannot determine the PR/MR target branch',
  'prCreateNoTarget.next': (v) =>
    `Specify --base/--target-branch explicitly (e.g. \`gh pr create --base ${v.base}\`).`,
  'prCreateHead.why': (v) =>
    `Current branch (${v.head}) is not a feature branch, so it cannot be the source of a PR/MR into ${v.role}`,
  'prCreateHead.next': () => 'Open the PR/MR into integration/preview/production from a feature/topic branch.',
  'prMergeProduction.why': () => 'Merging into production is allowed only by you (click merge)',
  'prMergeProduction.next': () => 'Click merge yourself on the PR/MR page.',
  'prMergeArchive.why': () => 'Merging into an archive branch is allowed only by the user',
  'prMergeArchive.next': () => 'Let the user do the archive merge in their terminal or UI.',
  'prMergeUnknown.why': () => 'Cannot confirm the PR/MR target branch',
  'prMergeUnknown.next': () => 'Retry once gh/glab is available, or let the user handle it.',

  // —— branchNext(受保护分支被拦后的下一步) ——
  'next.integration': (v) =>
    `Integration branch (${v.branch}) is updated via PR/MR from a feature branch: push the feature first, then \`gh pr create --base ${v.branch}\` / \`glab mr create --target-branch ${v.branch}\`.`,
  'next.preview': (v) =>
    `Preview branch (${v.branch}) only accepts PR/MRs: open a PR/MR into it from a feature/release branch (content of ${v.base} etc. first goes into a feature release branch).`,
  'next.production': (v) =>
    `Production branch (${v.branch}) is PR/MR-only, and you click the merge yourself.`,
  'next.archive': (v) => `Archive branch (${v.branch}) is user-managed only.`,
  'next.unspecified': () => 'Retry once the target branch is clear.',

  // —— 拦截封装 ——
  'deny.header': (v) => `[gitflow-guard] blocked: ${v.why}`,
  'deny.next': (v) => `Next: ${v.next}`,

  // —— CLI ——
  'cli.unknownCommand': (v) => `[gitflow-guard] unknown subcommand: ${v.cmd}`,
  'cli.cannotLocate': () => 'Cannot locate a git repository',
  'cli.statusTitle': (v) => `[gitflow-guard] status — ${v.repo}`,
  'cli.statusDisabled': () => 'Config: not enabled (no gitflow-guard.config.json or enabled=false)',
  'cli.statusConfigError': (v) => `  config error: ${v.err}`,
  'cli.statusConfigWarning': (v) => `  config warning: ${v.warn}`,
  'cli.statusEnabled': (v) => `Config: enabled | featurePattern: ${v.pattern}`,
  'cli.statusIntegration': (v) => `Integration: ${v.list} (update=${v.mode})`,
  'cli.statusPreview': (v) => `Preview: ${v.list} (update=${v.mode})`,
  'cli.statusProduction': (v) => `Production: ${v.list} (update=${v.mode}, merge=${v.merge})`,
  'cli.statusArchive': (v) => `Archive: ${v.list}`,
  'cli.statusCurrentBranch': (v) => `Current branch: ${v.branch}`,
  'cli.statusUnknownBranch': () => '(unknown)',
  'cli.statusLocalBranches': () => 'Local branches (by role):',
  'cli.auditEmpty': () => '  No audit entries yet',
  'cli.checkInternalError': (v) => `[gitflow-guard] check internal error, allowed through: ${v.msg}`,
  'cli.guardDisabledInvalidConfig': (v) => `[gitflow-guard] guard disabled: invalid config: ${v.err}`,
  // —— wire / setup / 默认配置引导 ——
  'cli.wireUnknownClient': (v) => `unknown client: ${v.client} (expected dsh|claude|codex|opencode|antigravity|pi)`,
  'cli.wireNeedRepo': () => 'project scope needs a git repository — run inside a repo or pass --repo <path>',
  'cli.wireScopeAsk': () => 'Scope — project (this repo only) or global (all repos on this machine)? [project/global] ',
  'cli.wireScopeInvalid': () => 'invalid scope (expected project or global)',
  'cli.wireTarget': (v) => `${v.client}: wiring → ${v.path}`,
  'cli.wireAlready': (v) => `${v.client}: hook already wired (${v.path})`,
  'cli.wireCreated': (v) => `${v.client}: hook written → ${v.path}`,
  'cli.wireRemoved': (v) => `${v.client}: hook removed → ${v.path}`,
  'cli.wireNotWired': (v) => `${v.client}: no hook entry found (${v.path})`,
  'cli.wireConfirmWrite': (v) => `Write ${v.path}? [y/N] `,
  'cli.wireRefuseGlobal': () => 'Refusing to modify a global config without confirmation — pass --yes to allow',
  'cli.wireDshGuide': () => 'DSH is an in-process plugin — no hook file to write. Mount it with: dsh plugin --profile web add agents-gitflow-guard',
  'cli.wirePiGuide': () => 'Pi is an in-process extension — no hook file to write. Copy pi/gitflow-guard.ts into .pi/extensions/ and list it in .pi/settings.json (see README).',
  'cli.wireExperimental': (v) => `${v.client}: experimental support — verify the hook on a real device before relying on it`,
  'cli.wireDryRunAdd': (v) => `${v.client}: [dry-run] would add hook → ${v.path}`,
  'cli.wireDryRunRemove': (v) => `${v.client}: [dry-run] would remove hook → ${v.path}`,
  'cli.wireDryRunNoOp': (v) => `${v.client}: [dry-run] nothing to do (${v.path})`,
  'cli.statusUsingDefaults': () => 'Config: built-in defaults (no gitflow-guard.config.json) — integration=develop, archive=main',
  'cli.statusMainProtected': () => '  main is protected by default. Trunk / single-branch users: create gitflow-guard.config.json with "enabled": false, or map your own branches.',
  'cli.statusWireHints': () => 'Wiring:',
  'cli.statusWireHint': (v) => `  ${v.client}: not wired — run: gitflow-guard wire --client ${v.client}`,
  'cli.setupIntro': () => 'gitflow-guard setup — wire one client for this project. (Ctrl+C to cancel)',
  'cli.setupClientAsk': () => 'Which client? [dsh|claude|codex|opencode|antigravity|pi] ',
  'cli.setupClientInvalid': () => 'invalid client (expected dsh|claude|codex|opencode|antigravity|pi)',
  'cli.setupNoTty': () => 'setup needs an interactive terminal — use: gitflow-guard wire --client <name> --yes',
  'guardStrictConfigBroken.why': () => 'Guard config is invalid while strict mode is enabled',
  'guardStrictConfigBroken.next': () => 'Fix gitflow-guard.config.json (or remove "strict": true) before retrying.',
  'guardStrictInternalError.why': (v) => `Guard internal error while strict mode is enabled: ${v.msg}`,
  'guardStrictInternalError.next': () => 'Fix or remove "strict": true in gitflow-guard.config.json.',
  'usage.text': () => `gitflow-guard — GitFlow guard CLI

Usage:
  gitflow-guard status [--repo <path>] [--locale <en|zh>]
  gitflow-guard audit [--lines <count>] [--repo <path>] [--locale <en|zh>]
  gitflow-guard check [--platform <auto|claude|codex|opencode|antigravity>] [--command "<cmd>"] [--repo <path>] [--locale <en|zh>]
  gitflow-guard wire --client <dsh|claude|codex|opencode|antigravity|pi> [--project|--global] [--unwire] [--dry-run] [--yes] [--repo <path>] [--locale <en|zh>]
  gitflow-guard setup [--repo <path>] [--locale <en|zh>]
  gitflow-guard --help

Notes:
  status/audit are read-only; the agent can self-inspect.
  --locale overrides the message language for this invocation (flag > project config > English).
  check reads the hook payload on stdin (platform-specific protocol: claude/opencode exit 2,
  codex/antigravity JSON on stdout) and is meant for pre/post hooks of AI agents.
  wire writes each client's hook config into the project (default) or global scope; dsh/pi are
  in-process and only print guidance. No config file needed — built-in defaults (develop+main)
  apply out of the box; create gitflow-guard.config.json to override, or set "enabled": false to turn off.`,
}

const zh: Dict = {
  'role.integration': () => '集成分支',
  'role.preview': () => '预览分支',
  'role.production': () => '生产分支',
  'role.archive': () => '归档分支',
  'role.feature': () => 'feature 分支',
  'role.other': () => '普通分支',
  'head.unknown': () => '当前分支',

  'denyDeleteOrForce.why': (v) => `受保护分支「${v.branch}」禁止删除或强推`,
  'denyDeleteOrForce.next': () => '删除/强推请到受保护分支外的 feature 分支上操作; 受保护分支由用户亲手管理',
  'refUpdateProtected.why': (v) =>
    `受保护分支「${v.branch}」禁止直接改写 refs(update-ref / symbolic-ref / branch -m|-f / checkout -B)`,
  'refUpdateProtected.next': () => '请通过 PR/MR 更新受保护分支; 受保护分支由用户亲手管理',
  'refMoveProtected.why': () =>
    '受保护分支禁止本地改写历史(reset / rebase / commit --amend / filter-branch / cherry-pick / revert)',
  'refMoveProtected.next': () => '历史改写请在 feature 分支上进行; 受保护分支仅经 PR/MR 推进, 由用户亲手管理',
  'pushAll.why': () => '--all/--mirror 推送会包含受保护分支',
  'pushAll.next': () => '请逐分支推送并显式指定 refspec',
  'pushDetached.why': () => '无法确定推送目标分支(可能处于 detached HEAD)',
  'pushDetached.next': () => '请显式指定 refspec, 如 git push origin <分支名>',
  'pushProtectedDelete.why': (v) => `受保护分支「${v.branch}」禁止删除`,
  'pushProtectedDirect.why': (v) => `受保护分支「${v.branch}」禁止直推`,
  'pushProtectedDirectForce.why': (v) => `受保护分支「${v.branch}」禁止直推(含强推)`,
  'mergeProtected.why': (v) => `合入${v.role}仅允许用户亲手执行`,
  'mergeProtected.next': () => '请在你自己终端(或 UI)完成该合并; agent 不能替你操作',
  'mergeFeature.why': (v) => `${v.role}禁止本地合入 feature: 须通过 PR/MR`,
  'mergeFeature.next': (v) => `先推 feature 分支, 再创建指向 ${v.branch} 的 PR/MR`,
  'prCreateNoTarget.why': () => '无法确定 PR/MR 目标分支',
  'prCreateNoTarget.next': (v) => `请显式指定 --base/--target-branch(如 gh pr create --base ${v.base})`,
  'prCreateHead.why': (v) => `当前分支(${v.head})不是 feature 分支, 不能作为指向${v.role}的 PR/MR 源`,
  'prCreateHead.next': () => '请从 feature/topic 分支上创建指向集成/预览/生产分支的 PR/MR',
  'prMergeProduction.why': () => '合入生产(production)分支仅允许用户亲手点合并',
  'prMergeProduction.next': () => '请在 GitLab/GitHub 的 MR/PR 页面上由你本人点击合并',
  'prMergeArchive.why': () => '合入归档分支(archive)仅允许用户亲手执行',
  'prMergeArchive.next': () => '请让用户在自己终端或 UI 完成归档合并',
  'prMergeUnknown.why': () => '无法确认 PR/MR 的目标分支',
  'prMergeUnknown.next': () => '请确认 gh/glab 可用后重试, 或让用户亲手处理',

  'next.integration': (v) =>
    `集成分支(${v.branch})由 PR/MR 合入 feature: 先推 feature 分支, 再 gh pr create --base ${v.branch} / glab mr create --target-branch ${v.branch}`,
  'next.preview': (v) =>
    `预览分支(${v.branch})只收 PR/MR: 从 feature/发布分支创建指向它的 PR/MR(${v.base} 等集成分支内容先进 feature 发布分支)`,
  'next.production': (v) => `生产分支(${v.branch})只能 PR/MR, 且合并由你亲手点击`,
  'next.archive': (v) => `归档分支(${v.branch})仅用户亲手操作`,
  'next.unspecified': () => '请明确目标分支后重试',

  'deny.header': (v) => `[gitflow-guard] 已拦截: ${v.why}`,
  'deny.next': (v) => `下一步: ${v.next}`,

  'cli.unknownCommand': (v) => `[gitflow-guard] 未知子命令: ${v.cmd}`,
  'cli.cannotLocate': () => '无法定位 git 仓库',
  'cli.statusTitle': (v) => `[gitflow-guard] status — ${v.repo}`,
  'cli.statusDisabled': () => '配置: 未启用(不存在 gitflow-guard.config.json 或 enabled=false)',
  'cli.statusConfigError': (v) => `  配置错误: ${v.err}`,
  'cli.statusConfigWarning': (v) => `  配置警告: ${v.warn}`,
  'cli.statusEnabled': (v) => `配置: 已启用 | featurePattern: ${v.pattern}`,
  'cli.statusIntegration': (v) => `集成分支: ${v.list} (update=${v.mode})`,
  'cli.statusPreview': (v) => `预览分支: ${v.list} (update=${v.mode})`,
  'cli.statusProduction': (v) => `生产分支: ${v.list} (update=${v.mode}, 合并=${v.merge})`,
  'cli.statusArchive': (v) => `归档分支: ${v.list}`,
  'cli.statusCurrentBranch': (v) => `当前分支: ${v.branch}`,
  'cli.statusUnknownBranch': () => '(未知)',
  'cli.statusLocalBranches': () => '本地分支(按角色):',
  'cli.auditEmpty': () => '  暂无审计记录',
  'cli.checkInternalError': (v) => `[gitflow-guard] check 内部错误, 已放行: ${v.msg}`,
  'cli.guardDisabledInvalidConfig': (v) => `[gitflow-guard] 守卫未启用: 配置无效: ${v.err}`,
  // —— wire / setup / 默认配置引导 ——
  'cli.wireUnknownClient': (v) => `未知客户端: ${v.client}(应为 dsh|claude|codex|opencode|antigravity|pi)`,
  'cli.wireNeedRepo': () => '项目级作用域需要一个 git 仓库 — 请在仓库内运行, 或传 --repo <路径>',
  'cli.wireScopeAsk': () => '作用域 — project(仅当前仓库) 还是 global(本机所有仓库)? [project/global] ',
  'cli.wireScopeInvalid': () => '无效作用域(应为 project 或 global)',
  'cli.wireTarget': (v) => `${v.client}: 接线 → ${v.path}`,
  'cli.wireAlready': (v) => `${v.client}: hook 已接线(${v.path})`,
  'cli.wireCreated': (v) => `${v.client}: hook 已写入 → ${v.path}`,
  'cli.wireRemoved': (v) => `${v.client}: hook 已移除 → ${v.path}`,
  'cli.wireNotWired': (v) => `${v.client}: 未找到 hook 条目(${v.path})`,
  'cli.wireConfirmWrite': (v) => `写入 ${v.path}? [y/N] `,
  'cli.wireRefuseGlobal': () => '拒绝在未确认时改动全局配置 — 传 --yes 允许',
  'cli.wireDshGuide': () => 'DSH 是进程内插件, 无需写入 hook 文件。挂载: dsh plugin --profile web add agents-gitflow-guard',
  'cli.wirePiGuide': () => 'Pi 是进程内扩展, 无需写入 hook 文件。把 pi/gitflow-guard.ts 拷到 .pi/extensions/ 并在 .pi/settings.json 登记(见 README)',
  'cli.wireExperimental': (v) => `${v.client}: 实验支持 — 请在真机核验后再依赖它`,
  'cli.wireDryRunAdd': (v) => `${v.client}: [dry-run] 将添加 hook → ${v.path}`,
  'cli.wireDryRunRemove': (v) => `${v.client}: [dry-run] 将移除 hook → ${v.path}`,
  'cli.wireDryRunNoOp': (v) => `${v.client}: [dry-run] 无需改动(${v.path})`,
  'cli.statusUsingDefaults': () => '配置: 内置默认(无 gitflow-guard.config.json)— integration=develop, archive=main',
  'cli.statusMainProtected': () => '  main 默认受保护。Trunk/单分支用户: 创建 gitflow-guard.config.json 写 "enabled": false, 或自行映射分支',
  'cli.statusWireHints': () => '接线:',
  'cli.statusWireHint': (v) => `  ${v.client}: 未接线 — 运行: gitflow-guard wire --client ${v.client}`,
  'cli.setupIntro': () => 'gitflow-guard setup — 为本项目接线一个客户端。(Ctrl+C 取消)',
  'cli.setupClientAsk': () => '选哪个客户端? [dsh|claude|codex|opencode|antigravity|pi] ',
  'cli.setupClientInvalid': () => '无效客户端(应为 dsh|claude|codex|opencode|antigravity|pi)',
  'cli.setupNoTty': () => 'setup 需要交互终端 — 请用: gitflow-guard wire --client <名字> --yes',
  'guardStrictConfigBroken.why': () => '守卫配置无效, 且已启用 strict 模式',
  'guardStrictConfigBroken.next': () => '请先修复 gitflow-guard.config.json(或移除 "strict": true)后重试',
  'guardStrictInternalError.why': (v) => `守卫内部错误, 且已启用 strict 模式: ${v.msg}`,
  'guardStrictInternalError.next': () => '请修复 gitflow-guard.config.json 或移除 "strict": true',
  'usage.text': () => `gitflow-guard — GitFlow 流程守卫 CLI

用法:
  gitflow-guard status [--repo <路径>] [--locale <en|zh>]
  gitflow-guard audit [--lines <数量>] [--repo <路径>] [--locale <en|zh>]
  gitflow-guard check [--platform <auto|claude|codex|opencode|antigravity>] [--command "<cmd>"] [--repo <路径>] [--locale <en|zh>]
  gitflow-guard wire --client <dsh|claude|codex|opencode|antigravity|pi> [--project|--global] [--unwire] [--dry-run] [--yes] [--repo <路径>] [--locale <en|zh>]
  gitflow-guard setup [--repo <路径>] [--locale <en|zh>]
  gitflow-guard --help

说明:
  status/audit 只读, agent 可自查。
  --locale 可临时覆盖本次调用的文案语言(旗标 > 项目配置 > 英文)。
  check 读 stdin hook payload 做门禁(平台协议: claude/opencode exit 2, codex/antigravity stdout JSON),
  供 Claude Code / Codex / OpenCode 等 agent 的 pre/post hook 调用。
  wire 把各客户端默认 hook 写入工程(默认)或全局作用域; dsh/pi 为进程内接入, 仅打印引导。
  无需配置文件 — 内置默认(develop+main)开箱即用; 建 gitflow-guard.config.json 可覆盖, 或写 "enabled": false 关闭。`,
}

/** 内置文案注册表: en 为兜底语言; 下游可经 registerLocale 追加 */
const dicts = new Map<string, Dict>([
  ['en', en],
  ['zh', zh],
])

export const MESSAGE_KEYS: readonly string[] = Object.keys(en)

/** 字典键一致性校验(与内置 en 完全一致), 失败抛英文异常(P0-2: 异常信息遵循语言规范) */
function assertDictKeys(name: string, dict: Dict): void {
  const keys = Object.keys(dict)
  if (keys.length !== MESSAGE_KEYS.length || MESSAGE_KEYS.some((k) => !(k in dict))) {
    throw new Error(`i18n: locale "${name}" dictionary keys mismatch the built-in "en" dictionary`)
  }
}

// 内置 en/zh 键一致性校验(加载期一次)
assertDictKeys('zh', zh)

/**
 * 注册一门新语言(运行时扩展点, P2-2): key 集合必须与内置 en 完全一致, 否则抛英文异常。
 * 注册后 makeT/resolveLocale 即接受该 locale; 未注册的 locale 一律回退英文。
 */
export function registerLocale(name: string, dict: Dict): void {
  assertDictKeys(name, dict)
  dicts.set(name, dict)
}

/**
 * 生成翻译函数。未注册 locale / 未知 key 均回退英文(开发/防御性)。
 */
export function makeT(locale: Locale): (key: string, vars?: I18nVars) => string {
  const dict = dicts.get(locale) ?? en
  return (key, vars = {}) => {
    const entry = dict[key] ?? en[key]
    if (!entry) return key
    try {
      return entry(vars)
    } catch {
      return key
    }
  }
}

/** 解析配置里的 locale 值: 白名单语义 = 已注册语言原样通过, 其余(含未定义)一律英文(P2-2 后白名单随注册表扩展) */
export function resolveLocale(v: unknown): Locale {
  return typeof v === 'string' && dicts.has(v) ? v : 'en'
}
