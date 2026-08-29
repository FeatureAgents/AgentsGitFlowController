import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main } from '../src/cli'
import { stateDir } from '../src/index'
import { MESSAGE_KEYS, registerLocale } from '../src/i18n'
import type { Dict } from '../src/i18n'
import type { Runner } from '../src/repo'

function tempRepo(extra: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'gfguard-cli-'))
  mkdirSync(join(dir, '.git'), { recursive: true })
  writeFileSync(
    join(dir, 'gitflow-guard.config.json'),
    JSON.stringify({
      enabled: true,
      featurePattern: 'feature/[\\w-]+',
      branches: { integration: ['develop'], preview: ['ita1'], archive: ['main'] },
      ...extra,
    }),
  )
  return dir
}

function scriptedRunner(): Runner {
  return {
    async run(args) {
      const key = args.join(' ')
      if (key === 'branch --show-current') return { code: 0, stdout: 'feature/dev-x-01\n', stderr: '' }
      if (args[0] === 'for-each-ref') return { code: 0, stdout: 'develop\nmain\nita1\nfeature/dev-x-01\n', stderr: '' }
      if (args[0] === 'rev-parse') return { code: 0, stdout: '', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    },
  }
}

/** 捕获 console.log 文本(vitest 环境下 stdout 已被其接管) */
async function captureStdout(run: () => Promise<number>): Promise<{ code: number; text: string }> {
  const chunks: string[] = []
  const orig = console.log
  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(' '))
  }
  try {
    const code = await run()
    return { code, text: chunks.join('\n') }
  } finally {
    console.log = orig
  }
}

/** 捕获 process.stderr.write(check 的 deny 理由走 stderr) */
async function captureStderr(run: () => Promise<number>): Promise<{ code: number; stderr: string }> {
  const chunks: string[] = []
  const write = process.stderr.write.bind(process.stderr)
  const mockWrite = (chunk: unknown, ..._rest: unknown[]) => {
    chunks.push(String(chunk))
    return true
  }
  process.stderr.write = mockWrite as typeof process.stderr.write
  try {
    const code = await run()
    return { code, stderr: chunks.join('') }
  } finally {
    process.stderr.write = write
  }
}

/** 捕获 console.error(unknownCommand 等框架提示走 stderr 通道) */
async function captureConsoleError(run: () => Promise<number>): Promise<{ code: number; text: string }> {
  const chunks: string[] = []
  const orig = console.error
  console.error = (...args: unknown[]) => {
    chunks.push(args.map(String).join(' '))
  }
  try {
    const code = await run()
    return { code, text: chunks.join('\n') }
  } finally {
    console.error = orig
  }
}

