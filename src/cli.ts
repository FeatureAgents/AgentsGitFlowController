// CLI: gitflow-guard permit/confirm/status/audit(用户终端专属; agent 执行 permit/confirm 被插件拦截)

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadConfig } from './config'
import { appendAudit, stateDir } from './index'
import { openPermitStore } from './permits'
import { currentBranch, findRepoRoot, gitRunner, isAncestor } from './repo'
import type { PermitKind } from './types'
import type { Runner } from './repo'

const USAGE = `gitflow-guard — GitFlow 流程守卫 CLI(用户终端专属)

用法:
  gitflow-guard permit <feature> [--kind early-pr|confirm|trunk-pr] [--ttl <分钟>] [--repo <路径>]
  gitflow-guard confirm <feature> [--ttl <分钟>] [--repo <路径>]
  gitflow-guard status [--repo <路径>]
  gitflow-guard audit [--lines <数量>] [--repo <路径>]
  gitflow-guard --help

说明:
  permit/confirm 是用户专属授权操作, agent 执行会被插件拦截。
  status/audit 只读, agent 可自查。`

interface Flags {
  repo?: string
  kind?: string
  ttl?: number
  lines?: number
}

function parseFlags(argv: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = []
  const flags: Flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--repo') flags.repo = next()
    else if (a === '--kind') flags.kind = next()
    else if (a === '--ttl') flags.ttl = Number(next())
    else if (a === '--lines') flags.lines = Number(next())
    else if (a.startsWith('--repo=')) flags.repo = a.slice(7)
    else if (a.startsWith('--kind=')) flags.kind = a.slice(7)
    else if (a.startsWith('--ttl=')) flags.ttl = Number(a.slice(6))
    else if (a.startsWith('--lines=')) flags.lines = Number(a.slice(8))
    else positional.push(a)
  }
  return { positional, flags }
}

async function resolveRepo(flags: Flags): Promise<string | null> {
  if (flags.repo) return flags.repo
  return await findRepoRoot(gitRunner, process.cwd())
}

export async function main(argv: string[], opts: { runner?: Runner } = {}): Promise<number> {
  const runner = opts.runner ?? gitRunner
  const [cmd, ...rest] = argv
  if (cmd === '--help' || cmd === 'help' || cmd === undefined) {
    console.log(USAGE)
    return 0
  }
  const { positional, flags } = parseFlags(rest)

  try {
    if (cmd === 'permit') return await permit(positional, flags, runner)
    if (cmd === 'confirm') return await permit(positional, { ...flags, kind: 'confirm' }, runner)
    if (cmd === 'status') return await status(flags, runner)
    if (cmd === 'audit') return await audit(flags)
    console.error(`[gitflow-guard] 未知子命令: ${cmd ?? ''}\n\n${USAGE}`)
    return 1
  } catch (e) {
    console.error(`[gitflow-guard] ${(e as Error).message}`)
    return 1
  }
}

async function permit(positional: string[], flags: Flags, runner: Runner): Promise<number> {
  const feature = positional[0]
  if (!feature) {
    console.error('[gitflow-guard] 用法: gitflow-guard permit <feature> [--kind early-pr|confirm|trunk-pr]')
    return 1
  }
  const kind = (flags.kind ?? 'confirm') as PermitKind
  if (kind !== 'early-pr' && kind !== 'confirm' && kind !== 'trunk-pr') {
    console.error('[gitflow-guard] --kind 必须是 early-pr / confirm / trunk-pr')
    return 1
  }
  const ttlMs = flags.ttl != null && Number.isFinite(flags.ttl) && flags.ttl > 0 ? flags.ttl * 60_000 : undefined

  const repoRoot = await resolveRepo(flags)
  if (!repoRoot) {
    console.error('[gitflow-guard] 无法定位 git 仓库(当前目录不在仓库内, 或用 --repo 指定)')
    return 1
  }
  const { config } = await loadConfig(repoRoot)
  if (!config?.enabled) {
    console.error(`[gitflow-guard] 项目未启用 gitflow-guard(${join(repoRoot, 'gitflow-guard.config.json')} 不存在或 enabled=false)`)
    return 1
  }

  const store = await openPermitStore(join(stateDir(repoRoot), 'state.json'))
  const granted = await store.grant(kind, feature, ttlMs != null ? { ttlMs } : undefined)
  await appendAudit(repoRoot, { time: Date.now(), event: 'grant', kind, feature })
  console.log(`[gitflow-guard] 已授权: ${kind} → ${feature}${granted.expiresAt ? `(有效期至 ${new Date(granted.expiresAt).toLocaleString()})` : '(长期有效)'}`)
  return 0
}

