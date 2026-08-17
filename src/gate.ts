// 门禁层: 门禁矩阵 —— 顺序检查 + 特许检查 → allow / deny + 引导(纯函数)

import type { Classified, GateDecision, GateFacts, GuardConfig, PrTarget } from './types'

const FEATURE_UNKNOWN = '当前分支'

/** 受保护分支集合: 基线/主干始终受保护; 预览仅在 pr 模式受保护 */
function protectedBranches(config: GuardConfig): Set<string> {
  const set = new Set<string>([config.branches.base])
  if (config.branches.trunk) set.add(config.branches.trunk)
  if (config.mode === 'pr') set.add(config.branches.preview)
  return set
}

function isProtected(branch: string | null | undefined, config: GuardConfig): boolean {
  return branch != null && protectedBranches(config).has(branch)
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
      return isProtected(classified.branch, config)
        ? deny(`受保护分支「${classified.branch}」禁止删除或强推`, '删除分支请到受保护分支外操作; 受保护分支由用户亲手管理')
        : { kind: 'allow' }
    case 'guard-cli':
      return classified.sub === 'permit' || classified.sub === 'confirm'
        ? deny('特许/确认是用户专属操作, agent 不能自我授权', '请让用户在终端执行 gitflow-guard permit/confirm, 或在聊天中给出确认')
        : { kind: 'allow' }
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
  if (isProtected(dst, config)) {
    const why = c.delete
      ? `受保护分支「${dst}」禁止删除`
      : `受保护分支「${dst}」禁止直推${c.force ? '(含强推)' : ''}`
    return deny(why, branchNext(dst, config))
  }
  return { kind: 'allow' }
}

function decideMerge(c: Extract<Classified, { kind: 'local-merge' }>, facts: GateFacts, config: GuardConfig): GateDecision {
  const { base, preview, trunk } = config.branches
  const current = facts.currentBranch
  const source = c.source

  // 当前在主干: 合入主干一律 deny(仅用户亲手)
  if (current === trunk) return deny('合入主干(trunk)仅允许用户亲手执行', '如需发布, 请让用户在自己终端完成; 创建指向 trunk 的 PR 需用户特许(P3)')

  // 当前在基线: 判断合入来源
  if (current === base) {
    if (source == null) return { kind: 'allow' } // git merge 无参数 = 合并上游, 属同步
    if (source === preview) return deny('将预览分支整体合入基线会绕过逐 feature 验证', '请按 feature 逐个合入: 每个 feature 需已合入预览且用户确认(P2)')
    if (source === trunk) return { kind: 'allow' } // 主干 → 基线属同步
    if (source === base) return { kind: 'allow' }
    return mergeIntoBase(source, facts, config)
  }

  // 当前在预览: pr 模式禁止本地合入 feature, 同步基线放行
  if (current === preview) {
    if (config.mode === 'pr' && source != null && source !== base && source !== trunk) {
      return deny(`pr 模式禁止本地合入预览分支(当前在 ${preview})`, '请创建 PR(feature → preview)合入, 或改用 flexible 模式')
    }
    return { kind: 'allow' }
  }

  // 当前在 feature 分支: 一律放行(同步基线/预览均为安全操作)
  return { kind: 'allow' }
}

function mergeIntoBase(feature: string, facts: GateFacts, config: GuardConfig): GateDecision {
  if (!facts.featureInPreview(feature)) {
    return deny(
      `流程违规: feature「${feature}」尚未合入预览分支(${config.branches.preview}), 不能合入基线(${config.branches.base})`,
      '请先合入预览(PR①)并测试确认, 再合入基线; 或请用户特许提前操作(聊天「确认」/ 终端 gitflow-guard permit)',
    )
  }
  if (!facts.hasPermit('confirm', feature)) {
    return deny(
      `缺少用户确认: feature「${feature}」已在预览分支, 但用户尚未确认测试通过`,
      '请让用户确认测试结果(聊天输入「feature xxx 测试 OK」/ 终端 gitflow-guard confirm feature-xxx)',
    )
  }
  return { kind: 'allow' }
}

