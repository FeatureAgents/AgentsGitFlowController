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

describe('classify: git -c 别名展开', () => {
  // 别名双解释(字面 + 展开)下任一解释命中即拦, 故按「结果中存在匹配项」断言
  const allOf = (command: string) => classify(command, { currentBranch: 'feature/dev-x-01' })
  const contains = (command: string, matcher: Record<string, unknown>) =>
    expect(allOf(command)).toContainEqual(expect.objectContaining(matcher))

  it('同命令内定义并使用别名 → 展开为真实子命令', () => {
    contains('git -c alias.z=push z origin main', { kind: 'push', dst: 'main' })
    contains('git -c alias.z=push z origin develop', { kind: 'push', dst: 'develop' })
    contains('git -c alias.z=push z -f origin main', { kind: 'push', dst: 'main', force: true })
  })

  it('别名值含空格(整段引号) → 展开后按真实命令分类', () => {
    contains('git -c "alias.p=push --force origin main" p', { kind: 'push', dst: 'main', force: true })
    contains("git -c 'alias.m=merge origin/develop' m", { kind: 'local-merge', source: 'origin/develop' })
  })

  it('别名值内的引号被剥离 → 目标分支可与配置精确比对', () => {
    contains('git -c \'alias.z=push origin "master"\' z', { kind: 'push', dst: 'master' })
    contains('git config alias.z \'push origin "master"\'', { kind: 'push', dst: 'master' })
  })

  it('无害别名 → 按真实子命令分类(断言可区分是否展开)', () => {
    // 若别名未展开则落纯 other(无 cleanWorktree / 无 branch), 以下断言即转红
    contains('git -c alias.c=commit c -m x', { kind: 'other', cleanWorktree: true })
    contains('git -c alias.co=checkout co develop', { kind: 'checkout', branch: 'develop' })
  })

  it('别名值以 ! 开头(shell 别名) → 递归分类内部命令', () => {
    contains('git -c "alias.z=!git push origin main" z', { kind: 'push', dst: 'main' })
  })

  it('shell 别名携带调用点参数 → 参数参与分类(对齐 git 的 "$@" 追加语义)', () => {
    contains('git -c "alias.z=!git push" z origin main', { kind: 'push', dst: 'main' })
    contains('git -c "alias.z=!git push $@" z origin main', { kind: 'push', dst: 'main' })
  })

  it('shell 别名内层 git 调用继承 -c 定义(GIT_CONFIG_PARAMETERS 传子进程)', () => {
    contains('git -c "alias.a=!git z" -c alias.z=push a origin main', { kind: 'push', dst: 'main' })
  })

  it('别名遮蔽内置命令 → 字面解释同样送门禁(内置优先, 任一 deny 即拦)', () => {
    contains('git -c alias.push=status push origin master', { kind: 'push', dst: 'master' })
  })

  it('无环长链正常展开(不因深度上限误伤)', () => {
    const chain = (n: number) => {
      const parts = ['git', '-c', 'alias.a1=push']
      for (let i = 2; i <= n; i++) parts.push('-c', `alias.a${i}=a${i - 1}`)
      parts.push(`a${n}`, 'origin', 'main')
      return parts.join(' ')
    }
    contains(chain(10), { kind: 'push', dst: 'main' })
    contains(chain(30), { kind: 'push', dst: 'main' })
  })

  it('别名循环引用 → 不崩溃, 环被截断, 同命令内其他别名照常展开', () => {
    contains('git -c alias.a=a a', { kind: 'other' })
    contains('git -c alias.a=b -c alias.b=a a', { kind: 'other' })
    contains('git -c alias.a=a -c alias.z=push z origin main', { kind: 'push', dst: 'main' })
  })

  it('配置键大小写不敏感(git 语义) → 同样识别', () => {
    contains('git -c ALIAS.z=push z origin main', { kind: 'push', dst: 'main' })
    contains('git -c alias.Z=push Z origin main', { kind: 'push', dst: 'main' })
    contains('git config ALIAS.z "push origin main"', { kind: 'push', dst: 'main' })
  })

  it('ANSI-C 引号($\'...\') 形态 → 同样识别', () => {
    contains("git -c $'alias.z=push origin main' z", { kind: 'push', dst: 'main' })
  })

  it('别名值两侧加引号(最常见的 shell 写法) → 同样展开', () => {
    // `git config alias.z="push origin master"` 是单个参数, git 报 invalid key 不写入别名, 故不适用
    contains('git -c alias.z="push origin master" z', { kind: 'push', dst: 'master' })
    contains('git -c alias.p="push --force" p origin master', { kind: 'push', dst: 'master', force: true })
  })

  it('别名链遮蔽内置命令 → 展开到内置命令即停, 且已得分类不丢失', () => {
    contains('git -c alias.a=push -c alias.push=status a origin master', { kind: 'push', dst: 'master' })
  })

  it('白名单外的 = 值长选项不击穿别名收集', () => {
    contains('git -c alias.z=push --exec-path=/x z origin main', { kind: 'push', dst: 'main' })
  })

  it('非 alias 的 -c 配置 → 原行为不变', () => {
    contains('git -c core.pager=cat push origin main', { kind: 'push', dst: 'main' })
  })

  it('别名值自身带全局选项(-c) → 继续解析而非落 other', () => {
    contains("git -c 'alias.z=-c alias.q=push q' z origin master", { kind: 'push', dst: 'master' })
  })

  it('ANSI-C 转义序列被解码 → 别名值判定与 shell 一致', () => {
    contains("git -c alias.z=$'push\\x20origin\\x20master' z", { kind: 'push', dst: 'master' })
  })

  it('--config-env 空格形态不遮蔽其后的子命令', () => {
    contains('git --config-env core.pager=PAGER push origin main', { kind: 'push', dst: 'main' })
  })
})

