# agents-gitflow-guard 设计规格(现行)

> 状态: **唯一现行规格**, 描述 0.0.13 起的角色驱动实现(含本文 §10 的存储修订)。
> v0(permit/confirm 特许制)设计定稿已被 0.0.2 角色驱动模型整体取代, 原文仅存于 git 历史
> (`git show 0.0.12:docs/design.md`); 演进记录见 `CHANGELOG.md`。用户侧文档以双语 README 为准。
> 实机验证与测试证据: 见 `docs/e2e/TestResult/`。

---

## 1. 背景与问题

agent 在多分支流程(feature → 预览/集成分支 → 发布分支)中**反复抄近路**: 跳过预览直推基线、顺序颠倒、绕过 PR 直接本地合入、强推改写受保护分支。根因:`AGENTS.md` 是**软约束**——即使每次会话自动注入, 模型仍可选择性忽略。这是结构性问题, 必须用**机制级强制**(执行前拦截)兜底:

| 机制 | 强制力 | 局限 |
|---|---|---|
| AGENTS.md 注入 / Skills | 🟡 软 | 模型可忽略或漏加载 |
| 服务端分支保护(GitHub/GitLab 设置) | 🔴 硬 | 管推送面, 不管 agent 本地动作与平台操作时序 |
| **本插件(命令文本门禁)** | 🔴🔴 最贴近 | 文本解析 best-effort(§14 如实记载边界) |

## 2. 目标与非目标

### 2.1 目标(定稿)

1. **执行前硬拦截**: 命令运行前判定, deny 附「为什么拦 + 下一步做什么」引导。
2. **角色驱动、完全可配**: 分支名永不硬编码; 项目自选角色集合与命名。
3. **关键合并权在人**: 生产/归档合并默认仅用户(`mergeBy: user`)——**你点合并的动作就是确认**, 无需任何特许库。
4. **可解释 + 可审计**: 每次拦截留痕可回查。
5. **平台无关核心**: 只依赖本地 git 事实; gh/glab 仅作 PR/MR 目标解析的可选增强。

### 2.2 非目标(v1 明确不做)

- ❌ CI API 硬门禁(CI 状态仅记日志参考, 查不到自动跳过)。
- ❌ 多机状态同步(审计单机存储, v2)。
- ❌ 主动弹窗通知。
- ❌ 替代 AGENTS.md/Skill 软层(软层给完整指引, 本插件做最后硬兜底)。
- ❌ GitHub Copilot 接入(原生 allow/deny/ask 权限已覆盖; 见 AGENTS.md §8 例外)。

## 3. 架构总览

```
命令文本 ──▶ classify.ts(纯函数: 分段/解包/分类)
                │
                ▼
          gate.ts(纯函数: 门禁矩阵, 输入 GateFacts)
                ▲                          │
   repo.ts(git 只读查询)        deny → {why, next}(i18n 渲染)
                │
index.ts evaluateCommand(编排: 分类→事实→逐段判→审计)
     │                        │
DSH 进程内插件              stdin hook CLI
apply() 监听               gitflow-guard check --platform <name>
tools/pre-execute           exit/JSON 协议按平台编码(platform.ts)
返回 {kind:'deny',reason}
```

支撑层: `config.ts`(内置默认配置 + 深度合并覆盖 + 校验 + strict 位)、`i18n.ts`(en/zh + registerLocale 运行时扩展)、`cli.ts`(status / audit / check / wire / setup)、`wire.ts`(各客户端默认 hook 落位)、`types.ts`。

## 4. 分支角色模型

```jsonc
// gitflow-guard.config.json(项目根, 可选): 深度合并覆盖内置默认(默认保护 develop=integration / main=archive; 无文件也生效, enabled:false 关闭)
{
  "enabled": true,
  "featurePattern": "feature/[\w-]+",       // 自由开发分支识别
  "branches": {
    "integration": ["develop"],              // 核心角色(内置默认); 缺省沿用默认
    "preview":    ["release/.*"],            // 可选; 条目=精确名或正则
    "production": { "branches": ["main"], "update": "pr", "mergeBy": "user" },
    "archive":    ["archive/.*"]
  },
  "ci": { "enabled": true },                 // 可选适配器(仅日志)
  "locale": "en",                            // en|zh|registerLocale 扩展名
  "strict": false                            // true = 配置异常/内部错误改 fail-closed
}
```

- 角色条目支持数组简写或 `{branches, update?, mergeBy?}` 完整形。
- 默认值: integration/preview → `update:'pr', mergeBy:'anyone'`; production/archive → `update:'pr', mergeBy:'user'`。
- 角色判定优先级(先命中先得): production > preview > integration > archive > featurePattern > other。受保护角色 = 四个具名角色全体。
- 校验(失败即未启用): integration 必填非空; 角色间条目不得重叠; 正则非法在加载期报错(不静默失效)。

