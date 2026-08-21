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