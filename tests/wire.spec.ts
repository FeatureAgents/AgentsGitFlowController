import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { isWired, WIRE_CLIENTS, applyWire, guardCommand, resolveRunnerPath, wiringState } from '../src/wire'
import type { WiringState } from '../src/wire'

function tempDir(prefix = 'gfguard-wire-') {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  mkdirSync(join(dir, '.git'), { recursive: true })
  return dir
}

const RUNNER = resolveRunnerPath()
const cmdOf = guardCommand.bind(null, RUNNER) as (client: string) => string

describe('wire: runner 自锚定(BUG-REPORT-wire-runner-deployment 回归)', () => {
  it('resolveRunnerPath 指向真实存在的随包 runner(<pkg>/bin/gitflow-guard.mjs)', () => {
    expect(statSync(RUNNER).isFile()).toBe(true)
    expect(RUNNER.replace(/\\/g, '/')).toMatch(/\/bin\/gitflow-guard\.mjs$/)
  })

  it('六个 JSON 客户端命令均为绝对路径自锚定形态: node <runner> check --platform <client>', () => {
    for (const client of ['claude', 'codex', 'antigravity', 'codebuddy', 'zcode', 'cursor'] as const) {
      const cmd = cmdOf(client)
      expect(cmd).toBe(`node ${RUNNER.replace(/\\/g, '/')} check --platform ${client}`)
      expect(cmd).not.toContain('${') // 不依赖客户端变量展开
      expect(cmd.startsWith('node /') || /^[a-z]:\//i.test(cmd.slice(5))).toBe(true) // 绝对路径, 非相对 bin/...
      // 命令引用的 runner 真实存在 —— 旧实现的病灶正是"指针在、程序不在"的静默 MODULE_NOT_FOUND
      const runnerRef = cmd.slice('node '.length, cmd.indexOf(' check')).replace(/"/g, '')
      expect(existsSync(runnerRef)).toBe(true)
    }
  })

  it('guardCommand: 含空格路径加双引号, 统一正斜杠', () => {
    expect(guardCommand('C:\\a b\\bin\\gitflow-guard.mjs', 'claude')).toBe('node "C:/a b/bin/gitflow-guard.mjs" check --platform claude')
    expect(guardCommand('/opt/tools/bin/gitflow-guard.mjs', 'codex')).toBe('node /opt/tools/bin/gitflow-guard.mjs check --platform codex')
  })

  it('干净仓库(无 bin/)wire 后命令引用的 runner 真实存在且非项目内路径', async () => {
    const dir = tempDir()
    const path = join(dir, '.zcode/config.json')
    try {
      expect(await applyWire('zcode', path, false, false)).toBe('added')
      const cmd = (JSON.parse(readFileSync(path, 'utf8')) as { hooks: { events: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> } } })
        .hooks.events.PreToolUse[0].hooks[0].command
      const runnerRef = cmd.slice('node '.length, cmd.indexOf(' check')).replace(/"/g, '')
      // 命令引用的 runner 真实存在 —— 旧实现的病灶正是"指针在、程序不在"的静默 MODULE_NOT_FOUND;
      // 且 runner 不在目标项目内(自锚定执行包, 目标仓库零部署)。实弹执行验证在 verify:matrix(构建后)覆盖。
      expect(existsSync(runnerRef)).toBe(true)
      expect(runnerRef.replace(/\\/g, '/').toLowerCase()).not.toContain(dir.replace(/\\/g, '/').toLowerCase())
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('runner 缺失 → 真实写入拒绝并明确报错; dry-run 预览放行; unwire 不受影响; opencode 不依赖 runner', async () => {
    const dir = tempDir()
    const path = join(dir, '.claude/settings.json')
    try {
      await expect(applyWire('claude', path, false, false, { runnerExists: () => false })).rejects.toThrow(/runner not found/)
      expect(existsSync(path)).toBe(false)
      expect(await applyWire('claude', path, false, true, { runnerExists: () => false })).toBe('added') // dry-run 只预览不写
      expect(existsSync(path)).toBe(false)
      expect(await applyWire('claude', path, true, false, { runnerExists: () => false })).toBe('absent') // unwire 无需 runner
      expect(await applyWire('opencode', join(dir, '.opencode/plugins/gitflow-guard.ts'), false, false, { runnerExists: () => false })).toBe('added')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('wire: JSON 客户端(claude/codex/codebuddy)幂等落位与移除', () => {
  const clients = ['claude', 'codex', 'codebuddy'] as const

  for (const client of clients) {
    it(`${client}: 首次落位 added → 二次 exists(幂等) → unwire removed → 二次 absent`, async () => {
      const dir = tempDir()
      const path = join(dir, client === 'claude' ? '.claude/settings.json' : client === 'codex' ? '.codex/hooks.json' : '.codebuddy/settings.json')
      try {
        expect(await applyWire(client, path, false, false)).toBe('added')
        await expect(isWired(client, path)).resolves.toBe(true)
        const first = JSON.parse(readFileSync(path, 'utf8'))
        expect(first.hooks.PreToolUse).toHaveLength(1)
        expect(first.hooks.PreToolUse[0].hooks[0].command).toBe(cmdOf(client))

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
        expect(merged.hooks.PreToolUse.map((e: { hooks: Array<{ command: string }> }) => e.hooks[0].command)).toEqual(['other-guard', cmdOf(client)])
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

  it('isWired 遇无效 JSON → false(不误报已接线)', async () => {
    const dir = tempDir()
    const path = join(dir, '.claude/settings.json')
    try {
      mkdirSync(join(dir, '.claude'), { recursive: true })
      writeFileSync(path, '{broken')
      await expect(isWired('claude', path)).resolves.toBe(false)
      await expect(isWired('antigravity', path)).resolves.toBe(false)
      await expect(isWired('codebuddy', path)).resolves.toBe(false)
      await expect(isWired('zcode', path)).resolves.toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('wire: 旧条目迁移(任意历史形态 → 当前 canonical, 不双条并存)', () => {
  const LEGACY: Record<string, string> = {
    claude: 'node ${CLAUDE_PROJECT_DIR}/bin/gitflow-guard.mjs check --platform claude',
    codex: 'node bin/gitflow-guard.mjs check --platform codex',
    zcode: 'node ${ZCODE_PROJECT_DIR}/bin/gitflow-guard.mjs check --platform zcode',
    cursor: 'node bin/gitflow-guard.mjs check --platform cursor',
  }

  it('claude: 旧变量模板条目 → wire 迁移为 canonical(用户条目保留); unwire 只清本插件条目', async () => {
    const dir = tempDir()
    const path = join(dir, '.claude/settings.json')
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(
      path,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: LEGACY.claude }] },
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'other-guard' }] },
          ],
        },
      }),
    )
    try {
      expect(await applyWire('claude', path, false, false)).toBe('migrated')
      const obj = JSON.parse(readFileSync(path, 'utf8'))
      expect(obj.hooks.PreToolUse.map((e: { hooks: Array<{ command: string }> }) => e.hooks[0].command)).toEqual(['other-guard', cmdOf('claude')])
      // 迁移后 canonical 在位: isWired true / wiringState current
      await expect(isWired('claude', path)).resolves.toBe(true)
      await expect(wiringState('claude', path)).resolves.toBe('current')
      // unwire 移除全部本插件形态条目(含旧形态)
      expect(await applyWire('claude', path, true, false)).toBe('removed')
      const after = JSON.parse(readFileSync(path, 'utf8'))
      expect(after.hooks.PreToolUse.map((e: { hooks: Array<{ command: string }> }) => e.hooks[0].command)).toEqual(['other-guard'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('canonical 与旧条目并存(异常态) → wire 归一为单条 canonical', async () => {
    const dir = tempDir()
    const path = join(dir, '.claude/settings.json')
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(
      path,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: LEGACY.claude }] },
            { matcher: 'Bash', hooks: [{ type: 'command', command: cmdOf('claude') }] },
          ],
        },
      }),
    )
    try {
      expect(await applyWire('claude', path, false, false)).toBe('migrated')
      const obj = JSON.parse(readFileSync(path, 'utf8'))
      expect(obj.hooks.PreToolUse).toHaveLength(1)
      expect(obj.hooks.PreToolUse[0].hooks[0].command).toBe(cmdOf('claude'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('codex: 旧相对路径条目 → wire 迁移为绝对路径', async () => {
    const dir = tempDir()
    const path = join(dir, '.codex/hooks.json')
    mkdirSync(join(dir, '.codex'), { recursive: true })
    writeFileSync(path, JSON.stringify({ hooks: { PreToolUse: [{ matcher: '^Bash$', hooks: [{ type: 'command', command: LEGACY.codex }] }] } }))
    try {
      expect(await applyWire('codex', path, false, false)).toBe('migrated')
      const obj = JSON.parse(readFileSync(path, 'utf8'))
      expect(obj.hooks.PreToolUse[0].hooks[0].command).toBe(cmdOf('codex'))
      expect(await applyWire('codex', path, true, false)).toBe('removed')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('zcode: 旧模板条目(events 嵌套) → wire 迁移且 enabled 保持 true; 旧条目 unwire 移除', async () => {
    const dir = tempDir()
    const path = join(dir, '.zcode/config.json')
    mkdirSync(join(dir, '.zcode'), { recursive: true })
    writeFileSync(
      path,
      JSON.stringify({ custom: 1, hooks: { enabled: true, events: { PreToolUse: [{ matcher: '^Bash$', hooks: [{ type: 'command', command: LEGACY.zcode }] }] } } }),
    )
    try {
      await expect(wiringState('zcode', path)).resolves.toBe('legacy')
      expect(await applyWire('zcode', path, false, false)).toBe('migrated')
      const obj = JSON.parse(readFileSync(path, 'utf8'))
      expect(obj.custom).toBe(1)
      expect(obj.hooks.enabled).toBe(true)
      expect(obj.hooks.events.PreToolUse).toHaveLength(1)
      expect(obj.hooks.events.PreToolUse[0].hooks[0].command).toBe(cmdOf('zcode'))
      expect(await applyWire('zcode', path, true, false)).toBe('removed')
      expect((JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>)['hooks']).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('cursor: 旧相对路径条目(beforeShellExecution 扁平形状) → wire 迁移', async () => {
    const dir = tempDir()
    const path = join(dir, '.cursor/hooks.json')
    mkdirSync(join(dir, '.cursor'), { recursive: true })
    writeFileSync(path, JSON.stringify({ version: 1, hooks: { beforeShellExecution: [{ command: LEGACY.cursor }, { command: 'audit.sh' }] } }))
    try {
      expect(await applyWire('cursor', path, false, false)).toBe('migrated')
      const obj = JSON.parse(readFileSync(path, 'utf8'))
      expect(obj.hooks.beforeShellExecution.map((e: { command: string }) => e.command)).toEqual(['audit.sh', cmdOf('cursor')])
      expect(await applyWire('cursor', path, true, false)).toBe('removed')
      const after = JSON.parse(readFileSync(path, 'utf8'))
      expect(after.hooks.beforeShellExecution).toEqual([{ command: 'audit.sh' }])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('wiringState 三态: current / legacy / absent; 无效 JSON 视为 absent', async () => {
    const dir = tempDir()
    const path = join(dir, '.claude/settings.json')
    mkdirSync(join(dir, '.claude'), { recursive: true })
    try {
      await expect(wiringState('claude', join(dir, 'missing.json'))).resolves.toBe('absent')
      writeFileSync(path, JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: cmdOf('claude') }] }] } }))
      await expect(wiringState('claude', path)).resolves.toBe('current')
      writeFileSync(path, JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: LEGACY.claude }] }] } }))
      await expect(wiringState('claude', path)).resolves.toBe('legacy')
      await expect(isWired('claude', path)).resolves.toBe(false) // 旧形态不算已接线 → status 引导重新 wire 完成迁移
      writeFileSync(path, '{broken')
      await expect(wiringState('claude', path)).resolves.toBe('absent')
      // opencode 以插件文件存在性为准
      const plugin = join(dir, '.opencode/plugins/gitflow-guard.ts')
      await expect(wiringState('opencode', plugin)).resolves.toBe('absent')
      mkdirSync(join(dir, '.opencode', 'plugins'), { recursive: true })
      writeFileSync(plugin, '// wired')
      await expect(wiringState('opencode', plugin)).resolves.toBe('current')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('wire: zcode (events 嵌套与 enabled 开关)', () => {
  it('首次落位 added (启用 hooks.enabled 并嵌套 events.PreToolUse) → 二次 exists → unwire removed', async () => {
    const dir = tempDir()
    const path = join(dir, '.zcode/config.json')
    try {
      expect(await applyWire('zcode', path, false, false)).toBe('added')
      await expect(isWired('zcode', path)).resolves.toBe(true)
      const first = JSON.parse(readFileSync(path, 'utf8'))
      expect(first.hooks.enabled).toBe(true)
      expect(first.hooks.events.PreToolUse).toHaveLength(1)
      expect(first.hooks.events.PreToolUse[0].matcher).toBe('^Bash$')
      expect(first.hooks.events.PreToolUse[0].hooks[0].command).toBe(cmdOf('zcode'))

      expect(await applyWire('zcode', path, false, false)).toBe('exists')
      const second = JSON.parse(readFileSync(path, 'utf8'))
      expect(second.hooks.events.PreToolUse).toHaveLength(1)

      expect(await applyWire('zcode', path, true, false)).toBe('removed')
      expect(await isWired('zcode', path)).toBe(false)
      expect(await applyWire('zcode', path, true, false)).toBe('absent')

      // 保留用户其他配置和事件
      writeFileSync(path, JSON.stringify({
        custom: 'value',
        hooks: {
          enabled: true,
          events: {
            PreToolUse: [{ matcher: '^Read$', hooks: [{ type: 'command', command: 'other-tool' }] }],
            SessionStart: [{ hooks: [{ type: 'command', command: 'init-env' }] }]
          }
        }
      }))
      expect(await applyWire('zcode', path, false, false)).toBe('added')
      const merged = JSON.parse(readFileSync(path, 'utf8'))
      expect(merged.custom).toBe('value')
      expect(merged.hooks.events.SessionStart).toHaveLength(1)
      expect(merged.hooks.events.PreToolUse).toHaveLength(2)

      expect(await applyWire('zcode', path, true, false)).toBe('removed')
      const after = JSON.parse(readFileSync(path, 'utf8'))
      expect(after.custom).toBe('value')
      expect(after.hooks.events.SessionStart).toHaveLength(1)
      expect(after.hooks.events.PreToolUse).toHaveLength(1)
      expect(after.hooks.events.PreToolUse[0].matcher).toBe('^Read$')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('wire: cursor (.cursor/hooks.json 与 hooks.beforeShellExecution)', () => {
  it('首次落位 added (含 version: 1 与 hooks.beforeShellExecution) → 二次 exists → unwire removed', async () => {
    const dir = tempDir()
    const path = join(dir, '.cursor/hooks.json')
    try {
      expect(await applyWire('cursor', path, false, false)).toBe('added')
      await expect(isWired('cursor', path)).resolves.toBe(true)
      const first = JSON.parse(readFileSync(path, 'utf8'))
      expect(first.version).toBe(1)
      expect(first.hooks.beforeShellExecution).toHaveLength(1)
      expect(first.hooks.beforeShellExecution[0].command).toBe(cmdOf('cursor'))

      expect(await applyWire('cursor', path, false, false)).toBe('exists')
      const second = JSON.parse(readFileSync(path, 'utf8'))
      expect(second.hooks.beforeShellExecution).toHaveLength(1)

      expect(await applyWire('cursor', path, true, false)).toBe('removed')
      expect(await isWired('cursor', path)).toBe(false)
      expect(await applyWire('cursor', path, true, false)).toBe('absent')

      // 保留用户其他 hook 和配置
      writeFileSync(path, JSON.stringify({
        version: 1,
        hooks: {
          afterFileEdit: [{ command: 'format.sh' }],
          beforeShellExecution: [{ command: 'audit.sh' }],
        }
      }))
      expect(await applyWire('cursor', path, false, false)).toBe('added')
      const merged = JSON.parse(readFileSync(path, 'utf8'))
      expect(merged.hooks.afterFileEdit).toHaveLength(1)
      expect(merged.hooks.beforeShellExecution).toHaveLength(2)

      expect(await applyWire('cursor', path, true, false)).toBe('removed')
      const after = JSON.parse(readFileSync(path, 'utf8'))
      expect(after.hooks.afterFileEdit).toHaveLength(1)
      expect(after.hooks.beforeShellExecution).toHaveLength(1)
      expect(after.hooks.beforeShellExecution[0].command).toBe('audit.sh')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('wire: antigravity 对象形态(命令绝对路径自锚定, AGY-D2)', () => {
  it('落位为 gitflow-guard 顶层键, 命令为执行包 runner 绝对路径; unwire 移除且不伤其他内容', async () => {
    const dir = tempDir()
    const path = join(dir, '.agents/hooks.json')
    try {
      expect(await applyWire('antigravity', path, false, false)).toBe('added')
      const obj = JSON.parse(readFileSync(path, 'utf8'))
      expect(obj['gitflow-guard'].PreToolUse[0].matcher).toBe('run_command')
      expect(obj['gitflow-guard'].PreToolUse[0].hooks[0].command).toBe(cmdOf('antigravity'))
      await expect(isWired('antigravity', path)).resolves.toBe(true)
      expect(await applyWire('antigravity', path, false, false)).toBe('exists')

      writeFileSync(path, JSON.stringify({ keep: { x: 1 }, 'gitflow-guard': { PreToolUse: [] } }) + '\n')
      expect(await applyWire('antigravity', path, false, false)).toBe('added') // 已有键但空列表 → 补条目
      const merged = JSON.parse(readFileSync(path, 'utf8'))
      expect(merged.keep.x).toBe(1)
      expect(await applyWire('antigravity', path, true, false)).toBe('removed')
      const after = JSON.parse(readFileSync(path, 'utf8'))
      expect(after.keep.x).toBe(1)
      expect(after['gitflow-guard']).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('全局落位(无仓库根)同样锚定执行包 runner 绝对路径(不再依赖 PATH)', async () => {
    const dir = tempDir()
    const path = join(dir, '.gemini/config/hooks.json')
    try {
      expect(await applyWire('antigravity', path, false, false)).toBe('added')
      const obj = JSON.parse(readFileSync(path, 'utf8'))
      expect(obj['gitflow-guard'].PreToolUse[0].hooks[0].command).toBe(cmdOf('antigravity'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('旧格式(AGY-D2 仓库根形态)wire → 迁移为 canonical, 不双条并存', async () => {
    const dir = tempDir()
    const path = join(dir, '.agents/hooks.json')
    mkdirSync(join(dir, '.agents'), { recursive: true })
    const old = { 'gitflow-guard': { PreToolUse: [{ matcher: 'run_command', hooks: [{ type: 'command', command: `node ${join(dir, 'bin', 'gitflow-guard.mjs')} check --platform antigravity` }] }] } }
    writeFileSync(path, JSON.stringify(old) + '\n')
    try {
      expect(await applyWire('antigravity', path, false, false)).toBe('migrated')
      const obj = JSON.parse(readFileSync(path, 'utf8'))
      const commands = obj['gitflow-guard'].PreToolUse.map((e: { hooks: Array<{ command: string }> }) => e.hooks[0].command)
      expect(commands).toEqual([cmdOf('antigravity')])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('旧格式条目 unwire → removed(整键移除); isWired 对旧格式为 false(提示重新 wire)', async () => {
    const dir = tempDir()
    const path = join(dir, '.agents/hooks.json')
    mkdirSync(join(dir, '.agents'), { recursive: true })
    const old = { 'gitflow-guard': { PreToolUse: [{ matcher: 'run_command', hooks: [{ type: 'command', command: 'gitflow-guard check --platform antigravity' }] }] } }
    writeFileSync(path, JSON.stringify(old) + '\n')
    try {
      await expect(isWired('antigravity', path)).resolves.toBe(false)
      expect(await applyWire('antigravity', path, true, false)).toBe('removed')
      expect(JSON.parse(readFileSync(path, 'utf8'))['gitflow-guard']).toBeUndefined()
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
  it('九客户端齐全, 文件位置与 references/*.md 一致', () => {
    const names = WIRE_CLIENTS.map((c) => c.client)
    expect(names).toEqual(['claude', 'codex', 'opencode', 'antigravity', 'dsh', 'pi', 'codebuddy', 'zcode', 'cursor'])
    const claude = WIRE_CLIENTS.find((c) => c.client === 'claude')!
    expect(claude.projectPath).toBe('.claude/settings.json')
    const codex = WIRE_CLIENTS.find((c) => c.client === 'codex')!
    expect(codex.projectPath).toBe('.codex/hooks.json')
    const codebuddy = WIRE_CLIENTS.find((c) => c.client === 'codebuddy')!
    expect(codebuddy.projectPath).toBe('.codebuddy/settings.json')
    expect(codebuddy.globalPath()).toBe(join(homedir(), '.codebuddy', 'settings.json'))
    const zcode = WIRE_CLIENTS.find((c) => c.client === 'zcode')!
    expect(zcode.projectPath).toBe('.zcode/config.json')
    expect(zcode.globalPath()).toBe(join(homedir(), '.zcode', 'cli', 'config.json'))
    const cursor = WIRE_CLIENTS.find((c) => c.client === 'cursor')!
    expect(cursor.projectPath).toBe('.cursor/hooks.json')
    expect(cursor.globalPath()).toBe(join(homedir(), '.cursor', 'hooks.json'))
    const opencode = WIRE_CLIENTS.find((c) => c.client === 'opencode')!
    expect(opencode.projectPath).toBe('.opencode/plugins/gitflow-guard.ts')
    expect(opencode.globalPath()).toBe(join(homedir(), '.config', 'opencode', 'plugins', 'gitflow-guard.ts'))
    const ag = WIRE_CLIENTS.find((c) => c.client === 'antigravity')!
    expect(ag.projectPath).toBe('.agents/hooks.json')
    expect(ag.experimental).toBeUndefined() // 真机核验闭环(AGY-D1..D4)后摘除实验标注
  })
})

describe('wire: JSONC 注释与既有 hook 细粒度保留 (§16)', () => {
  it('配置文件含 JSONC 注释: wire 与 unwire 均不损坏注释与排版', async () => {
    const dir = tempDir()
    const path = join(dir, '.claude/settings.json')
    mkdirSync(join(dir, '.claude'), { recursive: true })
    const originalWithComments = `// 顶层全局配置注释
{
  /* 自定义配置块 */
  "env": {
    "FOO": "bar"
  }
}
`
    writeFileSync(path, originalWithComments)
    try {
      expect(await applyWire('claude', path, false, false)).toBe('added')
      const wiredContent = readFileSync(path, 'utf8')
      expect(wiredContent).toContain('// 顶层全局配置注释')
      expect(wiredContent).toContain('/* 自定义配置块 */')
      expect(wiredContent).toContain(cmdOf('claude'))

      expect(await isWired('claude', path)).toBe(true)

      expect(await applyWire('claude', path, true, false)).toBe('removed')
      const unwiredContent = readFileSync(path, 'utf8')
      expect(unwiredContent).toContain('// 顶层全局配置注释')
      expect(unwiredContent).toContain('/* 自定义配置块 */')
      expect(unwiredContent).not.toContain(cmdOf('claude'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('同 matcher 下已有用户自定义 hook: wire 与 unwire 均细粒度保留用户 hook', async () => {
    const dir = tempDir()
    const path = join(dir, '.codex/hooks.json')
    mkdirSync(join(dir, '.codex'), { recursive: true })
    const original = {
      hooks: {
        PreToolUse: [
          {
            matcher: '^Bash$',
            hooks: [{ type: 'command', command: 'my-custom-linter' }],
          },
        ],
      },
    }
    writeFileSync(path, JSON.stringify(original, null, 2) + '\n')
    try {
      expect(await applyWire('codex', path, false, false)).toBe('added')
      const wiredObj = JSON.parse(readFileSync(path, 'utf8'))
      // 验证用户原有 hook 仍在
      const commands = wiredObj.hooks.PreToolUse.flatMap((e: { hooks: Array<{ command: string }> }) => e.hooks.map((h) => h.command))
      expect(commands).toContain('my-custom-linter')
      expect(commands).toContain(cmdOf('codex'))

      // unwire 只移除守卫, 不移除用户自定义 linter
      expect(await applyWire('codex', path, true, false)).toBe('removed')
      const unwiredObj = JSON.parse(readFileSync(path, 'utf8'))
      expect(unwiredObj.hooks).toBeDefined()
      expect(unwiredObj.hooks.PreToolUse).toBeDefined()
      expect(unwiredObj.hooks.PreToolUse).toHaveLength(1)
      expect(unwiredObj.hooks.PreToolUse[0].hooks[0].command).toBe('my-custom-linter')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Cursor 下已有用户自定义 hook: unwire 仅移除守卫, 保留用户 hook 与 hooks 块', async () => {
    const dir = tempDir()
    const path = join(dir, '.cursor/hooks.json')
    mkdirSync(join(dir, '.cursor'), { recursive: true })
    const original = {
      version: 1,
      hooks: {
        beforeShellExecution: [
          { command: 'my-custom-guard' },
          { command: cmdOf('cursor') },
        ],
      },
    }
    writeFileSync(path, JSON.stringify(original, null, 2) + '\n')
    try {
      expect(await applyWire('cursor', path, true, false)).toBe('removed')
      const unwiredObj = JSON.parse(readFileSync(path, 'utf8'))
      expect(unwiredObj.hooks).toBeDefined()
      expect(unwiredObj.hooks.beforeShellExecution).toHaveLength(1)
      expect(unwiredObj.hooks.beforeShellExecution[0].command).toBe('my-custom-guard')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