## 5. 门禁规则矩阵

| agent 操作(kind) | 判定 |
|---|---|
| push → 受保护分支 | integration/preview 配 `flexible` 可直推; 其余一律 deny(删除/强推同拦) |
| push `--all`/`--mirror`/通配 refspec | 一律 deny(会波及受保护分支) |
| local-merge 在 production/archive 上 | 一律 deny(合并权在人) |
| local-merge 在 integration/preview 上 | 来源是 feature/other: 按 update(pr=deny 引导走 PR / flexible=allow); 受保护分支间同步 allow; 无参同步上游 allow |
| pr-create 指向 archive | ✅ 允许创建(agent 可起草归档 PR); 合并仍被拦(0.0.9 起) |
| pr-create 指向 integration/preview/production | head 必须是 feature 角色, 否则 deny; 目标不明(--base 缺失)deny |
| pr-merge 目标 production | `mergeBy:user`(默认)→ deny:「你自己点合并」; `anyone` → allow |
| pr-merge 目标 archive | 一律 deny(仅用户亲手) |
| pr-merge 目标无法解析(gh/glab 失效) | **一律保守 deny**(0.0.11: 不能按 head 推断放行) |
| branch-delete 受保护分支(-d/-D/--delete) | deny |
| ref-update(update-ref / symbolic-ref 直改 refs、branch -m 改名、branch -f 复位、checkout -B/-C 强制重建) | 目标为受保护分支 → deny |
| ref-move(reset/rebase/amend/filter-branch/cherry-pick/revert 改写当前 tip) | 当前分支受保护 → deny(与 local-merge 同型); feature/other 自由; 恢复旗标(abort/continue/skip/quit)与 -n/--no-commit 形态豁免 |
| checkout/switch(含 -b/-c 新建) | 放行; evaluateCommand 用它模拟后续段的当前分支 |
| gitflow-guard status/audit | 放行(只读) |
| 其余(commit/push feature/只读等) | 放行 |

补充语义:

- 多段命令(&&/;/管道拆段)任一段 deny 即整体拦截; 单个非 flag 参数的 push(remote 还是 refspec 歧义)按双解释保守分类。
- deny 文案 = why(事实+规则)+ next(该做什么), 全部经 i18n 渲染。

**明确维持现状的两处(不扩面, 理由固化防回归)**:

- `git tag -f` 移动 tag(即使指向受保护分支): 维持豁免。与 `push --tags` 同型——tag 不在分支角色守卫语义内; tag 推送/移动由远端 tag 权限与 CI 校验兜底。
- 受保护分支上的普通 `git commit`(非 --amend): 维持放行。守卫只管分支角色与合入路径、不管内容; 拆条执行导致本地 tip 移动的真实风险由 push 守门兜底(远端受保护, 零污染), 拦截普通 commit 会误伤 hotfix/本地暂存提交等合法工作流。

**新增拦截面(0.0.19, Pi 真机空隙修复)的原理**: `checkout -B/-C`、`symbolic-ref` 与 `cherry-pick`/`revert` 都落在「改写受保护 ref(tip)」的既有语义内——前者直改既有 ref(送 ref-update), 后者改写当前分支 tip(送 ref-move), 只是此前解析面漏掉; `sudo` 与 `env` 同属执行前缀, 剥壳后递归分类即可覆盖。

## 6. 命令识别层(classify)

纯函数, 无 I/O, 对抗语料回归覆盖:

- **分段**: `&&` `||` `|` `;` 换行拆段, 引号内分隔符不算。
- **嵌套**: 反引号与 `$()` 内层文本递归送分类(单引号内不展开, 与 shell 语义一致); 子 shell 括号包裹剥离。
- **解包**: shell 解释器包装(`sh/bash/zsh/dash/ksh -c`, 含 `-lc` 合并短旗标)取脚本体重分类; 执行前缀 `env`/`command`/`nohup`/`xargs`/`sudo`(含 `-u <user>` 参数消费)与 `VAR=x` 赋值逐层剥离; 绝对路径命令取 basename。
- **git 形态**: 子命令前全局选项(`-C`/`-c k=v`/`--git-dir` 等)剥离后再判; `push` refspec 族(`+` 强推前缀、`src:`/`:dst` 删除、`refs/heads/` 前缀剥离、`--tags` 豁免、HEAD/裸推延迟到门禁按模拟分支解析); `pull` 取末个非 flag 为来源交本地合入门禁(fetch+merge 不再绕过); plumbing 收编(`send-pack` 按推送语义、`update-ref`/`symbolic-ref` 直改 refs 送 ref-update); `cherry-pick`/`revert` 送 ref-move(`-n`/`--no-commit` 与恢复旗标豁免); `checkout -B/-C`(含旗标簇)目标名送 ref-update + checkout 模拟切换两段。
- **gh/glab**: `gh pr create --base|-B`、`glab mr create --target-branch`、`gh pr merge <n>`、`glab mr merge <id>`; `-h/--help/--version` 不误判。
- **已知不可防**(如实边界, 见 README 局限节): forge API 直连、解释器子进程内嵌脚本——服务端分支保护是最终边界。

