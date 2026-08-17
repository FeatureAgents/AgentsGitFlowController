# GitFlowControllerForDSH — 项目智能体规范

> 本文件是项目唯一的智能体规范，遵循 AGENTS.md 标准，Codex / OpenCode / Claude Code / Gemini 等工具均可读取。

## 1. 语言规范

- 沟通交流：使用**中文**，专业且简洁。
- 代码逻辑：
  - 变量名 / 方法名 / 类名 / 包名：**英文**。
  - 代码注释：**中文**。
  - 日志 / 异常信息：**英文**。

## 2. 常用命令

<!-- 填写项目的构建 / 测试 / 运行 / 部署命令 -->

- 构建：`pnpm build`(tsdown → lib/; 插件改代码后需重建并重启 DSH)
- 测试：`pnpm test`(vitest, 全绿才算完成)
- 类型检查：`pnpm typecheck`(tsc --noEmit, 0 Error 才算完成)
- 安装进 DSH：`node scripts/install-dsh.mjs [profile]`(本机无 DSH 时跳过)
- **发布(自动化)**：`npm version patch && git push origin main && git push --tags`
  —— CI 自动: 校验 tag=package.json 版本 → 测试 → 构建 → npm publish → GitHub Release
  —— 前提: GitHub 仓库 Secrets 已配 `NPM_TOKEN`(Publish 类型 access token)

## 3. 目录结构

```
GitFlowControllerForDSH/
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
- 提交规范：Conventional Commits（feat / fix / docs / style / refactor / test / chore）。
- 遇到设计稿 / 报错截图 / 架构图等图片时，插入 vision 识别。

<!-- 项目特定的开发流程、提交规范等在此补充 -->

## 5. 行为准则

- 不确定性确认：需求有歧义时先提问，不盲目假设。
- 原子化修改：每次修改集中一个功能点，避免无关的大改动。
- 最小改动：不做超前设计，不为假想需求添加功能。
- 客观表达：只陈述事实与判断，不带情感色彩（奉承、感叹、夸张）。
- 敢于反对：不迎合用户意见，发现方案确实不合适时明确指出并说明理由。
- 禁止删除根目录：`rm -rf /`、`rm -rf /*` 等针对根目录的删除**绝对禁止，无例外**。
- 主目录删除须确认：`rm -rf ~`、`rm -rf ~/*` 等删除主目录内容的操作，须先用明确告警说明影响范围，获用户明确确认后方可执行。

## 6. 测试规范

- 断言必须验证行为：禁止只验证「不抛异常」的空转测试。
- 覆盖率真实：追求行为覆盖而非行数，禁止为凑覆盖率修改生产代码。
- Mock 克制：领域逻辑用真实输入输出验证，仅外部边界（数据库、网络、文件）用 Mock 隔离。

## 7. 陷阱记录

<!-- 记录踩过的坑，随项目成长追加 -->

- macOS 下 `/tmp` 是 `/private/tmp` 的符号链接,git 返回真实路径:测试建临时仓库须 `realpathSync` 规范化,否则断言失败。
- vitest 会接管 stdout,`console.log` 不走 `process.stdout`:测试捕获输出须拦截 console.log。
- pnpm 默认不自动安装依赖的 peerDependencies:DSH 类型包(@deepseek-ai/dsh-session 等)须显式加入 devDependencies 才有完整类型面。
- `{ ...DEFAULT_CONFIG }` 浅拷贝会共享嵌套对象,合并时修改会污染模块级默认值:必须深拷贝。
- DSH 插件包须在 package.json 声明 `dsh.bundle.patch`(`dsh plugin add` 才会自动挂载为 profile 层)。
- 本仓库 dogfood:gitflow-guard.config.json 已启用,develop 基线 / staging 预览 / main 主干;合入 develop 前须经 staging + 用户确认(P2)。