async function status(flags: Flags, runner: Runner): Promise<number> {
  const repoRoot = await resolveRepo(flags)
  if (!repoRoot) {
    console.error('[gitflow-guard] 无法定位 git 仓库')
    return 1
  }
  const { config, errors } = await loadConfig(repoRoot)
  const enabled = config?.enabled === true
  console.log(`[gitflow-guard] status — ${repoRoot}`)
  if (!enabled) {
    console.log('配置: 未启用(不存在 gitflow-guard.config.json 或 enabled=false)')
    for (const e of errors) console.log(`  配置错误: ${e}`)
    return 0
  }

  const branch = await currentBranch(runner, repoRoot)
  console.log(`配置: 已启用(${config!.mode} 模式) | 基线: ${config!.branches.base} | 预览: ${config!.branches.preview}${config!.branches.trunk ? ` | 主干: ${config!.branches.trunk}` : ''}`)
  console.log(`当前分支: ${branch ?? '(未知)'}`)

  // 预览分支包含的 feature(按 featurePattern 过滤本地分支)
  const pattern = new RegExp(config!.confirm.featurePattern)
  const r = await runner.run(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], repoRoot)
  const branches = r.code === 0 ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : []
  const features = branches.filter((b) => pattern.test(b))

  const store = await openPermitStore(join(stateDir(repoRoot), 'state.json'))
  const inPreview: string[] = []
  for (const f of features) {
    if (await isAncestor(runner, repoRoot, f, config!.branches.preview)) inPreview.push(f)
  }
  console.log(`预览分支(${config!.branches.preview})包含的 feature:`)
  for (const f of inPreview) console.log(`  ✓ ${f}`)
  if (inPreview.length === 0) console.log('  (无)')

  console.log('feature 状态一览:')
  for (const f of features) {
    const confirmed = store.hasValid('confirm', f)
    const early = store.hasValid('early-pr', f)
    const trunk = store.hasValid('trunk-pr', f)
    const mark = (ok: boolean) => (ok ? '✓' : '✗')
    console.log(`  ${f}: 已合预览 ${mark(inPreview.includes(f))} | 已确认(P2) ${mark(confirmed)} | P1 ${early ? '✓' : '-'} | P3 ${trunk ? '✓' : '-'}`)
  }

  const permits = store.list()
  if (permits.length > 0) {
    console.log('特许记录:')
    for (const p of permits) {
      const state = p.used ? '已使用' : p.expiresAt && p.expiresAt <= Date.now() ? '已过期' : '未使用'
      console.log(`  ${p.kind} ${p.feature} (${state})`)
    }
  }
  return 0
}

async function audit(flags: Flags): Promise<number> {
  const repoRoot = await resolveRepo(flags)
  if (!repoRoot) {
    console.error('[gitflow-guard] 无法定位 git 仓库')
    return 1
  }
  const lines = flags.lines != null && Number.isFinite(flags.lines) && flags.lines > 0 ? Math.floor(flags.lines) : 20
  try {
    const text = await readFile(join(stateDir(repoRoot), 'audit.jsonl'), 'utf8')
    const all = text.split('\n').filter(Boolean)
    for (const line of all.slice(-lines)) {
      try {
        const e = JSON.parse(line) as { time: number; event: string; command?: string; feature?: string; kind?: string }
        console.log(`  ${new Date(e.time).toLocaleString()} ${e.event} ${e.kind ?? ''} ${e.feature ?? ''}${e.command ? ` | ${e.command.slice(0, 80)}` : ''}`)
      } catch {
        console.log(`  ${line}`)
      }
    }
  } catch {
    console.log('  暂无审计记录')
  }
  return 0
}
