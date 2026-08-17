import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openPermitStore } from '../src/permits'
import type { PermitStore } from '../src/permits'

function tempState(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gfguard-permits-'))
  const file = join(dir, 'state.json')
  return file
}

async function makeStore(now = 1_000_000): Promise<{ store: PermitStore; file: string; advance: (ms: number) => void }> {
  const file = tempState()
  let current = now
  const store = await openPermitStore(file, () => current)
  return { store, file, advance: (ms: number) => { current += ms } }
}

describe('permits: 特许生命周期', () => {
  it('grant 后 hasValid=true', async () => {
    const { store } = await makeStore()
    await store.grant('confirm', 'feature/dev-x-01')
    expect(store.hasValid('confirm', 'feature/dev-x-01')).toBe(true)
  })

  it('consume 一次性: 用后失效, 再次 consume 返回 null', async () => {
    const { store } = await makeStore()
    await store.grant('confirm', 'feature/dev-x-01')
    const used = await store.consume('confirm', 'feature/dev-x-01')
    expect(used).not.toBeNull()
    expect(used?.kind).toBe('confirm')
    expect(store.hasValid('confirm', 'feature/dev-x-01')).toBe(false)
    expect(await store.consume('confirm', 'feature/dev-x-01')).toBeNull()
  })

  it('过期特许不可用', async () => {
    const now = 1_000_000
    const { store } = await makeStore(now)
    await store.grant('confirm', 'feature/dev-x-01', { ttlMs: 10_000 })
    expect(store.hasValid('confirm', 'feature/dev-x-01')).toBe(true)
    // 时间前进 10 秒后过期
    expect(store.hasValid('confirm', 'feature/dev-x-01', now + 10_001)).toBe(false)
  })

  it('未设有效期 → 长期有效', async () => {
    const { store } = await makeStore()
    await store.grant('early-pr', 'feature/dev-x-01')
    expect(store.hasValid('early-pr', 'feature/dev-x-01', 99_999_999)).toBe(true)
  })

  it('过期特许 consume → null', async () => {
    const { store, advance } = await makeStore()
    await store.grant('confirm', 'feature/dev-x-01', { ttlMs: 10_000 })
    advance(10_001)
    expect(await store.consume('confirm', 'feature/dev-x-01')).toBeNull()
    expect(store.hasValid('confirm', 'feature/dev-x-01')).toBe(false)
  })

  it('同 kind/feature 重复 grant → 替换旧特许', async () => {
    const { store } = await makeStore()
    await store.grant('confirm', 'feature/dev-x-01')
    await store.grant('confirm', 'feature/dev-x-01')
    const list = store.list()
    const valid = list.filter((p) => p.kind === 'confirm' && p.feature === 'feature/dev-x-01' && !p.used)
    expect(valid.length).toBe(1)
  })

  it('kind/feature 相互独立', async () => {
    const { store } = await makeStore()
    await store.grant('early-pr', 'feature/dev-x-01')
    await store.grant('confirm', 'feature/dev-x-01')
    await store.grant('confirm', 'feature/dev-x-02')
    expect(store.hasValid('early-pr', 'feature/dev-x-01')).toBe(true)
    expect(store.hasValid('confirm', 'feature/dev-x-01')).toBe(true)
    expect(store.hasValid('confirm', 'feature/dev-x-02')).toBe(true)
    expect(store.hasValid('early-pr', 'feature/dev-x-02')).toBe(false)
  })
})

describe('permits: 持久化', () => {
  it('重新加载后数据保留(含已消费记录)', async () => {
    const file = tempState()
    const s1 = await openPermitStore(file)
    await s1.grant('confirm', 'feature/dev-x-01')
    await s1.consume('confirm', 'feature/dev-x-01')
    await s1.grant('early-pr', 'feature/dev-x-02')

    const s2 = await openPermitStore(file)
    expect(s2.hasValid('confirm', 'feature/dev-x-01')).toBe(false)
    expect(s2.hasValid('early-pr', 'feature/dev-x-02')).toBe(true)
    // 消费过的记录仍在审计列表中(used=true)
    expect(s2.list().some((p) => p.kind === 'confirm' && p.used)).toBe(true)
  })

  it('state.json 损坏 → 抛出可读错误', async () => {
    const file = tempState()
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, '{broken')
    await expect(openPermitStore(file)).rejects.toThrow(/state\.json/)
  })
})
