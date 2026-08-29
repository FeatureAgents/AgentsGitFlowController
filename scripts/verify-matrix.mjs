#!/usr/bin/env node
// 连续复测矩阵 —— 每次改动后统一回归全部产品线(纯本地, 无需 DSH/Llm/网络):
//   A) DSH 插件核心逻辑 (evaluateCommand 判定矩阵 + en/zh 文案)
//   B) Claude Code hook (gitflow-guard check --platform claude)
//   C) Codex hook       (gitflow-guard check --platform codex)
//   D) zh locale
//   E) antigravity 编码
//   F) OpenCode 插件   (--platform opencode 协议层 + wire 落位 plugins 目录装配断言)
//   G) Pi 扩展          (createPiExtension tool_call block 契约, 真实 CLI 走通)
// 用法: npm run verify:matrix (内含 npm run build + 本脚本)

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

/** 真实 git 仓库但无 config 文件: 验证内置默认(integration=develop, archive=main)开箱即用 */
function tempRepoNoConfig() {
  const dir = mkdtempSync(join(tmpdir(), 'gf-matrix-noconfig-'))
  execFileSync('git', ['init', '-q', '-b', 'develop'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'm@m'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'm'], { cwd: dir })
  execFileSync('git', ['commit', '--allow-empty', '-qm', 'init'], { cwd: dir })
  execFileSync('git', ['branch', 'main'], { cwd: dir })
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
      // Pi 真机空隙修复(G1/G2/G3/G5): sudo 剥壳 / symbolic-ref / cherry-pick / revert / checkout -B
      ['feature/x', 'sudo git push origin develop', 'deny'],
      ['develop', 'git symbolic-ref refs/heads/develop refs/heads/main', 'deny'],
      ['develop', 'git cherry-pick a1b2c3d', 'deny'],
      ['feature/x', 'git cherry-pick a1b2c3d', 'allow'],
      ['develop', 'git revert HEAD', 'deny'],
      ['feature/x', 'git cherry-pick -n a1b2c3d', 'allow'],
      ['develop', 'git checkout -B main', 'deny'],
      ['feature/x', 'git checkout -B feature/y', 'allow'],
      ['feature/x', 'git checkout -B feature/y && git push origin feature/y', 'allow'],
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

console.log('[A0] 内置默认配置(无 config 文件, 开箱即用)')
{
  const repo = tempRepoNoConfig()
  try {
    const cases = [
      ['develop', 'git push origin develop', 'deny'],
      ['develop', 'git push origin main', 'deny'],
      ['develop', 'git push origin feature/x', 'allow'],
      ['feature/x', 'git push origin feature/x', 'allow'],
    ]
    for (const [branch, cmd, want] of cases) {
      const r = await evaluateCommand(cmd, { repoRoot: repo, currentBranch: branch })
      check(`[默认] [${branch}] ${cmd} → ${want}`, r.outcome === want, `got ${r.outcome}`)
    }
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

console.log('[E] antigravity encoding (真机 payload 形状: cwd 嵌套在 toolCall.args.Cwd, AGY-D3)')
{
  const repo = tempRepo(CONFIG)
  try {
    // 与 TestResult/antigravity.md 摘录的真实 payload 同形: 顶层无 cwd
    const payload = (cmd) =>
      JSON.stringify({ artifactDirectoryPath: '/tmp/brain/1', conversationId: 'c1', stepIdx: 2, toolCall: { name: 'run_command', args: { CommandLine: cmd, Cwd: repo, WaitMsBeforeAsync: 10000 } }, workspacePaths: [repo] })
    const deny = runCheck('antigravity', payload('git branch -D main'), repo)
    check('拦截: exit 0', deny.code === 0, `code=${deny.code}`)
    check('拦截: stdout decision=deny', /"decision":"deny"/.test(deny.stdout), deny.stdout)
    const ok = runCheck('antigravity', payload('ls -la'), repo)
    check('放行: exit 0 且无输出(快路径)', ok.code === 0 && ok.stdout === '', `code=${ok.code} out=${ok.stdout}`)
    // wire 装配: 命令必须绝对路径(agy hook 进程 cwd=配置目录, 相对 bin 会 MODULE_NOT_FOUND)
    execFileSync('node', [BIN, 'wire', '--client', 'antigravity', '--project', '--yes', '--repo', repo], { encoding: 'utf8' })
    const ag = JSON.parse(readFileSync(join(repo, '.agents', 'hooks.json'), 'utf8'))
    const agCmd = ag['gitflow-guard'].PreToolUse[0].hooks[0].command
    check('wire 落位: antigravity 命令为仓库根绝对路径', agCmd === `node ${join(repo, 'bin', 'gitflow-guard.mjs')} check --platform antigravity`, agCmd)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
}

console.log('[F] OpenCode hook (--platform opencode 协议层 + wire 插件装配)')
{
  const repo = tempRepo(CONFIG)
  try {
    // 协议层: check 直连(插件最终走同一 CLI)
    const deny = runCheck('opencode', JSON.stringify({ session_id: 's1', event: 'tool.before.bash', tool_name: 'bash', tool_args: { command: 'git push origin develop' }, cwd: repo }), repo)
    check('拦截: exit 2', deny.code === 2, `code=${deny.code}`)
    check('拦截: stderr 英文 blocked/Protected/Next', /blocked:/.test(deny.stderr) && /Protected branch/.test(deny.stderr) && /Next:/.test(deny.stderr), deny.stderr)
    const ok = runCheck('opencode', JSON.stringify({ session_id: 's1', event: 'tool.before.bash', tool_name: 'bash', tool_args: { command: 'ls -la' }, cwd: repo }), repo)
    check('放行: exit 0 且无输出(快路径)', ok.code === 0 && ok.stdout === '', `code=${ok.code}`)
    // wire 装配: OpenCode 1.18+ 无 hooks.yaml, 落位为 plugins 目录的插件文件
    execFileSync('node', [BIN, 'wire', '--client', 'opencode', '--project', '--yes', '--repo', repo], { encoding: 'utf8' })
    const plugin = readFileSync(join(repo, '.opencode', 'plugins', 'gitflow-guard.ts'), 'utf8')
    check('wire 落位: 插件文件含 tool.execute.before 订阅', /tool\.execute\.before/.test(plugin) && /input\.tool !== 'bash'/.test(plugin), 'plugin content')
    check('wire 落位: 插件走 check --platform opencode', plugin.includes('check --platform opencode'))
    check('wire 落位: 插件拒绝语义 = 抛错阻断(exit 2)', /code === 2/.test(plugin) && /throw new Error/.test(plugin), 'plugin content')
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
    const dirDeny = await handler(evt('git checkout -B main'), ctx)
    check('拦截: checkout -B 强制重建受保护分支', dirDeny?.block === true && /Protected branch/.test(dirDeny.reason ?? ''), JSON.stringify(dirDeny))
    const sudoDeny = await handler(evt('sudo git push origin develop'), ctx)
    check('拦截: sudo 剥壳后受保护推送', sudoDeny?.block === true && /Protected branch/.test(sudoDeny.reason ?? ''), JSON.stringify(sudoDeny))
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
