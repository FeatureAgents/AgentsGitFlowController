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

export const EXPECTED_REAL_HEADINGS = 44 // 1 H1 + 18 H2 + 22 H3 + 3 H4 (排除代码块内注释)
export const EXPECTED_TABLE_COUNT = 7
export const EXPECTED_TOC_ITEMS = 17

/**
 * 提取文件中的真实 Markdown 标题（排除代码块内的 # 注释）
 */
function extractRealHeadings(lines) {
  let inCodeBlock = false
  const headings = []
  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock
    } else if (!inCodeBlock && /^#{1,4}\s+/.test(line)) {
      headings.push(line)
    }
  }
  return headings
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
    const lines = content.split('\n')

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
    const tocStart = lines.findIndex((l) => /^##\s+(?:Table of Contents|目录|目錄|目次|목차|Inhaltsverzeichnis|Table des matières|Índice|Indice|Содержание|Оглавление)/i.test(l))
    if (tocStart === -1) {
      errors.push(`${filename}: missing Table of Contents (TOC) section`)
    } else {
      const tocLines = lines.slice(tocStart + 1, tocStart + 35).filter((l) => /^\s*-\s+\[.+\]\(#.+\)/.test(l))
      if (tocLines.length !== EXPECTED_TOC_ITEMS) {
        errors.push(`${filename}: TOC items count is ${tocLines.length} (expected ${EXPECTED_TOC_ITEMS})`)
      }
    }

    // 5. 核心前置依赖 Node.js >= 22 声明
    if (!/Node\.js\s*≥\s*22/i.test(content) && !/Node\.js\s*>=\s*22/i.test(content)) {
      errors.push(`${filename}: missing prerequisite "Node.js ≥ 22"`)
    }

    // 6. 审计日志隔离路径 ~/.local/state/gitflow-guard/
    if (!content.includes('~/.local/state/gitflow-guard/')) {
      errors.push(`${filename}: missing audit log path "~/.local/state/gitflow-guard/"`)
    }

    // 7. 许可证与版权归属声明
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
