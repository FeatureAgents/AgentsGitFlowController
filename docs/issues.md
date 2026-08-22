# 待整改问题清单

> 状态: **第二轮整改完成**(2026-08-22 README 贴合度审查 + 首轮整改残留项; 9/9 项已落实并通过验收:
> typecheck 0 错、175 测试全绿、verify:matrix 27 PASS、双语对称更新、版本已 bump 至 0.0.12 待合并发布)
> 第一轮 12 项(i18n 标准)已于分支 `feature/i18n-standard-remediation` 全部完成并验收
> (typecheck 0 错、174 测试全绿、verify:matrix 27 PASS、双语对称更新), 明细见该分支 `docs/issues.md` 历史版本与 CHANGELOG 0.0.12 条目, 此处不再保留。
> 约定: 每项含 **问题 / 位置 / 依据 / 整改方案 / 验收标准**; 完成后勾选并附 commit。

---

## P0 —— 合并 `feature/i18n-standard-remediation` 前必须处理

### P0-1 zh 版开发段缺 verify:matrix —— 双语失衡且违反自家铁律

- **问题**: en 版 Development 段含 `npm run verify:matrix` 命令行, 且铁律写明 "all green tests + **a green verify:matrix**"; zh 版开发段没有这行命令, 铁律只写"单测全绿后才算完成"。zh 用户照 zh README 行事会漏掉强制回归环节, 与 AGENTS.md §2「测试/矩阵全绿」矛盾。
- **位置**: `README.zh.md`「## 开发」段(命令块与铁律行); 对照 `README.md` Development 段。
- **依据**: 双语文档对等原则; AGENTS.md §2 铁律。
- **整改方案**: zh 开发段命令块补 `npm run verify:matrix`(注释与 en 对齐); 铁律补"连续复测矩阵全绿"。
- **验收**: zh/en 两版开发段命令与铁律逐句对应。
- **状态**: ✅ 已完成(commit 6de85fc)——zh 开发段补 `npm run verify:matrix`(注释六节口径与 en 对齐), 铁律补「连续复测矩阵全绿」。

### P0-2 en 版 verify:matrix 描述过时(缺 zh locale 与 OpenCode)

- **问题**: 描述写 "DSH logic + Claude Code / Codex / antigravity hook wiring"; 实际脚本自 0.0.4/0.0.5 起覆盖 A-F 六节——含 `[D] zh locale` 回归与 `[F] OpenCode hook`, 描述漏了两者。
- **位置**: `README.md` Development 段 verify:matrix 行(约 :486)。
- **依据**: `scripts/verify-matrix.mjs` 实际节区(A 逻辑/B claude/C codex/D zh/E antigravity/F opencode)。
- **整改方案**: 改为 "DSH logic + zh-locale regression + Claude Code / Codex / OpenCode / Antigravity hook wiring"。
- **验收**: 描述与脚本六节一一对应; zh 版如有对应行同步。
- **状态**: ✅ 已完成(commit 6de85fc)——en 改为 "DSH logic + zh-locale regression + Claude Code / Codex / OpenCode / Antigravity hook wiring"; zh 新增行同口径。

### P0-3 FAQ「配置写错」段落误用 fail-closed 术语(双语)

- **问题**: `README.md`: "The plugin prefers failing closed: any validation error disables the guard..."; `README.zh.md`: "插件偏好 fail-closed:任何校验错误都会让该项目的守卫禁用"。实际默认行为是 **fail-open**(stderr 告警一次后放行), strict 才是 fail-closed——同页 Strict mode 小节(:271/:268)正是如此定义的, 该句与同页自相矛盾(0.0.11 引入 strict 概念后措辞未回溯)。
- **位置**: `README.md:424`、`README.zh.md:421`。
- **依据**: 同文档 Strict mode 定义; `src/cli.ts` check() 默认 warn-and-allow 行为。
- **整改方案**: 去掉 fail-closed 字眼, 表达本意即可: en 改为 "A half-guessed setup is never applied by accident: any validation error disables the guard and reports the errors."; zh 对应改为"半吊子配置绝不会意外生效:任何校验错误都会让守卫禁用并上报错误"。
- **验收**: 全文 grep `fail.closed|failing closed` 仅剩 Strict mode 小节的两处正确用法。
- **状态**: ✅ 已完成(commit 6de85fc)——en/zh 均改为「半吊子配置绝不会意外生效」句式; grep 复核仅剩 strict 字段注释与 strict 模式小节共两处正确用法/语言。

---

## P1 —— 随 0.0.12 发布一并处理

### P1-1 locale 字段注释停留在二元白名单时代; registerLocale 零文档

- **问题**: 字段示例注释写 `'en' default, or 'zh'`; P2-2 整改后 locale 接受任意字符串——未注册语言 status 打印 `config warning:` 并回退 en, 下游可经 `registerLocale(name, dict)` 运行时扩展。而 `registerLocale` 在全部文档中 0 次提及, 共享插件的下游作者不可见。
- **位置**: `README.md:259`、`README.zh.md:256`(字段注释); Language 段(`README.md:269-270`、`README.zh.md:266-267`)可顺带补一句扩展机制。
- **依据**: `src/i18n.ts` registerLocale 导出 API; `src/config.ts` mergeConfig locale 告警语义。
- **整改方案**: 字段注释改为 "message language; any registered locale ('en'/'zh' built-in); unknown values warn in status and fall back to English"; Development 或 Configuration Reference 补 registerLocale 三五行用法示例(注册 → 配置 `"locale": "<name>"` 生效)。
- **验收**: 双语字段注释更新一致; registerLocale 有可复制示例; 提及 warning 可见性(status 中查看)。
- **状态**: ✅ 已完成(commit e0b18bf + 6de85fc)——整改中发现 `registerLocale` 仅在内部 i18n 模块可见、包根(tsdown 单一入口 lib/index.mjs)导不出, 下游实际不可导入: 先在 `src/index.ts` 补再导出(含 `Dict` 类型)并加包根契约测试, 再更新双语字段注释与 Language 段「自定义语言/未注册语言」两条(含注册→配置生效示例与 status 告警可见性)。

