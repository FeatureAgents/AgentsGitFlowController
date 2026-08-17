// 插件入口: 挂载 tools/pre-execute(硬拦截) + tools/post-execute(特许消费)
//            + session/event(聊天确认); 核心逻辑在 evaluateCommand(可独立测试)

import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { classify } from './classify'
import { loadConfig } from './config'
import { decide } from './gate'
import { openPermitStore } from './permits'
import { currentBranch as queryCurrentBranch, findRepoRoot, ghPrChecks, ghPrInfo, ghRunner, gitRunner, isAncestor, resolvePrTarget } from './repo'
import { parseConfirmation } from './session'
import type { Classified, GateFacts, PermitKind, PrTargetResolution } from './types'
import type { Runner } from './repo'

export const name = 'gitflow-guard'

export interface PluginConfig {
  /** 拦截哪些工具的命令文本(默认 pwsh / bash) */
  toolNames?: string[]
  /** 特许默认有效期(毫秒; 默认不过期) */
  permitTtlMs?: number
}

export interface EvaluateOptions {
  repoRoot: string
  runner?: Runner
  /** gh 适配器执行器(测试注入; 默认真实 gh) */
  ghRunner?: Runner
  /** 当前分支(缺省时内部查询) */
  currentBranch?: string | null
  now?: () => number
}

export interface PendingConsume {
  kind: PermitKind
  feature: string
}

export interface EvaluateResult {
  outcome: 'allow' | 'deny' | 'skipped'
  reason?: { why: string; next: string }
  segmentCount: number
  /** 放行时可能被本次动作消费的特许(动作成功后由 post-execute 消费) */
  pendingConsume: PendingConsume[]
}

export interface AuditEntry {
  time: number
  event: 'allow' | 'deny' | 'grant' | 'consume' | 'remind' | 'ci'
  command?: string
  feature?: string
  kind?: string
  reason?: string
}

export function stateDir(repoRoot: string): string {
  return join(repoRoot, '.git', 'gitflow-guard')
}

function stateFile(repoRoot: string): string {
  return join(stateDir(repoRoot), 'state.json')
}

