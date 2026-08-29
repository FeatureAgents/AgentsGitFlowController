// OpenCode 插件逻辑单测: 事件过滤 / 守卫定位链 / spawn 参数 / exit 语义(fail-open 与阻断)。
// 插件经 vitest 直接加载(opencode/gitflow-guard.ts), spawn 用 mock 隔离, 不产生真实子进程;
// existsSync 保留真实 fs —— 测试运行于仓库根, 项目根 bin/gitflow-guard.mjs 真实存在,
// 定位链第 1 分支是常态路径; 其余分支用 mock 覆盖。
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const { spawnMock, exits } = vi.hoisted(() => {
  const spawnMock = vi.fn()
  return { spawnMock, exits: vi.fn() }
})

vi.mock('node:child_process', () => ({ spawn: spawnMock }))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: exits }
})

import pluginFactory from '../opencode/gitflow-guard'

/** 构造一个可手动触发 close/error/stderr 的假子进程对象 */
function fakeChild() {
  const stderrHandlers: Array<(d: Buffer) => void> = []
  const handlers: Record<string, (arg?: unknown) => void> = {}
  const child = {
    stderr: { on: (ev: string, cb: (d: Buffer) => void) => { if (ev === 'data') stderrHandlers.push(cb) } },
    on: (ev: string, cb: (arg?: unknown) => void) => { handlers[ev] = cb },
  }
  return {
    child,
    emitStderr: (text: string) => stderrHandlers.forEach((cb) => cb(Buffer.from(text))),
    emitClose: (code: number | null) => handlers['close']?.(code),
    emitError: (e: Error) => handlers['error']?.(e),
  }
}

/** 项目级常态定位: <仓库根>/bin/gitflow-guard.mjs(测试运行于仓库根, 该文件真实存在) */
const localBin = resolve(fileURLToPath(new URL('../..', import.meta.url)), 'bin', 'gitflow-guard.mjs')

/** 共享的假子进程控制器: beforeEach 新建, 测试里按需 emitClose/emitStderr/emitError 后 await */
let childControl: ReturnType<typeof fakeChild>

function beginSpawn() {
  childControl = fakeChild()
  spawnMock.mockReturnValue(childControl.child)
}

describe('opencode plugin: tool.execute.before 事件过滤', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    beginSpawn()
    exits.mockReset()
    exits.mockImplementation((p: string) => p.endsWith('bin/gitflow-guard.mjs'))
  })

  it('非 bash/powershell 工具(read/edit 等)不经过守卫, 不 spawn', async () => {
    const plugin = await pluginFactory()
    const handler = plugin['tool.execute.before']
    await expect(handler({ tool: 'read' }, { args: { filePath: '/x' } })).resolves.toBeUndefined()
    await expect(handler({ tool: 'edit' }, { args: { filePath: '/x' } })).resolves.toBeUndefined()
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('bash 但命令缺失/非字符串 → 放行, 不 spawn', async () => {
    const plugin = await pluginFactory()
    const handler = plugin['tool.execute.before']
    await expect(handler({ tool: 'bash' }, {})).resolves.toBeUndefined()
    await expect(handler({ tool: 'bash' }, { args: {} })).resolves.toBeUndefined()
    await expect(handler({ tool: 'bash' }, { args: { command: 42 } })).resolves.toBeUndefined()
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('bash git 命令 → spawn 守卫(unix shebang 形态: bin 为脚本路径, 不含解释器)', async () => {
    const plugin = await pluginFactory()
    const p = plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git push origin develop' } })
    childControl.emitClose(0)
    await p
    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [bin, args] = spawnMock.mock.calls[0]
    expect(bin).toBe(localBin)
    expect(args).toEqual(['check', '--platform', 'opencode', '--command', 'git push origin develop'])
  })

  it('powershell 命令同样送守卫', async () => {
    const plugin = await pluginFactory()
    const p = plugin['tool.execute.before']({ tool: 'powershell' }, { args: { command: 'git push origin develop' } })
    childControl.emitClose(0)
    await p
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  it('win32: 用 PATH 上的 node 解释脚本', async () => {
    const prev = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      const plugin = await pluginFactory()
      const p = plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git push origin develop' } })
      childControl.emitClose(0)
      await p
      const [bin, args] = spawnMock.mock.calls[0]
      expect(bin).toBe('node')
      // node:path 的 join 行为按模块加载时平台决定(mac 上跑测试仍是 posix 分隔); win32 分支的意义在解释器选择
      expect(args[0]).toBe(localBin)
      expect(args.slice(1)).toEqual(['check', '--platform', 'opencode', '--command', 'git push origin develop'])
    } finally {
      Object.defineProperty(process, 'platform', { value: prev })
    }
  })
})

describe('opencode plugin: exit 语义(阻断 = 抛错, 其余 fail-open)', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    exits.mockReset()
    exits.mockImplementation((p: string) => p.endsWith('bin/gitflow-guard.mjs'))
  })

  it('check exit 2 → 抛错阻断, 错误消息含守卫 stderr 文案', async () => {
    const { child, emitStderr, emitClose } = fakeChild()
    spawnMock.mockReturnValue(child)
    const plugin = await pluginFactory()
    const p = plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git push origin develop' } })
    emitStderr('blocked: Protected branch "develop" forbids direct push\nNext: ...')
    emitClose(2)
    await expect(p).rejects.toThrow(/blocked: Protected branch "develop" forbids direct push/)
  })

  it('check exit 2 且 stderr 为空 → 抛错但带命令回显兜底文案', async () => {
    const { child, emitClose } = fakeChild()
    spawnMock.mockReturnValue(child)
    const plugin = await pluginFactory()
    const p = plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git rm -rf x' } })
    emitClose(2)
    await expect(p).rejects.toThrow(/git rm -rf x/)
  })

  it('check exit 0 → 放行', async () => {
    const { child, emitClose } = fakeChild()
    spawnMock.mockReturnValue(child)
    const plugin = await pluginFactory()
    const p = plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git status' } })
    emitClose(0)
    await expect(p).resolves.toBeUndefined()
  })

  it('check 意外退出(exit 1)→ 放行 + 告警含 stderr(fail-open)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { child, emitClose, emitStderr } = fakeChild()
    spawnMock.mockReturnValue(child)
    const plugin = await pluginFactory()
    const p = plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git status' } })
    emitStderr('guard exploded')
    emitClose(1)
    await expect(p).resolves.toBeUndefined()
    const call = errSpy.mock.calls[0][0] as string
    expect(call).toContain('check exited 1')
    expect(call).toContain('guard exploded')
    errSpy.mockRestore()
  })

  it('spawn 失败(守卫缺失等内部故障) → 放行 + 告警(fail-open)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { child, emitError } = fakeChild()
    spawnMock.mockReturnValue(child)
    const plugin = await pluginFactory()
    const p = plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git status' } })
    emitError(new Error('ENOENT'))
    await expect(p).resolves.toBeUndefined()
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('cannot spawn guard'))
    errSpy.mockRestore()
  })
})

