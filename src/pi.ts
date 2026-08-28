// Pi 扩展适配层: 进程内拦截(与 DSH 同为 stdin-hook 例外, 见 AGENTS.md §8):
// Pi 没有 stdin payload / exit code 协议 —— 拦截经项目扩展(.pi/settings.json → extensions)监听
// tool_call 事件, 以返回值 { block: true, reason } 表达拒绝。
// 协议依据: earendil-works/pi-mono 官方扩展文档(pi.dev/docs/extensions), 记载见 .agents/hooks/references/pi.md。
// 本模块不依赖 Pi SDK: 仅以最小结构化类型描述 API 面(与官方 ExtensionAPI 对齐, 类型级即可),
// 运行时由 Pi 的 jiti 注入实例, 不 import 任何 Pi 包。

import { execFile } from 'node:child_process'

/** Pi 官方 tool_call 事件(只读提取, 与官方 ExtensionAPI 的 ToolCallEvent 对齐) */
export interface PiToolCallEvent {
  toolName: string
  input?: { command?: unknown }
}

/** Pi 扩展上下文最小面(官方 ExtensionContext 的 cwd/hasUI 子集) */
export interface PiExtensionContext {
  cwd: string
  hasUI?: boolean
}

/** tool_call 拦截返回值: { block: true, reason } 即拒绝(官方 tool_call 协议) */
export interface PiBlock {
  block: true
  reason: string
}

export type PiToolCallResult = PiBlock | undefined

export type PiToolCallHandler = (event: PiToolCallEvent, ctx: PiExtensionContext) => Promise<PiToolCallResult> | PiToolCallResult

export interface PiExtensionAPI {
  on(event: 'tool_call', handler: PiToolCallHandler): void
}

/** 命令执行结果(适配器与守卫 CLI 的进程间契约: 借用 claude 编码 exit 2 + stderr) */
export interface PiRunResult {
  code: number
  stdout: string
  stderr: string
}

export interface PiExtensionOptions {
  /** 拦截哪些工具的命令文本(默认 bash / powershell, 与 DSH 插件 toolNames 同口径) */
  toolNames?: string[]
  /** 守卫 CLI 可执行(默认 GITFLOW_GUARD_BIN 环境变量 → gitflow-guard); 可为 [node, path] 形式 */
  bin?: string | string[]
  /** 命令执行器(测试注入; 默认真实 execFile) */
  run?: (argv: string[], cwd: string) => Promise<PiRunResult>
}

// 快路径: 无 git 系关键词不 spawn; 权威判定仍在守卫内核(CLI check 的 classify 快路径)
const GITISH = /\b(?:git|gh|glab)\b|gitflow-guard/

function execFileResult(cmd: string, args: string[], cwd: string): Promise<PiRunResult> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd }, (err, stdout, stderr) => {
      const e = err as NodeJS.ErrnoException | null
      // 非零退出码为数字; spawn 失败(如 ENOENT)是字符串, 归为 -1
      const code = e && typeof e.code === 'number' ? e.code : e ? -1 : 0
      resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
  })
}

/**
 * 创建 Pi 扩展入口: 返回函数形态与官方扩展默认导出一致(default export (pi) => void)。
 * 监听 tool_call → 提取 bash/powershell 的 command → 守卫 CLI 门禁 → deny 映射为 { block, reason }。
 */
export function createPiExtension(opts: PiExtensionOptions = {}): (pi: PiExtensionAPI) => void {
  const toolNames = new Set(opts.toolNames ?? ['bash', 'powershell'])
  const bin = opts.bin ?? process.env.GITFLOW_GUARD_BIN ?? 'gitflow-guard'
  const run = opts.run ?? ((argv, cwd) => execFileResult(Array.isArray(bin) ? bin[0] : bin, [...(Array.isArray(bin) ? bin.slice(1) : []), ...argv], cwd))

  return (pi: PiExtensionAPI): void => {
    pi.on('tool_call', async (event, ctx) => {
      try {
        if (!toolNames.has(event.toolName)) return undefined
        const command = typeof event.input?.command === 'string' ? event.input.command : ''
        if (!command || !GITISH.test(command)) return undefined
        const res = await run(['check', '--platform', 'claude', '--command', command], ctx.cwd)
        // 守卫 CLI 经 claude 编码回答: exit 2 = 拒绝, stderr 即原因与下一步。
        // --platform claude 仅是守卫内部进程间契约的 deny 编码选择, 不是 Pi 的协议。
        if (res.code === 2) {
          const reason = res.stderr.trim() || 'blocked by gitflow-guard'
          return { block: true, reason }
        }
        return undefined
      } catch {
        // 门禁内部故障降级放行(fail-open), 不阻断工具管道; 与 DSH apply() 及 CLI check 一致
        return undefined
      }
    })
  }
}

export default createPiExtension
