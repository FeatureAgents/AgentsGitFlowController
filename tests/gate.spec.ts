import { describe, expect, it } from 'vitest'
import { decide } from '../src/gate'
import type { GateFacts, GuardConfig, PrTarget } from '../src/types'

const config: GuardConfig = {
  enabled: true,
  mode: 'pr',
  branches: { base: 'develop', preview: 'staging', trunk: 'main' },
  confirm: { keywords: ['确认', 'OK', '可以', '特许'], featurePattern: 'feature/[\\w-]+' },
  ci: { enabled: true },
}

const flexible: GuardConfig = { ...config, mode: 'flexible' }

function facts(over: Partial<GateFacts> = {}): GateFacts {
  return {
    currentBranch: 'feature/dev-x-01',
    featureInPreview: () => false,
    hasPermit: () => false,
    ...over,
  }
}

/** 命中 feature/dev-x-01 的常用事实组合 */
function inPreviewWithConfirm(over: Partial<GateFacts> = {}): GateFacts {
  return facts({
    currentBranch: 'develop',
    featureInPreview: (f) => f === 'feature/dev-x-01',
    hasPermit: (kind, f) => kind === 'confirm' && f === 'feature/dev-x-01',
    ...over,
  })
}

/** 在基线上合并 feature/dev-x-01 的事实组合 */
function mergeOnBase(over: Partial<GateFacts> = {}): GateFacts {
  return facts({ currentBranch: 'develop', ...over })
}

describe('gate: 直推受保护分支', () => {
  it('推基线 → deny(文案含分支名与下一步)', () => {
    const d = decide({ kind: 'push', dst: 'develop', force: false, delete: false }, facts(), config)
    expect(d.kind).toBe('deny')
    if (d.kind === 'deny') {
      expect(d.reason).toContain('develop')
      expect(d.next).toBeTruthy()
    }
  })

  it('推主干 → deny', () => {
    expect(decide({ kind: 'push', dst: 'main', force: false, delete: false }, facts(), config).kind).toBe('deny')
  })

  it('pr 模式推预览 → deny', () => {
    expect(decide({ kind: 'push', dst: 'staging', force: false, delete: false }, facts(), config).kind).toBe('deny')
  })

  it('flexible 模式推预览 → allow', () => {
    expect(decide({ kind: 'push', dst: 'staging', force: false, delete: false }, facts(), flexible).kind).toBe('allow')
  })

  it('强推受保护分支 → deny', () => {
    expect(decide({ kind: 'push', dst: 'main', force: true, delete: false }, facts(), config).kind).toBe('deny')
  })

  it('推 feature → allow', () => {
    expect(decide({ kind: 'push', dst: 'feature/dev-x-01', force: false, delete: false }, facts(), config).kind).toBe('allow')
  })

  it('dst 为空 → 回退当前分支判定', () => {
    expect(decide({ kind: 'push', dst: null, force: false, delete: false }, facts({ currentBranch: 'develop' }), config).kind).toBe('deny')
    expect(decide({ kind: 'push', dst: null, force: false, delete: false }, facts({ currentBranch: 'feature/dev-x-01' }), config).kind).toBe('allow')
  })

  it('detached HEAD(dst 与当前分支均 null) → deny 引导', () => {
    const d = decide({ kind: 'push', dst: null, force: false, delete: false }, facts({ currentBranch: null }), config)
    expect(d.kind).toBe('deny')
    if (d.kind === 'deny') expect(d.reason).toContain('detached')
  })

  it('--all 推送 → deny(包含受保护分支)', () => {
    const d = decide({ kind: 'push', dst: null, force: false, delete: false, all: true }, facts(), config)
    expect(d.kind).toBe('deny')
  })

  it('未配置 trunk → main 不受保护', () => {
    const noTrunk = { ...config, branches: { base: 'develop', preview: 'staging' } }
    expect(decide({ kind: 'push', dst: 'main', force: false, delete: false }, facts(), noTrunk).kind).toBe('allow')
  })
})

describe('gate: 删除受保护分支', () => {
  it('删除基线 → deny', () => {
    expect(decide({ kind: 'branch-delete', branch: 'develop', force: false }, facts(), config).kind).toBe('deny')
  })

  it('pr 模式删除预览 → deny', () => {
    expect(decide({ kind: 'branch-delete', branch: 'staging', force: false }, facts(), config).kind).toBe('deny')
  })

  it('flexible 模式删除预览 → allow', () => {
    expect(decide({ kind: 'branch-delete', branch: 'staging', force: false }, facts(), flexible).kind).toBe('allow')
  })

  it('删除 feature → allow', () => {
    expect(decide({ kind: 'branch-delete', branch: 'feature/dev-x-01', force: true }, facts(), config).kind).toBe('allow')
  })
})

