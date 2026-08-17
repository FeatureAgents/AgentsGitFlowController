// 特许层: 一次性特许状态读写(<repo>/.git/gitflow-guard/state.json)

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Permit, PermitKind } from './types'

export interface PermitStore {
  grant(kind: PermitKind, feature: string, opts?: { ttlMs?: number }): Promise<Permit>
  /** 消费特许(一次性); 无可用特许返回 null */
  consume(kind: PermitKind, feature: string): Promise<Permit | null>
  hasValid(kind: PermitKind, feature: string, at?: number): boolean
  /** 全部记录(含已消费, 供审计) */
  list(): Permit[]
}

interface StateFile {
  version: 1
  permits: Permit[]
}

export async function openPermitStore(stateFile: string, now: () => number = Date.now): Promise<PermitStore> {
  let permits: Permit[] = []
  try {
    const text = await readFile(stateFile, 'utf8')
    const parsed = JSON.parse(text) as Partial<StateFile>
    if (!parsed || !Array.isArray(parsed.permits)) throw new Error('state.json 结构非法')
    permits = parsed.permits
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`读取 ${stateFile} 失败: ${(e as Error).message}`)
    }
  }

  async function save(): Promise<void> {
    await mkdir(dirname(stateFile), { recursive: true })
    await writeFile(stateFile, JSON.stringify({ version: 1, permits } satisfies StateFile, null, 2), 'utf8')
  }

  function findValid(kind: PermitKind, feature: string, at: number): Permit | undefined {
    return permits.find((p) => p.kind === kind && p.feature === feature && !p.used && (p.expiresAt == null || p.expiresAt > at))
  }

  return {
    async grant(kind, feature, opts) {
      // 同 kind/feature 的未使用特许直接替换, 不堆叠; 过期未使用的顺带清理
      permits = permits.filter((p) => !(p.kind === kind && p.feature === feature && !p.used))
      const at = now()
      const permit: Permit = {
        id: randomUUID(),
        kind,
        feature,
        grantedAt: at,
        ...(opts?.ttlMs != null ? { expiresAt: at + opts.ttlMs } : {}),
        used: false,
      }
      permits.push(permit)
      await save()
      return permit
    },

    async consume(kind, feature) {
      const at = now()
      const idx = permits.findIndex((p) => p.kind === kind && p.feature === feature && !p.used && (p.expiresAt == null || p.expiresAt > at))
      if (idx < 0) return null
      permits[idx] = { ...permits[idx], used: true }
      await save()
      return permits[idx]
    },

    hasValid(kind, feature, at = now()) {
      return findValid(kind, feature, at) != null
    },

    list() {
      return [...permits]
    },
  }
}
