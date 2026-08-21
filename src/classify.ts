// 命令识别层: 解析 agent 的 git/gh/gitflow-guard 命令文本, 输出结构化分类(纯函数)

import type { BranchDeleteClassified, Classified, ClassifyContext, GuardCliClassified, LocalMergeClassified, PrCreateClassified, PrMergeClassified, PushClassified } from './types'

/** 拆分命令为多段(&& / 分号 / 换行), 每段独立分类; 引号内的分隔符不算 */
export function classify(command: string, ctx: ClassifyContext = {}): Classified[] {
  return splitSegments(command).flatMap((seg) => classifySegment(seg, ctx))
}

/** 引号感知拆分: 保护 "..." 与 '...' 内的 && / ; / 换行 */
function splitSegments(command: string): string[] {
  const segments: string[] = []
  let current = ''
  let quote: string | null = null
  const push = () => {
    if (current.trim()) segments.push(current.trim())
    current = ''
  }
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (quote != null) {
      current += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      continue
    }
    if (ch === '&' && command[i + 1] === '&') {
      push()
      i++
      continue
    }
    if (ch === ';' || ch === '\n') {
      push()
      continue
    }
    current += ch
  }
  push()
  return segments
}

function classifySegment(segment: string, ctx: ClassifyContext): Classified[] {
  const tokens = tokenize(segment)
  if (tokens.length === 0) return [{ kind: 'other' }]
  const [cmd, ...rest] = tokens
  if (cmd === 'git') return classifyGit(rest, ctx)
  if (cmd === 'gh') return classifyGh(rest)
  if (cmd === 'glab') return classifyGlab(rest)
  if (cmd === 'gitflow-guard') return [{ kind: 'guard-cli', sub: guardSub(rest) }]
  return [{ kind: 'other' }]
}

/** 分词: 引号内的空格不拆分 */
function tokenize(segment: string): string[] {
  return segment.match(/"[^"]*"|'[^']*'|\S+/g)?.map((t) => t.replace(/^['"]|['"]$/g, '')) ?? []
}

function classifyGit(args: string[], ctx: ClassifyContext): Classified[] {
  const [sub, ...rest] = args
  if (sub === 'push') return parsePush(rest, ctx)
  if (sub === 'merge') return parseMerge(rest)
  if (sub === 'branch') return parseBranch(rest)
  if (sub === 'checkout' || sub === 'switch') return parseCheckout(rest)
  return [{ kind: 'other' }]
}

/** 分支切换: 门禁放行, 分支状态由 evaluateCommand 按段模拟 */
function parseCheckout(args: string[]): Classified[] {
  const first = args[0]
  // 文件模式(git checkout -- <path>)不改变分支
  if (first === '--') return [{ kind: 'checkout', branch: null }]
  if (first === '-b' || first === '-B' || first === '-c' || first === '-C') {
    const name = args[1]
    return [{ kind: 'checkout', branch: name && !name.startsWith('-') ? name : null }]
  }
  if (first && !first.startsWith('-')) return [{ kind: 'checkout', branch: first }]
  // 其余(- / --detach / 无参)分支未知, 不模拟
  return [{ kind: 'checkout', branch: null }]
}

