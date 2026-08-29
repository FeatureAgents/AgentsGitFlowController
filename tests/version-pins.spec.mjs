// check-version-pins 的行为回归: 拦截逻辑必须有随仓库走的测试,
// 而不是只靠 CI 对真实仓库状态跑恒真路径(.spec.mjs 不进 tsc, 由 vitest 直接执行)
import { describe, expect, it } from 'vitest'
import { checkPins } from '../scripts/check-version-pins.mjs'

const readme = (pin) => ({ name: 'README.md', content: 'dsh plugin add agents-gitflow-guard@' + pin })

describe('check-version-pins: checkPins 行为', () => {
  it('锁定值与 package.json 版本一致 → 无错误', () => {
    const errors = checkPins('0.0.15', [
      readme('0.0.15'),
      { name: 'README.zh.md', content: 'add agents-gitflow-guard@0.0.15' },
    ])
    expect(errors).toEqual([])
  })

  it('陈旧锁定值 → 单条报错并指出期望版本', () => {
    const errors = checkPins('0.0.15', [readme('0.0.14')])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('stale pin')
    expect(errors[0]).toContain('agents-gitflow-guard@0.0.15')
  })

  it('完全未锁定版本 → 无错误', () => {
    const errors = checkPins('0.0.15', [{ name: 'README.zh.md', content: 'npm i -g agents-gitflow-guard' }])
    expect(errors).toEqual([])
  })
})
