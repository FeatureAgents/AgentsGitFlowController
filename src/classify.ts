// 命令识别层: 解析 agent 的 git/gh/gitflow-guard 命令文本, 输出结构化分类(纯函数)

import type { Classified, ClassifyContext, GuardCliClassified, LocalMergeClassified, PrCreateClassified, PrMergeClassified, PushClassified } from './types'

/** 拆分命令为多段(&& / || / | / 分号 / 换行), 每段独立分类; 引号内的分隔符不算 */
export function classify(command: string, ctx: ClassifyContext = {}): Classified[] {
  const { plain, nested } = extractNested(command)
  return [
    ...splitSegments(plain).flatMap((seg) => classifySegment(seg, ctx)),
    ...nested.flatMap((n) => classify(n, ctx)),
  ]
}

/** 提取反引号与 $() 内层命令文本一并送分类(单引号内不展开, 与 shell 语义一致); 外层文本剥离内嵌段后返回 */
function extractNested(command: string): { plain: string; nested: string[] } {
  const nested: string[] = []
  let plain = ''
  let inSingle = false
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (inSingle) {
      plain += ch
      if (ch === "'") inSingle = false
      continue
    }
    if (ch === "'") {
      inSingle = true
      plain += ch
      continue
    }
    if (ch === '`') {
      const end = command.indexOf('`', i + 1)
      if (end === -1) {
        plain += ch
        continue
      }
      nested.push(command.slice(i + 1, end))
      i = end
      continue
    }
    if (ch === '$' && command[i + 1] === '(') {
      let depth = 1
      let j = i + 2
      while (j < command.length && depth > 0) {
        if (command[j] === '(') depth++
        else if (command[j] === ')') depth--
        j++
      }
      nested.push(command.slice(i + 2, depth === 0 ? j - 1 : j))
      i = j - 1
      continue
    }
    plain += ch
  }
  return { plain, nested }
}

/** 引号感知拆分: 保护 "..." 与 '...' 内的 && / || / | / ; / 换行 */
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
    if (ch === '|' && command[i + 1] === '|') {
      push()
      i++
      continue
    }
    if (ch === ';' || ch === '\n' || ch === '|') {
      push()
      continue
    }
    current += ch
  }
  push()
  return segments
}

/** shell 解释器包装(sh/bash/zsh -c "<script>"): 脚本文本整体重分类 */
const SHELLS: ReadonlySet<string> = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh'])
/** 可剥离的执行前缀(env/nohup/xargs/command 及 VAR=x 赋值) */
const WRAPPERS: ReadonlySet<string> = new Set(['env', 'command', 'nohup', 'xargs'])

function classifySegment(segment: string, ctx: ClassifyContext): Classified[] {
  // 子 shell 包裹(cmd …): 剥掉外层括号按原样分类
  const trimmed = segment.trim()
  const body = trimmed.startsWith('(') && trimmed.endsWith(')') ? trimmed.slice(1, -1).trim() : trimmed
  const tokens = tokenize(body)
  if (tokens.length === 0) return [{ kind: 'other' }]
  return classifyTokens(tokens, ctx)
}

/** 分派: 已知命令直接解析; 包装器剥壳后递归(token 只减不增, 必然终止) */
function classifyTokens(tokens: string[], ctx: ClassifyContext): Classified[] {
  const rawCmd = tokens[0]
  const cmd = rawCmd.includes('/') ? rawCmd.slice(rawCmd.lastIndexOf('/') + 1) : rawCmd
  if (SHELLS.has(cmd)) return classifyShellWrapped(tokens, ctx)
  if (cmd === 'env') return classifyTokens(stripEnvArgs(tokens.slice(1)), ctx)
  if (WRAPPERS.has(cmd)) return classifyTokens(stripWrapperArgs(tokens.slice(1)), ctx)
  if (/^[\w-][\w.-]*=/.test(rawCmd)) return classifyTokens(tokens.slice(1), ctx)
  if (cmd === 'git') return classifyGit(tokens.slice(1), ctx)
  if (cmd === 'gh') return classifyGh(tokens.slice(1))
  if (cmd === 'glab') return classifyGlab(tokens.slice(1))
  if (cmd === 'gitflow-guard') return [{ kind: 'guard-cli', sub: guardSub(tokens.slice(1)) }]
  return [{ kind: 'other' }]
}

