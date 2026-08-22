// 准确性审计: 刁难式命令样本 → 期望分类/门禁结果(全球用户真机命令的回归保障)
import { describe, expect, it } from 'vitest'
import { classify } from '../src/classify'
import { decide, roleOfBranch } from '../src/gate'
import { makeT } from '../src/i18n'
import type { GuardConfig } from '../src/types'

const t = makeT('en')

function config(): GuardConfig {
  return {
    enabled: true,
    featurePattern: 'feature/[\\w-]+',
    branches: {
      integration: { branches: ['develop'], update: 'pr', mergeBy: 'anyone' },
      preview: { branches: ['ita1'], update: 'pr', mergeBy: 'anyone' },
      production: { branches: ['prd'], update: 'pr', mergeBy: 'user' },
      archive: { branches: ['main'], update: 'pr', mergeBy: 'user' },
    },
    ci: { enabled: true },
    locale: 'en',
  }
}

describe('accuracy: push 解析刁难样本', () => {
  it('+ 前缀 refspec = 强推(force 必须识别)', () => {
    const c = classify('git push origin +refs/heads/feature/x:refs/heads/develop', { currentBranch: 'develop' })
    expect(c[0]).toMatchObject({ kind: 'push', dst: 'develop', force: true, delete: false })
  })

  it('--force-with-lease= 形式', () => {
    const c = classify('git push --force-with-lease=origin develop', { currentBranch: 'develop' })
    expect(c[0]).toMatchObject({ kind: 'push', dst: 'develop', force: true })
  })

  it('删除 refspec: :develop 与 develop:', () => {
    expect(classify('git push origin :develop')[0]).toMatchObject({ kind: 'push', dst: 'develop', delete: true })
    expect(classify('git push origin main:')[0]).toMatchObject({ kind: 'push', dst: 'main', delete: true })
  })

  it('HEAD:refspec 与 --all', () => {
    expect(classify('git push origin HEAD:itb1')[0]).toMatchObject({ kind: 'push', dst: 'itb1' })
    expect(classify('git push --all')[0]).toMatchObject({ kind: 'push', all: true })
  })

  it('push --tags 不是分支推送(应 other, 不误伤)', () => {
    const c = classify('git push origin --tags', { currentBranch: 'develop' })
    expect(c[0].kind).toBe('other')
  })

  it('引号内的命令文本不触发', () => {
    expect(classify('git commit -m "git push origin develop"')[0].kind).toBe('other')
  })
})

describe('accuracy: merge / branch / checkout 刁难样本', () => {
  it('--no-ff 与 -m 消息不吞 source', () => {
    expect(classify('git merge --no-ff feature/x')[0]).toMatchObject({ kind: 'local-merge', source: 'feature/x' })
    expect(classify('git merge -m "msg" feature/y')[0]).toMatchObject({ kind: 'local-merge', source: 'feature/y' })
  })

  it('merge --abort 与多个 source 保守取首', () => {
    expect(classify('git merge --abort')[0].kind).toBe('other')
    expect(classify('git merge feature/a feature/b')[0]).toMatchObject({ source: 'feature/a' })
  })

  it('checkout 文件模式/符号/命名', () => {
    expect(classify('git checkout -- file.txt')[0]).toMatchObject({ kind: 'checkout', branch: null })
    expect(classify('git checkout -')[0]).toMatchObject({ kind: 'checkout', branch: null })
    expect(classify('git checkout -b feature/x develop')[0]).toMatchObject({ kind: 'checkout', branch: 'feature/x' })
    expect(classify('git switch -c feature/y')[0]).toMatchObject({ kind: 'checkout', branch: 'feature/y' })
  })

  it('branch -D 受保护分支识别', () => {
    expect(classify('git branch -D main')[0]).toMatchObject({ kind: 'branch-delete', branch: 'main', force: true })
  })
})

