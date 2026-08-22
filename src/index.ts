// 插件入口: 挂载 tools/pre-execute 做分支角色硬拦截; 核心逻辑在 evaluateCommand(可独立测试)

import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { classify } from './classify'
import { loadConfig } from './config'
import { decide } from './gate'
import { makeT, resolveLocale } from './i18n'
import type { Locale } from './i18n'
import { currentBranch as queryCurrentBranch, findRepoRoot, ghPrChecks, ghPrInfo, ghRunner, gitRunner, glabMrInfo, glabRunner, resolvePrTarget } from './repo'
import type { Classified, GateFacts, PrTargetResolution } from './types'
import type { Runner } from './repo'

export const name = 'gitflow-guard'

export interface PluginConfig {
  /** 拦截哪些工具的命令文本(默认 pwsh / bash) */
  toolNames?: string[]
}

export interface EvaluateOptions {
  repoRoot: string
  runner?: Runner
  /** GitHub gh 适配器执行器(测试注入; 默认真实 gh) */
  ghRunner?: Runner
  /** GitLab glab 适配器执行器(测试注入; 默认真实 glab) */
  glabRunner?: Runner
  /** 当前分支(缺省时内部查询) */
  currentBranch?: string | null
  /** 覆盖文案 locale(CLI --locale 旗标用, P2-1); 缺省按项目 config.locale 解析 */
  locale?: Locale
}

export interface EvaluateResult {
  outcome: 'allow' | 'deny' | 'skipped'
  reason?: { why: string; next: string }
  segmentCount: number
  /** 本次评估使用的文案语言(供 formatDeny/审计一致) */
  locale: Locale
}

export interface AuditEntry {
  time: number
  event: 'deny' | 'ci'
  command?: string
  role?: string
  reason?: string
}

export function stateDir(repoRoot: string): string {
  return join(repoRoot, '.git', 'gitflow-guard')
}

/** 审计留痕; 失败不阻断门禁 */
export async function appendAudit(repoRoot: string, entry: AuditEntry): Promise<void> {
  try {
    await mkdir(stateDir(repoRoot), { recursive: true })
    await appendFile(join(stateDir(repoRoot), 'audit.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8')
  } catch {
    // 审计写失败不阻断流程
  }
}

interface Env {
  repoRoot: string
  config: NonNullable<Awaited<ReturnType<typeof loadConfig>>['config']>
  branch: string | null
  runner: Runner
  gh: Runner
  glab: Runner
}

/** 解析一条命令: 分类 → git 事实 → 门禁 → allow/deny */
export async function evaluateCommand(command: string, opts: EvaluateOptions): Promise<EvaluateResult> {
  const runner = opts.runner ?? gitRunner
  const gh = opts.ghRunner ?? ghRunner
  const glab = opts.glabRunner ?? glabRunner
  const { config } = await loadConfig(opts.repoRoot)
  if (!config?.enabled) return { outcome: 'skipped', segmentCount: 0, locale: 'en' }
  const locale = opts.locale != null ? resolveLocale(opts.locale) : resolveLocale(config.locale)
  const t = makeT(locale)

  const branch = opts.currentBranch ?? (await queryCurrentBranch(runner, opts.repoRoot))
  const env: Env = { repoRoot: opts.repoRoot, config, branch, runner, gh, glab }

  const segments = classify(command, { currentBranch: branch })
  // 模拟分支状态: checkout/switch 段会改变后续段的当前分支(命令执行前无法得知)
  let simulatedBranch = branch
  for (const seg of segments) {
    const { facts } = await factsFor(seg, { ...env, branch: simulatedBranch })
    const decision = decide(seg, facts, config, t)
    if (decision.kind === 'deny') {
      await appendAudit(env.repoRoot, { time: Date.now(), event: 'deny', command, reason: decision.reason })
      return { outcome: 'deny', reason: { why: decision.reason, next: decision.next }, segmentCount: segments.length, locale }
    }
    await logCiReference(seg, env)
    if (seg.kind === 'checkout' && seg.branch != null) simulatedBranch = seg.branch
  }
  return { outcome: 'allow', segmentCount: segments.length, locale }
}

/** CI 参考(可选适配器): gh pr checks 状态记入审计日志, 查不到自动跳过 */
async function logCiReference(seg: Classified, env: Env): Promise<void> {
  if (!env.config.ci.enabled) return
  if (seg.kind !== 'pr-merge') return
  const state = await ghPrChecks(env.gh, env.repoRoot, seg.pr)
  if (state == null) return
  await appendAudit(env.repoRoot, { time: Date.now(), event: 'ci', command: seg.pr ?? undefined, role: state })
}

/** 按段预取 git 事实(异步 I/O 全部前置, 门禁保持纯函数) */
async function factsFor(seg: Classified, env: Env): Promise<{ facts: GateFacts; head: string | null }> {
  const { config, repoRoot, branch } = env
  let head: string | null = null
  let prRes: PrTargetResolution | null = null

  if (seg.kind === 'pr-merge') {
    // 先试 GitHub gh, 再试 GitLab glab
    const ghInfo = await ghPrInfo(env.gh, repoRoot, seg.pr)
    prRes = resolvePrTarget(ghInfo, config)
    if (!prRes) {
      const glabInfo = await glabMrInfo(env.glab, repoRoot, seg.pr)
      prRes = resolvePrTarget(glabInfo, config)
    }
    head = prRes?.head ?? branch
  }

  return {
    head,
    facts: {
      currentBranch: branch,
      ...(prRes ? { resolvePrTarget: () => prRes } : {}),
    },
  }
}

function commandText(exec: ToolExecution): string {
  const args = exec.arguments as { command?: unknown } | undefined
  return typeof args?.command === 'string' ? args.command : ''
}

export function formatDeny(locale: Locale, why: string, next: string): string {
  const t = makeT(locale)
  return `${t('deny.header', { why })}\n${t('deny.next', { next })}`
}

export function apply(ctx: Context, pluginConfig: PluginConfig = {}): void {
  const toolNames = new Set(pluginConfig.toolNames ?? ['pwsh', 'bash'])

  ctx.on('tools/pre-execute', async (exec, next) => {
    try {
      const command = commandText(exec)
      if (!command || !toolNames.has(exec.name)) return next()
      const cwd = exec.agent?.session.header.cwd ?? process.cwd()
      const repoRoot = await findRepoRoot(gitRunner, cwd)
      if (!repoRoot) return next()

      const result = await evaluateCommand(command, { repoRoot, runner: gitRunner })
      if (result.outcome === 'deny' && result.reason) {
        return { kind: 'deny', reason: formatDeny(result.locale, result.reason.why, result.reason.next) }
      }
      return next()
    } catch (e) {
      // 门禁内部故障降级放行, 不阻断工具管道
      ctx.logger?.warn?.(`gitflow-guard: gate internal error, allowed through: ${(e as Error).message}`)
      return next()
    }
  })
}
