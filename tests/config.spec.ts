import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG, loadConfig, mergeConfig, validateConfig, matchBranchSpec, roleMatches } from '../src/config'
import type { GuardConfig } from '../src/types'

describe('config: 默认值合并', () => {
  it('最小配置(仅 integration 数组) → 规范化 + 默认角色补全', () => {
    const { config, errors } = mergeConfig({ branches: { integration: ['develop'] } })
    expect(errors).toEqual([])
    expect(config!.enabled).toBe(true) // 默认开启(零门槛开箱即用)
    expect(config!.branches.integration).toEqual({ branches: ['develop'], update: 'pr', mergeBy: 'anyone' })
    expect(config!.branches.archive?.branches).toEqual(['main']) // 默认 archive 由内置补全
    expect(config!.featurePattern).toContain('feature')
    expect(config!.ci.enabled).toBe(true)
  })

  it('production 默认 mergeBy=user(合并权默认在人; 突变回归 M1)', () => {
    // 分支名避开默认 archive(main): 深合并下与默认角色重叠会报错, 这里只验证 mergeBy 默认
    const { config, errors } = mergeConfig({ branches: { integration: ['develop'], production: ['prd'] } })
    expect(errors).toEqual([])
    expect(config!.branches.production).toEqual({ branches: ['prd'], update: 'pr', mergeBy: 'user' })
  })

  it('对象形式 + 自定义 update', () => {
    const { config, errors } = mergeConfig({
      enabled: true,
      featurePattern: 'topic/[\\w-]+',
      branches: {
        integration: { branches: ['topic/.*', 'develop'], update: 'flexible' },
        preview: { branches: ['ita1', 'itb1'], update: 'pr' },
        production: { branches: ['prd'], update: 'pr', mergeBy: 'user' },
        archive: ['main'],
      },
    })
    expect(errors).toEqual([])
    expect(config!.branches.integration).toEqual({ branches: ['topic/.*', 'develop'], update: 'flexible', mergeBy: 'anyone' })
    expect(config!.branches.production?.mergeBy).toBe('user')
    expect(config!.branches.archive?.branches).toEqual(['main'])
  })

  it('深度合并: 只写 production 也在默认基础上叠加', () => {
    const { config, errors } = mergeConfig({ branches: { production: ['release/[\\w-]+'] } })
    expect(errors).toEqual([])
    expect(config!.branches.integration.branches).toEqual(['develop']) // 默认 integration 仍在
    expect(config!.branches.archive?.branches).toEqual(['main']) // 默认 archive 仍在
    expect(config!.branches.production?.branches).toEqual(['release/[\\w-]+'])
    expect(config!.branches.preview).toBeUndefined() // 未写且无默认 → 不启用
  })

  it('深度合并: 用户覆盖 integration/archive 时整体替换该角色', () => {
    const { config, errors } = mergeConfig({ branches: { integration: ['master'], archive: ['archive/\\d+'] } })
    expect(errors).toEqual([])
    expect(config!.branches.integration.branches).toEqual(['master'])
    expect(config!.branches.archive?.branches).toEqual(['archive/\\d+'])
  })

  it('enabled:false 仍深度合并但关闭(关闭路径)', () => {
    const { config, errors } = mergeConfig({ enabled: false })
    expect(errors).toEqual([])
    expect(config!.enabled).toBe(false)
    expect(config!.branches.integration.branches).toEqual(['develop'])
    expect(config!.branches.archive?.branches).toEqual(['main'])
  })
})

