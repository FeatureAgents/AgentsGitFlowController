// DSH 的 @deepseek-ai/cordis 与 @deepseek-ai/dsh-tools 仅供 DSH 进程内插件场景使用;
// CLI hook / Pi 扩展 / OpenCode 插件用户不需要它们。npm 7+ 默认自动安装 peerDependencies,
// 若不把 DSH 依赖标记为 optional, CLI-only 用户会被迫安装整套 DSH。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

describe('package.json: DSH peer 依赖必须标记 optional', () => {
  it('存在 peerDependenciesMeta', () => {
    expect(pkg.peerDependenciesMeta).toBeDefined()
  })

  it('每个 peerDependency 都在 peerDependenciesMeta 中标记 optional:true', () => {
    const peers = Object.keys(pkg.peerDependencies ?? {})
    expect(peers.length).toBeGreaterThan(0)
    for (const name of peers) {
      expect(pkg.peerDependenciesMeta?.[name]?.optional).toBe(true)
    }
  })
})
