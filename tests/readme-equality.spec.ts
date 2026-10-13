// check-readme-equality 的行为回归测试:
// 确保仓库内全部 11 种语言的 README 维持 100% 结构对齐与对称性，
// 并保证 TOC 锚点可解析、目录顺序与正文一致（两类漂移都曾真实发生）。
import { describe, expect, it } from 'vitest'
// @ts-expect-error scripts/check-readme-equality.mjs lacks type declarations
import { checkReadmeEquality, githubSlug, tocAnchorErrors, REQUIRED_README_FILES } from '../scripts/check-readme-equality.mjs'

describe('check-readme-equality: 全量 11 语种 README 对齐校验', () => {
  it('声明必须覆盖全部 11 个语言文件', () => {
    expect(REQUIRED_README_FILES).toHaveLength(11)
  })

  it('真实仓库中的 11 个 README 具备 100% 结构对称性', () => {
    const errors: string[] = checkReadmeEquality('.')
    expect(errors).toEqual([])
  })
})

describe('githubSlug: GitHub 锚点 slug 生成', () => {
  it('去掉标点、空格转连字符、保留破折号留下的连续连字符', () => {
    expect(githubSlug('What it does NOT do — honest limits')).toBe('what-it-does-not-do--honest-limits')
  })

  it('保留非拉丁字母（西里尔 / 日文假名）', () => {
    expect(githubSlug('Ограничения — честные')).toBe('ограничения--честные')
  })

  it('对齐 GitHub: 标题尾部“空格+标点”保留尾部连字符（不做 trim）', () => {
    expect(githubSlug('Est-ce un outil de sécurité ?')).toBe('est-ce-un-outil-de-sécurité-')
    expect(githubSlug('Licence / Coût ?')).toBe('licence--coût-')
  })
})

describe('tocAnchorErrors: 目录锚点与顺序校验', () => {
  /** 合成一份结构正确的小型 README */
  const wellFormed = (): string[] =>
    [
      '# pkg',
      '',
      '## Demo — live',
      '',
      'text',
      '',
      '## Table of Contents',
      '',
      '- [Demo — live](#demo--live)',
      '- [Quick Start — now](#quick-start--now)',
      '- [FAQ](#faq)',
      '',
      '---',
      '',
      '## Quick Start — now',
      '',
      'text',
      '',
      '## FAQ',
      '',
      'text',
      ''
    ]

  it('正确目录返回空数组', () => {
    expect(tocAnchorErrors('README.x.md', wellFormed())).toEqual([])
  })

  it('锚点漏字符即报失效（README.fr 的 l’œuvre 实证）', () => {
    const lines = wellFormed().map((l) =>
      l === '## Demo — live' ? '## Voyez-le à l’œuvre — une démo live' : l
    )
    const lines2 = lines.map((l) =>
      l === '- [Demo — live](#demo--live)' ? '- [Voyez-le à l’œuvre](#voyez-le-à-loeuvre--une-démo-live)' : l
    )
    const errors = tocAnchorErrors('README.fr.md', lines2)
    expect(errors.some((e: string) => e.includes('resolves to no heading'))).toBe(true)
    expect(errors.some((e: string) => e.includes('#voyez-le-à-loeuvre--une-démo-live'))).toBe(true)
  })

  it('目录顺序与正文不一致即报错（demo 段上移但 TOC 未重排）', () => {
    const lines = wellFormed()
    // 把 demo 项移到 Quick Start 之后，制造正文顺序与目录顺序错位
    const reordered = lines.filter((l) => l !== '- [Demo — live](#demo--live)')
    reordered.splice(reordered.indexOf('- [FAQ](#faq)'), 0, '- [Demo — live](#demo--live)')
    const errors = tocAnchorErrors('README.md', reordered)
    expect(errors.some((e: string) => e.includes('TOC order mismatch'))).toBe(true)
  })

  it('正文 H2 未进目录即报错', () => {
    const lines = wellFormed().filter((l) => l !== '- [Quick Start — now](#quick-start--now)')
    const errors = tocAnchorErrors('README.md', lines)
    expect(errors.some((e: string) => e.includes('is missing from the TOC'))).toBe(true)
  })

  it('跳过代码块内的 # 行，不把围栏内容当标题', () => {
    // 判别行只有 `## Mode A: CLI Hook clients`: 若围栏跳过失效, 它会被当成 H2 并报 missing from the TOC;
    // 上一行以 // 开头, 永不命中标题正则, 仅作干扰。
    const lines = [
      '# pkg',
      '## Table of Contents',
      '- [Quick Start](#quick-start)',
      '## Quick Start',
      '```jsonc',
      '// ## Fake Heading',
      '## Mode A: CLI Hook clients',
      '```'
    ]
    expect(tocAnchorErrors('README.md', lines)).toEqual([])
    // 反证: 同一行放到围栏外就会被如实识别, 证明该夹具具备判别力
    const unfenced = [...lines.slice(0, 4), '## Mode A: CLI Hook clients']
    expect(tocAnchorErrors('README.md', unfenced).some((e: string) => e.includes('missing from the TOC'))).toBe(true)
  })

  it('容忍 CRLF 行尾（调用方只按 \\n 拆分时也不误报）', () => {
    const lines = [
      '# pkg\r',
      '## Table of Contents\r',
      '- [Quick Start](#quick-start)\r',
      '## Quick Start\r'
    ]
    expect(tocAnchorErrors('README.md', lines)).toEqual([])
  })

  it('围栏内的 TOC 仿冒块不参与解析（真目录在后）', () => {
    const lines = [
      '# pkg',
      '```md',
      '## Table of Contents',
      '- [Fake](#fake)',
      '```',
      '## Table of Contents',
      '- [Quick Start](#quick-start)',
      '## Quick Start'
    ]
    expect(tocAnchorErrors('README.md', lines)).toEqual([])
  })
})
