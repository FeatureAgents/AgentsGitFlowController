import { describe, expect, it } from 'vitest'
import { decide, roleOfBranch } from '../src/gate'
import type { GateFacts, GuardConfig, PrTargetResolution } from '../src/types'

function makeConfig(over: Partial<GuardConfig> = {}): GuardConfig {
  return {
    enabled: true,
    featurePattern: 'feature/[\\w-]+',
    branches: {
      integration: { branches: ['develop'], update: 'pr' },
      preview: { branches: ['ita1'], update: 'pr' },
      production: { branches: ['prd'], update: 'pr', mergeBy: 'user' },
      archive: { branches: ['main'], update: 'pr', mergeBy: 'user' },
    },
    ci: { enabled: true },
    ...over,
  }
}

const config = makeConfig()
const flexibleIntegration = makeConfig({ branches: { ...config.branches, integration: { branches: ['develop'], update: 'flexible' } } })

function facts(over: Partial<GateFacts> = {}): GateFacts {
  return { currentBranch: 'feature/dev-x-01', ...over }
}

function resolve(role: PrTargetResolution['role'], target: string, head?: string) {
  return () => ({ role, target, head: head ?? null }) satisfies PrTargetResolution
}

describe('roleOfBranch', () => {
  it('角色配置优先于 featurePattern', () => {
    expect(roleOfBranch('develop', config)).toBe('integration')
    expect(roleOfBranch('ita1', config)).toBe('preview')
    expect(roleOfBranch('prd', config)).toBe('production')
    expect(roleOfBranch('main', config)).toBe('archive')
    expect(roleOfBranch('feature/dev-x', config)).toBe('feature')
    expect(roleOfBranch('topic/abc', makeConfig({ featurePattern: 'topic/[\\w-]+' }))).toBe('feature')
    expect(roleOfBranch('random', config)).toBe('other')
  })
})

describe('gate: 直推受保护分支', () => {
  it('推集成分支/预览/生产/归档 → deny', () => {
    expect(decide({ kind: 'push', dst: 'develop', force: false, delete: false }, facts(), config).kind).toBe('deny')
    expect(decide({ kind: 'push', dst: 'ita1', force: false, delete: false }, facts(), config).kind).toBe('deny')
    expect(decide({ kind: 'push', dst: 'prd', force: false, delete: false }, facts(), config).kind).toBe('deny')
    expect(decide({ kind: 'push', dst: 'main', force: false, delete: false }, facts(), config).kind).toBe('deny')
  })

  it('强推受保护分支 → deny', () => {
    const d = decide({ kind: 'push', dst: 'develop', force: true, delete: false }, facts(), config)
    expect(d.kind).toBe('deny')
    if (d.kind === 'deny') expect(d.reason).toContain('develop')
  })

  it('integration flexible 模式允许直推 feature(非删除)', () => {
    expect(decide({ kind: 'push', dst: 'develop', force: false, delete: false }, facts(), flexibleIntegration).kind).toBe('allow')
  })

  it('推 feature 分支 → allow', () => {
    expect(decide({ kind: 'push', dst: 'feature/dev-x-01', force: false, delete: false }, facts(), config).kind).toBe('allow')
  })

  it('推普通分支 → allow', () => {
    expect(decide({ kind: 'push', dst: 'random', force: false, delete: false }, facts(), config).kind).toBe('allow')
  })

  it('dst 为空 → 回退当前分支判定', () => {
    expect(decide({ kind: 'push', dst: null, force: false, delete: false }, facts({ currentBranch: 'develop' }), config).kind).toBe('deny')
  })

  it('--all 推送 → deny', () => {
    expect(decide({ kind: 'push', dst: null, force: false, delete: false, all: true }, facts(), config).kind).toBe('deny')
  })
})

describe('gate: 删除受保护分支', () => {
  it('删除受保护分支 → deny, 删除 feature → allow', () => {
    expect(decide({ kind: 'branch-delete', branch: 'develop', force: false }, facts(), config).kind).toBe('deny')
    expect(decide({ kind: 'branch-delete', branch: 'main', force: false }, facts(), config).kind).toBe('deny')
    expect(decide({ kind: 'branch-delete', branch: 'feature/dev-x-01', force: true }, facts(), config).kind).toBe('allow')
  })
})

describe('gate: 本地合入', () => {
  it('在归档/生产上合入 → deny(仅用户亲手)', () => {
    expect(decide({ kind: 'local-merge', source: 'feature/x' }, facts({ currentBranch: 'main' }), config).kind).toBe('deny')
    expect(decide({ kind: 'local-merge', source: 'feature/x' }, facts({ currentBranch: 'prd' }), config).kind).toBe('deny')
  })

  it('集成分支: feature 直接合入 → deny(须 PR), 无 source 同步 → allow, 受保护分支间同步 → allow', () => {
    expect(decide({ kind: 'local-merge', source: 'feature/dev-x-01' }, facts({ currentBranch: 'develop' }), config).kind).toBe('deny')
    expect(decide({ kind: 'local-merge', source: null }, facts({ currentBranch: 'develop' }), config).kind).toBe('allow')
    expect(decide({ kind: 'local-merge', source: 'main' }, facts({ currentBranch: 'develop' }), config).kind).toBe('allow')
  })

  it('集成 flexible: feature 本地合入 → allow', () => {
    expect(decide({ kind: 'local-merge', source: 'feature/dev-x-01' }, facts({ currentBranch: 'develop' }), flexibleIntegration).kind).toBe('allow')
  })

  it('预览分支: feature 本地合入 → deny(须 PR)', () => {
    expect(decide({ kind: 'local-merge', source: 'feature/dev-x-01' }, facts({ currentBranch: 'ita1' }), config).kind).toBe('deny')
    expect(decide({ kind: 'local-merge', source: null }, facts({ currentBranch: 'ita1' }), config).kind).toBe('allow')
  })

  it('在 feature 分支上合并(同步) → allow', () => {
    expect(decide({ kind: 'local-merge', source: 'develop' }, facts({ currentBranch: 'feature/dev-x-01' }), config).kind).toBe('allow')
    expect(decide({ kind: 'local-merge', source: 'ita1' }, facts({ currentBranch: 'feature/dev-x-01' }), config).kind).toBe('allow')
  })
})

