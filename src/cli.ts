// CLI: gitflow-guard status/audit/check(只读 + agent hook 门禁)

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { classify } from './classify'
import { loadConfig, roleMatches } from './config'
import { evaluateCommand, formatDeny, stateDir } from './index'
import { makeT, resolveLocale } from './i18n'
import type { Locale } from './i18n'
import { detectPlatform, encodeDeny, extractHookPayload } from './platform'
import { currentBranch, findRepoRoot, gitRunner } from './repo'
import type { HookPayload, HookPlatform } from './platform'
import type { BranchRole } from './types'
import type { Runner } from './repo'

interface Flags {
  repo?: string
  lines?: number
  platform?: string
  command?: string
  locale?: string
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
    else if (a === '--locale') flags.locale = next()
    else if (a.startsWith('--repo=')) flags.repo = a.slice(7)
    else if (a.startsWith('--lines=')) flags.lines = Number(a.slice(8))
    else if (a.startsWith('--platform=')) flags.platform = a.slice('--platform='.length)
    else if (a.startsWith('--command=')) flags.command = a.slice('--command='.length)
    else if (a.startsWith('--locale=')) flags.locale = a.slice('--locale='.length)
  }
  return flags
}

async function resolveRepo(flags: Flags, runner: Runner): Promise<string | null> {
  if (flags.repo) return flags.repo
  return await findRepoRoot(runner, process.cwd())
}

/** CLI 文案 locale 解析(P2-1): --locale 旗标 > 项目 config.locale > en; 白名单外一律 en */
function cliLocale(flags: Flags, configLocale?: unknown): Locale {
  return resolveLocale(flags.locale ?? configLocale)
}

/** 无 config 在手时的 locale 解析(help / unknownCommand 等框架路径): 旗标优先, 否则定位仓库读配置 */
async function resolveFrameworkLocale(flags: Flags, runner: Runner): Promise<Locale> {
  if (flags.locale != null) return resolveLocale(flags.locale)
  const repoRoot = await resolveRepo(flags, runner)
  if (!repoRoot) return 'en'
  const { config } = await loadConfig(repoRoot)
  return resolveLocale(config?.locale)
}

export async function main(argv: string[], opts: { runner?: Runner } = {}): Promise<number> {
  const runner = opts.runner ?? gitRunner
  const [cmd, ...rest] = argv
  const flags = parseFlags(rest)
  // 框架文案(help/unknownCommand)与 status 一致跟随 locale(P1-1 A 方案): --locale > 目标仓库 config > en
  if (cmd === '--help' || cmd === 'help' || cmd === undefined) {
    console.log(makeT(await resolveFrameworkLocale(flags, runner))('usage.text'))
    return 0
  }
  try {
    if (cmd === 'status') return await status(flags, runner)
    if (cmd === 'audit') return await audit(flags)
    if (cmd === 'check') return await check(flags)
    const t = makeT(await resolveFrameworkLocale(flags, runner))
    console.error(`${t('cli.unknownCommand', { cmd: cmd ?? '' })}\n\n${t('usage.text')}`)
    return 1
  } catch (e) {
    console.error(`[gitflow-guard] ${(e as Error).message}`)
    return 1
  }
}

async function status(flags: Flags, runner: Runner): Promise<number> {
  const repoRoot = await resolveRepo(flags, runner)
  if (!repoRoot) {
    console.error(makeT(resolveLocale(flags.locale))('cli.cannotLocate'))
    return 1
  }
  const { config, errors, warnings } = await loadConfig(repoRoot)
  const enabled = config?.enabled === true
  const t = makeT(cliLocale(flags, config?.locale))
  console.log(t('cli.statusTitle', { repo: repoRoot }))
  if (!enabled) {
    console.log(t('cli.statusDisabled'))
    for (const e of errors) console.log(t('cli.statusConfigError', { err: e }))
    for (const w of warnings) console.log(t('cli.statusConfigWarning', { warn: w }))
    return 0
  }
  // 非致命告警(如未注册 locale 回退 en)在启用态也可见(P2-2)
  for (const w of warnings) console.log(t('cli.statusConfigWarning', { warn: w }))

  const branch = await currentBranch(runner, repoRoot)
  const c = config!
  console.log(t('cli.statusEnabled', { pattern: c.featurePattern }))
  console.log(t('cli.statusIntegration', { list: c.branches.integration.branches.join(', '), mode: c.branches.integration.update || 'pr' }))
  if (c.branches.preview) console.log(t('cli.statusPreview', { list: c.branches.preview.branches.join(', '), mode: c.branches.preview.update || 'pr' }))
  if (c.branches.production) console.log(t('cli.statusProduction', { list: c.branches.production.branches.join(', '), mode: c.branches.production.update || 'pr', merge: c.branches.production.mergeBy || 'user' }))
  if (c.branches.archive) console.log(t('cli.statusArchive', { list: c.branches.archive.branches.join(', ') }))
  console.log(t('cli.statusCurrentBranch', { branch: branch ?? t('cli.statusUnknownBranch') }))

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
  console.log(t('cli.statusLocalBranches'))
  for (const b of localBranches) console.log(`  ${b} → ${classifyBranch(b)}`)
  return 0
}