describe('gate: 合入基线(本地 merge, 当前在基线)', () => {
  it('feature ∈ 预览 + P2 → allow', () => {
    expect(decide({ kind: 'local-merge', source: 'feature/dev-x-01' }, inPreviewWithConfirm(), config).kind).toBe('allow')
  })

  it('feature ∈ 预览 但无 P2 → deny', () => {
    const d = decide({ kind: 'local-merge', source: 'feature/dev-x-01' }, mergeOnBase({ featureInPreview: () => true }), config)
    expect(d.kind).toBe('deny')
    expect(d).toMatchObject({ kind: 'deny', next: expect.any(String) })
  })

  it('feature ∉ 预览 但已有 P2 → deny(顺序未满足, 文案说明预览分支)', () => {
    const d = decide({ kind: 'local-merge', source: 'feature/dev-x-01' }, mergeOnBase({ hasPermit: (k) => k === 'confirm' }), config)
    expect(d.kind).toBe('deny')
    if (d.kind === 'deny') {
      expect(d.reason).toContain('尚未合入预览')
      expect(d.reason).toContain('staging')
      expect(d.next).toBeTruthy()
    }
  })

  it('feature ∈ 预览 + 无 P2 → deny(文案说明需用户确认)', () => {
    const d = decide({ kind: 'local-merge', source: 'feature/dev-x-01' }, mergeOnBase({ featureInPreview: () => true }), config)
    expect(d.kind).toBe('deny')
    if (d.kind === 'deny') expect(d.reason).toContain('确认')
  })

  it('基线上无 source 的 merge(同步上游) → allow', () => {
    expect(decide({ kind: 'local-merge', source: null }, mergeOnBase(), config).kind).toBe('allow')
  })

  it('合并预览整体进基线 → deny(批量绕过逐 feature 验证)', () => {
    const d = decide({ kind: 'local-merge', source: 'staging' }, facts({ currentBranch: 'develop' }), config)
    expect(d.kind).toBe('deny')
  })

  it('从主干同步到基线 → allow', () => {
    expect(decide({ kind: 'local-merge', source: 'main' }, facts({ currentBranch: 'develop' }), config).kind).toBe('allow')
  })
})

describe('gate: 合入预览(本地 merge)', () => {
  it('pr 模式本地合入预览 → deny', () => {
    expect(decide({ kind: 'local-merge', source: 'feature/dev-x-01' }, facts({ currentBranch: 'staging' }), config).kind).toBe('deny')
  })

  it('flexible 模式本地合入预览 → allow', () => {
    expect(decide({ kind: 'local-merge', source: 'feature/dev-x-01' }, facts({ currentBranch: 'staging' }), flexible).kind).toBe('allow')
  })

  it('同步基线进预览 → allow(两种模式)', () => {
    expect(decide({ kind: 'local-merge', source: 'develop' }, facts({ currentBranch: 'staging' }), config).kind).toBe('allow')
    expect(decide({ kind: 'local-merge', source: 'develop' }, facts({ currentBranch: 'staging' }), flexible).kind).toBe('allow')
  })
})

describe('gate: 合入主干', () => {
  it('当前在 trunk 上 merge → 一律 deny(文案说明仅用户亲手)', () => {
    const d = decide({ kind: 'local-merge', source: 'develop' }, facts({ currentBranch: 'main' }), config)
    expect(d.kind).toBe('deny')
    if (d.kind === 'deny') {
      expect(d.reason).toContain('主干')
      expect(d.next).toBeTruthy()
    } else {
      expect.fail('应 deny')
    }
    expect(decide({ kind: 'local-merge', source: 'feature/dev-x-01' }, facts({ currentBranch: 'main' }), config).kind).toBe('deny')
  })
})

describe('gate: 同步(其余场景放行)', () => {
  it('feature 上合并基线/预览 → allow', () => {
    expect(decide({ kind: 'local-merge', source: 'develop' }, facts(), config).kind).toBe('allow')
    expect(decide({ kind: 'local-merge', source: 'staging' }, facts(), config).kind).toBe('allow')
  })

  it('其他命令 → allow', () => {
    expect(decide({ kind: 'other' }, facts(), config).kind).toBe('allow')
  })
})

