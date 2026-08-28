# Handoff — Pi agent 实测问题与守卫空隙（gfguard-e2e 真机验证）

> **性质**：交接文档。供下一个 session 直接接着做"Pi 接入实测暴露的空隙修复"，语义决策点已在 §5 列出，需用户拍板后推进。
> **基线**：`origin/develop` @ `645a325`（v0.0.18；Pi 于 v0.0.17 并入）。
> **参考**：`docs/design.md`（角色驱动门禁规格）；`.agents/hooks/references/pi.md`（Pi 进程内扩展协议）；`src/classify.ts` / `src/gate.ts`（分类与门禁实现）。
> **测试资产**：`/Users/kean/Workspace/gfguard-e2e`（专用真机测试场，见其 `README.md`：108 用例决策矩阵、放行流脚本、Pi 拦截用例脚本、事故记录）。
> **项目纪律**：中文沟通；代码注释中文；日志/异常英文；Conventional Commits（PR 标题正文英文）；一分支一 PR；本地 develop 零变更；逻辑改动 QA 三连（`typecheck` 0 错 + `npm test` 全绿 + `npm run verify:matrix` 全绿）。

---

## 1. 背景与实测环境

- **Pi 接入**（v0.0.17）：进程内扩展（`src/pi.ts` 的 `createPiExtension()`），监听官方 `tool_call` 事件，拒绝以返回值 `{block:true, reason}` 表达；委托守卫 CLI（`--platform claude` 仅为内部 exit-2 契约）。
- **真机验证**（Pi 0.84.3 / Homebrew，provider `opencode-go` / `kimi-k2.6`，无头 JSON 模式）：临时仓库走真实用户安装路径（`npm i -D` → 拷 `pi/gitflow-guard.ts` → `.pi/settings.json`）与本仓库 dogfood 双路径，均验证拦截成功。
- **深度测试场**：`gfguard-e2e` 仓库（integration=`master`、preview=`beta`、featurePattern=`(fix|task)/[\w-]+`，配置已迁移到现行 schema；本地裸远端 `/tmp/gfguard-e2e-origin.git` 供真实 push）。

---

## 2. 实测结果（2026-08-28）

### 2.1 决策矩阵
`scripts/gfguard-matrix.sh`（已提交到 gfguard-e2e）——**108 用例 / 9 命令族，108/108 与期望一致**。覆盖面超出预期：

- 已拦截：push（force/delete/refspec/`--mirror`/`--all`/通配 `refs/heads/*:*`）、`send-pack`、`update-ref`（plumbing）、`git -C` / `--git-dir` 全局选项、shell 包装（`sh -c`/`bash -lc`）、`env`/`xargs`/`command`/`VAR=` 前缀、链式分段（`&&`/`||`/`;`/`$()`/反引号/子 shell）。
- 按设计放行：tags-only push、`git merge` 无参同步上游、受保护分支间 merge（如 `beta→master`）、feature 分支上全部改写操作、`pull origin master`（source 受保护）。

### 2.2 真实放行流（全部执行成功）
feature 分支全生命周期：建 → 改 → `commit --amend` → `reset --soft` → `merge master`（受保护合入 feature）→ `push -u` → `push --force`（feature）→ rename → 远端/本地删除。已固化为 `gfguard-e2e/scripts/gfguard-realflow.sh`。

### 2.3 真实拦截（Pi 扩展通道，4 用例全部符合预期）
| 用例 | 命令 | 结果 |
|---|---|---|
| A | `git push origin master` | 拦截 ✓（origin/master 未动） |
| B | `git branch -D beta` | 拦截 ✓（beta 未删） |
| C | `git add -A && git commit -m x && git push origin master` | 整段执行前拦截 ✓ |
| D | `git push origin task/pi-e2e` | 放行 ✓（真实创建远端 ref） |

已固化为 `gfguard-e2e/scripts/gfguard-pi-cases.sh`。

---

## 3. 确认的空隙（当前守卫判定 allow，均为实测）

| # | 命令 | 风险 | 落点 |
|---|---|---|---|
| G1 | `sudo git push origin master` | `sudo` 不在 WRAPPERS，落为 `other` 放行 | `src/classify.ts` |
| G2 | `git symbolic-ref refs/heads/beta refs/heads/master` | plumbing 未覆盖（`update-ref` 已覆盖，`symbolic-ref` 漏） | `src/classify.ts` |
| G3 | `git cherry-pick <sha>` / `git revert HEAD`（受保护分支上） | 可在受保护分支上改写历史，当前 `other` | `src/classify.ts` + `gate.ts` |
| G4 | `git tag -f v1 master` | tag 移动未覆盖（`--tags` push 有豁免，属设计范围判断） | 决策点 |
| G5 | `git checkout -B master` / `git switch -C beta` | 强制重建受保护分支未覆盖（`checkout` 恒放行） | `src/classify.ts` `parseCheckout` |
| G6 | 受保护分支上的普通 `git commit`（非 `--amend`） | 允许本地提交（移动本地 tip）；**push 仍被拦**，远端不污染 | 语义决策点 |

