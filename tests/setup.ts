// 测试全局装配: 用户级状态根重定向到系统临时目录 —— 不污染真实家目录,
// 且在 DSH workspace-write 沙箱内可写(真实的仓库外目录对 agent 侧进程是拒绝写的,
// 而 appendAudit 设计上静默吞错, 沙箱下会让断言无声失败)。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.GITFLOW_GUARD_STATE_ROOT ??= mkdtempSync(join(tmpdir(), 'gfguard-state-'))
