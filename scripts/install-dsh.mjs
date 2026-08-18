#!/usr/bin/env node
// 构建并安装插件进 DSH profile:
//   node scripts/install-dsh.mjs [profile 名, 默认 web]
// 安装后重启 DSH 即生效; 项目内启用见 README(放 gitflow-guard.config.json)

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const profile = process.argv[2] ?? 'web'

if (!existsSync(join(root, 'lib', 'index.mjs'))) {
  console.log('[install] 先构建 lib/ ...')
  execSync('npm run build', { cwd: root, stdio: 'inherit' })
}

console.log(`[install] dsh plugin --profile ${profile} add file:${root} ...`)
try {
  execSync(`dsh plugin --profile ${profile} add file:${root}`, { stdio: 'inherit' })
} catch {
  console.error('[install] dsh plugin 执行失败: 请确认 dsh CLI 已安装并在 PATH 中')
  process.exit(1)
}

console.log(`\n[install] 完成。${profile} profile 的 bundles 已包含 agents-gitflow-guard。`)
console.log('接下来:')
console.log('  1. (如需覆盖默认插件配置) 在 profile 的 cordis.patch.yml 中按 id "gitflow-guard" 覆盖 config')
console.log('  2. 重启 DSH(插件在进程启动时加载, 改插件代码后需重启)')
console.log('  3. 在目标项目根目录放 gitflow-guard.config.json(enabled: true) 启用, 见 README')
