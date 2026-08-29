// 接线层: 把各客户端默认 hook 落位到工程/全局配置文件(wire/setup 共用)。
// 非破坏性: 已存在同命令条目则跳过; --unwire 精确移除; --dry-run 只打印不写。
// 文件位置与命令形态以 .agents/hooks/references/*.md 为准(与官方协议对齐, 已核实)。
// 日志/异常信息按项目规范用英文; 用户可见文案走 i18n(cli 层)。

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ClientId } from './types'

export type WireScope = 'project' | 'global'

export interface WireClientSpec {
  client: ClientId
  /** 工程级相对路径(相对仓库根) */
  projectPath: string
  /** 全局绝对路径(写入前须显式确认) */
  globalPath: () => string
  /** 实验支持: 落位后需真机核验 */
  experimental?: boolean
}

const CLIENTS: ClientId[] = ['dsh', 'claude', 'codex', 'opencode', 'antigravity', 'pi']

export function isWireClient(v: string): v is ClientId {
  return (CLIENTS as string[]).includes(v)
}

/** 各客户端的 hook 落位规格(dsh/pi 无 hook 文件, 仅输出接入引导) */
export const WIRE_CLIENTS: ReadonlyArray<WireClientSpec> = [
  { client: 'claude', projectPath: '.claude/settings.json', globalPath: () => join(homedir(), '.claude', 'settings.json') },
  { client: 'codex', projectPath: '.codex/hooks.json', globalPath: () => join(homedir(), '.codex', 'hooks.json') },
  { client: 'opencode', projectPath: '.opencode/hook/hooks.yaml', globalPath: () => join(homedir(), '.config', 'opencode', 'hook', 'hooks.yaml') },
  { client: 'antigravity', projectPath: '.agents/hooks.json', globalPath: () => join(homedir(), '.gemini', 'config', 'hooks.json'), experimental: true },
  { client: 'dsh', projectPath: '', globalPath: () => '' },
  { client: 'pi', projectPath: '', globalPath: () => '' },
]

/** 各 stdin-hook 客户端的 hook 命令(与 references/*.md 逐一对应; codex/antigravity 用相对 bin/...) */
const COMMANDS: Record<'claude' | 'codex' | 'opencode' | 'antigravity', string> = {
  claude: 'node ${CLAUDE_PROJECT_DIR}/bin/gitflow-guard.mjs check --platform claude',
  codex: 'node bin/gitflow-guard.mjs check --platform codex',
  opencode: 'node "$OPENCODE_PROJECT_DIR/bin/gitflow-guard.mjs" check --platform opencode',
  antigravity: 'node bin/gitflow-guard.mjs check --platform antigravity',
}

/** OpenCode YAML 模板(顶层 hooks: + 语义 id gitflow-guard) */
const OPENCODE_TEMPLATE = [
  'hooks:',
  '  - id: gitflow-guard',
  '    event: tool.before.bash',
  '    actions:',
  '      - bash: |',
  `          ${COMMANDS.opencode}`,
].join('\n')

const YAML_ID_GUARD = /^\s*- id: gitflow-guard\s*$/m
const YAML_ID_ANY = /^\s*- id:/m

export type WireResult = 'added' | 'exists' | 'removed' | 'absent'

/** 读取文本文件; 缺失返回 null(其余异常也视为缺失, 决策保守) */
async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}

/** JSON 递归搜索: 是否已含该命令(任意形状, 幂等判重) */
function jsonContains(obj: unknown, needle: string): boolean {
  if (typeof obj === 'string') return obj === needle
  if (Array.isArray(obj)) return obj.some((x) => jsonContains(x, needle))
  if (obj !== null && typeof obj === 'object') return Object.values(obj).some((x) => jsonContains(x, needle))
  return false
}

function parseJsonOrThrow(path: string, raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    return parsed as Record<string, unknown>
  } catch {
    throw new Error(`invalid JSON in ${path} — refusing to modify it`)
  }
}

async function writeJson(path: string, obj: Record<string, unknown>): Promise<void> {
  await writeText(path, `${JSON.stringify(obj, null, 2)}\n`)
}

