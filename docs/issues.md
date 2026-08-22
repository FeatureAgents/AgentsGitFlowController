# 待整改问题清单（第三轮 · develop 全量审查）

> 审查对象: `origin/develop @ 6d8fd75`(0.0.12 版本提交; 与 `feature/i18n-standard-remediation` 树逐字节一致, `git diff` 为空)。
> 审查方式: 按「本地 develop 零变更」约定走 `git fetch` + 独立只读 worktree; 期间插件**真实拦截**了一次对 develop 的 `git pull`(集成分支禁止本地合并), dogfood 生效。
> 质量基线(develop 内容): typecheck 0 错 · vitest 175 测试全绿 · verify:matrix 27 PASS/0 FAIL(CI 另有 ubuntu/macOS/Windows × Node 22/24 六档矩阵)。
> 发现来源标注: 【文档】【清单】【源码】【实测】【流程】。约定: 每项含 **问题 / 位置 / 依据 / 整改方案 / 验收标准**。
> 国际化共享插件五维结论: **协议正确性 ✅ / 打包元数据 ✅ / 双语文档 基本对齐(下 P0/P1) / 客户端接入 8 项清单 5✅3⚠️ / 防护完整性 存在分类器缺口(下 P1)**。
>
> **状态: 第三轮整改完成**(2026-08-22; P0×2 + P1×9 + P2 可选项 10/11 落实, 明细见各项状态行):
> typecheck 0 错 · vitest **181** 测试全绿 · verify:matrix **36** PASS/0 FAIL(五平台拦截+放行成对);
> 整改折入未发布的 0.0.12(CHANGELOG 已并入), 本地 tag v0.0.12 已重指到最终提交——**待用户合并 PR 后推 tag 发布**(P1-3)。

---

## P0 —— 文档事实错误, 会误导用户操作预期

### P0-1 双语 FAQ 仍声称「归档的建 PR 也被拒」, 与 0.0.9 起的实现相反

- **问题**: FAQ 写插件 denies "the *merge* for production and the *PR creation* (and merge) for archive"(中文: "对归档的*建 PR 与合并*插件一律拒绝")。实际指向 archive 的 PR/MR **允许创建**, 仅合并被拦。同页英文门禁矩阵(`README.md:285`)与角色表都写 create allowed——同页自相矛盾。
- **位置**: `README.md:406`、`README.zh.md:403`。
- **依据**: `src/gate.ts` decidePrCreate 对 archive 目标放行(:136 注释即"允许创建…归档 PR"); `tests/gate.spec.ts` 断言 pr-create target 'main' → allow; `CHANGELOG.md` 0.0.9("agent 允许**创建**指向 archive 的 PR/MR…移除旧限制")。【文档】
- **整改方案**: 双语改为「生产的*合并*被拦; 归档的*合并*被拦——建 PR 允许, 便于起草 develop→main 归档 PR」。
- **验收**: grep 双语不再出现 archive 建 PR 被拒的表述; 与同页矩阵行逐格一致。
- **状态**: ✅ 已完成(commit ab8cf40)——双语 FAQ 改为「生产的*合并*、归档的*合并*被拦; *建 PR/MR 允许*(便于起草 develop→main 归档 PR)」, 与同页矩阵/角色表一致。

### P0-2 中文版门禁矩阵 archive 行是 0.0.9 之前的旧行为

- **问题**: zh 矩阵行「指向 archive 的 PR/MR | 🚫 拦」整体判拦; en 对应行为 "✅ create allowed; 🚫 merge blocked"。双语事实冲突, zh 为过期残留。
- **位置**: `README.zh.md:282`(对照 `README.md:285`)。
- **依据**: 同 P0-1 证据链。【文档】
- **整改方案**: zh 行改为「✅ 可创建; 🚫 合并被拦(你在 UI 合并)」。
- **验收**: 双语该行逐格对齐; 门禁矩阵其余行抽查无同类残留。
- **状态**: ✅ 已完成(commit ab8cf40)——zh 行与 en 逐格对齐, 其余行抽查无残留。

