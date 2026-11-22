import { describe, expect, it } from 'vitest'
import { detectPlatform, encodeDeny, extractHookPayload, HOOK_PLATFORMS, isHookPlatform } from '../src/platform'
import type { HookPlatform } from '../src/platform'

describe('platform: extractHookPayload', () => {
  it('claude PreToolUse → command/cwd/toolUseId/event=pre', () => {
    const raw = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push origin develop' }, cwd: '/repo', tool_use_id: 'toolu_1' })
    expect(extractHookPayload(raw, 'claude')).toEqual({ command: 'git push origin develop', cwd: '/repo', toolUseId: 'toolu_1', event: 'pre' })
  })

  it('claude PostToolUse → event=post', () => {
    const raw = JSON.stringify({ hook_event_name: 'PostToolUse', tool_input: { command: 'git merge feature/x' }, tool_use_id: 'toolu_1' })
    expect(extractHookPayload(raw, 'claude')?.event).toBe('post')
  })

  it('claude PostToolUseFailure → event=post-failure', () => {
    const raw = JSON.stringify({ hook_event_name: 'PostToolUseFailure', tool_input: { command: 'git merge feature/x' } })
    expect(extractHookPayload(raw, 'claude')?.event).toBe('post-failure')
  })

  it('非法 JSON → null', () => {
    expect(extractHookPayload('not json', 'claude')).toBeNull()
  })

  it('缺 command → null', () => {
    expect(extractHookPayload(JSON.stringify({ tool_name: 'Bash' }), 'claude')).toBeNull()
  })

  it('auto: codex 同形(turn_id)也能提 command', () => {
    const raw = JSON.stringify({ turn_id: 't1', tool_input: { command: 'git merge feature/x' }, cwd: '/r' })
    expect(extractHookPayload(raw, 'auto')?.command).toBe('git merge feature/x')
  })

  it('auto: antigravity toolCall envelope(含嵌套 Cwd)', () => {
    const raw = JSON.stringify({ toolCall: { name: 'run_command', args: { CommandLine: 'git push origin develop', Cwd: '/repo' } } })
    expect(extractHookPayload(raw, 'auto')?.command).toBe('git push origin develop')
    expect(extractHookPayload(raw, 'auto')?.cwd).toBe('/repo')
  })

  it('auto: opencode tool_args.command', () => {
    const raw = JSON.stringify({ session_id: 's1', event: 'tool.before.bash', tool_name: 'bash', tool_args: { command: 'git merge feature/x' }, cwd: '/r' })
    expect(extractHookPayload(raw, 'auto')?.command).toBe('git merge feature/x')
    expect(extractHookPayload(raw, 'auto')?.cwd).toBe('/r')
    expect(extractHookPayload(raw, 'auto')?.event).toBe('pre')
  })

  it('opencode 显式平台: tool_args.cmd 兜底', () => {
    const raw = JSON.stringify({ tool_args: { cmd: 'git push origin develop' }, cwd: '/r' })
    expect(extractHookPayload(raw, 'opencode')?.command).toBe('git push origin develop')
  })

  it('codex 显式平台: tool_input.command + turn_id payload(第 8 节显式分支用例)', () => {
    const raw = JSON.stringify({ hook_event_name: 'PreToolUse', turn_id: 't1', tool_input: { command: 'git push origin develop' }, cwd: '/r', tool_use_id: 'c1' })
    expect(extractHookPayload(raw, 'codex')).toEqual({ command: 'git push origin develop', cwd: '/r', toolUseId: 'c1', event: 'pre' })
  })

  it('antigravity 显式平台: toolCall.args.CommandLine envelope(第 8 节显式分支用例)', () => {
    const raw = JSON.stringify({ hook_event_name: 'PreToolUse', toolCall: { name: 'run_command', args: { CommandLine: 'git merge feature/x' } }, cwd: '/r' })
    expect(extractHookPayload(raw, 'antigravity')).toEqual({ command: 'git merge feature/x', cwd: undefined, toolUseId: undefined, event: 'pre' })
  })

  it('antigravity 显式平台: cwd 取 toolCall.args.Cwd(嵌套大写 C, 顶层无 cwd —— AGY-D3 真机核验)', () => {
    const raw = JSON.stringify({
      artifactDirectoryPath: '/tmp/brain/1',
      conversationId: 'c1',
      stepIdx: 2,
      toolCall: { name: 'run_command', args: { CommandLine: 'git push origin master', Cwd: '/tmp/e2e-antigravity-repo', WaitMsBeforeAsync: 10000 } },
      workspacePaths: ['/tmp/e2e-antigravity-repo'],
    })
    expect(extractHookPayload(raw, 'antigravity')).toEqual({ command: 'git push origin master', cwd: '/tmp/e2e-antigravity-repo', toolUseId: undefined, event: 'pre' })
  })

  it('cursor 显式平台: beforeShellExecution command + cwd', () => {
    const raw = JSON.stringify({ hook_event_name: 'beforeShellExecution', command: 'git push origin develop', cwd: '/repo', cursor_version: '0.45.0' })
    expect(extractHookPayload(raw, 'cursor')).toEqual({ command: 'git push origin develop', cwd: '/repo', toolUseId: undefined, event: 'pre' })
  })

  it('cursor 显式平台: workspace_roots 提取 cwd', () => {
    const raw = JSON.stringify({ hook_event_name: 'preToolUse', tool_name: 'Bash', tool_input: { command: 'git push origin develop' }, workspace_roots: ['/workspace/root'] })
    expect(extractHookPayload(raw, 'cursor')).toEqual({ command: 'git push origin develop', cwd: '/workspace/root', toolUseId: undefined, event: 'pre' })
  })
})

