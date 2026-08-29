// 门禁层: 门禁矩阵 —— 按分支角色(integration/preview/production/archive)判放行 → allow / deny + 引导(纯函数)
// 文案全部经 makeT(locale) 渲染, 保证 en/zh 一致(见 src/i18n.ts)

import type { BranchRoleName, Classified, GateDecision, GateFacts, GuardConfig } from './types'
import { roleMatches } from './config'
import { makeT } from './i18n'
import type { I18nVars } from './i18n'

const PROTECTED_ROLES: ReadonlySet<BranchRoleName> = new Set(['integration', 'preview', 'production', 'archive'])

type T = (key: string, vars?: I18nVars) => string

/** 判别的默认英文(纯函数裸调用/测试时默认; 运行时由 evaluateCommand 按配置 locale 注入) */
const defaultT: T = makeT('en')

/** 判定分支角色: 优先角色配置, 其次 featurePattern, 其余 other */
export function roleOfBranch(branch: string | null | undefined, config: GuardConfig): BranchRoleName {
  if (!branch) return 'other'
  if (config.branches.production && roleMatches(branch, config.branches.production)) return 'production'
  if (config.branches.preview && roleMatches(branch, config.branches.preview)) return 'preview'
  if (config.branches.integration && roleMatches(branch, config.branches.integration)) return 'integration'
  if (config.branches.archive && roleMatches(branch, config.branches.archive)) return 'archive'
  try {
    if (new RegExp(config.featurePattern).test(branch)) return 'feature'
  } catch {
    // 非法正则已在配置层拦截
  }
  return 'other'
}

function isProtected(role: BranchRoleName): boolean {
  return PROTECTED_ROLES.has(role)
}

function deny(why: string, next: string): GateDecision {
  return { kind: 'deny', reason: why, next }
}

/** 角色名展示: 集成分支(main) 等 */
function roleLabel(role: BranchRoleName, t: T, branch?: string | null): string {
  const label = t(`role.${role}`)
  return branch ? `${label}(${branch})` : label
}

export function decide(classified: Classified, facts: GateFacts, config: GuardConfig, t: T = defaultT): GateDecision {
  switch (classified.kind) {
    case 'push':
      return decidePush(classified, facts, config, t)
    case 'local-merge':
      return decideMerge(classified, facts, config, t)
    case 'pr-create':
      return decidePrCreate(classified, facts, config, t)
    case 'pr-merge':
      return decidePrMerge(classified, facts, config, t)
    case 'branch-delete':
      return isProtected(roleOfBranch(classified.branch, config))
        ? deny(t('denyDeleteOrForce.why', { branch: classified.branch ?? '' }), t('denyDeleteOrForce.next'))
        : { kind: 'allow' }
    case 'ref-update':
      // update-ref 直改受保护分支 refs(plumbing 绕过面), 一律拒绝
      return classified.branch != null && isProtected(roleOfBranch(classified.branch, config))
        ? deny(t('refUpdateProtected.why', { branch: classified.branch }), t('refUpdateProtected.next'))
        : { kind: 'allow' }
    case 'ref-move':
      // 本地改写当前分支 tip(reset/rebase/amend/filter-branch): 与 local-merge 同型 ——
      // 受保护分支上一律拒绝(改写即绕过 PR/MR), feature/other 上自由
      return isProtected(roleOfBranch(facts.currentBranch, config))
        ? deny(t('refMoveProtected.why'), t('refMoveProtected.next'))
        : { kind: 'allow' }
    case 'guard-cli':
      // status/audit 只读, 放行
      return { kind: 'allow' }
    case 'checkout':
      // 分支切换本身放行; 切换后的分支状态由 evaluateCommand 按段模拟
      return { kind: 'allow' }
    default:
      return { kind: 'allow' }
  }
}

function decidePush(c: Extract<Classified, { kind: 'push' }>, facts: GateFacts, config: GuardConfig, t: T): GateDecision {
  if (c.all) return deny(t('pushAll.why'), t('pushAll.next'))
  const dst = c.dst ?? facts.currentBranch
  if (dst == null) {
    return deny(t('pushDetached.why'), t('pushDetached.next'))
  }
  const role = roleOfBranch(dst, config)
  if (isProtected(role)) {
    // integration/preview 配了 flexible 时允许直推; production/archive 始终禁止
    const flexRole = role === 'integration' ? config.branches.integration : config.branches.preview
    if ((role === 'integration' || role === 'preview') && flexRole?.update === 'flexible' && !c.delete) {
      return { kind: 'allow' }
    }
    if (c.delete) return deny(t('pushProtectedDelete.why', { branch: dst }), branchNext(dst, config, t))
    const key = c.force ? 'pushProtectedDirectForce.why' : 'pushProtectedDirect.why'
    return deny(t(key, { branch: dst }), branchNext(dst, config, t))
  }
  return { kind: 'allow' }
}

function checkWorktreeClean(facts: GateFacts, config: GuardConfig, t: T): GateDecision | null {
  const wt = config.worktree
  if (!wt) return null
  const status = facts.worktreeStatus
  if (!status) return null

  if (status.isDirty) {
    return deny(
      t('denyDirtyWorktree.why', { staged: String(status.staged), unstaged: String(status.unstaged) }),
      t('denyDirtyWorktree.next'),
    )
  }
  if (wt.allowUntracked === false && status.untracked > 0) {
    return deny(
      t('denyUntrackedWorktree.why', { untracked: String(status.untracked) }),
      t('denyUntrackedWorktree.next'),
    )
  }
  return null
}

