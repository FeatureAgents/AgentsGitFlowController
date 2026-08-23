// 插件入口: 挂载 tools/pre-execute 做分支角色硬拦截; 核心逻辑在 evaluateCommand(可独立测试)

import { appendFile, mkdir } from 'node:fs/promises'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
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

// 运行时语言扩展点(包根再导出): 下游经 registerLocale 注册自定义 locale 后, 即可在项目配置引用该 locale 名;
// MESSAGE_KEYS 导出必需键清单(自定义字典须覆盖的键集合), 下游不必翻源码数键
export { MESSAGE_KEYS, registerLocale } from './i18n'
export type { Dict } from './i18n'

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

/**
 * 用户级运行时状态根目录(仓库外): macOS/Linux 走 XDG state, Windows 走 %LOCALAPPDATA%。
 * GITFLOW_GUARD_STATE_ROOT 显式覆盖所有平台默认值(测试/特殊部署用)。
 */
export function userStateRoot(): string {
  const override = process.env.GITFLOW_GUARD_STATE_ROOT?.trim()
  if (override) return override
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA?.trim() || join(homedir(), 'AppData', 'Local')
    return join(local, 'gitflow-guard')
  }
  const xdg = process.env.XDG_STATE_HOME?.trim()
  return join(xdg || join(homedir(), '.local', 'state'), 'gitflow-guard')
}

function canonicalRepoRoot(repoRoot: string): string {
  let real: string
  try {
    // 规范化符号链接(macOS /tmp → /private/tmp、Windows 8.3 短名), 保证哈希键稳定
    real = realpathSync(repoRoot)
  } catch {
    return repoRoot
  }
  // linked worktree 的 .git 是文件(gitdir 指针)。剥去 /worktrees/<name> 得共享 .git,
  // 再去掉 .git 后缀即主仓库根 —— 同一仓库所有工作树共用一个状态目录,
  // 恢复 ≤0.0.13 在共享 .git 内存储的语义(否则审计历史被按工作树切碎。
  try {
    const dotGit = join(real, '.git')
    if (!statSync(dotGit).isFile()) return real
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotGit, 'utf8'))
    if (!m) return real
    const worktreeGitDir = realpathSync(resolve(real, m[1]))
    const commonGitDir = worktreeGitDir.replace(/[/\\]worktrees[/\\][^/\\]+$/, '')
    if (commonGitDir === worktreeGitDir) return real
    const mainRoot = commonGitDir.replace(/[/\\]\.git$/, '')
    return mainRoot || commonGitDir
  } catch {
    return real
  }
}

/**
 * 仓库运行时状态目录(审计流水等), 键为「仓库名-真实路径哈希」。
 * 刻意放在仓库外、且在 agent 文件沙箱(workspace-write)可写区之外:
 * 凡 agent 可写之处的状态都可能被 agent 伪造而自我授权, 存仓库外才堵住这条路;
 * 附带收益: 重克隆/移动 .git 不丢历史。
 */
export function stateDir(repoRoot: string): string {
  const real = canonicalRepoRoot(repoRoot)
  const hash = createHash('sha256').update(real).digest('hex').slice(0, 12)
  const name = basename(real).replace(/[^\w.-]+/g, '-') || 'repo'
  return join(userStateRoot(), 'repos', `${name}-${hash}`)
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
