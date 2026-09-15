// 接线层: 把各客户端默认 hook 落位到工程/全局配置文件(wire/setup 共用)。
// 非破坏性: 已存在同命令条目则跳过; 任意历史形态的本插件条目迁移为当前 canonical; --unwire 精确移除; --dry-run 只打印不写。
// 命令形态: node <随包 runner 绝对路径> check --platform <client> —— 锚定「执行本次 wire 的那份包」
// (全局 npm / 项目 node_modules / npm link 开发仓 / bin+lib 拷贝挂载四种落位下均自洽), 目标项目零部署;
// 不依赖客户端变量展开(${*_PROJECT_DIR})、不依赖 hook 进程 cwd、不依赖 PATH(design.md 的绝对路径哲学)。
// 文件位置与命令形态以 .agents/hooks/references/*.md 为准(与官方协议对齐, 已核实)。
// 日志/异常信息按项目规范用英文; 用户可见文案走 i18n(cli 层)。

import { existsSync } from 'node:fs'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseCommentJson, stringify as stringifyCommentJson } from 'comment-json'
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

const CLIENTS: ClientId[] = ['dsh', 'claude', 'codex', 'opencode', 'antigravity', 'pi', 'codebuddy', 'zcode', 'cursor']

export function isWireClient(v: string): v is ClientId {
  return (CLIENTS as string[]).includes(v)
}

/** 随包 runner 的绝对路径: 本模块开发态位于 <repo>/src/, 构建后位于 <pkg>/lib/ —— 两种布局下
 *  ../bin/gitflow-guard.mjs 均指向随包 runner(与 OPENCODE_PLUGIN_SOURCE 同一手法)。 */
export function resolveRunnerPath(): string {
  return fileURLToPath(new URL('../bin/gitflow-guard.mjs', import.meta.url))
}

const RUNNER_PATH = resolveRunnerPath()

type JsonWireClient = 'claude' | 'codex' | 'antigravity' | 'codebuddy' | 'zcode' | 'cursor'

/** 钩子命令形态: node <runner 绝对路径> check --platform <client>。
 *  路径统一正斜杠(node 与各家 shell 在 Windows 均接受, 且免 JSON 反斜杠转义), 含空白时加双引号。
 *  仅接受常规安装路径(不含 shell 元字符): npm 全局/项目 node_modules 布局的磁盘路径天然满足。 */
export function guardCommand(runnerPath: string, client: JsonWireClient): string {
  const p = runnerPath.replace(/\\/g, '/')
  return `node ${/\s/.test(p) ? `"${p}"` : p} check --platform ${client}`
}

/** 本次 wire 写出的 canonical 命令 */
function currentCommand(client: JsonWireClient): string {
  return guardCommand(RUNNER_PATH, client)
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
  { client: 'codebuddy', projectPath: '.codebuddy/settings.json', globalPath: () => join(homedir(), '.codebuddy', 'settings.json') },
  { client: 'zcode', projectPath: '.zcode/config.json', globalPath: () => join(homedir(), '.zcode', 'cli', 'config.json') },
  { client: 'cursor', projectPath: '.cursor/hooks.json', globalPath: () => join(homedir(), '.cursor', 'hooks.json') },
]

/** 随包发布的 OpenCode 插件源文件(wire --client opencode 复制到插件目录; dev 下即仓库 opencode/) */
const OPENCODE_PLUGIN_SOURCE = fileURLToPath(new URL('../opencode/gitflow-guard.ts', import.meta.url))

export type WireResult = 'added' | 'migrated' | 'exists' | 'removed' | 'absent'

/** 本插件 hook 命令判别(任意历史形态): 引用 gitflow-guard 且带本平台 check 旗标即视为本插件条目
 *  —— 变量模板(${*_PROJECT_DIR}) / 相对路径(bin/...) / 仓库根绝对路径 / PATH shim 全部覆盖,
 *  wire 时统一替换为 canonical(不双条并存), unwire 时整条移除。 */
function guardCommandish(client: JsonWireClient, cmd: unknown): boolean {
  return typeof cmd === 'string' && cmd.includes('gitflow-guard') && cmd.includes(`check --platform ${client}`)
}

/** 条目承载的命令(cursor 为扁平 {command}, 其余为嵌套 {hooks:[{command}]}) */
function entryCommands(client: JsonWireClient, entry: unknown): unknown[] {
  if (client === 'cursor') return [(entry as { command?: unknown } | null)?.command]
  return ((entry as { hooks?: Array<{ command?: unknown }> } | null)?.hooks ?? []).map((h) => h?.command)
}

/** 本插件条目判别(条目级) */
function entryIsGuard(client: JsonWireClient, entry: unknown): boolean {
  return entryCommands(client, entry).some((c) => guardCommandish(client, c))
}

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

function parseJsonOrThrow(path: string, raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = parseCommentJson(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    return parsed as Record<string, unknown>
  } catch {
    throw new Error(`invalid JSON in ${path} — refusing to modify it`)
  }
}

async function writeJson(path: string, obj: Record<string, unknown>): Promise<void> {
  await writeText(path, `${stringifyCommentJson(obj, null, 2)}\n`)
}

