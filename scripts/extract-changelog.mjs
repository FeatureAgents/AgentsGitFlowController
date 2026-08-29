#!/usr/bin/env node
import { readFileSync } from 'node:fs'

/**
 * 纯函数核心: 从 CHANGELOG 文本中提取指定版本的变更内容
 * @param {string} changelogContent - CHANGELOG.md 的完整内容
 * @param {string} version - 目标版本号 (如 "0.0.27" 或 "v0.0.27")
 * @returns {string} 提取到的章节内容 (如未找到则返回空字符串)
 */
export function extractChangelogSection(changelogContent, version) {
  if (!changelogContent || !version) return ''
  const cleanVersion = version.replace(/^v/, '')
  const escapedVersion = cleanVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // 匹配类似 "## 0.0.27" 或 "## [0.0.27]" 或 "## v0.0.27" 开头的行
  const headingRegex = new RegExp(`^##\\s+(?:\\[?v?)?${escapedVersion}\\]?(?:\\s.*)?$`, 'm')
  const match = headingRegex.exec(changelogContent)
  if (!match) return ''

  const startIndex = match.index + match[0].length
  const rest = changelogContent.slice(startIndex)

  // 寻找下一个 "## " 标题或结尾
  const nextSectionMatch = /^##\s+/m.exec(rest)
  const sectionContent = nextSectionMatch ? rest.slice(0, nextSectionMatch.index) : rest

  return sectionContent.trim()
}

function main() {
  const version = process.argv[2] || JSON.parse(readFileSync('package.json', 'utf8')).version
  const changelog = readFileSync('CHANGELOG.md', 'utf8')
  const content = extractChangelogSection(changelog, version)
  if (content) {
    process.stdout.write(content + '\n')
  }
}

if (process.argv[1] && process.argv[1].endsWith('extract-changelog.mjs')) {
  main()
}
