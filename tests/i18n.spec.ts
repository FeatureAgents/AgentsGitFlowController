import { describe, expect, it } from 'vitest'
import { formatDeny } from '../src/index'
import { MESSAGE_KEYS, makeT, registerLocale, resolveLocale } from '../src/i18n'
import type { Dict } from '../src/i18n'

describe('i18n: makeT / resolveLocale', () => {
  it('resolveLocale: 仅 zh 为中文, 其余一律 en', () => {
    expect(resolveLocale('zh')).toBe('zh')
    expect(resolveLocale('en')).toBe('en')
    expect(resolveLocale(undefined)).toBe('en')
    expect(resolveLocale(null)).toBe('en')
    expect(resolveLocale('fr')).toBe('en')
  })

  it('makeT 插值分支名', () => {
    expect(makeT('en')('pushProtectedDirect.why', { branch: 'develop' })).toContain('develop')
    expect(makeT('zh')('pushProtectedDirect.why', { branch: 'develop' })).toContain('develop')
  })

  it('未知 key 防御性返回原样(en 字典为兜底)', () => {
    const t = makeT('zh')
    expect(t('no.such.key')).toBe('no.such.key')
  })

  it('en/zh 同一 key 输出语言不同', () => {
    const en = makeT('en')('mergeProtected.why', { role: 'integration branch(develop)' })
    const zh = makeT('zh')('mergeProtected.why', { role: '集成分支(develop)' })
    expect(en).toContain('user')
    expect(zh).toContain('用户')
  })

  it('加载期校验异常为英文(P0-2): 键不一致的注册请求抛英文异常', () => {
    expect(() => registerLocale('broken', { 'a.b': () => 'x' } as unknown as Dict)).toThrowError(
      /locale "broken" dictionary keys mismatch the built-in "en" dictionary/,
    )
  })
})

describe('i18n: registerLocale 运行时扩展(P2-2)', () => {
  const klingonDict: Dict = Object.fromEntries(MESSAGE_KEYS.map((k) => [k, (v) => `K:${k}:${v.branch ?? ''}`]))

  it('注册后 resolveLocale/makeT 即接受该语言', () => {
    expect(() => registerLocale('klingon', klingonDict)).not.toThrow()
    expect(resolveLocale('klingon')).toBe('klingon')
    expect(makeT('klingon')('pushProtectedDirect.why', { branch: 'develop' })).toBe('K:pushProtectedDirect.why:develop')
  })

  it('未注册 locale 仍回退英文(白名单语义不因扩展而放松)', () => {
    expect(resolveLocale('klingonish')).toBe('en')
    expect(makeT('klingonish')('cli.cannotLocate')).toBe('Cannot locate a git repository')
  })

  it('重复注册覆盖同语言字典', () => {
    const v2: Dict = Object.fromEntries(MESSAGE_KEYS.map((k) => [k, () => 'v2']))
    registerLocale('klingon', v2)
    expect(makeT('klingon')('cli.cannotLocate')).toBe('v2')
  })
})

describe('i18n: formatDeny 拦截封装', () => {
  it('默认英文', () => {
    const out = formatDeny('en', 'Protected branch "develop" forbids direct push', 'Integration branch (develop) is updated via PR/MR.')
    expect(out).toContain('[gitflow-guard] blocked:')
    expect(out).toContain('Next:')
    expect(out).toContain('Protected branch "develop"')
  })

  it('zh 中文', () => {
    const out = formatDeny('zh', '受保护分支「develop」禁止直推', '集成分支(develop)由 PR/MR 合入 feature')
    expect(out).toContain('[gitflow-guard] 已拦截:')
    expect(out).toContain('下一步:')
    expect(out).toContain('受保护分支「develop」')
  })
})
