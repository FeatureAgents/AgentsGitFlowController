# Handoff — 内置默认配置 + 各客户端默认 hooks（零门槛开箱即用）

> **性质**：设计 + 交接文档。供下一个 session 直接接着做"**内置默认配置 / 开箱即用** + **每客户端默认 hooks**"。
> **基线**：`origin/develop` @ `v0.0.18`（Pi 客户端已并入；`verify:matrix` 36 PASS）。
> **参考**：`docs/design.md`（现行设计规格，角色驱动模型）；`.agents/hooks/references/*.md`（六客户端协议与文件位置，**已核实**）。
> **项目纪律**：中文沟通；代码注释中文；日志/异常英文；Conventional Commits（PR 标题正文英文）；一分支一 PR；本地 develop 零变更；逻辑改动 QA 三连（`typecheck` 0 错 + `npm test` 全绿 + `npm run verify:matrix` 全绿）。

---

## 0. 已定稿的方向（本次确认）

- **默认保护范围**：内置默认配置默认保护 **`develop`（integration）+ `main`（archive）**。
- **覆盖语义**：用户 `gitflow-guard.config.json` 存在时**深度合并覆盖**默认（只写想改的字段，其余沿用默认）。
- **不做 `init` 子命令**：自定义直接用 README 覆盖说明。
- **新增**："每客户端默认 hooks"→ 随包内置各客户端 hook 模板 + `gitflow-guard wire --client <name>` 落位命令。

---

## 1. 问题（为什么做）

平台接入已经很广（DSH / Claude Code / Codex / OpenCode / Antigravity / Pi），但上手门槛高，装完即弃：

- **配置**：现状 opt-in 且 `branches.integration` 必填、无默认 → 不写配置就整体不生效。
- **接线**：6 客户端里，4 个（Claude/Codex/OpenCode/Antigravity）要手动往各自 hook 配置文件写条目（路径/格式/协议各不相同），Pi 要手动拷扩展文件，只有 DSH 一条命令。
- 结果：**配置复杂 + 每客户端手动接线** → 用户流失。

**目标**：让用户"安装后、或按指引设一次后，即可正常用"。把**默认配置**和**每客户端默认 hooks**都做成一等公民。

---

## 2. 目标 / 非目标

### 2.1 目标
1. **配置零门槛可跑**：内置默认配置始终提供可用基线；用户 config 深度合并覆盖。
2. **每客户端一条命令可接**：内置 hook 模板 + `wire --client` 自动落位；DSH/Pi 天然零接线。
3. **可覆盖、可关闭**：自定义=建/改 config；不要=`enabled:false`（或克隆后手动去 hook）。
4. **不破坏既有哲学**：角色驱动、平台无关、可解释、可审计、非安全边界（design.md §2）。
5. **中英双语**：默认 config 带双语注释；`wire` 文案走 i18n（en/zh）；README 双语结构对等。

### 2.2 非目标
- 不做"角色由项目声明"的反转——默认是**保守示意**，不强加约定。
- 不做 CI 硬门禁、多机状态同步、主动弹窗；不替代 AGENTS.md/Skill 软层。
- 不新增平台 wire 协议（`platform.ts` 协议本体不动）。

---

## 3. 现状事实（实现侧）

### 3.1 配置（`src/config.ts`）
- `CONFIG_FILE='gitflow-guard.config.json'`；`DEFAULT_CONFIG={enabled:false, featurePattern:'feature/[\\w-]+', ci:{enabled:true}, locale:'en'}`（**不含 branches**）。
- `loadConfig`：ENOENT → 未启用；JSON 坏 → 保守提取 `strict`。
- `mergeConfig`：`integration` 缺失 → error（整份 null）；preview/production/archive 可选；production/archive 默认 `mergeBy:'user'`，integration/preview 默认 `update:'pr'`。
- **注意**：改默认会导致现有"无 config=关闭"的测试与语义变化，需同步改（见 §7 测试）。

### 3.2 各客户端接线（`.agents/hooks/references/*.md`，已核实）
| 客户端 | 注册方式 | 文件/命令 | 协议 |
|---|---|---|---|
| DSH | 进程内插件 | `dsh plugin add`（自动挂载 `dsh.bundle.patch`） | 返回值 `{kind:'deny',reason}` |
| Claude Code | stdin hook | `.claude/settings.json` → `hooks.PreToolUse[]` | exit 2（stderr=原因） |
| Codex | stdin hook | `.codex/hooks.json`（或 config.toml） | exit 0 + stdout JSON（`hookSpecificOutput`） |
| OpenCode | stdin hook | `.opencode/hook/hooks.yaml`（**yaml，非 opencode.json**） | exit 2 |
| Antigravity | stdin hook | `.agents/hooks.json`（项目级） | exit 0 + `{decision,reason}`（实验支持） |
| Pi | 进程内扩展 | 拷 `pi/gitflow-guard.ts` → `.pi/extensions/` + `.pi/settings.json` | 返回值 `{block:true,reason}` |

