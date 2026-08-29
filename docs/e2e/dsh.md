# DSH 实机测试用例

> 进程内插件:`dsh plugin add` → `patch.yml` 挂载 → `apply()` 监听 `tools/pre-execute`,deny 以返回值 `{kind:'deny', reason}` 表达。
> 实现细节见 `docs/design/dsh.md`;协议见 `.agents/hooks/references/dsh.md`。

## 前置条件

- 守卫已装进 DSH profile:`npm run build && node scripts/install-dsh.mjs <profile>`(默认 web),**重启 DSH 生效**。
- 当前会话所在 profile 确认插件挂载版本(`~/.dsh/profiles/<profile>/node_modules/agents-gitflow-guard/package.json` 的 version 应等于被测版本)。
- 受控测试仓库(见总览),我们在其中执行 bash 工具命令,守卫随 `tools/pre-execute` 触发。
- DSH 插件只拦 `toolNames`(`pwsh`/`bash`)且命令文本含 git 系操作;非 git 仓库不触发。

## 用例

### A. 真实拦截(deny)

| ID | 命令(在受控仓库执行) | 前置分支 | 期望 | 断言要点 |
|---|---|---|---|---|
| DSH-A1 | `git push origin master` | master | 整段不执行 | 工具返回 deny 理由;`origin/master` sha 不变;审计出现 deny 条目 |
| DSH-A2 | `git push --force origin master` | master | 整段不执行 | 同上 |
| DSH-A3 | `git branch -D beta` | master | 整段不执行 | beta(ref 本地)不消失;deny 理由含 branch 删除 |
| DSH-A4 | `git merge fix/verify-01` | master | 整段不执行 | 工作树/HEAD 不变化(merge 未发生,无 merge 提交) |
| DSH-A5 | `git add -A && git commit -m x && git push origin master` | master | 整段执行前拦截 | 无新提交、无暂存副作用、远端未动 |
| DSH-A6 | `sudo git push origin master` | master | 整段不执行 | sudo 剥壳后仍判 deny(0.0.19 修复面) |
| DSH-A7 | `git checkout -B master` | fix/verify-01 | 整段不执行 | 当前分支未被强制重建为 master |
| DSH-A8 | 受保护分支上 `git symbolic-ref refs/heads/beta refs/heads/master` | master | 整段不执行 | beta 符号引用未被改写(0.0.19 修复面) |
| DSH-A9 | 受保护分支上 `git cherry-pick <sha>` | master | 整段不执行 | HEAD 不产生新提交(0.0.19 修复面) |

### B. 真实放行(allow)

| ID | 命令 | 前置分支 | 期望 | 断言要点 |
|---|---|---|---|---|
| DSH-B1 | `git push origin fix/verify-01` | fix/verify-01 | 真实执行 | 远端真实创建 `origin/fix/verify-01` |
| DSH-B2 | `git merge beta` | master | 真实执行 | 产生真实 merge 提交(受保护分支间合入合法) |
| DSH-B3 | `git commit --amend -m x` | fix/verify-01 | 真实执行 | 本地 feature tip 改写成功 |
| DSH-B4 | `npm test` | 任意 | 真实执行 | 非 git 命令放行 |
| DSH-B5 | `git push --tags origin` | master | 真实执行 | tags 推送豁免(设计内) |

### C. 接线(进程内客户端,无 hook 文件)

| ID | 操作 | 期望 |
|---|---|---|
| DSH-C1 | `gitflow-guard wire --client dsh` | 仅打印接入引导(`dsh plugin add` 说明),不写文件 |
| DSH-C2 | `gitflow-guard status` | 输出守卫状态与角色分支列表(接线提示不含 dsh) |

### D. 平台特有

| ID | 用例 | 说明 |
|---|---|---|
| DSH-D1 | 审计留痕 | 触发一次 deny 后,`gitflow-guard audit` 出现对应 deny 条目(用户级状态目录,agent 沙箱可写区之外) |
| DSH-D2 | 非 git 仓库不触发 | 在非 git 目录执行 `git init` 前/后对照:无 config 仓库默认配置生效(0.0.20 起无 config 也保护 develop+main) |
| DSH-D3 | 插件版本核对 | 执行会话实际走的守卫版本 = 被测版本(防 0.0.11 式挂载漂移) |

## 运行方式

- 人工/智能体在受控仓库执行上表命令,记录工具返回、远端 ref 前后、审计输出。
- 无脚本自动化(依赖真实 DSH 进程);DSH-D1 的证据可从 `~/.local/state/gitflow-guard/repos/*/audit.jsonl` 直接取证。