function parsePush(args: string[], ctx: ClassifyContext): Classified[] {
  let force = false
  let isDelete = false
  let all = false
  const nonFlag: string[] = []
  for (const a of args) {
    if (a === '-f' || a === '--force' || a === '--force-with-lease' || a.startsWith('--force-with-lease=')) {
      force = true
    } else if (a === '--delete' || a === '-d') {
      isDelete = true
    } else if (a === '--all' || a === '--mirror') {
      all = true
    } else if (a === '--tags') {
      // tag-only 推送不改变分支 refs; 不属分支角色守卫范围
      return [{ kind: 'other' }]
    } else if (a.startsWith('-')) {
      // 其余 flag 忽略
    } else {
      nonFlag.push(a)
    }
  }
  // --all/--mirror 推送全部本地分支(含受保护分支), 门禁一律拒绝
  if (all) return [{ kind: 'push', dst: null, force, delete: false, all: true }]
  // 第一个非 flag 参数是 remote, 其余是 refspec
  const refspecs = nonFlag.slice(1)
  if (refspecs.length === 0) return [{ kind: 'push', dst: ctx.currentBranch ?? null, force, delete: false }]
  return refspecs.map((ref) => {
    // '+' 前缀 = 强推(git push +src:dst), 剥离后再解析目标
    let refForce = force
    if (ref.startsWith('+')) {
      refForce = true
      ref = ref.slice(1)
    }
    if (ref.startsWith(':')) return { kind: 'push', dst: stripRefPrefix(ref.slice(1)) || null, force: refForce, delete: true }
    const colon = ref.indexOf(':')
    if (colon >= 0) {
      // 冒号结尾(develop: / HEAD:develop:) = 删除目标分支; dst 取冒号间部分, 空则回退前缀
      const deleteTarget = ref.endsWith(':')
      const dst = deleteTarget ? ref.slice(colon + 1, ref.length - 1) || ref.slice(0, colon) : ref.slice(colon + 1)
      return { kind: 'push', dst: dst ? stripRefPrefix(dst) : null, force: refForce, delete: deleteTarget || isDelete }
    }
    if (ref === 'HEAD') return { kind: 'push', dst: ctx.currentBranch ?? null, force: refForce, delete: isDelete }
    return { kind: 'push', dst: stripRefPrefix(ref), force: refForce, delete: isDelete }
  })
}

/** 全限定 refspec(refs/heads/x)剥离前缀, 与角色分支名比对 */
function stripRefPrefix(branch: string): string {
  return branch.startsWith('refs/heads/') ? branch.slice('refs/heads/'.length) : branch
}

function parseMerge(args: string[]): Classified[] {
  if (args.some((a) => a === '--abort')) return [{ kind: 'other' }]
  // -m/--message 消费下一个 token, 不能当作 source
  const source = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '-m' && args[i - 1] !== '--message') ?? null
  return [{ kind: 'local-merge', source }]
}

function parseBranch(args: string[]): Classified[] {
  const [flag, name] = args
  if ((flag === '-d' || flag === '-D' || flag === '--delete') && name && !name.startsWith('-')) {
    const out: BranchDeleteClassified = { kind: 'branch-delete', branch: name, force: flag === '-D' }
    return [out]
  }
  return [{ kind: 'other' }]
}

function classifyGh(args: string[]): Classified[] {
  const [sub, action, ...rest] = args
  if (sub !== 'pr') return [{ kind: 'other' }]
  if (action === 'create') return parsePrCreate(rest, ['--base', '-B'])
  if (action === 'merge') return parsePrMerge(rest)
  return [{ kind: 'other' }]
}

/** GitLab: glab mr create --target-branch <b> / glab mr merge <id> */
function classifyGlab(args: string[]): Classified[] {
  const [sub, action, ...rest] = args
  if (sub !== 'mr') return [{ kind: 'other' }]
  if (action === 'create') return parsePrCreate(rest, ['--target-branch'])
  if (action === 'merge') return parsePrMerge(rest)
  return [{ kind: 'other' }]
}

function parsePrCreate(args: string[], targetFlags: string[]): Classified[] {
  if (hasHelpFlag(args)) return [{ kind: 'other' }]
  const out: PrCreateClassified = { kind: 'pr-create', target: null }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    const flag = targetFlags.find((f) => a === f || a.startsWith(`${f}=`))
    if (!flag) continue
    if (a === flag) {
      const value = args[i + 1]
      if (value && !value.startsWith('-')) out.target = value
    } else {
      out.target = a.slice(flag.length + 1) || null
    }
  }
  return [out]
}

function parsePrMerge(args: string[]): Classified[] {
  if (hasHelpFlag(args)) return [{ kind: 'other' }]
  const pr = args.find((a) => !a.startsWith('-') && /^\d+$/.test(a)) ?? null
  const out: PrMergeClassified = { kind: 'pr-merge', pr }
  return [out]
}

function hasHelpFlag(args: string[]): boolean {
  return args.some((a) => a === '-h' || a === '--help' || a === '--version')
}

function guardSub(args: string[]): GuardCliClassified['sub'] {
  const sub = args[0]
  if (sub === 'status') return 'status'
  return 'other'
}
