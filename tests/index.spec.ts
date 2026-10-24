import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { apply, evaluateCommand, registerLocale, stateDir, userStateRoot } from '../src/index'
import type { Context } from '@deepseek-ai/cordis'
import type { RunResult, Runner } from '../src/repo'

/** 小团队配置: 仅 integration */
function baseConfig(): Record<string, unknown> {
  return { enabled: true, featurePattern: 'feature/[\\w-]+', branches: { integration: ['develop'] } }
}

function tempRepo(config: Record<string, unknown> = baseConfig()): string {
  const dir = mkdtempSync(join(tmpdir(), 'gfguard-eval-'))
  mkdirSync(join(dir, '.git'), { recursive: true })
  writeFileSync(join(dir, 'gitflow-guard.config.json'), JSON.stringify(config))
  return dir
}

/** 脚本化 runner: 严格模式——未预置的命令抛错, 避免掩盖误调用 */
function scriptedRunner(overrides: Record<string, Partial<RunResult>> = {}): Runner {
  return {
    async run(args) {
      const key = args.join(' ')
      const match = Object.entries(overrides).find(([k]) => key.startsWith(k))
      if (match) return { code: 0, stdout: '', stderr: '', ...match[1] }
      if (key === 'branch --show-current') return { code: 0, stdout: 'feature/dev-x-01\n', stderr: '' }
      if (args[0] === 'pr') return { code: 1, stdout: '', stderr: '' } // gh 查询失败是正常路径
      if (args[0] === 'rev-parse') return { code: 0, stdout: '', stderr: '' }
      throw new Error(`unexpected git command: ${key}`)
    },
  }
}