describe('gate: 创建 PR/MR', () => {
  it('未指定目标 → deny(引导显式指定)', () => {
    expect(decide({ kind: 'pr-create', target: null }, facts(), config).kind).toBe('deny')
  })

  it('指向集成/预览/生产, 且 head 是 feature → allow', () => {
    expect(decide({ kind: 'pr-create', target: 'develop' }, facts(), config).kind).toBe('allow')
    expect(decide({ kind: 'pr-create', target: 'ita1' }, facts(), config).kind).toBe('allow')
    expect(decide({ kind: 'pr-create', target: 'prd' }, facts(), config).kind).toBe('allow')
  })

  it('指向受保护角色但 head 不是 feature → deny', () => {
    expect(decide({ kind: 'pr-create', target: 'develop' }, facts({ currentBranch: 'develop' }), config).kind).toBe('deny')
    expect(decide({ kind: 'pr-create', target: 'ita1' }, facts({ currentBranch: 'prd' }), config).kind).toBe('deny')
  })

  it('指向归档: 允许建 PR(起草归档 PR), 合并仍限用户', () => {
    expect(decide({ kind: 'pr-create', target: 'main' }, facts(), config).kind).toBe('allow')
    // 合并(decidePrMerge)对 archive 仍 deny
    expect(decide({ kind: 'pr-create', target: 'main' }, facts({ currentBranch: 'develop' }), config).kind).toBe('allow')
  })

  it('指向普通分支/feature 分支 → allow', () => {
    expect(decide({ kind: 'pr-create', target: 'random' }, facts(), config).kind).toBe('allow')
    expect(decide({ kind: 'pr-create', target: 'feature/other' }, facts(), config).kind).toBe('allow')
  })
})

describe('gate: 合并 PR/MR', () => {
  it('目标集成/预览 → allow', () => {
    expect(decide({ kind: 'pr-merge', pr: '1' }, facts({ resolvePrTarget: resolve('integration', 'develop', 'feature/x') }), config).kind).toBe('allow')
    expect(decide({ kind: 'pr-merge', pr: '2' }, facts({ resolvePrTarget: resolve('preview', 'ita1', 'feature/x') }), config).kind).toBe('allow')
  })

  it('目标生产 + mergeBy user → deny(只能用户亲手)', () => {
    expect(decide({ kind: 'pr-merge', pr: '3' }, facts({ resolvePrTarget: resolve('production', 'prd', 'feature/x') }), config).kind).toBe('deny')
  })

  it('目标生产 + mergeBy anyone → allow', () => {
    const relaxed = makeConfig({ branches: { ...config.branches, production: { branches: ['prd'], update: 'pr', mergeBy: 'anyone' } } })
    expect(decide({ kind: 'pr-merge', pr: '3' }, facts({ resolvePrTarget: resolve('production', 'prd', 'feature/x') }), relaxed).kind).toBe('allow')
  })

  it('目标归档 → deny', () => {
    expect(decide({ kind: 'pr-merge', pr: '4' }, facts({ resolvePrTarget: resolve('archive', 'main', 'feature/x') }), config).kind).toBe('deny')
  })

  it('目标其他 → allow', () => {
    expect(decide({ kind: 'pr-merge', pr: '5' }, facts({ resolvePrTarget: resolve('other', 'random', 'feature/x') }), config).kind).toBe('allow')
  })

  it('目标无法解析(gh/glab 查询失败)一律 deny —— head 是 feature 也不放行(PR 可能实际指向 production)', () => {
    const d = decide({ kind: 'pr-merge', pr: '6' }, facts({ currentBranch: 'feature/x' }), config)
    expect(d.kind).toBe('deny')
    if (d.kind === 'deny') expect(d.reason).toMatch(/cannot confirm the pr\/mr target/i)
    expect(decide({ kind: 'pr-merge', pr: '6' }, facts({ currentBranch: 'develop' }), config).kind).toBe('deny')
    expect(decide({ kind: 'pr-merge', pr: '6' }, facts({ currentBranch: null }), config).kind).toBe('deny')
  })
})

describe('gate: 其他', () => {
  it('checkout / guard-cli(status,other) 放行', () => {
    expect(decide({ kind: 'checkout', branch: 'develop' }, facts(), config).kind).toBe('allow')
    expect(decide({ kind: 'guard-cli', sub: 'status' }, facts(), config).kind).toBe('allow')
    expect(decide({ kind: 'guard-cli', sub: 'other' }, facts(), config).kind).toBe('allow')
  })
})