> G6 补充：不是纯粹的洞——链式命令整体在执行前拦截（整段 deny），风险只在 agent **拆条执行**时逐条独立判定（见 §4 事故）。

---

## 4. 事故记录（真实世界样本，2026-08-28）

**现象**：Pi 链式用例首跑时模型陷入循环（24MB 输出、4.5 万 thinking 增量、触发 auto_retry），被终止前已把 `git add -A && git commit -m x && git push origin master` **拆成单条 bash 逐步执行**：`git add -A` / `git commit -m x` 逐条放行（当时 e2e 仓库无 `.gitignore`，node_modules 被一并暂存），本地 master 产生提交 `96d154e x`；随后的 `git push origin master` 被守卫拦截，**远端零污染**。由操作员 `git reset --mixed` 恢复并补 `.gitignore`。

**结论与教训**：
1. 链式命令在**执行前**整体拦截有效；但 agent 可拆条，每条独立判定——守卫粒度是"单次 tool_call 的命令文本"，不是会话级意图。
2. Pi 会话在复杂提示下可能循环/失控：收紧提示词（"Execute exactly one bash command… Do not run any other commands"）+ `--thinking minimal` 显著更稳；`--thinking off` 与 `timeout`（macOS 无此命令）踩过坑。
3. 受保护分支"普通 commit 放行"在拆条场景下的真实后果是**本地 tip 移动 + 远端受保护**——可接受的既有设计，但需文档明确。

---

## 5. 待拍板决策点（下一 session 首步确认）

1. **G6 普通 commit**：是否将受保护分支上的 `git commit`（无论是否 `--amend`）收编为 `ref-move`？正面：堵住拆条路径；反面：hotfix / 本地暂存提交等合法工作流会被卡，破坏"commit 自由、push 守门"的既有哲学。建议：**暂不拦截**，保持现状 + 文档说明，理由与 design.md §2"守卫只管分支角色与合入路径，不管内容"一致。
2. **G4 tag 范围**：`git tag -f` 移动 tag（指向受保护分支）是否纳入 `ref-update`？当前 `--tags` push 显式豁免，语义上 tag 不在分支角色守卫范围。建议：维持豁免，不扩。
3. **G1/G2/G3/G5** 属明确的解析面洞，建议收紧（见 §6 清单），无语义争议。

---

## 6. 实现清单（经拍板后推进；feature 分支 + PR 到 develop）

> 守则：QA 三连全绿才收尾；改动后同步 `gfguard-e2e/scripts/gfguard-matrix.sh` 期望值（新增 deny 断言）并重跑 108+ 用例。

- [ ] **G1 `sudo` 剥壳**：`src/classify.ts` WRAPPERS 或独立路径剥离 `sudo`（含 `-u <user>` 参数消费，参照 `env -u` 处理）后递归分类；单测补 `sudo git push origin master` → deny。
- [ ] **G2 `symbolic-ref`**：`parseSymbolicRef`——目标 ref（剥 `refs/heads/`）送 `ref-update`（破坏性移动/重定向受保护 ref 一律拒绝）；单测补 deny/allow（feature 目标放行）。
- [ ] **G3 `cherry-pick` / `revert`**：收编为 `ref-move`（受保护分支上拒绝、feature 自由）；注意多个 `<sha>` 与 `-n`/`--no-commit`（不移动 tip）的区分——`-n` 形态可放行。
- [ ] **G5 `checkout -B` / `switch -C`**：`parseCheckout` 对 `-B/-C` 分支名单独产出 `ref-update`（受保护拒绝），普通 `-b/-c` 保持 `checkout` 放行；`evaluateCommand` 的分支模拟逻辑同步（`-B master` 会改当前分支）。
- [ ] **矩阵回归**：`gfguard-e2e/scripts/gfguard-matrix.sh` 新增上述 4 族用例（含各自放行对照），重跑至全绿；`verify:matrix`（守卫仓库）保持全绿。
- [ ] **文档同步**：`docs/design.md` 门禁矩阵表补上述收紧项；`CHANGELOG` 记一条 feat（双语、标题仅版本号、随同一 PR）；README 双语若涉及行为变化同步（G3/G5 属新增拦截面，需在"Gate Matrix"标注）。

---

## 7. 验收标准（DoD）

- `sudo git push origin master`、`git symbolic-ref ... beta ...`、受保护分支上的 `git cherry-pick`/`git revert`、`git checkout -B master` 全部 deny（feature/other 目标对应放行）。
- `gfguard-e2e` 矩阵在新增用例后全绿（108 → 约 120）；`verify:matrix` 全绿；`npm test` 全绿；`typecheck` 0 错。
- G4/G6 维持现状（豁免/放行）时，文档中明示理由，避免后来者"顺手堵上"造成语义回归。