describe('config: 校验', () => {
  it('null / 非对象 → 报错', () => {
    expect(mergeConfig(null).errors.length).toBeGreaterThan(0)
    expect(mergeConfig('str').errors.length).toBeGreaterThan(0)
    expect(mergeConfig(42).errors.length).toBeGreaterThan(0)
  })

  it('缺 integration → 回退内置默认 develop(不再必填)', () => {
    const { config, errors } = mergeConfig({ branches: { preview: ['ita1'] } })
    expect(errors).toEqual([])
    expect(config!.branches.integration.branches).toEqual(['develop'])
    expect(config!.branches.preview?.branches).toEqual(['ita1'])
  })

  it('integration 空数组 → 报错', () => {
    const { errors } = mergeConfig({ branches: { integration: [] } })
    expect(errors.some((e) => e.includes('integration'))).toBe(true)
  })

  it('update/mergeBy 非法 → 报错', () => {
    const { errors } = mergeConfig({ branches: { integration: { branches: ['develop'], update: 'weird' } } })
    expect(errors.some((e) => e.includes('update'))).toBe(true)
    const { errors: e2 } = mergeConfig({ branches: { integration: ['develop'], production: { branches: ['prd'], mergeBy: 'x' } } })
    expect(e2.some((e) => e.includes('mergeBy'))).toBe(true)
  })

  it('角色间分支重叠 → 报错', () => {
    const { errors } = mergeConfig({ branches: { integration: ['develop'], preview: ['develop'] } })
    expect(errors.some((e) => e.includes('integration') && e.includes('preview'))).toBe(true)
  })

  it('featurePattern 非法正则 → 报错', () => {
    const { errors } = mergeConfig({ featurePattern: '[', branches: { integration: ['develop'] } })
    expect(errors.some((e) => e.includes('featurePattern'))).toBe(true)
  })

  it('角色条目非法正则 → 校验期报错(不再静默永不命中, P1-2)', () => {
    const { config, errors } = mergeConfig({ enabled: true, branches: { integration: ['develop'], preview: ['release/('] } })
    expect(config).toBeNull()
    expect(errors.some((e) => e.includes('branches.preview') && e.includes('not a valid regex') && e.includes('release/('))).toBe(true)
    // 合法正则与纯字面量不受影响
    const ok = mergeConfig({ branches: { integration: ['develop', 'release/.+'] } })
    expect(ok.errors).toEqual([])
    // integration 角色的非法条目同样报错
    const integ = mergeConfig({ branches: { integration: ['main['] } })
    expect(integ.errors.some((e) => e.includes('branches.integration'))).toBe(true)
  })

  it('validateConfig 与 merge 结果一致', () => {
    const raw = { branches: { integration: ['develop'] } }
    const merged = mergeConfig(raw)
    expect(validateConfig(merged.config!)).toEqual(merged.errors)
  })

  it('locale 放开为任意字符串: 未注册语言告警不报错, 原值保留(P2-2)', () => {
    const { config, errors, warnings } = mergeConfig({ enabled: true, locale: 'fr', branches: { integration: ['develop'] } })
    expect(errors).toEqual([])
    expect(config!.locale).toBe('fr')
    expect(warnings.some((w) => w.includes('"fr"') && w.includes('en'))).toBe(true)
  })

  it('locale 非字符串 → 仍属配置错误', () => {
    const { errors } = mergeConfig({ locale: 42, branches: { integration: ['develop'] } })
    expect(errors.some((e) => e.includes('locale'))).toBe(true)
  })
})

describe('config: 分支匹配(条目支持正则)', () => {
  it('精确名 match', () => {
    expect(matchBranchSpec('develop', 'develop')).toBe(true)
    expect(matchBranchSpec('developX', 'develop')).toBe(false)
  })
  it('正则 match(含元字符按正则)', () => {
    expect(matchBranchSpec('topic/abc', 'topic/[\\w-]+')).toBe(true)
    expect(matchBranchSpec('topic/abc/def', 'topic/[\\w-]+')).toBe(false)
  })
  it('roleMatches 命中任一条目', () => {
    const role = { branches: ['develop', 'topic/[\\w-]+'], update: 'pr' as const }
    expect(roleMatches('topic/xyz', role)).toBe(true)
    expect(roleMatches('develop', role)).toBe(true)
    expect(roleMatches('main', role)).toBe(false)
  })
})

