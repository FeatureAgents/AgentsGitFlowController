import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { applyWire, resolveRunnerPath } from '../src/wire'
import pluginFactory, { resolveGuardTarget } from '../opencode/gitflow-guard'

const execFileP = promisify(execFile)

describe('opencode: resolveGuardTarget 跨平台解析', () => {
  it('win32 兜底使用 gitflow-guard.cmd + shell:true, 绝不拼接 node gitflow-guard', () => {
    const target = resolveGuardTarget({
      platform: 'win32',
      env: {},
      exists: () => false,
      wiredRunnerPath: '',
      wiredNodePath: '',
      pluginDir: 'C:\\proj\\.opencode\\plugins',
    })
    expect(target).toEqual({ bin: 'gitflow-guard.cmd', args: [], shell: true })
    expect(target.bin).not.toBe('node')
  })

  it('linux 兜底使用 gitflow-guard + shell:false', () => {
    const target = resolveGuardTarget({
      platform: 'linux',
      env: {},
      exists: () => false,
      wiredRunnerPath: '',
      wiredNodePath: '',
      pluginDir: '/proj/.opencode/plugins',
    })
    expect(target).toEqual({ bin: 'gitflow-guard', args: [], shell: false })
  })

  it('WIRED_RUNNER_PATH 优先于项目根 bin/ 与 PATH, 并使用存在的 WIRED_NODE_PATH', () => {
    const wiredRunner = '/pkg/bin/gitflow-guard.mjs'
    const wiredNode = '/pkg/node/node'
    const target = resolveGuardTarget({
      platform: 'win32',
      env: {},
      exists: (p) => p === wiredRunner || p === wiredNode || p.endsWith('gitflow-guard.mjs'),
      wiredRunnerPath: wiredRunner,
      wiredNodePath: wiredNode,
      pluginDir: 'C:\\proj\\.opencode\\plugins',
    })
    expect(target).toEqual({ bin: wiredNode, args: [wiredRunner], shell: false })
  })

  it('WIRED_RUNNER_PATH 不存在且 WIRED_NODE_PATH 不存在时回退项目根 bin/ 与 node', () => {
    const root = resolve('/workspace', 'proj')
    const pluginDir = join(root, '.opencode', 'plugins')
    const localBin = join(root, 'bin', 'gitflow-guard.mjs')
    const target = resolveGuardTarget({
      platform: 'linux',
      env: {},
      exists: (p) => p === localBin,
      wiredRunnerPath: '/stale/bin/gitflow-guard.mjs',
      wiredNodePath: '/stale/node',
      pluginDir,
    })
    expect(target).toEqual({ bin: 'node', args: [localBin], shell: false })
  })

  it('pluginDir 推演项目根 bin/ 优先于 $OPENCODE_PROJECT_DIR', () => {
    const rootA = resolve('/repo-a')
    const pluginDir = join(rootA, '.opencode', 'plugins')
    const localBin = join(rootA, 'bin', 'gitflow-guard.mjs')
    const envBin = join('/repo-b', 'bin', 'gitflow-guard.mjs')
    const target = resolveGuardTarget({
      platform: 'linux',
      env: { OPENCODE_PROJECT_DIR: '/repo-b' },
      exists: (p) => p === localBin || p === envBin,
      wiredRunnerPath: '',
      wiredNodePath: '',
      pluginDir,
    })
    expect(target).toEqual({ bin: 'node', args: [localBin], shell: false })
  })

  it('项目根 bin/ 缺失时回退 $OPENCODE_PROJECT_DIR/bin/gitflow-guard.mjs', () => {
    const envBin = join('/repo-b', 'bin', 'gitflow-guard.mjs')
    const target = resolveGuardTarget({
      platform: 'linux',
      env: { OPENCODE_PROJECT_DIR: '/repo-b' },
      exists: (p) => p === envBin,
      wiredRunnerPath: '/missing/runner.mjs',
      wiredNodePath: '',
      pluginDir: '/repo-a/.opencode/plugins',
    })
    expect(target).toEqual({ bin: 'node', args: [envBin], shell: false })
  })

  it('GITFLOW_GUARD_BIN 最高优先级覆盖: 脚本走 nodeBin, win32 .cmd/裸命令走 shell:true, .exe 走 shell:false', () => {
    expect(
      resolveGuardTarget({
        platform: 'win32',
        env: { GITFLOW_GUARD_BIN: 'C:\\custom\\guard.mjs' },
        exists: () => true,
        wiredRunnerPath: '/wired/bin/gitflow-guard.mjs',
        wiredNodePath: 'C:\\node\\node.exe',
      }),
    ).toEqual({ bin: 'C:\\node\\node.exe', args: ['C:\\custom\\guard.mjs'], shell: false })

    expect(
      resolveGuardTarget({
        platform: 'win32',
        env: { GITFLOW_GUARD_BIN: 'gitflow-guard' },
        exists: () => false,
      }),
    ).toEqual({ bin: 'gitflow-guard', args: [], shell: true })

    expect(
      resolveGuardTarget({
        platform: 'win32',
        env: { GITFLOW_GUARD_BIN: 'C:\\tools\\guard.cmd' },
        exists: () => false,
      }),
    ).toEqual({ bin: 'C:\\tools\\guard.cmd', args: [], shell: true })

    expect(
      resolveGuardTarget({
        platform: 'win32',
        env: { GITFLOW_GUARD_BIN: 'C:\\tools\\guard.exe' },
        exists: () => false,
      }),
    ).toEqual({ bin: 'C:\\tools\\guard.exe', args: [], shell: false })

    expect(
      resolveGuardTarget({
        platform: 'linux',
        env: { GITFLOW_GUARD_BIN: '/usr/local/bin/gitflow-guard' },
        exists: () => false,
      }),
    ).toEqual({ bin: '/usr/local/bin/gitflow-guard', args: [], shell: false })
  })
})

