import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isWired, WIRE_CLIENTS } from '../src/wire'
import { applyWire } from '../src/wire'

function tempDir(prefix = 'gfguard-wire-') {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  mkdirSync(join(dir, '.git'), { recursive: true })
  return dir
}

describe('wire: JSON 客户端(claude/codex)幂等落位与移除', () => {
  const clients = ['claude', 'codex'] as const

  for (const client of clients) {
    it(`${client}: 首次落位 added → 二次 exists(幂等) → unwire removed → 二次 absent`, async () => {
      const dir = tempDir()
      const path = join(dir, client === 'claude' ? '.claude/settings.json' : '.codex/hooks.json')
      try {
        expect(await applyWire(client, path, false, false)).toBe('added')
        await expect(isWired(client, path)).resolves.toBe(true)
        const first = JSON.parse(readFileSync(path, 'utf8'))
        expect(first.hooks.PreToolUse).toHaveLength(1)

        expect(await applyWire(client, path, false, false)).toBe('exists')
        const second = JSON.parse(readFileSync(path, 'utf8'))
        expect(second.hooks.PreToolUse).toHaveLength(1) // 不重复

        expect(await applyWire(client, path, false, true)).toBe('exists') // dry-run 不写不报错

        expect(await applyWire(client, path, true, false)).toBe('removed')
        expect(await isWired(client, path)).toBe(false)
        expect(await applyWire(client, path, true, false)).toBe('absent')

        // 移除后保留用户的其他 hook 条目
        writeFileSync(path, JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'other-guard' }] }] }, extra: 1 }))
        expect(await applyWire(client, path, false, false)).toBe('added')
        const merged = JSON.parse(readFileSync(path, 'utf8'))
        expect(merged.extra).toBe(1)
        expect(merged.hooks.PreToolUse.map((e: { hooks: Array<{ command: string }> }) => e.hooks[0].command)).toEqual(['other-guard', expect.stringContaining('gitflow-guard')])
        expect(await applyWire(client, path, true, false)).toBe('removed')
        const after = JSON.parse(readFileSync(path, 'utf8'))
        expect(after.extra).toBe(1) // 非目标内容不动
        expect(after.hooks.PreToolUse).toHaveLength(1)
        expect(after.hooks.PreToolUse[0].hooks[0].command).toBe('other-guard')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }

  it('无效 JSON → 拒绝改动(抛英文异常)', async () => {
    const dir = tempDir()
    const path = join(dir, '.claude/settings.json')
    try {
      mkdirSync(join(dir, '.claude'), { recursive: true })
      writeFileSync(path, '{broken')
      await expect(applyWire('claude', path, false, false)).rejects.toThrow(/invalid JSON/)
      expect(readFileSync(path, 'utf8')).toBe('{broken') // 原文件未动
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('wire: antigravity 对象形态(命令须绝对路径, AGY-D2)', () => {
  it('落位为 gitflow-guard 顶层键, 命令含仓库根绝对路径; unwire 移除且不伤其他内容', async () => {
    const dir = tempDir()
    const path = join(dir, '.agents/hooks.json')
    try {
      expect(await applyWire('antigravity', path, false, false, dir)).toBe('added')
      const obj = JSON.parse(readFileSync(path, 'utf8'))
      expect(obj['gitflow-guard'].PreToolUse[0].matcher).toBe('run_command')
      expect(obj['gitflow-guard'].PreToolUse[0].hooks[0].command).toBe(`node ${join(dir, 'bin', 'gitflow-guard.mjs')} check --platform antigravity`)
      await expect(isWired('antigravity', path, dir)).resolves.toBe(true)
      expect(await applyWire('antigravity', path, false, false, dir)).toBe('exists')

      writeFileSync(path, JSON.stringify({ keep: { x: 1 }, 'gitflow-guard': { PreToolUse: [] } }) + '\n')
      expect(await applyWire('antigravity', path, false, false, dir)).toBe('added') // 已有键但空列表 → 补条目
      const merged = JSON.parse(readFileSync(path, 'utf8'))
      expect(merged.keep.x).toBe(1)
      expect(await applyWire('antigravity', path, true, false, dir)).toBe('removed')
      const after = JSON.parse(readFileSync(path, 'utf8'))
      expect(after.keep.x).toBe(1)
      expect(after['gitflow-guard']).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('全局落位(无仓库根)命令回退 PATH 上的 gitflow-guard', async () => {
    const dir = tempDir()
    const path = join(dir, '.gemini/config/hooks.json')
    try {
      expect(await applyWire('antigravity', path, false, false, null)).toBe('added')
      const obj = JSON.parse(readFileSync(path, 'utf8'))
      expect(obj['gitflow-guard'].PreToolUse[0].hooks[0].command).toBe('gitflow-guard check --platform antigravity')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('wire: OpenCode 插件(复制随包插件文件, OpenCode 1.18+ plugins 机制)', () => {
  const pluginPath = (dir: string) => join(dir, '.opencode/plugins/gitflow-guard.ts')

  it('不存在 → 复制插件; 再 wire → exists(幂等); unwire → removed; 再 unwire → absent', async () => {
    const dir = tempDir()
    const path = pluginPath(dir)
    try {
      expect(await applyWire('opencode', path, false, false)).toBe('added')
      const text = readFileSync(path, 'utf8')
      expect(text).toContain('tool.execute.before')
      expect(text).toContain('check --platform opencode')
      await expect(isWired('opencode', path)).resolves.toBe(true)

      expect(await applyWire('opencode', path, false, false)).toBe('exists')
      expect(await applyWire('opencode', path, false, true)).toBe('exists') // dry-run 不写不报错

      expect(await applyWire('opencode', path, true, false)).toBe('removed')
      expect(await isWired('opencode', path)).toBe(false)
      expect(await applyWire('opencode', path, true, false)).toBe('absent')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('unwire 只删自己的插件文件, 不伤同一目录的其他插件', async () => {
    const dir = tempDir()
    const path = pluginPath(dir)
    try {
      await applyWire('opencode', path, false, false)
      const other = join(dir, '.opencode/plugins/other-plugin.ts')
      writeFileSync(other, 'export default {}\n')
      expect(await applyWire('opencode', path, true, false)).toBe('removed')
      expect(readFileSync(other, 'utf8')).toBe('export default {}\n') // 其他插件未动
      const rest = readdirSync(join(dir, '.opencode/plugins'))
      expect(rest).toEqual(['other-plugin.ts'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('wire: 客户端规格表', () => {
  it('六客户端齐全, 文件位置与 references/*.md 一致', () => {
    const names = WIRE_CLIENTS.map((c) => c.client)
    expect(names).toEqual(['claude', 'codex', 'opencode', 'antigravity', 'dsh', 'pi'])
    const claude = WIRE_CLIENTS.find((c) => c.client === 'claude')!
    expect(claude.projectPath).toBe('.claude/settings.json')
    const codex = WIRE_CLIENTS.find((c) => c.client === 'codex')!
    expect(codex.projectPath).toBe('.codex/hooks.json')
    const opencode = WIRE_CLIENTS.find((c) => c.client === 'opencode')!
    expect(opencode.projectPath).toBe('.opencode/plugins/gitflow-guard.ts')
    const ag = WIRE_CLIENTS.find((c) => c.client === 'antigravity')!
    expect(ag.projectPath).toBe('.agents/hooks.json')
    expect(ag.experimental).toBeUndefined() // 真机核验闭环(AGY-D1..D4)后摘除实验标注
  })
})