function decidePrCreate(c: Extract<Classified, { kind: 'pr-create' }>, facts: GateFacts, config: GuardConfig): GateDecision {
  const { base, preview, trunk } = config.branches
  const head = facts.currentBranch

  if (c.target == null) {
    return deny('无法确定 PR 目标分支', `请显式指定 --base <分支名>(如 gh pr create --base ${config.branches.preview})`)
  }
  if (c.target === preview) return { kind: 'allow' } // PR①(feature → 预览)放行

  if (c.target === base) {
    if (head == null || head === base || head === preview || head === trunk) {
      return deny(
        `当前分支(${head ?? FEATURE_UNKNOWN})是角色分支, 不能作为指向基线的 PR 源`,
        '请在 feature 分支上创建指向基线的 PR',
      )
    }
    if (facts.featureInPreview(head)) return { kind: 'allow' }
    if (facts.hasPermit('early-pr', head)) return { kind: 'allow' }
    return deny(
      `流程违规: feature「${head}」尚未合入预览分支(${preview}), 提前创建指向基线(${base})的 PR 需要用户特许(P1)`,
      '请先合入预览; 或请用户特许(聊天确认「提前建 PR」/ 终端 gitflow-guard permit)',
    )
  }

  if (c.target === trunk) {
    const head = facts.currentBranch
    if (head != null && facts.hasPermit('trunk-pr', head)) return { kind: 'allow' }
    return deny('创建指向主干(trunk)的 PR 需要用户特许(P3)', '请让用户特许(聊天确认「上主干」/ 终端 gitflow-guard permit --kind trunk-pr)')
  }

  // 指向其他分支: 不影响流程, 放行
  return { kind: 'allow' }
}

function decidePrMerge(c: Extract<Classified, { kind: 'pr-merge' }>, facts: GateFacts, config: GuardConfig): GateDecision {
  const resolved = facts.resolvePrTarget?.(c.pr) ?? null
  const target = resolved?.target ?? null
  const head = resolved?.head ?? facts.currentBranch
  if (target === 'preview') return { kind: 'allow' } // PR① 合入预览放行
  if (target === 'trunk') return deny('合入主干(trunk)仅允许用户亲手执行', '如需发布, 请让用户在自己终端合并')
  if (target === 'other') return { kind: 'allow' }
  if (head == null) return deny('无法确认 PR 的 feature 分支', '请先 checkout 到 feature 分支再合并, 或确认 gh 查询可用')
  // 目标是基线或无法解析: 保守按「合入基线」规则(顺序 + P2)
  if (target === null) {
    // 无法确认目标: 按合入基线最严规则处理, 但先提示原因
    const reason = facts.featureInPreview(head)
      ? `缺少用户确认: feature「${head}」已在预览分支, 但无法确认 PR 目标(gh 查询失败), 仍须用户确认(P2)`
      : `流程违规: feature「${head}」尚未合入预览分支, 且无法确认 PR 目标(gh 查询失败)`
    if (!facts.featureInPreview(head) || !facts.hasPermit('confirm', head)) {
      return deny(reason, '请确认 gh 可用后重试, 或改用本地合入(git merge)路径; 确认测试通过需用户特许(P2)')
    }
    return { kind: 'allow' }
  }
  return mergeIntoBase(head, facts, config)
}

function deny(reason: string, next: string): GateDecision {
  return { kind: 'deny', reason, next }
}

/** 受保护分支被拦后的下一步引导 */
function branchNext(branch: string | null, config: GuardConfig): string {
  if (branch == null) return '请明确目标分支后重试'
  if (branch === config.branches.preview) {
    return config.mode === 'pr'
      ? `预览分支须走 PR: 先推 feature 分支, 再 gh pr create --base ${config.branches.preview}`
      : '预览分支可直推(当前 flexible 模式)'
  }
  if (branch === config.branches.base) return `基线分支(${branch})由 PR 合入: 先合入预览并确认(P2), 再创建指向基线的 PR`
  return `主干分支(${branch})仅用户亲手操作`
}
