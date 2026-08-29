#!/usr/bin/env node
// 版本锁定一致性守卫: package.json 的 version 必须与——
//   1. 双语 README 中全部 agents-gitflow-guard@x.y.z 锁定安装示例
//   2. CHANGELOG 里的 ## <version> 小节标题
// 完全一致。发版流程中「README 锁版本示例随 bump 同步」是人工步骤,
// 此脚本把它变成机器拦截(CI 与 prepublishOnly 双挂载, 漏改即红)。
import { readFileSync } from 'node:fs'

/** 纯函数核心(可独立验证): 给定版本与文件内容清单, 返回错误列表(空数组 = 通过) */
export function checkPins(version, files) {
  const errors = []
  const expected = 'agents-gitflow-guard@' + version
  const pinRe = /agents-gitflow-guard@\d+\.\d+\.\d+/g
  for (const f of files) {
    const pins = [...f.content.matchAll(pinRe)].map((m) => m[0])
    for (const pin of new Set(pins)) {
      if (pin !== expected) errors.push(f.name + ': stale pin ' + pin + ' (expected ' + expected + ')')
    }
  }
  return errors
}

function main() {
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version
  const files = ['README.md', 'README.zh.md', 'CHANGELOG.md'].map((name) => ({ name, content: readFileSync(name, 'utf8') }))
  // 锁定安装示例只存在于双语 README; CHANGELOG 仅校验小节标题(见下), 不要求含 pin
  const errors = checkPins(version, files.filter((f) => f.name !== 'CHANGELOG.md'))
  if (!files.some((f) => f.name === 'CHANGELOG.md' && f.content.includes('## ' + version))) {
    errors.push('CHANGELOG.md: missing "## ' + version + '" section heading')
  }
  if (errors.length > 0) {
    console.error('[check-version-pins] package.json version is ' + version + ', but:')
    for (const e of errors) console.error('  - ' + e)
    process.exit(1)
  }
  console.log('[check-version-pins] OK: version pins consistent with ' + version + ', CHANGELOG has section ' + version)
}

main()