function cleanGuardFromEntry(client: JsonWireClient, entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false
  const o = entry as { command?: unknown; hooks?: Array<{ command?: unknown }> }
  if (Array.isArray(o.hooks)) {
    const origLen = o.hooks.length
    o.hooks = o.hooks.filter((h) => !guardCommandish(client, h?.command))
    return o.hooks.length < origLen
  }
  return false
}

function entryIsEmpty(client: JsonWireClient, entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return true
  const o = entry as { command?: unknown; hooks?: Array<{ command?: unknown }> }
  if (client === 'cursor') {
    return guardCommandish(client, o.command)
  }
  if (Array.isArray(o.hooks)) {
    return o.hooks.length === 0
  }
  return guardCommandish(client, o.command)
}

function filterGuardItems(arr: unknown[], client: JsonWireClient): { cleaned: unknown[]; had: boolean } {
  let had = false
  const cleaned: unknown[] = []
  for (const item of arr) {
    if (client === 'cursor') {
      if (guardCommandish(client, (item as { command?: unknown })?.command)) {
        had = true
      } else {
        cleaned.push(item)
      }
      continue
    }
    const removedFromEntry = cleanGuardFromEntry(client, item)
    if (removedFromEntry) had = true
    // 仅回收"因摘除守卫而变空"的条目: 用户原有的空条目与非对象条目原样保留(非破坏性)
    if (removedFromEntry && entryIsEmpty(client, item)) continue
    cleaned.push(item)
  }
  return { cleaned, had }
}

/** 就地重写 hook 列表: 剔除本插件全部条目(任意历史形态), 追加 canonical 条目; 保留用户既有其他 hook; 返回是否原有本插件条目 */
function rewriteHookList(container: Record<string, unknown>, key: string, client: JsonWireClient, entry: unknown, path: string): boolean {
  const arr = (container[key] ??= []) as unknown[]
  if (!Array.isArray(arr)) throw new Error(`invalid ${path}: ${key} must be an array`)
  const { cleaned, had } = filterGuardItems(arr, client)
  container[key] = [...cleaned, entry]
  return had
}

/** JSON 客户端(claude/codex/antigravity/codebuddy/zcode/cursor)新增 hook 条目; 非破坏性合并;
 *  已有 canonical 且无旧形态 → 跳过; 有任意旧形态条目 → 迁移为 canonical(migrated)。 */
async function addJsonEntry(path: string, client: JsonWireClient, dryRun: boolean): Promise<WireResult> {
  const cmd = currentCommand(client)
  const raw = await readText(path)
  const obj = raw === null ? {} : parseJsonOrThrow(path, raw)
  if (jsonContains(obj, cmd) && !jsonContainsBy(obj, (v) => guardCommandish(client, v) && v !== cmd)) return 'exists'
  // 条目形状按客户端协议: antigravity/codex 系嵌套 {matcher, hooks:[{type,command}]}, cursor 扁平 {command}
  const entry =
    client === 'antigravity'
      ? { matcher: 'run_command', hooks: [{ type: 'command', command: cmd }] }
      : client === 'cursor'
        ? { command: cmd }
        : { matcher: client === 'claude' ? 'Bash' : '^Bash$', hooks: [{ type: 'command', command: cmd }] }
  let hadGuard: boolean
  if (client === 'antigravity') {
    const block = (obj['gitflow-guard'] ??= { PreToolUse: [] }) as { PreToolUse: unknown }
    if (!Array.isArray(block.PreToolUse)) throw new Error(`invalid ${path}: gitflow-guard.PreToolUse must be an array`)
    hadGuard = rewriteHookList(block as unknown as Record<string, unknown>, 'PreToolUse', client, entry, path)
  } else if (client === 'zcode') {
    const hooksObj = (obj['hooks'] ??= {}) as Record<string, unknown>
    hooksObj['enabled'] = true
    const eventsObj = (hooksObj['events'] ??= {}) as Record<string, unknown>
    hadGuard = rewriteHookList(eventsObj, 'PreToolUse', client, entry, path)
  } else if (client === 'cursor') {
    obj['version'] ??= 1
    const hooksObj = (obj['hooks'] ??= {}) as Record<string, unknown>
    hadGuard = rewriteHookList(hooksObj, 'beforeShellExecution', client, entry, path)
  } else {
    const hooksObj = (obj['hooks'] ??= {}) as Record<string, unknown>
    hadGuard = rewriteHookList(hooksObj, 'PreToolUse', client, entry, path)
  }
  if (!dryRun) await writeJson(path, obj)
  return hadGuard ? 'migrated' : 'added'
}

