#!/usr/bin/env node
// 全量多语言 README 绝对对齐校验器:
// 验证 11 个语言版本的 README 具备 100% 的结构对称性、标题对齐、表格行数对齐、TOC 锚点有效性与导航对称性。
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const REQUIRED_README_FILES = [
  'README.md',
  'README.zh.md',
  'README.zh-tw.md',
  'README.ja.md',
  'README.ko.md',
  'README.de.md',
  'README.fr.md',
  'README.es.md',
  'README.it.md',
  'README.pt.md',
  'README.ru.md'
]

export const EXPECTED_REAL_HEADINGS = 45 // 1 H1 + 19 H2 + 22 H3 + 3 H4 (排除代码块内注释)
export const EXPECTED_TABLE_COUNT = 7
export const EXPECTED_TOC_ITEMS = 18

/** TOC 段的标题（11 语种写法） */
const TOC_HEADING = /^##\s+(?:Table of Contents|目录|目錄|目次|목차|Inhaltsverzeichnis|Table des matières|Índice|Indice|Содержание|Оглавление)/i

/** 代码块围栏开关: 标题/TOC 解析都必须跳过围栏内容 */
function fenceToggled(line) {
  return line.startsWith('```')
}

/**
 * GitHub 标题锚点 slug：对齐 github-slugger 真实行为 —— 小写 → 去控制符/标点(保留 Unicode 字母/数字/下划线/连字符/空格) → 空格转连字符。
 * 刻意不 trim: 标题尾部“空格+标点”会留下尾部连字符(如 `Licence / Coût ?` → `licence--coût-`), trim 会算错。
 * 背景: 早期校验只数 TOC 条数，`#voyez-le-à-loeuvre--…` 这类漏字符失效锚点长期漏检。
 */
export function githubSlug(heading) {
  return heading.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-')
}

/**
 * 收集真实 Markdown 标题（跳过代码块内的 # 注释）, 同时给出层级与 GitHub 锚点。
 * 单一事实源: 标题计数、TOC 锚点、TOC 顺序三处校验共用, 避免两套解析漂移。
 * 行尾 `\r` 宽容（CRLF 工作区不应误红）。
 */
