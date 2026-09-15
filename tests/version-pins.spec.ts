// check-version-pins 的行为回归: 拦截逻辑必须有随仓库走的测试,
// 而不是只靠 CI 对真实仓库状态跑恒真路径
import { describe, expect, it } from 'vitest'
// @ts-expect-error scripts/check-version-pins.mjs lacks type declarations
import { checkLockVersions, checkPins } from '../scripts/check-version-pins.mjs'

interface FileEntry {
  name: string
  content: string
}

const readme = (pin: string): FileEntry => ({ name: 'README.md', content: 'dsh plugin add agents-gitflow-guard@' + pin })

describe('check-version-pins: checkPins 行为', () => {
  it('锁定值与 package.json 版本一致 → 无错误', () => {
    const errors: string[] = checkPins('0.0.15', [
      readme('0.0.15'),
      { name: 'README.zh.md', content: 'add agents-gitflow-guard@0.0.15' },
    ])
    expect(errors).toEqual([])
  })

  it('陈旧锁定值 → 单条报错并指出期望版本', () => {
    const errors: string[] = checkPins('0.0.15', [readme('0.0.14')])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('stale pin')
    expect(errors[0]).toContain('agents-gitflow-guard@0.0.15')
  })

  it('完全未锁定版本 → 无错误', () => {
    const errors: string[] = checkPins('0.0.15', [{ name: 'README.zh.md', content: 'npm i -g agents-gitflow-guard' }])
    expect(errors).toEqual([])
  })
})

describe('check-version-pins: package-lock 根版本一致性', () => {
  it('两处根版本均与 package.json 一致 → 无错误', () => {
    const errors: string[] = checkLockVersions('0.1.0', {
      version: '0.1.0',
      packages: { '': { version: '0.1.0' } },
    })
    expect(errors).toEqual([])
  })

  it('根版本陈旧 → 分别指出两处漂移', () => {
    const errors: string[] = checkLockVersions('0.1.0', {
      version: '0.0.50',
      packages: { '': { version: '0.0.49' } },
    })
    expect(errors).toEqual([
      'package-lock.json: root version 0.0.50 (expected 0.1.0)',
      'package-lock.json: packages[""].version 0.0.49 (expected 0.1.0)',
    ])
  })
})
