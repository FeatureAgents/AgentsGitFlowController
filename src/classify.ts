// 命令识别层: 解析 agent 的 git/gh/gitflow-guard 命令文本, 输出结构化分类(纯函数)

import { dirname, resolve } from 'node:path'
import type { Classified, ClassifyContext, GuardCliClassified, LocalMergeClassified, PrCreateClassified, PrMergeClassified, PushClassified } from './types'

/**
 * 嵌套展开深度上限: 超过后不再递归展开内层命令。
 * 病态嵌套($($(...)) 数千层)会让 classify 无限递归直至调用栈溢出, hook 进程以未捕获异常崩溃;
 * 超限时降级为「不展开内层」, 外层命令照常分类 —— 与项目内部异常默认 fail-open 的策略一致。
 * 已知权衡: 攻击者可用超过上限的嵌套藏匿内层命令规避检查, 但此类命令在真实 shell 中同样畸形, 风险可接受。
 */
const MAX_NESTED_DEPTH = 10

/**
 * 别名解析作用域: -c alias.* 定义沿展开链向下传递 —— 既含链式别名, 也含 shell 别名展开后的
 * 内层 git 调用(git 经 GIT_CONFIG_PARAMETERS 把 -c 传给子进程, 内层 git 同样能读到)。
 * seen 记录展开链上已展开的别名名, 遇重复即截断(环): git 对递归别名报错不执行, 降级放行安全。
 */
interface AliasScope {
  defs: ReadonlyMap<string, string>
  seen: ReadonlySet<string>
  /** shell 别名(!)的嵌套展开预算: 每层递减, 归零即拒绝(防深链递归爆栈, 爆栈会被上层 fail-open 放行) */
  shellBudget: number
  /** 别名链展开预算: 每层递减, 归零即只保留字面解释(防超长链递归耗尽调用栈) */
  chainBudget: number
}

/**
 * shell 别名嵌套展开预算: `-c alias.aN=!git` 链每层都要重入 classifyDepth,
 * 1500 层约 30KB 载荷即可耗尽调用栈, 而 classify 抛出的 RangeError 会被上层 fail-open 放行整条命令。
 * 正常用法不会嵌套 shell 别名。
 */
const MAX_SHELL_ALIAS_DEPTH = 10

/** 别名链展开预算: 超长无环链每层递归一次, 预算用尽后只保留字面解释(正常别名链远短于此) */
const MAX_ALIAS_CHAIN = 32

const EMPTY_ALIAS_SCOPE: AliasScope = {
  defs: new Map(),
  seen: new Set(),
  shellBudget: MAX_SHELL_ALIAS_DEPTH,
  chainBudget: MAX_ALIAS_CHAIN,
}

/**
 * git 内置子命令名: 别名展开出的名字命中即停止继续展开。
 * 内置命令优先于同名别名(实测 `git -c alias.push=status push origin master` 执行内置 push),
 * 故 `-c alias.a=push -c alias.push=status a` 展开到 push 后不得再被 alias.push 改写。
 */
const BUILTIN_SUBCOMMANDS: ReadonlySet<string> = new Set([
  'add', 'am', 'apply', 'archive', 'bisect', 'blame', 'branch', 'bundle', 'cat-file', 'checkout',
  'cherry', 'cherry-pick', 'clean', 'clone', 'commit', 'config', 'describe', 'diff', 'fetch',
  'filter-branch', 'format-patch', 'gc', 'grep', 'hash-object', 'help', 'init', 'log', 'ls-files',
  'ls-remote', 'ls-tree', 'merge', 'mv', 'notes', 'pull', 'push', 'range-diff', 'rebase', 'reflog',
  'remote', 'repack', 'replace', 'reset', 'restore', 'revert', 'rev-list', 'rev-parse', 'rm',
  'send-pack', 'shortlog', 'show', 'show-ref', 'sparse-checkout', 'stash', 'status', 'submodule',
  'switch', 'symbolic-ref', 'tag', 'update-ref', 'var', 'version', 'worktree',
])

/**
 * 别名值 token 数上限: `git config alias.a0 config alias.a1 config alias.a2 …` 这类链式嵌套会让
 * parseConfig 与 classifyGit 互递归直至栈溢出, 而上层对 classify 异常默认 fail-open(整条命令放行)。
 * 正常别名值远短于此, 超限按带外通道拒绝。
 */
const MAX_ALIAS_VALUE_TOKENS = 64

/** 拆分命令为多段(&& / || / | / 分号 / 换行), 每段独立分类; 引号内的分隔符不算 */
export function classify(command: string, ctx: ClassifyContext = {}): Classified[] {
  return classifyDepth(command, ctx, 0, EMPTY_ALIAS_SCOPE)
}

function classifyDepth(command: string, ctx: ClassifyContext, depth: number, scope: AliasScope): Classified[] {
  const { plain, nested } = extractNested(command)
  return [
    ...splitSegments(plain).flatMap((seg) => classifySegment(seg, ctx, depth, scope)),
    ...(depth >= MAX_NESTED_DEPTH ? [] : nested.flatMap((n) => classifyDepth(n, ctx, depth + 1, scope))),
  ]
}

/** 改变后续段工作目录的 shell 内建与 PowerShell cmdlet/别名(popd / pop-location 目标取决于目录栈, 无法静态确定) */
const CD_COMMANDS: ReadonlySet<string> = new Set([
  'cd', 'pushd', 'popd', 'set-location', 'sl', 'push-location', 'pop-location',
])
/** cd 之后经这些分隔符衔接的段在 cd 后的目录运行; || / | / & 之后的段不继承(仅在 cd 失败时执行, 或 cd 跑在子 shell 里) */
const CD_CARRY_OPS: ReadonlySet<string> = new Set(['&&', ';', '\n'])

/** 受门禁命令段及其静态推演出的运行目录(无法静态确定时 cwd 为 null) */
export interface SegmentCwd {
  text: string
  cwd: string | null
}

/**
 * 逐段推演命令中每个受门禁段的实际运行目录(纯函数, 只做静态解析; 不访问文件系统):
 * 自起点 cwd 依次维护链式目录 chainDir, 经 cd / pushd / Set-Location 等传递, 并在受门禁 git 段上叠加 git -C / --git-dir。
 * 「受门禁段」= classify(text) 含非 other 的段。只读或非 git 段不产出条目。
 * 无法静态确定($VAR / 反引号 / ~ / cd - / 无参 cd / popd / 通配符 / 子 shell 与命令组 / || | & 之后的 cd)时:
 * - 若发生在 cd / 子 shell / 命令组上, 后续链式目录 chainDir 置为 null(其后受门禁段的 cwd 为 null, 由上层拒绝);
 * - 若发生在某段 git -C / --git-dir 上, 仅该段 cwd 置为 null, 不影响后续段。
 */
export function resolveSegmentCwds(command: string, cwd: string): SegmentCwd[] {
  // 起点目录先规范化, 使「起点本身」与「经 cd / -C 解析出的目录」的字符串形式可直接比较(如 Windows 正斜杠起点)
  return resolveSegmentCwdsDepth(command, resolve(cwd), 0)
}

