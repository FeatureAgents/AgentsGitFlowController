// 跨平台 hook 适配层: 解析各家工具 stdin payload → 统一 {command, cwd, event}; 按平台编码 deny
// 只以各平台官方 hook 文档为准, 自行实现; 拿不准的 wire 格式在真机核验后定稿。

export type HookPlatform = 'claude' | 'codex' | 'copilot' | 'antigravity' | 'opencode'

export type HookEvent = 'pre' | 'post' | 'post-failure'

export interface HookPayload {
  command: string
  cwd?: string
  toolUseId?: string
  event: HookEvent
}

export interface DenyEncoding {
  exitCode: number
  stdout?: string
  stderr?: string
}

/** 各平台官方 stdin payload 的关键字段(只读提取, 不做运行时类型校验) */
interface RawPayload {
  hook_event_name?: unknown
  tool_input?: { command?: unknown }
  tool_args?: { command?: unknown; cmd?: unknown }
  cwd?: unknown
  tool_use_id?: unknown
  turn_id?: unknown
  toolCall?: { args?: { CommandLine?: unknown } }
  toolArgs?: { command?: unknown }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function eventFrom(hookEventName: unknown): HookEvent {
  if (hookEventName === 'PostToolUse') return 'post'
  if (hookEventName === 'PostToolUseFailure') return 'post-failure'
  return 'pre'
}

function parseRaw(raw: string): RawPayload | null {
  if (!raw) return null
  try {
    const j = JSON.parse(raw) as unknown
    if (typeof j !== 'object' || j === null) return null
    return j as RawPayload
  } catch {
    return null
  }
}

/** 从 stdin JSON 提取 command/cwd/event; 无法识别返回 null(放行) */
export function extractHookPayload(raw: string, platform: HookPlatform | 'auto' = 'auto'): HookPayload | null {
  const j = parseRaw(raw)
  if (!j) return null
  const plat = platform === 'auto' ? detectPlatform(raw) : platform

  let command = ''
  let cwd = ''
  if (plat === 'claude' || plat === 'codex') {
    // Claude Code 与 Codex 同形: tool_input.command + cwd
    command = str(j.tool_input?.command)
    cwd = str(j.cwd)
  } else if (plat === 'opencode') {
    // OpenCode tool.before.* : tool_args.command(或 cmd)+ cwd
    command = str(j.tool_args?.command) || str(j.tool_args?.cmd)
    cwd = str(j.cwd)
  } else if (plat === 'copilot') {
    // Claude 兼容 snake_case 与 camelCase toolArgs 兜底(真机核验后定稿)
    command = str(j.tool_input?.command) || str(j.toolArgs?.command)
    cwd = str(j.cwd)
  } else if (plat === 'antigravity') {
    // agy 嵌套 envelope: toolCall.args.CommandLine
    command = str(j.toolCall?.args?.CommandLine)
    cwd = str(j.cwd)
  }
  if (!command) return null
  return { command, cwd: cwd || undefined, toolUseId: str(j.tool_use_id) || undefined, event: eventFrom(j.hook_event_name) }
}

/** 按 payload 判别平台: 非空 turn_id→codex, toolCall→antigravity, tool_args→opencode, 其余→claude */
export function detectPlatform(raw: string): HookPlatform {
  const j = parseRaw(raw)
  if (!j) return 'claude'
  if (j.turn_id) return 'codex'
  if (j.toolCall) return 'antigravity'
  if (j.tool_args) return 'opencode'
  return 'claude'
}

/** deny 编码: 各平台的拦截协议(exit 码 + stdout/stderr) */
export function encodeDeny(platform: HookPlatform, reason: string): DenyEncoding {
  switch (platform) {
    case 'claude':
      // exit 2 = 硬拦截; stderr 即展示给模型的原因
      return { exitCode: 2, stderr: reason }
    case 'opencode':
      // OpenCode tool.before.bash: bash action exit 2 阻断工具; stderr 展示原因
      return { exitCode: 2, stderr: reason }
    case 'codex':
      // exit 0 + stdout permissionDecision(Codex 拒绝未知字段, 只输出规定的三个)
      return {
        exitCode: 0,
        stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }),
        stderr: reason,
      }
    case 'antigravity':
      // 非零退出码不保证拦截, 必须 exit 0 + stdout {"decision":"block","reason":...}
      return { exitCode: 0, stdout: JSON.stringify({ decision: 'block', reason }) }
    case 'copilot':
      // 待真机核验; 先按 claude 的 exit 2 协议兜底
      return { exitCode: 2, stderr: reason }
  }
}
