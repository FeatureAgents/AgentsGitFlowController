# 让 AI 智能体真正走 GitFlow：从软规则到硬机制

> **项目**：[agents-gitflow-guard](https://github.com/FeatureAgents/AgentsGitFlowController) · MIT · npm：`agents-gitflow-guard`

---

## 为什么智能体总是不守 GitFlow？

你让 AI 智能体在仓库里干活：开发一个登录页。指令文件里写得很清楚——"在 feature 分支上开发，从 PR 合入 develop，main 由你手动归档"。然后它把代码直接 `git push origin develop` 了。

不是它坏，是**软规则对模型来说是可选的**。系统提示、AGENTS.md、CLAUDE.md 里的流程约定，本质都是"建议"；而模型每一轮都可能"忘记"或"精简"掉它。这不是纪律问题，是机制问题。

那服务端分支保护呢？能挡 push，但挡不住本地行为，也覆盖不了没有服务器保护的场景；而且它不是"教"智能体走正确流程，只是事后拒绝。

## 思路：把软规则变成执行前检查

[agents-gitflow-guard](https://github.com/FeatureAgents/AgentsGitFlowController) 的做法是：在智能体执行任何 git 操作**之前**，对照你配置的"分支角色"做裁决。允许就放行；违背角色就拒绝，并在拒绝消息里给出原因和下一步。你定义仓库自己的角色——不需要约定俗成的分支名：

```jsonc
// gitflow-guard.config.json
{
  "featurePattern": "feature/[\\w-]+",
  "branches": {
    "integration": ["develop"],   // 合入只走 PR/MR，受保护
    "preview": ["preview-.*"],
    "production": ["release-.*"], // 出版本，agent 无权合并
    "archive": ["main"]           // 发布后由你手动归档
  }
}
```

- `integration` 是唯一必填角色，其余可选、可正则；
- 拦截发生在执行前：对受保护角色的直接 push / force-push / 删除，以及 agent 对生产/归档分支的合并；
- 每次拒绝都会写入**仓库之外**的审计日志（`~/.local/state/gitflow-guard/`），不会被 agent 的读写顺手抹掉；
- 中文错误提示：配置 `"locale": "zh"` 即可。

## 30 秒用上

```bash
dsh plugin --profile web add agents-gitflow-guard
```

重启 DSH，放上配置文件，然后让 agent `git push origin develop`——你会看到：

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch:
push the feature first, then `gh pr create --base develop`.
```

## 一个完整的流程走查

| 步骤 | agent 行为 | 守卫决定 |
|---|---|---|
| 建 feature 分支、提交、推送 | `git push -u origin feature/login-page` | ✅ 放行 |
| 直接把功能合进 develop | `git merge feature/login-page` | 🚫 拒绝，走 PR |
| 建 PR | `gh pr create --base develop` | ✅ 放行 |
| 动 main / 生产分支 | 任何合并、推送 | 🚫 拒绝 |

你看到的画面是：agent 的每个"想偷懒"的时刻都被结构性地堵住，而敏感合并仍然留在你的手上——你点击合并的那一刻，就是确认。

## 诚实边界（这也是多数工具不写的一段）

- **不是安全边界**：命令解析是尽力而为，处心积虑混淆命令的 agent 理论上可以绕过——所以 GitHub/GitLab 服务端分支保护应当叠加开启；
- **CI 状态只是参考**，不当作硬门禁；
- **trunk 流程不适合**：大家都往一条分支合并的话，它只会到处拦截；
- **GitHub Copilot 不在支持范围**：官方原生权限体系 + rules 已覆盖该场景，不为它造半个 hook（README 有完整说明）。

## 生态与兼容

同一套核心同时服务六个平台：DSH（插件协议）、Claude Code、Codex、OpenCode、Antigravity（stdin hook 协议，README 有各平台配置示例）、Pi（进程内扩展协议）。MIT 协议，全套单元测试与跨平台复测矩阵全绿，发布在 npm（`agents-gitflow-guard`）。

如果你经历过一次"agent 把代码推进了 develop/main"，这东西一次就能值回票价；没有经历过的团队，也不妨在引入 agent 协作之前先装上——规则先于事故。

---

> 反馈 / 建议：GitHub Issues · [仓库](https://github.com/FeatureAgents/AgentsGitFlowController) · npm：`agents-gitflow-guard`
