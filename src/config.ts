// 配置层: 加载 gitflow-guard.config.json, 规范化 + 校验(opt-in 启用)

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BranchRole, GuardConfig, MergeBy, UpdateMode } from './types'

export const CONFIG_FILE = 'gitflow-guard.config.json'

/** 默认配置(分支角色必须由项目显式配置, 无默认) */
export const DEFAULT_CONFIG = {
  enabled: false,
  featurePattern: 'feature/[\\w-]+',
  ci: { enabled: true },
  locale: 'en',
} satisfies Omit<GuardConfig, 'branches'>

export interface ConfigLoadResult {
  config: GuardConfig | null
  errors: string[]
  /** 配置存在但损坏/校验失败时, 从原文提取的 strict 位(fail-closed 判定依据); 文件缺失或 config 有效时以 config.strict 为准 */
  strict?: boolean
}

const REGEX_CHARS = /[\\^$.*+?()[\]{}|]/

/** 一条分支条目: 含正则元字符按正则对待, 否则精确匹配 */
export function matchBranchSpec(branch: string, spec: string): boolean {
  if (REGEX_CHARS.test(spec)) {
    try {
      return new RegExp(`^(?:${spec})$`).test(branch)
    } catch {
      return false
    }
  }
  return branch === spec
}

/** 判断分支是否命中某个角色(任一分支条目) */
export function roleMatches(branch: string | null | undefined, role: BranchRole): boolean {
  if (!branch) return false
  return role.branches.some((spec) => matchBranchSpec(branch, spec))
}

/** 规范化用户输入的某个角色: 数组 或 {branches:[...], update?, mergeBy?} */
function normalizeRole(raw: unknown, defaultUpdate: UpdateMode, defaultMergeBy: MergeBy): { role: BranchRole; errors: string[] } {
  const errors: string[] = []
  let arr: unknown
  let update: unknown = undefined
  let mergeBy: unknown = undefined
  if (Array.isArray(raw)) {
    arr = raw
  } else if (typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>
    arr = o.branches
    update = o.update
    mergeBy = o.mergeBy
  } else {
    return { role: { branches: [] }, errors: ['Branch role must be an array or { branches: [...] }'] }
  }
  if (!Array.isArray(arr) || arr.length === 0 || !arr.every((x) => typeof x === 'string' && x !== '')) {
    errors.push('branches must be a non-empty array of strings')
  }
  const role: BranchRole = { branches: (Array.isArray(arr) ? arr : []).filter((x): x is string => typeof x === 'string' && x !== '') }
  if (update === undefined || update === 'pr' || update === 'flexible') {
    role.update = update === undefined ? defaultUpdate : (update as UpdateMode)
  } else {
    errors.push('update must be "pr" or "flexible"')
  }
  if (mergeBy === undefined || mergeBy === 'user' || mergeBy === 'anyone') {
    role.mergeBy = mergeBy === undefined ? defaultMergeBy : (mergeBy as MergeBy)
  } else {
    errors.push('mergeBy must be "user" or "anyone"')
  }
  return { role, errors }
}

/** 合并默认值并校验; 任何校验错误都会导致未启用(strict 位仍从原文提取, 供 fail-closed 判定) */
export function mergeConfig(raw: unknown): ConfigLoadResult {
  const errors: string[] = []
  if (typeof raw !== 'object' || raw === null) {
    return { config: null, errors: ['Config file must be a JSON object'] }
  }
  const r = raw as Record<string, unknown>
  // strict 是策略位: 即使其余字段校验失败也要带出去(cli 据此决定 fail-open 告警还是 fail-closed 拦截)
  const strict = r.strict === true ? true : r.strict === false ? false : undefined
  if (r.strict !== undefined && typeof r.strict !== 'boolean') errors.push('strict must be a boolean')

  const config: GuardConfig = {
    ...DEFAULT_CONFIG,
    ci: { ...DEFAULT_CONFIG.ci },
    branches: { integration: { branches: [], update: 'pr', mergeBy: 'anyone' } },
  }
  if (typeof r.enabled === 'boolean') config.enabled = r.enabled
  if (typeof r.featurePattern === 'string' && r.featurePattern !== '') config.featurePattern = r.featurePattern
  if (r.locale === 'en' || r.locale === 'zh') config.locale = r.locale
  else if (r.locale !== undefined) errors.push('locale must be "en" or "zh"')

  const b = (r.branches ?? {}) as Record<string, unknown>
  if ('integration' in b) {
    const { role, errors: e } = normalizeRole(b.integration, 'pr', 'anyone')
    config.branches.integration = role
    errors.push(...e)
  } else {
    errors.push('branches.integration is required')
  }
  if (b.preview !== undefined) {
    const { role, errors: e } = normalizeRole(b.preview, 'pr', 'anyone')
    config.branches.preview = role
    errors.push(...e)
  }
  if (b.production !== undefined) {
    const { role, errors: e } = normalizeRole(b.production, 'pr', 'user')
    config.branches.production = role
    errors.push(...e)
  }
  if (b.archive !== undefined) {
    const { role, errors: e } = normalizeRole(b.archive, 'pr', 'user')
    config.branches.archive = role
    errors.push(...e)
  }

  const ci = (r.ci ?? {}) as Record<string, unknown>
  if (typeof ci.enabled === 'boolean') config.ci.enabled = ci.enabled
  if (strict !== undefined) config.strict = strict

  errors.push(...validateConfig(config))
  return { config: errors.length > 0 ? null : config, errors, ...(strict !== undefined ? { strict } : {}) }
}

/** 配置校验: 角色分支重叠 / 正则合法等 */
export function validateConfig(config: GuardConfig): string[] {
  const errors: string[] = []
  if (config.branches.integration.branches.length === 0) errors.push('branches.integration.branches is required')
  try {
    new RegExp(config.featurePattern)
  } catch {
    errors.push(`featurePattern is not a valid regex: ${config.featurePattern}`)
  }

  const allRoles = ['integration', 'preview', 'production', 'archive'] as const
  for (let i = 0; i < allRoles.length; i++) {
    const a = config.branches[allRoles[i]]
    if (!a) continue
    for (let j = i + 1; j < allRoles.length; j++) {
      const bb = config.branches[allRoles[j]]
      if (!bb) continue
      const overlap = a.branches.some((s) => bb.branches.includes(s))
      if (overlap) errors.push(`branches.${allRoles[i]} and branches.${allRoles[j]} share the same entries`)
    }
  }
  return errors
}

/** 从项目根加载配置; 无文件 = 未启用(opt-in) */
export async function loadConfig(repoRoot: string): Promise<ConfigLoadResult> {
  let text: string
  try {
    text = await readFile(join(repoRoot, CONFIG_FILE), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { config: null, errors: [] }
    return { config: null, errors: [`Failed to read config file: ${(e as Error).message}`] }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    // JSON 整体损坏(mergeConfig 无从运行): strict 位按原文保守提取(仅匹配 "strict": true),
    // 保证 fail-closed 判定在配置最坏形态下仍然生效
    const strict = /"strict"\s*:\s*true/.test(text) || undefined
    return { config: null, errors: [`Failed to read config file: ${(e as Error).message}`], ...(strict ? { strict } : {}) }
  }
  return mergeConfig(raw)
}
