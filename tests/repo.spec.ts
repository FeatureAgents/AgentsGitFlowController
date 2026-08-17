import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { currentBranch, findRepoRoot, ghPrChecks, ghPrInfo, gitRunner, isAncestor, resolvePrTarget } from '../src/repo'
import type { RunResult, Runner } from '../src/repo'
import type { GuardConfig, PrTargetResolution } from '../src/types'

const execFileP = promisify(execFile)

function fakeRunner(runs: Array<Partial<RunResult>>): { runner: Runner; calls: string[][] } {
  let i = 0
  const calls: string[][] = []
  const runner: Runner = {
    async run(args, _cwd) {
      calls.push(args)
      const r = runs[Math.min(i++, runs.length - 1)]
      return { code: 0, stdout: '', stderr: '', ...r }
    },
  }
  return { runner, calls }
}

const cwd = '/fake/repo'

describe('repo: 只读查询(fake runner)', () => {
  it('currentBranch: 解析 stdout', async () => {
    const { runner } = fakeRunner([{ stdout: 'feature/dev-x-01\n' }])
    expect(await currentBranch(runner, cwd)).toBe('feature/dev-x-01')
  })

  it('currentBranch: 失败 → null', async () => {
    const { runner } = fakeRunner([{ code: 128, stderr: 'not a git repository' }])
    expect(await currentBranch(runner, cwd)).toBeNull()
  })

  it('isAncestor: 退出码 0 → true, 1 → false, 其他 → false', async () => {
    const a = fakeRunner([{ code: 0 }])
    expect(await isAncestor(a.runner, cwd, 'feature/x', 'staging')).toBe(true)
    expect(a.calls[0]).toEqual(['merge-base', '--is-ancestor', 'feature/x', 'staging'])

    const b = fakeRunner([{ code: 1 }])
    expect(await isAncestor(b.runner, cwd, 'feature/x', 'staging')).toBe(false)

    const c = fakeRunner([{ code: 128, stderr: 'unknown revision' }])
    expect(await isAncestor(c.runner, cwd, 'feature/x', 'staging')).toBe(false)
  })

  it('findRepoRoot: 解析 stdout', async () => {
    const { runner } = fakeRunner([{ stdout: '/repo/root\n' }])
    expect(await findRepoRoot(runner, cwd)).toBe('/repo/root')
  })

  it('findRepoRoot: 失败 → null', async () => {
    const { runner } = fakeRunner([{ code: 128 }])
    expect(await findRepoRoot(runner, cwd)).toBeNull()
  })

  it('ghPrInfo: 解析 JSON, 未指定 PR 时不带号码', async () => {
    const a = fakeRunner([{ stdout: '{"baseRefName":"staging","headRefName":"feature/dev-x-01"}' }])
    expect(await ghPrInfo(a.runner, cwd, '12')).toEqual({ base: 'staging', head: 'feature/dev-x-01' })
    expect(a.calls[0]).toEqual(['pr', 'view', '12', '--json', 'baseRefName,headRefName'])

    const b = fakeRunner([{ stdout: '{"baseRefName":"develop","headRefName":"feature/dev-x-01"}' }])
    await ghPrInfo(b.runner, cwd, null)
    expect(b.calls[0]).toEqual(['pr', 'view', '--json', 'baseRefName,headRefName'])
  })

  it('ghPrInfo: 失败 → null', async () => {
    const { runner } = fakeRunner([{ code: 1, stderr: 'no PR found' }])
    expect(await ghPrInfo(runner, cwd, '12')).toBeNull()
  })

  it('ghPrChecks: 聚合状态, 查不到 → null', async () => {
    const a = fakeRunner([{ stdout: '[{"state":"SUCCESS"},{"state":"SUCCESS"}]' }])
    expect(await ghPrChecks(a.runner, cwd, '12')).toBe('SUCCESS')
    expect(a.calls[0]).toEqual(['pr', 'checks', '12', '--json', 'state'])

    const b = fakeRunner([{ stdout: '[{"state":"SUCCESS"},{"state":"FAILURE"}]' }])
    expect(await ghPrChecks(b.runner, cwd, '12')).toBe('FAILURE')

    const c = fakeRunner([{ stdout: '[{"state":"SUCCESS"},{"state":"PENDING"}]' }])
    expect(await ghPrChecks(c.runner, cwd, '12')).toBe('PENDING')

    const d = fakeRunner([{ code: 1 }])
    expect(await ghPrChecks(d.runner, cwd, '12')).toBeNull()

    const e = fakeRunner([])
    expect(await ghPrChecks(e.runner, cwd, null)).toBeNull()
  })
})

