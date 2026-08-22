# AgentsGitFlowController — 项目智能体规范

> 本文件是项目唯一的智能体规范，遵循 AGENTS.md 标准，Codex / OpenCode / Claude Code / Gemini 等工具均可读取。

## 1. 语言规范

- 沟通交流：使用**中文**，专业且简洁。
- 代码逻辑：
  - 变量名 / 方法名 / 类名 / 包名：**英文**。
  - 代码注释：**中文**。
  - 日志 / 异常信息：**英文**。

## 2. 常用命令

<!-- 填写项目的构建 / 测试 / 运行 / 部署命令 -->

- 构建：`npm run build`(tsdown → lib/; 插件改代码后需重建并重启 DSH)
- 测试：`npm test`(vitest, 全绿才算完成)
- 类型检查：`npm run typecheck`(tsc --noEmit, 0 Error 才算完成)
- 安装进 DSH：`node scripts/install-dsh.mjs [profile]`(本机无 DSH 时跳过)
- **发布(自动化)**：bump 叠加在**待合并的内容 PR 分支**上(`npm version patch`, 版本提交与 tag 落在该分支; bump 前确认 README 双语锁版本示例已同步为本次版本号, feature 前缀是必须的——集成 PR 的 head 必须是 feature 角色)→ 用户合并该 PR(内容+changelog+版本号一次带进 develop)→ 推 tag → CI 自动发布
  —— 仅当内容已合入后的纯补发(如版本同步)才开独立 `feature/release-<版本>` PR
  —— 本地 develop 永不直接变更(§4); develop 的一切演进只经 GitHub 的 PR 合并与用户推送产生
  —— CI 自动: 校验 tag=package.json 版本 → 测试 → 构建 → npm publish → GitHub Release
  —— 前提: GitHub 仓库 Secrets 已配 `NPM_TOKEN`(Publish 类型 access token)

## 3. 目录结构

```
AgentsGitFlowController/
├── AGENTS.md            # 唯一的智能体规范（本文件）
├── .gitignore           # 忽略本机与系统文件
├── .github/workflows/   # GitHub Actions（init.yml 初始化后自删）
└── .agents/             # 智能体扩展，内容全部自建，不引入外部
    ├── agents/          # 自建子智能体（architect 等 7 个，见 4. 工作流约定）
    ├── hooks/           # 自建 hook，规范见 HOOKS.md
    ├── skills/          # 自建 skill
    └── commands/        # 自建命令
```

## 4. 工作流约定

默认开发流水线：

```
需求拆解 (architect) → 测试驱动 (tester) → 代码实现 (coder)
→ 代码审查 (code-reviewer) → 测试审查 (test-reviewer)
→ 文档同步 (doc-writer)
```

- 测试驱动与代码实现之间按 TDD 循环迭代：先写失败测试（红）→ 最小实现（绿）→ 重构，循环直至完成。
- 代码审查与测试审查在**合并前**执行，审查通过才进入收尾。
- **本仓库自身开发也走 GitFlow**：`feature/<主题>` 分支开发 → 测试/矩阵全绿 → **PR 到 develop**【经用户确认合并】; **禁止直接 commit/push develop**。develop 只承载集成、发版 tag 与归档 PR 的源——这与插件对 `develop=integration (update=pr)` 的约束一致，规矩靠纪律执行，不靠插件兜底。
- **本地 develop 零变更**：禁止对本地 develop 做任何变更操作(commit / amend / reset / cherry-pick / `npm version` / 打 tag / 拉取合并等一律不做)。develop 的一切演进只经 GitHub 的 PR 合并与用户推送产生; 需要基于 develop 的动作一律从 `origin/develop` 派生工作分支(如 `feature/release-<版本>`)。
- 提交规范：Conventional Commits（feat / fix / docs / style / refactor / test / chore）；**PR 标题与正文一律英文**。
- **CHANGELOG 随功能同一 PR 写入**, 标题仅用版本号、不写日期(发布时间由 git tag / GitHub Release 承载), 发布 bump 时一次到位; 禁止发版后再为本次版本单独开修正 PR。
- 遇到设计稿 / 报错截图 / 架构图等图片时，插入 vision 识别。

<!-- 项目特定的开发流程、提交规范等在此补充 -->

## 5. 行为准则