interface StubInvocation {
  argv: string[]
  processCwd: string
  payloadCwd: string | undefined
  command: string | undefined
}

function createGuardStub(): { dir: string; binPath: string; logFile: string } {
  const dir = mkdtempSync(join(tmpdir(), 'gfguard-opencode-stub-'))
  const binPath = join(dir, 'guard-stub.mjs')
  const logFile = join(dir, 'invocations.jsonl')
  writeFileSync(
    binPath,
    `import { appendFileSync } from 'node:fs'

const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
const command = payload?.tool_args?.command ?? ''
const actualCwd = process.cwd()
const payloadCwd = payload?.cwd

if (process.env.STUB_LOG_FILE) {
  appendFileSync(
    process.env.STUB_LOG_FILE,
    JSON.stringify({ argv: process.argv.slice(2), processCwd: actualCwd, payloadCwd, command }) + '\\n',
  )
}

const expectedCwd = process.env.STUB_EXPECTED_CWD
if (expectedCwd && (actualCwd !== expectedCwd || payloadCwd !== expectedCwd)) {
  process.stderr.write(\`CWD_MISMATCH actual=\${actualCwd} payload=\${payloadCwd} expected=\${expectedCwd}\\n\`)
  process.exit(2)
}

if (/\\bgit\\s+push\\b.*\\bdevelop\\b/.test(command)) {
  process.stderr.write("[gitflow-guard] blocked: Protected branch 'develop'\\n")
  process.exit(2)
}

if (process.env.STUB_ARCHIVE_DIR && actualCwd === process.env.STUB_ARCHIVE_DIR && /\\bgit\\s+merge\\b/.test(command)) {
  process.stderr.write("[gitflow-guard] blocked: archive branch 'main'\\n")
  process.exit(2)
}

process.exit(0)
`,
  )
  return { dir, binPath, logFile }
}

function readStubLog(logFile: string): StubInvocation[] {
  if (!existsSync(logFile)) return []
  return readFileSync(logFile, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StubInvocation)
}

function assertWiredPaths(pluginPath: string): void {
  const wired = readFileSync(pluginPath, 'utf8')
  const expectedRunner = resolveRunnerPath().replace(/\\/g, '/')
  const expectedNode = process.execPath.replace(/\\/g, '/')
  expect(existsSync(expectedRunner)).toBe(true)
  expect(existsSync(expectedNode)).toBe(true)
  expect(wired).toContain(`const WIRED_RUNNER_PATH = ${JSON.stringify(expectedRunner)}`)
  expect(wired).toContain(`const WIRED_NODE_PATH = ${JSON.stringify(expectedNode)}`)
}

function saveStubEnv() {
  return {
    GITFLOW_GUARD_BIN: process.env.GITFLOW_GUARD_BIN,
    STUB_LOG_FILE: process.env.STUB_LOG_FILE,
    STUB_EXPECTED_CWD: process.env.STUB_EXPECTED_CWD,
    STUB_ARCHIVE_DIR: process.env.STUB_ARCHIVE_DIR,
  }
}

