# 待整改问题清单(国际化共享插件标准评审)

> 状态: **已完成整改**(2026-08-22 全工程评审产出; 同日整改完毕, 分支 `feature/i18n-standard-remediation`)
> 评审范围: src 全部 9 模块 / tests 9 套件 / CI·release 工作流 / 双语 README / AGENTS.md 规范。
> 评审基线: typecheck 通过、158 测试全绿、verify:matrix 通过(v0.0.11 后)。
> 整改后基线: typecheck 0 错、174 测试全绿(+16)、verify:matrix 27 PASS / 0 FAIL、`npm publish --dry-run` 元数据完整。
> 约定: 每项含 **问题 / 位置 / 依据 / 整改方案 / 验收标准**; 完成后勾选并附 commit。

---

## P0 —— 违反自家语言规范 / 包元数据缺口

### ✅ P0-1 插件降级日志为中文, 且未复用 i18n 文案键

- **问题**: DSH 插件 `apply()` 内部错误降级放行时, 日志输出中文 `门禁内部错误, 已放行`; 而 CLI 侧同场景走 `cli.checkInternalError` 文案键(英文)。同一故障两条产品线口径不一致, 且违反语言规范。
- **位置**: `src/index.ts:165`
- **依据**: AGENTS.md §1「日志/异常信息: 英文」; `src/i18n.ts` 头注释同口径。
- **整改方案**: 改为英文日志(如 `gitflow-guard: gate internal error, allowed through: <msg>`), 与 `cli.checkInternalError` 措辞对齐; 不随 locale 变(日志非用户文案)。
- **验收**: 全仓 `grep -P '[\x{4e00}-\x{9fff}]' src/` 中日志/异常语句仅剩注释命中; `tests/index.spec.ts` 补一条 apply 降级日志断言。
- **整改**: ✅ 53bef92 —— 日志改英文并与 CLI 措辞对齐; apply 降级路径测试(logger.warn 断言 + 放行不断管道); grep 验收通过(剩余中文仅为注释与 zh 文案字典)。

### ✅ P0-2 i18n 加载期校验异常信息为中文

- **问题**: en/zh 字典键一致性校验失败时 `throw new Error('i18n: en/zh 字典键不一致')`, 异常信息为中文。
- **位置**: `src/i18n.ts`(MESSAGE_KEYS 校验处)
- **依据**: 同 P0-1。
- **整改方案**: 改为英文, 如 `i18n: en/zh dictionary keys mismatch`。
- **验收**: 同 P0-1 的 grep 标准。
- **整改**: ✅ bda825b —— 异常改为 `i18n: locale "x" dictionary keys mismatch the built-in "en" dictionary`; i18n.spec 补注册键不一致的英文异常断言。

### ✅ P0-3 package.json 元数据缺口

- **问题**: 缺 `bugs` / `homepage` / `engines`; Node 版本下限未声明(CI 只测 22/24, 实际 API 兼容下限未定义)。
- **位置**: `package.json`
- **依据**: npm 共享包发布惯例; 国际用户报障入口缺失。
- **整改方案**:
  - `bugs` / `homepage` 指向 GitHub 仓库对应地址;
  - `engines.node` 按实测定下限(建议先 `>=20` 跑一遍测试矩阵确认, 再固化);
  - 可选: `"sideEffects": false`(利于下游 tree-shaking, 需确认 `apply()` 副作用语义不影响 DSH 加载)。
- **验收**: `npm publish --dry-run` 元数据完整; 下限版本跑通 `npm test && npm run verify:matrix`。
- **整改**: ✅ ac66d87 —— 补齐三项元数据, `engines.node >=20`(与 tsdown 构建目标 node20 一致; 所用 API 面远低于该下限); dry-run 元数据完整。可选项 `sideEffects: false` 暂不采纳: i18n 存在加载期校验副作用, 且 DSH 经 cordis 运行时加载非打包器路径, 收益存疑风险实在——留档不做。

---

## P1 —— i18n 覆盖不全 / 文档一致性

### ✅ P1-1 CLI 框架文案硬编码英文, 与 status 输出 locale 行为不一致

- **问题**: `usage.text`(help)、`cli.unknownCommand`、`cli.cannotLocate`、`cli.auditEmpty` 全部 `makeT('en')`; 而 `status` 输出跟随配置 locale。zh 用户看到中文 status + 英文 help, 体验割裂。
- **位置**: `src/cli.ts`(main / status / audit 各处 `makeT('en')`)
- **依据**: 国际化一致性; i18n 层既已存在, 框架文本不应绕过。
- **整改方案**(二选一, 需先定稿):
  - A. help/unknownCommand/cannotLocate/auditEmpty 改为读目标仓库 config 的 locale(无 config 时回退 en);
  - B. 保持英文但在 README「Configuration Reference」明确声明"CLI 框架文本固定英文, 仅拦截与 status 文案随 locale"。
