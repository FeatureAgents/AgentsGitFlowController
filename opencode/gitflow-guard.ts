// OpenCode 插件(随包发布; `wire --client opencode` 会复制本文件到 .opencode/plugins/ 并注入路径):
// 在 tool.execute.before 事件拦截 bash/powershell 工具, 经守卫 CLI 门禁(check --platform opencode),
// 拒绝(exit 2)或超时时抛错阻断工具执行; 其他故障 fail-open 放行, 不破坏工具管道。
//
// 背景: OpenCode 1.18+ 已移除 hooks.yaml 机制(实机测试零调用, 见 docs/e2e/TestResult/opencode.md),
// 官方扩展点为 plugins 目录 + 事件订阅, 阻断语义 = handler 抛错(官方 env-protection 示例同款)。
// 插件导出必须是**函数**(工厂), 返回事件处理器对象 —— 直接导出对象会报 "Plugin export is not a function"。
// 协议参考: .agents/hooks/references/opencode.md。
//
// 用法: 项目内执行 `gitflow-guard wire --client opencode --project --yes`, wire 会把本文件
// 复制到 <project>/.opencode/plugins/gitflow-guard.ts(全局落位到 ~/.config/opencode/plugins/) 并注入安装路径;
// 也可手工复制。零外部依赖: 不 import @opencode-ai/plugin, 客户端原生加载本文件即可。

import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 插件自身所在目录: 项目级 = <项目>/.opencode/plugins, 全局 = ~/.config/opencode/plugins */
const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))

// 由 `wire --client opencode` 在落位时注入的随包 runner 与 node 解释器绝对路径(源码与 dogfood 维持空串)
const WIRED_RUNNER_PATH = ''
const WIRED_NODE_PATH = ''

const DEFAULT_TIMEOUT_MS = 45_000

export interface GuardTarget {
  bin: string
  args: string[]
  shell: boolean
}

export interface ResolveGuardTargetOptions {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  exists?: (path: string) => boolean
  wiredRunnerPath?: string
  wiredNodePath?: string
  pluginDir?: string
}

export interface OpenCodePluginContext {
  directory?: string
  worktree?: string
}

export interface OpenCodePluginOptions {
  timeoutMs?: number
}

function isScriptPath(p: string): boolean {
  return /\.(?:mjs|js|cjs)$/i.test(p)
}

function isExistingDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** 定位守卫 CLI(按可用性取第一个):
 *  1. process.env.GITFLOW_GUARD_BIN 显式指定(脚本走 nodeBin, win32 .cmd/.bat 或裸命令走 shell:true);
 *  2. wire 注入的 WIRED_RUNNER_PATH(存在即用 nodeBin);
 *  3. 插件上两级(项目根)的 bin/gitflow-guard.mjs;
 *  4. $OPENCODE_PROJECT_DIR/bin/gitflow-guard.mjs;
 *  5. PATH 兜底(Unix: gitflow-guard, Windows: gitflow-guard.cmd + shell:true; 绝不拼接 node gitflow-guard)。 */
export function resolveGuardTarget(opts: ResolveGuardTargetOptions = {}): GuardTarget {
  const platform = opts.platform ?? process.platform
  const env = opts.env ?? process.env
  const exists = opts.exists ?? existsSync
  const wiredRunner = opts.wiredRunnerPath ?? WIRED_RUNNER_PATH
  const wiredNode = opts.wiredNodePath ?? WIRED_NODE_PATH
  const pluginDir = opts.pluginDir ?? PLUGIN_DIR

  const nodeBin = wiredNode && exists(wiredNode) ? wiredNode : 'node'

  const envBin = env.GITFLOW_GUARD_BIN?.trim()
  if (envBin) {
    if (isScriptPath(envBin)) return { bin: nodeBin, args: [envBin], shell: false }
    const ext = extname(envBin).toLowerCase()
    const shell = platform === 'win32' && (ext === '.cmd' || ext === '.bat' || ext === '')
    return { bin: envBin, args: [], shell }
  }

  if (wiredRunner && exists(wiredRunner)) {
    return { bin: nodeBin, args: [wiredRunner], shell: false }
  }

  const projectRoot = resolve(dirname(dirname(pluginDir)))
  const local = join(projectRoot, 'bin', 'gitflow-guard.mjs')
  if (exists(local)) return { bin: nodeBin, args: [local], shell: false }

  const envProject = env.OPENCODE_PROJECT_DIR
  if (envProject) {
    const viaEnv = join(envProject, 'bin', 'gitflow-guard.mjs')
    if (exists(viaEnv)) return { bin: nodeBin, args: [viaEnv], shell: false }
  }

  return platform === 'win32'
    ? { bin: 'gitflow-guard.cmd', args: [], shell: true }
    : { bin: 'gitflow-guard', args: [], shell: false }
}

