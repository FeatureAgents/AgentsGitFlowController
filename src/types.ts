// 共享类型: 分支角色 / 项目配置 / 命令分类 / 门禁决策

/** 分支角色: 基线(合入需顺序+确认) / 预览(自动部署测试环境) / 主干(发布, 可选) */
export interface BranchRoles {
  base: string
  preview: string
  trunk?: string
}

/** 模式: pr = 全程 PR, flexible = 允许直推/本地合入预览分支 */
export type Mode = 'pr' | 'flexible'

/** 确认配置: 聊天确认关键词 + feature 分支名匹配 */
export interface ConfirmConfig {
  keywords: string[]
  featurePattern: string
}

/** CI 适配器开关(可选增强, 仅日志参考) */
export interface CiConfig {
  enabled: boolean
}

/** 项目配置(来自 gitflow-guard.config.json, opt-in 启用) */
export interface GuardConfig {
  enabled: boolean
  mode: Mode
  branches: BranchRoles
  confirm: ConfirmConfig
  ci: CiConfig
}

/** 特许类型: P1 提前建 PR / P2 确认合入 / P3 许可 trunk PR */
export type PermitKind = 'early-pr' | 'confirm' | 'trunk-pr'

/** 一条特许记录(一次性, 用后消费, 可设有效期) */
export interface Permit {
  id: string
  kind: PermitKind
  feature: string
  grantedAt: number
  expiresAt?: number
  used: boolean
}

/** 命令分类结果 */
export interface PushClassified {
  kind: 'push'
  /** 目标分支(未指定时为 null, 由门禁回退到当前分支) */
  dst: string | null
  force: boolean
  delete: boolean
  /** --all / --mirror 推送所有分支(门禁一律拒绝) */
  all?: boolean
}

export interface LocalMergeClassified {
  kind: 'local-merge'
  /** 被合并的分支名 */
  source: string | null
}

export interface PrCreateClassified {
  kind: 'pr-create'
  /** --base 值(未指定为 null) */
  target: string | null
}

export interface PrMergeClassified {
  kind: 'pr-merge'
  /** PR 号(未指定为 null) */
  pr: string | null
}

export interface BranchDeleteClassified {
  kind: 'branch-delete'
  branch: string | null
  force: boolean
}

/** 分支切换(checkout/switch): 门禁放行, 但 evaluateCommand 用它模拟后续段的分支状态 */
export interface CheckoutClassified {
  kind: 'checkout'
  /** 目标分支(null = 文件模式/未知, 不改变分支) */
  branch: string | null
}

export interface GuardCliClassified {
  kind: 'guard-cli'
  sub: 'permit' | 'confirm' | 'status' | 'other'
}

export interface OtherClassified {
  kind: 'other'
}

export type Classified =
  | PushClassified
  | LocalMergeClassified
  | PrCreateClassified
  | PrMergeClassified
  | BranchDeleteClassified
  | CheckoutClassified
  | GuardCliClassified
  | OtherClassified

/** 分类所需上下文(解析 HEAD / 无 refspec 等歧义) */
export interface ClassifyContext {
  currentBranch?: string | null
}

/** 门禁所需的 git 事实(由插件/CLI 从本地 git 只读查询获得) */
export interface GateFacts {
  currentBranch: string | null
  /** feature 分支是否已合入预览(merge-base --is-ancestor) */
  featureInPreview: (feature: string) => boolean
  /** 是否存在指定特许 */
  hasPermit: (kind: PermitKind, feature: string) => boolean
  /** gh pr merge 目标解析(平台适配器); 解析失败返回 null */
  resolvePrTarget?: (pr: string | null) => PrTargetResolution | null
}

/** PR 目标分支角色(解析结果) */
export type PrTarget = 'base' | 'preview' | 'trunk' | 'other'

/** PR 解析结果: 目标角色 + head 分支(来自 gh pr view); head 缺失时回退当前分支 */
export interface PrTargetResolution {
  target: PrTarget | null
  head?: string | null
}

/** 门禁决策 */
export type GateDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string; next: string }
