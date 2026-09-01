// 跨平台 hook 适配层: 解析各家工具 stdin payload → 统一 {command, cwd, event}; 按平台编码 deny
// 只以各平台官方 hook 文档为准, 自行实现; 拿不准的 wire 格式在真机核验后定稿。
// 范围注记(AGENTS.md §8.1 例外): HookPlatform 仅覆盖 stdin-hook 类平台(claude/codex/antigravity/opencode/codebuddy/zcode/cursor)。
// DSH 与 Pi 是进程内接入, 不在本层:
// - DSH 挂载经 patch.yml + dsh.bundle.patch, 拦截经 src/index.ts 的 apply() 监听 tools/pre-execute、
//   以返回值 {kind:'deny',reason} 表达, 协议记载见 .agents/hooks/references/dsh.md;
// - Pi 经项目扩展监听 tool_call、以返回值 {block:true, reason} 表达, 适配层在 src/pi.ts
//   (createPiExtension), 协议记载见 .agents/hooks/references/pi.md。

export type HookPlatform = 'claude' | 'codex' | 'antigravity' | 'opencode' | 'codebuddy' | 'zcode' | 'cursor'

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
  command?: unknown
  cwd?: unknown
  tool_use_id?: unknown
  turn_id?: unknown
  cursor_version?: unknown
  workspace_roots?: unknown
  // agy 1.1.22 实机 payload 核验(TestResult/antigravity.md AGY-D3): cwd 在 toolCall.args.Cwd(嵌套大写 C), 不在顶层
  toolCall?: { args?: { CommandLine?: unknown; Cwd?: unknown } }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function eventFrom(hookEventName: unknown): HookEvent {
  if (hookEventName === 'PostToolUse' || hookEventName === 'afterShellExecution') return 'post'
  if (hookEventName === 'PostToolUseFailure') return 'post-failure'
  return 'pre'
}

function parseRaw(raw: string): RawPayload | null {
  if (!raw) return null
  try {
    const cleaned = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
    const j = JSON.parse(cleaned) as unknown
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
  if (plat === 'claude' || plat === 'codex' || plat === 'codebuddy' || plat === 'zcode') {
    // Claude Code / Codex / CodeBuddy / ZCode 同形: tool_input.command + cwd
    command = str(j.tool_input?.command)
    cwd = str(j.cwd)
  } else if (plat === 'cursor') {
    // Cursor beforeShellExecution (command + cwd) 或 preToolUse (tool_input.command + workspace_roots)
    command = str(j.command) || str(j.tool_input?.command)
    cwd = str(j.cwd) || (Array.isArray(j.workspace_roots) && typeof j.workspace_roots[0] === 'string' ? j.workspace_roots[0] : '')
  } else if (plat === 'opencode') {
    // OpenCode tool.before.* : tool_args.command(或 cmd)+ cwd
    command = str(j.tool_args?.command) || str(j.tool_args?.cmd)
    cwd = str(j.cwd)
  } else if (plat === 'antigravity') {
    // agy 嵌套 envelope: toolCall.args.CommandLine; cwd 同为嵌套大写 C(顶层无 cwd 字段)
    command = str(j.toolCall?.args?.CommandLine)
    cwd = str(j.toolCall?.args?.Cwd)
  }
  if (!command) return null
  return { command, cwd: cwd || undefined, toolUseId: str(j.tool_use_id) || undefined, event: eventFrom(j.hook_event_name) }
}

/** 按 payload 判别平台: 非空 turn_id→codex, toolCall→antigravity, tool_args→opencode, cursor_version/workspace_roots→cursor, 其余→claude */
export function detectPlatform(raw: string): HookPlatform {
  const j = parseRaw(raw)
  if (!j) return 'claude'
  if (j.turn_id) return 'codex'
  if (j.toolCall) return 'antigravity'
  if (j.tool_args) return 'opencode'
  if (j.cursor_version || j.workspace_roots) return 'cursor'
  return 'claude'
}

/** deny 编码: 各平台的拦截协议(exit 码 + stdout/stderr) */
export function encodeDeny(platform: HookPlatform, reason: string): DenyEncoding {
  switch (platform) {
    case 'claude':
    case 'codebuddy':
    case 'zcode':
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
      // 官方(antigravity.google/docs/ide/hooks): 必须 exit 0; stdout 顶层 { decision: allow|deny|ask|force_ask, reason }
      // 包裹 hookSpecificOutput 或非零退出都会校验失败; decision 无 "block" 值
      return { exitCode: 0, stdout: JSON.stringify({ decision: 'deny', reason }) }
    case 'cursor':
      // 官方(cursor.com/docs/reference/hooks): exit 0 + stdout JSON { permission: 'deny', user_message, agent_message }
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          permission: 'deny',
          user_message: reason,
          agent_message: reason,
        }),
        stderr: reason,
      }
  }
}