describe('classify: git config 写入别名', () => {
  it('写入危险别名 → 按别名值分类', () => {
    expect(first("git config alias.p 'push --force origin main'")).toMatchObject({ kind: 'push', dst: 'main', force: true })
    expect(first('git config --global alias.z "push origin develop"')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first("git config alias.z '!git push origin main'")).toMatchObject({ kind: 'push', dst: 'main' })
    expect(first('git config alias.m "merge origin/develop"')).toMatchObject({ kind: 'local-merge', source: 'origin/develop' })
  })

  it('取值旗标(-f / --type)不使键位错位', () => {
    expect(first('git config -f .git/config alias.z "push --force origin master"')).toMatchObject({ kind: 'push', dst: 'master', force: true })
    expect(first('git config --type bool alias.st status')).toMatchObject({ kind: 'other' })
  })

  it('无害别名按真实子命令分类, 查询 / 删除 / 非 alias 键 → other', () => {
    // 写入别名不切换分支, branch 被剥离以防后续段按被篡改的分支判定
    expect(first('git config alias.co "checkout develop"')).toMatchObject({ kind: 'checkout', branch: null })
    expect(first('git config alias.st status')).toMatchObject({ kind: 'other' })
    expect(first('git config alias.p')).toMatchObject({ kind: 'other' })
    expect(first('git config --unset alias.p')).toMatchObject({ kind: 'other' })
    expect(first('git config user.email a@b.c')).toMatchObject({ kind: 'other' })
    expect(first('git config --list')).toMatchObject({ kind: 'other' })
  })
})