- **验收**: A 方案下 `gitflow-guard --help` 在 zh 仓库输出中文; 或 B 方案下 README 双语均有该声明。
- **整改**: ✅ bd7da94 —— **定稿选 A**(真实消除割裂; `--help`/unknownCommand 经 resolveFrameworkLocale 读目标仓库 config, 无仓库回退 en; cannotLocate/auditEmpty 随旗标或 config)。cli.spec 补 zh 仓库 help/未知子命令中文断言。README 双语同步声明 locale 行为(5788a97)。

### ✅ P1-2 CHANGELOG 仅中文

- **问题**: npm 与 GitHub Release 是国际用户第一触点, changelog 条目全中文。
- **位置**: `CHANGELOG.md`
- **依据**: README 已双语, 发布面文档应同标准。
- **整改方案**: 自下一版本起条目改为英文(或中英双语); 历史条目可保留中文不追溯。
- **验收**: 新版本条目为英文/双语; release.yml 产出的 GitHub Release notes 可读性对国际用户成立。
- **整改**: ✅ (随本 PR) —— 新增 0.0.12 节, 条目全部中英双语; 头部注明自该版本起双语、历史不追溯。

### ✅ P1-3 仓库卫生

- **问题**: `docs/整改.md` 曾未跟踪(现已删, 由本文件接替); `CHANGELOG.md` 有未提交修改; 根目录残留 `.pr-body-dates.md`。
- **位置**: 仓库根目录
- **依据**: AGENTS.md 工作流约定(内容随 PR 一次带进 develop)。
- **整改方案**: `.pr-body-dates.md` 移入临时目录或删除; CHANGELOG 修改随本清单整改 PR 一并提交。
- **验收**: `git status` 干净(除进行中的 feature 分支正常改动)。
- **整改**: ✅ —— `.pr-body-dates.md` 已不存在; CHANGELOG 历史修改已在 feature/changelog-release-dates 提交并合入 develop; 本文件随整改 PR 提交, 状态干净。

---

## P2 —— 前瞻改进

### ✅ P2-1 locale 解析来源单一, CLI 无 `--locale` 旗标

- **问题**: locale 仅来自 `gitflow-guard.config.json`; hook 调用方无法强制语言, 无环境变量兜底。
- **位置**: `src/i18n.ts`(resolveLocale) / `src/cli.ts`(check)
- **整改方案**: `gitflow-guard check/status` 增加 `--locale <en|zh>`(优先级: CLI 旗标 > 项目 config > en); 保持 `resolveLocale` 白名单语义不变。
- **验收**: `--locale zh` 在 en 仓库也能输出中文拦截文案; 补 CLI 测试。
- **整改**: ✅ 53bef92 + bd7da94 —— status/audit/check(含 help/unknownCommand)全量支持 `--locale`; check 将旗标解析结果传入门禁(evaluateCommand), 拦截正文与封装同语言; cli.spec 覆盖 en 仓库 `--locale zh` 中文拦截与非白名单回退 en。

### ✅ P2-2 语言目录封闭, 下游无法扩展

- **问题**: 新增语言需改 3 处(`Locale` 类型联合 + en 表 + zh 表), 下游不能注册新语言或覆盖文案。
- **位置**: `src/i18n.ts`
- **整改方案**: 导出 `registerLocale(name, dict)`(运行时注册, 键一致性校验复用现有逻辑); `Locale` 类型放宽为 `string` + 保留 `'en' | 'zh'` 提示; config 校验同步放开(未知 locale 告警不报错, 回退 en)。
- **验收**: 测试内注册一门测试语言并全链路输出; 现有 en/zh 行为零回归。
- **整改**: ✅ bda825b —— `registerLocale(name, dict)` + 导出 `MESSAGE_KEYS`/`Dict`/`Entry`; `Locale = 'en' | 'zh' | (string & {})`(保留字面量提示); config 未注册 locale 告警(status 可见)不禁用; i18n.spec 注册 klingon 验证 makeT/resolveLocale, cli.spec 以 `--locale test-lang` 全链路(check → 门禁 → claude deny 编码); en/zh 既有断言零改动全绿。

### ✅ P2-3 audit 时间戳随机器 locale 变化

