// CLI: gitflow-guard status/audit/check(只读 + agent hook 门禁)

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { classify } from './classify'
import { loadConfig, roleMatches } from './config'
import { evaluateCommand, formatDeny, stateDir } from './index'
import { detectPlatform, encodeDeny, extractHookPayload } from './platform'
import { currentBranch, findRepoRoot, gitRunner } from './repo'
import type { HookPayload, HookPlatform } from './platform'
import type { BranchRole } from './types'
import type { Runner } from './repo'

const USAGE = `gitflow-guard — GitFlow 流程守卫 CLI

用法:
  gitflow-guard status [--repo <路径>]
  gitflow-guard audit [--lines <数量>] [--repo <路径>]
  gitflow-guard check [--platform <claude|auto>] [--command "<cmd>"] [--repo <路径>]
  gitflow-guard --help

说明:
  status/audit 只读, agent 可自查。
  check 读 stdin hook payload 做门禁(exit 0=放行 / 2=拦截), 供 Claude Code 等 agent 的 pre/post hook 调用。`

interface Flags {
  repo?: string
  lines?: number
  platform?: string
  command?: string
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--repo') flags.repo = next()
    else if (a === '--lines') flags.lines = Number(next())
    else if (a === '--platform') flags.platform = next()
    else if (a === '--command') flags.command = next()
    else if (a.startsWith('--repo=')) flags.repo = a.slice(7)
    else if (a.startsWith('--lines=')) flags.lines = Number(a.slice(8))
    else if (a.startsWith('--platform=')) flags.platform = a.slice('--platform='.length)
    else if (a.startsWith('--command=')) flags.command = a.slice('--command='.length)
  }
  return flags
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
  const flags = parseFlags(rest)

  try {
    if (cmd === 'status') return await status(flags, runner)
    if (cmd === 'audit') return await audit(flags)
    if (cmd === 'check') return await check(flags)
    console.error(`[gitflow-guard] 未知子命令: ${cmd ?? ''}\n\n${USAGE}`)
    return 1
  } catch (e) {
    console.error(`[gitflow-guard] ${(e as Error).message}`)
    return 1
  }
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
  const c = config!
  console.log(`配置: 已启用 | featurePattern: ${c.featurePattern}`)
  console.log(`集成分支: ${c.branches.integration.branches.join(', ')} (update=${c.branches.integration.update || 'pr'})`)
  if (c.branches.preview) console.log(`预览分支: ${c.branches.preview.branches.join(', ')} (update=${c.branches.preview.update || 'pr'})`)
  if (c.branches.production) console.log(`生产分支: ${c.branches.production.branches.join(', ')} (update=${c.branches.production.update || 'pr'}, 合并=${c.branches.production.mergeBy || 'user'})`)
  if (c.branches.archive) console.log(`归档分支: ${c.branches.archive.branches.join(', ')}`)
  console.log(`当前分支: ${branch ?? '(未知)'}`)

  // 列出本地分支并按角色分组(展示用)
  const r = await runner.run(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], repoRoot)
  const localBranches = r.code === 0 ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : []
  const classifyBranch = (b: string): string => {
    if (c.branches.production && roleMatches(b, c.branches.production)) return 'production'
    if (c.branches.preview && roleMatches(b, c.branches.preview)) return 'preview'
    if (roleMatches(b, c.branches.integration)) return 'integration'
    if (c.branches.archive && roleMatches(b, c.branches.archive)) return 'archive'
    if (new RegExp(c.featurePattern).test(b)) return 'feature'
    return 'other'
  }
  console.log('本地分支(按角色):')
  for (const b of localBranches) console.log(`  ${b} → ${classifyBranch(b)}`)
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
        const e = JSON.parse(line) as { time: number; event: string; command?: string; role?: string; reason?: string }
        console.log(`  ${new Date(e.time).toLocaleString()} ${e.event} ${e.role ?? ''}${e.command ? ` | ${e.command.slice(0, 80)}` : ''}${e.reason ? ` | ${e.reason.slice(0, 60)}` : ''}`)
      } catch {
        console.log(`  ${line}`)
      }
    }
  } catch {
    console.log('  暂无审计记录')
  }
  return 0
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', () => resolve(data))
  })
}

/** check: agent hook 门禁。读 stdin hook payload(或 --command), exit 0=放行 / 2=拦截(按平台编码) */
async function check(flags: Flags): Promise<number> {
  const platform = (flags.platform ?? 'auto') as HookPlatform | 'auto'
  try {
    const raw = flags.command != null ? '' : await readStdin()
    const payload: HookPayload | null =
      flags.command != null
        ? { command: flags.command, cwd: flags.repo, event: 'pre' }
        : extractHookPayload(raw, platform)
    if (!payload?.command) return 0

    // 快路径: 非 git/gh/glab/gitflow-guard 命令直接放行, 不触发任何 git 查询
    const segments = classify(payload.command)
    if (segments.length === 0 || segments.every((s) => s.kind === 'other')) return 0

    const cwd = payload.cwd ?? process.cwd()
    const repoRoot = flags.repo ?? (await findRepoRoot(gitRunner, cwd))
    if (!repoRoot) return 0
    const { config } = await loadConfig(repoRoot)
    if (!config?.enabled) return 0

    // --platform auto 时按 payload 判别; 具体平台用于 deny 编码
    const hookPlatform: HookPlatform = platform === 'auto' ? detectPlatform(raw) : platform
    const result = await evaluateCommand(payload.command, { repoRoot })
    if (result.outcome === 'deny' && result.reason) {
      const enc = encodeDeny(hookPlatform, formatDeny(result.reason.why, result.reason.next))
      if (enc.stdout) process.stdout.write(enc.stdout + '\n')
      if (enc.stderr) process.stderr.write(enc.stderr + '\n')
      return enc.exitCode
    }
    return 0
  } catch (e) {
    // fail-open: 门禁内部故障不阻断工具管道(与插件 apply 的降级一致)
    process.stderr.write(`[gitflow-guard] check 内部错误, 已放行: ${(e as Error).message}\n`)
    return 0
  }
}