> 说明：Claude 命令用 `${CLAUDE_PROJECT_DIR}/bin/...`；OpenCode 用 `$OPENCODE_PROJECT_DIR`（dogfood 假设）；Codex/Antigravity 用相对 `bin/...`。`wire` 必须按平台生成对的环境变量前缀。

---

## 4. 设计

### 4.1 内置默认配置（开箱即用的行为基线）
- `DEFAULT_CONFIG` 补上 `branches`：

```jsonc
{
  "enabled": true,                // 由默认开启，用户可关
  "featurePattern": "feature/[\\w-]+",
  "branches": {
    "integration": ["develop"],   // 禁直推、走 PR/MR（update: pr）
    "archive": ["main"]           // 禁直推/合并；mergeBy: user（敏感合并在人）
  },
  "locale": "en",
  "strict": false
}
```

- **`enabled` 默认 `true`**：无 config 也生效（这是"安装即用"的关键）。`main` 作为 archive（敏感、由你合并），`develop` 作为 integration。
- **深度合并覆盖**：用户 config 存在时按字段并入默认——`enabled`（默认 true）/`featurePattern`/`branches`（写到的角色覆盖，缺省角色沿用默认）/`locale`/`ci`/`strict`。用户只写 `{ "branches": { "production": ["release-*"] } }` 也能在默认基础上叠加。
- **关闭路径**：`enabled:false`（快速退出）；README 醒目标注。

> ⚠️ 因默认保护 `main`，**只往 `main` 直推、无多分支流程的 trunk/单分支用户**，装上后第一次就会被拦。这是已接受的取舍（你选了"保护 develop+main"），必须用**强提示 + 易关闭**兜住：README 显著位置说明 + `status` 输出"当前使用默认配置，`main` 受保护；如为 trunk 请 `enabled:false` 或改角色"。

### 4.2 各客户端默认 hooks（`gitflow-guard wire`）
- **随包内置 hook 模板**（`hooks/` 下）：`claude.json`（`.claude/settings.json`）/`codex.json`（`.codex/hooks.json`）/`opencode.yaml`（`.opencode/hook/hooks.yaml`）/`antigravity.json`（`.agents/hooks.json`）/`pi/gitflow-guard.ts`（已存在）。
- **新增子命令**：`gitflow-guard wire --client <dsh|claude|codex|opencode|antigravity|pi> [--project|--global] [--unwire] [--dry-run] [--repo <path>]`
  - 行为：读取/合并对应客户端 hook 配置文件，**非破坏性**地加入（已存在则跳过/去重）；`--unwire` 移除；`--dry-run` 只打印将要写入的内容；文案走 i18n。
  - `--client dsh` / `pi`：不写配置文件（进程内），仅打印接入引导。
  - **安全**：写入用户客户端配置文件属"仓库外写端"，须 `--dry-run` + 输出 diff + `--yes` 确认；OpenCode 是 YAML，落位以"语义id"判重。
- **Antigravity 实验支持**：`wire --client antigravity` 标注"实验支持"，仅按官方文档落位，提示真机核验。

---

## 5. 推荐落地（与你已定方向一致）

1. **配置**：内置默认（develop+main、enabled:true）+ 深合并覆盖 + 不做 init。→ 装上即用；自定义=写/改 config。
2. **接线**：内置各客户端 hook 模板 + `gitflow-guard wire`。→ 每客户端一条命令接好；DSH/Pi 天然零接线或仅提示。
3. **文档**：README Quick Start 主路径改为"安装 → 某客户端 wire（或 DSH 直接 add）→ 默认配置已生效 → 演示拦截"；配置段改为"内置默认 + 覆盖说明 + 关闭路径"。

---

## 6. 关键决策点（请下一 session 首步确认）

1. 默认 `main` 用作 **archive**（并入/合并由你点）还是 **production**？建议 archive（与仓库自身 dogfood 一致：develop=integration、main=archive）。
2. `enabled` 默认 `true` 是否接受（= 从"无 config 关闭"翻转为"无 config 开启"）？这会改现有测试假设，确认后需同步改测试。
3. `wire` 默认作用域：项目级还是全局？建议项目级（不污染 `~/.codex` 等）。
4. 内置 hook 模板放包内（`files` 需加）还是仅作为 `wire` 的代码内模板？建议包内模板文件，可被用户直接拷贝。
5. Antigravity（实验支持）是否纳入 `wire` 第一批，还是暂缓？