describe('classify: 带外别名通道', () => {
  it('--config-env / GIT_CONFIG_KEY_n 定义别名 → 拒绝分类', () => {
    expect(first('FOO=push git --config-env=alias.z=FOO z')).toMatchObject({ kind: 'alias-smuggle' })
    expect(first('git --config-env alias.z=FOO z')).toMatchObject({ kind: 'alias-smuggle' })
    expect(first('GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.z GIT_CONFIG_VALUE_0=push git z origin main'))
      .toMatchObject({ kind: 'alias-smuggle' })
  })

  it('非 alias 的 --config-env → 不受影响', () => {
    expect(first('git --config-env=core.pager=FOO push origin main')).toMatchObject({ kind: 'push', dst: 'main' })
  })

  it('引号形态与 GIT_CONFIG_PARAMETERS → 同样拒绝', () => {
    expect(first("git --config-env='alias.z=FOO' z")).toMatchObject({ kind: 'alias-smuggle' })
    expect(first('GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0="alias.z" GIT_CONFIG_VALUE_0=push git z')).toMatchObject({ kind: 'alias-smuggle' })
    expect(first('GIT_CONFIG_PARAMETERS="\'alias.z=push origin master\'" git z')).toMatchObject({ kind: 'alias-smuggle' })
  })

  it('超长 config 别名值 → 拒绝, 不因递归爆栈而 fail-open', () => {
    const chain = Array.from({ length: 5000 }, (_, i) => `config alias.a${i}`).join(' ')
    expect(first(`git config alias.a0 ${chain} version`)).toMatchObject({ kind: 'alias-smuggle' })
  })

  it('包装器前缀(env / sudo)下的带外通道 → 同样拒绝', () => {
    expect(first("env GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.z GIT_CONFIG_VALUE_0='push origin master' git z"))
      .toMatchObject({ kind: 'alias-smuggle' })
    expect(first('sudo GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.z GIT_CONFIG_VALUE_0=push git z'))
      .toMatchObject({ kind: 'alias-smuggle' })
  })

  it('无 COUNT 的 GIT_CONFIG_KEY_n / 键位非 alias 的 PARAMETERS → 不误拦', () => {
    expect(first('GIT_CONFIG_KEY_0=alias.z git status')).toMatchObject({ kind: 'other' })
    expect(first("GIT_CONFIG_PARAMETERS=\"'core.excludesfile=/tmp/alias.txt'\" git status")).toMatchObject({ kind: 'other' })
  })

  it('shell 别名深链 → 不爆栈, 按带外通道拒绝', () => {
    const parts = ['git']
    for (let i = 0; i < 200; i++) parts.push('-c', `"alias.a${i}=!git a${i + 1}"`)
    parts.push('-c', '"alias.a200=push"', 'a0', 'origin', 'master')
    expect(classify(parts.join(' '), { currentBranch: 'feature/x' }))
      .toContainEqual(expect.objectContaining({ kind: 'alias-smuggle' }))
  })
})

describe('classify: 跨平台路径与可执行文件解析(Windows 路径与 .exe)', () => {
  it('剥离 .exe 后缀及忽略大小写', () => {
    expect(first('git.exe push origin develop')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('GIT.EXE push origin develop')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('git.cmd push origin develop')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('git.bat push origin develop')).toMatchObject({ kind: 'push', dst: 'develop' })
  })

  it('兼容 Windows 反斜杠与相对路径', () => {
    expect(first('C:\\Git\\bin\\git.exe push origin develop')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('.\\git.exe push origin develop')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('..\\bin\\git.exe checkout main')).toMatchObject({ kind: 'checkout', branch: 'main' })
  })

  it('引号包裹的 Windows 路径与正斜杠混合路径', () => {
    expect(first('"C:\\Program Files\\Git\\cmd\\git.exe" push origin develop')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first("'C:\\Program Files\\Git\\bin\\git.exe' push origin develop")).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('"C:/Program Files/Git/bin/git.exe" push origin develop')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('C:/Git/bin/git.exe push origin develop')).toMatchObject({ kind: 'push', dst: 'develop' })
  })

  it('其他 CLI 工具(.exe)同样识别', () => {
    expect(first('gh.exe pr create --base develop')).toMatchObject({ kind: 'pr-create', target: 'develop' })
    expect(first('glab.exe mr create --target-branch develop')).toMatchObject({ kind: 'pr-create', target: 'develop' })
    expect(first('gitflow-guard.exe status')).toMatchObject({ kind: 'guard-cli', sub: 'status' })
    expect(first('gitflow-guard.exe check')).toMatchObject({ kind: 'guard-cli', sub: 'other' })
  })

  it('Windows Shell 包装器(powershell / pwsh / cmd)内嵌命令分类', () => {
    expect(first('powershell -Command "git push origin develop"')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('powershell.exe -c "git push origin develop"')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('pwsh -c "git push origin develop"')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('cmd.exe /c "git push origin develop"')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('cmd /c git push origin develop')).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(first('bash -c "git push origin develop"')).toMatchObject({ kind: 'push', dst: 'develop' })
  })

  it('Shell 包装器深层嵌套达到上限后降级为 other 不爆栈', () => {
    let cmd = 'git push origin develop'
    for (let i = 0; i < 20; i++) {
      cmd = `bash -c "${cmd.replace(/"/g, '\\"')}"`
    }
    expect(first(cmd).kind).toBe('other')
  })
})

