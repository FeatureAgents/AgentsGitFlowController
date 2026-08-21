import { describe, expect, it } from 'vitest'
import { detectPlatform, encodeDeny, extractHookPayload } from '../src/platform'

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

  it('auto: antigravity toolCall envelope', () => {
    const raw = JSON.stringify({ toolCall: { name: 'run_command', args: { CommandLine: 'git push origin develop' } } })
    expect(extractHookPayload(raw, 'auto')?.command).toBe('git push origin develop')
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
})

describe('platform: detectPlatform', () => {
  it('turn_id → codex', () => expect(detectPlatform('{"turn_id":"x"}')).toBe('codex'))
  it('toolCall → antigravity', () => expect(detectPlatform('{"toolCall":{}}')).toBe('antigravity'))
  it('tool_args → opencode', () => expect(detectPlatform('{"tool_args":{"command":"git push"}}')).toBe('opencode'))
  it('默认 → claude', () => expect(detectPlatform('{"tool_name":"Bash"}')).toBe('claude'))
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
  it('antigravity → exit 0 + stdout decision block', () => {
    const enc = encodeDeny('antigravity', 'r')
    expect(enc.exitCode).toBe(0)
    expect(enc.stdout).toContain('"decision":"block"')
  })
})