---

## 7. 实现清单（新 session 照此推进）

> 守则：QA 三连全绿才收尾；逻辑改动用 feature 分支 + PR（英文标题）到 develop；本地 develop 零变更。

- [ ] **`src/config.ts`**：`DEFAULT_CONFIG` 补 `branches`（develop=integration / main=archive）且 `enabled:true`；`mergeConfig` 改为**深度合并**（用户字段覆盖默认，角色级合并），保留 `validateConfig`；注释默认已启用语义。
- [ ] **`src/types.ts`**：如需加 `ClientId`（wire 目标枚举）或 `defaults` 开关则同步。
- [ ] **`src/cli.ts`**：新增 `wire` 子命令（`--client/--unwire/--dry-run/--yes/--repo`）；`status` 输出增加"当前为内置默认 / main 受保护 / 如何关闭"引导。
- [ ] **`src/i18n.ts`**：新增 wire/默认配置引导 MESSAGE_KEYS（en/zh）：成功/跳过/移除/需确认/已存在/默认启用/trunk 关闭引导。
- [ ] **hook 模板**：新建 `hooks/{claude,codex,opencode,antigravity}.{json|yaml}`（含各平台正确命令前缀与协议）；复用 `pi/gitflow-guard.ts`。
- [ ] **测试 `tests/config.spec.ts`/`tests/cli.spec.ts`**：无 config=默认生效（develop/main 受保护）；深合并（只写 production 也叠加默认、integration 仍在）；`enabled:false` 关闭；trunk（仅 main）默认提示；`wire` 幂等、`--unwire`、`--dry-run`、OpenCode yaml 落位；`wire dsh/pi` 只提示。
- [ ] **文档 `README.md`/`README.zh.md`**：Quick Start 改主路径（安装 → 客户端 wire/DSH add → 默认已生效 → 演示拦截）；配置段改"内置默认 + 覆盖 + 关闭"；新增"各客户端默认 hooks（wire）"表；显著标注"main 默认受保护；trunk 用户请关闭"。保持中英结构对等。
- [ ] **打包 `package.json`**：`files` 加 `hooks/`；keyword/description 如需提 zero-config / wire / 开箱即用则同步。
- [ ] **`CHANGELOG.md`**：下版记一条 feat（中英双语，标题仅版本号，随同一 PR）。
- [ ] **`scripts/verify-matrix.mjs`**：若默认配置/深合并不改变 wire 协议则一般不动；至少保持 36 PASS；若新增客户端 wire 落位断言则相应补。
- [ ] **可选 `docs/design.md`**：`§2.1/§2.2` 补"内置默认配置 + 每客户端默认 hooks"，并更新"opt-in"措辞。

---

## 8. 约束与风险

- **默认保护 `main` 会误伤 trunk/单分支用户**——必须强提示 + 易关闭（`status` 引导 + `enabled:false` + README 显著位置）。这是最大反噬风险。
- **翻转 `enabled` 默认 = 改现有"无 config=关闭"语义**，会波及 `index.ts`（evaluateCommand）与现有测试；务必全矩阵回归。
- **`wire` 写用户客户端配置文件**（仓库外写入）——必须 `--dry-run` + diff + `--yes`，幂等、不覆盖已有 hook；OpenCode YAML 需语义级去重；Antigravity 实验支持降级标注。
- **非安全边界**：默认开启（尤其保护 main）会让人误以为"有绝对保护"——文档与 `status` 输出持续提示"流程守卫，非安全边界；服务端分支保护仍要开"。
- 所有新文案走 i18n；`verify:matrix` 的 zh-locale 回归可能需补 `wire`/默认配置分支。

---

## 9. 验收标准（DoD）

- **配置**：新仓库无 config → 默认生效，`git push origin develop` 被拦（integration）、`git push origin main` 被拦（archive）；用户写 `{ "branches": { "production": ["release-*"] } }` → 在默认基础上叠加且 integration 仍受保护；`enabled:false` → 关闭。
- **接线**：`gitflow-guard wire --client claude` 两次不重复（幂等）、`--unwire` 移除、`--dry-run` 只打印；`dsh`/`pi` 只输出引导；OpenCode yaml 正确落位。
- **文档**：README 双语 Quick Start 与"默认配置+wire"表在结构上对等；显著标注"main 默认受保护，trunk 请关闭"。
- **QA 三连**全绿；CHANGELOG 下版双语一条 feat；发布按现有 tag 流程（tag 从合并后 develop tip 打）。