describe('gate: 创建 PR', () => {
  it('指向基线且 feature ∈ 预览 → allow', () => {
    expect(decide({ kind: 'pr-create', target: 'develop' }, facts({ featureInPreview: () => true }), config).kind).toBe('allow')
  })

  it('指向基线且 feature ∉ 预览 → deny', () => {
    expect(decide({ kind: 'pr-create', target: 'develop' }, facts(), config).kind).toBe('deny')
  })

  it('指向基线且 feature ∉ 预览 + P1 → allow', () => {
    expect(decide({ kind: 'pr-create', target: 'develop' }, facts({ hasPermit: (k) => k === 'early-pr' }), config).kind).toBe('allow')
  })

  it('当前分支是基线自身 → deny', () => {
    expect(decide({ kind: 'pr-create', target: 'develop' }, facts({ currentBranch: 'develop' }), config).kind).toBe('deny')
  })

  it('当前分支是预览 → deny(预览整体合入基线, 批量绕过)', () => {
    expect(decide({ kind: 'pr-create', target: 'develop' }, facts({ currentBranch: 'staging' }), config).kind).toBe('deny')
  })

  it('指向主干 → 需 P3(deny 文案引导用户特许)', () => {
    const d = decide({ kind: 'pr-create', target: 'main' }, facts(), config)
    expect(d.kind).toBe('deny')
    if (d.kind === 'deny') expect(d.reason).toContain('特许')
    expect(decide({ kind: 'pr-create', target: 'main' }, facts({ hasPermit: (k) => k === 'trunk-pr' }), config).kind).toBe('allow')
  })

  it('未指定 base → deny(引导显式指定)', () => {
    expect(decide({ kind: 'pr-create', target: null }, facts(), config).kind).toBe('deny')
  })

  it('指向预览(PR①) → allow', () => {
    expect(decide({ kind: 'pr-create', target: 'staging' }, facts(), config).kind).toBe('allow')
  })
})

describe('gate: 合入 PR(gh pr merge)', () => {
  it('目标是预览(PR①) → allow', () => {
    const d = decide({ kind: 'pr-merge', pr: '10' }, facts({ resolvePrTarget: () => ({ target: 'preview' }) }), config)
    expect(d.kind).toBe('allow')
  })

  it('目标是基线 + 顺序确认 → allow', () => {
    const d = decide(
      { kind: 'pr-merge', pr: '11' },
      facts({
        resolvePrTarget: () => ({ target: 'base', head: 'feature/dev-x-01' }),
        featureInPreview: (f) => f === 'feature/dev-x-01',
        hasPermit: (kind, f) => kind === 'confirm' && f === 'feature/dev-x-01',
      }),
      config,
    )
    expect(d.kind).toBe('allow')
  })

  it('目标是基线 无 P2 → deny', () => {
    expect(decide({ kind: 'pr-merge', pr: '11' }, facts({ resolvePrTarget: () => ({ target: 'base', head: 'feature/dev-x-01' }), featureInPreview: () => true }), config).kind).toBe('deny')
  })

  it('目标是主干 → deny', () => {
    expect(decide({ kind: 'pr-merge', pr: '12' }, facts({ resolvePrTarget: () => ({ target: 'trunk' }) }), config).kind).toBe('deny')
  })

  it('目标无法解析 → 保守按基线规则(以当前分支为 head 代理)', () => {
    const unresolved = facts({
      currentBranch: 'feature/dev-x-01',
      featureInPreview: (f) => f === 'feature/dev-x-01',
      hasPermit: (kind, f) => kind === 'confirm' && f === 'feature/dev-x-01',
      resolvePrTarget: () => null,
    })
    expect(decide({ kind: 'pr-merge', pr: '13' }, facts({ resolvePrTarget: () => null }), config).kind).toBe('deny')
    expect(decide({ kind: 'pr-merge', pr: '13' }, unresolved, config).kind).toBe('allow')
  })
})

describe('gate: gitflow-guard CLI', () => {
  it('permit/confirm 是用户终端专属 → deny(文案说明 agent 不能自我授权)', () => {
    const d = decide({ kind: 'guard-cli', sub: 'permit' }, facts(), config)
    expect(d.kind).toBe('deny')
    if (d.kind === 'deny') expect(d.reason).toContain('用户')
    expect(decide({ kind: 'guard-cli', sub: 'confirm' }, facts(), config).kind).toBe('deny')
  })

  it('status 只读 → allow', () => {
    expect(decide({ kind: 'guard-cli', sub: 'status' }, facts(), config).kind).toBe('allow')
    expect(decide({ kind: 'guard-cli', sub: 'other' }, facts(), config).kind).toBe('allow')
  })
})
