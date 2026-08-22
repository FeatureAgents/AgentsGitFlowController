import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evaluateCommand } from '../src/index'
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
      const auditFile = join(dir, '.git', 'gitflow-guard', 'audit.jsonl')
      expect(existsSync(auditFile)).toBe(true)
      expect(readFileSync(auditFile, 'utf8')).toContain('deny')
    } finally {
      rmSync(dir, { recursive: true, force: true })
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