describe('repo: resolvePrTarget 角色映射', () => {
  const config: GuardConfig = {
    enabled: true,
    mode: 'pr',
    branches: { base: 'develop', preview: 'staging', trunk: 'main' },
    confirm: { keywords: ['确认'], featurePattern: 'feature/[\\w-]+' },
    ci: { enabled: true },
  }

  it('base / preview / trunk / other 映射', () => {
    expect(resolvePrTarget({ base: 'develop', head: 'feature/x' }, config)).toEqual({ target: 'base', head: 'feature/x' })
    expect(resolvePrTarget({ base: 'staging', head: 'feature/x' }, config)).toEqual({ target: 'preview', head: 'feature/x' })
    expect(resolvePrTarget({ base: 'main', head: 'feature/x' }, config)).toEqual({ target: 'trunk', head: 'feature/x' })
    expect(resolvePrTarget({ base: 'other-branch', head: 'feature/x' }, config)).toEqual({ target: 'other', head: 'feature/x' })
  })
})

describe('repo: 真实 git 集成', () => {
  let repo: string

  beforeAll(async () => {
    // macOS 下 /tmp 是 /private/tmp 符号链接, git 返回真实路径, 需规范化
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'gfguard-git-')))
    await execFileP('git', ['init', '-b', 'develop', repo])
    await execFileP('git', ['-C', repo, 'config', 'user.email', 'test@example.com'])
    await execFileP('git', ['-C', repo, 'config', 'user.name', 'Test'])
    writeFileSync(join(repo, 'a.txt'), '1')
    await execFileP('git', ['-C', repo, 'add', '.'])
    await execFileP('git', ['-C', repo, 'commit', '-m', 'init'])
    mkdirSync(join(repo, 'sub', 'dir'), { recursive: true })
    // 预览分支 staging 由 develop 切出
    await execFileP('git', ['-C', repo, 'checkout', '-b', 'staging'])
    // feature 分支从 develop 切出(不含新提交)
    await execFileP('git', ['-C', repo, 'checkout', 'develop'])
    await execFileP('git', ['-C', repo, 'checkout', '-b', 'feature/dev-x-01'])
    writeFileSync(join(repo, 'b.txt'), '2')
    await execFileP('git', ['-C', repo, 'add', '.'])
    await execFileP('git', ['-C', repo, 'commit', '-m', 'feat'])
  })

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  it('currentBranch 真实返回当前分支', async () => {
    expect(await currentBranch(gitRunner, repo)).toBe('feature/dev-x-01')
  })

  it('findRepoRoot 返回仓库根', async () => {
    expect(await findRepoRoot(gitRunner, join(repo, 'sub', 'dir'))).toBe(repo)
    expect(await findRepoRoot(gitRunner, repo)).toBe(repo)
  })

  it('isAncestor: feature 尚未合入 staging → false', async () => {
    expect(await isAncestor(gitRunner, repo, 'feature/dev-x-01', 'staging')).toBe(false)
  })

  it('isAncestor: develop 是 staging 的祖先 → true', async () => {
    expect(await isAncestor(gitRunner, repo, 'develop', 'staging')).toBe(true)
  })

  it('isAncestor: 不存在的分支 → false(不抛错)', async () => {
    expect(await isAncestor(gitRunner, repo, 'feature/nope', 'staging')).toBe(false)
  })

  it('真实场景: 合入 preview 后 → true', async () => {
    // 模拟 PR①: 把 feature 合进 staging
    await execFileP('git', ['-C', repo, 'checkout', 'staging'])
    await execFileP('git', ['-C', repo, 'merge', 'feature/dev-x-01', '--no-edit'])
    expect(await isAncestor(gitRunner, repo, 'feature/dev-x-01', 'staging')).toBe(true)
  })
})