describe('platform: detectPlatform', () => {
  it('turn_id → codex', () => expect(detectPlatform('{"turn_id":"x"}')).toBe('codex'))
  it('toolCall → antigravity', () => expect(detectPlatform('{"toolCall":{}}')).toBe('antigravity'))
  it('tool_args → opencode', () => expect(detectPlatform('{"tool_args":{"command":"git push"}}')).toBe('opencode'))
  it('cursor_version → cursor', () => expect(detectPlatform('{"cursor_version":"0.45.0"}')).toBe('cursor'))
  it('workspace_roots → cursor', () => expect(detectPlatform('{"workspace_roots":["/repo"]}')).toBe('cursor'))
  it('仅带 conversation_id → cursor(无 cursor_version 的实机 payload 也不误判为 claude)', () =>
    expect(detectPlatform('{"conversation_id":"c1"}')).toBe('cursor'))
  it('仅带 generation_id → cursor', () => expect(detectPlatform('{"generation_id":"g1"}')).toBe('cursor'))
  it('beforeShellExecution 无 cursor_version 也识别为 cursor', () =>
    expect(detectPlatform('{"hook_event_name":"beforeShellExecution","command":"git push origin develop"}')).toBe('cursor'))
  it('顶层 command + cwd (无 tool_input) 识别为 cursor', () =>
    expect(detectPlatform('{"command":"git push origin develop","cwd":"/repo"}')).toBe('cursor'))
  it('默认 → claude', () => expect(detectPlatform('{"tool_name":"Bash","tool_input":{"command":"git push"}}')).toBe('claude'))
  it('空 payload(CLI --command 模式 raw="")→ 回退 claude, deny 走 exit 2 协议(P2-5)', () => {
    expect(detectPlatform('')).toBe('claude')
    const enc = encodeDeny(detectPlatform(''), 'blocked: x')
    expect(enc.exitCode).toBe(2)
    expect(enc.stderr).toBe('blocked: x')
  })
})

describe('platform: encodeDeny', () => {
  it('claude → exit 2 + stderr', () => {
    expect(encodeDeny('claude', '已拦截: x')).toEqual({ exitCode: 2, stderr: '已拦截: x' })
  })
  it('opencode → exit 2 + stderr', () => {
    expect(encodeDeny('opencode', 'blocked: x')).toEqual({ exitCode: 2, stderr: 'blocked: x' })
  })
  it('codex → exit 0 + stdout permissionDecision', () => {
    const enc = encodeDeny('codex', 'r')
    expect(enc.exitCode).toBe(0)
    expect(enc.stdout).toContain('"permissionDecision":"deny"')
  })
  it('antigravity → exit 0 + stdout decision deny', () => {
    const enc = encodeDeny('antigravity', 'r')
    expect(enc.exitCode).toBe(0)
    expect(enc.stdout).toContain('"decision":"deny"')
  })
  it('cursor → exit 0 + stdout permission deny', () => {
    const enc = encodeDeny('cursor', 'blocked: x')
    expect(enc.exitCode).toBe(0)
    expect(enc.stdout).toBe(JSON.stringify({ permission: 'deny', user_message: 'blocked: x', agent_message: 'blocked: x' }))
    expect(enc.stderr).toBe('blocked: x')
  })
  it('未知平台 → 安全默认硬拦截(exit 2 + stderr)', () => {
    expect(encodeDeny('codebuddy' as HookPlatform, 'blocked')).toEqual({ exitCode: 2, stderr: 'blocked' })
  })
})

describe('platform: isHookPlatform 与显式非法平台防护', () => {
  it('isHookPlatform: 5 个支持平台返回 true, 未知平台返回 false', () => {
    for (const p of HOOK_PLATFORMS) {
      expect(isHookPlatform(p)).toBe(true)
    }
    expect(HOOK_PLATFORMS).toEqual(['claude', 'codex', 'antigravity', 'opencode', 'cursor'])
    expect(isHookPlatform('codebuddy')).toBe(false)
    expect(isHookPlatform('zcode')).toBe(false)
    expect(isHookPlatform('unknown')).toBe(false)
  })

  it('extractHookPayload: 显式传入非法平台时抛错(不静默返回 null)', () => {
    const raw = JSON.stringify({ tool_input: { command: 'git push origin develop' } })
    expect(() => extractHookPayload(raw, 'codebuddy' as HookPlatform)).toThrow(/unknown platform/i)
  })
})
