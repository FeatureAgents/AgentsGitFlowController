#!/usr/bin/env node
// 连续复测矩阵 —— 每次改动后统一回归全部产品线(纯本地, 无需 DSH/Llm/网络):
//   A) DSH 插件核心逻辑 (evaluateCommand 判定矩阵 + en/zh 文案)
//   B) Claude Code hook (gitflow-guard check --platform claude)
//   C) Codex hook       (gitflow-guard check --platform codex)
//   D) zh locale
//   E) antigravity 编码
//   F) OpenCode hook    (gitflow-guard check --platform opencode)
//   G) Pi 扩展          (createPiExtension tool_call block 契约, 真实 CLI 走通)
// 用法: npm run verify:matrix (内含 npm run build + 本脚本)

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPiExtension, evaluateCommand } from '../lib/index.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BIN = join(ROOT, 'bin', 'gitflow-guard.mjs')

let pass = 0
let fail = 0
const lines = []
function check(name, cond, detail = '') {
  if (cond) {
    pass++
    lines.push(`  ✅ ${name}`)
  } else {
    fail++
    lines.push(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** 真实 git 仓库(develop + main) + 守卫配置; 供 evaluateCommand 与 CLI check 的 findRepoRoot 使用 */
function tempRepo(config) {
  const dir = mkdtempSync(join(tmpdir(), 'gf-matrix-'))
  execFileSync('git', ['init', '-q', '-b', 'develop'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'm@m'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'm'], { cwd: dir })
  execFileSync('git', ['commit', '--allow-empty', '-qm', 'init'], { cwd: dir })
  execFileSync('git', ['branch', 'main'], { cwd: dir })
  writeFileSync(join(dir, 'gitflow-guard.config.json'), JSON.stringify(config))
  return dir
}

/** 跑 bin 的 check: 返回 {code, stdout, stderr} */
function runCheck(platform, payload, cwd) {
  try {
    const out = execFileSync('node', [BIN, 'check', '--platform', platform], { input: payload, cwd, encoding: 'utf8' })
    return { code: 0, stdout: out, stderr: '' }
  } catch (e) {
    const err = e
    return { code: typeof err.status === 'number' ? err.status : -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

const CONFIG = {
  enabled: true,
  featurePattern: 'feature/[\\w-]+',
  branches: { integration: ['develop'], archive: ['main'] },
}
const CONFIG_ZH = { ...CONFIG, locale: 'zh' }

console.log('== GitFlow guard 连续复测矩阵 ==\n')

console.log('[A] DSH plugin logic (evaluateCommand)')
{
  const repo = tempRepo(CONFIG)
  try {
    const cases = [
      ['develop', 'git push origin develop', 'deny'],
      ['feature/x', 'git push origin feature/x', 'allow'],
      ['develop', 'git push origin main', 'deny'],
      ['develop', 'git merge feature/x', 'deny'],
      ['develop', 'git merge main', 'allow'],
      ['develop', 'git branch -D main', 'deny'],
      ['feature/x', 'gh pr create --base main', 'allow'],
      ['feature/x', 'gh pr create --base develop', 'allow'],
      ['develop', 'git checkout -b feature/y', 'allow'],
      ['develop', 'echo hi', 'allow'],
      // 本地改写 refs 命令族(P1-1 收编): 受保护分支拒绝 / feature 自由
      ['develop', 'git reset --hard HEAD~1', 'deny'],
      ['feature/x', 'git reset --hard HEAD~1', 'allow'],
      ['develop', 'git rebase main', 'deny'],
      ['develop', 'git commit --amend -m x', 'deny'],
      ['feature/x', 'git commit --amend -m x', 'allow'],
      ['develop', 'git filter-branch -- --all', 'deny'],
      ['develop', 'git branch -m develop x', 'deny'],
      ['develop', 'git branch --delete --force develop', 'deny'],
    ]
    for (const [branch, cmd, want] of cases) {
      const r = await evaluateCommand(cmd, { repoRoot: repo, currentBranch: branch })
      check(`[${branch}] ${cmd} → ${want}`, r.outcome === want, `got ${r.outcome}`)
    }
    const d = await evaluateCommand('git push origin develop', { repoRoot: repo, currentBranch: 'develop' })
    check('默认 locale=en', d.locale === 'en', `locale=${d.locale}`)
    check('deny 文案为英文', /Protected branch/.test(d.reason?.why ?? ''), d.reason?.why)
    check('引导含 PR/MR', /PR\/MR/.test(d.reason?.next ?? ''), d.reason?.next)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
}

console.log('[B] Claude Code hook (--platform claude)')
{
  const repo = tempRepo(CONFIG)
  try {
    const deny = runCheck('claude', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push origin develop' }, cwd: repo }), repo)
    check('拦截: exit 2', deny.code === 2, `code=${deny.code}`)
    check('拦截: stderr 英文 blocked/Protected/Next', /blocked:/.test(deny.stderr) && /Protected branch/.test(deny.stderr) && /Next:/.test(deny.stderr), deny.stderr)
    const ok = runCheck('claude', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: repo }), repo)
    check('放行: exit 0 且无输出', ok.code === 0 && ok.stdout === '', `code=${ok.code}`)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
}

console.log('[C] Codex hook (--platform codex)')
{
  const repo = tempRepo(CONFIG)
  try {
    const deny = runCheck('codex', JSON.stringify({ hook_event_name: 'PreToolUse', turn_id: 't1', tool_input: { command: 'git push origin develop' }, cwd: repo }), repo)
    check('拦截: exit 0', deny.code === 0, `code=${deny.code}`)
    check('拦截: stdout permissionDecision=deny', /"permissionDecision":"deny"/.test(deny.stdout), deny.stdout)
    check('拦截: JSON 含 permissionDecisionReason', /permissionDecisionReason/.test(deny.stdout))
    const ok = runCheck('codex', JSON.stringify({ hook_event_name: 'PreToolUse', turn_id: 't1', tool_input: { command: 'ls -la' }, cwd: repo }), repo)
    check('放行: exit 0 且无输出(快路径)', ok.code === 0 && ok.stdout === '', `code=${ok.code} out=${ok.stdout}`)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
}

console.log('[D] zh locale')
{
  const repo = tempRepo(CONFIG_ZH)
  try {
    const deny = runCheck('claude', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push origin develop' }, cwd: repo }), repo)
    check('拦截 exit 2', deny.code === 2, `code=${deny.code}`)
    check('stderr 中文 已拦截/受保护', /已拦截/.test(deny.stderr) && /受保护分支/.test(deny.stderr), deny.stderr)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
}

console.log('[E] antigravity encoding')
{
  const repo = tempRepo(CONFIG)
  try {
    const deny = runCheck('antigravity', JSON.stringify({ hook_event_name: 'PreToolUse', toolCall: { args: { CommandLine: 'git branch -D main' } }, cwd: repo }), repo)
    check('拦截: exit 0', deny.code === 0, `code=${deny.code}`)
    check('拦截: stdout decision=deny', /"decision":"deny"/.test(deny.stdout), deny.stdout)
    const ok = runCheck('antigravity', JSON.stringify({ hook_event_name: 'PreToolUse', toolCall: { args: { CommandLine: 'ls -la' } }, cwd: repo }), repo)
    check('放行: exit 0 且无输出(快路径)', ok.code === 0 && ok.stdout === '', `code=${ok.code} out=${ok.stdout}`)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
}

console.log('[F] OpenCode hook (--platform opencode)')
{
  const repo = tempRepo(CONFIG)
  try {
    const deny = runCheck('opencode', JSON.stringify({ session_id: 's1', event: 'tool.before.bash', tool_name: 'bash', tool_args: { command: 'git push origin develop' }, cwd: repo }), repo)
    check('拦截: exit 2', deny.code === 2, `code=${deny.code}`)
    check('拦截: stderr 英文 blocked/Protected/Next', /blocked:/.test(deny.stderr) && /Protected branch/.test(deny.stderr) && /Next:/.test(deny.stderr), deny.stderr)
    const ok = runCheck('opencode', JSON.stringify({ session_id: 's1', event: 'tool.before.bash', tool_name: 'bash', tool_args: { command: 'ls -la' }, cwd: repo }), repo)
    check('放行: exit 0 且无输出(快路径)', ok.code === 0 && ok.stdout === '', `code=${ok.code}`)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
}

console.log('[G] Pi extension (tool_call block contract, real CLI)')
{
  const repo = tempRepo(CONFIG)
  try {
    // 真实 wire: 扩展以 node 直接跑本仓库 bin, 不再注入 run
    const extension = createPiExtension({ bin: [process.execPath, BIN] })
    let handler
    extension({ on: (_event, h) => (handler = h) })
    const evt = (command) => ({ toolName: 'bash', input: { command } })
    const ctx = { cwd: repo }
    const deny = await handler(evt('git push origin develop'), ctx)
    check('拦截: {block:true, reason} 含 Protected branch', deny?.block === true && /Protected branch/.test(deny.reason ?? ''), JSON.stringify(deny))
    const allow = await handler(evt('git checkout -b feature/y'), ctx)
    check('放行: 合法 git 命令(走真实 CLI)', allow === undefined, JSON.stringify(allow))
    const fast = await handler(evt('npm test'), ctx)
    check('放行: 非 git 命令(快路径)', fast === undefined, JSON.stringify(fast))
    const skip = await handler({ toolName: 'read', input: { command: 'git push origin develop' } }, ctx)
    check('放行: 非 bash/powershell 工具', skip === undefined, JSON.stringify(skip))
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
}

console.log('\n' + lines.join('\n'))
console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`)
process.exit(fail ? 1 : 0)