function checkUpstreamSynced(facts: GateFacts, config: GuardConfig, t: T): GateDecision | null {
  const wt = config.worktree
  if (!wt || !wt.requireUpstreamSynced) return null
  const div = facts.upstreamDivergence
  if (!div) return null

  if (div.behind > 0) {
    return deny(
      t('denyBehindUpstream.why', { behind: String(div.behind) }),
      t('denyBehindUpstream.next'),
    )
  }
  return null
}

function decideMerge(c: Extract<Classified, { kind: 'local-merge' }>, facts: GateFacts, config: GuardConfig, t: T): GateDecision {
  const currentRole = roleOfBranch(facts.currentBranch, config)
  const source = c.source
  const sourceRole = source ? roleOfBranch(source, config) : null

  // 在 production/archive 上合入: 仅用户亲手
  if (currentRole === 'production' || currentRole === 'archive') {
    return deny(
      t('mergeProtected.why', { role: roleLabel(currentRole, t, facts.currentBranch) }),
      t('mergeProtected.next'),
    )
  }

  // 在 integration/preview 上合入
  if (currentRole === 'integration' || currentRole === 'preview') {
    if (source != null && (sourceRole == null || !isProtected(sourceRole))) {
      // 来源是 feature/other: 按该角色的 update 模式判断
      const role = currentRole === 'integration' ? config.branches.integration : config.branches.preview!
      if (role?.update !== 'flexible') {
        return deny(
          t('mergeFeature.why', { role: roleLabel(currentRole, t, facts.currentBranch) }),
          t('mergeFeature.next', { branch: facts.currentBranch ?? '' }),
        )
      }
    }
  }

  // 角色权限通过后, 检查工作区状态(若配置启用)
  if (config.worktree?.requireCleanOnMerge) {
    const wtDecision = checkWorktreeClean(facts, config, t)
    if (wtDecision) return wtDecision
  }

  return { kind: 'allow' }
}

function decidePrCreate(c: Extract<Classified, { kind: 'pr-create' }>, facts: GateFacts, config: GuardConfig, t: T): GateDecision {
  if (c.target == null) {
    return deny(
      t('prCreateNoTarget.why'),
      t('prCreateNoTarget.next', { base: config.branches.integration.branches[0] ?? '' }),
    )
  }
  const targetRole = roleOfBranch(c.target, config)
  const head = facts.currentBranch
  const headRole = roleOfBranch(head, config)

  // 指向 archive: 允许创建 PR/MR(agent 可起草 develop→main 归档 PR); 合并仍限用户亲手(见 decidePrMerge)

  // 指向 integration/preview/production: 只能以 feature 分支为源走 PR/MR
  if (targetRole === 'integration' || targetRole === 'preview' || targetRole === 'production') {
    if (headRole !== 'feature') {
      return deny(
        t('prCreateHead.why', { head: head ?? t('head.unknown'), role: roleLabel(targetRole, t, c.target) }),
        t('prCreateHead.next'),
      )
    }
  }

  // 角色权限通过后, 检查工作区状态与上游偏离(若配置启用)
  if (config.worktree?.requireCleanOnPr) {
    const wtDecision = checkWorktreeClean(facts, config, t)
    if (wtDecision) return wtDecision
  }
  if (config.worktree?.requireUpstreamSynced) {
    const syncDecision = checkUpstreamSynced(facts, config, t)
    if (syncDecision) return syncDecision
  }

  return { kind: 'allow' }
}

function decidePrMerge(c: Extract<Classified, { kind: 'pr-merge' }>, facts: GateFacts, config: GuardConfig, t: T): GateDecision {
  const resolved = facts.resolvePrTarget?.(c.pr) ?? null

  // 目标无法解析(gh/glab 未装/未认证/离线)一律保守拒绝: 无法确认 PR 目标就不能按 head 推断放行,
  // 否则「production mergeBy:user 仅用户点合并」在 feature head 场景失效
  if (!resolved) return deny(t('prMergeUnknown.why'), t('prMergeUnknown.next'))

  const role = resolved.role
  if (role === 'production') {
    const prod = config.branches.production
    if (prod?.mergeBy === 'user') {
      return deny(t('prMergeProduction.why'), t('prMergeProduction.next'))
    }
  } else if (role === 'archive') {
    return deny(t('prMergeArchive.why'), t('prMergeArchive.next'))
  }

  // 角色权限通过后, 检查工作区状态(若配置启用)
  if (config.worktree?.requireCleanOnMerge) {
    const wtDecision = checkWorktreeClean(facts, config, t)
    if (wtDecision) return wtDecision
  }

  return { kind: 'allow' }
}

/** 受保护分支被拦后的下一步引导 */
function branchNext(branch: string | null, config: GuardConfig, t: T): string {
  if (branch == null) return t('next.unspecified')
  const base = config.branches.integration.branches[0] ?? ''
  const role = roleOfBranch(branch, config)
  switch (role) {
    case 'integration':
      return t('next.integration', { branch })
    case 'preview':
      return t('next.preview', { branch, base })
    case 'production':
      return t('next.production', { branch })
    default:
      return t('next.archive', { branch })
  }
}
