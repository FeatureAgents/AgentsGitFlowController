import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** 仓库内脚本: cast 事件流 → SMIL 动画 SVG(dev-only, 随包不发布) */
const SCRIPT = 'scripts/generate-demo-svg.mjs'

interface CastEvent {
  t: number
  tag: string
  text: string
  n?: number
  total?: number
  branch?: string
  cmd?: string
}

function fixtureLines(): CastEvent[] {
  return [
    { t: 0, tag: 'title', text: '[gitflow-guard] demo — watch the guard decide' },
    { t: 300, tag: 'scene', n: 1, total: 3, branch: 'feature/demo-x', cmd: 'git commit -m "feat: demo work"', text: '  scene 1/3 — on feature/demo-x: git commit -m "feat: demo work"' },
    { t: 600, tag: 'allow', text: '    → ALLOW (exit 0) — the command may run' },
    { t: 900, tag: 'scene', n: 2, total: 3, branch: 'feature/demo-x', cmd: 'git push origin develop', text: '  scene 2/3 — on feature/demo-x: git push origin develop' },
    { t: 1200, tag: 'deny', text: '    → DENY (exit 2) — the command never ran' },
    { t: 1500, tag: 'why', text: '      why: Protected branch <develop> & config forbids it' },
    { t: 1800, tag: 'next', text: '      next: Open a PR from feature/demo-x into develop' },
    { t: 2100, tag: 'scene', n: 3, total: 3, branch: 'develop', cmd: 'git merge feature/demo-x', text: '  scene 3/3 — on develop: git merge feature/demo-x' },
    { t: 2400, tag: 'deny', text: '    → DENY (exit 2) — the command never ran' },
    { t: 2700, tag: 'why', text: '      why: integration branch develop is updated via PR' },
    { t: 3000, tag: 'next', text: '      next: gh pr create --base develop' },
    { t: 3300, tag: 'cleanup', text: '  sandbox deleted — no files left behind' },
    { t: 3600, tag: 'wire', text: '  Put the guard in front of your agent: npx gitflow-guard wire' },
  ]
}

function runScript(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: process.cwd() })
}

/** 最小沙箱目录 + 写入 cast + 收尾清理的三件套 */
function withSandbox(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'gfguard-svg-'))
  try {
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('scripts/generate-demo-svg.mjs: cast → SMIL 动画 SVG', () => {
  it('正常 cast 产出带帧切换与转义文本的 SVG', () => {
    withSandbox((dir) => {
      const castPath = join(dir, 'demo.cast.jsonl')
      const outPath = join(dir, 'demo.svg')
      writeFileSync(castPath, fixtureLines().map((e) => JSON.stringify(e)).join('\n'), 'utf8')
      const r = runScript(['--cast', castPath, '--out', outPath])
      expect(r.status).toBe(0)
      const svg = readFileSync(outPath, 'utf8')
      // SVG 根元素 + SMIL 帧切换(用 animate 的 discrete visibility 实现, 不依赖 JS)
      expect(svg).toContain('<svg')
      expect(svg).toContain('<animate')
      expect(svg).toContain('attributeName="visibility"')
      expect(svg).toContain('repeatCount="indefinite"')
      // 每个 cast 事件 = 一帧
      expect(svg.match(/data-frame=/g)?.length).toBe(fixtureLines().length)
      // 文本转义: why 行里的 <develop> & config 必须以实体出现, 不允许裸元素
      expect(svg).toContain('&lt;develop&gt; &amp; config')
      expect(svg).not.toContain('<develop>')
      // 场景分支名可见
      expect(svg).toContain('feature/demo-x')
      expect(svg).toContain('develop')
    })
  })

  it('坏 JSON / 缺字段 → 非零退出 + stderr 诊断, 不产半截 SVG', () => {
    withSandbox((dir) => {
      const badPath = join(dir, 'bad.jsonl')
      const outPath = join(dir, 'bad.svg')
      writeFileSync(badPath, '{"tag":"title"}\nnot-json-at-all\n', 'utf8')
      const r = runScript(['--cast', badPath, '--out', outPath])
      expect(r.status).not.toBe(0)
      expect(r.stderr.trim().length).toBeGreaterThan(0)
      expect(existsSync(outPath)).toBe(false)
    })
  })

  it('cast 文件不存在 → 非零退出 + stderr 诊断', () => {
    withSandbox((dir) => {
      const outPath = join(dir, 'never.svg')
      const r = runScript(['--cast', join(dir, 'missing.jsonl'), '--out', outPath])
      expect(r.status).not.toBe(0)
      expect(r.stderr.trim().length).toBeGreaterThan(0)
      expect(existsSync(outPath)).toBe(false)
    })
  })
})
