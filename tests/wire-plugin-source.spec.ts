// wire 对 OpenCode 插件源文件的失败路径: 复制挂载形态(bin+lib 拷进项目、包内 opencode/ 不在场)
// 下 wire 必须报清晰指引而非静默; 只 mock node:fs/promises 的 readFile(源路径), 其余真实。
import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  type ReadFileArgs = Parameters<typeof actual.readFile>
  return {
    ...actual,
    readFile: vi.fn((...args: ReadFileArgs) => {
      // 源路径跨平台匹配: Windows 分隔符为反斜杠, 只用文件名判定
      if (String(args[0]).includes('gitflow-guard.ts')) return Promise.reject(new Error('ENOENT: no such file'))
      return actual.readFile(...args)
    }),
  }
})

import { applyWire } from '../src/wire'

describe('wire: opencode 插件源缺失(复制挂载形态)报错指引', () => {
  it('包内 opencode/ 不在场 → 拒绝并提示安装或手工复制, 不写任何文件', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gfguard-wire-src-'))
    mkdirSync(join(dir, '.git'), { recursive: true })
    const path = join(dir, '.opencode/plugins/gitflow-guard.ts')
    try {
      await expect(applyWire('opencode', path, false, false)).rejects.toThrow(/cannot read bundled opencode plugin source/)
      await expect(applyWire('opencode', path, false, false)).rejects.toThrow(/npm i -g agents-gitflow-guard/)
      await expect(applyWire('opencode', path, false, false)).rejects.toThrow(/copy opencode\/gitflow-guard\.ts/)
      expect(join(dir, '.opencode')).toBeTruthy() // 仅目录可能被建; 插件文件本身不得出现
      const { readFileSync } = await import('node:fs')
      expect(() => readFileSync(path, 'utf8')).toThrow() // 插件文件未被写入
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})