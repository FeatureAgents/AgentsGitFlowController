import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
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
      const auditFile = join(stateDir(dir), 'audit.jsonl') // 用户级全局目录, 不再进 .git
      expect(existsSync(auditFile)).toBe(true)
      expect(readFileSync(auditFile, 'utf8')).toContain('deny')
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(stateDir(dir), { recursive: true, force: true })
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
})

describe('apply: DSH 插件降级路径(P0-1)', () => {
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
    const exec = { name: 'bash', arguments: { command: 'git status' }, get agent(): unknown { throw new Error('boom') } }
    const next = async () => 'passed-through'
    await expect(handler!(exec, next)).resolves.toBe('passed-through')
    expect(warnings).toEqual(['gitflow-guard: gate internal error, allowed through: boom'])
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
  it('同一仓库 → 目录确定; 不同仓库 → 目录不同', () => {
    const a = tempRepo()
    const b = tempRepo()
    try {
      expect(stateDir(a)).toBe(stateDir(a))
      expect(stateDir(a)).not.toBe(stateDir(b))
    } finally {
      rmSync(a, { recursive: true, force: true })
      rmSync(b, { recursive: true, force: true })
    }
  })

  it('目录在用户级状态根下、绝不在仓库内, 且含可读仓库名', () => {
    const dir = tempRepo()
    try {
      const s = stateDir(dir)
      expect(s.startsWith(userStateRoot())).toBe(true)
      expect(s.startsWith(dir)).toBe(false)
      expect(basename(s)).toMatch(/^gfguard-eval-/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(stateDir(dir), { recursive: true, force: true })
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
})