describe('classify: Shell 分隔符切分(单 &, ;, |, ||, && 与重定向保护)', () => {
  it('单个 & 后台串联: sleep 1 & git push 识别全部段', () => {
    const r = classify('sleep 1 & git push origin develop')
    expect(r).toEqual([
      { kind: 'other' },
      { kind: 'push', dst: 'develop', force: false, delete: false },
    ])
  })

  it('末尾单个 & 后台执行: 识别为目标推送而非将 & 作为 refspec', () => {
    const r = classify('git push origin develop &')
    expect(r).toEqual([
      { kind: 'push', dst: 'develop', force: false, delete: false },
    ])
  })

  it('首部 & (PowerShell 调用符形态或前导分隔符): 仍识别其后的危险命令', () => {
    const r = classify('& git push origin develop')
    expect(r).toEqual([
      { kind: 'push', dst: 'develop', force: false, delete: false },
    ])
  })

  it('无空格紧凑单 &: sleep 1&git push 依然正确切分', () => {
    const r = classify('sleep 1&git push origin develop')
    expect(r).toEqual([
      { kind: 'other' },
      { kind: 'push', dst: 'develop', force: false, delete: false },
    ])
  })

  it('多重 & 连续串联: cmd1 & cmd2 & cmd3 逐一分类', () => {
    const r = classify('sleep 1 & sleep 2 & git push origin develop')
    expect(r).toEqual([
      { kind: 'other' },
      { kind: 'other' },
      { kind: 'push', dst: 'develop', force: false, delete: false },
    ])
  })

  it('Windows cmd.exe 风格顺序串联(dir & git push)', () => {
    const r = classify('dir & git push origin develop')
    expect(r).toEqual([
      { kind: 'other' },
      { kind: 'push', dst: 'develop', force: false, delete: false },
    ])
  })

  it('重定向保护: 2>&1 与 >&2 中的 & 不作为命令切分符', () => {
    const r = classify('sleep 1 2>&1 & git push origin develop')
    expect(r).toEqual([
      { kind: 'other' },
      { kind: 'push', dst: 'develop', force: false, delete: false },
    ])
  })

  it('重定向保护: &> 与 &>> 输出重定向中的 & 不作为命令切分符', () => {
    const r = classify('sleep 1 &> /dev/null & git push origin develop')
    expect(r).toEqual([
      { kind: 'other' },
      { kind: 'push', dst: 'develop', force: false, delete: false },
    ])
  })

  it('引号保护: commit 信息中包含 & 不被错误切分', () => {
    const r = classify('git commit -m "feat: user & auth" & git push origin develop')
    expect(r).toHaveLength(2)
    expect(r[0].kind).toBe('other')
    expect(r[1]).toMatchObject({ kind: 'push', dst: 'develop' })
  })

  it('引号转义保护: 双引号内转义 \\" 后的 & 仍处于引号保护中', () => {
    const r = classify('git commit -m "message with \\"escaped quotes\\" & symbols" & git push origin develop')
    expect(r).toHaveLength(2)
    expect(r[1]).toMatchObject({ kind: 'push', dst: 'develop' })
  })

  it('转义保护: 命令行外层 \\& 转义为普通字符不作命令切分', () => {
    const r = classify('echo foo \\& git push origin develop')
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe('other')
  })
})



