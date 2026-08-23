// 状态层: 只读查询本地 git 仓库(可注入 runner; 平台适配器 gh/glab 可选)

import { execFile } from 'node:child_process'
import type { GuardConfig, PrTargetResolution } from './types'
import { roleOfBranch } from './gate'

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

/** 命令执行器(外部边界, 测试注入 fake) */
export interface Runner {
  run(args: string[], cwd: string): Promise<RunResult>
}

function makeRunner(bin: string): Runner {
  return {
    async run(args, cwd) {
      return await new Promise<RunResult>((resolve) => {
        execFile(bin, args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
          const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0
          resolve({ code, stdout: stdout ?? '', stderr: stderr ?? '' })
        })
      })
    },
  }
}

export const gitRunner: Runner = makeRunner('git')

/** GitHub 适配器: gh */
export const ghRunner: Runner = makeRunner('gh')

/** GitLab 适配器: glab */
export const glabRunner: Runner = makeRunner('glab')

export async function findRepoRoot(runner: Runner, cwd: string): Promise<string | null> {
  const r = await runner.run(['rev-parse', '--show-toplevel'], cwd)
  return r.code === 0 ? r.stdout.trim() || null : null
}

/** 共享 .git 目录(git 权威绝对路径): linked worktree 返回主仓库 .git, 主仓库返回自身 .git; 查询失败返回 null */
export async function commonGitDir(runner: Runner, cwd: string): Promise<string | null> {
  const r = await runner.run(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd)
  return r.code === 0 ? r.stdout.trim() || null : null
}

export async function currentBranch(runner: Runner, cwd: string): Promise<string | null> {
  const r = await runner.run(['branch', '--show-current'], cwd)
  return r.code === 0 ? r.stdout.trim() || null : null
}

/** feature 是否已合入 descendant(merge-base --is-ancestor, 退出码 0 = 是) */
export async function isAncestor(runner: Runner, cwd: string, ancestor: string, descendant: string): Promise<boolean> {
  const r = await runner.run(['merge-base', '--is-ancestor', ancestor, descendant], cwd)
  return r.code === 0
}

/** gh pr view: 返回 base/head 分支名; PR 不存在或 gh 不可用 → null */
export async function ghPrInfo(runner: Runner, cwd: string, pr: string | null): Promise<{ base: string; head: string } | null> {
  const args = pr ? ['pr', 'view', pr, '--json', 'baseRefName,headRefName'] : ['pr', 'view', '--json', 'baseRefName,headRefName']
  return viewPrInfo(runner, args, cwd, ['baseRefName', 'headRefName'])
}

/** glab mr view: 返回 target(基地)/source(源) 分支名; 失败返回 null */
export async function glabMrInfo(runner: Runner, cwd: string, mr: string | null): Promise<{ base: string; head: string } | null> {
  const args = mr ? ['mr', 'view', mr, '--output', 'json'] : ['mr', 'view', '--output', 'json']
  const r = await runner.run(args, cwd)
  if (r.code !== 0) return null
  try {
    const j = JSON.parse(r.stdout) as { target_branch?: unknown; source_branch?: unknown }
    if (typeof j.target_branch === 'string' && typeof j.source_branch === 'string') {
      return { base: j.target_branch, head: j.source_branch }
    }
    return null
  } catch {
    return null
  }
}

async function viewPrInfo(runner: Runner, args: string[], cwd: string, fields: string[]): Promise<{ base: string; head: string } | null> {
  const r = await runner.run(args, cwd)
  if (r.code !== 0) return null
  try {
    const j = JSON.parse(r.stdout) as Record<string, unknown>
    if (typeof j[fields[0]] === 'string' && typeof j[fields[1]] === 'string') {
      return { base: j[fields[0]] as string, head: j[fields[1]] as string }
    }
    return null
  } catch {
    return null
  }
}

/** gh pr checks: 返回 PR 检查状态(SUCCESS/FAILURE/PENDING/...); 查不到返回 null(自动跳过) */
export async function ghPrChecks(runner: Runner, cwd: string, pr: string | null): Promise<string | null> {
  if (pr == null) return null
  const r = await runner.run(['pr', 'checks', pr, '--json', 'state'], cwd)
  if (r.code !== 0) return null
  try {
    const states = JSON.parse(r.stdout) as Array<{ state?: unknown }>
    if (!Array.isArray(states) || states.length === 0) return null
    const distinct = new Set(states.map((s) => String(s.state ?? '')))
    // 任一失败 → FAILURE; 否则存在待运行 → PENDING; 其余 → SUCCESS
    if (distinct.has('FAILURE')) return 'FAILURE'
    if (distinct.has('PENDING') || distinct.has('IN_PROGRESS') || distinct.has('QUEUED')) return 'PENDING'
    return 'SUCCESS'
  } catch {
    return null
  }
}

/** 把 PR/MR 的 base(target) 分支映射为角色; 无法解析返回 null */
export function resolvePrTarget(info: { base: string; head: string } | null, config: GuardConfig): PrTargetResolution | null {
  if (!info) return null
  return { target: info.base, role: roleOfBranch(info.base, config), head: info.head }
}