function restoreStubEnv(prev: ReturnType<typeof saveStubEnv>): void {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

describe('opencode: wire 落位与插件进程通信回归(零 lib/ 依赖)', () => {
  it('动态导入已 wired 插件 → 注入真实路径 + stub 验证 spawn/stdin JSON/拦截与放行', async () => {
    const repoRaw = mkdtempSync(join(tmpdir(), 'gfguard-opencode-live-'))
    const stub = createGuardStub()
    const prevEnv = saveStubEnv()
    process.env.GITFLOW_GUARD_BIN = stub.binPath
    process.env.STUB_LOG_FILE = stub.logFile
    try {
      await execFileP('git', ['init', '-b', 'develop'], { cwd: repoRaw })
      await execFileP('git', ['config', 'user.email', 't@example.com'], { cwd: repoRaw })
      await execFileP('git', ['config', 'user.name', 'T'], { cwd: repoRaw })
      const repo = resolve((await execFileP('git', ['rev-parse', '--show-toplevel'], { cwd: repoRaw })).stdout.trim())
      const pluginPath = join(repo, '.opencode', 'plugins', 'gitflow-guard.ts')
      writeFileSync(
        join(repo, 'gitflow-guard.config.json'),
        JSON.stringify({ enabled: true, featurePattern: 'feature/[\\w-]+', branches: { integration: ['develop'], archive: ['main'] } }),
      )
      await execFileP('git', ['add', '.'], { cwd: repo })
      await execFileP('git', ['commit', '-m', 'init'], { cwd: repo })

      expect(await applyWire('opencode', pluginPath, false, false)).toBe('added')
      assertWiredPaths(pluginPath)

      process.env.STUB_EXPECTED_CWD = repo
      const mod = (await import(pluginPath)) as { default: typeof pluginFactory }
      const plugin = await mod.default({ directory: repo })
      const handler = plugin['tool.execute.before']

      await expect(handler({ tool: 'bash' }, { args: { command: 'git push origin develop' } })).rejects.toThrow(/Protected branch/)
      await expect(handler({ tool: 'bash' }, { args: { command: 'git push origin feature/x' } })).resolves.toBeUndefined()
      await expect(handler({ tool: 'read' }, { args: { command: 'git push origin develop' } })).resolves.toBeUndefined()

      const logs = readStubLog(stub.logFile)
      expect(logs).toHaveLength(2)
      expect(logs[0]).toEqual({
        argv: ['check', '--platform', 'opencode'],
        processCwd: repo,
        payloadCwd: repo,
        command: 'git push origin develop',
      })
      expect(logs[1]).toEqual({
        argv: ['check', '--platform', 'opencode'],
        processCwd: repo,
        payloadCwd: repo,
        command: 'git push origin feature/x',
      })
    } finally {
      restoreStubEnv(prevEnv)
      rmSync(stub.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
      rmSync(repoRaw, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('带 workdir 跨 worktree 解析: main→wt 放行, wt→../main 拦截(精确传递解析后 cwd)', async () => {
    const base = mkdtempSync(join(tmpdir(), 'gfguard-opencode-wt-'))
    const stub = createGuardStub()
    const prevEnv = saveStubEnv()
    process.env.GITFLOW_GUARD_BIN = stub.binPath
    process.env.STUB_LOG_FILE = stub.logFile
    const mainRaw = join(base, 'main')
    const wtRaw = join(base, 'wt')
    try {
      mkdirSync(mainRaw, { recursive: true })
      await execFileP('git', ['init', '-b', 'main'], { cwd: mainRaw })
      await execFileP('git', ['config', 'user.email', 't@example.com'], { cwd: mainRaw })
      await execFileP('git', ['config', 'user.name', 'T'], { cwd: mainRaw })
      writeFileSync(join(mainRaw, 'f.txt'), 'x')
      await execFileP('git', ['add', '.'], { cwd: mainRaw })
      await execFileP('git', ['commit', '-m', 'init'], { cwd: mainRaw })
      const mainRepo = resolve((await execFileP('git', ['rev-parse', '--show-toplevel'], { cwd: mainRaw })).stdout.trim())
      await execFileP('git', ['worktree', 'add', wtRaw, '-b', 'feature/wt'], { cwd: mainRepo })
      const wt = resolve((await execFileP('git', ['rev-parse', '--show-toplevel'], { cwd: wtRaw })).stdout.trim())
      const pluginPath = join(mainRepo, '.opencode', 'plugins', 'gitflow-guard.ts')

      expect(await applyWire('opencode', pluginPath, false, false)).toBe('added')
      assertWiredPaths(pluginPath)
      const mod = (await import(pluginPath)) as { default: typeof pluginFactory }

      process.env.STUB_ARCHIVE_DIR = mainRepo
      process.env.STUB_EXPECTED_CWD = wt
      const fromMain = await mod.default({ directory: mainRepo })
      await expect(
        fromMain['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git merge develop', workdir: wt } }),
      ).resolves.toBeUndefined()

      process.env.STUB_EXPECTED_CWD = mainRepo
      const fromWt = await mod.default({ directory: wt })
      await expect(
        fromWt['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git merge feature/wt', workdir: '../main' } }),
      ).rejects.toThrow(/archive/i)

      const logs = readStubLog(stub.logFile)
      expect(logs).toHaveLength(2)
      expect(logs[0].processCwd).toBe(wt)
      expect(logs[0].payloadCwd).toBe(wt)
      expect(logs[1].processCwd).toBe(mainRepo)
      expect(logs[1].payloadCwd).toBe(mainRepo)
    } finally {
      restoreStubEnv(prevEnv)
      rmSync(stub.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
      rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('安全回归: output.args.workdir / cwd 传入不存在目录或普通文件时不触发 ENOENT fail-open, 回退 baseCwd 拦截', async () => {
    const repoRaw = mkdtempSync(join(tmpdir(), 'gfguard-opencode-missing-wd-'))
    const stub = createGuardStub()
    const prevEnv = saveStubEnv()
    process.env.GITFLOW_GUARD_BIN = stub.binPath
    process.env.STUB_LOG_FILE = stub.logFile
    try {
      await execFileP('git', ['init', '-b', 'develop'], { cwd: repoRaw })
      await execFileP('git', ['config', 'user.email', 't@example.com'], { cwd: repoRaw })
      await execFileP('git', ['config', 'user.name', 'T'], { cwd: repoRaw })
      const repo = resolve((await execFileP('git', ['rev-parse', '--show-toplevel'], { cwd: repoRaw })).stdout.trim())
      const pluginPath = join(repo, '.opencode', 'plugins', 'gitflow-guard.ts')
      writeFileSync(
        join(repo, 'gitflow-guard.config.json'),
        JSON.stringify({ enabled: true, featurePattern: 'feature/[\\w-]+', branches: { integration: ['develop'], archive: ['main'] } }),
      )
      await execFileP('git', ['add', '.'], { cwd: repo })
      await execFileP('git', ['commit', '-m', 'init'], { cwd: repo })

      expect(await applyWire('opencode', pluginPath, false, false)).toBe('added')
      assertWiredPaths(pluginPath)

      process.env.STUB_EXPECTED_CWD = repo
      const mod = (await import(pluginPath)) as { default: typeof pluginFactory }
      const plugin = await mod.default({ directory: repo })
      const handler = plugin['tool.execute.before']

      await expect(
        handler({ tool: 'bash' }, { args: { command: 'git push origin develop', workdir: join(repo, 'does-not-exist') } }),
      ).rejects.toThrow(/Protected branch/)
      await expect(
        handler({ tool: 'bash' }, { args: { command: 'git push origin develop', cwd: 'missing-subdir' } }),
      ).rejects.toThrow(/Protected branch/)
      await expect(
        handler(
          { tool: 'bash' },
          { args: { command: 'git push origin develop', workdir: join(repo, 'gitflow-guard.config.json') } },
        ),
      ).rejects.toThrow(/Protected branch/)

      const logs = readStubLog(stub.logFile)
      expect(logs).toHaveLength(3)
      for (const entry of logs) {
        expect(entry.processCwd).toBe(repo)
        expect(entry.payloadCwd).toBe(repo)
      }
    } finally {
      restoreStubEnv(prevEnv)
      rmSync(stub.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
      rmSync(repoRaw, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('子进程超时 → SIGKILL 并抛超时阻断错误(不 fail-open)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gfguard-opencode-timeout-'))
    const slowBin = join(dir, 'slow-guard.mjs')
    writeFileSync(slowBin, 'setTimeout(() => {}, 10_000)\n')
    const prev = process.env.GITFLOW_GUARD_BIN
    process.env.GITFLOW_GUARD_BIN = slowBin
    try {
      const plugin = await pluginFactory({ directory: tmpdir() }, { timeoutMs: 40 })
      await expect(
        plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git push origin develop' } }),
      ).rejects.toThrow(/gitflow-guard timed out — blocking by default/)
    } finally {
      if (prev === undefined) delete process.env.GITFLOW_GUARD_BIN
      else process.env.GITFLOW_GUARD_BIN = prev
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })
})