describe('accuracy: 门禁判定刁难样本(集成=develop, 归档=main)', () => {
  const cfg = config()

  it('push +refspec 进 develop/main → deny(含强推措辞)', () => {
    const d = decide(classify('git push origin +refs/heads/f:refs/heads/develop')[0], { currentBranch: 'develop' }, cfg, t)
    expect(d.kind).toBe('deny')
    const d2 = decide(classify('git push --force origin main')[0], { currentBranch: 'feature/x' }, cfg, t)
    expect(d2).toMatchObject({ kind: 'deny' })
    if (d2.kind === 'deny') expect(d2.reason).toMatch(/force/i)
  })

  it('push --tags 在 develop 上不误伤', () => {
    const d = decide(classify('git push origin --tags')[0], { currentBranch: 'develop' }, cfg, t)
    expect(d.kind).toBe('allow')
  })

  it('merge 受保护分支间同步放行, feature 合入拦截', () => {
    expect(decide(classify('git merge main')[0], { currentBranch: 'develop' }, cfg, t).kind).toBe('allow')
    expect(decide(classify('git merge --no-ff feature/x')[0], { currentBranch: 'develop' }, cfg, t).kind).toBe('deny')
  })

  it('归档: 建 PR 放行(随 archive-PR 策略, #13)、合并拦截', () => {
    // 注意: 建 PR 指向 archive 放行属 0.0.9 策略(gate.spec 已覆盖); 此处只锁合并
    expect(decide(classify('gh pr merge 4')[0], {
      currentBranch: 'feature/x',
      resolvePrTarget: () => ({ role: 'archive', target: 'main', head: 'feature/x' }),
    }, cfg, t).kind).toBe('deny')
  })

  it('roleOfBranch: 正则与精确名', () => {
    expect(roleOfBranch('develop', cfg)).toBe('integration')
    expect(roleOfBranch('prd', cfg)).toBe('production')
    expect(roleOfBranch('main', cfg)).toBe('archive')
    expect(roleOfBranch('feature/z9', cfg)).toBe('feature')
    expect(roleOfBranch('topic/x', cfg)).toBe('other')
  })
})

// —— 对抗回归语料: 来自 docs/整改.md §1.1 实测(24 样本中被静默放行的部分), 逐项收编 ——
const isPushTo = (dst: string) => (c: { kind: string; dst?: string | null }) => c.kind === 'push' && c.dst === dst

describe('accuracy: 对抗语料(整改 §1.1)—— shell 包装', () => {
  const cfg = config()

  it('sh -c / bash -lc 脚本文本递归分类', () => {
    expect(classify('sh -c "git push origin develop"')[0]).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(classify('bash -lc "git push origin develop"')[0]).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(classify('sh -c "git merge feature/x"', { currentBranch: 'develop' })[0]).toMatchObject({ kind: 'local-merge', source: 'feature/x' })
  })

  it('子 shell 括号包裹', () => {
    expect(classify('(git push origin develop)')[0]).toMatchObject({ kind: 'push', dst: 'develop' })
  })

  it('绝对路径 git 取 basename 后识别', () => {
    expect(classify('/usr/bin/git push origin develop')[0]).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(classify('/opt/homebrew/bin/gh pr merge 3')[0]).toMatchObject({ kind: 'pr-merge', pr: '3' })
  })

  it('env / command / nohup / xargs / VAR=x 前缀剥壳', () => {
    for (const cmd of [
      'env git push origin develop',
      'command git push origin develop',
      'nohup git push origin develop',
      'xargs git push origin develop',
      'env LC_ALL=C.UTF-8 git push origin develop',
      'VAR=x git push origin develop',
    ]) {
      expect(classify(cmd)[0], cmd).toMatchObject({ kind: 'push', dst: 'develop' })
    }
  })

  it('反引号与 $() 内嵌命令一并送分类; 单引号内不展开(与 shell 语义一致)', () => {
    expect(classify('echo `git push origin develop`').some(isPushTo('develop'))).toBe(true)
    expect(classify('echo $(git push origin develop)').some(isPushTo('develop'))).toBe(true)
    expect(classify("echo '$(git push origin develop)'").some(isPushTo('develop'))).toBe(false)
  })

  it('|| 与 | 后半段不再失明', () => {
    expect(classify('true || git push origin develop')[1]).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(classify('echo hi | git push origin develop')[1]).toMatchObject({ kind: 'push', dst: 'develop' })
  })

  it('门禁级: 包装后的推送同样 deny; 正常用法不误伤', () => {
    for (const cmd of ['sh -c "git push origin develop"', 'env git push origin develop', '(git push origin develop)']) {
      const d = decide(classify(cmd)[0], { currentBranch: 'feature/x' }, cfg, t)
      expect(d.kind, cmd).toBe('deny')
    }
    expect(classify('git log --oneline | head -5').every((c) => c.kind === 'other')).toBe(true)
    expect(classify('git commit -m "chore: bump $(date)"').every((c) => c.kind === 'other')).toBe(true)
  })
})

