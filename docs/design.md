# dsh-gitflow-guard 设计定稿(唯一规格)

> 状态: **已定稿**(五轮交互对齐完成)
> 本文件为**唯一设计规格**, 已吸收原 `docs/proposal.md` 全部内容(原文件删除)。
> 快速导航: 设计定稿 §4 · 项目结构 §5 · 里程碑 §9 · 决策过程见附录。
>
> **公开说明(2026-08-17)**: 文中 `D:\...` 等 Windows 路径为设计期环境路径, 与本仓库实际位置
> 无关; 包名已按发布决策更名 为无 scope 的 `dsh-gitflow-guard`(见 §10 决策记录)。
> 其余设计内容仍为当前实现规格。

---

## 1. 背景与问题

### 1.1 反复出现的问题

项目流程: feature 分支开发 → **PR 合入预览分支(staging, 自动部署测试环境)** → **用户验证通过** → **PR 合入基线(develop)** → 用户同意后上主干(main)。实际执行中, agent **多次抄近路**:

- 跳过预览分支直接合入基线(develop);
- 顺序颠倒(先合 develop 再从 develop 合 preview)。

根因: `AGENTS.md` 是**软约束**——DSH 虽会每次会话自动注入其内容(`dsh-agent-instructions` 插件), 但模型可以选择性忽略。这不是一次性失误, 而是结构性问题, **发生不止一次**。

### 1.2 为什么需要机制级强制

| 机制 | DSH 支持 | 强制力 | 局限 |
|---|---|---|---|
| AGENTS.md 自动注入 | ✅ 已启用 | 🟡 软 | 模型可忽略 |
| 项目级 Skills (`.agents/skills/`) | ✅ 支持 | 🟡 软 | 需模型主动加载; skill 文件需合法 frontmatter |
| Claude Code hooks 桥接 (`dsh-hooks-claude-code`) | ✅ 支持(未安装) | 🔴 硬 | 依赖 shell 协议桥接; matcher 只匹配工具名 |
| **原生 Cordis 插件** | ✅ 支持 | 🔴🔴 **最硬** | 直接订阅类型化扩展点, 无序列化边界, 全 `ctx` 能力 |

**结论: 原生 Cordis 插件是唯一能 100% 保证"每次都被正确执行"的机制。**

---

## 2. 目标与非目标(定稿)

### 2.1 目标

1. **顺序强制**: feature 合入基线之前, 必须已合入预览且**用户确认测试通过**——由插件基于**本地 git 客观事实**验证, agent 无法撒谎或绕序。
2. **用户唯一例外权**: 用户可特许(打破规则/提前建 PR/确认合入), **agent 永远不能自我授权**。
3. **可自定义**: 分支名按角色配置(基线/预览/主干), 每项目自选模式与分支命名; 插件安装 ≠ 项目启用(opt-in)。
4. **可解释**: 每次拦截附带明确 reason + 下一步引导; 全部审计留痕。
5. **平台无关**: 核心只依赖本地 git 仓库状态, 不依赖任何 git 服务特性(GitHub/GitLab/自建均可)。

### 2.2 非目标(v1 明确不做)

- ❌ 不做 CI 平台 API 的硬门禁(gh pr checks 仅作日志参考, 查不到自动跳过)。
- ❌ 不做多机状态同步(特许状态文件单机假设, v2)。
- ❌ 不做 GitLab/Gitea 等平台适配器(v2, 接口预留)。
- ❌ 不做主动弹窗通知用户(v2 调研)。
- ❌ 不替代 AGENTS.md / Skill 文档(软层仍然有用: 给 agent 完整流程指引; 插件只做最后硬兜底)。

---

## 3. 技术依据(源码核实)

以下事实均来自 deepseek-harness 源码, 非猜测:

### 3.1 拦截点: `tools/pre-execute` 瀑布

- 位置: `packages/core/tools/src/index.ts:152`
- 类型化决策(`:588-591`):

```ts
export type PreToolDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }   // ← v1 使用: 硬拒绝, 命令不执行
  | { kind: 'ask'; reason?: string }   // 注意: 走 approval seam
```

