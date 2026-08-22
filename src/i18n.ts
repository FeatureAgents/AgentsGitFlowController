// i18n: 用户可见文案(en/zh)。默认 en; 项目可在 gitflow-guard.config.json 用 "locale" 切 zh。
// 设计: 所有用户/agent 可见的拦截文案、CLI 输出都走 makeT(locale)(key, vars) 插值;
// 配置文件校验报错属开发者诊断信息, 统一英文, 不随 locale 变。
// 日志/异常信息遵循项目规范用英文。

import type { Locale } from './types'

export type { Locale }

/** 可插值变量(分支名/角色名等) */
export type I18nVars = Record<string, string>

/** 单一文案条目: (vars) => 最终文本 */
type Entry = (v: I18nVars) => string

type Dict = Record<string, Entry>

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
  'usage.text': () => `gitflow-guard — GitFlow guard CLI

Usage:
  gitflow-guard status [--repo <path>]
  gitflow-guard audit [--lines <count>] [--repo <path>]
  gitflow-guard check [--platform <auto|claude|codex|opencode|antigravity>] [--command "<cmd>"] [--repo <path>]
  gitflow-guard --help

Notes:
  status/audit are read-only; the agent can self-inspect.
  check reads the hook payload on stdin (platform-specific protocol: claude/opencode exit 2,
  codex/antigravity JSON on stdout) and is meant for pre/post hooks of AI agents.`,
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
  'usage.text': () => `gitflow-guard — GitFlow 流程守卫 CLI

用法:
  gitflow-guard status [--repo <路径>]
  gitflow-guard audit [--lines <数量>] [--repo <路径>]
  gitflow-guard check [--platform <auto|claude|codex|opencode|antigravity>] [--command "<cmd>"] [--repo <路径>]
  gitflow-guard --help

说明:
  status/audit 只读, agent 可自查。
  check 读 stdin hook payload 做门禁(平台协议: claude/opencode exit 2, codex/antigravity stdout JSON),
  供 Claude Code / Codex / OpenCode 等 agent 的 pre/post hook 调用。`,
}

const MESSAGE_KEYS = Object.keys(en)
/** key 合法性与 en/zh 双字典完整性检查(开发期一次) */
if (Object.keys(zh).length !== MESSAGE_KEYS.length || MESSAGE_KEYS.some((k) => !(k in zh))) {
  throw new Error('i18n: en/zh 字典键不一致')
}

/**
 * 生成翻译函数。未知 key 回退英文原文(开发/防御性)。
 */
export function makeT(locale: Locale): (key: string, vars?: I18nVars) => string {
  const dict: Dict = locale === 'zh' ? zh : en
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

/** 解析配置里的 locale 值: 仅 'zh' 视为中文, 其余(含未定义)一律英文 */
export function resolveLocale(v: unknown): Locale {
  return v === 'zh' ? 'zh' : 'en'
}
