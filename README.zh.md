# agents-gitflow-guard

> **有没有受够了 agent 跳过你的合入流程?**

一个可自由配置分支角色的流程守卫，为主流 AI 编码 agent 平台而生——[Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)、[Codex](https://github.com/openai/codex)、[OpenCode](https://github.com/opencode-ai/opencode)、[Antigravity](https://github.com/google-deepmind)、[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH)、[Pi](https://github.com/mariozechner/pi)。  
你自己定义分支——**集成分支**(feature 经 PR/MR 合入)、**预览分支**(环境终点)、**生产分支**、**归档分支**——每个角色各自配规则。agent 无法跳过流程,敏感合并始终留在你手上。

[English](README.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-tw.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Русский](README.ru.md) · [许可证](LICENSE)

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
- [人保持控制权的地方](#人保持控制权的地方)
- [安装详解](#安装详解)
- [常见疑问(FAQ)](#常见疑问faq)
- [术语表](#术语表)
- [路线图](#路线图)
- [赞助支持](#赞助支持)
- [开发](#开发)
- [许可证](#许可证)

---

## 快速开始——30 秒用上

**第 1 步——安装**。六个客户端全部使用同一个 npm 包 `agents-gitflow-guard`，按你的 agent 类型选择对应方式：

```bash
# 模式 A: CLI Hook 客户端 (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# 模式 B: DSH 进程内插件 (安装后重启 DSH，插件在进程启动时加载)
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# 模式 C: Pi 进程内扩展
npm i -D agents-gitflow-guard
```

> **提示**: 默认安装 npm 注册表上的最新版本。若镜像源缓存有延迟或需锁定版本，可指定版本号（如 `npm i -g agents-gitflow-guard@<版本>`）。(使用 DSH 时若 pnpm 打印 peer 依赖警告属正常预期——DSH 运行时会自动通过共享模块解析 `@deepseek-ai/cordis` / `@deepseek-ai/dsh-tools`。)
>
> CLI Hook 客户端装完后执行一步接线（每个客户端一条命令，见第 2 步）；Pi 复制一个扩展文件；DSH 在插件添加后自动完成挂载。

**第 2 步——接线(无需配置文件)。** 守卫内置**默认配置,开箱即用:默认保护 `develop`(integration)+ `main`(archive)**,零配置。你要做的只是让 AI 客户端去调用守卫——每个 stdin-hook 客户端一条命令(DSH 自动接线;Pi 拷文件,见下):

```bash
# Claude Code → 本仓库 .claude/settings.json
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity(各写各的配置文件; --yes 跳过 y/N 确认)
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# 只预览不写入 / 移除 / 交互向导:
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` 对已有配置**非破坏性合并**(已存在的 hook 不动),默认只写**当前工程目录**;`--global`(本机所有仓库)写入前必先确认或需 `--yes`。各客户端的文件与格式见[安装详解](#安装详解)。

> ⚠️ **main 默认受保护。** trunk / 单分支工作流(所有人直推同一条分支)的用户,装完第一次直推 `main` 就会被拦——创建 `gitflow-guard.config.json` 写 `{ "enabled": false }`,或自行映射分支(见[配置参考](#配置参考))。`gitflow-guard status` 在默认配置生效时也会反复提示这一点。

**第 3 步——验证**。让 agent 执行 `git push origin develop`,预期工具调用被拒绝:

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

**文案默认是英文**(面向国际化)。要在你的项目里看中文,创建配置并加 `"locale": "zh"`;中文效果是:*已拦截:受保护分支「develop」禁止直推 / 下一步:集成分支(develop)由 PR/MR 合入 feature……*

**完成。** 守卫已用内置默认配置生效。想要更多关卡(`preview` / `production`)或改分支名?写一个 `gitflow-guard.config.json`,只写你在意的字段,其余保持内置默认。完整判定表见[门禁矩阵](#门禁矩阵拦什么放什么)。

### 完整实战示例——一个 feature 的端到端旅程

场景:团队开发登录页(`feature/login-page`);`develop` 是集成分支,`main` 是归档分支。每一步 agent 做什么、插件判定什么、你看到什么:

| # | agent 执行 | 插件判定 | 你看到 |
|---|---|---|---|
| 1 | `git checkout -b feature/login-page`(从 develop 切) | ✅ 放行(feature 自由) | 分支已建 |
| 2 | `git add . && git commit -m "feat: login"` | ✅ 放行 | 已提交 |
| 3 | `git push -u origin feature/login-page` | ✅ 放行(推 feature 没问题) | 已推送 |
| 4 | `git checkout develop && git merge feature/login-page` | 🚫 **拦截**——集成分支只收 PR/MR | 必须对 develop 开 PR/MR |
| 5 | `gh pr create --base develop` | ✅ 放行(feature → 集成) | PR 已建,由你审查并合并 |
| 6 | `git push origin main` 或合入 main | 🚫 **拦截**——归档仅用户亲手 | 发布后由你亲自 develop → main 归档 |

注意agent**做不到**的事:把 feature 直接合进 `develop`,或碰 `main` 一下都不行。每个敏感合并都是你在 PR/MR 页面或自己终端里的有意识动作。

---

## 为什么需要它——解决的问题

AI 编码 agent 在你的仓库里工作。它通过系统提示词、项目智能体指令文件(`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`.cursorrules` 等各家命名)和项目文档被"告知"遵循合入流程:feature 分支开发 → 合入集成分支(以及你有的话各 preview/production 阶段)→ 生产/归档交给你。

**这是软规则。** Agent 会跳过、重排、干脆"忘记"它——不是因为恶意,而是因为软指令对模型来说本来就是可选的。

这个插件把软规则变成**硬机制**。agent 每次尝试的 git 操作都会对照*本地仓库的真实状态*检查;违规在命令执行前就被拦截,并给出原因和下一步。

没人需要记得规则——规则被强制执行。

---

## 适合谁——场景与团队

### 这些信号说明它适合你

- 你有(或想要)一个明确的分支流程——从单条 `develop` 式集成分支,一直到多级 preview/production 流水线。
- agent 已经抄过近路:直推受保护分支,或合到不该合的地方。发生过一次就会再发生——这个插件是结构性修正。
- 你想保护集成/归档分支,又不想全靠人肉 review 抓每个抄近路。
- 多个 feature 并行开发、汇入同一个预览环境,你想让每个进入更严阶段的动作都被把关。

### 具体场景举例

1. **独立开发者 + agent 做客户项目。** 你把任务丢给 agent,它"好心"直接推集成分支。一份小配置,agent 在机制上不接受 PR/MR 就无法碰受保护分支——哪怕你没盯着它。
2. **3–10 人小团队 + CI 部署的预览。** Staging 合入即自动部署;某天 agent 未审查就把 feature 合进 `develop`。此后进入任何受保护阶段都必须 PR/MR——一次有意识、有留痕的动作。
3. **多环境流水线的大团队。** 很多预览终点 + 受管制的生产 + 归档线——每个角色各配各的规则,守卫不需要额外逻辑就能放大到任意规模。
4. **异步协作。** 你不总在线。守卫在你的会话间隙保持流程正直;生产/归档合并仍然只属于你。

**不适合你**(另见[它不能做什么](#它不能做什么诚实的边界)):

- **主干直推流**——所有人都直接合到一条分支:插件会一直拦,别开。
- **没有定义流程的私人仓库**——没东西可守,没价值。
- **一个分支角色都不愿意给的项目**——插件至少要有一个 `integration` 分支来保护。

---

## 它能做什么

- **执行前拦截**:直推 / 强推 / 删除受保护角色分支(integration / preview / production / archive);agent 试图合入生产或归档。
- **角色驱动、完全可配**:`integration`(内置默认 `develop`)是核心角色;`preview` / `production` / `archive` 是可选数组(精确名或正则),每个角色独立 `update`(`pr` / `flexible`)与 `mergeBy`,自定义配置深度合并于默认之上。
- **在关键处保留人的操作权**:生产与归档合并始终在你手上——插件阻止 agent 点击合并,于是你的动作*就是*确认。
- **任何命名都行**:分支名全由配置映射,绝无硬编码(见[配置参考](#配置参考))。
- **全程审计**:每次拦截都追加到用户级状态目录(macOS/Linux `~/.local/state/gitflow-guard/`,Windows `%LOCALAPPDATA%\gitflow-guard`)下的审计日志——在仓库外、绝不进版本库、位于 agent 可写沙箱之外,且同一仓库的所有 worktree 共享一份日志。
- **平台无关核心**:纯本地 git;可选调用 `gh`(GitHub)或 `glab`(GitLab)做 PR/MR 目标解析,没有它们照样工作。

---

## 它不能做什么——诚实的边界

- **它不是安全边界。** 命令解析是尽力而为;铁了心要混淆命令的 agent 能绕过文本分析。
- **它不接管 CI。** CI 状态只作参考日志,从不作硬门槛。真正的分支保护应放到 GitHub/GitLab 设置里,可以叠加。
- **它不能替代流程本身。** 你的项目至少得有一个 `integration` 分支;如果所有人都往一条分支直推,这个插件会一直拦——那里别开。
- **生产/归档不自动化**——它们刻意留给你人工点击;插件只是对 agent 说"不行"。

---

## 与服务器端分支保护的对比

服务器端分支保护(GitHub branch rules、GitLab protected branches)和这个插件解决**不同的问题**,互补而非替代。

| 维度 | 服务器端保护 | 本插件 |
|---|---|---|
| 管什么 | *谁*能推/合并到受保护分支(权限) | *agent 怎么*进入流程(工作流)——这个合并落在哪个角色 |
| 防止 agent 合入生产/归档 | 不能——无法区分"是 agent 干的" | 能——生产/归档合并默认对 agent 禁用 |
| 按角色灵活 | 每个分支一条规则 | 一个配置文件里每角色 `update`(pr/flexible)+ `mergeBy`(user/anyone) |
| 范围 | 仓库所有用户,包括人 | 配置了插件的 DSH agent(人类不受限) |
| 执行点 | 服务端,推送/合并时 | 本地,命令执行前 |
| 平台 | 绑定托管服务 | 纯本地 git,平台无关(`gh`/`glab` 可选) |
| 谁能绕过 | 有管理员权限的人 | 在 DSH 之外干活的人,或铁了心的恶意 agent |

为什么重要: 分支保护回答"这次推送到底能不能发生";本插件回答"这个 agent 按配置能不能进这个角色"。最强的方案**两者都用**——插件让 agent 守流程,分支保护保证任何人(agent 或人)都不能直推受保护分支。

---

## 工作原理——三句话

1. agent 调用 shell 工具(`pwsh`/`bash`)执行一条 git 命令。
2. 插件分类该命令,从 `gitflow-guard.config.json` 解析分支角色,套用门禁矩阵。
3. 违规 → 工具调用在**运行前被拒绝**,附原因和下一步;放行 → 命令照常执行,每次拦截都写入用户级日志(`~/.local/state/gitflow-guard/repos/<repo>-<hash>/audit.jsonl`)。

没有聊天确认、也没有特许库:敏感合并(生产/归档)就是**仅用户**——agent 可以帮你准备 PR/MR,但点合并的始终是你。

### 设计原理——它为什么有效

#### 1. 配置是唯一事实来源

分支名和规则没有任何硬编码。`integration` 以内置默认(`develop`)提供;`preview` / `production` / `archive` 是可选数组(精确名或正则),每个都有自己的 `update` 与 `mergeBy` — 在默认之上深度合并。同一个二进制从单条 `develop` 一直可扩到企业多环境流水线。

#### 2. 拦截发生在执行前,不是执行后

插件挂在工具管线的 `tools/pre-execute`——命令分派*之前*的决策点。在那里 `deny`,命令**根本不会运行**,agent 只看到拒绝。事后检测(扫日志)无法作为强制手段——伤害早就造成了。

#### 3. 敏感合并在机制上只能由人

没有任何插件代码替生产/归档判断"这次合并行不行"。门禁只是拒绝让 *agent* 执行这些合并,于是唯一路径就是 PR/MR 页面里**你**点下合并——那个点击就是确认。不存在 agent 能伪造的令牌、特许或聊天消息绕过你。

---

## 配置参考

### 内置默认配置 + 深度合并覆盖

守卫**默认开启**——不需要 `gitflow-guard.config.json`。默认保护:

| 默认值 | 角色 | 规则 |
|---|---|---|
| `develop` | **integration** | 禁直推;只经 PR/MR 合入(`update: "pr"`) |
| `main` | **archive** | 禁直推 / 禁 agent 合并;归档合并留给你(`mergeBy: "user"`) |

当你创建 `gitflow-guard.config.json` 时,它的字段会**深度合并覆盖默认**:写到的字段/角色替换默认,没写的保持默认。只写你想改的:

```jsonc
{
  "branches": { "production": ["release-[\\w-]+"] }  // 默认的 develop+main 不变;新增 production
}
```

**完全关闭**(trunk / 单分支流程):`{ "enabled": false }`。误拦时改一个文件即可恢复;`gitflow-guard status` 始终说明当前生效的是内置默认还是自定义配置。

### 分支角色——插件校验的模型

**角色**把分支名(或正则)映射到规则集。`integration` 由内置默认提供;其余角色全部可选。

```text
feature 分支 ──(自由)──> integration(集成分支, PR/MR 合入)
                                 │
                                 ├──> preview(可选, 环境终点, 只走 PR/MR)
                                 │
                                 └──> production(可选, PR/MR + 只有你能点合并)
archive(可选, 发布后你亲手归档)
```

| 角色 | 配置键 | 必填? | 强制行为 |
|---|---|---|---|
| **feature** | `featurePattern` | — | 自由: commit / push / 同步 / rebase |
| **integration** | `branches.integration` | 默认(`develop`) | 禁直推(默认 `pr`);feature 只经 PR/MR 合入 |
| **preview** | `branches.preview`(数组) | 可选 | 禁直推;只走 PR/MR(环境终点) |
| **production** | `branches.production`(数组) | 可选 | 只走 PR/MR;合并仅限你(`mergeBy: "user"`) |
| **archive** | `branches.archive`(数组) | 默认(`main`) | 允许 agent 创建指向它的 PR/MR; 合并仍限用户亲手 |

### 自定义分支名与规则——任何命名都可以

**小团队(个人 / 2-3 人)—— 最简,只有 integration:**

```jsonc
{
  "enabled": true,
  "featurePattern": "feature/[\\w-]+",
  "branches": { "integration": ["develop"] }
}
```

**大团队(多预览环境 + 生产 + 归档):**

```jsonc
{
  "enabled": true,
  "featurePattern": "(topic|feature)/[\\w-]+",
  "branches": {
    "integration": ["develop", "topic/[\\w-]+"],
    "preview": {
      "branches": ["ita1", "itb1", "itb2", "sg", "vb", "r1-conf", "r1-ope", "r2-conf", "r2-ope"],
      "update": "pr"
    },
    "production": {
      "branches": ["prd-conf", "prd-ope"],
      "update": "pr",
      "mergeBy": "user"
    },
    "archive": ["main"]
  }
}
```

### 完整字段参考

```jsonc
{
  "enabled": true,                     // 默认 true — 写 false 即关闭守卫
  "featurePattern": "feature/[\\w-]+", // 识别工作/feature 分支的 JS 正则
  "branches": {
    "integration": { "branches": ["develop"], "update": "pr" },  // 默认 ["develop"] — 省略即保持默认
    "preview":     { "branches": ["ita1"], "update": "pr" },     // 可选
    "production":  { "branches": ["prd"], "update": "pr", "mergeBy": "user" }, // 可选
    "archive":     ["main"]                                      // 可选
  },
  "locale": "en",                      // 可选: 文案语言——任意已注册 locale('en'/'zh' 内置); 未注册值在 status 告警并回退英文
  "strict": false,                     // 可选: fail-closed —— 配置异常/内部错误改为拦截, 而非告警放行
  "ci": { "enabled": true }            // 可选: gh pr checks 作参考日志
}
```

- 每个角色既可用**数组**(简写),也可用**对象** `{ branches, update?, mergeBy? }`。
- `update`:`pr`(默认)= 只能 PR/MR 合入;`flexible` = 允许直推/本地合入(小团队)。
- `mergeBy`(生产):`user`(默认)= 只能你点合并;`anyone` = 放行 PR 合并。
- 每条分支条目是精确名或正则(自动识别)。**正则安全**:分支正则由项目作者提供并按原样编译——`featurePattern` 与分支条目请避免灾难性回溯写法(如 `(\w+)+` 这类嵌套量词)。
- **文案语言**:默认英文;加 `"locale": "zh"` 切中文,或给任意 `gitflow-guard` 子命令传 `--locale <en|zh>`(优先级:CLI 旗标 > 项目配置 > 英文)。全部用户可见文案都跟随 locale——包括 `--help`、未知子命令提示、审计为空的提示等 CLI 框架文案。
- **自定义语言**:下游包可在运行时追加语言——`import { registerLocale } from 'agents-gitflow-guard'`,调用 `registerLocale('fr', frDict)` 注册一份与内置英文键完全一致的字典(注册时校验),再在项目配置写 `"locale": "fr"` 即生效。

  ```js
  import { registerLocale, MESSAGE_KEYS } from 'agents-gitflow-guard'
  // MESSAGE_KEYS 列出字典必须覆盖的全部键(与内置英文同一键集);缺键/多键注册即抛错。
  const fr = { /* 每个 MESSAGE_KEYS 一条, 如 */ 'deny.header': ({ why }) => `[gitflow-guard] bloqué : ${why}` }
  registerLocale('fr', fr)
  ```
- **未注册语言**:拦截路径对未注册的 `"locale"` 静默回退英文(设计如此——hook 不因文案缺失卡死),笔误因此容易被忽略;一行告警在 `gitflow-guard status` 中可见。
- **校验**:角色条目重叠会被拒;非法正则会报错。**任何配置错误都会让该项目的守卫回退为"未启用"并上报**(而不是用半吊子配置)。注意:你覆盖的角色若与默认角色同名(如把 `main` 映射为 integration 而默认 archive 仍是 `main`)会触发重叠报错——需一并覆盖或去掉另一角色。
- **strict 模式**:默认配置损坏时 stderr 告警一次后放行(fail-open,避免一个笔误卡死工具管道);`"strict": true` 把配置异常与内部错误翻转为**拦截**(fail-closed)——供高风险仓库选用。显式 `enabled: false` 保持静默;而*文件不存在*不再是"未启用"——内置默认(develop+main)直接生效。

---

## 门禁矩阵——拦什么、放什么

| agent 动作 | 判定 |
|---|---|
| commit / 推 feature / 同步 / rebase / 只读命令 | ✅ 放行 |
| 直推 / 强推 / 删除 integration / preview / production / archive | 🚫 拦(integration/preview 配 `flexible` 时直推放行) |
| PR/MR: feature → integration / preview | ✅ 放行 |
| PR/MR: feature → production | ✅ 可创建;**合并被拦**(你在 UI 合并) |
| 指向 archive 的 PR/MR | ✅ 可创建;🚫 合并被拦(你在 UI 合并) |
| 在 integration / preview 上 `git merge feature/x`(本地) | 🚫 拦(须 PR/MR);`update: flexible` 则放行 |
| 串联命令(`checkout develop && merge feature/x`) | 🚫 拦——逐段模拟分支切换,无法绕序 |
| 强制重建受保护分支(`git checkout -B/-C <分支>` / `git switch -C`) | 🚫 拦(直改 ref-update 门禁) |
| 用 `git symbolic-ref` 重定向/删除受保护分支 | 🚫 拦(直改 ref-update 门禁) |
| 在 integration / preview / production / archive 上 `git cherry-pick` / `git revert` | 🚫 拦(受保护分支上改写历史);`-n`/`--no-commit` 与 `--abort`/`--continue`/`--skip`/`--quit` 放行 |
| `sudo` 包装的 git 命令(特权外壳) | 🚫 剥壳(含 `sudo -u …`)后按内层命令判定 |

> 两处**刻意不拦**的边界,防止后来者「顺手堵上」造成语义回归:`git tag -f` 移动 tag(即使指向受保护分支)维持豁免——tag 不在分支角色守卫范围,与 `push --tags` 同型;受保护分支上的普通 `git commit` 维持放行——守卫只管分支角色与合入路径、不管内容,后续 `git push` 仍被拦(远端零污染)。

PR/MR 目标通过 `gh pr view`(GitHub)或 `glab mr view`(GitLab)解析;没有平台 CLI 时插件走保守路径。

---

## 人保持控制权的地方

- **生产合并与归档**默认仅用户:agent 可以帮你准备 PR/MR,但**合并按钮由你点**——那个点击*就是*确认。没有独立特许库能把这决定外包出去。
- 每次拦截都追加到用户级审计日志供查阅(`gitflow-guard audit`)。

---
## 安装详解

**前置**:`PATH` 上有 **Node.js ≥ 22**(与包 `engines` 及 CI 矩阵最低档一致)。所有客户端都使用**同一个 npm 包** `agents-gitflow-guard`——只有挂载与接线方式不同。

| 客户端类型 / 平台 | 安装命令 | 挂载与接线步骤 |
|---|---|---|
| Claude Code · Codex · OpenCode · Antigravity | `npm i -g agents-gitflow-guard` | `gitflow-guard wire --client <名> --project --yes` |
| DeepSeek Harness (DSH) | `dsh plugin --profile web add agents-gitflow-guard` | 重启 DSH —— 插件自动挂为 profile 层 |
| Pi | `npm i -D agents-gitflow-guard` | 把 `pi/gitflow-guard.ts` 拷进 `.pi/extensions/` |

### 1. CLI Hook 客户端 (Claude Code · Codex · OpenCode · Antigravity)

全局安装一次 CLI，然后**每客户端执行一条命令完成接线**（守卫凭内置默认配置已默认开启，接线是唯一剩下的事）：

```bash
npm i -g agents-gitflow-guard   # 提供 `gitflow-guard` 二进制
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

`wire` 读取已有配置文件(如有)并把 hook 条目合入——不碰其他内容、幂等(已接则跳过)、支持 `--dry-run` 预览与 `--unwire` 移除、写 `--global` 前必先询问。它写入的准确文件(供参考,也可代替 `wire` 手写)是:

```jsonc
// Claude Code — .claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "gitflow-guard check --platform claude" }] }
    ]
  }
}
```

```jsonc
// Codex — .codex/hooks.json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "^Bash$", "hooks": [{ "type": "command", "command": "gitflow-guard check --platform codex" }] }
    ]
  }
}
```

```ts
// OpenCode — `.opencode/plugins/gitflow-guard.ts`(随包 `opencode/gitflow-guard.ts` 的副本;
// OpenCode 1.18+ 已移除 hooks.yaml,扩展点改为 plugins —— `tool.execute.before` 事件,
// 拒绝语义 = 抛错; `wire --client opencode` 自动复制该文件)
```
`gitflow-guard wire --client opencode` 会从包内写入此文件;非必要不建议手写。

```json
// Antigravity (Google) — .agents/hooks.json
// (agy hook 进程 cwd = hook 配置文件所在目录,相对 bin/… 会解析失败; `wire` 项目级写绝对路径、
// 全局写 PATH 上的 gitflow-guard。此处展示全局安装形态。)
{
  "gitflow-guard": {
    "PreToolUse": [
      { "matcher": "run_command", "hooks": [ { "type": "command", "command": "gitflow-guard check --platform antigravity" } ] }
    ]
  }
}
```

### 2. 进程内插件与扩展 (DSH · Pi)

- **DeepSeek Harness (DSH)**：
  ```bash
  dsh plugin --profile web add agents-gitflow-guard
  ```
  安装后重启 DSH。包自带 `dsh.bundle.patch` 声明，`dsh plugin add` 自动把它挂为 profile 层，无需手工编辑 profile。升级使用相同命令并重启。

- **Pi**：
  Pi 以进程内扩展装载(没有 stdin payload,也没有子进程 hook)。把随包发布的入口装进项目、包留在 devDependencies:
  ```bash
  npm i -D agents-gitflow-guard
  mkdir -p .pi/extensions
  cp node_modules/agents-gitflow-guard/pi/gitflow-guard.ts .pi/extensions/gitflow-guard.ts
  ```
  并在 `.pi/settings.json` 中配置：
  ```jsonc
  // Pi — .pi/settings.json(extensions 路径相对 .pi 解析)
  { "extensions": ["extensions/gitflow-guard.ts"] }
  ```

### 3. 从源码安装与本地开发 (From Source)

给贡献者，或想在本地直接运行最新源码 checkout：

```bash
# 克隆仓库并构建
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build
```

根据你使用的 agent 客户端挂载本地开发版本：

```bash
# A. CLI Hook 客户端 (Claude Code · Codex · OpenCode · Antigravity)
npm link # 或 npm install -g .
gitflow-guard wire --client <claude|codex|opencode|antigravity> --project --yes

# B. DeepSeek Harness (DSH)
dsh plugin --profile web add file:/path/to/AgentsGitFlowController
# 或使用脚本: node scripts/install-dsh.mjs web (装完重启 DSH)

# C. Pi
npm link
# 或直接将仓库内的 pi/gitflow-guard.ts 复制到目标工程的 .pi/extensions/
```

### 4. GitHub Copilot 说明

**GitHub Copilot —— 故意不提供 hook**。Copilot 自带这套守卫的原生能力: 工具级 **allow/deny/ask** 权限 + 项目 **rules**(`rules.json` + `AGENTS.md`)。对 Copilot 用户,直接引官方文档即可,不需要我们的插件:

- [允许和拒绝工具使用(GitHub Docs)](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools)
- [为 Copilot coding agent 添加自定义规则(GitHub Docs)](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-rules-for-the-copilot-coding-agent)
- 可选: Copilot 也有官方 [hooks 系统](https://docs.github.com/en/copilot/reference/hooks-reference)(`preToolUse` → `permissionDecision:"deny"`),想要命令级拦截可以自己接。

- hook 读 stdin payload,按**各平台协议**作答:Claude Code / OpenCode → `exit 2`(stderr 展示原因 + "下一步"提示);Codex → stdout 输出 JSON `{"hookSpecificOutput":{"permissionDecision":"deny",...}}`;Antigravity → stdout 输出 `{"decision":"deny","reason":...}` 且 **exit 0**(Antigravity 要求 exit 0,拒绝 hookSpecificOutput/非 allow 值)。Pi 没有 stdin 协议:进程内扩展监听官方 `tool_call` 事件,经返回值 `{ block: true, reason }` 拒绝(守卫 CLI 子进程只承载内部 exit-2 契约)。
- 只需要**执行前事件**:守卫在命令执行*之前*拦截;没有特许可事后消费,因此无需执行后钩子。
- 上面示例调的是全局安装的 `gitflow-guard`(`npm i -g`)。若 hook 子进程在它的 `PATH` 里找不到,就指向 `npm bin -g` 给出的完整二进制路径——hook 子进程不一定继承你交互 shell 的 PATH。本仓库自带配置里的 `bin/gitflow-guard.mjs` 路径只对 checkout 贡献者有效。
- **默认开启**:内置默认配置(integration=`develop`, archive=`main`)无需任何文件即生效。trunk / 单分支仓库:建 `gitflow-guard.config.json` 写 `{ "enabled": false }`,或自行映射分支。自定义配置在默认之上**深度合并**——只写你想改的字段。
- `wire` 从不删除或重写你已有的 hook 条目——只添加自己的命令(去重);`--unwire` 精确移除同一条命令。

---

## 常见疑问(FAQ)

### 我的分支不叫默认名字,能用吗?

能用——分支名没有任何写死。`integration` 由内置默认提供(`develop`),自定义配置在默认之上深度合并;它的条目(以及 `preview`/`production`/`archive` 的)可以是任意精确分支名或正则。`featurePattern` 告诉插件怎么认你的工作分支。

把集成分支叫 `master`、加一个 `beta` 预览、feature 前缀用 `fix/`——写进配置即可;拦截、报告、审计都跟着你的命名走。没有任何你必须遵守的约定,只有你声明的映射。见[自定义分支名与规则](#自定义分支名与规则任何命名都可以)。

---

### 我非得配 preview/production/archive 吗?

不用。只配你流程里真实有的角色。只建 `develop` 的单人仓库配 `integration: ["develop"]` 就完事;有十个环境的企业再补 `preview` 数组和 `production` 角色。其余保持关闭。

---

### 它是安全工具吗?

不是,请注意别把它当安全工具。它是工作流守卫:把既定流程变成可机制执行的东西。基于文本的命令识别天然是尽力而为——铁心混淆命令的 agent 可以绕过解析器。

在其支持的命令形态内,角色边界在本地强制生效:合入受保护角色分支(integration / preview / production / archive)必须走配置好的路径(PR/MR,或生产/归档的人工合并)。常见混淆包装已纳入分类与拦截——shell 包装(`sh -c` / `bash -lc`)、子 shell 与反引号/`$()` 内嵌、`env`/`command`/`nohup`/`xargs`/`sudo` 前缀与 `VAR=x` 赋值、绝对路径、管道与 `||` 后半段、git 全局选项(`-C .`、`--git-dir=…`)、通配 refspec(`refs/heads/*:refs/heads/*`)、当 fetch+merge 用的 `git pull`,以及 `send-pack`/`update-ref`/`symbolic-ref` 等 plumbing;强制重建受保护分支(`checkout -B`/`switch -C`)与受保护分支上的 cherry-pick/revert 由 ref-update / ref-move 门禁拦截。可执行对抗语料见 `tests/accuracy-audit.spec.ts`。

已知**本地不可防**的通道:直连 forge API(`gh api repos/…/pulls/N/merge`、`curl`)与解释器子进程内嵌(`node -e "child_process.exec('git push …')"`);任意深度的引号/编码变换天然只能尽力而为。真正不可绕过的边界在你托管服务的分支保护设置。两边都用——把本守卫当作即时反馈与审计留痕,而不是安全边界。

---

### 为什么 agent 不能自己合并进生产/归档?

因为门禁把那些动作判定为**仅用户**。插件对生产的*合并*、归档的*合并*一律拦截——*建 PR/MR 允许*,agent 仍可替你起草 develop→main 归档 PR。但合并本身只有一条路径:**你**亲手点合并——不存在 agent 能用来给自己授权的特许、令牌或聊天消息。

---

### 必须装 `gh` 或 `glab` CLI 吗?

不用。它们只是可选适配器,用来解析 `pr merge` / `mr merge` 到底指向哪个分支,好让门禁区分"合入 integration/preview"(放行)与"合入 production/archive"(拦截)。当两个 CLI 都无法确认目标——未安装、未认证、离线或查询失败——门禁**一律拒绝合并**,即使在 feature 分支上执行也照拦:该 PR 可能实际指向生产/归档分支。等 CLI 可用后重试,或由用户亲手点合并。其余一切照常。核心校验不碰任何托管服务,所以它在 GitHub、GitLab、自托管或离线环境里行为一致。

---

### 会误拦我的正常工作吗?

刻意不会。feature 分支该干的事——提交、推送、从集成同步、rebase、只读命令、`gitflow-guard status`——全部无阻碍放行。

拦截只留给:(1) 直接写受保护角色分支,(2) agent 试图合入生产或归档。若你看到一笔错误拦截,先跑 `gitflow-guard status`——它显示每个本地分支被归为哪个角色,误判一眼可见、可纠正。

---

### 配置写错了会怎样?

半吊子配置绝不会意外生效:任何校验错误都会让该项目的守卫禁用并上报错误。

常见错误:覆盖的角色与默认角色同名(如把 `main` 设为 integration 而默认 archive 仍是 `main`——显式重叠报错,需一并覆盖或去掉另一角色)、同一个分支被配到两个角色里(显式拒绝)、`featurePattern` 写不成合法正则(报错)。失败提示很明确,文件又是一个 JSON 对象,通常三十秒改好。

---

### 插件到底查了本地仓库的什么?

当前分支(`git branch --show-current`),以及——只在 `pr merge` / `mr merge` 时——通过 `gh pr view` / `glab mr view` 查 PR/MR 目标。不需要任何祖先关系判断,因为模型是**角色驱动**(目标是哪个分支),而不是顺序驱动。

核心校验不写任何东西、不碰远端、不需要托管服务功能。生产/归档合并直接对 agent 拒绝;人工合并发生在你的 UI 里。

---

### 许可证 / 收费?

MIT,免费,无条件。随便用、随便改、随便发,唯一义务是保留版权声明。

如果它帮你挡掉了一次抄近路,页顶的咖啡按钮欢迎但绝不要求。见[许可证](#许可证)。

---
## 术语表

| 术语 | 含义 |
|---|---|
| **integration** | 集成分支,核心角色(内置默认 `develop`);feature 经 PR/MR 合入;受保护 |
| **preview** | 可选环境终点分支(`branches.preview`,数组);只走 PR/MR 更新 |
| **production** | 可选生产分支(`branches.production`,数组);PR/MR + 合并仅限用户 |
| **archive** | 可选的发布后归档分支(`branches.archive`,数组);允许 agent 创建指向它的 PR/MR,合并仍限用户亲手 |
| **feature 分支** | 你的工作分支,由 `featurePattern` 识别;自由区 |
| **门禁矩阵** | 把每条被分类的命令映射为放行/拦截的判定表 |
| **pre-execute** | 工具管线中拦截发生的钩子——在命令运行之前 |
| **合并仅限用户** | 生产/归档合并留在你手上——你在 PR/MR 上的点击就是确认 |

---

## 路线图

未来规划与正在探索的方向:

- **更多 Agent 平台接入**: 调研并适配新兴 Coding Agent 工具(如 Cursor、Windsurf、新一代 CLI Agent)。
- **审计汇总与导出**: 跨机器审计日志同步及团队级安全合规导出格式。
- **场景化流程预设**: 针对常见 Git 分支模式(Trunk-based 单主干模式、多环境企业级 GitFlow)的现成配置预设。
- **CI 门禁与 PR 校验**: 探索原生 CI 管道集成与 PR 检查联动机制, 同时保持本地执行零依赖。

已发布功能与历史版本记录详见 [CHANGELOG.md](CHANGELOG.md)。

欢迎贡献——见[开发](#开发)。

---

## 赞助支持

插件免费开源(MIT)。如果它帮你和团队挡掉了一次抄近路,一杯咖啡感谢:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/keanz21)

---

## 开发

```bash
npm install
npm test          # 单测: classify / gate / config / cli / repo / platform / i18n / index / accuracy-audit / pi
npm run typecheck     # tsc --noEmit, 0 Error
npm run build         # tsdown → lib/(CLI 与插件共用)
npm run check:pins    # 校验 package.json 版本与 CHANGELOG 标题及版本示例一致
npm run verify:matrix # 连续复测矩阵: DSH 逻辑 + zh 文案回归 + Claude Code / Codex / OpenCode / Antigravity hook 编码 + Pi 扩展
```

**铁律**:任何逻辑改动必须 0 Error 构建 + 单测全绿 + 连续复测矩阵(`verify:matrix`)全绿后才算完成。

**接入新的 agent 客户端**(如 Cursor / Windsurf):以下各项必须在同一个 commit 内完成——`src/platform.ts`(含测试与 `HookPlatform` 联合类型)、`.claude/settings.json` / `.codex/hooks.json` 旁新增一份仓库级 hook 配置、`.agents/hooks/references/<tool>.md`、`scripts/verify-matrix.mjs`、README 双语 hook 段与开头宣传语、`package.json` 的 description/keywords,以及 `CHANGELOG`。`npm run verify:matrix` 全绿才算完成。(同一清单见 [AGENTS.md](AGENTS.md) §8;DSH 与 Pi 为进程内接入,见该节例外说明。)

---

## 许可证

[MIT](LICENSE) © FeatureAgents
