import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decide, roleOfBranch } from '../src/gate'
import { evaluateCommand } from '../src/index'
import { getWorktreeStatus, getUpstreamDivergence } from '../src/repo'
import { mergeConfig, DEFAULT_CONFIG } from '../src/config'
import { makeT } from '../src/i18n'
import type { GateFacts, GuardConfig, PrTargetResolution } from '../src/types'
import type { RunResult, Runner } from '../src/repo'

function fakeRunner(map: Record<string, Partial<RunResult>>): Runner {
  return {
    async run(args) {
      const key = args.join(' ')
      const match = Object.entries(map).find(([k]) => key.startsWith(k))
      if (match) return { code: 0, stdout: '', stderr: '', ...match[1] }
      if (key === 'branch --show-current') return { code: 0, stdout: 'feature/dev-x-01\n', stderr: '' }
      if (args[0] === 'rev-parse') return { code: 0, stdout: '', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    },
  }
}

function makeConfig(over: Partial<GuardConfig> = {}): GuardConfig {
  return {
    enabled: true,
    featurePattern: 'feature/[\\w-]+',
    branches: {
      integration: { branches: ['develop'], update: 'pr' },
      preview: { branches: ['ita1'], update: 'pr' },
      production: { branches: ['prd'], update: 'pr', mergeBy: 'user' },
      archive: { branches: ['main'], update: 'pr', mergeBy: 'user' },
    },
    ci: { enabled: true },
    ...over,
  }
}

function facts(over: Partial<GateFacts> = {}): GateFacts {
  return { currentBranch: 'feature/dev-x-01', ...over }
}

function resolve(role: PrTargetResolution['role'], target: string, head?: string) {
  return () => ({ role, target, head: head ?? null }) satisfies PrTargetResolution
}

describe('worktree-guard: 1. 状态解析与采集层 (Repo Layer Facts Extraction)', () => {
  it('1.1 纯暂存区修改 (staged only: A/M/D/R/C)', async () => {
    const porcelain = ['A  new-file.ts', 'M  modified.ts', 'D  deleted.ts', 'R  old.ts -> new.ts'].join('\n')
    const runner = fakeRunner({ 'status --porcelain': { stdout: porcelain } })
    const res = await getWorktreeStatus(runner, '/fake')
    expect(res.staged).toBe(4)
    expect(res.unstaged).toBe(0)
    expect(res.untracked).toBe(0)
    expect(res.isDirty).toBe(true)
  })

  it('1.2 纯工作区未暂存修改 (unstaged only: M/D)', async () => {
    const porcelain = [' M modified.ts', ' D deleted.ts'].join('\n')
    const runner = fakeRunner({ 'status --porcelain': { stdout: porcelain } })
    const res = await getWorktreeStatus(runner, '/fake')
    expect(res.staged).toBe(0)
    expect(res.unstaged).toBe(2)
    expect(res.untracked).toBe(0)
    expect(res.isDirty).toBe(true)
  })

  it('1.3 暂存与未暂存同时存在 (staged & unstaged: MM/AD/MD)', async () => {
    const porcelain = ['MM both.ts', 'AM added-and-modified.ts'].join('\n')
    const runner = fakeRunner({ 'status --porcelain': { stdout: porcelain } })
    const res = await getWorktreeStatus(runner, '/fake')
    expect(res.staged).toBe(2)
    expect(res.unstaged).toBe(2)
    expect(res.isDirty).toBe(true)
  })

  it('1.4 纯未追踪文件 (untracked only: ??)', async () => {
    const porcelain = ['?? scratch.py', '?? notes.txt', '?? test-output/'].join('\n')
    const runner = fakeRunner({ 'status --porcelain': { stdout: porcelain } })
    const res = await getWorktreeStatus(runner, '/fake')
    expect(res.staged).toBe(0)
    expect(res.unstaged).toBe(0)
    expect(res.untracked).toBe(3)
    expect(res.isDirty).toBe(false) // 未追踪文件不计为已追踪脏改动
  })

  it('1.5 完全干净工作区', async () => {
    const runner = fakeRunner({ 'status --porcelain': { stdout: '' } })
    const res = await getWorktreeStatus(runner, '/fake')
    expect(res.staged).toBe(0)
    expect(res.unstaged).toBe(0)
    expect(res.untracked).toBe(0)
    expect(res.isDirty).toBe(false)
  })

  it('1.6 Git 状态查询异常时的 fail-safe 降级', async () => {
    const runner: Runner = {
      async run() {
        return { code: 128, stdout: '', stderr: 'fatal: not a git repo' }
      },
    }
    const res = await getWorktreeStatus(runner, '/fake')
    expect(res.isDirty).toBe(false)
    expect(res.untracked).toBe(0)
  })

  it('1.7 Upstream 偏离度解析 (ahead / behind)', async () => {
    const runner = fakeRunner({ 'rev-list --left-right': { stdout: '4\t2\n' } })
    const res = await getUpstreamDivergence(runner, '/fake')
    expect(res).toEqual({ ahead: 4, behind: 2 })
  })

  it('1.8 Upstream 不存在时解析为 null (fail-safe)', async () => {
    const runner: Runner = {
      async run() {
        return { code: 128, stdout: '', stderr: 'fatal: no upstream configured' }
      },
    }
    const res = await getUpstreamDivergence(runner, '/fake')
    expect(res).toBeNull()
  })
})

describe('worktree-guard: 2. 门禁决策层纯函数验证 (Gate Decision Rules)', () => {
  const fullWorktreeConfig = makeConfig({
    worktree: {
      requireCleanOnPr: true,
      requireCleanOnMerge: true,
      allowUntracked: true,
      requireUpstreamSynced: true,
    },
  })

  it('2.1 PR 创建: 工作区脏 → deny 并输出详细 staged/unstaged 数', () => {
    const f = facts({
      worktreeStatus: { staged: 2, unstaged: 1, untracked: 0, isDirty: true },
    })
    const res = decide({ kind: 'pr-create', target: 'develop' }, f, fullWorktreeConfig)
    expect(res.kind).toBe('deny')
    if (res.kind === 'deny') {
      expect(res.reason).toContain('2 staged, 1 unstaged')
      expect(res.next).toMatch(/git commit|git stash/i)
    }
  })

  it('2.2 PR 创建: 存在未追踪文件且 allowUntracked=false → deny', () => {
    const strictConfig = makeConfig({
      worktree: {
        requireCleanOnPr: true,
        allowUntracked: false,
      },
    })
    const f = facts({
      worktreeStatus: { staged: 0, unstaged: 0, untracked: 3, isDirty: false },
    })
    const res = decide({ kind: 'pr-create', target: 'develop' }, f, strictConfig)
    expect(res.kind).toBe('deny')
    if (res.kind === 'deny') {
      expect(res.reason).toContain('3 untracked file(s)')
      expect(res.next).toMatch(/git add|\.gitignore/i)
    }
  })

  it('2.3 PR 创建: 存在未追踪文件但 allowUntracked=true (默认) → 放行', () => {
    const permissiveConfig = makeConfig({
      worktree: {
        requireCleanOnPr: true,
        allowUntracked: true,
      },
    })
    const f = facts({
      worktreeStatus: { staged: 0, unstaged: 0, untracked: 5, isDirty: false },
    })
    expect(decide({ kind: 'pr-create', target: 'develop' }, f, permissiveConfig).kind).toBe('allow')
  })

  it('2.4 PR 创建: requireUpstreamSynced 且 behind > 0 → deny', () => {
    const f = facts({
      worktreeStatus: { staged: 0, unstaged: 0, untracked: 0, isDirty: false },
      upstreamDivergence: { ahead: 1, behind: 4 },
    })
    const res = decide({ kind: 'pr-create', target: 'develop' }, f, fullWorktreeConfig)
    expect(res.kind).toBe('deny')
    if (res.kind === 'deny') {
      expect(res.reason).toContain('4 commit(s) behind upstream')
      expect(res.next).toMatch(/git fetch && git rebase/i)
    }
  })

  it('2.5 PR 创建: upstream synced (behind = 0, ahead >= 0) → allow', () => {
    const f = facts({
      worktreeStatus: { staged: 0, unstaged: 0, untracked: 0, isDirty: false },
      upstreamDivergence: { ahead: 3, behind: 0 },
    })
    expect(decide({ kind: 'pr-create', target: 'develop' }, f, fullWorktreeConfig).kind).toBe('allow')
  })

  it('2.6 本地合并: requireCleanOnMerge 且工作区脏 → deny', () => {
    const f = facts({
      currentBranch: 'feature/dev-x-01',
      worktreeStatus: { staged: 1, unstaged: 0, untracked: 0, isDirty: true },
    })
    const res = decide({ kind: 'local-merge', source: 'develop' }, f, fullWorktreeConfig)
    expect(res.kind).toBe('deny')
  })

  it('2.7 PR 合并: requireCleanOnMerge 且工作区脏 → deny', () => {
    const f = facts({
      resolvePrTarget: resolve('integration', 'develop', 'feature/dev-x-01'),
      worktreeStatus: { staged: 0, unstaged: 1, untracked: 0, isDirty: true },
    })
    const res = decide({ kind: 'pr-merge', pr: '100' }, f, fullWorktreeConfig)
    expect(res.kind).toBe('deny')
  })

  it('2.8 推送操作不受 worktree 阻断 (开发中允许分步 push)', () => {
    const f = facts({
      worktreeStatus: { staged: 1, unstaged: 2, untracked: 3, isDirty: true },
    })
    expect(decide({ kind: 'push', dst: 'feature/dev-x-01', force: false, delete: false }, f, fullWorktreeConfig).kind).toBe('allow')
  })
})

describe('worktree-guard: 3. 复合命令序列模拟 (Compound Pipeline Simulation)', () => {
  function tempRepoWithConfig(worktreeConfig: GuardConfig['worktree']): string {
    const dir = mkdtempSync(join(tmpdir(), 'gfguard-wt-eval-'))
    mkdirSync(join(dir, '.git'), { recursive: true })
    writeFileSync(
      join(dir, 'gitflow-guard.config.json'),
      JSON.stringify({
        enabled: true,
        branches: { integration: ['develop'] },
        worktree: worktreeConfig,
      }),
    )
    return dir
  }

  it('3.1 git add . && git commit && gh pr create → 识别前序 commit 并放行', async () => {
    const dir = tempRepoWithConfig({ requireCleanOnPr: true })
    try {
      const runner = fakeRunner({
        'status --porcelain': { stdout: 'M  tracked.ts\n' },
      })
      const cmd = 'git add . && git commit -m "feat: complete" && gh pr create --base develop'
      const res = await evaluateCommand(cmd, {
        repoRoot: dir,
        runner,
        currentBranch: 'feature/dev-x-01',
      })
      expect(res.outcome).toBe('allow')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('3.2 git stash && gh pr create → 识别前序 stash 并放行', async () => {
    const dir = tempRepoWithConfig({ requireCleanOnPr: true })
    try {
      const runner = fakeRunner({
        'status --porcelain': { stdout: ' M tracked.ts\n' },
      })
      const cmd = 'git stash && gh pr create --base develop'
      const res = await evaluateCommand(cmd, {
        repoRoot: dir,
        runner,
        currentBranch: 'feature/dev-x-01',
      })
      expect(res.outcome).toBe('allow')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('3.3 git reset --hard && gh pr create → 识别前序 reset --hard 并放行', async () => {
    const dir = tempRepoWithConfig({ requireCleanOnPr: true })
    try {
      const runner = fakeRunner({
        'status --porcelain': { stdout: ' M tracked.ts\n' },
      })
      const cmd = 'git reset --hard HEAD && gh pr create --base develop'
      const res = await evaluateCommand(cmd, {
        repoRoot: dir,
        runner,
        currentBranch: 'feature/dev-x-01',
      })
      expect(res.outcome).toBe('allow')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('3.4 仅 git add . 未 commit 就发起 PR → 保持拦截', async () => {
    const dir = tempRepoWithConfig({ requireCleanOnPr: true })
    try {
      const runner = fakeRunner({
        'status --porcelain': { stdout: 'M  staged-only.ts\n' },
      })
      const cmd = 'git add . && gh pr create --base develop'
      const res = await evaluateCommand(cmd, {
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
})

describe('worktree-guard: 4. 中英双语与文案插值 (I18n Localization Tests)', () => {
  it('4.1 en 英文文案正确渲染数字插值', () => {
    const t = makeT('en')
    expect(t('denyDirtyWorktree.why', { staged: '3', unstaged: '2' })).toBe('Working tree has uncommitted changes (3 staged, 2 unstaged)')
    expect(t('denyUntrackedWorktree.why', { untracked: '4' })).toBe('Working tree has 4 untracked file(s)')
    expect(t('denyBehindUpstream.why', { behind: '5' })).toBe('Current branch is 5 commit(s) behind upstream baseline')
  })

  it('4.2 zh 中文文案正确渲染数字插值', () => {
    const t = makeT('zh')
    expect(t('denyDirtyWorktree.why', { staged: '3', unstaged: '2' })).toBe('工作区存在未提交改动(暂存区 3 项, 未暂存 2 项)')
    expect(t('denyUntrackedWorktree.why', { untracked: '4' })).toBe('工作区存在 4 个未追踪文件')
    expect(t('denyBehindUpstream.why', { behind: '5' })).toBe('当前分支落后上游基线 5 个提交')
  })
})