describe('opencode plugin: 守卫定位链', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    beginSpawn()
    exits.mockReset()
  })

  it('项目根 bin/ 存在(常态) → 优先用它, 不查环境变量', async () => {
    exits.mockImplementation((p: string) => p.endsWith('bin/gitflow-guard.mjs'))
    const plugin = await pluginFactory()
    const p = plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git status' } })
    childControl.emitClose(0)
    await p
    expect(spawnMock.mock.calls[0][0]).toBe(localBin)
  })

  it('项目根缺失 → 回退 $OPENCODE_PROJECT_DIR/bin/', async () => {
    const viaEnv = '/fake-project/bin/gitflow-guard.mjs'
    process.env.OPENCODE_PROJECT_DIR = '/fake-project'
    exits.mockImplementation((p: string) => p === viaEnv)
    try {
      const plugin = await pluginFactory()
      const p = plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git status' } })
      childControl.emitClose(0)
      await p
      expect(spawnMock.mock.calls[0][0]).toBe(viaEnv)
    } finally {
      delete process.env.OPENCODE_PROJECT_DIR
    }
  })

  it('项目根与 env 均缺 → 用 GITFLOW_GUARD_BIN', async () => {
    process.env.GITFLOW_GUARD_BIN = '/custom/guard.mjs'
    exits.mockReturnValue(false)
    try {
      const plugin = await pluginFactory()
      const p = plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git status' } })
      childControl.emitClose(0)
      await p
      expect(spawnMock.mock.calls[0][0]).toBe('/custom/guard.mjs')
    } finally {
      delete process.env.GITFLOW_GUARD_BIN
    }
  })

  it('全部定位源缺失 → PATH 上的 gitflow-guard 回退', async () => {
    exits.mockReturnValue(false)
    const plugin = await pluginFactory()
    const p = plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git status' } })
    childControl.emitClose(0)
    await p
    expect(spawnMock.mock.calls[0][0]).toBe('gitflow-guard')
    // PATH 回退 spawn 失败也应 fail-open(不抛)
    beginSpawn()
    const p2 = plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git status' } })
    childControl.emitError(new Error('ENOENT'))
    await expect(p2).resolves.toBeUndefined()
  })
})