## 7. 配置系统与失效分级(fail-open 分级)

| 场景 | 行为 |
|---|---|
| 无配置文件 | **内置默认生效**(integration=develop, archive=main; 默认开启语义, 见 §2.1) |
| `"enabled": false` | 静默关闭(显式关闭路径) |
| JSON 损坏 / 字段校验失败 | stderr 一行告警(不再静默), 门禁放行; exit 仍 0 不破坏工具管道 |
| `"strict": true` | 上述异常改为 fail-closed(拦截), 高风险仓库选用 |
| JSON 整体损坏时的 strict 位 | 按原文正则保守提取, 最坏形态下 fail-closed 仍生效 |

locale: 内置 `en`/`zh`; `registerLocale(name, dict)` 运行时扩展(键一致性校验, `MESSAGE_KEYS` 从包根导出); 未注册 locale 告警不禁用, 回退英文。CLI 另有 `--locale` 旗标, 优先级: 旗标 > 项目配置 > en。

## 8. 平台适配

判别与协议细节以 `.agents/hooks/references/<tool>.md` 为准(官方文档核验):

| 平台 | 通道 | payload 关键字段 | deny 编码 |
|---|---|---|---|
| DSH | 进程内插件(patch.yml + dsh.bundle.patch) | ToolExecution.arguments.command | 返回值 {kind:'deny', reason}, 不经 stdin/exit 协议 |
| Claude Code | PreToolUse hook | tool_input.command + cwd | exit 2, stderr 即原因 |
| Codex | PreToolUse hook | 同 Claude 形 + turn_id(判别字段) | exit 0 + stdout hookSpecificOutput.permissionDecision:"deny" JSON |
| OpenCode | 插件(tool.execute.before, 1.18+ 无 hooks.yaml) | output.args.command | handler 抛错(经守卫 check exit 2 判定) |
| Antigravity | PreToolUse(run_command) | toolCall.args.CommandLine | exit 0 + stdout {"decision":"deny","reason":...}(无 block 值, 不可包 hookSpecificOutput) |
| Pi | 进程内扩展(tool_call 事件) | event.input.command | 返回值 {block:true, reason}, 不经 stdin/exit 协议 |

`check --platform auto` 按 payload 判别: `turn_id`→codex、`toolCall`→antigravity、`tool_args`→opencode、其余→claude。

## 9. CLI

```
gitflow-guard status                     # 角色分组列出本地分支 + 当前生效配置
gitflow-guard audit [--lines N]          # 回看审计流水(ISO 8601 UTC 时间戳)
gitflow-guard check --platform <p>       # 各家 hook 调用的门禁入口(stdin payload)
                 [--command <cmd>]       # 测试/调试直通
                 [--repo <path>] [--locale <l>]
```

快路径: 非 git/gh/glab/gitflow-guard 命令零查询直接放行; 内部错误 fail-open(strict 下除外)。hook 子进程未必继承 PATH, 各平台配置示例统一用绝对路径指向 `bin/gitflow-guard.mjs`。

## 10. 运行时数据存储(**本版修订**: 迁出仓库)

审计流水等运行时数据一律存**用户级全局目录**, 按「仓库名-真实路径哈希」隔离:

```
macOS/Linux: ~/.local/state/gitflow-guard/repos/<repo>-<sha256 前 12 位>/audit.jsonl
Windows:     %LOCALAPPDATA%\gitflow-guard\repos\<repo>-<hash>\audit.jsonl
覆盖入口:    GITFLOW_GUARD_STATE_ROOT(所有平台, 测试/特殊部署用)
```

**为什么不在仓库里(v0 曾放 repo 内 .git 目录)**: 凡 agent 可写之处的状态都可能被 agent 伪造——放在仓库内等于把「自我授权」后门留在门上。用户级目录位于各 Agent 平台的 workspace-write 文件沙箱之外（如 DSH、Claude Code 等）, agent 的文件工具与 shell 都写不进, 篡改必须触发用户审批, 「人是唯一例外权」由机制保证而非自觉。

附带收益: 重克隆、移动 .git、清理工作树均不丢审计历史; 键经 realpath 规范化(macOS /tmp 符号链接、Windows 8.3 短名)保持稳定。linked worktree 的 .git 为 gitdir 指针文件, 解析回主仓库根作键——同一仓库所有工作树共用一份审计(与 ≤0.0.13 存于共享 .git 的语义一致)。

