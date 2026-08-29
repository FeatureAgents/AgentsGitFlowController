// OpenCode 插件(随包发布; `wire --client opencode` 会复制本文件到 .opencode/plugins/):
// 在 tool.execute.before 事件拦截 bash/powershell 工具, 经守卫 CLI 门禁(check --platform opencode),
// 拒绝(exit 2)时抛错阻断工具执行; 守卫不可用时 fail-open 放行, 不破坏工具管道。
//
// 背景: OpenCode 1.18+ 已移除 hooks.yaml 机制(实机测试零调用, 见 docs/e2e/TestResult/opencode.md),
// 官方扩展点为 plugins 目录 + 事件订阅, 阻断语义 = handler 抛错(官方 env-protection 示例同款)。
// 插件导出必须是**函数**(工厂), 返回事件处理器对象 —— 直接导出对象会报 "Plugin export is not a function"。
// 协议参考: .agents/hooks/references/opencode.md。
//
// 用法: 项目内执行 `gitflow-guard wire --client opencode --project --yes`, wire 会把本文件
// 复制到 <project>/.opencode/plugins/gitflow-guard.ts(全局落位到 ~/.config/opencode/plugins/);
// 也可手工复制。零外部依赖: 不 import @opencode-ai/plugin, 客户端原生加载本文件即可。

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 插件自身所在目录: 项目级 = <项目>/.opencode/plugins, 全局 = ~/.config/opencode/plugins */
const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))

interface GuardTarget {
  bin: string
  args: string[]
}

/** 组装 spawn 目标: opencode 插件在 opencode 进程内执行, process.execPath 是 opencode 自身而非 node,
 *  不能拿它当解释器 —— Unix 直跑脚本(#!/usr/bin/env node shebang), Windows 用 PATH 上的 node。 */
function makeTarget(bin: string): GuardTarget {
  return process.platform === 'win32' ? { bin: 'node', args: [bin] } : { bin, args: [] }
}

/** 定位守卫 CLI(按可用性取第一个):
 *  1. 插件上两级(项目根)的 bin/gitflow-guard.mjs —— 项目级落位时插件在 <项目>/.opencode/plugins/;
 *  2. $OPENCODE_PROJECT_DIR/bin/gitflow-guard.mjs —— 客户端展开的项目目录兜底;
 *  3. GITFLOW_GUARD_BIN 显式指定;
 *  4. PATH 上的 gitflow-guard —— 全局安装场景。 */
function guardTarget(): GuardTarget | null {
  const projectRoot = resolve(dirname(dirname(PLUGIN_DIR)))
  const local = join(projectRoot, 'bin', 'gitflow-guard.mjs')
  if (existsSync(local)) return makeTarget(local)
  const envProject = process.env.OPENCODE_PROJECT_DIR
  if (envProject) {
    const viaEnv = join(envProject, 'bin', 'gitflow-guard.mjs')
    if (existsSync(viaEnv)) return makeTarget(viaEnv)
  }
  if (process.env.GITFLOW_GUARD_BIN) return makeTarget(process.env.GITFLOW_GUARD_BIN)
  return makeTarget('gitflow-guard')
}

/** 运行守卫 check; exit 2 = 拒绝(抛错阻断工具), 其余一律放行(fail-open) */
async function runGuard(command: string): Promise<void> {
  const target = guardTarget()
  if (!target) {
    console.error('[gitflow-guard] guard CLI not found — allowing tool call (fail-open)')
    return
  }
  const args = [...target.args, 'check', '--platform', 'opencode', '--command', command]
  let stderr = ''
  const code = await new Promise<number>((resolvePromise) => {
    const child = spawn(target.bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let settled = false
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    child.on('error', (e) => {
      // spawn 失败等内部故障: fail-open, 不阻断工具管道
      if (settled) return
      settled = true
      console.error(`[gitflow-guard] cannot spawn guard: ${e.message} — allowing tool call (fail-open)`)
      resolvePromise(-1)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      resolvePromise(code ?? -1)
    })
  })
  if (code === 2) throw new Error(stderr.trim() || `[gitflow-guard] blocked: ${command}`)
  if (code !== 0) console.error(`[gitflow-guard] check exited ${code} — allowing tool call (fail-open): ${stderr.trim()}`)
}

/** OpenCode 插件工厂(官方要求导出函数): 订阅 tool.execute.before, 仅拦 bash/powershell */
export default async function gitflowGuardPlugin() {
  return {
    'tool.execute.before': async (input: { tool?: string; args?: Record<string, unknown> }, output: { args?: Record<string, unknown> }) => {
      // 只拦截命令执行面(bash/powershell); 其余工具(read/edit 等)不经过守卫
      if (input.tool !== 'bash' && input.tool !== 'powershell') return
      const command = typeof output.args?.command === 'string' ? output.args.command : ''
      if (!command) return
      await runGuard(command)
    },
  }
}