describe('cli: status(只读状态一览)', () => {
  it('输出角色配置 / 当前分支 / 本地分支角色', async () => {
    const dir = tempRepo()
    try {
      const { code, text } = await captureStdout(() => main(['status', '--repo', dir], { runner: scriptedRunner() }))
      expect(code).toBe(0)
      expect(text).toContain('Integration: develop')
      expect(text).toContain('Preview: ita1')
      expect(text).toContain('Archive: main')
      expect(text).toContain('Current branch: feature/dev-x-01')
      expect(text).toContain('develop → integration')
      expect(text).toContain('feature/dev-x-01 → feature')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('disabled 项目 → 输出未启用', async () => {
    const dir = tempRepo()
    writeFileSync(join(dir, 'gitflow-guard.config.json'), JSON.stringify({ enabled: false, branches: { integration: ['develop'] } }))
    try {
      const { code, text } = await captureStdout(() => main(['status', '--repo', dir], { runner: scriptedRunner() }))
      expect(code).toBe(0)
      expect(text).toContain('Config: not enabled')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('cli: 其他', () => {
  it('--help 退出 0', async () => {
    expect(await main(['--help'])).toBe(0)
  })

  it('未知子命令退出 1', async () => {
    expect(await main(['whatever'])).toBe(1)
  })

  it('audit 输出审计记录(先产生一条 deny)', async () => {
    const dir = tempRepo()
    try {
      await captureStderr(() => main(['check', '--command', 'git push origin develop', '--repo', dir]))
      const { code, text } = await captureStdout(() => main(['audit', '--repo', dir]))
      expect(code).toBe(0)
      expect(text).toContain('deny')
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(await stateDir(dir), { recursive: true, force: true }) // 清理用户级全局状态目录
    }
  })

  it('--lines 非数字不崩', async () => {
    const dir = tempRepo()
    try {
      expect(await main(['audit', '--lines', 'abc', '--repo', dir])).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('cli: check(agent hook 门禁)', () => {
  it('非 git 命令快路径 → exit 0(无需仓库)', async () => {
    expect(await main(['check', '--command', 'npm test'])).toBe(0)
    expect(await main(['check', '--command', 'ls -la'])).toBe(0)
  })

  it('推送到集成分支 → exit 2 + stderr 理由', async () => {
    const dir = tempRepo()
    try {
      const { code, stderr } = await captureStderr(() => main(['check', '--command', 'git push origin develop', '--repo', dir]))
      expect(code).toBe(2)
      expect(stderr).toContain('blocked:')
      expect(stderr).toContain('Protected branch')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('locale=zh → 拦截文案为中文', async () => {
    const dir = tempRepo()
    writeFileSync(
      join(dir, 'gitflow-guard.config.json'),
      JSON.stringify({ enabled: true, featurePattern: 'feature/[\\w-]+', locale: 'zh', branches: { integration: ['develop'] } }),
    )
    try {
      const { code, stderr } = await captureStderr(() => main(['check', '--command', 'git push origin develop', '--repo', dir]))
      expect(code).toBe(2)
      expect(stderr).toContain('已拦截')
      expect(stderr).toContain('受保护分支')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('推 feature / 建分支 → exit 0', async () => {
    const dir = tempRepo()
    try {
      expect(await main(['check', '--command', 'git push origin feature/x', '--repo', dir])).toBe(0)
      expect(await main(['check', '--command', 'git checkout -b feature/x', '--repo', dir])).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('未启用项目 → exit 0(opt-in 放行)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gfguard-check-off-'))
    try {
      writeFileSync(join(dir, 'gitflow-guard.config.json'), JSON.stringify({ enabled: false, branches: { integration: ['develop'] } }))
      expect(await main(['check', '--command', 'git push origin develop', '--repo', dir])).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('配置损坏(B)→ 默认 stderr 一行告警 + exit 0(不破坏工具管道, 不再静默)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gfguard-check-broken-'))
    try {
      writeFileSync(join(dir, 'gitflow-guard.config.json'), '{"enabled":true,branches:[}')
      const { code, stderr } = await captureStderr(() => main(['check', '--command', 'git push origin develop', '--repo', dir]))
      expect(code).toBe(0)
      expect(stderr).toContain('[gitflow-guard] guard disabled: invalid config:')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('校验错误(E, update 拼错)→ 同样告警且带原因', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gfguard-check-invalid-'))
    try {
      writeFileSync(
        join(dir, 'gitflow-guard.config.json'),
        JSON.stringify({ enabled: true, branches: { integration: { branches: ['develop'], update: 'prx' } } }),
      )
      const { code, stderr } = await captureStderr(() => main(['check', '--command', 'git push origin develop', '--repo', dir]))
      expect(code).toBe(0)
      expect(stderr).toContain('[gitflow-guard] guard disabled: invalid config:')
      expect(stderr).toMatch(/update/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('strict + 配置损坏 → fail-closed(exit 2 + blocked 文案)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gfguard-check-strict-'))
    try {
      writeFileSync(
        join(dir, 'gitflow-guard.config.json'),
        JSON.stringify({ enabled: true, strict: true, branches: { integration: { branches: ['develop'], update: 'prx' } } }),
      )
      const { code, stderr } = await captureStderr(() => main(['check', '--command', 'git push origin develop', '--repo', dir]))
      expect(code).toBe(2)
      expect(stderr).toContain('blocked:')
      expect(stderr).toMatch(/strict/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('strict + JSON 整体损坏(parse 失败)→ 同样 fail-closed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gfguard-check-parsefail-'))
    try {
      writeFileSync(join(dir, 'gitflow-guard.config.json'), '{"enabled":true,"strict":true,branches:[}')
      const { code, stderr } = await captureStderr(() => main(['check', '--command', 'git push origin develop', '--repo', dir]))
      expect(code).toBe(2)
      expect(stderr).toContain('blocked:')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('--command + auto: 无 stdin payload 按 claude 协议回退编码(P2-5)', async () => {
    const dir = tempRepo()
    try {
      // detectPlatform('') 恒回退 claude → exit 2 + stderr; 若误判为 codex/antigravity 会变成 exit 0 + stdout JSON
      const { code, stderr } = await captureStderr(() => main(['check', '--command', 'git push origin develop', '--repo', dir]))
      expect(code).toBe(2)
      expect(stderr).toContain('blocked:')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('cli: locale 一致性与扩展(P1-1 / P2-1 / P2-2 / P2-3)', () => {
  it('--help 在 zh 仓库输出中文框架文案(P1-1 A 方案)', async () => {
    const dir = tempRepo({ locale: 'zh' })
    try {
      const { code, text } = await captureStdout(() => main(['--help', '--repo', dir]))
      expect(code).toBe(0)
      expect(text).toContain('用法')
      expect(text).toContain('流程守卫')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('未知子命令在 zh 仓库输出中文提示', async () => {
    const dir = tempRepo({ locale: 'zh' })
    try {
      const { code, text } = await captureConsoleError(() => main(['whatever', '--repo', dir]))
      expect(code).toBe(1)
      expect(text).toContain('未知子命令')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('--locale zh 在 en 仓库也能输出中文拦截文案(P2-1)', async () => {
    const dir = tempRepo() // config 未设 locale = en
    try {
      const { code, stderr } = await captureStderr(() =>
        main(['check', '--command', 'git push origin develop', '--repo', dir, '--locale', 'zh']),
      )
      expect(code).toBe(2)
      expect(stderr).toContain('已拦截')
      expect(stderr).toContain('受保护分支')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('--locale 非白名单值 → 回退英文不报错', async () => {
    const dir = tempRepo()
    try {
      const { code, stderr } = await captureStderr(() =>
        main(['check', '--command', 'git push origin develop', '--repo', dir, '--locale', 'xx']),
      )
      expect(code).toBe(2)
      expect(stderr).toContain('blocked:')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('未注册 locale: status 告警不报错且回退 en(P2-2)', async () => {
    const dir = tempRepo({ locale: 'fr' })
    try {
      const { code, text } = await captureStdout(() => main(['status', '--repo', dir], { runner: scriptedRunner() }))
      expect(code).toBe(0)
      expect(text).toContain('config warning:')
      expect(text).toContain('"fr"')
      expect(text).toContain('Integration: develop') // 文案回退 en
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  const dict: Dict = Object.fromEntries(MESSAGE_KEYS.map((k) => [k, () => '[TEST-LANG]']))
  registerLocale('test-lang', dict)

  it('registerLocale 注册的测试语言走 check 全链路输出(P2-2)', async () => {
    const dir = tempRepo()
    try {
      const { code, stderr } = await captureStderr(() =>
        main(['check', '--command', 'git push origin develop', '--repo', dir, '--locale', 'test-lang']),
      )
      expect(code).toBe(2)
      expect(stderr).toContain('[TEST-LANG]')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('audit 时间戳渲染为 ISO 8601(P2-3)', async () => {
    const dir = tempRepo()
    try {
      await captureStderr(() => main(['check', '--command', 'git push origin develop', '--repo', dir]))
      const { code, text } = await captureStdout(() => main(['audit', '--repo', dir]))
      expect(code).toBe(0)
      expect(text).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(await stateDir(dir), { recursive: true, force: true }) // 清理用户级全局状态目录
    }
  })
})
describe('cli: wire(客户端默认 hook 落位)', () => {
  it('claude --project 首次写入, 二次幂等 already wired, unwire 移除', async () => {
    const dir = tempRepo()
    const path = join(dir, '.claude', 'settings.json')
    try {
      const first = await captureStdout(() => main(['wire', '--client', 'claude', '--project', '--yes', '--repo', dir]))
      expect(first.code).toBe(0)
      expect(first.text).toContain('hook written')
      expect(first.text).toContain(path) // Windows 下分隔符为 \, 与 wire 输出同源
      expect(existsSync(path)).toBe(true)

      const second = await captureStdout(() => main(['wire', '--client', 'claude', '--project', '--yes', '--repo', dir]))
      expect(second.code).toBe(0)
      expect(second.text).toContain('already wired')

      const removed = await captureStdout(() => main(['wire', '--client', 'claude', '--project', '--yes', '--unwire', '--repo', dir]))
      expect(removed.code).toBe(0)
      expect(removed.text).toContain('hook removed')
      // hooks 清空后整键移除(settings.json 保留为合法空对象, 不残留任何 PreToolUse)
      expect(JSON.parse(readFileSync(path, 'utf8')).hooks).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('--dry-run 只打印不写文件', async () => {
    const dir = tempRepo()
    const path = join(dir, '.codex', 'hooks.json')
    try {
      const { code, text } = await captureStdout(() => main(['wire', '--client', 'codex', '--project', '--dry-run', '--repo', dir]))
      expect(code).toBe(0)
      expect(text).toContain('[dry-run]')
      expect(existsSync(path)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('opencode --project 复制插件到 .opencode/plugins(OpenCode 1.18+ plugins 机制)', async () => {
    const dir = tempRepo()
    const path = join(dir, '.opencode', 'plugins', 'gitflow-guard.ts')
    try {
      const { code, text } = await captureStdout(() => main(['wire', '--client', 'opencode', '--project', '--yes', '--repo', dir]))
      expect(code).toBe(0)
      expect(text).toContain('hook written')
      expect(readFileSync(path, 'utf8')).toContain('tool.execute.before')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('antigravity --project 落位绝对路径命令(AGY-D2: agy hook 进程 cwd=配置目录)', async () => {
    const dir = tempRepo()
    const path = join(dir, '.agents', 'hooks.json')
    try {
      const { code, text } = await captureStdout(() => main(['wire', '--client', 'antigravity', '--project', '--yes', '--repo', dir]))
      expect(code).toBe(0)
      expect(text).toContain('hook written')
      const obj = JSON.parse(readFileSync(path, 'utf8'))
      expect(obj['gitflow-guard'].PreToolUse[0].hooks[0].command).toBe(`node ${join(dir, 'bin', 'gitflow-guard.mjs')} check --platform antigravity`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('dsh / pi 只打印引导, 不写任何文件', async () => {
    const dir = tempRepo()
    try {
      const dsh = await captureStdout(() => main(['wire', '--client', 'dsh', '--project', '--yes', '--repo', dir]))
      expect(dsh.code).toBe(0)
      expect(dsh.text).toContain('dsh plugin')
      const pi = await captureStdout(() => main(['wire', '--client', 'pi', '--project', '--yes', '--repo', dir]))
      expect(pi.code).toBe(0)
      expect(pi.text).toContain('pi/gitflow-guard.ts')
      // .pi / 任何 hook 文件都不应产生
      expect(existsSync(join(dir, '.pi'))).toBe(false)
      expect(existsSync(join(dir, '.claude'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('未知客户端 → exit 1', async () => {
    const dir = tempRepo()
    try {
      expect(await main(['wire', '--client', 'nope', '--project', '--repo', dir])).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('--global 非交互不确认 → 拒绝并 exit 1; --yes 才写入', async () => {
    const home = mkdtempSync(join(tmpdir(), 'gfguard-home-'))
    const dir = tempRepo()
    // os.homedir(): POSIX 读 HOME, Windows 读 USERPROFILE —— 双平台都要覆盖到临时目录
    const beforeHome = process.env.HOME
    const beforeProfile = process.env.USERPROFILE
    try {
      process.env.HOME = home
      if (process.platform === 'win32') process.env.USERPROFILE = home
      const refused = await captureConsoleError(() => main(['wire', '--client', 'claude', '--global', '--repo', dir]))
      expect(refused.code).toBe(1)
      expect(refused.text).toContain('Refusing')
      expect(existsSync(join(home, '.claude', 'settings.json'))).toBe(false)

      const ok = await captureStdout(() => main(['wire', '--client', 'claude', '--global', '--yes', '--repo', dir]))
      expect(ok.code).toBe(0)
      expect(existsSync(join(home, '.claude', 'settings.json'))).toBe(true)

      const removed = await captureStdout(() => main(['wire', '--client', 'claude', '--global', '--yes', '--unwire', '--repo', dir]))
      expect(removed.code).toBe(0)
      expect(removed.text).toContain('hook removed')
    } finally {
      if (beforeHome === undefined) delete process.env.HOME
      else process.env.HOME = beforeHome
      if (beforeProfile === undefined) delete process.env.USERPROFILE
      else process.env.USERPROFILE = beforeProfile
      rmSync(dir, { recursive: true, force: true })
      rmSync(home, { recursive: true, force: true })
    }
  })
})

describe('cli: setup(交互向导)非 TTY 环境', () => {
  it('非交互终端 → exit 1 + 指路 wire', async () => {
    const dir = tempRepo()
    try {
      const { code, text } = await captureConsoleError(() => main(['setup', '--repo', dir]))
      expect(code).toBe(1)
      expect(text).toContain('setup needs an interactive terminal')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('cli: status 内置默认与接线提示', () => {
  it('无 config 仓库 → 显示内置默认 + main 保护提示 + 未接线客户端引导', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gfguard-status-defaults-'))
    mkdirSync(join(dir, '.git'), { recursive: true })
    try {
      const { code, text } = await captureStdout(() => main(['status', '--repo', dir], { runner: scriptedRunner() }))
      expect(code).toBe(0)
      expect(text).toContain('built-in defaults')
      expect(text).toContain('main is protected by default')
      expect(text).toContain('Wiring:')
      expect(text).toContain('wire --client claude')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('已接线的仓库 → 不打印接线提示', async () => {
    const dir = tempRepo()
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(
      join(dir, '.claude', 'settings.json'),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node ${CLAUDE_PROJECT_DIR}/bin/gitflow-guard.mjs check --platform claude' }] }] } }),
    )
    try {
      const { code, text } = await captureStdout(() => main(['status', '--repo', dir], { runner: scriptedRunner() }))
      expect(code).toBe(0)
      // claude 已接线 → 不再提示 claude(其余未接线客户端仍会提示)
      expect(text).not.toContain('wire --client claude')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
