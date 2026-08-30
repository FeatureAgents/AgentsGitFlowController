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

describe('classify: sudo 剥壳(Pi 真机 G1)', () => {
  it('sudo 剥壳后递归分类, -u 用户参数被消费', () => {
    expect(first('sudo git push origin develop')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('sudo -u root git push origin develop')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('sudo -u root -E env git push origin develop')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('sudo -- git push origin develop')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('sudo -uroot /usr/bin/git push origin develop')).toMatchObject({ kind: 'push', dst: 'develop' })
  })

  it('sudo 后无命令/其他命令 → other', () => {
    expect(first('sudo ls -la').kind).toBe('other')
    expect(first('sudo -u root').kind).toBe('other')
  })
})

describe('classify: symbolic-ref / cherry-pick / revert(Pi 真机 G2/G3)', () => {
  it('symbolic-ref 双参重定向与 --delete → ref-update(目标剥 refs/heads/ 前缀)', () => {
    expect(first('git symbolic-ref refs/heads/develop refs/heads/main')).toMatchObject({
      kind: 'ref-update', branch: 'develop', delete: false,
    })
    expect(first('git symbolic-ref --delete refs/heads/develop')).toMatchObject({
      kind: 'ref-update', branch: 'develop', delete: true,
    })
    expect(first('git symbolic-ref -d refs/heads/main')).toMatchObject({ kind: 'ref-update', branch: 'main' })
  })

  it('symbolic-ref 查询形态不改变 ref → other', () => {
    expect(first('git symbolic-ref HEAD').kind).toBe('other')
    expect(first('git symbolic-ref -q HEAD').kind).toBe('other')
    expect(first('git symbolic-ref --short HEAD').kind).toBe('other')
  })

  it('cherry-pick/revert 改写当前 tip → ref-move(多个 sha 同判)', () => {
    expect(first('git cherry-pick a1b2c3d')).toMatchObject({ kind: 'ref-move' })
    expect(first('git cherry-pick a1b2c3d e4f5g6h')).toMatchObject({ kind: 'ref-move' })
    expect(first('git revert HEAD')).toMatchObject({ kind: 'ref-move' })
    expect(first('git revert -m 1 a1b2c3d')).toMatchObject({ kind: 'ref-move' })
  })

  it('cherry-pick/revert -n/--no-commit 与恢复旗标不移动 tip → other', () => {
    expect(first('git cherry-pick -n a1b2c3d').kind).toBe('other')
    expect(first('git cherry-pick --no-commit a1b2c3d').kind).toBe('other')
    expect(first('git revert --no-commit HEAD').kind).toBe('other')
    expect(first('git cherry-pick --abort').kind).toBe('other')
    expect(first('git cherry-pick --continue').kind).toBe('other')
    expect(first('git revert --quit').kind).toBe('other')
  })
})

describe('classify: checkout -B / switch -C 强制重建(Pi 真机 G5)', () => {
  it('-B/-C(含旗标簇)产出 ref-update + checkout 两段, 受保护名送门禁', () => {
    expect(classify('git checkout -B develop')).toEqual([
      { kind: 'ref-update', branch: 'develop', delete: false },
      { kind: 'checkout', branch: 'develop' },
    ])
    expect(classify('git switch -C main')).toEqual([
      { kind: 'ref-update', branch: 'main', delete: false },
      { kind: 'checkout', branch: 'main' },
    ])
    expect(classify('git checkout -Bf develop')).toEqual([
      { kind: 'ref-update', branch: 'develop', delete: false },
      { kind: 'checkout', branch: 'develop' },
    ])
  })

  it('普通 -b/-c 保持单段 checkout(新建不移动既有 ref)', () => {
    expect(classify('git checkout -b feature/dev-x-02')).toEqual([{ kind: 'checkout', branch: 'feature/dev-x-02' }])
    expect(classify('git switch -c feature/dev-x-02')).toEqual([{ kind: 'checkout', branch: 'feature/dev-x-02' }])
    // 旗标簇仅含 b/c 也保持新建形态
    expect(classify('git checkout -bt origin/feature/dev-x-02')).toEqual([{ kind: 'checkout', branch: 'origin/feature/dev-x-02' }])
  })

  it('-B/-C 缺分支名 → 不产出 ref-update', () => {
    expect(classify('git checkout -B')).toEqual([{ kind: 'checkout', branch: null }])
    expect(classify('git switch -C --detach')).toEqual([{ kind: 'checkout', branch: null }])
  })
})

describe('classify: 嵌套展开深度上限(🟡-7)', () => {
  it('正常嵌套仍逐层展开, 内层命令被分类', () => {
    // 三层嵌套: 真实命令里 $(a $(b)) 属常见形态, 上限若被调低到 3 层以下会在此转红
    const r = classify('echo $(echo $(git push origin develop))')
    expect(r.some((c) => c.kind === 'push' && (c as { dst?: string | null }).dst === 'develop')).toBe(true)
  })

  it('病态深层嵌套不导致调用栈溢出(整条嵌套链降级为空分类)', () => {
    const depth = 5000
    const bomb = '$('.repeat(depth) + 'git push origin develop' + ')'.repeat(depth)
    expect(classify(bomb)).toEqual([])
  })

  it('超过深度上限后停止展开内层(外层照常分类, 内层不产出)', () => {
    const depth = 50
    const deep = 'echo $(git push origin develop)'
    const nested = deep.replace('$(', '$('.repeat(depth)).replace(')', ')'.repeat(depth))
    const r = classify(nested)
    // 外层 echo 仍被解析; 超限的内层 git push 不再展开
    expect(r.some((c) => c.kind === 'other')).toBe(true)
    expect(r.some((c) => c.kind === 'push')).toBe(false)
  })
})
