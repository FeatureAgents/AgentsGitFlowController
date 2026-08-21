import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { currentBranch, findRepoRoot, ghPrChecks, ghPrInfo, glabMrInfo, gitRunner, isAncestor, resolvePrTarget } from '../src/repo'
import type { RunResult, Runner } from '../src/repo'
import type { GuardConfig } from '../src/types'

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
  it('currentBranch: 解析 stdout / 失败 → null', async () => {
    const { runner } = fakeRunner([{ stdout: 'feature/dev-x-01\n' }])
    expect(await currentBranch(runner, cwd)).toBe('feature/dev-x-01')
    const { runner: r2 } = fakeRunner([{ code: 128 }])
    expect(await currentBranch(r2, cwd)).toBeNull()
  })

  it('isAncestor / findRepoRoot', async () => {
    const a = fakeRunner([{ code: 0 }])
    expect(await isAncestor(a.runner, cwd, 'feature/x', 'ita1')).toBe(true)
    const r = fakeRunner([{ stdout: '/repo' }])
    expect(await findRepoRoot(r.runner, cwd)).toBe('/repo')
  })

  it('ghPrInfo / glabMrInfo: 解析 base/head', async () => {
    const gh = fakeRunner([{ stdout: '{"baseRefName":"develop","headRefName":"feature/x"}' }])
    expect(await ghPrInfo(gh.runner, cwd, '12')).toEqual({ base: 'develop', head: 'feature/x' })
    const glab = fakeRunner([{ stdout: '{"target_branch":"ita1","source_branch":"feature/x"}' }])
    expect(await glabMrInfo(glab.runner, cwd, '12')).toEqual({ base: 'ita1', head: 'feature/x' })
    const fail = fakeRunner([{ code: 1 }])
    expect(await ghPrInfo(fail.runner, cwd, '12')).toBeNull()
  })

  it('ghPrChecks: 聚合状态', async () => {
    const a = fakeRunner([{ stdout: '[{"state":"SUCCESS"},{"state":"FAILURE"}]' }])
    expect(await ghPrChecks(a.runner, cwd, '12')).toBe('FAILURE')
    const b = fakeRunner([{ stdout: '[{"state":"SUCCESS"},{"state":"PENDING"}]' }])
    expect(await ghPrChecks(b.runner, cwd, '12')).toBe('PENDING')
    expect(await ghPrChecks(b.runner, cwd, null)).toBeNull()
  })
})

describe('repo: resolvePrTarget 角色映射', () => {
  const config: GuardConfig = {
    enabled: true,
    featurePattern: 'feature/[\\w-]+',
    branches: {
      integration: { branches: ['develop'], update: 'pr' },
      preview: { branches: ['ita1'], update: 'pr' },
      production: { branches: ['prd'], update: 'pr', mergeBy: 'user' },
      archive: { branches: ['main'], update: 'pr', mergeBy: 'user' },
    },
    ci: { enabled: true },
  }

  it('integration / preview / production / archive / feature / other', () => {
    expect(resolvePrTarget({ base: 'develop', head: 'feature/x' }, config)).toEqual({ role: 'integration', target: 'develop', head: 'feature/x' })
    expect(resolvePrTarget({ base: 'ita1', head: 'feature/x' }, config)).toEqual({ role: 'preview', target: 'ita1', head: 'feature/x' })
    expect(resolvePrTarget({ base: 'prd', head: 'feature/x' }, config)).toEqual({ role: 'production', target: 'prd', head: 'feature/x' })
    expect(resolvePrTarget({ base: 'main', head: 'feature/x' }, config)).toEqual({ role: 'archive', target: 'main', head: 'feature/x' })
    expect(resolvePrTarget({ base: 'some-random', head: 'feature/x' }, config)?.role).toBe('other')
    expect(resolvePrTarget(null, config)).toBeNull()
  })
})

describe('repo: 真实 git 集成', () => {
  let repo: string

  beforeAll(async () => {
    const raw = mkdtempSync(join(tmpdir(), 'gfguard-git-'))
    await execFileP('git', ['init', '-b', 'develop', raw])
    // 以 git 的权威规范化根路径为准: macOS /tmp 符号链接(→/private/tmp)、Windows 8.3 短名(RUNNER~1→runneradmin)
    // 与 findRepoRoot 的返回拼写一致, 否则断言失败(见 AGENTS.md §7)
    repo = (await execFileP('git', ['rev-parse', '--show-toplevel'], { cwd: raw })).stdout.trim()
    await execFileP('git', ['-C', repo, 'config', 'user.email', 'test@example.com'])
    await execFileP('git', ['-C', repo, 'config', 'user.name', 'Test'])
    writeFileSync(join(repo, 'a.txt'), '1')
    await execFileP('git', ['-C', repo, 'add', '.'])
    await execFileP('git', ['-C', repo, 'commit', '-m', 'init'])
    mkdirSync(join(repo, 'sub', 'dir'), { recursive: true })
    await execFileP('git', ['-C', repo, 'checkout', '-b', 'ita1'])
    await execFileP('git', ['-C', repo, 'checkout', 'develop'])
    await execFileP('git', ['-C', repo, 'checkout', '-b', 'feature/dev-x-01'])
    writeFileSync(join(repo, 'b.txt'), '2')
    await execFileP('git', ['-C', repo, 'add', '.'])
    await execFileP('git', ['-C', repo, 'commit', '-m', 'feat'])
  })

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  it('currentBranch / findRepoRoot / isAncestor 真实返回', async () => {
    expect(await currentBranch(gitRunner, repo)).toBe('feature/dev-x-01')
    expect(await findRepoRoot(gitRunner, join(repo, 'sub', 'dir'))).toBe(repo)
    expect(await isAncestor(gitRunner, repo, 'feature/dev-x-01', 'ita1')).toBe(false)
    expect(await isAncestor(gitRunner, repo, 'develop', 'ita1')).toBe(true)
  })
})
