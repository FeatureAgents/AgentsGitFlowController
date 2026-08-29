// 接线层: 把各客户端默认 hook 落位到工程/全局配置文件(wire/setup 共用)。
// 非破坏性: 已存在同命令条目则跳过; --unwire 精确移除; --dry-run 只打印不写。
// 文件位置与命令形态以 .agents/hooks/references/*.md 为准(与官方协议对齐, 已核实)。
// 日志/异常信息按项目规范用英文; 用户可见文案走 i18n(cli 层)。

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

/** 各客户端的 hook 落位规格(dsh/pi 无 hook 文件, 仅输出接入引导)
 *  opencode: OpenCode 1.18+ 已废弃 hooks.yaml(实机零调用, 见 docs/e2e/TestResult/opencode.md),
 *  官方扩展点为 plugins 目录 —— wire 把随包插件 opencode/gitflow-guard.ts 复制到插件目录。 */
export const WIRE_CLIENTS: ReadonlyArray<WireClientSpec> = [
  { client: 'claude', projectPath: '.claude/settings.json', globalPath: () => join(homedir(), '.claude', 'settings.json') },
  { client: 'codex', projectPath: '.codex/hooks.json', globalPath: () => join(homedir(), '.codex', 'hooks.json') },
  { client: 'opencode', projectPath: '.opencode/plugins/gitflow-guard.ts', globalPath: () => join(homedir(), '.config', 'opencode', 'plugins', 'gitflow-guard.ts') },
  { client: 'antigravity', projectPath: '.agents/hooks.json', globalPath: () => join(homedir(), '.gemini', 'config', 'hooks.json') },
  { client: 'dsh', projectPath: '', globalPath: () => '' },
  { client: 'pi', projectPath: '', globalPath: () => '' },
]

/** 随包发布的 OpenCode 插件源文件(wire --client opencode 复制到插件目录; dev 下即仓库 opencode/) */
const OPENCODE_PLUGIN_SOURCE = fileURLToPath(new URL('../opencode/gitflow-guard.ts', import.meta.url))

/** 各 JSON 客户端的 hook 命令(与 references/*.md 逐一对应)。
 *  antigravity 必须绝对路径: agy hook 进程 cwd = hook 配置文件所在目录(TestResult/antigravity.md AGY-D2),
 *  相对 bin/... 会解析为 .agents/bin/... → MODULE_NOT_FOUND; 全局落位无仓库根, 用 PATH 上的 gitflow-guard。 */
function commandFor(client: 'claude' | 'codex' | 'antigravity', repoRoot: string | null): string {
  switch (client) {
    case 'claude':
      return 'node ${CLAUDE_PROJECT_DIR}/bin/gitflow-guard.mjs check --platform claude'
    case 'codex':
      return 'node bin/gitflow-guard.mjs check --platform codex'
    case 'antigravity':
      return repoRoot
        ? `node ${join(repoRoot, 'bin', 'gitflow-guard.mjs')} check --platform antigravity`
        : 'gitflow-guard check --platform antigravity'
  }
}

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

/** JSON 递归搜索(谓词版): 用于旧格式条目的柔性识别 */
function jsonContainsBy(obj: unknown, pred: (v: unknown) => boolean): boolean {
  if (pred(obj)) return true
  if (Array.isArray(obj)) return obj.some((x) => jsonContainsBy(x, pred))
  if (obj !== null && typeof obj === 'object') return Object.values(obj).some((x) => jsonContainsBy(x, pred))
  return false
}

/** 判断命令是否为本插件 antigravity 条目: 新格式绝对路径 node <root>/bin/gitflow-guard.mjs … 或
 *  AGY-D2 之前的旧相对格式 node bin/gitflow-guard.mjs …, 或全局 PATH 形态(无 .mjs);
 *  格式演进后旧条目仍能被识别/替换/移除, 避免新旧双条并存。 */
