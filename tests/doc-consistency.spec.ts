// 文档一致性机械校验: 把"文档里写的数字/路径/索引"钉在仓库实际状态上, 防止漂移无人发现。
// 背景(实证): 决策矩阵用例数从 135 增到 169 后, 11 语言 README 与 E2E 文档长期仍写 135;
// 每个客户端的"官方协议 / 测试用例 / 实机证据"三处文档没有统一入口, 缺证据也不会被发现。
//
// 校验范围(与 CHANGELOG 0.0.50 的 test(docs) 条目一一对应, 不得夸大):
//   1. 矩阵用例数: 11 语言 README + docs/e2e/README.md + docs/e2e/pi.md 必须提到该数且等于事实源;
//   2. 客户端索引: docs/e2e/README.md 的索引行与 WIRE_CLIENTS 双向一致, 链接可解析, 证据列与实际文件一致;
//   3. AGENTS.md 中"仓库目录路径"存在(根目录文件名、占位符、构建产物不在范围内, 见 PATH_REFS 注释)。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WIRE_CLIENTS } from '../src/wire'
// @ts-expect-error scripts/check-readme-equality.mjs lacks type declarations
import { REQUIRED_README_FILES } from '../scripts/check-readme-equality.mjs'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

function read(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), 'utf8')
}

/** 决策矩阵用例表(repo 内唯一事实源): scripts/test-git-matrix.sh 的 heredoc 表体非空非注释行数 */
function matrixCaseCount(): number {
  const lines = read('scripts/test-git-matrix.sh').split('\n')
  const start = lines.findIndex((l) => l.startsWith("done <<'EOF'"))
  expect(start, "scripts/test-git-matrix.sh 缺少 'done <<'EOF'' 用例表").toBeGreaterThan(-1)
  let end = -1
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === 'EOF') {
      end = i
      break
    }
  }
  expect(end, 'scripts/test-git-matrix.sh 用例表缺少结束 EOF').toBeGreaterThan(start)
  return lines.slice(start + 1, end).filter((l) => l.trim() !== '' && !l.trim().startsWith('#')).length
}

/**
 * "决策矩阵"的域措辞白名单(覆盖 11 语言现行写法)。
 * 刻意不写成泛化的 matrix: "CI compatibility matrix covers 12 cases" 这类无关句子会被误判为漂移,
 * 而假红会让维护者学会无视这条校验。代价: 新造措辞可能漏检, 改动这些文档时按需扩表。
 */
const MATRIX_PHRASE =
  /[决決]策矩[阵陣]|decision matrix|Entscheidungsmatrix|matrice de décision|matriz de decisi[oó]n|matriz de decis[aã]o|matrice decisionale|матрица git-решений|判定マトリクス|マトリックス|매트릭스/i

/** 数字 + 计数词: 拉丁词加词边界(防 "cascading" 被当作 cas), 数字与计数词之间只允许空格/连字符 */
const COUNT_WORD =
  /(\d{2,4})\s*[-–]?\s*(?:\bcases?\b|\bcasos?\b|\bcasi\b|\bcas\b|\bFälle(?:n)?\b|項|项|条|个|用例|ケース|개|случа(?:ев|я|їв))/gi

/** 一份文档里出现过的"矩阵用例数"取值; 空数组 = 该文档没有提到用例数 */
function matrixCountMentions(text: string): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    if (!MATRIX_PHRASE.test(line)) continue
    for (const m of line.matchAll(COUNT_WORD)) out.push(m[1])
  }
  return out
}

// 11 语言清单从唯一事实源导入: 新增语种时自动纳入, 不会静默漏检
const MATRIX_DOCS = [...REQUIRED_README_FILES, 'docs/e2e/README.md', 'docs/e2e/pi.md'] as const

describe('文档一致性: 决策矩阵用例数', () => {
  const actual = matrixCaseCount()

  it('用例表体数量与脚本自我描述一致', () => {
    const script = read('scripts/test-git-matrix.sh')
    expect(actual).toBeGreaterThan(100)
    expect(script).toContain(`GitFlow guard: ${actual} 项`)
    expect(script).toContain(`GitFlow Guard ${actual} 决策矩阵`)
  })

  for (const file of MATRIX_DOCS) {
    it(`${file} 提到矩阵用例数, 且等于事实源`, () => {
      const mentions = matrixCountMentions(read(file))
      // 下界守卫: 句子被删掉或措辞被改写时, 这条必须变红, 而不是静默通过
      expect(mentions.length, `${file} 没有出现"矩阵 + 用例数"表述(句子被删或措辞变化)`).toBeGreaterThan(0)
      expect(mentions.filter((n) => Number(n) !== actual), `应为 ${actual} 项`).toEqual([])
    })
  }
})

// 文档名与客户端 id 的差异: claude 客户端的协议/用例/证据文件名为 claude-code
const DOC_NAME: Record<string, string> = { claude: 'claude-code' }
const expectedDocs = WIRE_CLIENTS.map((s) => DOC_NAME[s.client] ?? s.client)