限制: 单机假设不变(跨机同步 v2); 测试经 tests/setup.ts 把状态根重定向到系统临时目录, 不污染真实家目录。

## 11. 审计与可观测

- 条目: `{time, event: 'deny'|'ci', command?, role?, reason?}`; deny 记命令与原因, ci 记 PR 检查状态(可选适配器, 查不到跳过)。
- 写入失败静默吞错(fail-open), 不阻断门禁——审计是观测面, 不是第二道锁。
- 查看: `gitflow-guard audit`(时间戳 ISO 8601 UTC, 不随机器 locale 变化)。

## 12. 测试策略

- **单元/集成**(vitest, 无需特定 agent 宿主环境): classify(对抗语料)、gate、config(校验/strict)、i18n(键一致性)、repo、index(evaluateCommand 编排/降级路径)、cli(status/audit/check/--locale)、platform(四平台 stdin-hook extract/detect/encode)、stateDir(确定性/隔离性/XDG 重定向)。
- **accuracy-audit 语料**: §1.1 对抗样本(shell 包装、git 形态、组合旗标)固化为回归清单。
- **复测矩阵** `npm run verify:matrix` 七节 A–G: DSH 核心逻辑 / zh 全链路 / Claude Code / Codex / OpenCode / Antigravity / Pi 扩展——每平台断言「真实 payload 拦截 + 放行」的 wire 格式(exit 码/JSON 字段)。
- **铁律**: `npm run typecheck`(0 错)+ `npm test`(全绿)+ `npm run verify:matrix`(全绿)才算完成。CI 矩阵 ubuntu/macOS/Windows × Node 22/24。

## 13. 项目结构

```
├── src/
│   ├── index.ts        # 插件入口 apply() + evaluateCommand 编排 + stateDir/appendAudit
│   ├── classify.ts     # 命令识别(纯函数)
│   ├── gate.ts         # 门禁矩阵(纯函数)
│   ├── config.ts       # 配置加载/规范化/校验/strict
│   ├── repo.ts         # git 只读查询 + gh/glab Runner(可注入)
│   ├── platform.ts     # 六平台 hook 协议 (DSH / Claude Code / Codex / OpenCode / Antigravity / Pi)(extract/detect/encodeDeny)
│   ├── wire.ts         # 脚手架 wire/setup(各 agent 平台 hook 配置接入与更新)
│   ├── pi.ts           # Pi 扩展工厂(createPiExtension 进程内事件拦截)
│   ├── i18n.ts         # en/zh 字典 + registerLocale + MESSAGE_KEYS
│   ├── cli.ts          # status / audit / check / wire
│   └── types.ts
├── tests/              # vitest(setup.ts 重定向状态根) + accuracy-audit 语料
├── bin/gitflow-guard.mjs
├── pi/                 # 随包分发的 Pi 扩展入口 (pi/gitflow-guard.ts)
├── opencode/           # 随包分发的 OpenCode 插件入口 (opencode/gitflow-guard.ts)
├── scripts/
│   ├── verify-matrix.mjs      # 全平台真实 payload 拦截与放行矩阵校验
│   ├── check-version-pins.mjs # 依赖版本对齐校验
│   ├── extract-changelog.mjs  # CHANGELOG 发版内容提取
│   ├── install-dsh.mjs        # DSH 插件本地安装辅助
│   ├── test-git-matrix.sh     # 多版本 Git 兼容性测试
│   ├── test-git-realflow.sh   # 真实 GitFlow 全流程实机验证
│   └── test-pi-extension.sh   # Pi 扩展集成测试
├── patch.yml           # DSH profile 挂载声明
└── docs/design.md      # 本文
```

依赖: peer `@deepseek-ai/cordis ^4.0.1`、`@deepseek-ai/dsh-tools ^0.1.0-rc.5`(DSH 类型包显式列 devDependencies 保证类型面); 构建 tsdown → lib/, Node ≥ 22。

## 14. 已知限制(如实边界)

1. 文本解析 best-effort: 已实测穿透文本层的混淆形态与两条本地不可防通道(forge API 直连、解释器子进程内嵌)记录于 README 局限节; **服务端分支保护是最终边界**, 本插件叠加在其内侧的时序防线。
2. 分支正则由项目作者编写, 注意避免灾难性回溯(README 有提示); 非法正则在加载期报错。
3. 审计单机存储(§10), 多机协同需 v2 同步。
4. 插件改动需重新构建(`npm run build`)，DSH 需重启宿主进程；核心逻辑全部纯函数 + 配置驱动, 把「改代码」压到最少。

