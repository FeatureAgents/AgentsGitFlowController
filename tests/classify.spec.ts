import { describe, expect, it } from 'vitest'
import { classify } from '../src/classify'

/** 便捷断言: 只关心首条命令的分类 */
function first(command: string, currentBranch: string | null = 'feature/dev-x-01') {
  const result = classify(command, { currentBranch })
  expect(result.length).toBeGreaterThan(0)
  return result[0]
}

describe('classify: git push', () => {
  it('直推基线分支 → push(base)', () => {
    expect(first('git push origin develop')).toMatchObject({ kind: 'push', dst: 'develop', force: false, delete: false })
  })

  it('直推主干分支 → push(trunk)', () => {
    expect(first('git push origin main')).toMatchObject({ kind: 'push', dst: 'main' })
  })

  it('直推预览分支 → push(preview)', () => {
    expect(first('git push origin staging')).toMatchObject({ kind: 'push', dst: 'staging' })
  })

  it('强推受保护分支(-f) → force=true', () => {
    expect(first('git push -f origin main')).toMatchObject({ kind: 'push', dst: 'main', force: true })
    expect(first('git push --force origin develop')).toMatchObject({ kind: 'push', force: true })
    expect(first('git push --force-with-lease origin develop')).toMatchObject({ kind: 'push', force: true })
  })

  it('推 feature 分支 → push(feature)', () => {
    expect(first('git push origin feature/dev-x-01')).toMatchObject({ kind: 'push', dst: 'feature/dev-x-01' })
    expect(first('git push -u origin feature/dev-x-01')).toMatchObject({ kind: 'push', dst: 'feature/dev-x-01', force: false })
  })

  it('无 refspec → dst 取当前分支', () => {
    expect(first('git push origin', 'develop')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('git push origin', null)).toMatchObject({ kind: 'push', dst: null })
  })

  it('HEAD 解析为当前分支', () => {
    expect(first('git push origin HEAD', 'feature/dev-x-01')).toMatchObject({ kind: 'push', dst: 'feature/dev-x-01' })
  })

  it('refspec 冒号形式取目标分支', () => {
    expect(first('git push origin HEAD:develop')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('git push origin HEAD:staging')).toMatchObject({ kind: 'push', dst: 'staging' })
  })

  it('多个 refspec → 每个都分类', () => {
    const result = classify('git push origin feature/dev-x-01 develop', { currentBranch: 'feature/dev-x-01' })
    expect(result).toEqual([
      { kind: 'push', dst: 'feature/dev-x-01', force: false, delete: false },
      { kind: 'push', dst: 'develop', force: false, delete: false },
    ])
  })

  it('--delete 删除受保护分支 → delete=true', () => {
    expect(first('git push origin --delete develop')).toMatchObject({ kind: 'push', dst: 'develop', delete: true })
    expect(first('git push origin :develop')).toMatchObject({ kind: 'push', dst: 'develop', delete: true })
    expect(first('git push origin -d main')).toMatchObject({ kind: 'push', dst: 'main', delete: true })
  })

  it('冒号结尾(develop:) = 删除目标分支', () => {
    expect(first('git push origin develop:')).toMatchObject({ kind: 'push', dst: 'develop', delete: true })
    expect(first('git push origin HEAD:develop:')).toMatchObject({ kind: 'push', dst: 'develop', delete: true })
  })

  it('全限定 refspec(refs/heads/) 剥离前缀', () => {
    expect(first('git push origin refs/heads/develop:refs/heads/develop')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('git push origin refs/heads/develop')).toMatchObject({ kind: 'push', dst: 'develop' })
  })

  it('--all / --mirror 标记 all=true', () => {
    expect(first('git push --all origin')).toMatchObject({ kind: 'push', dst: null, all: true })
    expect(first('git push --mirror origin')).toMatchObject({ kind: 'push', dst: null, all: true })
  })

  it('--force-with-lease= 等号形式', () => {
    expect(first('git push --force-with-lease=develop origin develop')).toMatchObject({ kind: 'push', force: true })
  })

  it('引号内的 && / 分号不拆段', () => {
    const result = classify('git commit -m "fix: a && b; c"', { currentBranch: 'feature/dev-x-01' })
    expect(result).toEqual([{ kind: 'other' }])
  })
})

describe('classify: git merge(本地合入)', () => {
  it('本地 merge 进基线', () => {
    expect(first('git merge feature/dev-x-01')).toMatchObject({ kind: 'local-merge', source: 'feature/dev-x-01' })
  })

  it('本地 merge 预览分支', () => {
    expect(first('git merge staging')).toMatchObject({ kind: 'local-merge', source: 'staging' })
  })

  it('本地 merge 主干 → source=trunk', () => {
    expect(first('git merge main')).toMatchObject({ kind: 'local-merge', source: 'main' })
  })

  it('无 source → source=null', () => {
    expect(first('git merge')).toMatchObject({ kind: 'local-merge', source: null })
  })

  it('--abort / 带 flag 的 merge', () => {
    expect(first('git merge --abort')).toMatchObject({ kind: 'other' })
    expect(first('git merge --no-ff feature/dev-x-01')).toMatchObject({ kind: 'local-merge', source: 'feature/dev-x-01' })
    expect(first('git merge -m "msg" feature/dev-x-01')).toMatchObject({ kind: 'local-merge', source: 'feature/dev-x-01' })
  })
})