describe('evaluateCommand: 集成(分类 → git 事实 → 门禁)', () => {
  it('无配置文件 → 内置默认生效(develop/main 受保护, feature 自由)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gfguard-eval-noconfig-'))
    mkdirSync(join(dir, '.git'), { recursive: true })
    try {
      // 不写 gitflow-guard.config.json: 默认配置(integration=develop, archive=main)开箱即用
      expect((await evaluateCommand('git push origin develop', { repoRoot: dir, runner: scriptedRunner() })).outcome).toBe('deny')
      expect((await evaluateCommand('git push origin main', { repoRoot: dir, runner: scriptedRunner() })).outcome).toBe('deny')
      expect((await evaluateCommand('git push origin feature/dev-x-01', { repoRoot: dir, runner: scriptedRunner() })).outcome).toBe('allow')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('未启用配置的项目 → skipped', async () => {
    const dir = tempRepo({ enabled: false, branches: { integration: ['develop'] } })
    try {
      const r = await evaluateCommand('git push origin develop', { repoRoot: dir, runner: scriptedRunner() })
      expect(r.outcome).toBe('skipped')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('直推集成分支 → deny(带引导文案)', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('git push origin develop', { repoRoot: dir, runner: scriptedRunner() })
      expect(r.outcome).toBe('deny')
      expect(r.reason?.why).toContain('develop')
      expect(r.reason?.next).toBeTruthy()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('推 feature / 普通提交 → allow', async () => {
    const dir = tempRepo()
    try {
      expect((await evaluateCommand('git push origin feature/dev-x-01', { repoRoot: dir, runner: scriptedRunner() })).outcome).toBe('allow')
      expect((await evaluateCommand('git commit -m "feat: x"', { repoRoot: dir, runner: scriptedRunner() })).outcome).toBe('allow')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('在 feature 上本地 merge 同步 → allow', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('git merge develop', { repoRoot: dir, runner: scriptedRunner() })
      expect(r.outcome).toBe('allow')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('创建指向 develop 的 PR(feature→集成) → allow', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('gh pr create --base develop', {
        repoRoot: dir,
        runner: scriptedRunner(),
        currentBranch: 'feature/dev-x-01',
      })
      expect(r.outcome).toBe('allow')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('gh pr merge: 目标集成(develop) → allow', async () => {
    const dir = tempRepo()
    try {
      const runner = scriptedRunner({
        'pr view 10 --json': { stdout: '{"baseRefName":"develop","headRefName":"feature/dev-x-01"}' },
      })
      const r = await evaluateCommand('gh pr merge 10', { repoRoot: dir, runner, ghRunner: runner })
      expect(r.outcome).toBe('allow')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('gh pr merge: 目标无法解析(gh 失败) 且 head 非 feature → deny', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('gh pr merge 14', {
        repoRoot: dir,
        runner: scriptedRunner(),
        ghRunner: scriptedRunner(),
        currentBranch: 'develop',
      })
      expect(r.outcome).toBe('deny')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('gh pr merge: gh 失败 + feature head(PR 可能实际指向 production)→ deny', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('gh pr merge 15', {
        repoRoot: dir,
        runner: scriptedRunner(),
        ghRunner: scriptedRunner(), // gh 查询失败: 未安装/未认证/离线
        currentBranch: 'feature/dev-x-01',
      })
      expect(r.outcome).toBe('deny')
      expect(r.reason?.why).toMatch(/cannot confirm the pr\/mr target/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('&& 串联: 切到集成分支再 merge feature → deny(按模拟分支判定)', async () => {
    const dir = tempRepo()
    try {
      const runner = scriptedRunner({ 'branch --show-current': { stdout: 'feature/dev-verify-01\n' } })
      const r = await evaluateCommand('git checkout develop && git merge feature/dev-verify-01', {
        repoRoot: dir,
        runner,
        currentBranch: 'feature/dev-verify-01',
      })
      expect(r.outcome).toBe('deny')
      expect(r.reason?.why).toContain('PR')
      expect(r.segmentCount).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('&& 串联: 从 feature 切到集成分支后裸推 → 按模拟分支 deny(dst 延迟解析)', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('git switch develop && git push', {
        repoRoot: dir,
        runner: scriptedRunner(),
        currentBranch: 'feature/dev-x-01',
      })
      expect(r.outcome).toBe('deny')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('& 后台串联: 危险命令在 & 之后执行 → deny(防止后台绕过)', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('sleep 1 & git push origin develop', {
        repoRoot: dir,
        runner: scriptedRunner(),
        currentBranch: 'feature/dev-x-01',
      })
      expect(r.outcome).toBe('deny')
      expect(r.segmentCount).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('& 位于末尾: 危险命令在后台执行 → deny', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('git push origin develop &', {
        repoRoot: dir,
        runner: scriptedRunner(),
        currentBranch: 'feature/dev-x-01',
      })
      expect(r.outcome).toBe('deny')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('合法串联: 切新分支并推 feature → allow', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('git checkout -b feature/dev-new-01 && git push -u origin feature/dev-new-01', {
        repoRoot: dir,
        runner: scriptedRunner(),
        currentBranch: 'feature/dev-verify-01',
      })
      expect(r.outcome).toBe('allow')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('deny 后审计落盘(目录不存在时自动创建)', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('git push origin develop', { repoRoot: dir, runner: scriptedRunner() })
      expect(r.outcome).toBe('deny')
      const auditFile = join(await stateDir(dir), 'audit.jsonl') // 用户级全局目录, 不再进 .git
      expect(existsSync(auditFile)).toBe(true)
      expect(readFileSync(auditFile, 'utf8')).toContain('deny')
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(await stateDir(dir), { recursive: true, force: true })
    }
  })

  it('gitflow-guard 只读命令 → allow(不再有自理特许)', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('gitflow-guard status', { repoRoot: dir, runner: scriptedRunner() })
      expect(r.outcome).toBe('allow')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('worktree guard: 工作区脏时拦截 PR 创建', async () => {
    const dir = tempRepo({
      enabled: true,
      branches: { integration: ['develop'] },
      worktree: { requireCleanOnPr: true },
    })
    try {
      const runner = scriptedRunner({
        'status --porcelain': { stdout: ' M dirty.txt\n' },
      })
      const res = await evaluateCommand('gh pr create --base develop', {
        repoRoot: dir,
        runner,
        currentBranch: 'feature/dev-x-01',
      })
      expect(res.outcome).toBe('deny')
      expect(res.reason?.why).toMatch(/uncommitted changes/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('worktree guard: 复合命令前序包含 commit 时放行 (模拟干净状态)', async () => {
    const dir = tempRepo({
      enabled: true,
      branches: { integration: ['develop'] },
      worktree: { requireCleanOnPr: true },
    })
    try {
      const runner = scriptedRunner({
        'status --porcelain': { stdout: 'M  staged.txt\n' },
      })
      const res = await evaluateCommand('git commit -m "feat: done" && gh pr create --base develop', {
        repoRoot: dir,
        runner,
        currentBranch: 'feature/dev-x-01',
      })
      expect(res.outcome).toBe('allow')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('worktree guard: simulatedClean 下 git status 查询失败 → deny(realStatus 为空不伪造干净工作区)', async () => {
    const dir = tempRepo({
      enabled: true,
      branches: { integration: ['develop'] },
      worktree: { requireCleanOnPr: true },
    })
    try {
      const runner = scriptedRunner({
        'status --porcelain': { code: 1, stdout: '', stderr: '' },
      })
      const res = await evaluateCommand('git commit -m "feat: done" && gh pr create --base develop', {
        repoRoot: dir,
        runner,
        currentBranch: 'feature/dev-x-01',
      })
      expect(res.outcome).toBe('deny')
      expect(res.reason?.why).toMatch(/worktree status/i)
      expect(res.reason?.next).toBeTruthy()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('worktree guard: requireUpstreamSynced 且分支落后 upstream 时拦截', async () => {
    const dir = tempRepo({
      enabled: true,
      branches: { integration: ['develop'] },
      worktree: { requireUpstreamSynced: true },
    })
    try {
      const runner = scriptedRunner({
        'rev-list --left-right': { stdout: '1\t3\n' },
      })
      const res = await evaluateCommand('gh pr create --base develop', {
        repoRoot: dir,
        runner,
        currentBranch: 'feature/dev-x-01',
      })
      expect(res.outcome).toBe('deny')
      expect(res.reason?.why).toMatch(/behind upstream/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('evaluateCommand: 超时熔断的消费端接线', () => {
  it('分支查询超时 → deny(reason.why 命中超时文案), 且超时拒绝同样落审计', async () => {
    const dir = tempRepo()
    const runner: Runner = {
      async run(args) {
        if (args[0] === 'branch') return { code: 1, stdout: '', stderr: '', timedOut: true }
        return { code: 0, stdout: '', stderr: '' }
      },
    }
    try {
      const res = await evaluateCommand('git push origin develop', { repoRoot: dir, runner })
      expect(res.outcome).toBe('deny')
      expect(res.reason?.why).toMatch(/timed out/i)
      expect(res.reason?.next).toBeTruthy()
      // 超时拒绝不得静默: 与普通 deny 一样落 audit.jsonl
      const auditFile = join(await stateDir(dir, runner), 'audit.jsonl')
      expect(existsSync(auditFile)).toBe(true)
      expect(readFileSync(auditFile, 'utf8')).toMatch(/"event":"deny"/)
      expect(readFileSync(auditFile, 'utf8')).toMatch(/timed out/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(await stateDir(dir, runner), { recursive: true, force: true })
    }
  })

  it('factsFor: upstream 偏离查询超时 → 置 repoTimeout 并 deny(不落入"放行"路径)', async () => {
    const dir = tempRepo({
      enabled: true,
      branches: { integration: ['develop'] },
      worktree: { requireUpstreamSynced: true },
    })
    try {
      const runner = scriptedRunner({
        'rev-list --left-right': { code: 1, stdout: '', stderr: '', timedOut: true },
      })
      const res = await evaluateCommand('gh pr create --base develop', {
        repoRoot: dir,
        runner,
        currentBranch: 'feature/dev-x-01',
      })
      expect(res.outcome).toBe('deny')
      expect(res.reason?.why).toMatch(/timed out/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('apply: DSH 插件降级路径(P0-1)', () => {
  it('DSH 插件 apply: 挂载 pre-execute 并正确透传', async () => {
    const dir = tempRepo()
    let handler: ((exec: unknown, next: () => Promise<unknown>) => Promise<unknown>) | null = null
    const mockCtx = {
      on(event: string, fn: typeof handler) {
        if (event === 'tools/pre-execute') handler = fn
      },
    } as unknown as Context
    apply(mockCtx)
    expect(handler).toBeTruthy()
  })

  it('内部错误 → 英文降级日志(与 cli.checkInternalError 口径一致)+ 放行不阻断', async () => {
    const warnings: string[] = []
    type PreExecuteHandler = (exec: unknown, next: () => Promise<unknown>) => Promise<unknown>
    let handler: PreExecuteHandler | undefined
    const ctx = {
      on: (_event: string, fn: PreExecuteHandler) => {
        handler = fn
      },
      logger: { warn: (msg: string) => warnings.push(msg) },
    }
    apply(ctx as unknown as Context)
    expect(handler).toBeTypeOf('function')
    // exec.agent 属性访问即抛错 → 命中 apply 的 catch 降级路径
    // 命令须为非 git-只读(git status 属 other, 会被 classify 快路径提前放行, 触达不到 catch)
    const exec = { name: 'bash', arguments: { command: 'git push origin develop' }, get agent(): unknown { throw new Error('boom') } }
    const next = async () => 'passed-through'
    await expect(handler!(exec, next)).resolves.toBe('passed-through')
    expect(warnings).toEqual(['gitflow-guard: gate internal error, allowed through: boom'])
  })

  it('注入 runner 的仓库根查询超时 → deny(超时文案); 非 git 命令走 classify 快路径仍放行且零 git 调用', async () => {
    let calls = 0
    const runner: Runner = {
      async run(args) {
        calls++
        if (args[0] === 'rev-parse') return { code: 1, stdout: '', stderr: '', timedOut: true }
        return { code: 0, stdout: '', stderr: '' }
      },
    }
    type PreExecuteHandler = (exec: unknown, next: () => Promise<unknown>) => Promise<unknown>
    let handler: PreExecuteHandler | undefined
    const ctx = {
      on: (_event: string, fn: PreExecuteHandler) => {
        handler = fn
      },
    }
    // 注入缝: pluginConfig.runner(默认真实 gitRunner)
    apply(ctx as unknown as Context, { runner })
    expect(handler).toBeTypeOf('function')

    const next = async () => 'passed-through'
    const exec = { name: 'bash', arguments: { command: 'git push origin develop' }, agent: { session: { header: { cwd: '/fake/repo' } } } }
    const res = await handler!(exec, next)
    expect(res).toMatchObject({ kind: 'deny' })
    expect((res as { reason: string }).reason).toMatch(/timed out/i)

    // 非 git 命令在 classify 快路径直接放行: 不触发任何 git 查询, 超时 runner 也不会误伤
    const callsBefore = calls
    await expect(
      handler!({ name: 'bash', arguments: { command: 'npm test' }, agent: { session: { header: { cwd: '/fake/repo' } } } }, next),
    ).resolves.toBe('passed-through')
    expect(calls).toBe(callsBefore)
  })
})

describe('包根再导出 registerLocale(P1-1) / MESSAGE_KEYS(P2-6)', () => {
  it('registerLocale 从插件入口可导入(下游注册自定义 locale 的公开契约)', () => {
    // 行为覆盖在 i18n.spec.ts / cli.spec.ts; 此处只断言「包根可导入」这一导出面契约
    expect(registerLocale).toBeTypeOf('function')
  })
  it('MESSAGE_KEYS 从包根可导入: 自定义字典的必需键清单可发现(与内置 en 键集一致)', async () => {
    const { MESSAGE_KEYS } = await import('../src/index')
    const en = await import('../src/i18n')
    expect(MESSAGE_KEYS).toBeTypeOf('object')
    expect(MESSAGE_KEYS.length).toBeGreaterThan(0)
    // 与 i18n 模块导出的键清单同源同值
    expect([...MESSAGE_KEYS]).toEqual([...en.MESSAGE_KEYS])
    expect(MESSAGE_KEYS).toContain('deny.header')
  })
})

describe('stateDir: 运行时数据存用户级全局目录(仓库外)', () => {
  it('同一仓库 → 目录确定; 不同仓库 → 目录不同', async () => {
    const a = tempRepo()
    const b = tempRepo()
    try {
      expect(await stateDir(a)).toBe(await stateDir(a))
      expect(await stateDir(a)).not.toBe(await stateDir(b))
    } finally {
      rmSync(a, { recursive: true, force: true })
      rmSync(b, { recursive: true, force: true })
    }
  })

  it('目录在用户级状态根下、绝不在仓库内, 且含可读仓库名', async () => {
    const dir = tempRepo()
    try {
      const s = await stateDir(dir)
      expect(s.startsWith(userStateRoot())).toBe(true)
      expect(s.startsWith(dir)).toBe(false)
      expect(basename(s)).toMatch(/^gfguard-eval-/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(await stateDir(dir), { recursive: true, force: true })
    }
  })

  it('XDG_STATE_HOME 可重定向根目录(macOS/Linux)', () => {
    if (process.platform === 'win32') return
    const oldXdg = process.env.XDG_STATE_HOME
    const oldOverride = process.env.GITFLOW_GUARD_STATE_ROOT // 覆盖入口优先于 XDG, 先摘掉
    delete process.env.GITFLOW_GUARD_STATE_ROOT
    process.env.XDG_STATE_HOME = join('/tmp', 'xdg-gfguard-test')
    try {
      expect(userStateRoot()).toBe(join('/tmp', 'xdg-gfguard-test', 'gitflow-guard'))
    } finally {
      if (oldXdg === undefined) delete process.env.XDG_STATE_HOME
      else process.env.XDG_STATE_HOME = oldXdg
      if (oldOverride !== undefined) process.env.GITFLOW_GUARD_STATE_ROOT = oldOverride
    }
  })

  it('linked worktree 与主仓库共用状态目录(真实 git 集成)', async () => {
    const execFileP = promisify(execFile)
    const base = mkdtempSync(join(tmpdir(), 'gfguard-wt-'))
    const main = join(base, 'main')
    const wt = join(base, 'wt')
    mkdirSync(main, { recursive: true })
    const g = (args: string[], cwd: string) => execFileP('git', args, { cwd })
    await g(['init', '-b', 'main'], main)
    await g(['config', 'user.email', 't@example.com'], main)
    await g(['config', 'user.name', 'T'], main)
    writeFileSync(join(main, 'f.txt'), 'x')
    await g(['add', '.'], main)
    await g(['commit', '-m', 'init'], main)
    await g(['worktree', 'add', wt, '-b', 'wt-branch'], main)
    try {
      expect(await stateDir(wt)).toBe(await stateDir(main))
      // 键取主仓库根名(而非工作树名), 与文档描述一致
      expect(basename(await stateDir(wt))).toMatch(/^main-/)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})

describe('apply: 按命令实际运行的目录判定(workdir 参数 / cd / git -C, 真实 git 集成)', () => {
  // 主检出停在归档分支 main, linked worktree 停在 feature 分支; 默认配置(main=archive, mergeBy=user)。
  // 会话目录(header.cwd)只是 shell 的起点: 命令可经 workdir 参数、前导 cd 或 git -C 在另一个检出里运行,
  // 门禁必须按命令真正所在的检出判定当前分支; 多段目录不一致或无法静态确定时一律拒绝。
  type PreExecuteHandler = (exec: unknown, next: () => Promise<unknown>) => Promise<unknown>
  const execFileP = promisify(execFile)
  let base = ''
  let main = ''
  let wt = ''
  let auditDir = ''
  let handler: PreExecuteHandler | undefined
  let nextCalls = 0
  const next = async () => {
    nextCalls++
    return 'passed-through'
  }
  const run = (sessionCwd: string, args: Record<string, unknown>) => {
    nextCalls = 0
    return handler!({ name: 'bash', arguments: args, agent: { session: { header: { cwd: sessionCwd } } } }, next)
  }
  const expectAllow = async (sessionCwd: string, args: Record<string, unknown>) => {
    const res = await run(sessionCwd, args)
    expect(res).toBe('passed-through')
    expect(nextCalls).toBe(1)
  }
  const expectDeny = async (
    sessionCwd: string,
    args: Record<string, unknown>,
    reasonPattern: RegExp = /\[gitflow-guard\]/,
  ) => {
    const res = (await run(sessionCwd, args)) as { kind?: string; reason?: string } | undefined
    expect(res?.kind).toBe('deny')
    expect(res?.reason).toMatch(reasonPattern)
    expect(nextCalls).toBe(0)
  }

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'gfguard-workdir-'))
    main = join(base, 'main')
    wt = join(base, 'wt')
    mkdirSync(main, { recursive: true })
    const g = (args: string[], cwd: string) => execFileP('git', args, { cwd })
    await g(['init', '-b', 'main'], main)
    await g(['config', 'user.email', 't@example.com'], main)
    await g(['config', 'user.name', 'T'], main)
    writeFileSync(join(main, 'f.txt'), 'x')
    await g(['add', '.'], main)
    await g(['commit', '-m', 'init'], main)
    await g(['worktree', 'add', wt, '-b', 'feature/wt'], main)
    auditDir = await stateDir(main)
    const ctx = {
      on: (event: string, fn: PreExecuteHandler) => {
        if (event === 'tools/pre-execute') handler = fn
      },
    }
    apply(ctx as unknown as Context)
  })

  afterEach(() => {
    if (auditDir) rmSync(auditDir, { recursive: true, force: true })
  })

  afterAll(() => {
    if (auditDir) rmSync(auditDir, { recursive: true, force: true })
    rmSync(base, { recursive: true, force: true })
  })

  it('基线: 会话目录即命令目录 —— main 上 merge 拒绝, feature worktree 上 merge 放行', async () => {
    await expectDeny(main, { command: 'git merge develop' }, /archive/i)
    await expectAllow(wt, { command: 'git merge develop' })
  })

  it('workdir 参数: 会话在 main, 命令在 feature worktree 运行 → 放行(不再误判为 merge 进 main)', async () => {
    await expectAllow(main, { command: 'git merge develop', workdir: wt })
    // 相对 workdir 按会话目录解析
    await expectAllow(main, { command: 'git merge develop', workdir: '../wt' })
  })

  it('workdir 参数: 会话在 feature worktree, 命令在 main 运行 → 拒绝(不再被会话分支放过)', async () => {
    await expectDeny(wt, { command: 'git merge feature/wt', workdir: main }, /archive/i)
    await expectDeny(wt, { command: 'git merge feature/wt', cwd: main }, /archive/i)
  })

  it('前导 cd / pushd: 按切换后的目录判定(切 wt 放行 / 切 main 拒绝)', async () => {
    await expectAllow(main, { command: `cd ${wt} && git merge develop` })
    await expectAllow(main, { command: `pushd "${wt}" && git merge develop` })
    await expectDeny(wt, { command: `cd ${main} && git merge feature/wt` }, /archive/i)
    await expectDeny(wt, { command: 'cd .. ; cd main && git status && git merge feature/wt' }, /archive/i)
  })

  it('git -C: 按 -C 指向的目录判定(相对路径以 workdir 为起点, wt 放行 / main 拒绝)', async () => {
    await expectAllow(main, { command: `git -C ${wt} merge develop` })
    await expectDeny(wt, { command: `git -C ${main} merge feature/wt` }, /archive/i)
    await expectDeny(wt, { command: 'git -C main merge feature/wt', workdir: base }, /archive/i)
  })

  it('双向不一致(不同受门禁段落在不同目录) → 拒绝', async () => {
    // 会话在功能工作树 wt, 首段 -C <main>、次段无 -C → 拒绝
    await expectDeny(wt, { command: `git -C ${main} merge develop && git push origin feature/x` }, /different directories/i)
    // 会话在归档检出 main, 首段 -C <wt>、次段无 -C → 拒绝
    await expectDeny(main, { command: `git -C ${wt} merge develop && git merge develop` }, /different directories/i)
    // 会话在功能工作树 wt, 首段无 -C、次段 -C <main> → 拒绝
    await expectDeny(wt, { command: `git push origin feature/wt && git -C ${main} merge develop` }, /different directories/i)
    // 会话在归档检出 main, 首段 -C <wt>、次段无 -C(直推 main) → 拒绝
    await expectDeny(main, { command: `git -C ${wt} merge develop && git push origin main` }, /different directories/i)
  })

  it('同目录不误伤(多段受门禁命令均解析到同一功能工作树 wt) → 放行', async () => {
    // 会话在归档检出 main, 两段均显式指向功能工作树 wt → 放行
    await expectAllow(main, { command: `git -C ${wt} merge develop && git -C ${wt} push origin feature/wt` })
    // 会话在归档检出 main, 前导 cd <wt> 配合后续裸 git 与 git -C <wt> → 放行
    await expectAllow(main, { command: `cd ${wt} && git merge develop && git -C ${wt} push origin feature/wt` })
  })

  it('无法静态确定的步骤, 其后仍有受门禁段 → 拒绝', async () => {
    // 会话在功能工作树 wt: 不可因回退到 wt 会话目录而放行
    await expectDeny(wt, { command: 'cd $VAR && git merge develop' }, /statically determine/i)
    await expectDeny(wt, { command: 'git -C "$D" merge develop && git push origin feature/x' }, /statically determine/i)
    await expectDeny(wt, { command: `(cd ${main} && git merge develop)` }, /statically determine/i)
    // 会话在归档检出 main: 同样拒绝
    await expectDeny(main, { command: 'cd $WT && git merge develop' }, /statically determine/i)
    await expectDeny(main, { command: 'cd ~/wt && git merge develop' }, /statically determine/i)
    await expectDeny(main, { command: 'cd - && git merge develop' }, /statically determine/i)
    await expectDeny(main, { command: `(cd ${wt} && git merge develop)` }, /statically determine/i)
    await expectDeny(main, { command: `cd ${wt} || git merge develop` }, /statically determine/i)
    await expectDeny(main, { command: 'git -C "$WT" merge develop' }, /statically determine/i)
  })

  it('无法静态确定的步骤在所有受门禁段之后 → 放行(不误伤)', async () => {
    await expectAllow(wt, { command: 'git merge develop && cd $VAR' })
  })

  it('解析出的目录不在任何仓库内 → 回落到会话目录的仓库判定(拒绝而非放行)', async () => {
    await expectDeny(main, { command: 'git merge develop', workdir: join(base, 'missing') }, /archive/i)
    await expectDeny(main, { command: `cd ${join(base, 'missing')}; git merge develop` }, /archive/i)
  })

  it('多段不一致: 分号 / 换行 / || 衔接 → 拒绝(不依赖 && 链)', async () => {
    await expectDeny(wt, { command: `git -C ${main} merge develop; git push origin feature/x` }, /different directories/i)
    await expectDeny(wt, { command: `git -C ${main} merge develop\ngit push origin feature/x` }, /different directories/i)
    await expectDeny(wt, { command: `git -C ${main} merge develop || git push origin feature/x` }, /different directories/i)
  })

  it('三段(中间夹只读段): 首段与末段目录不一致 → 拒绝', async () => {
    await expectDeny(
      wt,
      { command: `git -C ${wt} merge develop && git status && git -C ${main} merge develop` },
      /different directories/i,
    )
  })

  it('子 shell / 命令组内含受门禁段且无 cd → 保守拒绝(无法静态确定)', async () => {
    await expectDeny(wt, { command: '(git merge develop)' }, /statically determine/i)
    await expectDeny(wt, { command: '(git status; git merge develop)' }, /statically determine/i)
    await expectDeny(wt, { command: '{ git merge develop; }' }, /statically determine/i)
    await expectDeny(wt, { command: '{ git status; git merge develop; }' }, /statically determine/i)
  })

  it('pushd 后经 popd 返回: popd 之后的受门禁段目录无法静态确定 → 拒绝', async () => {
    await expectDeny(
      main,
      { command: `pushd ${wt} && git merge develop && popd && git merge develop` },
      /statically determine/i,
    )
  })

  it('gh 段与 git -C 段目录不一致 → 拒绝(拒绝先于 gh 查询, 与 gh 是否可用无关)', async () => {
    await expectDeny(wt, { command: `gh pr merge 1 && git -C ${main} push origin main` }, /different directories/i)
  })

  it('候选仓库均未启用守卫 → 目录不一致 / 无法确定的命令放行(与未启用守卫的旧行为一致, 且不写审计)', async () => {
    const off = mkdtempSync(join(tmpdir(), 'gfguard-off-'))
    let offState = ''
    try {
      await execFileP('git', ['init', '-b', 'main'], { cwd: off })
      writeFileSync(join(off, 'gitflow-guard.config.json'), JSON.stringify({ enabled: false }))
      offState = await stateDir(off)
      await expectAllow(off, { command: 'cd $VAR && git push origin x' })
      await expectAllow(off, { command: 'git -C a merge x && git -C b merge y' })
      expect(existsSync(join(offState, 'audit.jsonl'))).toBe(false)
    } finally {
      if (offState) rmSync(offState, { recursive: true, force: true })
      rmSync(off, { recursive: true, force: true })
    }
  })

  it('拒绝写审计: 最后一行 event=deny 且 reason 含 different directories / statically determine', async () => {
    const auditFile = join(await stateDir(main), 'audit.jsonl')
    const lastEntry = () => {
      const lines = readFileSync(auditFile, 'utf8').trim().split('\n')
      return JSON.parse(lines[lines.length - 1]) as { event: string; reason: string; command: string }
    }
    const mismatch = `git -C ${main} merge develop && git push origin feature/x`
    await expectDeny(wt, { command: mismatch }, /different directories/i)
    expect(lastEntry()).toMatchObject({ event: 'deny', command: mismatch })
    expect(lastEntry().reason).toMatch(/different directories/i)

    await expectDeny(wt, { command: 'cd $VAR && git merge develop' }, /statically determine/i)
    expect(lastEntry()).toMatchObject({ event: 'deny', command: 'cd $VAR && git merge develop' })
    expect(lastEntry().reason).toMatch(/statically determine/i)
  })

  it('拒绝文案语言取启用守卫仓库的 config.locale(zh → 「不同目录」)', async () => {
    const cfgFile = join(main, 'gitflow-guard.config.json')
    writeFileSync(cfgFile, JSON.stringify({ locale: 'zh' }))
    try {
      // known = [main, wt]: 首个启用守卫的仓库是 main(zh)
      await expectDeny(main, { command: `git merge develop && git -C ${wt} merge develop` }, /不同目录/)
    } finally {
      rmSync(cfgFile, { force: true })
    }
  })
})