/** 运行守卫 check(命令经 stdin JSON 透传, argv 仅静态常量): exit 2 或超时 = 阻断, 其余 fail-open */
async function runGuard(command: string, cwd: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const target = resolveGuardTarget()
  const args = [...target.args, 'check', '--platform', 'opencode']
  const payload = JSON.stringify({ tool_args: { command }, cwd })
  let stderr = ''
  // 对象属性承载 spawn/超时状态: TS 对回调内赋值的局部变量不做跨闭包窄化(会推断为 never)
  const outcome: { spawnError?: Error; timedOut?: boolean } = {}
  const code = await new Promise<number>((resolvePromise) => {
    const child = spawn(target.bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: target.shell })
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      outcome.timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        // 忽略 kill 失败
      }
      resolvePromise(-1)
    }, timeoutMs)
    child.stdin?.on('error', () => {})
    child.stdin?.end(payload)
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
    child.on('error', (e) => {
      // spawn 失败等内部故障: fail-open, 不阻断工具管道; 告警统一在尾部输出(避免双打)
      if (settled) return
      settled = true
      clearTimeout(timer)
      outcome.spawnError = e
      resolvePromise(-1)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise(code ?? -1)
    })
  })
  if (outcome.timedOut) {
    throw new Error('gitflow-guard timed out — blocking by default; retry once the repository is responsive')
  }
  if (code === 2) throw new Error(stderr.trim() || `[gitflow-guard] blocked: ${command}`)
  if (code !== 0) {
    const spawnMsg = outcome.spawnError?.message
    if (spawnMsg) console.error(`[gitflow-guard] cannot spawn guard: ${spawnMsg} — allowing tool call (fail-open)`)
    else console.error(`[gitflow-guard] check exited ${code} — allowing tool call (fail-open): ${stderr.trim()}`)
  }
}

/** OpenCode 插件工厂(官方要求导出函数): 订阅 tool.execute.before, 仅拦 bash/powershell */
export default async function gitflowGuardPlugin(ctx?: OpenCodePluginContext, opts?: OpenCodePluginOptions) {
  const baseCwd =
    (typeof ctx?.directory === 'string' && ctx.directory.trim() !== '' ? ctx.directory : undefined) ||
    (typeof ctx?.worktree === 'string' && ctx.worktree.trim() !== '' ? ctx.worktree : undefined) ||
    process.cwd()
  return {
    'tool.execute.before': async (input: { tool?: string; args?: Record<string, unknown> }, output: { args?: Record<string, unknown> }) => {
      // 只拦截命令执行面(bash/powershell); 其余工具(read/edit 等)不经过守卫
      if (input.tool !== 'bash' && input.tool !== 'powershell') return
      const command = typeof output?.args?.command === 'string' ? output.args.command : ''
      if (!command) return
      const rawToolDir = [output?.args?.workdir, output?.args?.cwd].find(
        (v): v is string => typeof v === 'string' && v.trim() !== '',
      )
      const candidateDir = rawToolDir ? resolve(baseCwd, rawToolDir) : baseCwd
      // 不存在或非目录的 workdir/cwd 会触发 spawn ENOENT/ENOTDIR 导致 fail-open 绕过: 回退到有效目录 baseCwd 或 process.cwd()
      const effectiveCwd = isExistingDir(candidateDir) ? candidateDir : isExistingDir(baseCwd) ? baseCwd : process.cwd()
      await runGuard(command, effectiveCwd, opts?.timeoutMs)
    },
  }
}
