# Handoff — 内置默认配置（零门槛开箱即用）

> **性质**：设计 + 交接文档。供下一个 session 直接接着做"内置默认配置 / 安装后立即可用"这件事。
> **基线**：`origin/develop` @ `v0.0.18`（Pi 客户端已并入；`verify:matrix` 36 PASS）。
> **参考**：现行设计规格 `docs/design.md`（角色驱动模型，v0 许可制已被取代）；`docs/issues.md`（审查底稿）。
> **项目纪律**：中文沟通；代码注释中文；日志/异常英文；Conventional Commits（PR 标题正文英文）；一分支一 PR；本地 develop 零变更；逻辑改动 QA 三连（`typecheck` 0 错 + `npm test` 全绿 + `npm run verify:matrix` 全绿）。

---

## 1. 问题（为什么做）

平台接入已经很多（DSH / Claude Code / Codex / OpenCode / Antigravity / Pi），但**上手门槛高**，会导致大量用户装完即弃：

- 配置是 **opt-in**：仓库根没有 `gitflow-guard.config.json` 就**完全不生效**（`src/config.ts` 的 `loadConfig` ENOENT → 未启用）。
- 要生效必须 `enabled: true` **且** `branches.integration`——这是**唯一必填角色且无默认**（`mergeConfig` 里缺失就报 `branches.integration is required`，整份配置作废）。
- 用户得自己决定角色映射 / 分支名 / 规则；六客户端又各自有一套安装+接线。**配置复杂 + 无默认** → 装完就流失。

**一句话目标**：让用户"安装后、或按指引设一次后，即可正常用"。把**默认配置**作为一等公民。

---

## 2. 目标 / 非目标

### 2.1 目标
1. **零门槛可跑**：缺省也能有合理行为，或一条命令生成一份可用的配置。
2. **不破坏现有哲学**：角色驱动、平台无关、可解释、可审计、非安全边界（design.md §2.1/§2.2）。
3. **不吓退 trunk / 单分支用户**：默认行为要保守、可关闭、可说明；不默认把 `main` 直推拦死。
4. **中英双语**：配置示例、`init` 交互、文案走 i18n（en/zh）；默认 config 带双语注释。

### 2.2 非目标
- 不做"角色由项目声明"哲学的反转——默认只给**保守示意**，不是强加约定。
- 不做 CI 硬门禁、多机状态同步、主动弹窗；不替代 AGENTS.md/Skill 软层。
- 不新增平台 wire 协议（不碰 `platform.ts` 的协议本体；只有新增**客户端**才动它）。

---

## 3. 现状事实（实现侧，对照）`src/config.ts` / `src/cli.ts`

- `CONFIG_FILE = 'gitflow-guard.config.json'`；`DEFAULT_CONFIG = { enabled:false, featurePattern:'feature/[\\w-]+', ci:{enabled:true}, locale:'en' }`——**不含 branches**。
- `loadConfig`：文件缺失 → 未启用；JSON 整体损坏 → 保守提取 `strict`。
- `mergeConfig`：`integration` 缺失 → error（整份 config 为 null）；preview/production/archive 可选；production/archive 默认 `mergeBy:'user'`，integration/preview 默认 `update:'pr'`、`mergeBy:'anyone'`。
- `validateConfig`：integration.branches 非空、featurePattern 合法、角色条目不重叠。
- CLI 子命令目前只有 `status` / `audit` / `check`（**无 `init`**）；`check --platform <name>` 是 hook 门禁。
- 安装面：README 已有六平台安装表；dogfood 配置 `.claude/settings.json`、`.codex/hooks.json`、`.agents/hooks.json`。

---

## 4. 候选方案

### 方案 A：随包内置一份"可直接用"的默认 config 文件
包 `files` 带 `configs/default.json`，README 直接贴，用户复制到项目根。
- 优点：零开发、零风险、不动运行时。
- 缺点：仍是"手动复制一个文件"；"安装后即可用"不成立（还要一次手动）。