- `deny` 跳过 `tools/execute` 与核心 dispatch, 命令**根本不会运行**; 模型看到的是错误结果, 必须停下向用户汇报。
- `ToolExecution` 含 `name` / `arguments`(pwsh 工具 `arguments.command` 即完整命令文本, `packages/shell/tool-pwsh/src/index.ts:63`)与 `session`(header.cwd 用于定位项目配置)。
- 当前会话 approval policy = `never`(`danger-full-access`): `ask` 决策不会弹窗, 直接解析为 `rejected` → 最终 `deny`(`packages/interaction/user-approval/src/index.ts:312`)。v1 直接用 `deny` + reason, 行为可预期; 未来切 `ask` 模式可平滑升级。

### 3.2 确认通道: `session/event` + `user/message`

- 插件可订阅 `'session/event'`(`packages/core/session/src/index.ts:76`), 其中 `'user/message'` 事件携带用户消息(`types.ts:264`)。
- `MessageSourceMap.user = { kind: 'user' }`(`packages/llm/llm/src/message.ts:100-105`): **真人消息可与系统注入(plugin/tool/model 来源)可靠区分**。
- **结论: "用户在聊天里确认" 是技术上可行且 agent 不可伪造的确认通道。**

### 3.3 插件安装机制与版本实测

- `dsh plugin --profile web add file:<绝对路径>`(`apps/cli/src/plugin.ts` + `packages/boot/app-boot/src/profile.ts`): 本地包加入 profile 依赖(pnpm 转发, `nodeLinker: hoisted` 扁平安装), 插件在 profile 的 `cordis.patch.yml` 中挂载, **进程启动时加载, 改代码需重启 DSH**。
- 版本实测(共享 `C:\Users\Kean\.dsh\profiles\node_modules`, hoisted): `@deepseek-ai/cordis` = **4.0.1**(vendored fork), `@deepseek-ai/dsh-tools` = **0.1.0-rc.5**。

---

## 4. 设计定稿

### 4.1 一句话

**插件在 agent 每次 git 操作时, 用"本地 git 仓库的真实状态 + 用户特许记录"验证流程顺序(先合预览、验证后合基线), 违反就硬拦截并引导; 用户是唯一能打破规则的人, agent 永远不能自我授权。**

### 4.2 核心组件

```
┌─ 命令识别层 ── 解析 agent 的 git/gh 命令文本, 分类(推/合/建PR/查状态...)
├─ 状态层 ────── 只读查询本地 git: 当前分支 / feature∈预览(merge-base --is-ancestor)
├─ 门禁层 ────── 门禁矩阵(§4.3): 顺序检查 + 特许检查 → allow / deny+引导
├─ 会话层 ────── 监听 user/message(仅 source.kind==='user')记录确认; 审计日志; 提醒注入
├─ 配置层 ────── 项目配置(角色化分支名, opt-in) + 模式(pr/flexible)
└─ CLI ──────── gitflow-guard permit/confirm/status: 用户终端专属, agent 执行被拦
```

架构推论(对齐第 ① 轮定下的基调):

- **核心强制只依赖本地 git 仓库状态**(只读查询: 分支、祖先关系、当前分支), 不依赖任何 git 服务特性。
- 服务器端 PR/MR 保护(GitHub 分支规则等)是可选增强, 存在则叠加, 不存在插件照常工作。
- 插件是**分支感知**的(拦截时可自行执行 `git branch --show-current` 等只读命令判定上下文)。

### 4.3 门禁矩阵(定稿)

| agent 操作 | 判定 |
|---|---|
| merge 进预览分支(PR 合入) | 放行(流程第一步, 多 feature 并行不限制) |
| 创建指向基线的 PR | feature∈预览 ? 放行 : (用户特许 P1 ? 放行 : deny) |
| 创建指向 trunk 的 PR | 用户对话确认许可(P3) ? 放行 : deny |
| 合入基线(PR merge / 本地 merge) | feature∈预览 + 用户确认 P2 ? 放行(消费 P2+提醒) : deny |
| 合入 trunk | 一律 deny(仅用户亲手) |
| 直推受保护分支 / 本地受保护分支上 merge / 删除强推受保护分支 | deny |
| 其余(commit/push feature/同步基线/只读/status) | 放行 |

