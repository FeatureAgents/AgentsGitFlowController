import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main } from '../src/cli'
import { openPermitStore } from '../src/permits'
import { stateDir } from '../src/index'
import type { RunResult, Runner } from '../src/repo'

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gfguard-cli-'))
  mkdirSync(join(dir, '.git'), { recursive: true })
  writeFileSync(
    join(dir, 'gitflow-guard.config.json'),
    JSON.stringify({
      enabled: true,
      mode: 'pr',
      branches: { base: 'develop', preview: 'staging', trunk: 'main' },
    }),
  )
  return dir
}

/** 脚本化 runner: feature/dev-x-01 已合预览, 其余未合 */
function scriptedRunner(): Runner {
  return {
    async run(args) {
      const key = args.join(' ')
      if (key === 'branch --show-current') return { code: 0, stdout: 'feature/dev-x-01\n', stderr: '' }
      if (args[0] === 'for-each-ref') return { code: 0, stdout: 'feature/dev-x-01\nfeature/dev-x-02\n', stderr: '' }
      if (args[0] === 'merge-base' && args.includes('feature/dev-x-01')) return { code: 0, stdout: '', stderr: '' }
      if (args[0] === 'merge-base') return { code: 1, stdout: '', stderr: '' }
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

describe('cli: permit/confirm(用户终端专属)', () => {
  it('permit 授权 early-pr 并落盘 + 审计', async () => {
    const dir = tempRepo()
    try {
      const code = await main(['permit', 'feature/dev-x-01', '--kind', 'early-pr', '--repo', dir])
      expect(code).toBe(0)
      const store = await openPermitStore(join(stateDir(dir), 'state.json'))
      expect(store.hasValid('early-pr', 'feature/dev-x-01')).toBe(true)
      expect(readFileSync(join(stateDir(dir), 'audit.jsonl'), 'utf8')).toContain('grant')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('confirm 是 permit 的 P2 快捷方式', async () => {
    const dir = tempRepo()
    try {
      const code = await main(['confirm', 'feature/dev-x-01', '--repo', dir])
      expect(code).toBe(0)
      const store = await openPermitStore(join(stateDir(dir), 'state.json'))
      expect(store.hasValid('confirm', 'feature/dev-x-01')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('非法 kind → 退出 1', async () => {
    const dir = tempRepo()
    try {
      expect(await main(['permit', 'feature/dev-x-01', '--kind', 'weird', '--repo', dir])).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('缺 feature → 退出 1', async () => {
    expect(await main(['permit'])).toBe(1)
  })

  it('ttl 生效', async () => {
    const dir = tempRepo()
    try {
      await main(['confirm', 'feature/dev-x-01', '--ttl', '10', '--repo', dir])
      const store = await openPermitStore(join(stateDir(dir), 'state.json'))
      const p = store.list().find((x) => x.kind === 'confirm' && x.feature === 'feature/dev-x-01')
      expect(p?.expiresAt).toBeGreaterThan(Date.now())
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('cli: status(只读状态一览)', () => {
  it('输出当前分支 / 预览包含 feature / 特许记录', async () => {
    const dir = tempRepo()
    try {
      await main(['confirm', 'feature/dev-x-01', '--repo', dir])
      const { code, text } = await captureStdout(() => main(['status', '--repo', dir], { runner: scriptedRunner() }))
      expect(code).toBe(0)
      expect(text).toContain('当前分支: feature/dev-x-01')
      expect(text).toContain('feature/dev-x-01')
      expect(text).toContain('confirm')
      expect(text).toContain('feature/dev-x-02') // 未合预览也应列出
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

  it('audit 输出审计记录(有记录时)', async () => {
    const dir = tempRepo()
    try {
      await main(['confirm', 'feature/dev-x-01', '--repo', dir])
      const { code, text } = await captureStdout(() => main(['audit', '--repo', dir]))
      expect(code).toBe(0)
      expect(text).toContain('grant')
      expect(text).toContain('confirm')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('--lines 非数字不崩', async () => {
    const dir = tempRepo()
    try {
      await main(['confirm', 'feature/dev-x-01', '--repo', dir])
      expect(await main(['audit', '--lines', 'abc', '--repo', dir])).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