### 方案 B：无 config 时用内置默认（接近 default-on）
`loadConfig` 在 ENOENT 时返回**内置默认 config**（而非 null），且默认 `enabled:true` + 保守角色。
- 优点：装上就生效，最贴合"安装即可用"。
- 缺点：**违背** design.md §2 的 opt-in 与非安全边界的姿态；对 trunk 用户可能误拦；需要强 disable 路径。
- 缓解：默认角色保守（只保护明显存在且约定的分支）+ `disable` / `enabled:false` + 文档醒目标注。

### 方案 C：新增 `gitflow-guard init [--preset solo|enterprise|trunk] [--interactive] [--force]`
在项目根生成一份完整、可用的 `gitflow-guard.config.json`（带双语注释、合理默认角色）。
- `solo`：`develop`=integration、`main`=production、`archive` 可选。
- `enterprise`：多环境（preview/production/archive 齐备）。
- `trunk`：`main`=integration、无 archive（不拦 main 直推）。
- 也支持无参交互问 2–3 问（integration / 是否有 archive / locale）。
- 优点：保持 opt-in + 角色驱动哲学，把"写对配置"变成"一条命令"，错误率大降，可 i18n。
- 缺点：比方案 B 多执行一步；需设计文件内容 + i18n 键 + 测试。

### 方案 D：README 一键粘贴 + `status` 校验引导
README Quick Start 改为"贴这份默认 config" + `gitflow-guard status` 校验，输出下一步。
- 优点：零开发；缺点：仍是手动。

---

## 5. 推荐（组合，可分批）

**主推：C（`init` 脚手架） + A（随包一份完整默认 config 作为 `init` 模板来源 / README 展示）。**

理由：
- 最贴合"**按指引设置一次即可用**"：`gitflow-guard init` 一次生成即可用，且生成结果一定通过现有校验。
- 不破坏 design.md 的 opt-in、角色驱动、非安全边界；**不影响 trunk 用户**（trunk 用 `--preset trunk` 或直接 disable）。
- config 是**六平台共享的一份**——把这"一份"做成"init 生成 + 有语义默认"，就一次性解决所有客户端的上手问题。
- 方案 B（default-on）作为**可选项**：通过 `"defaults": true`（或独立开关）显式开启、默认关闭。如此既有"安装即可用"（B 开启后）的路径，又**不**强加给 trunk 用户，且与"非安全边界"姿态一致。

---

## 6. 推荐默认 config 内容（`init` 生成 / 内置模板）

```jsonc
{
  "enabled": true,               // opt-in，但由 init 打开
  "featurePattern": "feature/[\\w-]+",
  "branches": {
    "integration": ["develop"],  // 需求合入走 PR/MR（update: pr）
    "production": ["main"],      // 出版本由你合并（mergeBy: user）
    "archive": ["archive"]       // 可选；无 archive 分支可去掉
  },
  "locale": "en",                // 或 "zh"
  "strict": false                // 保持 fail-open；高风险仓库自行改 true
}
```

- **默认不用 `integration=main`**——避免把"直接推 main 的 trunk 用户"拦死；trunk 用 `--preset trunk`（`integration:["main"]`、无 archive）。
- 角色条目仍为数组/对象、无重叠；featurePattern 默认。这是**保守示意**，不是强制约定。

---

## 7. 关键决策点（需要你 / 下一 session 拍板）

1. 默认角色映射 `integration=develop, production=main, archive=optional` 是否可接受？trunk 是否接受 `--preset trunk`？
2. 是否引入可选的 `"defaults": true`（方案 B 开关）？**默认开还是关**？
3. `init` 是交互式（2–3 问）还是纯 `--preset`？是否要 `--force` 覆盖已有 config？
4. 默认 config 的 `strict` 保持 `false`（与现状一致）？
5. 未来若再加新客户端，是否也走同一 `init` / 默认路径（建议：是，集中体验、一处维护）。

---

## 8. 实现清单（新 session 照此推进）

> 守则：QA 三连全绿才收尾；逻辑改动用 feature 分支 + PR（英文标题）到 develop；本地 develop 零变更。