/** sh/bash -lc "<script>": 定位 -c(含合并短旗标如 -lc)取脚本文本递归; 取不到按 other 放行 */
function classifyShellWrapped(tokens: string[], ctx: ClassifyContext): Classified[] {
  for (let i = 1; i < tokens.length; i++) {
    const a = tokens[i]
    const isCFlag = a === '-c' || (a.startsWith('-') && !a.startsWith('--') && a.includes('c'))
    if (!isCFlag) continue
    const script = tokens[i + 1]
    if (script == null) break
    return script.length > 0 ? classify(script, ctx) : [{ kind: 'other' }]
  }
  return [{ kind: 'other' }]
}

/** env 参数剥离: 旗标与 VAR=x 赋值;-u/--unset 消费下一个参数 */
function stripEnvArgs(args: string[]): string[] {
  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (a === '-u' || a === '--unset') {
      i += args[i + 1] != null ? 2 : 1
      continue
    }
    if (a.startsWith('-') || /^[\w-]+=/.test(a)) {
      i++
      continue
    }
    break
  }
  return args.slice(i)
}

/** nohup/xargs/command 参数剥离: 旗标、纯数字(xargs -n 2 的值)与 VAR=x */
function stripWrapperArgs(args: string[]): string[] {
  let i = 0
  while (i < args.length && (args[i].startsWith('-') || /^\d+$/.test(args[i]) || /^[\w-]+=/.test(args[i]))) i++
  return args.slice(i)
}

/** 分词: 引号内的空格不拆分 */
function tokenize(segment: string): string[] {
  return segment.match(/"[^"]*"|'[^']*'|\S+/g)?.map((t) => t.replace(/^['"]|['"]$/g, '')) ?? []
}

function classifyGit(args: string[], ctx: ClassifyContext): Classified[] {
  const [sub, ...rest] = stripGlobalOptions(args)
  if (sub === 'push') return parsePush(rest, ctx)
  if (sub === 'pull') return parsePull(rest)
  if (sub === 'merge') return parseMerge(rest)
  if (sub === 'branch') return parseBranch(rest, ctx)
  if (sub === 'checkout' || sub === 'switch') return parseCheckout(rest)
  if (sub === 'send-pack') return parseSendPack(rest)
  if (sub === 'update-ref') return parseUpdateRef(rest)
  if (sub === 'reset' || sub === 'filter-branch') return [{ kind: 'ref-move' }]
  if (sub === 'rebase') return parseRebase(rest)
  if (sub === 'commit') return parseCommit(rest)
  return [{ kind: 'other' }]
}

/** rebase 移动当前分支 ref; abort/continue/skip 等恢复类旗标不移动(放行, 避免把用户困在中途态) */
function parseRebase(args: string[]): Classified[] {
  const RESUME: ReadonlySet<string> = new Set(['--abort', '--continue', '--skip', '--quit', '--edit-todo'])
  if (args.some((a) => RESUME.has(a))) return [{ kind: 'other' }]
  return [{ kind: 'ref-move' }]
}

/** commit 仅 --amend 改写当前分支 tip; 普通提交不移动既有 ref */
function parseCommit(args: string[]): Classified[] {
  if (args.some((a) => a === '--amend')) return [{ kind: 'ref-move' }]
  return [{ kind: 'other' }]
}