- **问题**: `audit()` 用 `toLocaleString()` 渲染, 国际协作者看到的格式不可预测。
- **位置**: `src/cli.ts`(audit)
- **整改方案**: 改 ISO 8601(`new Date(e.time).toISOString()`); audit.jsonl 本身已是时间戳数字, 无迁移成本。
- **验收**: 任意 TZ 下输出格式一致; 更新 cli.spec 断言。
- **整改**: ✅ bd7da94 —— 改 `toISOString()`(UTC); cli.spec 断言输出匹配 ISO 形态(`yyyy-MM-ddTHH:mm:ss.sssZ`)。audit.jsonl 存储格式未动, 无迁移。

### ✅ P2-4 配置正则 ReDoS 提示缺失

- **问题**: `featurePattern` 与分支条目正则直接 `new RegExp`, 病态正则可拖垮门禁(配置作者自负); 内部分类器为手写解析无此风险, 但文档未提示。
- **位置**: `src/config.ts`(matchBranchSpec / validateConfig) / README Configuration Reference
- **整改方案**: README 双语补一句"分支正则由项目作者提供, 请避免灾难性回溯写法"; 可选: validateConfig 对嵌套量词给 warning 级提示。
- **验收**: README 双语均有提示。
- **整改**: ✅ 5788a97 —— 双语 Configuration Reference 各补 Regex safety / 正则安全一条(点名嵌套量词如 `(\w+)+`)。可选的 warning 级检测暂不做: 嵌套量词误报率高且无法静态判定危害度, 文档提示已达成共识边界——留档不做。

### ✅ P2-5 `check --command` 模式平台回退语义未注释

- **问题**: `--command` 模式下 `raw=''`, `detectPlatform('')` 回退 `'claude'`(exit 2 协议); `--platform auto` 时 deny 编码实际由该回退决定, 行为正确但无说明。
- **位置**: `src/cli.ts`(check)
- **整改方案**: 加注释说明回退语义; 或在 `--platform auto` + `--command` 组合时显式按 claude 处理并注释。
- **验收**: 代码注释到位; platform.spec 补一条 `--command` + auto 的编码断言。
- **整改**: ✅ bd7da94 —— check 内 `denyPlatform` 一次计算并复用(含 strict 分支与 catch 兜底), 注释说明 `raw='' → detectPlatform('') === 'claude'` 的协议含义; platform.spec 补空 payload 回退 claude 的 exit 2 编码断言, cli.spec 补 `--command + auto` 端到端断言。

### ✅ P2-6 文案字典无复数/ICU 支持(前瞻项)

- **问题**: 当前文案恰好不含复数场景(分支名/角色名插值无单复数变化), 暂无实际缺陷; 但面向更多语言(ja/es/de/ru 等)扩展时, 部分语言复数规则复杂(如俄语三态), 现有 `(vars) => string` 单条目函数需手写分支才能覆盖。
- **位置**: `src/i18n.ts`(Dict/Entry 结构)
- **依据**: 国际化共享插件的前瞻标准(ICU MessageFormat / CLDR 复数规则)。
- **整改方案**: 与 P2-2(registerLocale)合并考虑——注册接口的 Entry 类型预留复数形态(如按 Intl.PluralRules 选择变体); 在现有 en/zh 双语下不引入依赖、不改动行为。
- **验收**: 设计决策留档(做或不做均记录理由); 若做, 测试内含一门多复数语言的样例。
- **整改**: ✅ bda825b —— 决策:**不做**, 留档于 `src/i18n.ts` 头注释与 CHANGELOG 0.0.12: Entry 保持 `(vars) => string`, 当前文案零复数场景, 不引入 ICU 依赖; 未来多复数语言可在 Entry 内部按 `Intl.PluralRules` 选变体(接口无需变更), 或届时报数后再引入 MessageFormat。理由: registerLocale 已把"字典结构"收窄为唯一演进点, 提前抽象是无用例的超前设计(AGENTS.md §5)。

---

## 附: 评审已达标项(无需整改, 留档对照)

- i18n 架构: 集中文案表 / 函数式插值 / 加载期 en-zh 键一致性校验 / 未知 key 回退英文 / resolveLocale 白名单。
- 门禁路径文案全覆盖(拦截 why/next、CLI status 均走 `makeT(locale)`), gate 纯函数注入 `t`。
- zh 全链路回归: `tests/cli.spec.ts` locale=zh 用例 + `scripts/verify-matrix.mjs` [D] 节(已入 CI)。
- 双语 README 结构对齐互链, 含 FAQ/Glossary/Honest limits(如实声明本地不可防通道)。
- 包形态: ESM + exports/types/bin/files 白名单、零运行时依赖、peerDependencies 正确声明宿主。
- 工程质量: strict TS、runner 注入测试边界、事实预取→纯函数判定分层、fail-open 默认 + strict fail-closed、审计留痕失败不阻断。
- CI/CD: 三平台 × Node 22/24 全矩阵 + typecheck + verify:matrix; release 含 tag↔package.json 版本校验。