function resolveSegmentCwdsDepth(command: string, startDir: string | null, depth: number): SegmentCwd[] {
  const out: SegmentCwd[] = []
  let chainDir: string | null = startDir
  for (const { text, op } of splitWithOperators(command)) {
    if (text.startsWith('(') || text.startsWith('{')) {
      const stripped = text.replace(/^[({]\s*/, '')
      if (classify(text).some((c) => c.kind !== 'other') || classify(stripped).some((c) => c.kind !== 'other')) {
        out.push({ text, cwd: null })
      }
      chainDir = null
      continue
    }
    const tokens = tokenize(text)
    let i = 0
    while (i < tokens.length && /^[\w-][\w.-]*=/.test(tokens[i])) i++
    const name = normalizeCommandName(tokens[i] ?? '')
    if (CD_COMMANDS.has(name)) {
      if (classify(text).some((c) => c.kind !== 'other')) out.push({ text, cwd: chainDir })
      const target = parseCdTarget(name, tokens.slice(i + 1))
      chainDir = chainDir != null && target != null && CD_CARRY_OPS.has(op) ? resolve(chainDir, target) : null
      continue
    }
    const innerTokens = stripWrapperPrefixes(tokens.slice(i))
    const innerName = normalizeCommandName(innerTokens[0] ?? '')
    const innerScript = extractWrappedScript(innerName, innerTokens)
    if (innerScript != null) {
      // 子 shell 包装器(sh/bash/powershell/cmd): 外层 chainDir 为 null 或超嵌套上限时保守置 null;
      // 否则以当前 chainDir 为起点递归推演(子 shell 内部 cd 不改变外层 chainDir);
      // 若内层无受门禁段或外层含带外走私/受门禁嵌套替换, 必须保留外层 { text, cwd: chainDir }
      if (chainDir == null || depth >= MAX_NESTED_DEPTH) {
        if (classify(text).some((c) => c.kind !== 'other')) out.push({ text, cwd: null })
      } else {
        const subEntries = innerScript.length > 0 ? resolveSegmentCwdsDepth(innerScript, chainDir, depth + 1) : []
        const outerWithoutScript = innerScript.length > 0 ? text.replace(innerScript, '') : text
        const hasOuterGated =
          hasAliasSmuggleTokens(tokens) ||
          extractNested(outerWithoutScript).nested.some((n) => classify(n).some((c) => c.kind !== 'other'))
        if ((subEntries.length === 0 || hasOuterGated) && (hasOuterGated || classify(text).some((c) => c.kind !== 'other'))) {
          out.push({ text, cwd: chainDir })
        }
        out.push(...subEntries)
      }
      continue
    }
    if (!classify(text).some((c) => c.kind !== 'other')) continue
    // 受门禁段: git(含经 env/sudo/command/nohup/xargs 剥壳后的 git)应用全局选项 -C / --git-dir; 非 git 工具只应用此前的 cd
    if (innerName !== 'git') {
      out.push({ text, cwd: chainDir })
      continue
    }
    out.push({ text, cwd: parseGitCwd(innerTokens.slice(1), chainDir) })
  }
  return out
}

/** 解析 cd / pushd / Set-Location / sl / Push-Location 的静态目标目录(popd / pop-location 一律返回 null) */
function parseCdTarget(name: string, args: string[]): string | null {
  if (name === 'popd' || name === 'pop-location') return null
  const isPs = name === 'set-location' || name === 'sl' || name === 'push-location'
  const positionals: string[] = []
  let afterDoubleDash = false
  for (let k = 0; k < args.length; k++) {
    const a = args[k]
    if (afterDoubleDash) {
      positionals.push(a)
      continue
    }
    if (a === '--') {
      afterDoubleDash = true
      continue
    }
    if (name === 'cd' && a.toLowerCase() === '/d') continue
    if (isPs) {
      const low = a.toLowerCase()
      if (low === '-path' || low === '-literalpath') {
        if (k + 1 < args.length) positionals.push(args[++k])
        continue
      }
      const sep = low.startsWith('-path:') || low.startsWith('-literalpath:')
        ? a.indexOf(':')
        : low.startsWith('-path=') || low.startsWith('-literalpath=')
          ? a.indexOf('=')
          : -1
      if (sep >= 0) {
        positionals.push(a.slice(sep + 1))
        continue
      }
    }
    positionals.push(a)
  }
  return positionals.length === 1 ? staticDir(positionals[0]) : null
}

/** 推演受门禁 git 段全局选项中的 -C 与 --git-dir 目录(--git-dir 固定仓库目录后不再被后续 -C 覆盖) */
function parseGitCwd(gitArgs: string[], startDir: string | null): string | null {
  let workDir = startDir
  let hasExplicitGitDir = false
  let explicitGitDir: string | null = null
  for (let j = 0; j < gitArgs.length; j++) {
    const a = gitArgs[j]
    if (a === '-C') {
      const target = staticDir(gitArgs[j + 1])
      if (target == null) return null
      if (workDir != null) workDir = resolve(workDir, target)
      j++
    } else if (a.startsWith('-C') && a.length > 2) {
      const target = staticDir(a.slice(2))
      if (target == null) return null
      if (workDir != null) workDir = resolve(workDir, target)
    } else if (a === '--git-dir') {
      hasExplicitGitDir = true
      explicitGitDir = resolveGitDir(workDir, gitArgs[j + 1])
      if (explicitGitDir == null) return null
      j++
    } else if (a.startsWith('--git-dir=')) {
      hasExplicitGitDir = true
      explicitGitDir = resolveGitDir(workDir, a.slice('--git-dir='.length))
      if (explicitGitDir == null) return null
    } else if (a.startsWith('-c') && a.length > 2) {
      // 紧贴值(-c<k=v>): 单 token, 不消费下一参数
    } else if (GIT_VALUE_OPTIONS.has(a)) {
      j++
    } else if (!GIT_BARE_OPTIONS.has(a) && !/^--[\w-]+=/.test(a)) {
      break
    }
  }
  return hasExplicitGitDir ? explicitGitDir : workDir
}

/** 从 --git-dir 目标反推工作树目录: 仅常规 .git 目录(等于 .git 或以 /.git / \.git 结尾)可确定其父目录, 裸仓或 worktrees 等保守置 null */
function resolveGitDir(segDir: string | null, raw: string | undefined): string | null {
  const target = staticDir(raw)
  if (target == null || segDir == null) return null
  const trimmed = target.replace(/[/\\]+$/, '')
  if (trimmed === '.git' || trimmed.endsWith('/.git') || trimmed.endsWith('\\.git')) {
    return dirname(resolve(segDir, trimmed))
  }
  return null
}

/** 可静态确定的目录参数; 含变量 / 命令替换 / 家目录 / 通配符或以 - 开头时返回 null */
function staticDir(arg: string | undefined): string | null {
  if (!arg || arg.startsWith('-') || arg.startsWith('~') || /[$`*?[]/.test(arg)) return null
  return arg
}

/** 提取反引号与 $() 内层命令文本一并送分类(普通单引号与 $'...' 均不展开, 但 $'...' 识别 \\ 与 \' 转义); 外层文本剥离内嵌段后返回 */
function extractNested(command: string): { plain: string; nested: string[] } {
  const nested: string[] = []
  let plain = ''
  let inSingle = false
  let inAnsiSingle = false
  let inDouble = false
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (inAnsiSingle) {
      if (ch === '\\' && i + 1 < command.length) {
        plain += ch + command[i + 1]
        i++
        continue
      }
      plain += ch
      if (ch === "'") inAnsiSingle = false
      continue
    }
    if (inSingle) {
      plain += ch
      if (ch === "'") inSingle = false
      continue
    }
    if (inDouble) {
      if (ch === '\\' && i + 1 < command.length) {
        plain += ch + command[i + 1]
        i++
        continue
      }
      if (ch === '"') {
        inDouble = false
        plain += ch
        continue
      }
    } else {
      if (ch === '\\' && i + 1 < command.length) {
        plain += ch + command[i + 1]
        i++
        continue
      }
      if (ch === '$' && command[i + 1] === "'") {
        inAnsiSingle = true
        plain += "$'"
        i++
        continue
      }
      if (ch === "'") {
        inSingle = true
        plain += ch
        continue
      }
      if (ch === '"') {
        inDouble = true
        plain += ch
        continue
      }
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
      let subSingle = false
      let subAnsiSingle = false
      let subDouble = false
      while (j < command.length && depth > 0) {
        const sub = command[j]
        if (subAnsiSingle) {
          if (sub === '\\' && j + 1 < command.length) {
            j += 2
            continue
          }
          if (sub === "'") subAnsiSingle = false
          j++
          continue
        }
        if (subSingle) {
          if (sub === "'") subSingle = false
          j++
          continue
        }
        if (subDouble) {
          if (sub === '\\' && j + 1 < command.length) {
            j += 2
            continue
          }
          if (sub === '"') subDouble = false
          j++
          continue
        }
        if (sub === '\\' && j + 1 < command.length) {
          j += 2
          continue
        }
        if (sub === '$' && command[j + 1] === "'") {
          subAnsiSingle = true
          j += 2
          continue
        }
        if (sub === "'") subSingle = true
        else if (sub === '"') subDouble = true
        else if (sub === '(') depth++
        else if (sub === ')') depth--
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

/** 引号与转义感知拆分: 保护 "..." 与 '...' 内的 && / || / | / ; / & / 换行, 独立切分各个子命令 */
function splitSegments(command: string): string[] {
  return splitWithOperators(command).map((s) => s.text)
}

/** 同 splitSegments, 每段附带结束它的分隔符(命令末尾为 ''), 供 resolveSegmentCwds 判断后续段是否继承 cd */
function splitWithOperators(command: string): { text: string; op: string }[] {
  const segments: { text: string; op: string }[] = []
  let current = ''
  let quote: '"' | "'" | "$'" | null = null
  const push = (op: string) => {
    if (current.trim()) segments.push({ text: current.trim(), op })
    current = ''
  }
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (quote != null) {
      // 双引号内的 \" / \\ 与 ANSI-C 单引号($'...')内的 \' / \\ 转义保护, 避免提前闭合
      if ((quote === '"' || quote === "$'") && ch === '\\' && i + 1 < command.length) {
        current += ch + command[i + 1]
        i++
        continue
      }
      current += ch
      if (ch === (quote === "$'" ? "'" : quote)) quote = null
      continue
    }
    // 引号外的 \ 转义字符保护(如 \&, \;, \|, \")
    if (ch === '\\' && i + 1 < command.length) {
      current += ch + command[i + 1]
      i++
      continue
    }
    if (ch === '$' && command[i + 1] === "'") {
      quote = "$'"
      current += "$'"
      i++
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      continue
    }
    if (ch === '&' && command[i + 1] === '&') {
      push('&&')
      i++
      continue
    }
    if (ch === '|' && command[i + 1] === '|') {
      push('||')
      i++
      continue
    }
    if (ch === ';' || ch === '\n' || ch === '|') {
      push(ch)
      continue
    }
    if (ch === '&') {
      // 重定向判定: &> / &>> 为重定向输出; >& / <& 为重定向文件描述符(如 2>&1)
      const isRedirectOut = command[i + 1] === '>'
      const prevChar = i > 0 ? command[i - 1] : ''
      const isRedirectFd = prevChar === '>' || prevChar === '<'
      if (!isRedirectOut && !isRedirectFd) {
        push('&')
        continue
      }
    }
    current += ch
  }
  push('')
  return segments
}

/** shell 解释器包装(sh/bash/zsh -c "<script>"): 脚本文本整体重分类 */
const SHELLS: ReadonlySet<string> = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh'])
/** 可剥离的执行前缀(env/nohup/xargs/command 及 VAR=x 赋值) */
const WRAPPERS: ReadonlySet<string> = new Set(['env', 'command', 'nohup', 'xargs'])
/** 已知可执行/内建命令名: 用于识别防 alias 反斜杠转义(如 g\it), 同时不破坏 Windows 路径 */
const KNOWN_COMMANDS: ReadonlySet<string> = new Set([
  'git', 'gh', 'glab', 'gitflow-guard', 'env', 'sudo', ...WRAPPERS, ...SHELLS, 'powershell', 'pwsh', 'cmd', ...CD_COMMANDS,
])

function classifySegment(segment: string, ctx: ClassifyContext, depth: number, scope: AliasScope): Classified[] {
  // 子 shell 包裹(cmd …)或命令组 { cmd; }: 剥掉外层定界符与多余分号递归分类
  const trimmed = segment.trim()
  if (trimmed.startsWith('(') || trimmed.startsWith('{')) {
    if (depth >= MAX_NESTED_DEPTH) return [{ kind: 'other' }]
    let body = trimmed
    if (body.startsWith('(')) {
      body = body.endsWith(')') ? body.slice(1, -1) : body.slice(1)
    } else {
      body = body.endsWith('}') ? body.slice(1, -1) : body.slice(1)
    }
    body = body.replace(/^[\s;]+|[\s;]+$/g, '')
    if (!body) return [{ kind: 'other' }]
    return classifyDepth(body, ctx, depth + 1, scope)
  }
  const tokens = tokenize(trimmed)
  if (tokens.length === 0) return [{ kind: 'other' }]
  return classifyTokens(tokens, ctx, depth, scope)
}

/**
 * 带外别名定义通道: GIT_CONFIG_KEY_n=alias.*(需同命令存在 GIT_CONFIG_COUNT=n, git 才读取 KEY_n)
 * 或 GIT_CONFIG_PARAMETERS 的键位含 alias.*(该变量格式要求每个条目 'key=value' 带引号)。
 * 检测在整段 token 上做 —— env/sudo/nohup/xargs 前缀的赋值会被剥壳函数消费掉, 只看首 token 会漏。
 */
function hasAliasSmuggleTokens(tokens: string[]): boolean {
  const hasCount = tokens.some((t) => /^GIT_CONFIG_COUNT=\d+$/i.test(t))
  return tokens.some(
    (t) =>
      (hasCount && /^GIT_CONFIG_KEY_\d+=\s*['"]?alias\./i.test(t)) ||
      /^GIT_CONFIG_PARAMETERS=.*['"]alias\./i.test(t),
  )
}

/** 规范化可执行文件名: 兼容 / 与 \ 路径分隔符, 剥离 .exe/.cmd/.bat 后缀并转为小写(Windows 大小写不敏感); 识别非 Windows 路径的防 alias 反斜杠转义(如 g\it) */
function normalizeCommandName(rawCmd: string): string {
  const unquoted = rawCmd.replace(/^['"]|['"]$/g, '')
  const lastSep = Math.max(unquoted.lastIndexOf('/'), unquoted.lastIndexOf('\\'))
  const basename = lastSep >= 0 ? unquoted.slice(lastSep + 1) : unquoted
  const clean = basename.replace(/\.(exe|cmd|bat)$/i, '').toLowerCase()
  if (KNOWN_COMMANDS.has(clean)) return clean
  if (unquoted.includes('\\') && !/^(?:[a-zA-Z]:\\|\.\.?\\|\\\\)/.test(unquoted) && !/\.(exe|cmd|bat)$/i.test(unquoted)) {
    const slashBase = unquoted.slice(unquoted.lastIndexOf('/') + 1)
    const unescaped = slashBase.replace(/\\/g, '').toLowerCase()
    if (KNOWN_COMMANDS.has(unescaped)) return unescaped
  }
  return clean
}

/** 剥离前缀 VAR=x 赋值与 env / sudo / command / nohup / xargs 包装器 */
function stripWrapperPrefixes(tokens: string[]): string[] {
  let cur = tokens
  while (cur.length > 0) {
    const raw = cur[0]
    if (/^[\w-][\w.-]*=/.test(raw)) {
      cur = cur.slice(1)
      continue
    }
    const cmd = normalizeCommandName(raw)
    if (cmd === 'env') {
      cur = stripEnvArgs(cur.slice(1))
      continue
    }
    if (cmd === 'sudo') {
      cur = stripSudoArgs(cur.slice(1))
      continue
    }
    if (WRAPPERS.has(cmd)) {
      cur = stripWrapperArgs(cur.slice(1))
      continue
    }
    break
  }
  return cur
}

/** 分派: 已知命令直接解析; 包装器剥壳后递归(token 只减不增, 必然终止) */
function classifyTokens(tokens: string[], ctx: ClassifyContext, depth: number, scope: AliasScope): Classified[] {
  if (tokens.length === 0) return [{ kind: 'other' }]
  if (hasAliasSmuggleTokens(tokens)) return [{ kind: 'alias-smuggle' }]
  const stripped = stripWrapperPrefixes(tokens)
  if (stripped.length === 0) return [{ kind: 'other' }]
  const cmd = normalizeCommandName(stripped[0])
  const script = extractWrappedScript(cmd, stripped)
  if (script != null) {
    if (depth >= MAX_NESTED_DEPTH) return [{ kind: 'other' }]
    return script.length > 0 ? classifyDepth(script, ctx, depth + 1, scope) : [{ kind: 'other' }]
  }
  if (cmd === 'git') return classifyGit(stripped.slice(1), ctx, depth, scope)
  if (cmd === 'gh') return classifyGh(stripped.slice(1))
  if (cmd === 'glab') return classifyGlab(stripped.slice(1))
  if (cmd === 'gitflow-guard') return [{ kind: 'guard-cli', sub: guardSub(stripped.slice(1)) }]
  return [{ kind: 'other' }]
}

/** 从 sh/bash/powershell/pwsh/cmd 包装命令中提取内嵌脚本文本 */
function extractWrappedScript(cmd: string, tokens: string[]): string | null {
  if (SHELLS.has(cmd)) {
    for (let i = 1; i < tokens.length; i++) {
      const a = tokens[i]
      const isCFlag = a === '-c' || (a.startsWith('-') && !a.startsWith('--') && a.includes('c'))
      if (isCFlag) return tokens[i + 1] ?? null
    }
    return null
  }
  if (cmd === 'powershell' || cmd === 'pwsh') {
    for (let i = 1; i < tokens.length; i++) {
      const a = tokens[i].toLowerCase()
      if (a === '-c' || a === '-command' || a === '--command') {
        const rest = tokens.slice(i + 1)
        return rest.length > 0 ? rest.join(' ') : null
      }
    }
    return null
  }
  if (cmd === 'cmd') {
    for (let i = 1; i < tokens.length; i++) {
      const a = tokens[i].toLowerCase()
      if (a === '/c' || a === '/k' || a === '-c') {
        const rest = tokens.slice(i + 1)
        return rest.length > 0 ? rest.join(' ') : null
      }
    }
    return null
  }
  return null
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

/**
 * sudo 参数剥离: 旗标与 VAR=x 赋值逐个消费; -u/-g/-p(及长旗标)消费下一个参数;
 * `--` 之后即命令本体。仅剥壳不出新语义, 递归分类必然终止。
 */
function stripSudoArgs(args: string[]): string[] {
  const WITH_VALUE: ReadonlySet<string> = new Set(['-u', '--user', '-g', '--group', '-p', '--prompt'])
  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (a === '--') return args.slice(i + 1)
    if (WITH_VALUE.has(a)) {
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

/** 解码 ANSI-C 引号($'...')内的转义序列: \xHH / \NNN(八进制) / \n \t \r \a \b \f \v / \\ \' \" */
function decodeAnsiC(body: string): string {
  const SIMPLE: Record<string, string> = {
    n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"',
  }
  return body.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|[\s\S])/g, (_, esc: string) => {
    if (esc[0] === 'x') return String.fromCharCode(parseInt(esc.slice(1), 16))
    if (/^[0-7]+$/.test(esc)) return String.fromCharCode(parseInt(esc, 8))
    return SIMPLE[esc] ?? esc
  })
}

/**
 * 分词: 逐字符扫描, 支持 token 中间出现的引号段。
 * shell 会把 `alias.z="push origin master"` 还原成单个参数, 而按空白切分的正则会在此处切断并残留引号 ——
 * 既让别名收集失败, 也让带外通道检测落空。处理单/双引号与 ANSI-C 引号($'...' / $"...");
 * 引号内的空白按字面并入当前 token, 引号本身不并入。
 */
function tokenize(segment: string): string[] {
  const tokens: string[] = []
  let cur = ''
  let started = false
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      if (started) {
        tokens.push(cur)
        cur = ''
        started = false
      }
      continue
    }
    started = true
    // 引号外对 \空格 / \" / \' 与紧跟引号/空格/反斜杠的 \\ 做 POSIX 反转义, 保留 D:\repo\sub 与 \\server\share Windows 路径
    if (ch === '\\' && i + 1 < segment.length) {
      const next = segment[i + 1]
      if (next === ' ' || next === '"' || next === "'") {
        cur += next
        i++
        continue
      }
      if (next === '\\') {
        const after = segment[i + 2]
        if (after === '"' || after === "'" || after === ' ' || after === '\\') {
          cur += '\\'
          i++
          continue
        }
      }
    }
    const ansi = ch === '$' && (segment[i + 1] === "'" || segment[i + 1] === '"')
    const quote = ansi ? segment[i + 1] : ch === "'" || ch === '"' ? ch : null
    if (quote != null) {
      const from = i + (ansi ? 2 : 1)
      if (quote === '"') {
        // 双引号内识别 \\ 与 \" 转义(防止 "\\" 吞掉闭合引号), 保留 Windows 路径中的 \x
        let j = from
        let body = ''
        while (j < segment.length) {
          const qch = segment[j]
          if (qch === '\\' && j + 1 < segment.length) {
            const next = segment[j + 1]
            if (next === '\\' || next === '"') {
              body += next
              j += 2
              continue
            }
          }
          if (qch === '"') break
          body += qch
          j++
        }
        cur += ansi ? decodeAnsiC(body) : body
        i = j >= segment.length ? segment.length : j
        continue
      }
      if (ansi && quote === "'") {
        // $'...' 支持 \\ 与 \' 转义, 逐字符跳过转义寻找真正的闭合 '
        let j = from
        while (j < segment.length) {
          const qch = segment[j]
          if (qch === '\\' && j + 1 < segment.length) {
            j += 2
            continue
          }
          if (qch === "'") break
          j++
        }
        const body = segment.slice(from, j)
        cur += decodeAnsiC(body)
        i = j >= segment.length ? segment.length : j
        continue
      }
      const end = segment.indexOf(quote, from)
      const body = end === -1 ? segment.slice(from) : segment.slice(from, end)
      // ANSI-C 引号内的转义序列由 shell 解码, 不解码会让别名值判定与真实执行不一致
      cur += ansi ? decodeAnsiC(body) : body
      i = end === -1 ? segment.length : end
      continue
    }
    cur += ch
  }
  if (started) tokens.push(cur)
  return tokens
}

/**
 * git 子命令分派 + 别名解析。
 * 别名展开为真实命令后再分类, 但 git 内置命令优先于同名别名(实测 `git -c alias.push=status push
 * origin master` 执行的是内置 push), 故字面解释与展开解释都送门禁, 任一 deny 即拦 —— 与 push
 * 单参数歧义的双解释同机制。展开用迭代而非递归: 链长受命令中 -c 条目数约束, 环由 seen 截断,
 * 不会耗尽调用栈, 也无需深度上限(上限会让长无环链静默放行, 而真 git 能正常执行它们)。
 */
/** --config-env=alias.<name>=<ENVVAR>(含空格形态): 别名值取自环境变量, 守卫看不到 */
function hasConfigEnvAlias(args: string[]): boolean {
  return args.some(
    (a, i) =>
      (/^--config-env=/i.test(a) && /^alias\./i.test(a.slice('--config-env='.length))) ||
      (a === '--config-env' && /^alias\./i.test(args[i + 1] ?? '')),
  )
}

function classifyGit(args: string[], ctx: ClassifyContext, depth: number, scope: AliasScope): Classified[] {
  if (hasConfigEnvAlias(args)) return [{ kind: 'alias-smuggle' }]
  const { rest: stripped, aliases: localDefs } = stripGlobalOptions(args)
  const defs = localDefs.size === 0 ? scope.defs : new Map([...scope.defs, ...localDefs])
  const [sub, ...rest] = stripped
  const literal = dispatchGit(sub, rest, ctx, depth, scope)
  if (sub == null || scope.chainBudget <= 0) return literal

  const key = sub.toLowerCase() // git 配置键大小写不敏感(实测 alias.Z 与 alias.z 等价)
  if (scope.seen.has(key)) return literal
  const value = defs.get(key)
  if (value == null) return literal

  const nextScope: AliasScope = {
    defs,
    seen: new Set([...scope.seen, key]),
    shellBudget: scope.shellBudget,
    chainBudget: scope.chainBudget - 1,
  }
  // shell 别名(! 前缀): git 把调用点参数作为位置参数追加, 且内层 git 调用继承 -c 定义
  if (value.startsWith('!')) {
    if (scope.shellBudget <= 0) return [...literal, { kind: 'alias-smuggle' }]
    return [
      ...literal,
      ...classifyDepth(expandShellAlias(value.slice(1), rest), ctx, depth, {
        ...nextScope,
        shellBudget: scope.shellBudget - 1,
      }),
    ]
  }
  const valueTokens = tokenize(value)
  const nextSub = valueTokens[0]
  // git 内置命令优先于同名别名: 展开出的名字是内置命令时只做字面分派, 不再继续展开
  if (nextSub != null && BUILTIN_SUBCOMMANDS.has(nextSub)) {
    return [...literal, ...dispatchGit(nextSub, [...valueTokens.slice(1), ...rest], ctx, depth, nextScope)]
  }
  // 交回 classifyGit: 展开值自身可能带全局选项(-c alias.q=… / --config-env=alias.*=ENV)
  return [...literal, ...classifyGit([...valueTokens, ...rest], ctx, depth, nextScope)]
}

/** git 子命令的字面分派(不做别名展开) */
function dispatchGit(sub: string | undefined, rest: string[], ctx: ClassifyContext, depth: number, scope: AliasScope): Classified[] {
  if (sub === 'push') return parsePush(rest, ctx)
  if (sub === 'pull') return parsePull(rest)
  if (sub === 'merge') return parseMerge(rest)
  if (sub === 'branch') return parseBranch(rest, ctx)
  if (sub === 'checkout' || sub === 'switch') return parseCheckout(rest)
  if (sub === 'send-pack') return parseSendPack(rest)
  if (sub === 'update-ref') return parseUpdateRef(rest)
  if (sub === 'symbolic-ref') return parseSymbolicRef(rest)
  if (sub === 'cherry-pick' || sub === 'revert') return parseCherryPickLike(rest)
  if (sub === 'reset') return parseReset(rest)
  if (sub === 'filter-branch') return [{ kind: 'ref-move' }]
  if (sub === 'add') return parseAdd(rest)
  if (sub === 'stash') return parseStash(rest)
  if (sub === 'restore') return parseRestore(rest)
  if (sub === 'rebase') return parseRebase(rest)
  if (sub === 'commit') return parseCommit(rest)
  if (sub === 'config') return parseConfig(rest, ctx, depth, scope)
  return [{ kind: 'other' }]
}

/** reset 移动当前分支 tip; --hard 同时清理工作区 */
function parseReset(args: string[]): Classified[] {
  if (args.some((a) => a === '--hard')) return [{ kind: 'ref-move', cleanWorktree: true }]
  return [{ kind: 'ref-move' }]
}

/** add 全量暂存识别(. / -A / --all / -u / --update): 含模拟/交互/部分暂存旗标时绝不置 stagesAll */
function parseAdd(args: string[]): Classified[] {
  const hasDryOrPartial = args.some(
    (a) =>
      a === '--dry-run' ||
      a === '--intent-to-add' ||
      a === '--patch' ||
      a === '--interactive' ||
      a === '--edit' ||
      (a.startsWith('-') && !a.startsWith('--') && /[nNpie]/.test(a.slice(1))),
  )
  if (hasDryOrPartial) return [{ kind: 'other' }]
  if (args.some((a) => a === '.' || a === '-A' || a === '--all' || a === '-u' || a === '--update')) {
    return [{ kind: 'other', stagesAll: true }]
  }
  return [{ kind: 'other' }]
}

/** stash 仅完整暂存(无参 / push / save 且无部分暂存旗标与 pathspec)清理工作区 */
function parseStash(args: string[]): Classified[] {
  let sub: string | null = null
  let partial = false
  let hasPathspec = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') {
      hasPathspec = true
      break
    }
    if (a === '-m' || a === '--message') {
      i++
      continue
    }
    if (a === '--keep-index' || a === '--patch' || a === '--staged') {
      partial = true
      continue
    }
    if (a.startsWith('--')) continue
    if (a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) {
        if (ch === 'k' || ch === 'p' || ch === 'S') partial = true
        if (ch === 'm') break
      }
      continue
    }
    if (sub == null) {
      sub = a
    } else if (sub === 'push') {
      hasPathspec = true
    }
  }
  if (partial) return [{ kind: 'other' }]
  if (sub == null || sub === 'push') return hasPathspec ? [{ kind: 'other' }] : [{ kind: 'other', cleanWorktree: true }]
  if (sub === 'save') return [{ kind: 'other', cleanWorktree: true }]
  return [{ kind: 'other' }]
}

/** restore 放弃本地修改 */
function parseRestore(_args: string[]): Classified[] {
  return [{ kind: 'other', cleanWorktree: true }]
}

/** rebase 移动当前分支 ref; abort/continue/skip 等恢复类旗标不移动(放行, 避免把用户困在中途态) */
function parseRebase(args: string[]): Classified[] {
  const RESUME: ReadonlySet<string> = new Set(['--abort', '--continue', '--skip', '--quit', '--edit-todo'])
  if (args.some((a) => RESUME.has(a))) return [{ kind: 'other' }]
  return [{ kind: 'ref-move' }]
}

const COMMIT_VALUE_FLAGS: ReadonlySet<string> = new Set([
  '-m', '--message', '-F', '--file', '-c', '-C', '--reuse-message', '--reedit-message',
  '--fixup', '--squash', '-t', '--template', '--author', '--date', '--cleanup',
])
const COMMIT_VALUE_SHORT_CHARS: ReadonlySet<string> = new Set(['m', 'F', 'c', 'C', 't', 'u', 'S'])
const COMMIT_DRY_RUN_FLAGS: ReadonlySet<string> = new Set([
  '--dry-run', '--short', '--porcelain', '--long', '--help',
])

/** commit 产生新提交: 预览/帮助旗标(--dry-run/--short/--porcelain/--long/-h/--help)不提交也不清理工作区; -a/--all 清全部已追踪, 否则仅清 staged */
function parseCommit(args: string[]): Classified[] {
  let amend = false
  let all = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (COMMIT_VALUE_FLAGS.has(a)) {
      i++
      continue
    }
    if (COMMIT_DRY_RUN_FLAGS.has(a)) {
      return [{ kind: 'other' }]
    }
    if (a === '--amend') {
      amend = true
      continue
    }
    if (a === '--all') {
      all = true
      continue
    }
    if (a.startsWith('-') && !a.startsWith('--')) {
      for (const ch of a.slice(1)) {
        if (ch === 'h') return [{ kind: 'other' }]
        if (ch === 'a') all = true
        if (COMMIT_VALUE_SHORT_CHARS.has(ch)) break
      }
    }
  }
  const cleanScope = all ? 'all' : 'staged'
  if (amend) return [{ kind: 'ref-move', cleanWorktree: true, cleanScope }]
  return [{ kind: 'other', cleanWorktree: true, cleanScope }]
}

/**
 * cherry-pick/revert 会在当前分支上新提交 → 改写当前 tip, 收编为 ref-move
 * (受保护分支上拒绝, 与 reset/rebase 同型);
 * -n/--no-commit 只改工作树与索引(不移动 tip)与恢复类旗标(abort/continue 等)放行。
 */
function parseCherryPickLike(args: string[]): Classified[] {
  const RESUME: ReadonlySet<string> = new Set(['--abort', '--continue', '--skip', '--quit'])
  if (args.some((a) => a === '-n' || a === '--no-commit' || RESUME.has(a))) return [{ kind: 'other' }]
  return [{ kind: 'ref-move' }]
}

/** git config 的取值旗标(下一参数是它的值): 逐参消费, 否则键位错位(如 -f .git/config 会把路径当成键) */
const CONFIG_VALUE_FLAGS: ReadonlySet<string> = new Set(['-f', '--file', '--type', '--blob', '--comment'])

/**
 * git config: 写入 alias.<name> 时按别名值分类 —— 值是一条 git 子命令(或 ! 开头的 shell 脚本),
 * 用别名封装 push/merge 等命令即绕过意图识别, 故按真实语义送门禁。
 * 查询(无值)/删除(--unset)/非 alias 键不产生命令语义 → other。
 */
function parseConfig(args: string[], ctx: ClassifyContext, depth: number, scope: AliasScope): Classified[] {
  const positional: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (CONFIG_VALUE_FLAGS.has(a)) {
      i++
      continue
    }
    if (a.startsWith('-')) continue
    positional.push(a)
  }
  const key = positional[0]
  if (!key || !/^alias\./i.test(key)) return [{ kind: 'other' }]
  const value = positional.slice(1).join(' ')
  if (!value) return [{ kind: 'other' }]
  const tokens = tokenize(value)
  if (tokens.length > MAX_ALIAS_VALUE_TOKENS) return [{ kind: 'alias-smuggle' }]
  if (value.startsWith('!')) return withoutSimulationEffects(classifyDepth(value.slice(1), ctx, depth, scope))
  return withoutSimulationEffects(classifyGit(tokens, ctx, depth, scope))
}

/**
 * 别名写入只改配置文件, 不切换分支也不改动工作区 —— 剥离模拟字段。
 * 否则 evaluateCommand 会按被篡改的分支/干净状态判定后续段:
 * 实测 `git config alias.co 'checkout feature/x'; git push origin HEAD` 可借此放行受保护分支推送。
 */
function withoutSimulationEffects(items: Classified[]): Classified[] {
  return items.map((c) => {
    if (c.kind === 'checkout') return { kind: 'checkout', branch: null }
    if ('cleanWorktree' in c && c.cleanWorktree === true) return { ...c, cleanWorktree: false }
    if ('stagesAll' in c && c.stagesAll === true) return { ...c, stagesAll: false }
    return c
  })
}

/**
 * shell 别名(! 前缀)的参数传递: git 把调用点参数作为位置参数追加给别名命令
 * (值中已含 $@/$1 等占位符时由占位符自身展开, git 不再追加)。
 * 此处按「去掉占位符 + 追加调用点参数」近似, 偏差方向为更严格(可能多出 refspec), 与安全工具宁可从严的取向一致。
 */
function expandShellAlias(script: string, rest: string[]): string {
  const stripped = script.replace(/\$\{?[@*]\}?|\$\{?[1-9]\}?/g, ' ')
  return [stripped, ...rest].join(' ')
}

/**
 * 记录 -c 传入的别名定义(alias.<name>=<value>)。
 * git 配置的 section 与键名大小写不敏感(实测 `git -c ALIAS.z=version z` 可执行), 故键统一小写。
 */
function collectAlias(kv: string | undefined, out: Map<string, string>): void {
  const m = kv ? /^alias\.([^=]+)=([\s\S]*)$/i.exec(kv) : null
  if (m) out.set(m[1].toLowerCase(), m[2])
}

/** git 全局选项: 带值(下一参数是它的值) / 不带值 —— stripGlobalOptions 与 resolveSegmentCwds 共用 */
const GIT_VALUE_OPTIONS: ReadonlySet<string> = new Set(['-C', '-c', '--config-env', '--git-dir', '--work-tree', '--namespace', '--super-prefix'])
const GIT_BARE_OPTIONS: ReadonlySet<string> = new Set(['--bare', '--no-pager', '--no-optional-locks', '--paginate', '--no-replace-objects', '--literal-pathspecs', '-p', '-P'])

/**
 * 剥离子命令前的全局选项(-C <path> / -c <k=v> / --git-dir 等), 否则 git -C . push 会被判 other。
 * 同时收集 -c 定义的别名: git -c alias.z=push z origin main 等价于 git push origin main,
 * 不收集则别名词被判为 other 而放行(见 tests/classify.spec.ts「git -c 别名展开」)。
 * 含 `=` 值的长选项一律跳过: 白名单之外的(如 --exec-path=/x)同样不应让子命令定位失败。
 */
function stripGlobalOptions(args: string[]): { rest: string[]; aliases: Map<string, string> } {
  const aliases = new Map<string, string>()
  let i = 0
  while (i < args.length) {
    const a = args[i]
    if (GIT_BARE_OPTIONS.has(a) || /^--[\w-]+=/.test(a)) {
      i++
      continue
    }
    if (a.startsWith('-C') && a.length > 2) {
      i++
      continue
    }
    if (a.startsWith('-c') && a.length > 2) {
      collectAlias(a.slice(2), aliases)
      i++
      continue
    }
    if (GIT_VALUE_OPTIONS.has(a)) {
      if (a === '-c') collectAlias(args[i + 1], aliases)
      i += 2
      continue
    }
    break
  }
  return { rest: args.slice(i), aliases }
}

const CHECKOUT_VALUE_OPTIONS: ReadonlySet<string> = new Set([
  '--orphan', '--conflict', '-U', '--unified', '--inter-hunk-context', '--pathspec-from-file',
])
const CHECKOUT_CLUSTER_FLAGS: ReadonlySet<string> = new Set(['f', 't', 'q', 'm', 'l'])

/**
 * 分支切换(全参数扫描): 普通切换/-b/-c/--create 新建 → checkout(放行, 分支状态由 evaluateCommand 模拟);
 * -B/-C/--force-create 强制重建会静默移动/重建既有 ref(可波及受保护分支), 目标名单独送 ref-update 门禁,
 * 门禁放行后仍按 checkout 模拟切换(两段任一 deny 即整体拦截)。
 * 短旗标簇(-Bf/-fB/-bt 等)扫描 b/B/c/C 视同对应形态; 文件模式(--)或 --detach/-d 返回 branch: null。
 */
function parseCheckout(args: string[]): Classified[] {
  let createMode: 'create' | 'force' | null = null
  let createName: string | null = null
  let detach = false
  let seenDoubleDash = false
  const positionals: string[] = []

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (seenDoubleDash) {
      positionals.push(a)
      continue
    }
    if (a === '--') {
      seenDoubleDash = true
      continue
    }
    if (CHECKOUT_VALUE_OPTIONS.has(a)) {
      i++
      continue
    }
    if (a === '--detach' || a === '-d') {
      detach = true
      continue
    }
    if (a === '--force-create') {
      createMode = 'force'
      if (args[i + 1] != null && !args[i + 1].startsWith('-')) createName = args[++i]
      continue
    }
    if (a.startsWith('--force-create=')) {
      createMode = 'force'
      createName = a.slice('--force-create='.length) || null
      continue
    }
    if (a === '--create') {
      createMode = createMode ?? 'create'
      if (args[i + 1] != null && !args[i + 1].startsWith('-')) createName = args[++i]
      continue
    }
    if (a.startsWith('--create=')) {
      createMode = createMode ?? 'create'
      createName = a.slice('--create='.length) || null
      continue
    }
    if (a.startsWith('--')) continue
    if (a.startsWith('-') && a.length > 1) {
      const flags = a.slice(1)
      for (let k = 0; k < flags.length; k++) {
        const ch = flags[k]
        if (ch === 'd') {
          detach = true
        } else if (ch === 'B' || ch === 'C' || ch === 'b' || ch === 'c') {
          createMode = ch === 'B' || ch === 'C' ? 'force' : (createMode ?? 'create')
          const inline = flags.slice(k + 1)
          const isTrailingClusterFlags =
            inline.length > 0 &&
            [...inline].every((c) => CHECKOUT_CLUSTER_FLAGS.has(c)) &&
            args[i + 1] != null &&
            !args[i + 1].startsWith('-')
          if (inline.length > 0 && !isTrailingClusterFlags) {
            createName = inline
          } else if (args[i + 1] != null && !args[i + 1].startsWith('-')) {
            createName = args[++i]
          }
          break
        }
      }
      continue
    }
    positionals.push(a)
  }

  if (createMode != null) {
    if (!createName) return [{ kind: 'checkout', branch: null }]
    return createMode === 'force' ? forceRecreateOut(createName) : [{ kind: 'checkout', branch: createName }]
  }
  if (seenDoubleDash || detach) return [{ kind: 'checkout', branch: null }]
  if (positionals.length === 1 && positionals[0] !== '-') return [{ kind: 'checkout', branch: positionals[0] }]
  return [{ kind: 'checkout', branch: null }]
}

/** -B/-C(及含 B/C 的旗标簇)的产出: 目标 ref 送 ref-update, 再按 checkout 模拟切换 */
function forceRecreateOut(name: string): Classified[] {
  return [
    { kind: 'ref-update', branch: stripRefPrefix(name), delete: false },
    { kind: 'checkout', branch: name },
  ]
}

const PUSH_VALUE_FLAGS: ReadonlySet<string> = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec'])

function parsePush(args: string[], ctx: ClassifyContext): Classified[] {
  let force = false
  let isDelete = false
  let all = false
  let hasTags = false
  const nonFlag: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (PUSH_VALUE_FLAGS.has(a)) {
      i++
      continue
    }
    if (a === '-f' || a === '--force' || a === '--force-with-lease' || a.startsWith('--force-with-lease=')) {
      force = true
    } else if (a === '--delete' || a === '-d') {
      isDelete = true
    } else if (a === '--all' || a === '--mirror') {
      all = true
    } else if (a === '--tags') {
      hasTags = true
    } else if (a.startsWith('-')) {
      // 其余 flag 忽略
    } else {
      nonFlag.push(a)
    }
  }
  // --all/--mirror 推送全部本地分支(含受保护分支), 门禁一律拒绝
  if (all) return [{ kind: 'push', dst: null, force, delete: false, all: true }]
  // 仅当未同时指定 refspec 时, --tags 才属纯 tag 推送; 带 refspec(如 --tags origin develop)照常走 refspec 门禁
  if (hasTags && nonFlag.length <= 1) return [{ kind: 'other' }]
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

/** git update-ref 直改 refs(plumbing): 提取目标 ref(剥 refs/heads/ 前缀供角色比对); -d 为删除; --stdin 目标不可知置 null */
function parseUpdateRef(args: string[]): Classified[] {
  let isDelete = false
  let hasStdin = false
  let firstTarget: string | null = null
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-d') {
      isDelete = true
      continue
    }
    if (a === '--stdin') {
      hasStdin = true
      continue
    }
    if (a === '-m' || a === '--message') {
      i++ // 消费 -m 的值, 不能当作 ref
      continue
    }
    if (a.startsWith('-')) continue
    if (firstTarget == null) firstTarget = a
  }
  if (hasStdin) return [{ kind: 'ref-update', branch: null, delete: isDelete }]
  if (firstTarget != null) return [{ kind: 'ref-update', branch: stripRefPrefix(firstTarget), delete: isDelete }]
  return [{ kind: 'other' }]
}

/**
 * git symbolic-ref 直改 symbolic refs(plumbing 绕行面):
 * - 查询形态(symbolic-ref <name> / --short 等单参)不改变任何 ref → other;
 * - 双参重定向(symbolic-ref <name> <ref>)把 name 指向别处, 目标名送 ref-update;
 * - -d/--delete 删除该 ref, 同样送 ref-update。
 */
function parseSymbolicRef(args: string[]): Classified[] {
  let isDelete = false
  const nonFlag: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-d' || a === '--delete') {
      isDelete = true
      continue
    }
    if (a === '-m' || a === '--message') {
      i++ // 消费 -m 的值, 不能当作 ref
      continue
    }
    if (a.startsWith('-')) continue
    nonFlag.push(a)
  }
  if (!isDelete && nonFlag.length < 2) return [{ kind: 'other' }]
  if (isDelete && nonFlag.length === 0) return [{ kind: 'other' }]
  return [{ kind: 'ref-update', branch: stripRefPrefix(nonFlag[0]), delete: isDelete }]
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
 * - 复制(-c/-C/--copy): 复制目标为末参数, 送 ref-update 拦截覆盖受保护分支
 * - 强制复位(-f/--force 单独使用): git branch -f <name> <commit> 静默移动分支指针 → ref-update
 */
function parseBranch(args: string[], ctx: ClassifyContext): Classified[] {
  let deleteFlag = false
  let force = false
  let move = false
  let copy = false
  const names: string[] = []
  for (const a of args) {
    if (a.startsWith('--')) {
      if (a === '--delete') deleteFlag = true
      else if (a === '--force') force = true
      else if (a === '--move') move = true
      else if (a === '--copy') copy = true
      // 其余长旗标(--show-current/--edit-color 等)忽略
    } else if (a.startsWith('-') && a.length > 1) {
      // 短旗标簇(-df / -dF 等): 逐字符识别
      for (const ch of a.slice(1)) {
        if (ch === 'd') deleteFlag = true
        else if (ch === 'D') { deleteFlag = true; force = true }
        else if (ch === 'm') move = true
        else if (ch === 'M') { move = true; force = true }
        else if (ch === 'c') copy = true
        else if (ch === 'C') { copy = true; force = true }
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
  // 复制: branch -c/-C [<old>] <new>; 目标分支若受保护必须拦截
  if (copy) {
    const to = names.length >= 1 ? names[names.length - 1] : null
    return to ? [{ kind: 'ref-update', branch: to, delete: false }] : [{ kind: 'other' }]
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
  if (action === 'create') return parsePrCreate(rest, ['--base', '-B'], ['--head', '-H'])
  if (action === 'merge') return parsePrMerge(rest)
  return [{ kind: 'other' }]
}

/** GitLab: glab mr create --target-branch <b> / glab mr merge <id> */
function classifyGlab(args: string[]): Classified[] {
  const [sub, action, ...rest] = args
  if (sub !== 'mr') return [{ kind: 'other' }]
  if (action === 'create') return parsePrCreate(rest, ['--target-branch'], ['--source-branch'])
  if (action === 'merge') return parsePrMerge(rest)
  return [{ kind: 'other' }]
}

function extractFlagValue(args: string[], i: number, flags: string[]): { value: string | null; consumedNext: boolean } | null {
  const a = args[i]
  const flag = flags.find(
    (f) => a === f || a.startsWith(`${f}=`) || (f.length === 2 && !f.startsWith('--') && a.startsWith(f) && a.length > 2),
  )
  if (!flag) return null
  if (a === flag) {
    const value = args[i + 1]
    if (value && !value.startsWith('-')) return { value, consumedNext: true }
    return { value: null, consumedNext: false }
  }
  if (a.startsWith(`${flag}=`)) {
    return { value: a.slice(flag.length + 1) || null, consumedNext: false }
  }
  return { value: a.slice(flag.length) || null, consumedNext: false }
}

function parsePrCreate(args: string[], targetFlags: string[], headFlags: string[]): Classified[] {
  if (hasHelpFlag(args)) return [{ kind: 'other' }]
  const out: PrCreateClassified = { kind: 'pr-create', target: null }
  for (let i = 0; i < args.length; i++) {
    const targetHit = extractFlagValue(args, i, targetFlags)
    if (targetHit) {
      out.target = targetHit.value
      if (targetHit.consumedNext) i++
      continue
    }
    const headHit = extractFlagValue(args, i, headFlags)
    if (headHit) {
      if (headHit.value != null) {
        // GitHub 支持 owner:branch 形态, 剥离 owner: 前缀再作分支角色比对
        const colon = headHit.value.indexOf(':')
        out.head = (colon >= 0 ? headHit.value.slice(colon + 1) : headHit.value) || null
      } else {
        out.head = null
      }
      if (headHit.consumedNext) i++
    }
  }
  return [out]
}

const PR_MERGE_VALUE_FLAGS: ReadonlySet<string> = new Set([
  '-t', '--subject', '-b', '--body', '-F', '--body-file', '-R', '--repo', '--match-head-commit',
])

function parsePrMerge(args: string[]): Classified[] {
  if (hasHelpFlag(args)) return [{ kind: 'other' }]
  let target: string | null = null
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (PR_MERGE_VALUE_FLAGS.has(a)) {
      i++
      continue
    }
    if (a.startsWith('-')) continue
    target = a
    break
  }
  // 完整保留数字 ID / 完整 PR-MR URL / 分支名, 使 gh/glab view <url> 按目标仓精确查询
  const out: PrMergeClassified = { kind: 'pr-merge', pr: target }
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
