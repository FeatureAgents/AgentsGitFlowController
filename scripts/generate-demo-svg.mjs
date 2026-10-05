#!/usr/bin/env node
// cast 事件流 → SMIL 动画 SVG(dev-only 工具, 不随 npm 包发布):
//   node scripts/generate-demo-svg.mjs --cast demo.cast.jsonl --out docs/assets/demo.svg
// 输入由 `gitflow-guard demo --cast <file>` 产出(真实运行的逐行事件流, 非手绘假输出)。
// 每个 cast 事件渲染为一帧(累积终端画面), 用 SMIL discrete visibility 切换, 无 JS 依赖。
// 校验从严: 坏 JSON / 缺 tag / 缺 text 一律非零退出, 不产半截 SVG。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const TAGS = new Set(['title', 'sandbox', 'scene', 'allow', 'deny', 'why', 'next', 'cleanup', 'wire'])

/** 每类事件的展示时长(秒): 按 tag 定节奏, 与 cast 里的 t 字段解耦, 保证可读性与确定性 */
const TAG_HOLD = {
  title: 1.8,
  sandbox: 1.8,
  scene: 2.4,
  allow: 1.8,
  deny: 2.0,
  why: 2.8,
  next: 2.8,
  cleanup: 2.6,
  wire: 3.6,
}

/** 各 tag 的文本颜色(GitHub 暗色系) */
const TAG_COLOR = {
  title: '#e6edf3',
  sandbox: '#8b949e',
  scene: '#e6edf3',
  allow: '#3fb950',
  deny: '#f85149',
  why: '#ffa657',
  next: '#7ee787',
  cleanup: '#8b949e',
  wire: '#58a6ff',
}

const WIDTH = 760
const PADDING_X = 22
const LINE_HEIGHT = 19
const FONT_SIZE = 13
const TITLEBAR = 38
const WRAP_CHARS = 88

function fail(msg) {
  process.stderr.write(`[generate-demo-svg] ${msg}\n`)
  process.exit(1)
}

function parseArgs(argv) {
  const args = { cast: null, out: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cast') args.cast = argv[++i]
    else if (argv[i] === '--out') args.out = argv[++i]
    else if (argv[i]?.startsWith('--cast=')) args.cast = argv[i].slice(7)
    else if (argv[i]?.startsWith('--out=')) args.out = argv[i].slice(6)
  }
  if (!args.cast || !args.out) fail('usage: node scripts/generate-demo-svg.mjs --cast <file> --out <file>')
  return args
}

function loadCast(path) {
  if (!existsSync(path)) fail(`cast file not found: ${path}`)
  const raw = readFileSync(path, 'utf8')
  const events = []
  for (const [i, line] of raw.split('\n').entries()) {
    if (line.trim() === '') continue
    let e
    try {
      e = JSON.parse(line)
    } catch {
      fail(`line ${i + 1}: invalid JSON: ${line.slice(0, 80)}`)
    }
    if (!e || !TAGS.has(e.tag)) fail(`line ${i + 1}: unknown or missing tag: ${String(e?.tag)}`)
    if (typeof e.text !== 'string' || e.text.length === 0) fail(`line ${i + 1}: missing text`)
    events.push(e)
  }
  if (events.length === 0) fail('cast is empty — nothing to render')
  return events
}

/** XML 文本转义(& 优先, 否则 &amp; 会被二次转义) */
function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 终端式折行: 超宽行按词折行, 续行缩进 6 格 */
function wrap(text) {
  if (text.length <= WRAP_CHARS) return [text]
  const words = text.split(' ')
  const lines = []
  let cur = ''
  for (const w of words) {
    const cand = cur === '' ? w : `${cur} ${w}`
    if (cand.length > WRAP_CHARS && cur !== '') {
      lines.push(cur)
      cur = w
    } else {
      cur = cand
    }
  }
  if (cur !== '') lines.push(cur)
  return lines.map((l, i) => (i === 0 ? l : `      ${l}`))
}

function render(events) {
  // 累积时间轴: 每帧起始时刻 = 之前所有帧时长之和
  let cursor = 0
  const frames = events.map((e) => {
    const hold = TAG_HOLD[e.tag] ?? 2
    const frame = { ...e, start: cursor, hold }
    cursor += hold
    return frame
  })
  const total = cursor + 1.2 // 末帧后再停 1.2s 循环

  // 累积画面: 第 k 帧显示事件 0..k 的全部折行文本
  const linesByFrame = []
  let acc = []
  for (const e of frames) {
    acc = acc.concat(wrap(e.text))
    linesByFrame.push(acc.slice())
  }
  const maxLines = Math.max(...linesByFrame.map((l) => l.length))
  const height = TITLEBAR + maxLines * LINE_HEIGHT + 20

  const body = []
  body.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="gitflow-guard demo">`)
  body.push(`<rect width="${WIDTH}" height="${height}" rx="10" fill="#0d1117"/>`)
  body.push(`<rect width="${WIDTH}" height="${TITLEBAR}" rx="10" fill="#161b22"/>`)
  for (const [i, c] of ['#ff5f57', '#febc2e', '#28c840'].entries()) {
    body.push(`<circle cx="${20 + i * 18}" cy="${TITLEBAR / 2}" r="5.5" fill="${c}"/>`)
  }
  body.push(`<text x="${WIDTH / 2}" y="${TITLEBAR / 2 + 4}" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="12" fill="#8b949e">gitflow-guard demo</text>`)

  for (const [k, frame] of frames.entries()) {
    const s = (frame.start / total).toFixed(4)
    const e2 = frame.start + frame.hold
    const end = Math.min(e2 / total, 1).toFixed(4)
    const isLast = k === frames.length - 1
    const values = isLast ? 'hidden;visible' : 'hidden;visible;hidden'
    const keyTimes = isLast ? `0;${s}` : `0;${s};${end}`
    body.push(`<g data-frame="${k}" visibility="hidden">`)
    body.push(`<animate attributeName="visibility" values="${values}" keyTimes="${keyTimes}" dur="${total}s" calcMode="discrete" repeatCount="indefinite"/>`)
    const lines = linesByFrame[k]
    for (const [li, line] of lines.entries()) {
      const y = TITLEBAR + 24 + li * LINE_HEIGHT
      const color = TAG_COLOR[frame.tag] ?? '#e6edf3'
      body.push(`<text x="${PADDING_X}" y="${y}" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="${FONT_SIZE}" fill="${color}" xml:space="preserve">${esc(line)}</text>`)
    }
    body.push('</g>')
  }
  body.push('</svg>')
  return body.join('\n')
}

const args = parseArgs(process.argv.slice(2))
const events = loadCast(args.cast)
const svg = render(events)
// 成功渲染后才落盘: 任何校验失败都不产生输出文件
writeFileSync(args.out, svg, 'utf8')
process.stdout.write(`[generate-demo-svg] wrote ${args.out} (${events.length} frames)\n`)