export function collectHeadings(lines) {
  let inCodeBlock = false
  const headings = []
  for (const line of lines) {
    if (fenceToggled(line)) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue
    const m = /^(#{1,4})\s+(.*?)\s*$/.exec(line)
    if (m) headings.push({ level: m[1].length, anchor: githubSlug(m[2].replace(/`/g, '')), raw: line })
  }
  return headings
}

/**
 * 收集 TOC 段条目（锚点 + 行号）。返回 null 表示未找到 TOC 标题（由上层报告缺失）。
 * 与 collectHeadings 同规: 跳过代码块围栏内容, 避免围栏内的 `## …` / `- [x](#y)` 被误读。
 */
export function collectTocItems(lines) {
  let inCodeBlock = false
  let tocStart = -1
  const items = []
  for (let i = 0; i < lines.length; i++) {
    if (fenceToggled(lines[i])) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue
    if (tocStart === -1) {
      if (TOC_HEADING.test(lines[i])) tocStart = i
      continue
    }
    if (/^##\s+/.test(lines[i])) break
    const m = /^\s*-\s+\[.+?\]\(#(.+?)\)\s*$/.exec(lines[i])
    if (m) items.push({ anchor: m[1], line: i + 1 })
  }
  if (tocStart === -1) return null
  const tocTitle = lines[tocStart].replace(/^#+\s*/, '').replace(/`/g, '').replace(/\s+$/, '')
  return { tocStart, selfAnchor: githubSlug(tocTitle), items }
}

/**
 * TOC 校验：每个目录项必须解析到真实标题；目录顺序必须与正文 H2 一致；正文 H2 不得漏进目录。
 * 背景(实证): 0.1.2 把 “See it work” 段移到首屏时只动了正文、未重排 11 语 TOC；
 * README.fr 的 `#voyez-le-à-loeuvre--…` 锚点因漏字符长期失效。
 * 旧校验只数 TOC 条数，两类漂移都能静默通过——本函数补上机械拦截。
 */
export function tocAnchorErrors(filename, lines) {
  const errors = []
  const headings = collectHeadings(lines)

  const toc = collectTocItems(lines)
  if (toc === null) return errors // 缺失 TOC 由上层报告

  const anchors = new Set(headings.map((h) => h.anchor))

  for (const item of toc.items) {
    if (!anchors.has(item.anchor)) {
      errors.push(`${filename}: TOC anchor "#${item.anchor}" (line ${item.line}) resolves to no heading`)
    }
  }

  const bodyH2 = headings.filter((h) => h.level === 2 && h.anchor !== toc.selfAnchor)
  const bodyOrder = new Map(bodyH2.map((h, i) => [h.anchor, i]))
  let prev = null
  for (const item of toc.items) {
    const pos = bodyOrder.get(item.anchor)
    if (pos === undefined) continue // 失效锚点已单独报告
    if (prev !== null && pos < prev.pos) {
      errors.push(
        `${filename}: TOC order mismatch — "#${item.anchor}" is listed after "#${prev.anchor}" but appears before it in the document`
      )
    }
    prev = { anchor: item.anchor, pos }
  }

  for (const h of bodyH2) {
    if (!toc.items.some((item) => item.anchor === h.anchor)) {
      errors.push(`${filename}: heading "#${h.anchor}" is missing from the TOC`)
    }
  }

  return errors
}

/**
 * 提取文件中的真实 Markdown 标题（排除代码块内的 # 注释）
 */
function extractRealHeadings(lines) {
  return collectHeadings(lines).map((h) => h.raw)
}

/**
 * 校验全量 README 对等性核心函数
 * @param {string} baseDir 仓库根目录
 * @returns {string[]} 错误信息数组（空数组表示 100% 对齐）
 */
export function checkReadmeEquality(baseDir = '.') {
  const errors = []
  const fileContents = {}

  for (const filename of REQUIRED_README_FILES) {
    const fullPath = join(baseDir, filename)
    if (!existsSync(fullPath)) {
      errors.push(`Missing required README file: ${filename}`)
      continue
    }
    fileContents[filename] = readFileSync(fullPath, 'utf8')
  }

  if (errors.length > 0) return errors

  for (const [filename, content] of Object.entries(fileContents)) {
    // 统一按 \r?\n 拆分: 在解析入口归一化 CRLF; 正则端 `\s*$` 与 slug 规则是第二层宽容
    const lines = content.split(/\r?\n/)

    // 1. 真实标题数校验 (H1 - H4, 排除代码块内部)
    const headings = extractRealHeadings(lines)
    if (headings.length !== EXPECTED_REAL_HEADINGS) {
      errors.push(`${filename}: real heading count is ${headings.length} (expected ${EXPECTED_REAL_HEADINGS})`)
    }

    // 2. 11 语种导航栏完整性与对称性
    const navLine = lines.find((l) => l.includes('README.zh.md') && l.includes('README.md') && l.includes('·'))
    if (!navLine) {
      errors.push(`${filename}: missing language navigation bar`)
    } else {
      for (const targetLang of REQUIRED_README_FILES) {
        if (!navLine.includes(targetLang)) {
          errors.push(`${filename}: language navigation bar missing target link to ${targetLang}`)
        }
      }
    }

    // 3. 表格数量校验
    const tableSeparators = lines.filter((l) => /^\|(?:\s*:?-+:?\s*\|)+$/.test(l.trim()))
    if (tableSeparators.length !== EXPECTED_TABLE_COUNT) {
      errors.push(`${filename}: table count is ${tableSeparators.length} (expected ${EXPECTED_TABLE_COUNT})`)
    }

    // 4. TOC 目录项与正文锚点校验
    const toc = collectTocItems(lines)
    if (toc === null) {
      errors.push(`${filename}: missing Table of Contents (TOC) section`)
    } else if (toc.items.length !== EXPECTED_TOC_ITEMS) {
      errors.push(`${filename}: TOC items count is ${toc.items.length} (expected ${EXPECTED_TOC_ITEMS})`)
    }

    // 5. TOC 锚点可解析 + 目录顺序与正文一致
    errors.push(...tocAnchorErrors(filename, lines))

    // 6. 核心前置依赖 Node.js >= 22 声明
    if (!/Node\.js\s*≥\s*22/i.test(content) && !/Node\.js\s*>=\s*22/i.test(content)) {
      errors.push(`${filename}: missing prerequisite "Node.js ≥ 22"`)
    }

    // 7. 审计日志隔离路径 ~/.local/state/gitflow-guard/
    if (!content.includes('~/.local/state/gitflow-guard/')) {
      errors.push(`${filename}: missing audit log path "~/.local/state/gitflow-guard/"`)
    }

    // 8. 许可证与版权归属声明
    if (!content.includes('[MIT](LICENSE)') || !content.includes('FeatureAgents')) {
      errors.push(`${filename}: missing MIT License / FeatureAgents copyright notice`)
    }
  }

  return errors
}

function main() {
  const errors = checkReadmeEquality('.')
  if (errors.length > 0) {
    console.error('[check-readme-equality] Verification FAILED:')
    for (const err of errors) console.error('  - ' + err)
    process.exit(1)
  }
  console.log('[check-readme-equality] OK: All 11 README files are 100% structurally aligned and symmetric.')
}

if (process.argv[1] && process.argv[1].endsWith('check-readme-equality.mjs')) {
  main()
}
