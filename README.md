# dsh-gitflow-guard

DSH(DeepSeek Harness)插件:基于**本地 git 客观事实**强制 feature → 预览 → 基线 的合入顺序。agent 每次 git 操作被实时校验,违反流程**硬拦截**并引导;用户是唯一能打破规则的人(特许),agent 永远不能自我授权。

## 工作流

```
develop(基线, 受保护)
  ├── 切出 → feature/dev-x-01   (功能开发)
  ├── 切出 → staging            (长期预览分支, 自动部署测试环境)
  feature/dev-x-01 ──PR①──▶ staging ──▶ 测试确认(用户)
  feature/dev-x-01 ──PR②──▶ develop   ◀── 只有此时才允许
```

核心不变量:**PR② 必须发生在 PR① 合入且用户确认之后**。多 feature 可随时并行合入预览,互不阻塞。

## 安装(DSH)

```bash
pnpm install
pnpm test          # vitest 单测(核心逻辑无需 DSH)
pnpm build         # tsdown → lib/
node scripts/install-dsh.mjs [web]   # dsh plugin --profile <名> add file:<本目录>
# 重启 DSH → 插件在进程启动时加载
```

插件带 `dsh.bundle.patch` 声明,`dsh plugin add` 后自动成为 profile 层。改插件代码需重新 `pnpm build` 并重启 DSH。

## 项目启用(opt-in)

插件安装 ≠ 项目启用。在项目根目录放 `gitflow-guard.config.json`:

```jsonc
{
  "enabled": true,                  // 此文件存在且 enabled=true 才生效
  "mode": "pr",                     // "pr" = 全程 PR | "flexible" = 预览分支可直推/本地合入
  "branches": {
    "base": "develop",              // 基线分支(合入需顺序 + 用户确认)
    "preview": "staging",           // 预览分支(部署测试环境)
    "trunk": "main"                 // 主干分支(发布, 可选)
  },
  "confirm": {
    "keywords": ["确认", "OK", "可以", "特许"],
    "featurePattern": "feature/[\\w-]+"
  },
  "ci": { "enabled": true }         // 可选适配器: gh pr checks 记入日志(查不到自动跳过)
}
```

配置错误(如 base 与 preview 同名)会整体拒绝启用并提示。

## 门禁矩阵

| agent 操作 | 判定 |
|---|---|
| 合入预览分支(PR①) | 放行(流程第一步, 多 feature 并行不限制) |
| 创建指向基线的 PR | feature 已合预览 ? 放行 : (用户特许 P1 ? 放行 : deny) |
| 创建指向 trunk 的 PR | 用户特许 P3 ? 放行 : deny |
| 合入基线(PR merge / 本地 merge) | feature 已合预览 + 用户确认 P2 ? 放行 : deny |
| 合入 trunk | 一律 deny(仅用户亲手) |
| 直推/强推/删除受保护分支 | deny(base/trunk 始终受保护; 预览在 pr 模式受保护) |
| 其余(commit / 推 feature / 同步基线 / 只读 / status) | 放行 |

模式差异:`pr` 模式禁止直推预览分支与本地合入预览(必须走 PR);`flexible` 模式两者放行,基线合入仍须顺序 + 确认。

`gh pr merge` 的目标通过 `gh pr view --json baseRefName` 解析(可选适配器);gh 不可用时按「合入基线」最严规则保守处理。

## 用户唯一例外权(特许)

| 特许 | 含义 | 产生方式 | 消费时机 |
|---|---|---|---|
| P1 `early-pr` | 提前创建指向基线的 PR | 聊天确认 / 终端 CLI | PR 创建成功后 |
| P2 `confirm` | 确认合入基线("feature X 测试 OK") | 聊天确认 / 终端 CLI | 合入动作成功后 |
| P3 `trunk-pr` | 许可创建指向 trunk 的 PR | 聊天确认 / 终端 CLI | PR 创建成功后 |

- **一次性**:动作成功后自动消费并留痕;可设有效期(`--ttl`),过期未用也留痕提醒。
- **双通道**(两者都支持):
  - 聊天确认:插件监听 `session/event`,仅认 `source.kind === 'user'` 的真人消息(agent 无法伪造)。示例:"feature/dev-x-01 测试 OK"、"feature/dev-x-01 提前建 PR"、"feature/dev-x-01 可以发布上主干"。
  - 终端 CLI(用户专属,agent 执行会被插件拦截):

```bash
gitflow-guard permit <feature> [--kind early-pr|confirm|trunk-pr] [--ttl <分钟>]
gitflow-guard confirm <feature> [--ttl <分钟>]
gitflow-guard status [--repo <路径>]     # 只读: 预览所含 feature / 特许一览, agent 可自查
gitflow-guard audit [--lines <数量>]     # 只读: 审计记录
```

deny 拦截文案 = 为什么拦 + 下一步该做什么;所有拦截/放行/特许/消费写入 `.git/gitflow-guard/audit.jsonl` 与 `state.json`(不进仓库)。

## 限制(v1)

- 纯文本命令识别无法 100% 防御极端混淆(编码/变量拼接)——插件是流程守卫,不是安全边界;顺序验证基于 git 事实,混淆无法伪造祖先关系。
- 特许状态单机存储(`.git/gitflow-guard/`),多机并行工作需 v2 同步。
- 预览环境共享:确认 feature X 时环境中可能含其他变更,确认前可用 `gitflow-guard status` 查看预览内容。
- 不解析 CI 平台 API 做硬门禁(gh 适配器仅日志参考);核心平台无关,不依赖任何 git 服务特性。

## 开发

```bash
pnpm test          # 单测(命令分类 / 门禁矩阵 / 配置 / 特许 / 解析 / 集成)
pnpm typecheck     # tsc --noEmit
pnpm build         # tsdown → lib/(CLI 与插件共用)
```

**铁律**:任何逻辑改动必须 0 Error 构建 + 单测全绿后才算完成。

设计规格见 [docs/design.md](docs/design.md)。
