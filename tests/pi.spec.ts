import { describe, expect, it } from 'vitest'
import { createPiExtension } from '../src/pi'
import type { PiExtensionAPI, PiExtensionOptions, PiRunResult, PiToolCallHandler } from '../src/pi'

/** 挂载扩展并取回注册的 tool_call handler; run 注入为 spy */
function mount(opts: PiExtensionOptions & { run: (argv: string[], cwd: string) => Promise<PiRunResult> }): {
  handler: PiToolCallHandler
  calls: { argv: string[]; cwd: string }[]
} {
  let handler: PiToolCallHandler | undefined
  const api: PiExtensionAPI = { on: (_event, h) => (handler = h) }
  const calls: { argv: string[]; cwd: string }[] = []
  const run = async (argv: string[], cwd: string) => {
    calls.push({ argv, cwd })
    return opts.run(argv, cwd)
  }
  createPiExtension({ ...opts, run })(api)
  if (!handler) throw new Error('handler not registered')
  return { handler, calls }
}

const evt = (toolName: string, command?: string) => ({ toolName, input: command == null ? undefined : { command } })
const ctx = (cwd = '/repo') => ({ cwd })
const ok = (): Promise<PiRunResult> => Promise.resolve({ code: 0, stdout: '', stderr: '' })

describe('pi: createPiExtension', () => {
  it('注册 tool_call 监听(默认拦截 bash/powershell)', () => {
    const m = mount({ run: ok })
    expect(typeof m.handler).toBe('function')
  })

  it('非 bash/powershell 工具直接放行, 不触发守卫', async () => {
    const m = mount({ run: ok })
    for (const toolName of ['read', 'write', 'grep', 'edit']) {
      expect(await m.handler(evt(toolName, 'git push origin develop'), ctx())).toBeUndefined()
    }
    expect(m.calls).toHaveLength(0)
  })

  it('快路径: 无 git 系关键词不 spawn', async () => {
    const m = mount({ run: ok })
    expect(await m.handler(evt('bash', 'npm test'), ctx())).toBeUndefined()
    expect(await m.handler(evt('powershell', 'echo hi'), ctx())).toBeUndefined()
    expect(m.calls).toHaveLength(0)
  })

  it('快路径命中 git 系关键词(git/gh/glab/gitflow-guard)才进入守卫', async () => {
    const m = mount({ run: ok })
    await m.handler(evt('bash', 'git status'), ctx('/r1'))
    await m.handler(evt('bash', 'gh pr create'), ctx('/r2'))
    await m.handler(evt('bash', 'glab mr list'), ctx('/r3'))
    await m.handler(evt('bash', 'gitflow-guard status'), ctx('/r4'))
    expect(m.calls).toHaveLength(4)
    expect(m.calls[0]!.argv).toEqual(['check', '--platform', 'claude', '--command', 'git status'])
    expect(m.calls[0]!.cwd).toBe('/r1')
  })

  it('守卫放行(exit 0)→ undefined, cwd 透传会话目录', async () => {
    const m = mount({ run: ok })
    expect(await m.handler(evt('bash', 'git push origin feature/x'), ctx('/repo'))).toBeUndefined()
    expect(m.calls).toEqual([{ argv: ['check', '--platform', 'claude', '--command', 'git push origin feature/x'], cwd: '/repo' }])
  })

  it('守卫拒绝(exit 2 + stderr 原因)→ { block: true, reason }', async () => {
    const m = mount({ run: () => Promise.resolve({ code: 2, stdout: '', stderr: 'blocked: Protected branch\n' }) })
    expect(await m.handler(evt('bash', 'git push origin develop'), ctx())).toEqual({ block: true, reason: 'blocked: Protected branch' })
  })

  it('拒绝但 stderr 空白 → 兜底原因', async () => {
    const m = mount({ run: () => Promise.resolve({ code: 2, stdout: '', stderr: '  \n' }) })
    expect(await m.handler(evt('bash', 'git push origin develop'), ctx())).toEqual({ block: true, reason: 'blocked by gitflow-guard' })
  })

  it('守卫其他非零退出(内部错误)→ fail-open 放行', async () => {
    const m = mount({ run: () => Promise.resolve({ code: 1, stdout: '', stderr: 'oops' }) })
    expect(await m.handler(evt('bash', 'git push origin develop'), ctx())).toBeUndefined()
  })

  it('run 抛异常(如 CLI 缺失)→ fail-open 放行', async () => {
    const m = mount({ run: () => Promise.reject(new Error('ENOENT')) })
    expect(await m.handler(evt('bash', 'git push origin develop'), ctx())).toBeUndefined()
  })

  it('缺 command 字段 → 放行且不 spawn', async () => {
    const m = mount({ run: ok })
    expect(await m.handler(evt('bash'), ctx())).toBeUndefined()
    expect(await m.handler({ toolName: 'bash', input: {} }, ctx())).toBeUndefined()
    expect(m.calls).toHaveLength(0)
  })

  it('toolNames 覆盖: 只拦 bash', async () => {
    const m = mount({ toolNames: ['bash'], run: ok })
    await m.handler(evt('bash', 'git status'), ctx())
    await m.handler(evt('powershell', 'git status'), ctx())
    expect(m.calls).toHaveLength(1)
  })
})