/** 剥离子命令前的全局选项(-C <path> / -c <k=v> / --git-dir 等), 否则 git -C . push 会被判 other */
function stripGlobalOptions(args: string[]): string[] {
  const WITH_VALUE: ReadonlySet<string> = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix'])
  const BARE: ReadonlySet<string> = new Set(['--bare', '--no-pager', '--no-optional-locks', '--paginate', '--no-replace-objects', '--literal-pathspecs', '-p', '-P'])
  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (BARE.has(a) || /^--(git-dir|work-tree|namespace|super-prefix)=/.test(a)) {
      i++
      continue
    }
    if (WITH_VALUE.has(a)) {
      i += 2
      continue
    }
    break
  }
  return args.slice(i)
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
  const [first, second] = nonFlag
  if (first == null) return [{ kind: 'push', dst: null, force, delete: false }]
  // 单个非 flag 参数有歧义(git 按名字消歧: 是 remote 则裸推当前分支, 否则作为 refspec):
  // 纯文本无法消歧, 两种解释都送分类 —— 门禁对多段分类任一 deny 即整体拦截
  if (second == null) {
    return [
      { kind: 'push', dst: stripRefPrefix(first), force, delete: isDelete },
      { kind: 'push', dst: null, force, delete: isDelete },
    ]
  }
  // 首个非 flag 参数是 remote, 其余是 refspec; 无 refspec 时目标在执行时才确定, 延迟到门禁按(模拟)当前分支解析
  return mapRefspecs(nonFlag.slice(1), { force, delete: isDelete }, ctx)
}

/** refspec → push 分类。含 * 视为批量推送(与 --all 同级); HEAD/空 dst 延迟为 null(门禁按模拟分支解析) */
function mapRefspecs(refspecs: string[], base: { force: boolean; delete: boolean }, ctx?: ClassifyContext): Classified[] {
  return refspecs.map((raw) => {
    let refForce = base.force
    if (raw.startsWith('+')) {
      refForce = true
      raw = raw.slice(1)
    }
    // 通配 refspec(refs/heads/*:refs/heads/* 等)= 推送全部分支, 门禁一律拒绝
    if (raw.includes('*')) return { kind: 'push', dst: null, force: refForce, delete: false, all: true }
    if (raw.startsWith(':')) return { kind: 'push', dst: stripRefPrefix(raw.slice(1)) || null, force: refForce, delete: true }
    const colon = raw.indexOf(':')
    if (colon >= 0) {
      // 冒号结尾(develop: / HEAD:develop:) = 删除目标分支; dst 取冒号间部分, 空则回退前缀
      const deleteTarget = raw.endsWith(':')
      const dst = deleteTarget ? raw.slice(colon + 1, raw.length - 1) || raw.slice(0, colon) : raw.slice(colon + 1)
      return { kind: 'push', dst: dst ? stripRefPrefix(dst) : null, force: refForce, delete: deleteTarget || base.delete }
    }
    if (raw === 'HEAD') return { kind: 'push', dst: null, force: refForce, delete: base.delete }
    return { kind: 'push', dst: stripRefPrefix(raw), force: refForce, delete: base.delete }
  })
}

/** 全限定 refspec(refs/heads/x)剥离前缀, 与角色分支名比对 */
function stripRefPrefix(branch: string): string {
  return branch.startsWith('refs/heads/') ? branch.slice('refs/heads/'.length) : branch
}

/** git pull = fetch+merge: 取最后一个非 flag 参数为远端分支名(source), 交给本地合入门禁; 无 refspec 时 source=null(同步上游语义) */
function parsePull(args: string[]): Classified[] {
  const nonFlags = args.filter((a) => !a.startsWith('-'))
  const last = nonFlags[nonFlags.length - 1]
  // 形态: [remote [refspec]]; remote 在前 refspec 在后, 故取末个非 flag; 剥离可能的 '+' 强制前缀
  const source = nonFlags.length >= 2 && last ? last.replace(/^\+/, '') : null
  return [{ kind: 'local-merge', source }]
}

