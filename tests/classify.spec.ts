import { describe, expect, it } from 'vitest'
import { classify } from '../src/classify'

/** 便捷断言: 只关心首条命令的分类 */
function first(command: string, currentBranch: string | null = 'feature/dev-x-01') {
  const result = classify(command, { currentBranch })
  expect(result.length).toBeGreaterThan(0)
  return result[0]
}

describe('classify: git push', () => {
  it('直推分支(含自定义名) → push(dst)', () => {
    expect(first('git push origin develop')).toMatchObject({ kind: 'push', dst: 'develop', force: false, delete: false })
    expect(first('git push origin main')).toMatchObject({ kind: 'push', dst: 'main' })
    expect(first('git push origin ita1')).toMatchObject({ kind: 'push', dst: 'ita1' })
    expect(first('git push -f origin prd')).toMatchObject({ kind: 'push', dst: 'prd', force: true })
  })

  it('推 feature 分支 → push(dst)', () => {
    expect(first('git push origin feature/dev-x-01')).toMatchObject({ kind: 'push', dst: 'feature/dev-x-01' })
  })

  it('单个非 flag 参数歧义(remote 或 refspec): 双解释都送分类, 门禁任一命中即拦', () => {
    const r = classify('git push origin', { currentBranch: 'feature/dev-x-01' })
    expect(r[0]).toMatchObject({ kind: 'push', dst: 'origin' }) // refspec 解释(origin 不像受保护分支则放行)
    expect(r[1]).toMatchObject({ kind: 'push', dst: null }) // 裸推解释(门禁按模拟当前分支判定)
  })

  it('HEAD 推送 → dst 延迟为 null(支持切分支串联)', () => {
    expect(first('git push origin HEAD', 'feature/dev-x-01')).toMatchObject({ kind: 'push', dst: null })
  })

  it('--delete / 冒号删除 / --all', () => {
    expect(first('git push origin --delete develop')).toMatchObject({ kind: 'push', dst: 'develop', delete: true })
    expect(first('git push origin :main')).toMatchObject({ kind: 'push', dst: 'main', delete: true })
    expect(first('git push --all origin')).toMatchObject({ kind: 'push', all: true })
  })

  it('多个 refspec → 每个都分类', () => {
    const result = classify('git push origin feature/dev-x-01 develop', { currentBranch: 'feature/dev-x-01' })
    expect(result).toHaveLength(2)
  })
})

describe('classify: git merge / branch 删除', () => {
  it('本地 merge source 解析', () => {
    expect(first('git merge feature/dev-x-01')).toMatchObject({ kind: 'local-merge', source: 'feature/dev-x-01' })
    expect(first('git merge ita1')).toMatchObject({ kind: 'local-merge', source: 'ita1' })
    expect(first('git merge')).toMatchObject({ kind: 'local-merge', source: null })
    expect(first('git merge --abort')).toMatchObject({ kind: 'other' })
  })

  it('删除分支', () => {
    expect(first('git branch -D develop')).toMatchObject({ kind: 'branch-delete', branch: 'develop' })
    expect(first('git branch')).toMatchObject({ kind: 'other' })
  })
})

describe('classify: gh pr 与 glab mr', () => {
  it('gh pr create --base → pr-create(target)', () => {
    expect(first('gh pr create --base develop --title "x"')).toMatchObject({ kind: 'pr-create', target: 'develop' })
    expect(first('gh pr create -B ita1')).toMatchObject({ kind: 'pr-create', target: 'ita1' })
    expect(first('gh pr create --title "x"')).toMatchObject({ kind: 'pr-create', target: null })
  })

  it('gh pr merge → pr-merge(pr)', () => {
    expect(first('gh pr merge 123 --merge')).toMatchObject({ kind: 'pr-merge', pr: '123' })
    expect(first('gh pr merge --merge')).toMatchObject({ kind: 'pr-merge', pr: null })
  })

  it('glab mr create --target-branch → pr-create(target)', () => {
    expect(first('glab mr create --target-branch develop')).toMatchObject({ kind: 'pr-create', target: 'develop' })
    expect(first('glab mr create --target-branch ita1')).toMatchObject({ kind: 'pr-create', target: 'ita1' })
    expect(first('glab mr create')).toMatchObject({ kind: 'pr-create', target: null })
  })

  it('glab mr merge → pr-merge(pr)', () => {
    expect(first('glab mr merge 456')).toMatchObject({ kind: 'pr-merge', pr: '456' })
  })

  it('其他 gh/glab 命令 → other', () => {
    expect(first('gh pr view 123')).toMatchObject({ kind: 'other' })
    expect(first('glab repo view')).toMatchObject({ kind: 'other' })
  })
})

describe('classify: gitflow-guard CLI(只读 status 放行, 其余 other)', () => {
  it('status → guard-cli(status)', () => {
    expect(first('gitflow-guard status')).toMatchObject({ kind: 'guard-cli', sub: 'status' })
  })
  it('permit/confirm/audit(已移除特许) → guard-cli(other)', () => {
    expect(first('gitflow-guard permit feature/x')).toMatchObject({ kind: 'guard-cli', sub: 'other' })
    expect(first('gitflow-guard confirm feature/x')).toMatchObject({ kind: 'guard-cli', sub: 'other' })
    expect(first('gitflow-guard audit')).toMatchObject({ kind: 'guard-cli', sub: 'other' })
  })
})

describe('classify: 分支切换 / 其余命令', () => {
  it('checkout 与 switch', () => {
    expect(first('git checkout develop')).toMatchObject({ kind: 'checkout', branch: 'develop' })
    expect(first('git checkout -b topic/dev-x-02')).toMatchObject({ kind: 'checkout', branch: 'topic/dev-x-02' })
    expect(first('git switch -c feature/dev-x-02')).toMatchObject({ kind: 'checkout', branch: 'feature/dev-x-02' })
    expect(first('git checkout -- src/a.ts')).toMatchObject({ kind: 'checkout', branch: null })
  })

  it.each([
    'git status',
    'git log --oneline -5',
    'git commit -m "feat: x"',
    'git fetch origin',
    'ls -la',
    'npm test',
  ])('%s → other', (cmd) => {
    expect(first(cmd)).toMatchObject({ kind: 'other' })
  })

  it('git rebase → ref-move(P1-1 收编: 受保护分支上拒绝, feature 自由)', () => {
    expect(first('git rebase develop')).toMatchObject({ kind: 'ref-move' })
  })

  it('多段命令(&&)每段都分类', () => {
    const result = classify('git checkout -b feature/dev-x-02\ngh pr create --base develop', { currentBranch: 'feature/dev-x-01' })
    expect(result).toEqual([
      { kind: 'checkout', branch: 'feature/dev-x-02' },
      { kind: 'pr-create', target: 'develop' },
    ])
  })
})
