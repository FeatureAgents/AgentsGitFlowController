// 共享类型: 分支角色 / 项目配置 / 命令分类 / 门禁决策

/** 角色更新方式: pr = 只能 PR/MR 合入; flexible = 允许 feature 直推/本地合入 */
export type UpdateMode = 'pr' | 'flexible'

/** 合并权限: user = 只能用户亲手点合并; anyone = 放行 agent 走 PR 合并 */
export type MergeBy = 'user' | 'anyone'

/** 单个角色的分支集合与规则(分支条目支持精确名或正则, 由 config 层规范化) */
export interface BranchRole {
  branches: string[]
  update?: UpdateMode
  mergeBy?: MergeBy
}

/** 分支角色: 必填 integration; 其余(preview/production/archive)可选, 配了才启用对应保护 */
export interface BranchRoles {
  integration: BranchRole
  preview?: BranchRole
  production?: BranchRole
  archive?: BranchRole
}

/** CI 适配器开关(可选增强, 仅日志参考) */
export interface CiConfig {
  enabled: boolean
}

/** 文案语言: 默认 en; 'zh' 切中文; 可经 registerLocale 运行时扩展(保留字面量提示的宽字符串) */
export type Locale = 'en' | 'zh' | (string & {})

/** 项目配置(来自 gitflow-guard.config.json, opt-in 启用) */
export interface GuardConfig {
  enabled: boolean
  /** 自由开发的 feature/发布分支识别正则 */
  featurePattern: string
  branches: BranchRoles
  ci: CiConfig
  /** 用户可见文案语言(默认 'en'; 缺失时按 'en' 处理) */
  locale?: Locale
  /** fail-closed 策略位: true 时配置异常/内部异常改为拦截(默认 fail-open 放行) */
  strict?: boolean
}

/** 分支角色名(门禁判定对象) */
export type BranchRoleName = 'feature' | 'integration' | 'preview' | 'production' | 'archive' | 'other'

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
  /** PR/MR 号(未指定为 null) */
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
  sub: 'status' | 'other'
}

/** git update-ref 直改 refs(plumbing): 受保护分支一律拒绝 */
export interface RefUpdateClassified {
  kind: 'ref-update'
  /** 目标分支(剥离 refs/heads/ 前缀后, 供角色比对) */
  branch: string | null
  delete: boolean
}

/** 本地改写当前分支 tip 的命令(reset / rebase / commit --amend / filter-branch): 门禁按(模拟)当前分支角色判定 */
export interface RefMoveClassified {
  kind: 'ref-move'
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
  | RefUpdateClassified
  | RefMoveClassified
  | OtherClassified

/** 分类所需上下文(解析 HEAD / 无 refspec 等歧义) */
export interface ClassifyContext {
  currentBranch?: string | null
}

/** 门禁所需的 git 事实(由插件/CLI 从本地 git 只读查询获得) */
export interface GateFacts {
  currentBranch: string | null
  /** PR/MR 目标解析(平台适配器); 解析失败返回 null */
  resolvePrTarget?: (pr: string | null) => PrTargetResolution | null
}

/** PR 解析结果: 目标角色 + head 分支 + 目标分支名(来自 gh/glab view) */
export interface PrTargetResolution {
  role: BranchRoleName | null
  target: string | null
  head?: string | null
}

/** 门禁决策 */
export type GateDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string; next: string }