describe('文档一致性: 客户端文档索引', () => {
  const linksOf = (row: string): string[] => [...row.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1])
  // 结构性取行: 索引区所有表格数据行(去表头与分隔行), 不依赖行里是否含 references/ 字样
  const dataRows = read('docs/e2e/README.md')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|'))
    .filter((l) => !/^\|[\s:|-]+\|$/.test(l))
    .filter((l) => !/(客户端|Client)/.test(l))
  /** 协议列必须是指向 .agents/hooks/references/<doc>.md 的链接; 从链接目标解析文档名(纯文本伪装解析为 '') */
  const protocolDocOf = (row: string): string => {
    const target = linksOf(row).find((t) => t.includes('.agents/hooks/references/'))
    return (target ? /\.agents\/hooks\/references\/([A-Za-z0-9._-]+)\.md$/.exec(target)?.[1] : undefined) ?? ''
  }

  it('索引行与 WIRE_CLIENTS 双向一致(多一行、少一行、大小写变体都算漂移)', () => {
    expect(dataRows, '索引表数据行数应等于客户端数').toHaveLength(expectedDocs.length)
    expect(dataRows.map(protocolDocOf).sort()).toEqual([...expectedDocs].sort())
  })

  for (const spec of WIRE_CLIENTS) {
    const doc = DOC_NAME[spec.client] ?? spec.client

    it(`${spec.client}: 协议/用例/索引三处齐备, 索引链接与证据列均属实`, () => {
      expect(existsSync(join(REPO_ROOT, `.agents/hooks/references/${doc}.md`)), `缺协议文档 references/${doc}.md`).toBe(true)
      expect(existsSync(join(REPO_ROOT, `docs/e2e/${doc}.md`)), `缺测试用例 docs/e2e/${doc}.md`).toBe(true)

      const clientRows = dataRows.filter((r) => protocolDocOf(r) === doc)
      expect(clientRows, `${spec.client} 在 docs/e2e/README.md 索引表中应恰好一行`).toHaveLength(1)

      const targets = linksOf(clientRows[0])
      // 协议列必须是真实链接(指向 references/<doc>.md), 纯文本写路径不算
      expect(targets, `${spec.client} 索引行的协议列必须链到 references/${doc}.md`).toContain(
        `../../.agents/hooks/references/${doc}.md`,
      )
      expect(targets, `${spec.client} 索引行缺用例链接`).toContain(`${doc}.md`)
      expect(
        targets.filter((t) => !existsSync(join(REPO_ROOT, 'docs/e2e', t))),
        `${spec.client} 索引行存在死链`,
      ).toEqual([])

      // 证据列: 有证据文件时必须恰好链到本客户端的证据文件(链到别的真实文件同样是错的), 没有则不得有链接
      const hasEvidence = existsSync(join(REPO_ROOT, `docs/e2e/TestResult/${doc}.md`))
      const evidenceTargets = targets.filter((t) => t.startsWith('TestResult/'))
      expect(
        evidenceTargets,
        `${spec.client} 索引行的证据列与 TestResult/${doc}.md 的实际存在情况不一致`,
      ).toEqual(hasEvidence ? [`TestResult/${doc}.md`] : [])
    })
  }
})

// AGENTS.md 是 agent 每轮注入的规范: 它引用的仓库内路径若被重命名/删除, 规范会静默指向不存在的东西。
// 范围: 仅"仓库目录路径"(src/ tests/ scripts/ bin/ docs/ pi/ opencode/ .agents/ .github/ 与各客户端配置目录)。
// 不在范围内: 根目录文件名(README.*.md / patch.yml 等)、含占位符的 token、构建产物 lib/、本机私有文件。
const PATH_REFS =
  /^(?:src|tests|scripts|bin|docs|pi|opencode|\.agents|\.github|\.claude|\.codex|\.cursor|\.zcode|\.codebuddy|\.pi|\.opencode)\//
// 例外: 本机私有文件(不入库, 见 .gitignore)
const PATH_EXCEPTIONS = new Set(['.agents/hooks.json'])

describe('文档一致性: AGENTS.md 路径引用', () => {
  it('引用的仓库目录路径都真实存在(且受检数量不塌缩为空转)', () => {
    const refs = [...read('AGENTS.md').matchAll(/`([^`\n]+)`/g)]
      .map((m) => m[1].replace(/[).,;:]+$/, ''))
      .filter((t) => PATH_REFS.test(t) && !/[<>*$|]/.test(t) && !PATH_EXCEPTIONS.has(t))
    const unique = [...new Set(refs)]
    // 下界守卫: 提取规则写坏时(正则为空、AGENTS.md 改写), 这条必须变红而不是静默通过
    expect(unique.length, 'AGENTS.md 受检路径数过少, 提取规则可能已失效').toBeGreaterThanOrEqual(15)
    expect(unique.filter((p) => !existsSync(join(REPO_ROOT, p)))).toEqual([])
  })
})