模式差异(§4.5 `mode`):

- `pr` 模式: 直推预览分支、本地 merge 进预览分支 → deny(必须走 PR)。
- `flexible` 模式: 预览分支可直推/本地合入; 基线合入仍必须顺序 + 确认(可本地 merge)。

### 4.4 特许(permit)机制

| 特许 | 含义 | 产生方式 | 消费时机 |
|---|---|---|---|
| P1 `early-pr` | 提前创建指向基线的 PR(顺序未满足时) | 用户聊天确认 / 终端 CLI | PR 创建成功后, 提醒用户 |
| P2 `confirm` | 确认合入基线("feature X 测试 OK") | 用户聊天确认 / 终端 CLI | 合入动作成功后, 提醒用户 |
| P3 `trunk-pr` | 许可创建指向 trunk 的 PR | 用户聊天确认 / 终端 CLI | PR 创建成功后, 提醒用户 |

- **一次性使用**: 特许在对应动作成功后消费; 使用后**提醒用户**; 可设有效期, 过期未用也提醒。
- **agent 永远不能自我授权**: 特许只能由用户产生。
- 确认通道(两者都要):

| 通道 | 机制 | 防伪性 |
|---|---|---|
| 聊天确认 | 插件订阅 `session/event` 的 `user/message`, 仅认 `source.kind === 'user'` 的真人消息; 按项目配置的关键词 + feature 匹配, 自动记录特许 | ✅ agent 无法伪造用户消息 |
| 终端命令 | 用户在自己终端执行 `gitflow-guard permit/confirm` CLI; 插件拦截 agent 执行该 CLI | ✅ 插件拦 agent 用此命令 |

- 存储: `<repo>/.git/gitflow-guard/state.json`(在 .git 内, 不进仓库; v1 单机假设) + DSH 会话持久日志。

### 4.5 项目配置(定稿)

```jsonc
// gitflow-guard.config.json(项目根目录, 随仓库走, opt-in 启用)
{
  "enabled": true,                  // 插件安装 ≠ 启用; 此文件存在且 enabled=true 才生效
  "mode": "pr",                     // "pr" = 全程 PR | "flexible" = 允许直推/本地合入预览分支
  "branches": {
    "base": "develop",              // 基线分支(合入它需要顺序+确认)
    "preview": "staging",           // 预览分支(部署到测试环境)
    "trunk": "main"                 // 主干分支(发布, 可选)
  },
  "confirm": {
    "keywords": ["确认", "OK", "可以", "特许"],
    "featurePattern": "feature/[\\w-]+"
  },
  "ci": { "enabled": true }         // 可选适配器: gh pr checks 记入日志, 查不到自动跳过
}
```

### 4.6 拦截体验 / 审计 / 提醒

- deny 的 reason 文案 = **为什么拦 + 下一步该做什么**(引导性, 不冷冰冰)。
- 插件提供 `gitflow-guard status` 查询工具(纯读): 每个 feature 的"是否已合预览 / 是否已确认 / 有无特许"状态一览; agent 被拦后先自查再行动。
- 所有拦截/放行/特许/消费写入: DSH 会话持久日志 + 项目状态文件。
- 特许消费后提醒: 写日志 + 注入消息让 agent 在回复中告知用户; 主动弹窗通知 = v2 调研项。

### 4.7 多 feature 并行合入预览(补充结论)

- **预览分支合入不限制**: 多个 feature 可随时、并行合入(各团队进度不同 / 集中时间点上线测试)。
- 设计已兼容: "合入预览 = 放行"; 基线合入按 feature 逐个验证(`feature∈预览` + P2), 互不阻塞。
- 提示: 预览环境共享(含多个 feature 变更), 用户对 X 的确认发生在 Y/Z 也在预览中的场景; `gitflow-guard status` 展示当前预览所含 feature, 供确认前查看。
- 按团队/批次限制进预览: v1 默认不限制, 列为可选配置扩展。