---

## P1 —— 应修(防护缺口 / 规范缝合处 / 发布挂起 / 文档失衡)

### P1-1 分类器未收编「本地改写 refs」命令族, 受保护分支可被静默改写【实测】

- **问题**: 以下命令全部放行(exit 0), 即使发生在受保护分支上:`git reset --hard HEAD~1`、`git rebase main`、`git commit --amend -m x`、`git filter-branch -- --all`、`git branch -m develop x`(改名=移动受保护 ref)、`git branch --delete --force develop` 与 `git branch -d --force develop`(长式组合旗标绕过 parseBranch 的 args[0..1] 读取)。
- **位置**: `src/classify.ts`(parseBranch 仅识别 `-d/-D/--delete`+紧邻分支名; 无 reset/rebase/amend/filter-branch 分支 → kind 'other'); `src/cli.ts:194`(other 快速放行)。
- **依据**: 本轮 18 条 wire 级探测(node bin/gitflow-guard.mjs check --command)实录; README 局限章节 grep 未见这些形态(只列 forge API 直连与解释器子进程)。0.0.11 已把同为本地改写的 `update-ref`/`send-pack` 收编, 本族属同一威胁等级的一致性缺口。【实测】【源码】
- **整改方案**: 二选一: (a) 分类器收编——reset/rebase/amend/filter-branch 映射为新的 ref-move 类分类, 门禁按(模拟)当前分支角色判定(与 local-merge 同型: 受保护分支上一律拒绝, feature 上自由); parseBranch 改为扫描全部 flag 后取首个非 flag 参数; `branch -m` 按 ref-update 同级处理。(b) 若暂不收编, README 局限一节如实列出并说明理由。补对抗语料进 `tests/accuracy-audit.spec.ts`。
- **验收**: 探测清单中的命令在受保护分支上下文 exit 2(deny), 在 feature 分支 exit 0; 或文档明示; accuracy-audit 语料扩充。
- **状态**: ✅ 已完成(commit 6c01962, 方案 a)——新增 `ref-move` 分类(reset/rebase/amend/filter-branch; rebase 恢复类旗标与普通 commit 放行), 门禁按模拟当前分支角色判定(受保护拒绝/feature 自由); parseBranch 全旗标扫描, `branch -m/-M` 改名(源+目标双查)与 `-f` 强制复位按 ref-update 同级处理; accuracy-audit 补 2 组语料 + classify.spec 更新 rebase 断言 + 复测矩阵 A 节补 8 例。wire 级复测: 受保护分支 exit 2、feature 分支 exit 0。

### P1-2 配置校验缺口: 角色条目里的非法正则静默失效(守卫最坏失效形态)

