// check-readme-equality 的行为回归测试:
// 确保仓库内全部 11 种语言的 README 维持 100% 结构对齐与对称性
import { describe, expect, it } from 'vitest'
// @ts-expect-error scripts/check-readme-equality.mjs lacks type declarations
import { checkReadmeEquality, REQUIRED_README_FILES } from '../scripts/check-readme-equality.mjs'

describe('check-readme-equality: 全量 11 语种 README 对齐校验', () => {
  it('声明必须覆盖全部 11 个语言文件', () => {
    expect(REQUIRED_README_FILES).toHaveLength(11)
  })

  it('真实仓库中的 11 个 README 具备 100% 结构对称性', () => {
    const errors: string[] = checkReadmeEquality('.')
    expect(errors).toEqual([])
  })
})