---

## 5. 项目结构(本仓库)

```
GitFlow/
├── package.json              # @freehappyteam/dsh-gitflow-guard
├── tsconfig.json
├── src/
│   ├── index.ts              # 插件入口: name / apply / Config (M2)
│   ├── classify.ts           # 命令文本分类 (纯函数, 可单测)
│   ├── gate.ts               # 门禁矩阵 (纯函数, 可单测)
│   ├── repo.ts               # git 只读查询 (可注入 runner)
│   ├── permits.ts            # 特许状态读写 (M2)
│   ├── session.ts            # user/message 监听 + 确认解析 (M2)
│   ├── config.ts             # 项目配置加载与默认值 (M2)
│   ├── cli.ts                # gitflow-guard CLI (M3)
│   └── types.ts
├── tests/
│   ├── classify.spec.ts      # 命令分类单测
│   └── gate.spec.ts          # 门禁矩阵单测
├── bin/
│   └── gitflow-guard.mjs     # CLI 入口 (M3)
├── docs/
│   └── design.md             # 本文件(唯一规格)
└── README.md                 # (M4)
```

**依赖版本(实测)**: peerDependencies `@deepseek-ai/cordis` ^4.0.1、`@deepseek-ai/dsh-tools` ^0.1.0-rc.5; devDeps typescript ^6.0.3、vitest ^4.1.8、tsdown ^0.22.2、@types/node ^22。

---

## 6. 开发 → 安装 → 生效闭环

```bash
cd <本仓库路径>
pnpm install
pnpm test                 # vitest 单测(核心逻辑无需 DSH)
pnpm build                # tsdown → lib/
dsh plugin --profile web add file:<本仓库路径>
# 编辑 profile cordis.patch.yml 挂载插件 → 重启 DSH web → 生效
# 项目根目录放 gitflow-guard.config.json(opt-in 启用)
```

---

## 7. 测试策略

| 层 | 内容 | 方式 |
|---|---|---|
| 单测(核心) | 命令分类: 各种 git/gh 命令变体; 门禁矩阵: 顺序/特许/模式组合 | vitest, 无需 DSH |
| 配置加载 | 默认值/合并/缺字段/校验 | vitest |
| 集成(可选) | 真实 DSH 进程加载插件, 验证拦截与聊天确认 | 手动/脚本(需重启 DSH) |

**铁律**: 任何逻辑改动必须 0 Error 构建 + 单测全绿后才算完成。

---

## 8. 风险与已知限制(定稿)

1. 纯文本命令识别无法 100% 防御极端混淆(编码/变量拼接)——插件是"流程守卫", 不是安全边界; 顺序验证基于 git 事实, 混淆命令无法伪造祖先关系。
2. 预览环境共享: 确认 feature X 时环境中可能含其他 feature 变更(已接受, status 工具展示预览内容供确认前查看)。
3. 特许状态单机存储: 多机并行工作需 v2 同步。
4. 插件改动需重启 DSH: 核心逻辑做成纯函数 + 配置驱动, "改代码"降到最少。
5. 分支角色由项目配置定义: 配置错误(如把预览和基线配成同一分支)由配置校验兜底。
6. 时序状态基于"本地 git 事实 + 特许记录", 不解析 CI 平台 API 做硬门禁。

---

## 9. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M1 | 项目骨架 + classify/gate 纯函数 + vitest 单测 | `pnpm test` 全绿 |
| M2 | 插件入口 + config/repo/permits/session + 配置合并单测 | 单测全绿 |
| M3 | 构建 + CLI + 安装进 DSH profile + 真机验证(拦截/聊天确认) | 实际拦截 push develop / 绕序合入 |
| M4 | 文档完善(README) + 示例项目配置落地(GitFlow 仓库自身 dogfood) | 配置入库, 人+agent 双确认流程 |

---

## 10. 决策记录(对齐定稿答案)

