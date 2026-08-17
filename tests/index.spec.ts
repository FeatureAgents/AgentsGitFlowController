import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evaluateCommand } from '../src/index'
import type { RunResult, Runner } from '../src/repo'

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gfguard-eval-'))
  mkdirSync(join(dir, '.git'), { recursive: true })
  writeFileSync(
    join(dir, 'gitflow-guard.config.json'),
    JSON.stringify({
      enabled: true,
      mode: 'pr',
      branches: { base: 'develop', preview: 'staging', trunk: 'main' },
    }),
  )
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
      if (args[0] === 'merge-base') return { code: 1, stdout: '', stderr: '' }
      if (args[0] === 'pr') return { code: 1, stdout: '', stderr: '' } // gh 查询失败是正常路径
      if (args[0] === 'rev-parse') return { code: 0, stdout: '', stderr: '' }
      throw new Error(`unexpected git command: ${key}`)
    },
  }
}

describe('evaluateCommand: 集成(分类 → git 事实 → 门禁)', () => {
  it('未启用配置的项目 → skipped', async () => {
    const dir = tempRepo()
    writeFileSync(join(dir, 'gitflow-guard.config.json'), JSON.stringify({ enabled: false, branches: { base: 'develop', preview: 'staging' } }))
    try {
      const r = await evaluateCommand('git push origin develop', { repoRoot: dir, runner: scriptedRunner() })
      expect(r.outcome).toBe('skipped')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('直推基线 → deny(带引导文案)', async () => {
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

  it('普通提交 → allow', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('git commit -m "feat: x"', { repoRoot: dir, runner: scriptedRunner() })
      expect(r.outcome).toBe('allow')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('合入基线: 已合预览 + 有 P2 → allow 且返回待消费特许', async () => {
    const dir = tempRepo()
    try {
      const store = await (await import('../src/permits')).openPermitStore(join(dir, '.git', 'gitflow-guard', 'state.json'))
      await store.grant('confirm', 'feature/dev-x-01')
      const runner = scriptedRunner({
        'merge-base --is-ancestor feature/dev-x-01 staging': { code: 0 },
      })
      const r = await evaluateCommand('git merge feature/dev-x-01', {
        repoRoot: dir,
        runner,
        currentBranch: 'develop',
      })
      expect(r.outcome).toBe('allow')
      expect(r.pendingConsume).toContainEqual({ kind: 'confirm', feature: 'feature/dev-x-01' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('合入基线: 未合预览 → deny(顺序违规)', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('git merge feature/dev-x-01', {
        repoRoot: dir,
        runner: scriptedRunner(),
        currentBranch: 'develop',
      })
      expect(r.outcome).toBe('deny')
      expect(r.reason?.why).toContain('尚未合入预览')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('gh pr merge: 目标为预览(PR①) → allow, 不查询特许', async () => {
    const dir = tempRepo()
    try {
      const runner = scriptedRunner({
        'pr view 10 --json': { stdout: '{"baseRefName":"staging","headRefName":"feature/dev-x-01"}' },
      })
      const r = await evaluateCommand('gh pr merge 10', { repoRoot: dir, runner, ghRunner: runner })
      expect(r.outcome).toBe('allow')
      expect(r.pendingConsume).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('gh pr merge: 目标基线且未确认 → deny', async () => {
    const dir = tempRepo()
    try {
      const runner = scriptedRunner({
        'pr view 11 --json': { stdout: '{"baseRefName":"develop","headRefName":"feature/dev-x-01"}' },
        'merge-base --is-ancestor feature/dev-x-01 staging': { code: 0 },
      })
      const r = await evaluateCommand('gh pr merge 11', { repoRoot: dir, runner, ghRunner: runner })
      expect(r.outcome).toBe('deny')
      expect(r.reason?.why).toContain('确认')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('&& 串联: 一段违规 → 整体 deny', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('git push origin feature/dev-x-01 && git push origin develop', {
        repoRoot: dir,
        runner: scriptedRunner(),
      })
      expect(r.outcome).toBe('deny')
      expect(r.segmentCount).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('gh pr merge: 目标无法解析(gh 查询失败) → 保守按基线规则 deny', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('gh pr merge 14', {
        repoRoot: dir,
        runner: scriptedRunner(),
        ghRunner: scriptedRunner(),
        currentBranch: 'feature/dev-x-01',
      })
      expect(r.outcome).toBe('deny')
      expect(r.reason?.why).toContain('无法确认 PR 目标')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('P1: 未合预览 + early-pr 特许 → 创建基线 PR 放行并待消费', async () => {
    const dir = tempRepo()
    try {
      const store = await (await import('../src/permits')).openPermitStore(join(dir, '.git', 'gitflow-guard', 'state.json'))
      await store.grant('early-pr', 'feature/dev-x-01')
      const r = await evaluateCommand('gh pr create --base develop', {
        repoRoot: dir,
        runner: scriptedRunner(),
        currentBranch: 'feature/dev-x-01',
      })
      expect(r.outcome).toBe('allow')
      expect(r.pendingConsume).toContainEqual({ kind: 'early-pr', feature: 'feature/dev-x-01' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('P3: trunk-pr 特许 → 创建主干 PR 放行并待消费', async () => {
    const dir = tempRepo()
    try {
      const store = await (await import('../src/permits')).openPermitStore(join(dir, '.git', 'gitflow-guard', 'state.json'))
      await store.grant('trunk-pr', 'feature/dev-x-01')
      const r = await evaluateCommand('gh pr create --base main', {
        repoRoot: dir,
        runner: scriptedRunner(),
        currentBranch: 'feature/dev-x-01',
      })
      expect(r.outcome).toBe('allow')
      expect(r.pendingConsume).toContainEqual({ kind: 'trunk-pr', feature: 'feature/dev-x-01' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('多段命令全放行 → allow, segmentCount 正确', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('git add . && git commit -m "feat: x"', {
        repoRoot: dir,
        runner: scriptedRunner(),
        currentBranch: 'feature/dev-x-01',
      })
      expect(r.outcome).toBe('allow')
      expect(r.segmentCount).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('gitflow-guard permit → deny(用户专属)', async () => {
    const dir = tempRepo()
    try {
      const r = await evaluateCommand('gitflow-guard permit feature/dev-x-01', { repoRoot: dir, runner: scriptedRunner() })
      expect(r.outcome).toBe('deny')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
