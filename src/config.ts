// 配置层: 加载 gitflow-guard.config.json, 规范化 + 校验(内置默认配置开箱即用, 用户配置深度合并覆盖)

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveLocale } from './i18n'
import type { BranchRole, GuardConfig, MergeBy, UpdateMode } from './types'

export const CONFIG_FILE = 'gitflow-guard.config.json'

/**
 * 内置默认配置(零门槛开箱即用): 没有 gitflow-guard.config.json 也生效。
 * 默认保护 develop(integration, 只走 PR/MR) + main(archive, 归档合并在人)。
 * 用户 config 存在时按字段深度合并覆盖——只写想改的字段, 其余沿用默认。
 */
export const DEFAULT_CONFIG = {
  enabled: true,
  featurePattern: 'feature/[\\w-]+',
  branches: {
    integration: { branches: ['develop'], update: 'pr' as const, mergeBy: 'anyone' as const },
    archive: { branches: ['main'], update: 'pr' as const, mergeBy: 'user' as const },
  },
  ci: { enabled: true },
  locale: 'en',
} satisfies GuardConfig

export interface ConfigLoadResult {
  config: GuardConfig | null
  errors: string[]
  /** 非致命告警(如未注册的 locale): 不禁用守卫, 仅提示; 消费端按回退语义处理 */
  warnings: string[]
  /** 配置存在但损坏/校验失败时, 从原文提取的 strict 位(fail-closed 判定依据); 文件缺失或 config 有效时以 config.strict 为准 */
  strict?: boolean
  /** 当前生效的是内置默认配置(仓库里根本没有 config 文件) */
  usingDefaults?: boolean
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
function normalizeRole(
  raw: unknown,
  roleName: 'integration' | 'preview' | 'production' | 'archive',
  defaultUpdate: UpdateMode,
  defaultMergeBy: MergeBy,
): { role: BranchRole; errors: string[] } {
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
  // 每条分支条目按运行时同款形态预编译(P1-2): 非法正则在校验期报错, 而不是 matchBranchSpec 里
  // catch → return false 静默永不命中(保护无声消失是最坏失效形态)
  for (const spec of role.branches) {
    try {
      new RegExp(`^(?:${spec})$`)
    } catch {
      errors.push(`branches.${roleName} entry is not a valid regex: ${spec}`)
    }
  }
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
  const warnings: string[] = []
  if (typeof raw !== 'object' || raw === null) {
    return { config: null, errors: ['Config file must be a JSON object'], warnings, usingDefaults: false }
  }
  const r = raw as Record<string, unknown>
  // strict 是策略位: 即使其余字段校验失败也要带出去(cli 据此决定 fail-open 告警还是 fail-closed 拦截)
  const strict = r.strict === true ? true : r.strict === false ? false : undefined
  if (r.strict !== undefined && typeof r.strict !== 'boolean') errors.push('strict must be a boolean')

  // 深度合并: 从内置默认出发, 用户写到的字段覆盖默认(深拷贝, 防共享嵌套对象污染)
  const config: GuardConfig = structuredClone(DEFAULT_CONFIG)
  if (typeof r.enabled === 'boolean') config.enabled = r.enabled
  if (typeof r.featurePattern === 'string' && r.featurePattern !== '') config.featurePattern = r.featurePattern
  if (typeof r.locale === 'string' && r.locale !== '') {
    config.locale = r.locale
    // locale 放开为任意字符串(P2-2): 已注册语言原样生效; 未注册的告警不禁用, 消费端 resolveLocale 回退 en
    if (resolveLocale(r.locale) !== r.locale) warnings.push(`unknown locale "${r.locale}"; falling back to en`)
  } else if (r.locale !== undefined) {
    errors.push('locale must be a string')
  }
  if (typeof r.ci === 'object' && r.ci !== null) {
    const ci = r.ci as Record<string, unknown>
    if (typeof ci.enabled === 'boolean') config.ci.enabled = ci.enabled
  }

  // 角色级合并: 用户写到的角色覆盖默认, 未写的沿用默认(integration/archive 由默认提供, 不再必填)
  if (r.branches !== undefined && (typeof r.branches !== 'object' || r.branches === null)) {
    errors.push('branches must be an object')
  }
  const b = (r.branches ?? {}) as Record<string, unknown>
  if ('integration' in b) {
    const { role, errors: e } = normalizeRole(b.integration, 'integration', 'pr', 'anyone')
    config.branches.integration = role
    errors.push(...e)
  }
  if (b.preview !== undefined) {
    const { role, errors: e } = normalizeRole(b.preview, 'preview', 'pr', 'anyone')
    config.branches.preview = role
    errors.push(...e)
  }
  if (b.production !== undefined) {
    const { role, errors: e } = normalizeRole(b.production, 'production', 'pr', 'user')
    config.branches.production = role
    errors.push(...e)
  }
  if (b.archive !== undefined) {
    const { role, errors: e } = normalizeRole(b.archive, 'archive', 'pr', 'user')
    config.branches.archive = role
    errors.push(...e)
  }

  if (strict !== undefined) config.strict = strict

  errors.push(...validateConfig(config))
  return { config: errors.length > 0 ? null : config, errors, warnings, usingDefaults: false, ...(strict !== undefined ? { strict } : {}) }
}

/** 配置校验: 角色分支重叠等(角色条目正则合法性已在 normalizeRole 预编译报错) */
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

/** 从项目根加载配置; 无文件 = 使用内置默认配置(开箱即用, develop/main 已受保护) */
export async function loadConfig(repoRoot: string): Promise<ConfigLoadResult> {
  let text: string
  try {
    text = await readFile(join(repoRoot, CONFIG_FILE), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return { config: structuredClone(DEFAULT_CONFIG), errors: [], warnings: [], usingDefaults: true }
    }
    return { config: null, errors: [`Failed to read config file: ${(e as Error).message}`], warnings: [], usingDefaults: false }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    // JSON 整体损坏(mergeConfig 无从运行): strict 位按原文保守提取(仅匹配 "strict": true),
    // 保证 fail-closed 判定在配置最坏形态下仍然生效
    const strict = /"strict"\s*:\s*true/.test(text) || undefined
    return {
      config: null,
      errors: [`Failed to read config file: ${(e as Error).message}`],
      warnings: [],
      usingDefaults: false,
      ...(strict ? { strict } : {}),
    }
  }
  return mergeConfig(raw)
}
