import { describe, expect, it } from 'vitest'
// @ts-expect-error scripts/extract-changelog.mjs lacks type declarations
import { extractChangelogSection } from '../scripts/extract-changelog.mjs'

const sampleChangelog = `# Changelog

Intro description here.

## 0.0.3

- feat: third feature notes
- fix: bugfix in 0.0.3

## 0.0.2

- feat: second feature notes

## 0.0.1

- chore: initial release
`

describe('extract-changelog: extractChangelogSection', () => {
  it('提取中间版本章节内容', () => {
    const result: string = extractChangelogSection(sampleChangelog, '0.0.2')
    expect(result).toBe('- feat: second feature notes')
  })

  it('提取最新版本章节内容', () => {
    const result: string = extractChangelogSection(sampleChangelog, '0.0.3')
    expect(result).toBe('- feat: third feature notes\n- fix: bugfix in 0.0.3')
  })

  it('提取末尾版本章节内容', () => {
    const result: string = extractChangelogSection(sampleChangelog, '0.0.1')
    expect(result).toBe('- chore: initial release')
  })

  it('支持带有 v 前缀的目标版本查询', () => {
    const result: string = extractChangelogSection(sampleChangelog, 'v0.0.2')
    expect(result).toBe('- feat: second feature notes')
  })

  it('查询不存在的版本返回空字符串', () => {
    const result: string = extractChangelogSection(sampleChangelog, '0.0.99')
    expect(result).toBe('')
  })

  it('空输入安全保护', () => {
    expect(extractChangelogSection('', '0.0.1')).toBe('')
    expect(extractChangelogSection(sampleChangelog, '')).toBe('')
  })
})