async function audit(flags: Flags): Promise<number> {
  const repoRoot = await resolveRepo(flags, gitRunner)
  if (!repoRoot) {
    console.error(makeT(resolveLocale(flags.locale))('cli.cannotLocate'))
    return 1
  }
  // auditEmpty 属用户可见框架文案, 同样跟随 locale(P1-1)
  const { config } = await loadConfig(repoRoot)
  const t = makeT(cliLocale(flags, config?.locale))
  const lines = flags.lines != null && Number.isFinite(flags.lines) && flags.lines > 0 ? Math.floor(flags.lines) : 20
  try {
    const text = await readFile(join(stateDir(repoRoot), 'audit.jsonl'), 'utf8')
    const all = text.split('\n').filter(Boolean)
    for (const line of all.slice(-lines)) {
      try {
        const e = JSON.parse(line) as { time: number; event: string; command?: string; role?: string; reason?: string }
        // ISO 8601(UTC) 渲染(P2-3): 不随机器 locale/TZ 变化, 国际协作可读可排序
        console.log(`  ${new Date(e.time).toISOString()} ${e.event} ${e.role ?? ''}${e.command ? ` | ${e.command.slice(0, 80)}` : ''}${e.reason ? ` | ${e.reason.slice(0, 60)}` : ''}`)
      } catch {
        console.log(`  ${line}`)
      }
    }
  } catch {
    console.log(t('cli.auditEmpty'))
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

/** 按平台编码并输出 deny, 返回退出码 */
function emitDeny(platform: HookPlatform, why: string, next: string, locale: Locale = 'en'): number {
  const enc = encodeDeny(platform, formatDeny(locale, why, next))
  if (enc.stdout) process.stdout.write(enc.stdout + '\n')
  if (enc.stderr) process.stderr.write(enc.stderr + '\n')
  return enc.exitCode
}

/** check: agent hook 门禁。读 stdin hook payload(或 --command), exit 0=放行 / 2=拦截(按平台编码) */
async function check(flags: Flags): Promise<number> {
  const platformFlag = (flags.platform ?? 'auto') as HookPlatform | 'auto'
  let raw = ''
  let strict = false
  // P2-5: --command 模式没有 stdin payload(raw 恒 ''), detectPlatform('') 按协议回退 'claude' ——
  // 即 --platform auto + --command 组合下 deny 编码实际走 claude 协议(exit 2 + stderr);
  // 显式 --platform <name> 不受影响。异常路径(readStdin 抛错时 raw='')同样落在此回退上。
  let denyPlatform: HookPlatform = 'claude'
  try {
    raw = flags.command != null ? '' : await readStdin()
    denyPlatform = platformFlag === 'auto' ? detectPlatform(raw) : platformFlag
    const payload: HookPayload | null =
      flags.command != null
        ? { command: flags.command, cwd: flags.repo, event: 'pre' }
        : extractHookPayload(raw, platformFlag)
    if (!payload?.command) return 0

    // 快路径: 非 git/gh/glab/gitflow-guard 命令直接放行, 不触发任何 git 查询
    const segments = classify(payload.command)
    if (segments.length === 0 || segments.every((s) => s.kind === 'other')) return 0

    const cwd = payload.cwd ?? process.cwd()
    const repoRoot = flags.repo ?? (await findRepoRoot(gitRunner, cwd))
    if (!repoRoot) return 0
    const loaded = await loadConfig(repoRoot)
    strict = loaded.strict === true || loaded.config?.strict === true

    // 配置存在但损坏/校验失败(整改 §1.2 B/E): 默认 stderr 一行告警后放行(不破坏工具管道), strict 下 fail-closed;
    // 文件不存在 / 显式 enabled=false 属用户主动状态(opt-in), 维持静默。
    if (!loaded.config?.enabled) {
      if (loaded.errors.length > 0) {
        const t = makeT('en')
        if (strict) {
          return emitDeny(denyPlatform, t('guardStrictConfigBroken.why'), t('guardStrictConfigBroken.next'))
        }
        process.stderr.write(`${t('cli.guardDisabledInvalidConfig', { err: loaded.errors.join('; ') })}\n`)
      }
      return 0
    }

    const config = loaded.config
    // locale(P2-1): --locale 旗标 > 项目 config > en; 并同步传入 evaluateCommand 保证 why/next 正文与封装同语言
    const locale = flags.locale != null ? resolveLocale(flags.locale) : resolveLocale(config.locale)
    const result = await evaluateCommand(payload.command, { repoRoot, locale })
    if (result.outcome === 'deny' && result.reason) {
      return emitDeny(denyPlatform, result.reason.why, result.reason.next, locale)
    }
    return 0
  } catch (e) {
    if (strict) {
      // strict: 内部异常也 fail-closed
      const t = makeT('en')
      return emitDeny(denyPlatform, t('guardStrictInternalError.why', { msg: (e as Error).message }), t('guardStrictInternalError.next'))
    }
    // fail-open: 门禁内部故障不阻断工具管道(与插件 apply 的降级一致)
    process.stderr.write(`${makeT('en')('cli.checkInternalError', { msg: (e as Error).message })}\n`)
    return 0
  }
}