describe('config: 文件加载(默认配置兜底)', () => {
  function tempRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'gfguard-config-'))
    mkdirSync(join(dir, '.git'), { recursive: true })
    return dir
  }

  it('无配置文件 → 内置默认生效(开箱即用), usingDefaults=true', async () => {
    const dir = tempRepo()
    try {
      const { config, errors, usingDefaults } = await loadConfig(dir)
      expect(errors).toEqual([])
      expect(usingDefaults).toBe(true)
      expect(config?.enabled).toBe(true)
      expect(config?.branches.integration.branches).toEqual(['develop'])
      expect(config?.branches.archive?.branches).toEqual(['main'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('有配置文件(哪怕最小) → usingDefaults=false', async () => {
    const dir = tempRepo()
    try {
      writeFileSync(join(dir, 'gitflow-guard.config.json'), JSON.stringify({ branches: { integration: ['develop'] } }))
      const { config, usingDefaults } = await loadConfig(dir)
      expect(usingDefaults).toBe(false)
      expect(config?.enabled).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('enabled=false → 未启用', async () => {
    const dir = tempRepo()
    try {
      writeFileSync(join(dir, 'gitflow-guard.config.json'), JSON.stringify({ enabled: false, branches: { integration: ['develop'] } }))
      const { config } = await loadConfig(dir)
      expect(config?.enabled).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('enabled=true → 启用并合并默认值', async () => {
    const dir = tempRepo()
    try {
      writeFileSync(join(dir, 'gitflow-guard.config.json'), JSON.stringify({ enabled: true, branches: { integration: ['develop'] } }))
      const { config, errors } = await loadConfig(dir)
      expect(errors).toEqual([])
      expect(config).toMatchObject({ enabled: true })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('JSON 非法 → 报错且未启用', async () => {
    const dir = tempRepo()
    try {
      writeFileSync(join(dir, 'gitflow-guard.config.json'), '{broken')
      const { config, errors } = await loadConfig(dir)
      expect(config).toBeNull()
      expect(errors.length).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('config: strict 位(fail-open/fail-closed 策略)', () => {
  const base = { enabled: true, branches: { integration: ['develop'] } }

  it('缺省不启用(strict 未定义), true/false 正常解析', () => {
    expect(mergeConfig(base).config?.strict).toBeUndefined()
    expect(mergeConfig({ ...base, strict: true }).config?.strict).toBe(true)
    expect(mergeConfig({ ...base, strict: false }).config?.strict).toBe(false)
  })

  it('非 boolean → 校验错误', () => {
    const { config, errors } = mergeConfig({ ...base, strict: 'yes' })
    expect(config).toBeNull()
    expect(errors.join(' ')).toMatch(/strict/)
  })

  it('配置损坏时仍能提取原文中的 strict=true(fail-closed 判定依据)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gfguard-config-strict-'))
    try {
      // update 拼错(校验失败)+ strict: true
      writeFileSync(join(dir, 'gitflow-guard.config.json'), '{"enabled":true,"strict":true,"branches":{"integration":{"branches":["develop"],"update":"prx"}}}')
      const loaded = await loadConfig(dir)
      expect(loaded.config).toBeNull()
      expect(loaded.errors.length).toBeGreaterThan(0)
      expect(loaded.strict).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('JSON 整体损坏(parse 失败)同样提取 strict=true', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gfguard-config-parsefail-'))
    try {
      writeFileSync(join(dir, 'gitflow-guard.config.json'), '{"enabled":true,"strict":true,branches:[}')
      const loaded = await loadConfig(dir)
      expect(loaded.config).toBeNull()
      expect(loaded.errors.length).toBeGreaterThan(0)
      expect(loaded.strict).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('config: 默认配置常量', () => {
  it('DEFAULT_CONFIG 结构完整(默认保护 develop+main)', () => {
    const d = DEFAULT_CONFIG as GuardConfig
    expect(d.enabled).toBe(true)
    expect(d.branches.integration.branches).toEqual(['develop'])
    expect(d.branches.archive?.branches).toEqual(['main'])
    expect(d.featurePattern.length).toBeGreaterThan(0)
    expect(d.ci.enabled).toBe(true)
    expect(d.worktree).toEqual({
      requireCleanOnPr: false,
      requireCleanOnMerge: false,
      allowUntracked: true,
      requireUpstreamSynced: false,
    })
  })
})

describe('config: worktree 保护配置合并与校验', () => {
  it('worktree 字段正确深度合并', () => {
    const { config, errors } = mergeConfig({
      worktree: {
        requireCleanOnPr: true,
        requireCleanOnMerge: true,
        allowUntracked: false,
        requireUpstreamSynced: true,
      },
    })
    expect(errors).toEqual([])
    expect(config!.worktree).toEqual({
      requireCleanOnPr: true,
      requireCleanOnMerge: true,
      allowUntracked: false,
      requireUpstreamSynced: true,
    })
  })

  it('worktree 字段类型非法 → 报错', () => {
    const { config, errors } = mergeConfig({
      worktree: {
        requireCleanOnPr: 'yes',
      },
    })
    expect(config).toBeNull()
    expect(errors.some((e) => e.includes('requireCleanOnPr'))).toBe(true)
  })

  it('worktree 整体非对象 → 报错', () => {
    const { config, errors } = mergeConfig({
      worktree: 'dirty',
    })
    expect(config).toBeNull()
    expect(errors.some((e) => e.includes('worktree'))).toBe(true)
  })
})
