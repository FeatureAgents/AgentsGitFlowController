// CI / Release 工作流必须执行 check:readmes, 否则 11 语言 README 不对称的问题
// 只会在 npm publish 时才暴露, PR 阶段可带着不对称的 README 合并进 develop。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflows = ['.github/workflows/ci.yml', '.github/workflows/release.yml'] as const

describe('workflow: CI / Release 必须包含 check:readmes 步骤', () => {
  for (const path of workflows) {
    it(`${path} 包含 check:readmes`, () => {
      const content = readFileSync(path, 'utf8')
      expect(content).toContain('check:readmes')
    })
  }
})
