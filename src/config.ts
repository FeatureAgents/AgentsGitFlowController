// 配置层: 加载 gitflow-guard.config.json, 默认值合并 + 校验(opt-in 启用)

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { GuardConfig } from './types'

export const CONFIG_FILE = 'gitflow-guard.config.json'

/** 默认配置(分支角色必须由项目显式配置, 无默认) */
export const DEFAULT_CONFIG = {
  enabled: false,
  mode: 'pr',
  confirm: { keywords: ['确认', 'OK', '可以', '特许'], featurePattern: 'feature/[\\w-]+' },
  ci: { enabled: true },
} satisfies Omit<GuardConfig, 'branches'>

export interface ConfigLoadResult {
  config: GuardConfig | null
  errors: string[]
}

/** 合并默认值并校验; 任何校验错误都会导致未启用 */
export function mergeConfig(raw: unknown): ConfigLoadResult {
  const errors: string[] = []
  if (typeof raw !== 'object' || raw === null) {
    return { config: null, errors: ['配置文件必须是 JSON 对象'] }
  }
  const r = raw as Record<string, unknown>

  // 深拷贝默认值, 避免后续合并污染模块级 DEFAULT_CONFIG
  const config: GuardConfig = {
    ...DEFAULT_CONFIG,
    confirm: { ...DEFAULT_CONFIG.confirm },
    ci: { ...DEFAULT_CONFIG.ci },
    branches: { base: '', preview: '' },
  }
  if (typeof r.enabled === 'boolean') config.enabled = r.enabled
  if (r.mode === undefined) {
    // 未提供时用默认 pr
  } else if (r.mode === 'pr' || r.mode === 'flexible') {
    config.mode = r.mode
  } else {
    errors.push('mode 必须是 "pr" 或 "flexible"')
  }

  const b = (r.branches ?? {}) as Record<string, unknown>
  if (typeof b.base === 'string' && b.base !== '') config.branches.base = b.base
  if (typeof b.preview === 'string' && b.preview !== '') config.branches.preview = b.preview
  if (typeof b.trunk === 'string' && b.trunk !== '') config.branches.trunk = b.trunk

  const c = (r.confirm ?? {}) as Record<string, unknown>
  if (c.keywords !== undefined) {
    if (!Array.isArray(c.keywords) || c.keywords.length === 0 || !c.keywords.every((k) => typeof k === 'string')) {
      errors.push('confirm.keywords 必须是非空字符串数组')
    } else {
      config.confirm.keywords = c.keywords as string[]
    }
  }
  if (typeof c.featurePattern === 'string' && c.featurePattern !== '') config.confirm.featurePattern = c.featurePattern

  const ci = (r.ci ?? {}) as Record<string, unknown>
  if (typeof ci.enabled === 'boolean') config.ci.enabled = ci.enabled

  errors.push(...validateConfig(config))
  return { config: errors.length > 0 ? null : config, errors }
}

/** 配置校验: 角色分支冲突等(风险清单第 5 条兜底) */
export function validateConfig(config: GuardConfig): string[] {
  const errors: string[] = []
  if (!config.branches.base) errors.push('branches.base 必填')
  if (!config.branches.preview) errors.push('branches.preview 必填')
  if (config.branches.base && config.branches.preview && config.branches.base === config.branches.preview) {
    errors.push('branches.base 与 branches.preview 不能是同一分支')
  }
  if (config.branches.trunk) {
    if (config.branches.trunk === config.branches.base) errors.push('branches.trunk 与 branches.base 不能是同一分支')
    if (config.branches.trunk === config.branches.preview) errors.push('branches.trunk 与 branches.preview 不能是同一分支')
  }
  if (config.confirm.keywords.length === 0) errors.push('confirm.keywords 不能为空')
  try {
    new RegExp(config.confirm.featurePattern)
  } catch {
    errors.push(`confirm.featurePattern 不是合法正则: ${config.confirm.featurePattern}`)
  }
  return errors
}

/** 从项目根加载配置; 无文件 = 未启用(opt-in) */
export async function loadConfig(repoRoot: string): Promise<ConfigLoadResult> {
  try {
    const text = await readFile(join(repoRoot, CONFIG_FILE), 'utf8')
    return mergeConfig(JSON.parse(text))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { config: null, errors: [] }
    return { config: null, errors: [`读取配置文件失败: ${(e as Error).message}`] }
  }
}