/** 审计留痕; 失败不阻断门禁 */
export async function appendAudit(repoRoot: string, entry: AuditEntry): Promise<void> {
  try {
    // 目录可能尚不存在(无任何特许操作时), 需先建
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
  store: Awaited<ReturnType<typeof openPermitStore>>
}

/** 解析一条命令: 分类 → git 事实 → 门禁 → allow/deny */
export async function evaluateCommand(command: string, opts: EvaluateOptions): Promise<EvaluateResult> {
  const runner = opts.runner ?? gitRunner
  const gh = opts.ghRunner ?? ghRunner
  const { config } = await loadConfig(opts.repoRoot)
  if (!config?.enabled) return { outcome: 'skipped', segmentCount: 0, pendingConsume: [] }

  const branch = opts.currentBranch ?? (await queryCurrentBranch(runner, opts.repoRoot))
  const store = await openPermitStore(stateFile(opts.repoRoot), opts.now)
  const env: Env = { repoRoot: opts.repoRoot, config, branch, runner, gh, store }

  const segments = classify(command, { currentBranch: branch })
  const pendingConsume: PendingConsume[] = []
  // 模拟分支状态: checkout/switch 段会改变后续段的当前分支(命令执行前无法得知)
  let simulatedBranch = branch
  for (const seg of segments) {
    const { facts, head, inPreview } = await factsFor(seg, { ...env, branch: simulatedBranch })
    const decision = decide(seg, facts, config)
    if (decision.kind === 'deny') {
      await appendAudit(env.repoRoot, { time: Date.now(), event: 'deny', command, reason: decision.reason })
      return { outcome: 'deny', reason: { why: decision.reason, next: decision.next }, segmentCount: segments.length, pendingConsume }
    }
    pendingConsume.push(...permitsUsedBy(seg, env, head, inPreview))
    await logCiReference(seg, env)
    if (seg.kind === 'checkout' && seg.branch != null) simulatedBranch = seg.branch
  }
  return { outcome: 'allow', segmentCount: segments.length, pendingConsume }
}

/** CI 参考(可选适配器): gh pr checks 状态记入审计日志, 查不到自动跳过 */
async function logCiReference(seg: Classified, env: Env): Promise<void> {
  if (!env.config.ci.enabled) return
  if (seg.kind !== 'pr-merge') return
  const state = await ghPrChecks(env.gh, env.repoRoot, seg.pr)
  if (state == null) return
  await appendAudit(env.repoRoot, { time: Date.now(), event: 'ci', kind: state, feature: seg.pr ?? undefined })
}

/** 按段预取 git 事实(异步 I/O 全部前置, 门禁保持纯函数) */
async function factsFor(seg: Classified, env: Env): Promise<{ facts: GateFacts; head: string | null; inPreview: boolean }> {
  const { config, repoRoot, branch, runner } = env
  const preview = config.branches.preview
  let head: string | null = null
  let prRes: PrTargetResolution | null = null

  if (seg.kind === 'pr-merge') {
    prRes = resolvePrTarget(await ghPrInfo(env.gh, repoRoot, seg.pr), config)
    head = prRes?.head ?? branch
  } else if (seg.kind === 'local-merge') {
    head = seg.source
  } else if (seg.kind === 'pr-create') {
    head = branch
  }

  const inPreview = head ? await isAncestor(runner, repoRoot, head, preview) : false
  return {
    head,
    inPreview,
    facts: {
      currentBranch: branch,
      featureInPreview: (f) => f === head && inPreview,
      hasPermit: (kind, f) => env.store.hasValid(kind, f),
      ...(prRes ? { resolvePrTarget: () => prRes } : {}),
    },
  }
}

/** 本次放行动作实际依赖了哪些特许(动作成功后消费; 未用到的特许不消耗) */
function permitsUsedBy(seg: Classified, env: Env, head: string | null, inPreview: boolean): PendingConsume[] {
  const out: PendingConsume[] = []
  const has = (kind: PermitKind, feature: string) => feature != null && env.store.hasValid(kind, feature)
  if (seg.kind === 'local-merge' || seg.kind === 'pr-merge') {
    if (head != null && inPreview && has('confirm', head)) out.push({ kind: 'confirm', feature: head })
  }
  if (seg.kind === 'pr-create') {
    if (seg.target === env.config.branches.base && head != null && !inPreview && has('early-pr', head)) {
      out.push({ kind: 'early-pr', feature: head })
    }
    if (seg.target === env.config.branches.trunk && head != null && has('trunk-pr', head)) {
      out.push({ kind: 'trunk-pr', feature: head })
    }
  }
  return out
}

function commandText(exec: ToolExecution): string {
  const args = exec.arguments as { command?: unknown } | undefined
  return typeof args?.command === 'string' ? args.command : ''
}

function messageText(msg: UserMessage): string {
  return (msg.content ?? []).map((b) => (b?.type === 'text' ? b.text : '')).join(' ')
}

function formatDeny(why: string, next: string): string {
  return `[gitflow-guard] 已拦截: ${why}\n下一步: ${next}`
}

export function apply(ctx: Context, pluginConfig: PluginConfig = {}): void {
  const toolNames = new Set(pluginConfig.toolNames ?? ['pwsh', 'bash'])
  // exec 对象 → 待消费特许(仅当该工具调用成功时消费); WeakMap 防泄漏
  const pending = new WeakMap<ToolExecution, PendingConsume[]>()

  ctx.on('tools/pre-execute', async (exec, next) => {
    try {
      const command = commandText(exec)
      if (!command || !toolNames.has(exec.name)) return next()
      const cwd = exec.agent?.session.header.cwd ?? process.cwd()
      const repoRoot = await findRepoRoot(gitRunner, cwd)
      if (!repoRoot) return next()

      const result = await evaluateCommand(command, { repoRoot, runner: gitRunner })
      if (result.outcome === 'deny' && result.reason) {
        return { kind: 'deny', reason: formatDeny(result.reason.why, result.reason.next) }
      }
      if (result.pendingConsume.length > 0) pending.set(exec, result.pendingConsume)
      return next()
    } catch (e) {
      // 门禁内部故障(如 state.json 损坏)降级放行, 不阻断工具管道
      ctx.logger?.warn?.(`gitflow-guard: 门禁内部错误, 已放行: ${(e as Error).message}`)
      return next()
    }
  })

  ctx.on('tools/post-execute', async (exec, result, next) => {
    try {
      const toConsume = pending.get(exec)
      if (!toConsume) return next()
      pending.delete(exec)
      const cwd = exec.agent?.session.header.cwd ?? process.cwd()
      const repoRoot = await findRepoRoot(gitRunner, cwd)
      if (!repoRoot || result.isError !== false) return next()

      const store = await openPermitStore(stateFile(repoRoot))
      for (const p of toConsume) {
        const used = await store.consume(p.kind, p.feature)
        await appendAudit(repoRoot, { time: Date.now(), event: used ? 'consume' : 'remind', feature: p.feature, kind: p.kind })
        ctx.logger?.info?.(`gitflow-guard: ${used ? '已消费' : '未找到'}特许 ${p.kind} for ${p.feature}`)
      }
      return next()
    } catch (e) {
      ctx.logger?.warn?.(`gitflow-guard: 特许消费失败: ${(e as Error).message}`)
      return next()
    }
  })

  ctx.on('session/event', async (session, event) => {
    try {
      if (event.type !== 'user/message') return
      const data = event.data
      // 仅认真人消息: source.kind === 'user', agent 无法伪造
      if (data.source?.kind !== 'user') return
      const text = messageText(data)
      if (!text) return
      const cwd = session.header.cwd ?? process.cwd()
      const repoRoot = await findRepoRoot(gitRunner, cwd)
      if (!repoRoot) return
      const { config } = await loadConfig(repoRoot)
      if (!config?.enabled) return

      const parsed = parseConfirmation(text, config)
      if (!parsed) return
      const store = await openPermitStore(stateFile(repoRoot))
      await store.grant(parsed.kind, parsed.feature, pluginConfig.permitTtlMs != null ? { ttlMs: pluginConfig.permitTtlMs } : undefined)
      await appendAudit(repoRoot, { time: Date.now(), event: 'grant', feature: parsed.feature, kind: parsed.kind })
      ctx.logger?.info?.(`gitflow-guard: 已记录特许 ${parsed.kind} for ${parsed.feature}`)
    } catch (e) {
      ctx.logger?.warn?.(`gitflow-guard: 确认解析失败: ${(e as Error).message}`)
    }
  })
}
