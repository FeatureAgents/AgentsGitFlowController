import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG, loadConfig, mergeConfig, validateConfig } from '../src/config'
import type { GuardConfig } from '../src/types'

describe('config: 默认值合并', () => {
  it('空配置 → 默认值(未启用, pr 模式)', () => {
    const { config, errors } = mergeConfig({ branches: { base: 'develop', preview: 'staging' } })
    expect(errors).toEqual([])
    expect(config!.enabled).toBe(false)
    expect(config!.mode).toBe('pr')
    expect(config!.branches).toEqual({ base: 'develop', preview: 'staging' })
    expect(config!.confirm.keywords).toContain('确认')
    expect(config!.ci.enabled).toBe(true)
  })

  it('部分字段覆盖默认值', () => {
    const { config } = mergeConfig({
      enabled: true,
      mode: 'flexible',
      branches: { base: 'master', preview: 'dev' },
      confirm: { keywords: ['OK'], featurePattern: '\\w+' },
    })
    expect(config!.enabled).toBe(true)
    expect(config!.mode).toBe('flexible')
    expect(config!.branches.base).toBe('master')
    expect(config!.confirm.keywords).toEqual(['OK'])
    expect(config!.ci.enabled).toBe(true)
  })

  it('trunk 可选', () => {
    const { config, errors } = mergeConfig({ branches: { base: 'develop', preview: 'staging' } })
    expect(errors).toEqual([])
    expect(config!.branches.trunk).toBeUndefined()
  })
})

describe('config: 校验', () => {
  it('null / 非对象 → 报错', () => {
    expect(mergeConfig(null).errors.length).toBeGreaterThan(0)
    expect(mergeConfig('str').errors.length).toBeGreaterThan(0)
    expect(mergeConfig(42).errors.length).toBeGreaterThan(0)
  })

  it('branches 非字符串 → 按缺省报错', () => {
    const { errors } = mergeConfig({ branches: { base: 123, preview: ['x'] } })
    expect(errors.some((e) => e.includes('base'))).toBe(true)
    expect(errors.some((e) => e.includes('preview'))).toBe(true)
  })

  it('enabled / ci.enabled 非 boolean → 静默忽略(不报错, 用默认值)', () => {
    const a = mergeConfig({ enabled: 'yes', branches: { base: 'develop', preview: 'staging' } })
    expect(a.errors).toEqual([])
    expect(a.config!.enabled).toBe(false)
    const b = mergeConfig({ ci: { enabled: 'yes' }, branches: { base: 'develop', preview: 'staging' } })
    expect(b.errors).toEqual([])
    expect(b.config!.ci.enabled).toBe(true)
  })

  it('缺 branches → 报错', () => {
    const { errors } = mergeConfig({})
    expect(errors.length).toBeGreaterThan(0)
  })

  it('base 与 preview 相同 → 报错', () => {
    const { errors } = mergeConfig({ branches: { base: 'develop', preview: 'develop' } })
    expect(errors.some((e) => e.includes('base') && e.includes('preview'))).toBe(true)
  })

  it('trunk 与 base/preview 冲突 → 报错', () => {
    const a = mergeConfig({ branches: { base: 'develop', preview: 'staging', trunk: 'develop' } })
    expect(a.errors.length).toBeGreaterThan(0)
    const b = mergeConfig({ branches: { base: 'develop', preview: 'staging', trunk: 'staging' } })
    expect(b.errors.length).toBeGreaterThan(0)
  })

  it('mode 非法 → 报错', () => {
    const { errors } = mergeConfig({ mode: 'weird', branches: { base: 'develop', preview: 'staging' } })
    expect(errors.some((e) => e.includes('mode'))).toBe(true)
  })

  it('keywords 为空 → 报错', () => {
    const { errors } = mergeConfig({ confirm: { keywords: [] }, branches: { base: 'develop', preview: 'staging' } })
    expect(errors.some((e) => e.includes('keywords'))).toBe(true)
  })

  it('featurePattern 非法正则 → 报错', () => {
    const { errors } = mergeConfig({ confirm: { featurePattern: '[' }, branches: { base: 'develop', preview: 'staging' } })
    expect(errors.some((e) => e.includes('featurePattern'))).toBe(true)
  })

  it('validateConfig 单独调用与 merge 结果一致', () => {
    const raw = { branches: { base: 'develop', preview: 'staging' } }
    const merged = mergeConfig(raw)
    expect(validateConfig(merged.config!)).toEqual(merged.errors)
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
      writeFileSync(join(dir, 'gitflow-guard.config.json'), JSON.stringify({ enabled: false, branches: { base: 'develop', preview: 'staging' } }))
      const { config } = await loadConfig(dir)
      expect(config?.enabled).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('enabled=true → 启用并合并默认值', async () => {
    const dir = tempRepo()
    try {
      writeFileSync(join(dir, 'gitflow-guard.config.json'), JSON.stringify({ enabled: true, branches: { base: 'develop', preview: 'staging' } }))
      const { config, errors } = await loadConfig(dir)
      expect(errors).toEqual([])
      expect(config).toMatchObject({ enabled: true, mode: 'pr' })
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

describe('config: 默认配置常量', () => {
  it('DEFAULT_CONFIG 结构完整', () => {
    const d = DEFAULT_CONFIG as GuardConfig
    expect(d.enabled).toBe(false)
    expect(d.mode).toBe('pr')
    expect(d.confirm.keywords.length).toBeGreaterThan(0)
    expect(d.ci.enabled).toBe(true)
  })
})