- **问题**: `\"preview\": [\"release/(\"]` 这类非法正则不产生任何 config error——`validateConfig` 只编译 `featurePattern`, 不编译角色分支条目; 运行时 `matchBranchSpec` 对编译失败 `catch → return false`, 该条目**静默永不命中**, 保护无声消失, `status` 也无告警。另外角色重叠检测只比对字面量相同条目(`includes`), 正则语义重叠(如 integration \"release/.*\" vs preview \"release/beta\")不检测, 由 roleOfBranch 的隐式优先级裁决。
- **位置**: `src/config.ts:30-39`(matchBranchSpec)、`:140-161`(validateConfig)、`:156`(字面量重叠)。
- **依据**: 源码审读; 守卫产品的核心承诺是"保护绝不静默失效", fail-closed 哲学要求校验期暴露。【源码】
- **整改方案**: normalizeRole/validateConfig 对每条分支条目尝试 `new RegExp`, 非法即 config error(配置损坏 → 按 strict/fail-open 既有分级处理); 正则语义重叠可选做告警(warnings)。
- **验收**: 非法角色正则出现在 status 的 config error 里且默认路径 stderr 有提示; 新增单测覆盖。
- **状态**: ✅ 已完成(commit cbd8c6c)——normalizeRole 对每条分支条目按运行时同款 `^(?:…)$` 形态预编译, 非法即 config error(经既有 strict/fail-open 分级: 默认 stderr 告警放行、strict 拦截、status 可见); config.spec 新增单测(合法正则/字面量不受影响)。

### P1-3 v0.0.12 发布挂起: npm latest 仍是 0.0.11, README 锁版本示例暂时指向不存在版本【流程】

- **问题**: registry 直查 dist-tags.latest=0.0.11(versions 至 0.0.11); 远端 tag 至 v0.0.11; develop 已含 0.0.12 版本提交, 双语 README 四处锁版本示例 `@0.0.12` 在推 tag 前指向 npm 上不存在的版本。
- **位置**: npm registry; `git ls-remote --tags`; `README.md`/`README.zh.md` 安装段。
- **依据**: AGENTS.md §2 流程(内容合入 develop → 用户推 tag → CI 自动发布)——这是**待执行动作**而非缺陷; 但在推 tag 前, 一切安装指引都会 404。【流程】
- **整改方案**: 用户确认后推 tag v0.0.12(tag 应已在版本提交上), CI 自动校验+发布; 发布完成前不对外传播安装链接。顺手项: v0.0.10 是 lightweight tag(其余为 annotated), 之后保持 annotated 统一。
- **验收**: npm dist-tags.latest=0.0.12; `npm view agents-gitflow-guard@0.0.12` 可解析; GitHub Release 生成。
- **状态**: ⏳ 待用户动作——第三轮整改已折入 0.0.12(CHANGELOG 并入, 版本号不变), 本地 tag v0.0.12 已重指到最终提交(`git tag -f`, 远端未推过该 tag 故安全); 按流程待 PR 合入 develop 后由**用户推 tag**, CI 自动校验+发布; 发布完成前不对外传播安装链接。

### P1-4 §8 清单与实现的「DSH 豁免」口径未书写, references 缺 dsh.md【清单】

- **问题**: `HookPlatform` 只有 claude/codex/antigravity/opencode 四成员; DSH 实际走进程内插件协议(`apply()` 监听 tools/pre-execute, deny 经返回值), stdin/exit-code 协议对其无意义——架构分叉合理, 但 AGENTS.md §8.1 与 platform.ts 头注释都没写明例外, 后续贡献者按清单验收会对 DSH 反复歧义; references/ 也缺 dsh.md(四份 hook 平台各有)。
- **位置**: `src/platform.ts:4`; `AGENTS.md` §8.1; `.agents/hooks/references/`(缺 dsh.md); `src/index.ts:153-175`。
- **依据**: 清单逐项审计(8 项中此项 ❌)。【清单】
- **整改方案**: 方案(a)推荐: §8.1 与 platform.ts 注释明确「第 1 条仅适用于 stdin-hook 类平台; DSH 对应物是 patch.yml + dsh.bundle.patch + apply() 返回值协议」, 并新增 references/dsh.md 记载挂载协议。
- **验收**: 清单口径自洽; dsh.md 存在且与 patch.yml/package.json/index.ts 三处一致。
- **状态**: ✅ 已完成(commit ef9875f + 4f75b2c)——AGENTS.md §8 顶部补 DSH 例外段(第 1/3/4 条不适用, 挂载/拦截对应物写明); platform.ts 头注释同步; 新增 `.agents/hooks/references/dsh.md`(挂载经 patch.yml+dsh.bundle.patch、apply() 监听 tools/pre-execute、返回值 deny、fail-open 降级), 与三处实现逐项核对一致。

### P1-5 复测矩阵 E 节(Antigravity)只有拦截用例, 缺「放行」用例【清单】

- **问题**: B/C/F 三节都是「拦截+放行」成对断言, E 节仅断言拦截(exit 0 + stdout decision=deny); §8.5 明文要求每平台双用例。
- **位置**: `scripts/verify-matrix.mjs:135-145`。
- **依据**: 清单逐项审计。【清单】
- **整改方案**: 补一条 ls/npm 类 `toolCall.args.CommandLine` payload, 断言 exit 0 且 stdout 为空。
- **验收**: verify:matrix E 节 PASS 数 +1, 五平台均成对。
- **状态**: ✅ 已完成(commit 6c01962)——E 节补 `ls -la` 放行用例(exit 0 且 stdout 空), 五平台拦截+放行成对; 矩阵总量 27→36 PASS/0 FAIL。

### P1-6 references 协议口径漂移: codex.md 与 encodeDeny 不一致, claude-code.md 要素不全【清单】

- **问题**: codex.md 称拦截可用 "permissionDecision deny **或 exit 2**", 实现(`encodeDeny`)恒 exit 0 + stdout `hookSpecificOutput{hookEventName, permissionDecision, permissionDecisionReason}`, 且 detectPlatform 依赖的 `turn_id` 判别字段无记载; claude-code.md 只有注册示例, 缺 payload 字段(tool_input.command/cwd/tool_use_id)、exit 2 语义、CLAUDE_PROJECT_DIR 变量说明, 示例还指向不存在的 `.agents/hooks/guard-dangerous.sh`。
- **位置**: `.agents/hooks/references/codex.md:33`、`claude-code.md:12`; 对照 `src/platform.ts:82,:97-103`。
- **依据**: 清单审计与源码比对。【清单】
- **整改方案**: codex.md 对齐「恒 exit 0 + 完整 JSON 形状 + turn_id 判别」; claude-code.md 补三要素并修正示例; 顺带在 opencode.md 补 OPENCODE_PROJECT_DIR 出处核验注记(见 P2-3)。
- **验收**: 四份 references 与 platform.ts 逐字段一致; 引用的脚本/变量全部存在。
- **状态**: ✅ 已完成(commit ef9875f)——codex.md 改为「恒 exit 0 + 完整 hookSpecificOutput JSON 形状 + turn_id 判别」并修正示例命令; claude-code.md 补 payload 字段(tool_input.command/cwd/tool_use_id/hook_event_name)、exit 2 语义、CLAUDE_PROJECT_DIR 说明, 示例改指真实守卫命令; opencode.md 补 OPENCODE_PROJECT_DIR 路径前提注记(P2-3 文档部分); 四份与 platform.ts 逐字段核对一致。

### P1-7 en 版独有「Adding a new agent client」段 zh 缺失, 且示例自相矛盾【文档】

- **问题**: 该段(en 含 AGENTS.md §8 引用)zh 开发段无对应译文; 示例 "(e.g. Gemini / OpenCode / Cursor)" 拿已正式支持的 OpenCode、已并入 Antigravity 的 Gemini CLI 当"待接入"例子, 与本文档安装段冲突。
- **位置**: `README.md:493`; `README.zh.md` 开发段(无对应)。
- **依据**: 双语逐段对照。【文档】
- **整改方案**: zh 补译整段; 示例换成真正未接入平台(Cursor / Windsurf 等)。
- **验收**: 双语开发段落一一对应; 不再出现自相矛盾的示例。
- **状态**: ✅ 已完成(commit ab8cf40)——en 示例改 Cursor/Windsurf; zh 开发段补译整段(含 AGENTS.md §8 引用与 DSH 例外提示)。

### P1-8 zh 术语表 archive 行破表(渲染串列)【文档】

- **问题**: 两列表(术语|含义)里塞了 4 个单元格内容, 从「配置参考」角色表误拷贝, 渲染必然串列。
- **位置**: `README.zh.md:451`(对照 en `README.md:454` 正确格式)。
- **整改方案**: 改为与 en 对应的单句描述。
- **验收**: 渲染后表格列数正确。
- **状态**: ✅ 已完成(commit ab8cf40)——改为与 en 对齐的单句描述(两列), 渲染列数正确。

### P1-9 docs/design.md 名实不符: 自称"当前实现规格", 实为 0.0.2 前的 v0 设计【文档】

- **问题**: 内容是 permit/confirm 特许系统、base/trunk 角色、permits.ts/session.ts 结构等已被 0.0.2 整体替换的设计, 文件头却声明"其余设计内容仍为当前实现规格"; 双语 README 末尾仍把它当设计规格链接, 读者进入即得到整套过时 schema。
- **位置**: `docs/design.md:3-9` 及 §4-§5; 引用点 `README.md:501`、`README.zh.md:496`。
- **依据**: 与现行 src/config.ts 角色 schema、src/cli.ts 子命令面全面矛盾; CHANGELOG 0.0.2 记录替换。【文档】
- **整改方案**: 顶部加历史横幅「v0 设计决策记录, 已被 0.0.2 角色驱动模型取代, 行为以 README 为准」并修正 :9 表述; 或移入 docs/archive/design-v0.md 并同步链接文案。不建议删除(附录有追溯价值)。
- **验收**: 任何入口读到 design.md 都先见到"非现行"声明。
- **状态**: ✅ 已完成(commit ab8cf40)——design.md 标题与顶部改历史横幅(「v0 设计决策记录, 已被 0.0.2 角色驱动模型取代, 行为以 README 为准」), 删除「唯一规格/当前实现规格」表述; 双语 README 链接文案同步为「已被 0.0.2 取代」。

### P1-10 handoff.md 为 0.0.2 时代遗留, 所列事项全部失效【流程】

- **问题**: PR #1 待合并、GitHub 故障监控、0.0.1→0.0.2 发版等待办均已完结; 当前 0.0.12。本机临时物(`.gitignore` 已列"交接记录(非提交)")。
- **位置**: 仓库根 `handoff.md`(最后更新 2026-08-19)。
- **整改方案**: 删除本地文件(.gitignore 条目保留防复发); 如需留痕仅留一行"已完结, 见 CHANGELOG/git 历史"。
- **验收**: 根目录无过期交接文档。
- **状态**: ✅ 已完成——本地文件已删除(未跟踪文件, 无 commit); .gitignore 条目保留防复发。

---

## P2 —— 可选改进

1. **verify-matrix.mjs 头注释漏列 [F] 节**【清单】: `:2-8` 只列 A-E, 正文有六节, 与双语 README"六节"口径不符。补一行注释即可。—— ✅ 已完成(commit 6c01962)。
2. **codex/antigravity 缺显式 extract 单测**【清单】: `tests/platform.spec.ts` 仅经 'auto' 间接覆盖; §8.1 要求三者各有分支用例。各补一条显式平台断言。—— ✅ 已完成(commit f3da31e)。
3. **dogfood 配置的环境变量前提未固化**【清单】: `.codex/hooks.json:7` 用相对路径 `bin/gitflow-guard.mjs`(session 起于子目录即失效; README 已注明前提, 配置本身脆弱); `.opencode/hook/hooks.yaml:9` 的 OPENCODE_PROJECT_DIR 变量出处未在 references 记载。真机核验后在文档补注来源/约束。—— ✅ 文档部分完成(commit ef9875f): opencode.md 补路径前提注记; 相对路径脆弱性维持 README 注明口径, 真机核验后如需再固化配置。
4. **Quick Start blockquote 惰性续行吞 Step 2**【文档】: `README.md:48-49`/`README.zh.md:47-48` 引语块后无空行, CommonMark 下 Step 2 被渲染进引语框。补空行。—— ✅ 已完成(commit ab8cf40)。
5. **engines(node ≥22) 双语零表述**【文档】: 独立 hook 用户不经 npm 安装, engines 约束不到; 安装详解补一句 Node ≥ 22 前置(与 CI 最低档一致)。—— ✅ 已完成(commit ab8cf40)。
6. **registerLocale 下游体验**【文档】: 缺 fenced 可复制示例(现仅行内片段); 必需键清单不可发现(MESSAGE_KEYS 未从包根导出, 下游只能翻源码数键)。补 5-8 行完整示例或导出 MESSAGE_KEYS。—— ✅ 已完成(两项都做: commit 4f75b2c 导出 + ab8cf40 双语示例)。
7. **Development 段测试枚举注释过期**【文档】: `README.md:485`/`README.zh.md:482` 枚举缺 i18n / index / accuracy-audit。更新或去掉列举。—— ✅ 已完成(commit ab8cf40)。
8. **docs/verify-0.0.2.md 时点报告**【文档】: §3.4 记录的是 0.0.9 反转前的行为, 加一行历史横幅即可, 无需删。—— ✅ 已完成(commit ab8cf40)。
9. **patch.yml 随包发布但注释为中文**【源码】: `files` 白名单含 patch.yml, 是发布面的一部分; 共享包发布面建议英文或双语注释(仓库内 dogfood 配置不受此限)。—— ✅ 已完成(commit ab8cf40, 改英文)。
10. **release.yml 可加 npm publish --provenance**【流程】: GitHub Actions 下零成本获得 npm provenance, 提升共享包供应链可信度。—— ✅ 已完成(commit ab8cf40)。
11. **共享插件配套文档可选补充**【流程】: 无 CONTRIBUTING.md / SECURITY.md; 现有 LICENSE(MIT)+双语 README+CHANGELOG 已达基本盘, 国际协作扩大后再补不迟。—— ⏸ 按清单结论维持不补。

---

## 附 A: 已核对无误的方面(本轮正面确认)

- **质量三连**(develop 内容): typecheck 0 错; 175 测试全绿; verify:matrix 27 PASS/0 FAIL; CI 六档矩阵同口径。
- **打包元数据**: name/version/license/files 白名单/exports/bin/engines(>=22=CI 最低档)/sideEffects:false/repository/bugs/homepage/dsh.bundle.patch 齐备; peerDependencies 策略与 devDeps 类型兜底符合陷阱记录约定。
- **语言规范执行**: src 全部 245 处中文均为注释与 i18n 文案字典; 日志/异常全英文(降级日志、i18n 键校验异常、CLI 内部错误均英文); 无 TODO/FIXME 残留; console 输出全部经 makeT 走 locale 或 stderr 协议通道。
- **双语事实一致性**(除所列 P0/P1): 锁版本示例=package.json 版本; 五平台宣传语/description/keywords/CHANGELOG feat 全齐且 Copilot 豁免显式声明; strict(fail-open 默认/strict 才 fail-closed)与 cli.ts 实现逐句一致; locale 优先级(旗标>项目配置>en)与回退告警语义一致; CHANGELOG 0.0.12 九条英中对称且与 git log 吻合。
- **协议层**: detectPlatform/extractHookPayload/encodeDeny 四 hook 平台分支齐全, antigravity(exit 0 + 顶层 decision)与 opencode(bash action exit 2)编码与各自 references 一致; CLI --platform 全程透传无特判; --command 回退语义有注释有测试。
- **dogfood 实证**: 审查期间插件真实拦截 git pull origin develop(集成分支禁止本地合并), 拦截文案与引导准确——产品在自己的开发流程里生效。

## 附 B: 本轮审查方法(可复现)

1. git fetch origin 后从 origin/develop(6d8fd75)建独立只读 worktree 审查, 未触碰本地 develop 分支引用; 主检出(feature 分支)树与 develop tip git diff 为空, 故 QA 以主检出运行结果为准。
2. 源码全量审读(src/ 9 文件)+ 18 条对抗命令 wire 级探测(check --command, 断言 exit code/stderr)。
3. npm registry HTTPS 直查(dist-tags/versions)核对发布状态。
4. 双路并行专项审计: 文档国际化一致性与事实准确性、AGENTS.md §8 客户端清单逐项合规; 关键引用已逐条抽查属实。
