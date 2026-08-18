# agents-gitflow-guard

> **有没有受够了 agent 跳过你的合入流程?**

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(DSH)的插件:  
依据本地 git 事实强制 **feature → 预览 → 基线** 合入顺序 —— agent 无法跳过流程,例外只能由你授予。

[English](README.md) · [许可证](LICENSE)

[![ko-fi](https://img.shields.io/badge/ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## 目录

- [快速开始——30 秒用上](#快速开始30-秒用上)
- [为什么需要它——解决的问题](#为什么需要它解决的问题)
- [适合谁——场景与团队](#适合谁场景与团队)
- [它能做什么](#它能做什么)
- [它不能做什么——诚实的边界](#它不能做什么诚实的边界)
- [与服务器端分支保护的对比](#与服务器端分支保护的对比)
- [工作原理——三句话](#工作原理三句话)
- [配置参考](#配置参考)
- [门禁矩阵——拦什么、放什么](#门禁矩阵拦什么放什么)
- [用户例外权(特许)——打破规则的唯一方式](#用户例外权特许打破规则的唯一方式)
- [安装详解](#安装详解)
- [常见疑问(FAQ)](#常见疑问faq)
- [术语表](#术语表)
- [路线图](#路线图)
- [赞助支持](#赞助支持)
- [开发](#开发)
- [许可证](#许可证)

---

## 快速开始——30 秒用上

**第 1 步——安装**,一条命令,然后重启 DSH(插件在进程启动时加载):

```bash
dsh plugin --profile web add agents-gitflow-guard
```

**第 2 步——配置**,在**项目根目录**创建 `gitflow-guard.config.json`:

```jsonc
{
  "enabled": true,
  "mode": "pr",
  "branches": {
    "base": "develop",
    "preview": "staging",
    "trunk": "main"
  }
}
```

这一个文件就是全部配置:它声明"本项目启用守卫"、"我的基线是 `develop`"、"我的预览是 `staging`"。插件按项目 opt-in——文件不存在或 `enabled: false` 时什么都不做。

**第 3 步——验证**。让 agent 执行 `git push origin develop`,预期工具调用被拒绝:

```text
Error: [gitflow-guard] 已拦截: 受保护分支「develop」禁止直推
下一步: 基线分支(develop)由 PR 合入: 先合入预览并确认(P2), 再创建指向基线的 PR
```

**完成。** 守卫对该仓库生效。继续往下看[完整实战示例](#完整实战示例一个-feature-的端到端旅程),或准备好映射自己的分支名时跳到[配置参考](#配置参考)。

### 完整实战示例——一个 feature 的端到端旅程

场景:团队开发登录页(`feature/login-page`),基线 `develop`,预览 `staging`。每一步 agent 做什么、插件判定什么、你看到什么:

| # | agent 执行的命令 | 插件判定 | 你看到的结果 |
|---|---|---|---|
| 1 | `git checkout -b feature/login-page` | ✅ 放行(feature 工作自由) | 分支创建 |
| 2 | `git add . && git commit -m "feat: login"` | ✅ 放行 | 已提交 |
| 3 | `git push -u origin feature/login-page` | ✅ 放行(推自己的 feature 没问题) | 已推送 |
| 4 | `git checkout develop && git merge feature/login-page` | 🚫 **拦截** — 尚未合入预览 | 提示: 先合入 staging(PR①), 测试后 P2 |
| 5 | *(尝试绕序)* 一条串联命令 `git checkout develop && git merge feature/login-page` | 🚫 **拦截** — 按段模拟分支切换, 无法绕过 | 同样的拒绝 |
| 6 | `gh pr create --base staging` | ✅ 放行(PR①: feature → 预览是流程第一步) | PR 创建 |
| 7 | *(你合并 PR①)* | — | feature 进入 `staging`, 部署测试环境 |
| 8 | 你在 DSH 聊天输入: `feature/login-page 测试 OK,可以合入` | 插件记录 **P2 特许**(审计 `grant`) | 已确认 |
| 9 | `git checkout develop && git merge feature/login-page` | ✅ 放行 — 顺序(∈ 预览)+ P2 都满足 | 合并成功 |
| 10 | *(合并完成后)* | 插件**消费** P2 特许(审计 `consume`) | 一次性用尽 |
| 11 | `gitflow-guard status` / `gitflow-guard audit` | ✅ 放行(只读) | 完整状态与时间线: grant → consume |

注意整个流程中 agent **无法**做到的事:跳过第 6/7 步、在第 8 步自我确认、把同一次确认复用到下一个 feature。每个例外都是一次显式的用户动作,在审计中可见。

---

## 为什么需要它——解决的问题

AI 编码 agent 在你的仓库里工作。它通过系统提示词、项目智能体指令文件(`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`.cursorrules` 等各家命名)和项目文档被"告知"要遵循合入流程:feature 分支开发 → 合入预览分支(自动部署的测试环境)→ 用户确认 → 合入基线。

**这是软约束。** agent 会跳过它、颠倒顺序、或"忘记"它——不是因为恶意,而是因为软性指令对模型来说是可选的。

本插件把软约束变成**硬机制**。agent 每次 git 操作都在执行前被校验——对照本地仓库的真实状态。违规操作在命令运行前被拦截,并给出原因和下一步。

没有人需要记住规则——规则被强制执行。

---

## 适合谁——场景与团队

### 这些信号说明它适合你

- 团队有 AI agent 参与仓库开发,并且有(或想建立)正式的分支流程(feature → 预览 → 基线)。
- agent 已经抄过一次近路:绕过预览直接合入基线,或未经测试确认就合入。发生过一次就会再发生——本插件就是结构性修复。
- 你保护基线与主干,但不想靠人工 review 去抓每一次抄近路。
- 多个 feature 并行开发、汇入同一个预览环境,你需要在合入基线前按 feature 逐个验证。

### 具体场景举例

1. **独立开发者 + agent 做客户项目。** 你把任务丢给 agent,它"好心"直接合入基线,预览环境就过期了。每个项目一个配置文件,agent 在机制上无法在"预览 + 你的确认"之前合入基线——哪怕你没盯着它。
2. **小团队(3–10 人)+ CI 自动部署预览。** staging 合入即自动部署;某天 agent 把一个从未部署、从未测试的 feature 合进了 `develop`。从此,每次基线合入都要求:feature ∈ staging **且**你的聊天确认——一次刻意的、留审计的动作,而不是一次"忘了"。
3. **大团队、多个 agent。** agent 在 feature 分支上自由工作(commit / push / 同步 / rebase 全放行);门禁保证未经确认的东西进不了基线。feature 开发速度完全不变,被拿掉的只有抄近路。
4. **异步协作。** 你不是随时在线。守卫在你不在的时段维持流程秩序;例外依然只能由你授予,且每个例外都有审计留痕。

**不适合你**(另见[它不能做什么](#它不能做什么诚实的边界)):

- **单分支流(trunk-based)**——所有人直接合一条分支:插件会处处拦截。
- **没有明确流程的个人仓库**——没有可强制的对象,没有价值。
- **不愿建立 feature → 预览 → 基线 流程的团队**——插件强制一种流程,不会发明一种。

---

## 它能做什么

- **执行前拦截**:直推/强推/删除受保护分支;feature 未进预览就合入基线;合入主干;agent 试图给自己授权例外。
- **用 git 事实强制顺序**:"这个 feature 合入预览了吗?"由本地 `merge-base --is-ancestor` 判定——不依赖任何托管服务,也不相信 agent 的自述。
- **唯一例外权——你**:用户可以特许提前建 PR、确认 feature 测试通过、许可主干 PR。agent 永远不能自我授权。
- **任何命名都可以**:分支名由你的配置映射,零硬编码(见[配置参考](#配置参考))。
- **全程审计**:每次拦截/特许/消费写入 `.git/gitflow-guard/`(审计 + 状态)——在 .git 内,不进仓库。
- **核心平台无关**:纯本地 git;有 `gh` 时可选查阅(PR 目标解析、CI 状态日志参考),没有也完全可用。

---

## 它不能做什么——诚实的边界

- **不是安全工具**:命令解析是尽力而为,存心混淆命令的 agent 可能绕过文本分析。但**顺序校验本身无法伪造**——git 祖先关系是事实,不是声称。
- **不做 CI 平台硬门禁**:`gh pr checks` 仅作日志参考,从不作为硬门禁。平台侧强制属于分支保护规则,可以叠加在插件之上。
- **不替代流程本身**:你的项目必须真的使用 feature → 预览 → 基线 流程。如果团队把所有东西直接合到一条分支,这个插件会处处拦截——不要在这种项目启用。
- **v1 无多机状态同步**:特许状态存本地,另一台机器看不到(列入 v2)。
- **v1 无主动弹窗通知**:动作结果通过审计与对话呈现,不主动推送给你。

---

## 与服务器端分支保护的对比

服务器端分支保护(GitHub 分支规则、GitLab 受保护分支)与本插件解决的是**两个不同的问题**。它们是互补关系,不是二选一。

| 维度 | 服务器端分支保护 | 本插件 |
|---|---|---|
| 管什么 | **谁**能推/合入受保护分支(权限) | **合入的顺序与前提**(流程) |
| 能否表达"用户确认测试通过" | 不能——最多要求 review 批准, 而 agent 参与 review 时形同虚设 | 能——独立的、可审计的特许(P2), agent 无法自我授予 |
| 能否强制"先预览后基线" | 不能——保护按分支, 不按流程 | 能——门禁在基线合入前检查 feature ∈ 预览 |
| 作用范围 | 仓库所有用户, 含人 | 装了插件并启用的 DSH agent(人不受限) |
| 强制时机 | 服务器端, push/merge 时 | 本地, 命令执行前 |
| 平台 | 绑定托管服务 | 纯本地 git, 平台无关 |
| 谁能绕过 | 有管理员权限的人 | DSH 之外的人, 或铁了心混淆的恶意 agent |

为什么重要:分支保护回答"**这次推送能不能发生**";本插件回答"**这个 agent 现在该不该合并(按流程)**"。最强的配置是**两者都用**——插件保证 agent 对流程诚实,分支保护保证任何人(agent 或人)都不能直推受保护分支。

---

## 工作原理——三句话

1. agent 调用 shell 工具(`pwsh` / `bash`)执行 git 命令。
2. 插件分类命令、读取本地 git 事实(当前分支、feature 是否为预览分支的祖先)、查询特许状态,套用门禁矩阵。
3. 违规 → 工具调用在**运行前被拒绝**,附原因与下一步;合规 → 放行,留审计。

确认通道:插件监听 DSH 聊天消息,只接受**真人**(`source.kind === 'user'`)来源——agent 无法伪造。

### 设计原理——它为什么有效

#### 1. 本地 git 事实是唯一可信来源

插件从不问 agent"你在哪个分支?"或"用户确认了吗?"——它自己跑只读 git 查询(`branch --show-current`、`merge-base --is-ancestor feature preview`)。

git 祖先关系是仓库的事实:如果 feature 的 HEAD 是预览分支的祖先,合入就发生了;否则没有。agent 可以声称任何事,仓库不会撒谎。

---

#### 2. 拦截发生在执行前,不是事后

插件挂在工具管线的 `tools/pre-execute`——命令被分发**之前**的决策点。在这里 `deny`,命令**根本不会运行**,agent 只看到拒绝结果。事后检测(扫描日志)无法作为强制手段——破坏已经发生。

---

#### 3. 确认通道在机制上不可伪造

DSH 的聊天消息带生产者标记(`source`)。只有真人输入的消息带 `source.kind === 'user'`;模型输出、工具结果、插件注入都带不同的 source。插件只接受 user 来源的确认——"用户确认了"这件事,agent、模型、其他插件都无法伪造。

---

#### 4. 特许一次性、动作成功后消费

"一次性"意味着每个例外都是显式、可审计、不重复的——不存在"永久豁免的 feature"。"成功后消费"意味着失败的动作(如 PR 创建失败)不浪费特许:它保留到下次尝试。两个性质都在审计里可见(`grant` → `consume`)。

---

## 配置参考

### 分支角色——插件校验的模型

插件建模**四个角色**。固定的是角色关系,不是分支名。

```text
trunk ─── (可选, 发布) 合入它: 一律拦截 —— 仅用户亲手
  ▲
baseline ─ 合入它需满足: feature ∈ 预览  +  用户确认(P2)
  ▲
preview ── 合入它: 始终放行(PR①)—— 多 feature 并行
  ▲
feature 分支 — 你的工作分支, 按 featurePattern 识别
```

| 角色 | 配置键 | 受保护? | 强制行为 |
|---|---|---|---|
| **基线** | `branches.base` | 始终 | 禁止直推/强推/删除;合入需顺序 + P2 |
| **预览** | `branches.preview` | pr 模式下 | pr 模式禁止直推/本地合入;合入它始终放行 |
| **主干** | `branches.trunk`(可选) | 始终 | 除用户亲手外, 谁都不能合入 |
| **feature** | 由 `confirm.featurePattern` 匹配 | — | 自由: commit / push / 同步 / rebase |

### 自定义分支名——任何命名都可以

`branches` 把仓库的**真实分支名**映射到角色上,零硬编码。示例:基线 `master`、预览 `beta`、主干 `production`,feature 分支用 `fix/`、`task/` 前缀:

```jsonc
{
  "enabled": true,
  "mode": "pr",
  "branches": {
    "base": "master",
    "preview": "beta",
    "trunk": "production"
  },
  "confirm": {
    "keywords": ["确认", "OK", "可以", "特许"],
    "featurePattern": "(fix|task)/[\\w-]+"
  }
}
```

用这份配置,插件对 `master` 的处理与默认示例中的 `develop` 完全一致:agent 直推 `master` 被拦;`fix/auth-42` 未合入 `beta` 且未经你确认时,合入 `master` 被拦;`gitflow-guard status` 以你的分支名展示报告。

**`featurePattern`**:JS 正则,匹配分支名。匹配 → feature 分支(自由 push/互合/同步);不匹配且非角色分支 → "其余"(放行)。按你团队的实际命名配置。

### 完整字段参考

```jsonc
{
  "enabled": true,                 // opt-in: 文件存在且 enabled=true 才生效
  "mode": "pr",                    // "pr" = 全程 PR | "flexible" = 预览分支可直推/本地合入
  "branches": {
    "base": "develop",             // 必填: 基线分支
    "preview": "staging",          // 必填: 预览分支
    "trunk": "main"                // 可选: 主干分支(发布)
  },
  "confirm": {
    "keywords": ["确认", "OK", "可以", "特许"],   // 聊天确认触发词
    "featurePattern": "feature/[\\w-]+"          // 匹配你 feature 分支的 JS 正则
  },
  "ci": { "enabled": true }        // 可选适配器: gh pr checks 记入日志(查不到自动跳过)
}
```

**校验**:`branches.base` 与 `branches.preview` 必填;两个角色映射到同一分支会被拒绝;`mode` 必须为 `pr` 或 `flexible`;非法 `featurePattern` 正则被拒绝。**任何配置错误都会让该项目整体不启用**(并报告错误),而不是半猜半应用。

**`mode` 说明**:
- `pr`(默认):预览分支受保护——feature 只能经 PR 进入预览(禁止直推、禁止本地合入)。
- `flexible`:预览分支可直接推送/本地合入;基线合入在两种模式下都须顺序 + P2。

---

## 门禁矩阵——拦什么、放什么

| agent 操作 | 判定 |
|---|---|
| 合入预览分支(PR①) | ✅ 放行(流程第一步, 多 feature 并行) |
| 创建指向基线的 PR | ✅ feature ∈ 预览 · 否则 P1 特许 ? 放行 : 🚫 拦截 |
| 创建指向 trunk 的 PR | P3 特许 ? ✅ 放行 : 🚫 拦截 |
| 合入基线(PR merge / 本地 merge) | feature ∈ 预览 + P2 ? ✅ 放行 : 🚫 拦截 |
| 合入 trunk | 🚫 一律拦截(仅用户亲手) |
| 直推/强推/删除受保护分支 | 🚫 拦截 |
| 串联命令(`checkout develop && merge feature/x`) | 🚫 拦截——按段模拟分支切换, 无法绕序 |
| commit / 推 feature / 同步基线 / rebase / 只读 / `gitflow-guard status` | ✅ 放行 |

`gh pr merge` 通过 `gh pr view` 解析目标(可选适配器);无 `gh` 时按基线规则保守处理。

---

## 用户例外权(特许)——打破规则的唯一方式

| 特许 | 含义 | 产生方式 | 消费时机 |
|---|---|---|---|
| P1 `early-pr` | 顺序未满足时提前创建基线 PR | 聊天 / CLI | PR 创建成功后 |
| P2 `confirm` | "feature X 测试 OK"——允许合入基线 | 聊天 / CLI | 合入成功后 |
| P3 `trunk-pr` | 允许创建指向 trunk 的 PR | 聊天 / CLI | PR 创建成功后 |

**一次性**:动作成功后自动消费(留审计)。可用 `--ttl` 设有效期,过期未用也会留痕。

**agent 永远不能自我授权**——插件会拦截 agent 执行 `permit` / `confirm`。

**① 聊天确认**——在 DSH 里直接输入(仅真人消息有效):

```text
feature/dev-x-01 测试 OK,可以合入     → P2 confirm
feature/dev-x-01 提前建 PR            → P1 early-pr
feature/dev-x-01 可以发布上主干        → P3 trunk-pr
```

(默认触发词为中文,可按你的语言配置 `confirm.keywords`。)

**② 终端 CLI**(用户专属):

```bash
gitflow-guard permit <feature> [--kind early-pr|confirm|trunk-pr] [--ttl <分钟>]
gitflow-guard confirm <feature> [--ttl <分钟>]
gitflow-guard status [--repo <路径>]     # 只读: 预览所含 feature / 各 feature 特许
gitflow-guard audit [--lines <数量>]     # 只读: 审计记录
```

---

## 安装详解

**前置**:可用的 [DSH](https://github.com/deepseek-ai/deepseek-harness) 安装。

**从 npm 安装**——标准路径,已在[快速开始](#快速开始30-秒用上)覆盖:

```bash
dsh plugin --profile web add agents-gitflow-guard
```

然后重启 DSH。升级用同一条命令,之后同样重启。

**从源码安装**——贡献者用,或想跑最新 checkout:

```bash
pnpm install && pnpm build
dsh plugin --profile web add file:/path/to/agents-gitflow-guard
```

包自带 `dsh.bundle.patch` 声明,`dsh plugin add` 自动把它挂为 profile 层,无需手工编辑 profile。

---

## 常见疑问(FAQ)

### 我的分支不叫默认名字,能用吗?

能——分支名没有任何一处是写死的。三个角色(基线、预览、主干)是概念;`branches` 字段把仓库的**真实分支名**映射到这些概念上,`featurePattern` 告诉插件怎么识别你的 feature 分支。

一个把基线叫 `master`、预览叫 `beta`、feature 分支用 `fix/` 前缀的团队,只需把这套命名写进配置,之后的一切——拦截文案、状态报告、审计记录——都说的是你的分支名。你不需要采纳任何固定约定,只需要声明一份映射。

完整的例子见[自定义分支名](#自定义分支名任何命名都可以)。

---

### 我的项目不用 feature → 预览 → 基线 流程呢?

那这个插件不适合你,强行启用会是很挫败的错误:每次常规合并都会被拦截,因为守卫强制的是一个你的工作流里不存在的顺序。它是一套"已有流程的强制机制",不是流程的替代品。

有一个细节值得知道:如果团队已经很接近了——确实有 feature 分支和共享预览,只是喜欢直接推预览而不是走 PR——`flexible` 模式可以在基线上保留顺序 + 确认的要求,同时放宽预览的规则。

---

### 它是安全工具吗?

不是,而且这一点很重要——不要把它当安全工具用。它是流程守卫:让一个约定的流程在机制上可执行。文本命令识别天生是尽力而为——铁了心混淆命令的 agent 有可能绕过解析器。

但**顺序校验本身无法伪造**:一个 feature 是不是预览分支的祖先,是仓库的属性,不是 agent 能编造的声称。如果你需要防御恶意 agent 的真正保护,那属于托管服务上的分支保护规则;本插件是把诚实的工作流维持诚实的层次。

---

### 为什么 agent 不能自己跑 `gitflow-guard permit ...`?

因为两条例外通道都对它封闭。`permit` / `confirm` 命令被分类为用户专属:它们以工具调用形式出现时,插件直接拒绝。

聊天通道以同样的方式封闭——插件只接受消息来源为 `source.kind === 'user'` 的确认,这个标记只有真人输入才携带;模型输出、工具结果、插件注入都带不同的来源。

两条通道收敛到同一个保证:**例外只能来自人,绝不来自 agent**。这就是"用户是唯一例外权"不是一句口号的技术基础。

---

### 必须装 `gh` CLI 吗?

不必。`gh` 集成是可选适配器:它让插件能解析 `gh pr merge` 实际指向的目标,并把 `pr checks` 状态作为日志参考记录。

没有 `gh`,插件走保守路径——无法解析的 `pr merge` 按基线规则处理——其余一切照常。核心强制从不触碰托管服务,这也是为什么插件在 GitHub、GitLab、自建服务器、甚至离线仓库上表现完全一致。

---

### 会误拦我的正常工作吗?

刻意地不会。feature 分支该做的事——commit、push、同步基线、rebase、只读命令、`gitflow-guard status`——全部无摩擦放行。

拦截只保留给两类动作:对受保护分支的写入,以及跳过顺序或确认的基线合入。

如果看到疑似误拦,先跑 `gitflow-guard status`——报告会展示判定所依据的精确事实(feature 是否在预览中、有哪些特许),让误判可见、可纠正,而不是莫名奇妙。

---

### 配置写错了会怎样?

插件倾向"宁可禁用":配置有任何校验错误,该项目整体禁用并报告错误——半猜半套的配置绝不会被悄悄应用。

最常见的错误是:两个角色映射到同一分支(明确拒绝)、`featurePattern` 无法编译(按非法正则拒绝)、`mode` 拼写错误。因为失败是响亮的、文件只是单个 JSON 对象,修复通常是三十秒的改正,然后守卫正常工作。

---

### 多台机器能用吗?

单机内,完全可用——特许状态和审计在 `.git/gitflow-guard/` 里,跨 DSH 重启持久。

跨机器,还不行:如果你和 agent 在不同电脑工作,一台机器上授予的确认另一台看不到,那边的合并会一直拦截直到你再次确认。这是 v1 的限制,已有清晰的 v2 方案(同步状态),见[路线图](#路线图)。

---

### 合法的 PR①(feature → 预览)会被误拦吗?

不会。合入预览分支是流程的第一步,始终放行——多个 feature 并行进入预览正是这个模型期待的形态。

顺序门禁只作用于基线合入,所以正常路径(feature → 预览 → 确认 → 基线)永远不会触发它。

---

### 插件到底查了本地仓库的什么?

三个只读查询,仅此而已:当前分支(`git branch --show-current`)、feature 是否为预览分支的祖先(`git merge-base --is-ancestor`)、以及——仅针对 `gh pr merge`——PR 的目标分支(`gh pr view`)。

不写任何东西,不碰远程,不依赖任何托管服务特性。这正是插件能对顺序做出硬承诺的全部原因:它信任的事实来自仓库本身。

---

### 许可证 / 收费?

MIT,免费,无条件。随便用、随便改、随便发,唯一义务是保留版权声明。

如果它帮你和团队拦下了一次抄近路的事故,页面顶部的咖啡按钮值得点一下,但绝不是必需。见[许可证](#许可证)。

---

## 术语表

| 术语 | 含义 |
|---|---|
| **基线 baseline** | 你的稳定集成分支(`branches.base`);受保护;合入需顺序 + P2 |
| **预览 preview** | 测试环境分支(`branches.preview`);feature 自由合入(PR①) |
| **主干 trunk** | 发布分支(`branches.trunk`, 可选);仅用户亲手 |
| **feature 分支** | 你的工作分支, 由 `featurePattern` 匹配 |
| **PR① / PR②** | feature → 预览 / feature → 基线 |
| **特许 permit** | 一次性用户例外(P1 early-pr / P2 confirm / P3 trunk-pr) |
| **门禁矩阵** | 命令分类 → 放行/拦截 的判定表 |
| **P2** | 解锁基线合入的用户确认 |
| **pre-execute** | 工具管线中执行拦截的钩子点——命令运行之前 |
| **`source.kind === 'user'`** | DSH 标记真人输入的消息标签——不可伪造的确认通道 |
| **`merge-base --is-ancestor`** | 回答"这个 feature 合入预览了吗"的 git 查询——真实可信 |

---

## 路线图

- **i18n — 拦截文案多语言**:当前拦截文案默认中文;改为跟随用户语言(和插件配置)。
- **v2 — 多机状态同步**:跨机器同步特许/审计。
- **v2 — 平台适配器**:GitLab / Gitea 支持(接口已预留)。
- **v2 — 通知**:特许消费时主动推送用户(当前为审计 + 对话)。
- **v2 — CI 硬门禁调研**:评估 `gh pr checks` 是否可成为真门禁而不损害平台无关核心。
- **生态**:常见工作流配置模板;社区贡献多语言确认关键词。

欢迎贡献——见[开发](#开发)。

---

## 赞助支持

插件免费开源(MIT)。如果它帮你和团队拦下了一次抄近路的事故,一杯咖啡就是最好的鼓励:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/keanz21)

---

## 开发

```bash
pnpm install
pnpm test          # 单测: classify / gate / config / permits / session / 真实 git 集成
pnpm typecheck     # tsc --noEmit, 0 Error
pnpm build         # tsdown → lib/(CLI 与插件共用)
```

**铁律**:任何逻辑改动必须 0 Error 构建 + 单测全绿后才算完成。

---

## 许可证

[MIT](LICENSE) © FeatureAgents

设计定稿(决策记录):[docs/design.md](docs/design.md)。
