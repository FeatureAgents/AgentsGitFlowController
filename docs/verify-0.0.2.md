# 验证报告 — agents-gitflow-guard@0.0.2（普通用户路径端到端）

> ⚠ **历史文档(0.0.2 时点报告)**: 本文记录 0.0.2 发布时的验证结论; §3.4 描述的是 0.0.9 归档策略反转前的行为(当时 agent 创建指向 archive 的 PR 也会被拦), 仅作历史留痕——现行门禁行为以双语 README 的门禁矩阵为准。
> 目的：用 **普通用户视角**（npx 发布版 CLI + 从 npmjs 安装发布包）验证「装得上、挂载得上、能拦截」，且 `npm test` 全绿、`tsc --noEmit` 零错误。
> 验证日期：2026-08-20。

## 1. 结论

- ✅ registry 状态正确：`latest = 0.0.2`，`versions = [0.0.1, 0.0.2]`，0.0.2 于 2026-08-19 15:41 UTC 发布。
- ✅ 发布产物核心逻辑：直接调用 registry 装的 `evaluateCommand`，10 条判定矩阵 **10/10 全对**。
- ✅ 端到端：全新隔离 `DSH_HOME` → `npx @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile headless add agents-gitflow-guard@^0.0.2`（从 npmjs 安装）→ headless 一键任务触发 `git push origin develop` → **`[gitflow-guard] blocked:` 拦截** + 审计 `deny` 落盘。
- ⚠️ 本机发现一枚环境问题（与发布包无关）：`pnpm add agents-gitflow-guard`（裸装）在本机走本地 HTTPS 镜像时命中陈旧 packument，解析为 0.0.1。对策见 §6。

## 2. 环境

- DSH CLI（发布版）：`@deepseek-ai/dsh@0.1.0-rc.7`（npmjs，bin=`dsh`）
- 隔离 DSH_HOME：`/tmp/gf-consumer`（模拟全新用户；结束时清除）
- 测试仓库：`/tmp/gf-logic/t1`（develop 为主分支 + main 归档；已配 `gitflow-guard.config.json`）
- Node v24 / pnpm 11.7 / npm 11.17

## 3. 步骤与结果（可复现）

### 3.1 隔离环境

```bash
export DSH_HOME=/tmp/gf-consumer
export npm_config_cache=/tmp/gf-npmcache
cp ~/.dsh/settings.yaml $DSH_HOME/settings.yaml
cp ~/.dsh/.credentials.yaml $DSH_HOME/.credentials.yaml   # 仅供临时实例调 LLM
```

### 3.2 普通用户安装动作（npx 发布版 CLI + npmjs 安装）

```bash
npx --yes @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile headless add 'agents-gitflow-guard@^0.0.2'
```

- 输出：`dsh: initialized profile headless ...` → `+ agents-gitflow-guard@0.0.2` → `Done in 1.9s`
- 校验：`profiles/headless/package.json` 的 `dsh.profile.bundles` 自动写入
  `["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless", "agents-gitflow-guard"]`；
  `node_modules/agents-gitflow-guard/package.json` version = **0.0.2**。

### 3.3 端到端拦截（headless 一键任务）

```bash
cd /tmp/gf-logic/t1
npx --yes @deepseek-ai/dsh@0.1.0-rc.7 --profile headless "执行 git push origin develop 并原样报告输出"
```

模型实际执行的回执（0.0.2 原样，当时默认文案为中文）：

```
Error: [gitflow-guard] 已拦截: 受保护分支「develop」禁止直推
下一步: 集成分支(develop)由 PR/MR 合入 feature: 先推 feature 分支, 再 gh pr create --base develop / glab mr create --target-branch develop
```

- 审计留痕 `.git/gitflow-guard/audit.jsonl` 出现 3 条 `deny`（模型重试 3 次均被拦）。
- 推送从未到达远端；目标仓库无 remote，即使放行也是本地 no-op，全程零副作用。

> 注：0.0.3 起默认文案改为英文（见 §5），拦截输出将变为：
> `Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push`
> `Next: Integration branch (develop) is updated via PR/MR …`

### 3.4 核心逻辑判定矩阵（对发布产物直接调用）

| 分支 | 命令 | 期望 | 结果 |
|---|---|---|---|
| develop | `git push origin develop` | deny | ✅ 受保护分支禁直推 |
| feature/x | `git push origin feature/x` | allow | ✅ |
| develop | `git push origin main` | deny | ✅ |
| develop | `git merge feature/x` | deny | ✅ 集成分支须 PR/MR |
| develop | `git merge main` | allow | ✅ 受保护分支间同步（设计） |
| develop | `git branch -D main` | deny | ✅ |
| feature/x | `gh pr create --base main` | deny | ✅ 归档不收 PR 源 |
| feature/x | `gh pr create --base develop` | allow | ✅ |
| develop | `git checkout -b feature/y` | allow | ✅ |
| develop | `echo hi` | allow | ✅ 非 git 命令快路径 |

## 4. 本地测试与类型检查

```bash
npm test        # vitest run —— 全绿
npm run typecheck   # tsc --noEmit —— 0 Error
```

## 5. i18n 说明（0.0.3 起）

- 默认文案语言：`en`（英文）。
- 项目级切换：`gitflow-guard.config.json` 里加 `"locale": "zh"` 恢复中文。
- 覆盖范围：agent 可见的拦截文案、`gitflow-guard` CLI 的 status/audit/check 输出。
- 说明：配置文件校验报错属开发者诊断信息，固定英文。

## 6. 已知环境问题（非包缺陷）

本机 `registry.npmjs.org` 被本地 HTTPS 代理（`198.18.0.135`）接管，pnpm 的 `add` 路径命中陈旧 packument，导致：

```bash
pnpm add agents-gitflow-guard        # → 解析成 0.0.1（本机镜像缓存问题）
pnpm add agents-gitflow-guard@^0.0.2 # → 0.0.2 ✓（显式版本，推荐对外文档写法）
```

干净机器/新 npm 缓存不受影响；npm 侧 `npm install agents-gitflow-guard@latest` 在本机即可正常取到 0.0.2。

## 7. 清理

隔离环境全部位于 `/tmp`，可直接删除：

```bash
rm -rf /tmp/gf-consumer /tmp/gf-npmcache /tmp/gf-pnpm-* /tmp/gf-logic /tmp/gf-* /tmp/gf-store-*
```