- [ ] **`src/config.ts`**：新增 `DEFAULT_BRANCHES`（保守默认）与 `buildDefaultConfig(preset, opts)` 纯函数（solo/enterprise/trunk + locale），返回完整 `GuardConfig`；`mergeConfig` 复用其校验，保证 init 产物必过 `validateConfig`。如需 `defaults` 开关则并入（决策点 2）。
- [ ] **`src/cli.ts`**：新增 `init` 子命令：`gitflow-guard init [--preset <solo|enterprise|trunk>] [--interactive] [--force] [--locale <en|zh>] [--repo <path>]`。行为：无 `CONFIG_FILE` → 写 `buildDefaultConfig(preset)`（带注释）；文件已存在且非 `--force` → 报错退出；写完提示"用 `gitflow-guard status` 校验"；文案走 i18n。
- [ ] **`src/i18n.ts`**：新增 init 相关 MESSAGE_KEYS（en/zh）：提示 / preset 名 / 覆盖警告 / 成功 / 下一步引导。
- [ ] **`src/types.ts`**：`type Preset = 'solo'|'enterprise'|'trunk'`；如走 `defaults` 开关则加字段。
- [ ] **测试 `tests/config.spec.ts` / `tests/cli.spec.ts`**：init 生成文件可通过 `validateConfig`；ENOENT 默认行为按决策点；各 preset 内容断言；`--force` 覆盖；`--preset trunk` 不拦 main 直推（回归 gate 行为）。
- [ ] **文档 `README.md` / `README.zh.md`**：Quick Start 主路径改为 安装 → `gitflow-guard init` → `status` 校验 → 拦截演示；补"默认配置 / 预设一览"表；"多客户端"段并入"配置是共享一份"；补 `enabled:false` 退出路径。保持中英 41:41 结构对等。
- [ ] **打包 `package.json`**：`files` 若内置模板（如 `configs/`）则加；`keywords`/description 如需提 zero-config / 开箱即用则同步（按 §8 客户端清单原则）。
- [ ] **`CHANGELOG.md`**：下版记一条 feat（中英双语，标题仅版本号，随同一 PR）。
- [ ] **`scripts/verify-matrix.mjs`**：若默认配置不改变 wire 协议则一般不需要；至少保持 36 PASS，若新增 init 的 locale 分支则相应补。
- [ ] **可选 `docs/design.md`**：`§2.1/§2.2` 补一条"内置默认配置 + init"，并把"opt-in"措辞更新为"默认保守 + 显式开启（init）"（如走方案 C）。

---

## 9. 约束与风险

- **不要默认保护 `main` 直推**——这是最大 UX/反噬风险（会拦死 trunk/单分支用户）；用 `preset` 区分，默认 `integration=develop`。
- **方案 B（default-on）会违背 design.md §2 的 opt-in 与"非安全边界"姿态**；若做，务必配强 disable 路径 + README 醒目标注"这是流程守卫，不是安全边界，服务端分支保护仍要开"。
- 所有新文案必须走 i18n；`verify:matrix` 的 zh-locale 回归可能需补 init 分支。
- 改 config 装载逻辑会波及 `index.ts` 的 `evaluateCommand` 与 hook 路径，务必全矩阵回归。

---

## 10. 验收标准（DoD）

- 新用户：`dsh plugin --profile web add agents-gitflow-guard && gitflow-guard init && gitflow-guard status` → 显示 enabled、集成/生产角色、当前分支；对 `git push origin develop` 演示拦截。
- `gitflow-guard init --preset solo` 产物通过全部校验；`--preset trunk` 不拦 main 直推；`--force` 覆盖已有文件。
- 无 config 时的默认行为符合决策点 2（默认关闭=现行为，或 `defaults:true` 时保守默认）。
- QA 三连全绿；README 双语 Quick Start 与配置预设在结构上对等更新。
- CHANGELOG 下版双语一条 feat；发布按现有 tag 流程（tag 从合并后 develop tip 打）。