function antigravityCommandish(cmd: unknown): boolean {
  if (typeof cmd !== 'string') return false
  return cmd.includes('gitflow-guard.mjs check --platform antigravity') || cmd === 'gitflow-guard check --platform antigravity'
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
async function addJsonEntry(path: string, client: 'claude' | 'codex' | 'antigravity', dryRun: boolean, repoRoot: string | null): Promise<WireResult> {
  const cmd = commandFor(client, repoRoot)
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
    const entries = block.PreToolUse as unknown[]
    if (entries.some((e) => jsonContainsBy(e, (v) => v === cmd))) return 'exists'
    // 旧格式(AGY-D2 之前, 相对 bin 路径)条目替换为新格式——避免新旧双条并存(旧条 MODULE_NOT_FOUND 污染会话)
    const next = entries.filter((e) => !jsonContainsBy(e, antigravityCommandish))
    next.push(entry)
    block.PreToolUse = next
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
async function removeJsonEntry(path: string, client: 'claude' | 'codex' | 'antigravity', dryRun: boolean, repoRoot: string | null): Promise<WireResult> {
  const cmd = commandFor(client, repoRoot)
  const raw = await readText(path)
  if (raw === null) return 'absent'
  const obj = parseJsonOrThrow(path, raw)
  if (client === 'antigravity') {
    // 新旧格式都算本插件条目: 旧相对格式(AGY-D2 前)也能被 unwire 移除
    const block = obj['gitflow-guard']
    if (!block || !jsonContainsBy(block, antigravityCommandish)) return 'absent'
    delete obj['gitflow-guard']
  } else {
    if (!jsonContains(obj, cmd)) return 'absent'
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

/** OpenCode 插件: 复制随包插件文件; 已存在同文件视为已接线(幂等) */
async function addPluginFile(path: string, dryRun: boolean): Promise<WireResult> {
  if ((await readText(path)) !== null) return 'exists'
  let source: string
  try {
    source = await readFile(OPENCODE_PLUGIN_SOURCE, 'utf8')
  } catch {
    // 复制挂载形态(bin+lib 拷进项目)下包内 opencode/ 不在现场: 明确指路, 不静默
    throw new Error(
      `cannot read bundled opencode plugin source at ${OPENCODE_PLUGIN_SOURCE} — install the package (npm i -g agents-gitflow-guard) or copy opencode/gitflow-guard.ts into the project's .opencode/plugins/ manually`,
    )
  }
  if (!dryRun) await writeText(path, source)
  return 'added'
}

/** OpenCode 插件: 删除插件文件; 不动其他插件 */
async function removePluginFile(path: string, dryRun: boolean): Promise<WireResult> {
  if ((await readText(path)) === null) return 'absent'
  if (!dryRun) await unlink(path)
  return 'removed'
}

/** 执行一次 wire 落位/移除/预览; dsh/pi 由上层直接短路, 不进这里 */
export async function applyWire(client: ClientId, path: string, unwire: boolean, dryRun: boolean, repoRoot: string | null = null): Promise<WireResult> {
  if (client === 'opencode') return unwire ? removePluginFile(path, dryRun) : addPluginFile(path, dryRun)
  return unwire
    ? removeJsonEntry(path, client as 'claude' | 'codex' | 'antigravity', dryRun, repoRoot)
    : addJsonEntry(path, client as 'claude' | 'codex' | 'antigravity', dryRun, repoRoot)
}

/** 只读探测: 该客户端是否已接线(opencode 判插件文件存在; JSON 客户端按命令精确匹配) */
export async function isWired(client: ClientId, path: string, repoRoot: string | null = null): Promise<boolean> {
  const raw = await readText(path)
  if (raw === null) return false
  if (client === 'opencode') return true
  try {
    return jsonContains(JSON.parse(raw), commandFor(client as 'claude' | 'codex' | 'antigravity', repoRoot))
  } catch {
    return false
  }
}