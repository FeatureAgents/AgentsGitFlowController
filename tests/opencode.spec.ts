import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { applyWire } from '../src/wire'
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

describe('opencode: wire 落位无 bin/ 外部仓库实弹执行', () => {
  it('动态导入已 wired 插件 → 拦截直推 develop(抛错)并放行 feature/非命令工具', async () => {
    const repoRaw = mkdtempSync(join(tmpdir(), 'gfguard-opencode-live-'))
    const stateRoot = mkdtempSync(join(tmpdir(), 'gfguard-opencode-state-'))
    const prevStateRoot = process.env.GITFLOW_GUARD_STATE_ROOT
    process.env.GITFLOW_GUARD_STATE_ROOT = stateRoot
    try {
      await execFileP('git', ['init', '-b', 'develop'], { cwd: repoRaw })
      await execFileP('git', ['config', 'user.email', 't@example.com'], { cwd: repoRaw })
      await execFileP('git', ['config', 'user.name', 'T'], { cwd: repoRaw })
      const repo = (await execFileP('git', ['rev-parse', '--show-toplevel'], { cwd: repoRaw })).stdout.trim()
      const pluginPath = join(repo, '.opencode', 'plugins', 'gitflow-guard.ts')
      writeFileSync(
        join(repo, 'gitflow-guard.config.json'),
        JSON.stringify({ enabled: true, featurePattern: 'feature/[\\w-]+', branches: { integration: ['develop'], archive: ['main'] } }),
      )
      await execFileP('git', ['add', '.'], { cwd: repo })
      await execFileP('git', ['commit', '-m', 'init'], { cwd: repo })

      expect(await applyWire('opencode', pluginPath, false, false)).toBe('added')
      const mod = (await import(pluginPath)) as { default: typeof pluginFactory }
      const plugin = await mod.default({ directory: repo })
      const handler = plugin['tool.execute.before']

      await expect(handler({ tool: 'bash' }, { args: { command: 'git push origin develop' } })).rejects.toThrow(/Protected branch/)
      await expect(handler({ tool: 'bash' }, { args: { command: 'git push origin feature/x' } })).resolves.toBeUndefined()
      await expect(handler({ tool: 'read' }, { args: { command: 'git push origin develop' } })).resolves.toBeUndefined()
    } finally {
      if (prevStateRoot === undefined) delete process.env.GITFLOW_GUARD_STATE_ROOT
      else process.env.GITFLOW_GUARD_STATE_ROOT = prevStateRoot
      rmSync(stateRoot, { recursive: true, force: true })
      rmSync(repoRaw, { recursive: true, force: true })
    }
  })

  it('带 workdir 跨 worktree 实弹判定: main→wt 放行, wt→../main 拦截', async () => {
    const base = mkdtempSync(join(tmpdir(), 'gfguard-opencode-wt-'))
    const stateRoot = mkdtempSync(join(tmpdir(), 'gfguard-opencode-state-'))
    const prevStateRoot = process.env.GITFLOW_GUARD_STATE_ROOT
    process.env.GITFLOW_GUARD_STATE_ROOT = stateRoot
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
      const mainRepo = (await execFileP('git', ['rev-parse', '--show-toplevel'], { cwd: mainRaw })).stdout.trim()
      await execFileP('git', ['worktree', 'add', wtRaw, '-b', 'feature/wt'], { cwd: mainRepo })
      const wt = (await execFileP('git', ['rev-parse', '--show-toplevel'], { cwd: wtRaw })).stdout.trim()
      const pluginPath = join(mainRepo, '.opencode', 'plugins', 'gitflow-guard.ts')

      await applyWire('opencode', pluginPath, false, false)
      const mod = (await import(pluginPath)) as { default: typeof pluginFactory }

      const fromMain = await mod.default({ directory: mainRepo })
      await expect(
        fromMain['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git merge develop', workdir: wt } }),
      ).resolves.toBeUndefined()

      const fromWt = await mod.default({ directory: wt })
      await expect(
        fromWt['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git merge feature/wt', workdir: '../main' } }),
      ).rejects.toThrow(/archive/i)
    } finally {
      if (prevStateRoot === undefined) delete process.env.GITFLOW_GUARD_STATE_ROOT
      else process.env.GITFLOW_GUARD_STATE_ROOT = prevStateRoot
      rmSync(stateRoot, { recursive: true, force: true })
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('安全回归: output.args.workdir / cwd 传入不存在目录时不触发 ENOENT fail-open, 回退 baseCwd 拦截', async () => {
    const repoRaw = mkdtempSync(join(tmpdir(), 'gfguard-opencode-missing-wd-'))
    const stateRoot = mkdtempSync(join(tmpdir(), 'gfguard-opencode-state-'))
    const prevStateRoot = process.env.GITFLOW_GUARD_STATE_ROOT
    process.env.GITFLOW_GUARD_STATE_ROOT = stateRoot
    try {
      await execFileP('git', ['init', '-b', 'develop'], { cwd: repoRaw })
      await execFileP('git', ['config', 'user.email', 't@example.com'], { cwd: repoRaw })
      await execFileP('git', ['config', 'user.name', 'T'], { cwd: repoRaw })
      const repo = (await execFileP('git', ['rev-parse', '--show-toplevel'], { cwd: repoRaw })).stdout.trim()
      const pluginPath = join(repo, '.opencode', 'plugins', 'gitflow-guard.ts')
      writeFileSync(
        join(repo, 'gitflow-guard.config.json'),
        JSON.stringify({ enabled: true, featurePattern: 'feature/[\\w-]+', branches: { integration: ['develop'], archive: ['main'] } }),
      )
      await execFileP('git', ['add', '.'], { cwd: repo })
      await execFileP('git', ['commit', '-m', 'init'], { cwd: repo })

      await applyWire('opencode', pluginPath, false, false)
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
    } finally {
      if (prevStateRoot === undefined) delete process.env.GITFLOW_GUARD_STATE_ROOT
      else process.env.GITFLOW_GUARD_STATE_ROOT = prevStateRoot
      rmSync(stateRoot, { recursive: true, force: true })
      rmSync(repoRaw, { recursive: true, force: true })
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