/** JSON 客户端(claude/codex/antigravity)新增 hook 条目; 非破坏性合并, 同命令已存在则跳过 */
async function addJsonEntry(path: string, client: 'claude' | 'codex' | 'antigravity', dryRun: boolean): Promise<WireResult> {
  const cmd = COMMANDS[client]
  const raw = await readText(path)
  const obj = raw === null ? {} : parseJsonOrThrow(path, raw)
  if (jsonContains(obj, cmd)) return 'exists'
  const entry =
    client === 'antigravity'
      ? { matcher: 'run_command', hooks: [{ type: 'command', command: cmd }] }
      : { matcher: client === 'codex' ? '^Bash$' : 'Bash', hooks: [{ type: 'command', command: cmd }] }
  if (client === 'antigravity') {
    const block = (obj['gitflow-guard'] ??= { PreToolUse: [] }) as { PreToolUse: unknown }
    if (!Array.isArray(block.PreToolUse)) throw new Error(`invalid ${path}: gitflow-guard.PreToolUse must be an array`)
    block.PreToolUse.push(entry)
  } else {
    const hooksObj = (obj['hooks'] ??= {}) as Record<string, unknown>
    const arr = (hooksObj['PreToolUse'] ??= []) as unknown[]
    if (!Array.isArray(arr)) throw new Error(`invalid ${path}: hooks.PreToolUse must be an array`)
    arr.push(entry)
  }
  if (!dryRun) await writeJson(path, obj)
  return 'added'
}

/** JSON 客户端移除本插件条目; 不动其他内容 */
async function removeJsonEntry(path: string, client: 'claude' | 'codex' | 'antigravity', dryRun: boolean): Promise<WireResult> {
  const cmd = COMMANDS[client]
  const raw = await readText(path)
  if (raw === null) return 'absent'
  const obj = parseJsonOrThrow(path, raw)
  if (!jsonContains(obj, cmd)) return 'absent'
  if (client === 'antigravity') {
    delete obj['gitflow-guard']
  } else {
    const hooksObj = obj['hooks'] as Record<string, unknown> | undefined
    const arr = hooksObj?.['PreToolUse']
    if (Array.isArray(arr)) {
      const rest = arr.filter((e) => !((e as { hooks?: Array<{ command?: unknown }> })?.hooks ?? []).some((h) => h?.command === cmd))
      if (rest.length === 0) delete hooksObj!['PreToolUse']
      else hooksObj!['PreToolUse'] = rest
      if (hooksObj && Object.keys(hooksObj).length === 0) delete obj['hooks']
    }
  }
  if (!dryRun) await writeJson(path, obj)
  return 'removed'
}

/** OpenCode YAML: hooks: 列表按语义 id gitflow-guard 判重/落位 */
async function addYamlEntry(path: string, dryRun: boolean): Promise<WireResult> {
  const raw = await readText(path)
  if (raw !== null) {
    if (YAML_ID_GUARD.test(raw)) return 'exists'
    const lines = raw.split('\n')
    const hooksIdx = lines.findIndex((l) => /^hooks:\s*$/.test(l))
    const block = OPENCODE_TEMPLATE.split('\n').slice(1) // 去掉顶层 hooks: 行, 追加到已有列表
    if (hooksIdx === -1) {
      const joined = [...lines, '', ...block].join('\n')
      if (!dryRun) await writeText(path, joined)
      return 'added'
    }
    lines.splice(hooksIdx + 1, 0, ...block)
    if (!dryRun) await writeText(path, lines.join('\n'))
    return 'added'
  }
  if (!dryRun) await writeText(path, OPENCODE_TEMPLATE)
  return 'added'
}

/** OpenCode YAML: 移除 gitflow-guard 块; 若列表清空则连顶层 hooks: 一并清理 */
async function removeYamlEntry(path: string, dryRun: boolean): Promise<WireResult> {
  const raw = await readText(path)
  if (raw === null) return 'absent'
  if (!YAML_ID_GUARD.test(raw)) return 'absent'
  const lines = raw.split('\n')
  const start = lines.findIndex((l) => YAML_ID_GUARD.test(l))
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (YAML_ID_ANY.test(lines[i])) {
      end = i
      break
    }
  }
  let rest = [...lines.slice(0, start), ...lines.slice(end)]
  if (!rest.some((l) => YAML_ID_ANY.test(l))) {
    rest = rest.filter((l) => !/^hooks:\s*$/.test(l))
  }
  const text = rest.join('\n')
  if (!dryRun) await writeText(path, text)
  return 'removed'
}

/** 执行一次 wire 落位/移除/预览; dsh/pi 由上层直接短路, 不进这里 */
export async function applyWire(client: ClientId, path: string, unwire: boolean, dryRun: boolean): Promise<WireResult> {
  if (client === 'opencode') return unwire ? removeYamlEntry(path, dryRun) : addYamlEntry(path, dryRun)
  return unwire ? removeJsonEntry(path, client as 'claude' | 'codex' | 'antigravity', dryRun) : addJsonEntry(path, client as 'claude' | 'codex' | 'antigravity', dryRun)
}

/** 只读探测: 该配置文件是否已含本插件 hook(status 的接线提示用) */
export async function isWired(client: ClientId, path: string): Promise<boolean> {
  const raw = await readText(path)
  if (raw === null) return false
  if (client === 'opencode') return YAML_ID_GUARD.test(raw)
  try {
    return jsonContains(JSON.parse(raw), COMMANDS[client as 'claude' | 'codex' | 'antigravity'])
  } catch {
    return false
  }
}
