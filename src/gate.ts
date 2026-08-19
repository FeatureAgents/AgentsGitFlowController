// 门禁层: 门禁矩阵 —— 按分支角色(integration/preview/production/archive)判放行 → allow / deny + 引导(纯函数)

import type { BranchRoleName, Classified, GateDecision, GateFacts, GuardConfig } from './types'
import { roleMatches } from './config'

const FEATURE_UNKNOWN = '当前分支'
const PROTECTED_ROLES: ReadonlySet<BranchRoleName> = new Set(['integration', 'preview', 'production', 'archive'])

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

export function decide(classified: Classified, facts: GateFacts, config: GuardConfig): GateDecision {
  switch (classified.kind) {
    case 'push':
      return decidePush(classified, facts, config)
    case 'local-merge':
      return decideMerge(classified, facts, config)
    case 'pr-create':
      return decidePrCreate(classified, facts, config)
    case 'pr-merge':
      return decidePrMerge(classified, facts, config)
    case 'branch-delete':
      return isProtected(roleOfBranch(classified.branch, config))
        ? deny(`受保护分支「${classified.branch}」禁止删除或强推`, '删除/强推请到受保护分支外的 feature 分支上操作; 受保护分支由用户亲手管理')
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

function decidePush(c: Extract<Classified, { kind: 'push' }>, facts: GateFacts, config: GuardConfig): GateDecision {
  if (c.all) return deny('--all/--mirror 推送会包含受保护分支', '请逐分支推送并显式指定 refspec')
  const dst = c.dst ?? facts.currentBranch
  if (dst == null) {
    return deny('无法确定推送目标分支(可能处于 detached HEAD)', '请显式指定 refspec, 如 git push origin <分支名>')
  }
  const role = roleOfBranch(dst, config)
  if (isProtected(role)) {
    // integration/preview 配了 flexible 时允许直推; production/archive 始终禁止
    const flexRole = role === 'integration' ? config.branches.integration : config.branches.preview
    if ((role === 'integration' || role === 'preview') && flexRole?.update === 'flexible' && !c.delete) {
      return { kind: 'allow' }
    }
    const why = c.delete ? `受保护分支「${dst}」禁止删除` : `受保护分支「${dst}」禁止直推${c.force ? '(含强推)' : ''}`
    return deny(why, branchNext(dst, config))
  }
  return { kind: 'allow' }
}

function decideMerge(c: Extract<Classified, { kind: 'local-merge' }>, facts: GateFacts, config: GuardConfig): GateDecision {
  const currentRole = roleOfBranch(facts.currentBranch, config)
  const source = c.source
  const sourceRole = source ? roleOfBranch(source, config) : null

  // 在 production/archive 上合入: 仅用户亲手
  if (currentRole === 'production' || currentRole === 'archive') {
    return deny(`合入${roleLabel(currentRole, facts.currentBranch)}仅允许用户亲手执行`, '请在你自己终端(或 UI)完成该合并; agent 不能替你操作')
  }

  // 在 integration/preview 上合入
  if (currentRole === 'integration' || currentRole === 'preview') {
    if (source == null) return { kind: 'allow' } // git merge 无参数 = 同步上游
    if (sourceRole != null && isProtected(sourceRole)) return { kind: 'allow' } // 受保护分支间同步
    // 来源是 feature/other: 按该角色的 update 模式判断
    const role = currentRole === 'integration' ? config.branches.integration : config.branches.preview!
    if (role?.update === 'flexible') return { kind: 'allow' }
    return deny(
      `${roleLabel(currentRole, facts.currentBranch)}(${facts.currentBranch})禁止本地合入 feature: 须通过 PR/MR`,
      `先推 feature 分支, 再创建指向 ${facts.currentBranch} 的 PR/MR`,
    )
  }

  // 在 feature/other 分支上: 自由
  return { kind: 'allow' }
}

function decidePrCreate(c: Extract<Classified, { kind: 'pr-create' }>, facts: GateFacts, config: GuardConfig): GateDecision {
  if (c.target == null) {
    return deny('无法确定 PR/MR 目标分支', `请显式指定 --base/--target-branch(如 gh pr create --base ${config.branches.integration.branches[0]})`)
  }
  const targetRole = roleOfBranch(c.target, config)
  const head = facts.currentBranch
  const headRole = roleOfBranch(head, config)

  // 指向 archive: agent 连建 PR 都不允许, 归档分支由用户亲手
  if (targetRole === 'archive') {
    return deny('归档分支(archive)仅用户亲手操作, 不允许创建指向它的 PR/MR', '发布/归档由你自己在终端或 UI 完成')
  }

  // 指向 integration/preview/production: 只能以 feature 分支为源走 PR/MR
  if (targetRole === 'integration' || targetRole === 'preview' || targetRole === 'production') {
    if (headRole !== 'feature') {
      return deny(
        `当前分支(${head ?? FEATURE_UNKNOWN})不是 feature 分支, 不能作为指向${roleLabel(targetRole, c.target)}的 PR/MR 源`,
        '请从 feature/topic 分支上创建指向集成/预览/生产分支的 PR/MR',
      )
    }
    return { kind: 'allow' }
  }

  // 其余(feature 间 PR / 普通分支)放行
  return { kind: 'allow' }
}

function decidePrMerge(c: Extract<Classified, { kind: 'pr-merge' }>, facts: GateFacts, config: GuardConfig): GateDecision {
  const resolved = facts.resolvePrTarget?.(c.pr) ?? null
  const role = resolved?.role ?? null
  const head = resolved?.head ?? facts.currentBranch

  if (role === 'production') {
    const prod = config.branches.production
    if (prod?.mergeBy === 'user') {
      return deny('合入生产(production)分支仅允许用户亲手点合并', '请在 GitLab/GitHub 的 MR/PR 页面上由你本人点击合并')
    }
    return { kind: 'allow' }
  }
  if (role === 'archive') return deny('合入归档分支(archive)仅允许用户亲手执行', '请让用户在自己终端或 UI 完成归档合并')
  if (role === 'integration' || role === 'preview') return { kind: 'allow' }
  if (role === 'feature' || role === 'other') return { kind: 'allow' }

  // 目标无法解析(gh/glab 查询失败): 保守 —— head 为 feature 按合入集成分支放行
  if (head == null) return deny('无法确认 PR/MR 的目标分支', '请确认 gh/glab 可用后重试, 或让用户亲手处理')
  if (roleOfBranch(head, config) === 'feature') return { kind: 'allow' }
  return deny('无法确认 PR/MR 目标, 且 head 不是 feature 分支', '请确认平台 CLI 可用, 或让用户亲手处理')
}

function deny(reason: string, next: string): GateDecision {
  return { kind: 'deny', reason, next }
}

function roleLabel(role: BranchRoleName, branch?: string | null): string {
  const map: Record<BranchRoleName, string> = {
    integration: '集成分支',
    preview: '预览分支',
    production: '生产分支',
    archive: '归档分支',
    feature: 'feature 分支',
    other: '普通分支',
  }
  return branch ? `${map[role]}(${branch})` : map[role]
}

/** 受保护分支被拦后的下一步引导 */
function branchNext(branch: string | null, config: GuardConfig): string {
  if (branch == null) return '请明确目标分支后重试'
  const base = config.branches.integration.branches[0] ?? '集成分支'
  const role = roleOfBranch(branch, config)
  switch (role) {
    case 'integration':
      return `集成分支(${branch})由 PR/MR 合入 feature: 先推 feature 分支, 再 gh pr create --base ${branch} / glab mr create --target-branch ${branch}`
    case 'preview':
      return `预览分支(${branch})只收 PR/MR: 从 feature/发布分支创建指向它的 PR/MR(${base} 等集成分支内容先进 feature 发布分支)`
    case 'production':
      return `生产分支(${branch})只能 PR/MR, 且合并由你亲手点击`
    default:
      return `归档分支(${branch})仅用户亲手操作`
  }
}