- 不确定性确认：需求有歧义时先提问，不盲目假设。
- 原子化修改：每次修改集中一个功能点，避免无关的大改动。
- 最小改动：不做超前设计，不为假想需求添加功能。
- 客观表达：只陈述事实与判断，不带情感色彩（奉承、感叹、夸张）。
- 敢于反对：不迎合用户意见，发现方案确实不合适时明确指出并说明理由。
- **禁止 AI 署名**：commit / PR 一律不得出现 `Co-Authored-By: Claude`、`Generated with Claude Code` 等 AI 署名或生成声明；提交只署项目用户身份。
- 禁止删除根目录：`rm -rf /`、`rm -rf /*` 等针对根目录的删除**绝对禁止，无例外**。
- 主目录删除须确认：`rm -rf ~`、`rm -rf ~/*` 等删除主目录内容的操作，须先用明确告警说明影响范围，获用户明确确认后方可执行。

## 6. 测试规范

- 断言必须验证行为：禁止只验证「不抛异常」的空转测试。
- 覆盖率真实：追求行为覆盖而非行数，禁止为凑覆盖率修改生产代码。
- Mock 克制：领域逻辑用真实输入输出验证，仅外部边界（数据库、网络、文件）用 Mock 隔离。

## 7. 陷阱记录

<!-- 记录踩过的坑，随项目成长追加 -->

- macOS 下 `/tmp` 是 `/private/tmp` 的符号链接;Windows 下临时目录可能是 8.3 短名(`RUNNER~1` → `runneradmin`):测试建临时仓库须以 `git rev-parse --show-toplevel` 的权威规范化路径为准, 否则断言失败。
- vitest 会接管 stdout,`console.log` 不走 `process.stdout`:测试捕获输出须拦截 console.log。
- npm 7+ 默认自动安装 peerDependencies; 本仓库仍将 DSH 类型包(@deepseek-ai/dsh-session 等)显式声明为 devDependencies, 保证类型面完整与锁文件可复现。
- `{ ...DEFAULT_CONFIG }` 浅拷贝会共享嵌套对象,合并时修改会污染模块级默认值:必须深拷贝。
- DSH 插件包须在 package.json 声明 `dsh.bundle.patch`(`dsh plugin add` 才会自动挂载为 profile 层)。
- 本仓库 dogfood:gitflow-guard.config.json 已启用,develop 为集成分支 / main 为归档分支;合入 develop 须经用户确认;main 仅用户亲手归档。

## 8. 客户端支持清单(新增 agent 平台时必须逐项同步)

> 每次给守卫新增一个客户端接入(已有 DSH / Claude Code / Codex / OpenCode / Antigravity;未来如 Cursor 等),按以下清单逐项同步,最后 `npm run verify:matrix` 全绿才算完成。**漏一项就是隐性半成品**。
> **例外: GitHub Copilot 不在本插件接入范围** —— 其原生 allow/deny/ask 权限 + rules 已覆盖守卫场景; 官方另有 hooks 系统可由用户自行接入(官方文档见 README)。本插件不为它造半个 hook,也不声称支持该平台。

1. **协议层** `src/platform.ts` + `tests/platform.spec.ts`:
   - `detectPlatform`: 加该平台 payload 判别字段;`extractHookPayload`: 加 stdin 形状;`encodeDeny`: 加拦截协议(exit 码 / stdout JSON 形状)。
   - `HookPlatform` 联合类型加成员;补三者的单测分支。
2. **CLI**: `gitflow-guard check --platform <name>` 可走通(`cli.ts` 透传 `--platform`, 无需特判)。
3. **仓库级 hook 配置(dogfood)**: 新增与 `.claude/settings.json`、`.codex/hooks.json` 同款的项目配置。
4. **仓库内参考文档**: `.agents/hooks/references/<tool>.md` 存在且与官方协议一致, 缺失则补。
5. **连续复测矩阵**: `scripts/verify-matrix.mjs` 新增该平台「真实 payload 拦截 + 放行」用例, 断言 wire 格式(exit/JSON 字段)。
6. **README 双语**: 安装/使用段补该平台配置示例;开头宣传语 "for AI coding agents — DSH, Claude Code, and Codex" 追加上新客户端名。
7. **package.json**: `description` 的客户端清单追加;`keywords` 补搜索词。
8. **CHANGELOG**: 记一条 feat。
9. **QA 三连**: `npm run typecheck`(0 错) + `npm test`(全绿) + `npm run verify:matrix`(全绿)。