/** git send-pack(push 的底层等价物): 首个非 flag 是 host:path, 其后 refspec 按推送语义分类 */
function parseSendPack(args: string[]): Classified[] {
  let force = false
  let all = false
  const nonFlag: string[] = []
  for (const a of args) {
    if (a === '-f' || a === '--force') force = true
    else if (a === '--all') all = true
    else if (!a.startsWith('-')) nonFlag.push(a)
    // 其余 flag 忽略
  }
  if (all) return [{ kind: 'push', dst: null, force, delete: false, all: true }]
  const refspecs = nonFlag.slice(1)
  if (refspecs.length === 0) return [{ kind: 'other' }] // 仅 host 无 refspec: 不推任何分支
  return mapRefspecs(refspecs, { force, delete: false })
}

/** git update-ref 直改 refs(plumbing): 提取目标 ref(剥 refs/heads/ 前缀供角色比对); -d 为删除 */
function parseUpdateRef(args: string[]): Classified[] {
  let isDelete = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-d') {
      isDelete = true
      continue
    }
    if (a === '-m' || a === '--message') {
      i++ // 消费 -m 的值, 不能当作 ref
      continue
    }
    if (a.startsWith('-')) continue
    return [{ kind: 'ref-update', branch: stripRefPrefix(a), delete: isDelete }]
  }
  return [{ kind: 'other' }]
}

function parseMerge(args: string[]): Classified[] {
  if (args.some((a) => a === '--abort')) return [{ kind: 'other' }]
  // -m/--message 消费下一个 token, 不能当作 source
  const source = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '-m' && args[i - 1] !== '--message') ?? null
  return [{ kind: 'local-merge', source }]
}

/**
 * git branch 全旗标扫描(旧实现只读 args[0..1], `-d --force develop` 这类组合长旗标会漏):
 * - 删除(-d/-D/--delete, 可与 --force 组合): 逐个分支名 → branch-delete
 * - 改名(-m/-M/--move): 移动受保护 ref(源)或覆盖受保护名(目标)→ 按 ref-update 同级处理
 * - 强制复位(-f/--force 单独使用): git branch -f <name> <commit> 静默移动分支指针 → ref-update
 */
function parseBranch(args: string[], ctx: ClassifyContext): Classified[] {
  let deleteFlag = false
  let force = false
  let move = false
  const names: string[] = []
  for (const a of args) {
    if (a.startsWith('--')) {
      if (a === '--delete') deleteFlag = true
      else if (a === '--force') force = true
      else if (a === '--move') move = true
      // 其余长旗标(--show-current/--edit-color 等)忽略
    } else if (a.startsWith('-') && a.length > 1) {
      // 短旗标簇(-df / -dF 等): 逐字符识别
      for (const ch of a.slice(1)) {
        if (ch === 'd') deleteFlag = true
        else if (ch === 'D') { deleteFlag = true; force = true }
        else if (ch === 'm') move = true
        else if (ch === 'M') { move = true; force = true }
        else if (ch === 'f') force = true
      }
    } else {
      names.push(a)
    }
  }
  // 改名: branch -m [<old>] <new>; 缺 old 时改的是当前分支(用上下文模拟值兜底)
  if (move) {
    const from = names.length >= 2 ? names[0] : ctx.currentBranch ?? null
    const to = names.length >= 1 ? names[names.length - 1] : null
    const out: Classified[] = []
    if (from != null) out.push({ kind: 'ref-update', branch: from, delete: false })
    if (to != null && to !== from) out.push({ kind: 'ref-update', branch: to, delete: false })
    return out.length > 0 ? out : [{ kind: 'other' }]
  }
  // 删除: 可一次删多个分支, 每个独立送门禁
  if (deleteFlag) {
    if (names.length === 0) return [{ kind: 'other' }]
    return names.map((branch): Classified => ({ kind: 'branch-delete', branch, force }))
  }
  // 无删除/改名语义时, 仅 -f 复位形态会移动既有 ref(git branch -f <name> <commit>)
  if (force && names.length >= 1) return [{ kind: 'ref-update', branch: names[0], delete: false }]
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