| 议题 | 定稿答案 |
|---|---|
| 包名 | `@freehappyteam/dsh-gitflow-guard` |
| 规则模型 | 废弃"预设规则集 + 手写正则 allow/deny"; 门禁矩阵 + 用户特许取代(§4.3/§4.4) |
| 项目配置文件名 | `gitflow-guard.config.json`(随仓库走, opt-in) |
| RichMan 软层补强 | 各管各, 不在本仓库范围 |
| staging 生命周期 | 长期分支, 多 feature 并行合入不限制 |
| 验证信号 | 人确认(必需) + CI 参考(可选日志) |
| 合入执行人 | 基线: 特许后 agent 可合入; trunk: 仅用户亲手(建 PR 需用户许可 P3) |
| 确认通道 | 聊天确认 + 终端 CLI 双轨 |
| 特许生命周期 | 一次性, 用后消费 + 提醒, 可设有效期 |
| 平台范围 | 核心平台无关; gh CLI 适配器可选增强(v1 GitHub, 其他平台接口预留) |

---

## 附录: 五轮对齐记录(决策过程)

> 每轮结论已固化进 §4 设计定稿, 本附录保留决策过程供追溯。

### 第 ① 轮: 流程精确化

- 目标流程(以 GitFlow 仓库自身为模板):

```
develop(基线, 受保护)
  │── 切出 ──▶ feature/develop-xxx-01   (功能开发)
  │── 切出 ──▶ staging                    (长期预览分支, 接 CI/CD 自动部署)
  │
  feature/develop-xxx-01 ──PR①──▶ staging ──▶ 自动部署到测试环境
                                              │
                                         测试确认 OK(人 + CI 参考)
                                              │
  feature/develop-xxx-01 ──PR②──▶ develop    ◀── 只有此时才允许
```

- **核心不变量: PR② 必须发生在 PR① 合入且验证通过之后。**
- 结论: staging 长期分支(按 feature 逐个验证); 合入方式用户有选择权; 人确认 + CI 参考; main 可选、平台无关基调。

### 第 ② 轮: 违规清单

- 必须拦: 直推受保护分支(含 -f)/ 受保护分支上本地 merge(PR 模式)/ 合入基线(顺序+确认)/ 删除强推受保护分支。
- 不能误伤: feature 上 commit/push、feature 上 merge/rebase 基线(同步)、只读命令。
- 结论: 可配置模式; **分支命名完全可配置(角色化)**; 项目 opt-in; PR 创建默认拦但用户特许可放行; **用户特许, agent 永不自我授权**; 强推/删除只保护受保护分支。
- 技术验证: `session/event` + `user/message` + `source.kind === 'user'` → 聊天确认通道可行且不可伪造。

### 第 ③ 轮: 门禁方式

- 特许两类(P1 提前建 PR / P2 确认合入) → 定稿扩展为 P1/P2/P3(§4.4)。
- 确认通道双轨: 聊天(插件监听, agent 不可伪造)+ 终端 CLI(插件拦 agent 执行)。
- 状态存储: `<repo>/.git/gitflow-guard/state.json`。
- 合入执行人: **特许后 agent 可执行合入基线**; trunk 仅用户亲手。
- 门禁矩阵 v1 初稿 → 定稿 §4.3。

### 第 ④ 轮: 拦截体验与审计

- deny 文案 = 为什么拦 + 下一步做什么(引导性)。
- `gitflow-guard status` 查询工具(纯读): feature 的"已合预览/已确认/有无特许"状态一览。
- 审计: DSH 会话持久日志 + 项目状态文件; 特许消费后提醒(写日志 + agent 转述; 弹窗 = v2 调研)。

### 第 ⑤ 轮: 配置与边界 + 多 feature 并行补充

- 配置结构定稿(§4.5): 角色化分支 + 模式 + 确认关键词 + CI 开关。
- trunk 门禁: agent 经用户对话确认许可后可创建指向 trunk 的 PR; 合入 trunk 仅用户亲手。
- 平台范围: 核心平台无关; gh CLI 适配器可选增强。
- **补充**: 预览分支合入不限制, 多 feature 可并行(§4.7)。