describe('accuracy: 对抗语料(整改 §1.1)—— git 全局选项', () => {
  it('子命令前的全局选项剥离后再取子命令', () => {
    expect(classify('git -C . push origin develop')[0]).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(classify('git --git-dir=.git push origin develop')[0]).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(classify('git --work-tree . push origin develop')[0]).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(classify('git -c core.hooksPath=/dev/null push origin develop')[0]).toMatchObject({ kind: 'push', dst: 'develop' })
  })

  it('全局选项不影响无选项命令; 非全局的 flag 仍判 other', () => {
    expect(classify('git push origin feature/x')[0]).toMatchObject({ kind: 'push', dst: 'feature/x' })
    expect(classify('git status --short')[0].kind).toBe('other')
  })
})

describe('accuracy: 对抗语料(整改 §1.1)—— git 形态第二批(通配/pull/plumbing)', () => {
  const cfg = config()

  it('通配 refspec 视为推送全部分支, 按 --all 同级拦截', () => {
    const c = classify('git push origin refs/heads/*:refs/heads/*')[0]
    expect(c).toMatchObject({ kind: 'push', all: true })
    expect(decide(c, { currentBranch: 'feature/x' }, cfg, t).kind).toBe('deny')
    expect(classify('git push origin +refs/heads/*:refs/heads/*')[0]).toMatchObject({ kind: 'push', all: true })
    expect(classify('git push origin "refs/heads/feature/*:refs/heads/feature/*"')[0]).toMatchObject({ kind: 'push', all: true })
  })

  it('git pull = fetch+merge: refspec 目标走本地合入门禁(source 是远端分支名)', () => {
    expect(classify('git pull origin feature/x')[0]).toMatchObject({ kind: 'local-merge', source: 'feature/x' })
    expect(classify('git pull --rebase origin feature/x')[0]).toMatchObject({ kind: 'local-merge', source: 'feature/x' })
    expect(decide(classify('git pull origin feature/x')[0], { currentBranch: 'develop' }, cfg, t).kind).toBe('deny')
    // 无参 / 仅 remote: 同步上游语义(source null), 门禁放行
    expect(classify('git pull')[0]).toMatchObject({ kind: 'local-merge', source: null })
    expect(classify('git pull origin')[0]).toMatchObject({ kind: 'local-merge', source: null })
    expect(decide(classify('git pull origin')[0], { currentBranch: 'feature/x' }, cfg, t).kind).toBe('allow')
  })

  it('plumbing 收编: send-pack 按推送语义分类', () => {
    expect(classify('git send-pack host:path refs/heads/f:refs/heads/develop')[0]).toMatchObject({ kind: 'push', dst: 'develop' })
    expect(classify('git send-pack --all host:path')[0]).toMatchObject({ kind: 'push', all: true })
    expect(decide(classify('git send-pack host:path refs/heads/main:refs/heads/main')[0], { currentBranch: 'feature/x' }, cfg, t).kind).toBe('deny')
    expect(classify('git send-pack host:path')[0].kind).toBe('other')
  })

  it('plumbing 收编: update-ref 直改受保护分支 refs 一律拒绝', () => {
    const c = classify('git update-ref refs/heads/develop HEAD')[0]
    expect(c).toMatchObject({ kind: 'ref-update', branch: 'develop', delete: false })
    expect(decide(c, { currentBranch: 'feature/x' }, cfg, t).kind).toBe('deny')
    const d = classify('git update-ref -d refs/heads/main')[0]
    expect(d).toMatchObject({ kind: 'ref-update', branch: 'main', delete: true })
    expect(decide(d, { currentBranch: 'feature/x' }, cfg, t).kind).toBe('deny')
    // feature 分支的 ref 更新放行
    expect(decide(classify('git update-ref refs/heads/feature/x HEAD')[0], { currentBranch: 'feature/x' }, cfg, t).kind).toBe('allow')
  })

  it('裸推/HEAD 的 dst 延迟解析: 切到受保护分支后裸推按模拟分支判定', () => {
    expect(classify('git switch develop && git push', { currentBranch: 'feature/x' })[1]).toMatchObject({ kind: 'push', dst: null })
    expect(decide({ kind: 'push', dst: null, force: false, delete: false }, { currentBranch: 'develop' }, cfg, t).kind).toBe('deny')
    expect(decide({ kind: 'push', dst: null, force: false, delete: false }, { currentBranch: 'feature/x' }, cfg, t).kind).toBe('allow')
  })
})