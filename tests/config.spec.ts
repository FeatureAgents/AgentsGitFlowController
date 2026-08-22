import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG, loadConfig, mergeConfig, validateConfig, matchBranchSpec, roleMatches } from '../src/config'
import type { GuardConfig } from '../src/types'

describe('config: 默认值合并', () => {
  it('最小配置(仅 integration 数组) → 规范化默认', () => {
    const { config, errors } = mergeConfig({ branches: { integration: ['develop'] } })
    expect(errors).toEqual([])
    expect(config!.enabled).toBe(false)
    expect(config!.branches.integration).toEqual({ branches: ['develop'], update: 'pr', mergeBy: 'anyone' })
    expect(config!.featurePattern).toContain('feature')
    expect(config!.ci.enabled).toBe(true)
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

  it('preview/production/archive 可选, 不配则不启用', () => {
    const { config } = mergeConfig({ branches: { integration: ['develop'] } })
    expect(config!.branches.preview).toBeUndefined()
    expect(config!.branches.production).toBeUndefined()
    expect(config!.branches.archive).toBeUndefined()
  })
})

describe('config: 校验', () => {
  it('null / 非对象 → 报错', () => {
    expect(mergeConfig(null).errors.length).toBeGreaterThan(0)
    expect(mergeConfig('str').errors.length).toBeGreaterThan(0)
    expect(mergeConfig(42).errors.length).toBeGreaterThan(0)
  })

  it('缺 integration → 报错', () => {
    const { errors } = mergeConfig({ branches: { preview: ['ita1'] } })
    expect(errors.some((e) => e.includes('integration'))).toBe(true)
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

  it('validateConfig 与 merge 结果一致', () => {
    const raw = { branches: { integration: ['develop'] } }
    const merged = mergeConfig(raw)
    expect(validateConfig(merged.config!)).toEqual(merged.errors)
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

describe('config: 文件加载(opt-in)', () => {
  function tempRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'gfguard-config-'))
    mkdirSync(join(dir, '.git'), { recursive: true })
    return dir
  }

  it('无配置文件 → 未启用', async () => {
    const dir = tempRepo()
    try {
      const { config, errors } = await loadConfig(dir)
      expect(config).toBeNull()
      expect(errors).toEqual([])
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
})

describe('config: 默认配置常量', () => {
  it('DEFAULT_CONFIG 结构完整', () => {
    const d = DEFAULT_CONFIG as GuardConfig
    expect(d.enabled).toBe(false)
    expect(d.featurePattern.length).toBeGreaterThan(0)
    expect(d.ci.enabled).toBe(true)
  })
})
