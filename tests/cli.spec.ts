import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main } from '../src/cli'
import type { Runner } from '../src/repo'

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gfguard-cli-'))
  mkdirSync(join(dir, '.git'), { recursive: true })
  writeFileSync(
    join(dir, 'gitflow-guard.config.json'),
    JSON.stringify({
      enabled: true,
      featurePattern: 'feature/[\\w-]+',
      branches: { integration: ['develop'], preview: ['ita1'], archive: ['main'] },
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
})
