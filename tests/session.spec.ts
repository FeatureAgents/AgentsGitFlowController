import { describe, expect, it } from 'vitest'
import { parseConfirmation } from '../src/session'
import type { GuardConfig } from '../src/types'

const config: GuardConfig = {
  enabled: true,
  mode: 'pr',
  branches: { base: 'develop', preview: 'staging', trunk: 'main' },
  confirm: { keywords: ['确认', 'OK', '可以', '特许'], featurePattern: 'feature/[\\w-]+' },
  ci: { enabled: true },
}

describe('session: 聊天确认解析', () => {
  it('测试通过确认 → confirm', () => {
    expect(parseConfirmation('feature/dev-x-01 测试 OK, 可以合入', config)).toEqual({
      kind: 'confirm',
      feature: 'feature/dev-x-01',
    })
  })

  it('确认关键词在前 → confirm', () => {
    expect(parseConfirmation('确认 feature/dev-x-01 已通过验证', config)).toEqual({
      kind: 'confirm',
      feature: 'feature/dev-x-01',
    })
  })

  it('提前建 PR → early-pr', () => {
    expect(parseConfirmation('feature/dev-x-01 提前建 PR 吧', config)).toEqual({
      kind: 'early-pr',
      feature: 'feature/dev-x-01',
    })
  })

  it('上主干/发布 → trunk-pr', () => {
    expect(parseConfirmation('feature/dev-x-01 可以发布上主干', config)).toEqual({
      kind: 'trunk-pr',
      feature: 'feature/dev-x-01',
    })
    expect(parseConfirmation('feature/dev-x-01 上 main 吧', config)).toEqual({
      kind: 'trunk-pr',
      feature: 'feature/dev-x-01',
    })
  })

  it('含多个 feature 名 → 取第一个', () => {
    expect(parseConfirmation('feature/dev-x-01 和 feature/dev-x-02 都确认', config)).toEqual({
      kind: 'confirm',
      feature: 'feature/dev-x-01',
    })
  })

  it('无 feature 名 → null', () => {
    expect(parseConfirmation('确认没问题', config)).toBeNull()
    expect(parseConfirmation('好了, 可以了', config)).toBeNull()
  })

  it('无关键词 → null', () => {
    expect(parseConfirmation('feature/dev-x-01 今天天气不错', config)).toBeNull()
  })

  it('自定义 featurePattern', () => {
    const cfg: GuardConfig = { ...config, confirm: { ...config.confirm, featurePattern: 'dev-\\d+' } }
    expect(parseConfirmation('dev-42 测试通过', cfg)).toEqual({ kind: 'confirm', feature: 'dev-42' })
  })

  it('大小写与英文混排', () => {
    expect(parseConfirmation('feature/dev-x-01 is OK now', config)).toEqual({
      kind: 'confirm',
      feature: 'feature/dev-x-01',
    })
  })
})
