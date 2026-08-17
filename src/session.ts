// 会话层: 解析用户聊天确认 → 特许(纯函数; source.kind === 'user' 过滤在插件入口)

import type { GuardConfig, PermitKind } from './types'

export interface ParsedConfirmation {
  kind: PermitKind
  feature: string
}

// 意图标记: 提前建 PR > 上主干 > 确认(优先级从上到下)
// 「发布」不作为 trunk 标记: "测试通过, 准备发布" 应解析为确认(P2)
const EARLY_MARKERS = [/提前\s*(?:建|开|创建)?\s*(?:pr|pull\s*request)/i, /提前\s*建/i, /early[- ]?pr/i]
const TRUNK_MARKERS = [/主干/, /trunk/i, /上线/, /上\s*main/i]
const CONFIRM_MARKERS = [/测试\s*通过/, /通过/, /验证/, /合入/, /ok\b/i]

export function extractFeature(text: string, pattern: string): string | null {
  try {
    return text.match(new RegExp(pattern))?.[0] ?? null
  } catch {
    return null
  }
}

/** 解析确认消息; 无法识别返回 null */
export function parseConfirmation(text: string, config: GuardConfig): ParsedConfirmation | null {
  const feature = extractFeature(text, config.confirm.featurePattern)
  if (!feature) return null

  const matchAny = (markers: RegExp[]) => markers.some((m) => m.test(text))
  if (matchAny(EARLY_MARKERS)) return { kind: 'early-pr', feature }
  if (matchAny(TRUNK_MARKERS) || (config.branches.trunk != null && text.includes(config.branches.trunk))) {
    return { kind: 'trunk-pr', feature }
  }
  if (matchAny(CONFIRM_MARKERS) || config.confirm.keywords.some((k) => text.toLowerCase().includes(k.toLowerCase()))) {
    return { kind: 'confirm', feature }
  }
  return null
}