describe('classify: gh pr create', () => {
  it('指向基线 → pr-create(target=base)', () => {
    expect(first('gh pr create --base develop --title "x"')).toMatchObject({ kind: 'pr-create', target: 'develop' })
    expect(first('gh pr create -B develop')).toMatchObject({ kind: 'pr-create', target: 'develop' })
  })

  it('指向主干 → pr-create(target=trunk)', () => {
    expect(first('gh pr create --base main')).toMatchObject({ kind: 'pr-create', target: 'main' })
  })

  it('指向预览 → pr-create(target=preview)', () => {
    expect(first('gh pr create --base staging')).toMatchObject({ kind: 'pr-create', target: 'staging' })
  })

  it('未指定 base → pr-create(target=null)', () => {
    expect(first('gh pr create --title "x"')).toMatchObject({ kind: 'pr-create', target: null })
  })

  it('--base= 等号形式', () => {
    expect(first('gh pr create --base=develop')).toMatchObject({ kind: 'pr-create', target: 'develop' })
  })
})

describe('classify: gh pr merge', () => {
  it('指定 PR 号 → pr-merge(pr=号码)', () => {
    expect(first('gh pr merge 123 --merge')).toMatchObject({ kind: 'pr-merge', pr: '123' })
  })

  it('未指定 PR → pr-merge(pr=null)', () => {
    expect(first('gh pr merge --merge')).toMatchObject({ kind: 'pr-merge', pr: null })
  })

  it('gh 其他命令 → other', () => {
    expect(first('gh pr create --help')).toMatchObject({ kind: 'other' })
    expect(first('gh pr view 123')).toMatchObject({ kind: 'other' })
    expect(first('gh repo sync')).toMatchObject({ kind: 'other' })
  })
})

describe('classify: 删除分支', () => {
  it('git branch -D 受保护分支 → branch-delete', () => {
    expect(first('git branch -D develop')).toMatchObject({ kind: 'branch-delete', branch: 'develop' })
    expect(first('git branch -d staging')).toMatchObject({ kind: 'branch-delete', branch: 'staging' })
  })

  it('git branch 列表 → other', () => {
    expect(first('git branch')).toMatchObject({ kind: 'other' })
  })
})

describe('classify: gitflow-guard CLI', () => {
  it('permit/confirm → guard-cli(用户终端专属)', () => {
    expect(first('gitflow-guard permit feature/dev-x-01')).toMatchObject({ kind: 'guard-cli', sub: 'permit' })
    expect(first('gitflow-guard confirm feature/dev-x-01')).toMatchObject({ kind: 'guard-cli', sub: 'confirm' })
  })

  it('status → guard-cli(status, 只读可放行)', () => {
    expect(first('gitflow-guard status')).toMatchObject({ kind: 'guard-cli', sub: 'status' })
  })

  it('未知子命令 → guard-cli(other)', () => {
    expect(first('gitflow-guard audit')).toMatchObject({ kind: 'guard-cli', sub: 'other' })
  })
})

describe('classify: 其余命令放行', () => {
  it.each([
    'git status',
    'git log --oneline -5',
    'git diff develop',
    'git commit -m "feat: x"',
    'git add src/index.ts',
    'git fetch origin',
    'git pull origin develop',
    'git checkout -b feature/dev-x-02',
    'git checkout develop',
    'git rebase develop',
    'git stash push',
    'git reset --hard HEAD~1',
    'git tag -d v1.0.0',
    'ls -la',
    'npm test',
    'pnpm build',
  ])('%s → other', (cmd) => {
    expect(first(cmd)).toMatchObject({ kind: 'other' })
  })
})

describe('classify: 多段命令(&& 串联)', () => {
  it('每段都分类', () => {
    const result = classify('git push origin feature/dev-x-01 && git push origin develop', { currentBranch: 'feature/dev-x-01' })
    expect(result).toEqual([
      { kind: 'push', dst: 'feature/dev-x-01', force: false, delete: false },
      { kind: 'push', dst: 'develop', force: false, delete: false },
    ])
  })

  it('换行/分号分隔', () => {
    const result = classify('git checkout -b feature/dev-x-02\ngh pr create --base develop', { currentBranch: 'feature/dev-x-01' })
    expect(result).toEqual([
      { kind: 'other' },
      { kind: 'pr-create', target: 'develop' },
    ])
  })
})