### P1-2 锁版本示例停在 @0.0.9(双语各 2 处)

- **问题**: 快速开始与安装详解共 4 处示例 `agents-gitflow-guard@0.0.9`; 最新已是 0.0.11(0.0.12 待发)。"pin 一个 known-good 版本"却示范旧版本, 与其上方警告的 registry 缓存陈旧问题形成同款误导。
- **位置**: `README.md:45,304`; `README.zh.md:44,301`。
- **整改方案**: 发布 0.0.12 时统一替换为当前版本号; 建议后续在 release 流程 checklist 中加"README 示例版本号同步"一项防复发。
- **验收**: 4 处版本号 = package.json 当前版本; 双语对应行一致。
- **状态**: ✅ 已完成(commit 6de85fc)——双语 4 处统一为 `@0.0.12`(与本 PR 的版本 bump 一致)。

### P1-3 engines 声明与 CI 覆盖不一致(首轮残留)

- **问题**: `engines.node: ">=20"` 已声明, 但 CI 矩阵仍是 `node: [22, 24]`, 下限版本没有任何 CI 证据。
- **位置**: `.github/workflows/ci.yml`(matrix.node) vs `package.json` engines。
- **依据**: 首轮 issues.md P0-3 验收标准("下限版本跑通 npm test && verify:matrix")未闭环。
- **整改方案**(二选一): CI 矩阵加 `20`(成本: 一档矩阵; 注意 macos/windows × node20 是否值得), 或 engines 收敛为 `">=22"`(成本: 零; 需确认无用户在 20 上使用)。
- **验收**: 声明下限出现在 CI 矩阵中, 或声明值与矩阵最低档一致。
- **状态**: ✅ 已完成(commit fd60f06)——二选一取「engines 收敛」方案: `>=22`, 与矩阵最低档一致; Node 20 已于 2026-04 EOL, 无为 EOL 版本扩一档矩阵的理由。CHANGELOG 0.0.12 元数据条目同步修正。

### P1-4 版本号未随内容 bump(流程项)

- **问题**: CHANGELOG 已有完整 0.0.12 条目, package.json 仍是 0.0.11。
- **位置**: `package.json` version。
- **依据**: AGENTS.md §2「bump 叠加在待合并的内容 PR 分支上…版本提交与 tag 落在该分支」, 否则 release.yml 的 tag↔version 校验会失败。
- **整改方案**: 本内容 PR 合并前在该分支执行 `npm version patch`(产生 0.0.12 版本提交, 随 PR 进 develop)。
- **验收**: package.json = 0.0.12; 合并后推 tag v0.0.12 触发发布成功。
- **状态**: ✅ 已完成——`npm version patch` 已在本内容分支执行(0.0.11 → 0.0.12, 版本提交与 tag v0.0.12 落本分支); 合并进 develop 后推 tag 即触发 release.yml。

---

## P2 —— 可选改进

### P2-1 未注册 locale 的 warning 可见性无文档

- **问题**: hook 拦截路径对未注册 locale **静默**回退英文(warnings 只在 `gitflow-guard status` 打印, check 不刷屏是有意设计); 用户 typo 了 locale 在拦截场景毫无感知, 文档任何地方都没提这个信号在哪看。
- **位置**: README 双语 Language 段(与 P1-1 同处补一句即可)。
- **整改方案**: Language 段尾补一句: "An unregistered locale falls back to English silently during interception; the warning shows in `gitflow-guard status`." / 中文对应。
- **验收**: 双语各一句; 与 P1-1 同一 PR。
- **状态**: ✅ 已完成(commit 6de85fc)——双语 Language 段各补「未注册语言」一条(拦截静默回退 + `gitflow-guard status` 可见告警), 与 P1-1 同 PR 同提交。

### P2-2 sideEffects 字段仍未设置(首轮可选残留)

- **问题**: 首轮 P0-3 标注"可选"的 `"sideEffects": false` 至今未设置; 库形态下游打包时无法 tree-shake(影响小: 零依赖、体积小, 但共享包规范上宜补)。
- **位置**: `package.json`。
- **依据**: 共享包发布惯例。
- **整改方案**: 确认 DSH 加载不依赖 import 副作用后设置 `"sideEffects": false`; 若 apply() 注册时机有副作用语义则放弃并在本条记录原因。
- **验收**: 设置后 build/test/matrix 全绿; 或留档不做的原因。
- **状态**: ✅ 已完成(commit fd60f06)——已确认无 import 副作用依赖(`apply()` 由 DSH 显式调用注册; i18n 加载期键校验属不变式断言, 非行为依赖)后设置 `"sideEffects": false`; typecheck/test/matrix 全绿。

---

## 附: 首轮整改归档摘要(已完成, 详情见 git 历史)

首轮 12 项(P0×3/P1×3/P2×6, i18n 国际化标准)已在 `feature/i18n-standard-remediation` 分支完成:
53bef92(P0-1) · bda825b(P0-2/P2-2/P2-6) · ac66d87(P0-3 部分) · bd7da94(P1-1/P2-1/P2-3/P2-5) · e7f97eb(P1-2/P1-3) · 5788a97(P2-4)。
验收基线: typecheck 0 错、174 测试(+16)、verify:matrix 27 PASS/0 FAIL、src 无中文日志/异常泄漏(仅剩 4 处行尾注释)、双语 README 新增段对称。