/** JSON 客户端移除本插件条目(任意历史形态); 细粒度过滤本插件命令, 保留用户其他 hook 与注释(序列化统一为 2 空格缩进) */
async function removeJsonEntry(path: string, client: JsonWireClient, dryRun: boolean): Promise<WireResult> {
  const raw = await readText(path)
  if (raw === null) return 'absent'
  const obj = parseJsonOrThrow(path, raw)
  if (client === 'antigravity') {
    // 顶层键内为"事件名 → 条目数组"结构: 逐数组细粒度摘除守卫, 保留用户自建的其他事件条目
    const block = obj['gitflow-guard'] as Record<string, unknown> | undefined
    if (!block) return 'absent'
    let had = false
    for (const [key, value] of Object.entries(block)) {
      if (!Array.isArray(value)) continue
      const res = filterGuardItems(value, client)
      if (res.had) had = true
      block[key] = res.cleaned
    }
    // 非数组位置残留的守卫命令(含 AGY-D2 前相对路径与 PATH 形态)无法细粒度摘除: 整键移除
    const guardOutsideArrays = jsonContainsBy(
      Object.fromEntries(Object.entries(block).filter(([, v]) => !Array.isArray(v))),
      (v) => guardCommandish(client, v),
    )
    if (!had) {
      if (!guardOutsideArrays) return 'absent'
      delete obj['gitflow-guard']
    } else {
      const stillHasContent = Object.values(block).some((v) => (Array.isArray(v) ? v.length > 0 : true))
      if (guardOutsideArrays || !stillHasContent) delete obj['gitflow-guard']
    }
  } else if (client === 'zcode') {
    const hooksObj = obj['hooks'] as Record<string, unknown> | undefined
    const eventsObj = hooksObj?.['events'] as Record<string, unknown> | undefined
    const arr = eventsObj?.['PreToolUse']
    if (!Array.isArray(arr)) return 'absent'
    const { cleaned, had } = filterGuardItems(arr, client)
    if (!had) return 'absent'
    if (cleaned.length === 0) delete eventsObj!['PreToolUse']
    else eventsObj!['PreToolUse'] = cleaned
    if (eventsObj && Object.keys(eventsObj).length === 0) delete hooksObj!['events']
    if (hooksObj && Object.keys(hooksObj).filter((k) => k !== 'enabled').length === 0) delete obj['hooks']
  } else if (client === 'cursor') {
    const hooksObj = obj['hooks'] as Record<string, unknown> | undefined
    const arr = hooksObj?.['beforeShellExecution']
    if (!Array.isArray(arr)) return 'absent'
    const { cleaned, had } = filterGuardItems(arr, client)
    if (!had) return 'absent'
    if (cleaned.length === 0) delete hooksObj!['beforeShellExecution']
    else hooksObj!['beforeShellExecution'] = cleaned
    if (hooksObj && Object.keys(hooksObj).length === 0) delete obj['hooks']
  } else {
    const hooksObj = obj['hooks'] as Record<string, unknown> | undefined
    const arr = hooksObj?.['PreToolUse']
    if (!Array.isArray(arr)) return 'absent'
    const { cleaned, had } = filterGuardItems(arr, client)
    if (!had) return 'absent'
    if (cleaned.length === 0) delete hooksObj!['PreToolUse']
    else hooksObj!['PreToolUse'] = cleaned
    if (hooksObj && Object.keys(hooksObj).length === 0) delete obj['hooks']
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

/** 执行一次 wire 落位/移除/预览; dsh/pi 由上层直接短路, 不进这里。
 *  真实写入 JSON 客户端前自检随包 runner 真实存在 —— 杜绝把死指针写进用户配置(静默 MODULE_NOT_FOUND)。 */
export async function applyWire(
  client: ClientId,
  path: string,
  unwire: boolean,
  dryRun: boolean,
  deps: { runnerExists?: (p: string) => boolean } = {},
): Promise<WireResult> {
  if (client === 'opencode') return unwire ? removePluginFile(path, dryRun) : addPluginFile(path, dryRun)
  if (!unwire && !dryRun) {
    const runnerExists = deps.runnerExists ?? existsSync
    if (!runnerExists(RUNNER_PATH)) {
      throw new Error(`gitflow-guard runner not found at ${RUNNER_PATH} — reinstall the package (npm i -g agents-gitflow-guard)`)
    }
  }
  return unwire
    ? removeJsonEntry(path, client as JsonWireClient, dryRun)
    : addJsonEntry(path, client as JsonWireClient, dryRun)
}

export type WiringState = 'current' | 'legacy' | 'absent'

/** 只读探测接线版本状态: current=canonical 条目在位; legacy=存在任意历史形态条目(status 提示重新 wire 迁移);
 *  absent=无本插件条目(或配置不可解析, 决策保守)。 */
export async function wiringState(client: ClientId, path: string): Promise<WiringState> {
  const raw = await readText(path)
  if (raw === null) return 'absent'
  if (client === 'opencode') return 'current'
  let obj: unknown
  try {
    obj = parseCommentJson(raw)
  } catch {
    return 'absent'
  }
  const cmd = currentCommand(client as JsonWireClient)
  if (jsonContains(obj, cmd)) return 'current'
  return jsonContainsBy(obj, (v) => guardCommandish(client as JsonWireClient, v)) ? 'legacy' : 'absent'
}

/** 只读探测: 该客户端是否已接线为当前 canonical 形态(opencode 判插件文件存在; JSON 客户端按命令精确匹配) */
export async function isWired(client: ClientId, path: string): Promise<boolean> {
  return (await wiringState(client, path)) === 'current'
}
