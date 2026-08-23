---
name: start-work
description: Run BEFORE touching any file in this repo. Fetches origin, verifies which ref the workspace sits on, derives feature/<topic> from latest origin/develop, and shows the branch-rule digest. 在本仓库开始任何内容工作(写码/改文档/配置/提交)前必读必跑:核对基线并派生工作分支。
---

# start-work · 开工第零步(基线先行)

在本仓库开始**任何内容工作**之前执行本流程;禁止在完成基线核查前编辑任何文件。

## 步骤

1. `git fetch origin`
2. `git status --short --branch` 与 `git log --oneline -3`:确认当前分支、落后量、有无未提交改动
3. 按下表分派:

| 当前状态 | 动作 |
|---|---|
| 已在**未合并**的 `feature/*` 工作分支 | 可继续工作;develop 若前进,是否 rebase 由用户决定 |
| 在 main / 其他任何非工作分支(无论新旧) | **禁止就地编辑**。有未提交改动先 `git stash push -u` 存档;然后 `git switch -c feature/<主题> origin/develop`;stash 的旧改动禁止直接 pop 携带提交,必须逐文件对照新树重放 |
| 停在本地 develop | 「本地 develop 零变更」铁律:什么都不做,一律从 `origin/develop` 派生 |

4. 向用户报告一句结论:原分支 / 落后多少 / 本次使用的工作分支名。

## 分支规矩速览(权威全文见 AGENTS.md §4)

- 一切工作从**最新 `origin/develop`** 派生;本地 develop 零变更。
- 禁止直接 commit/push develop;develop 只经 GitHub 的 PR 合并与用户推送演进。
- **一分支一 PR,合并即弃**;禁止在已合并过的分支上追加提交(rebase 改写 SHA → 两份平行履历 → 大面积假冲突,v0.0.12 实证)。
- bump(`npm version patch`)叠加在内容分支上;CHANGELOG 用版本号标题随同一 PR;README 双语锁版本示例同步为本次版本号。
- 用户确认合并后,从合并后的 `origin/develop` tip 打 annotated tag 并推送(tag 不打在内容分支上)。

## 为什么有这一步

会话工作区可能停在任意陈旧检出上(实例:曾停在 0.0.6 时代的 main 而 develop 已到 0.0.13)。在旧基线上改文件再开 PR,轻则大面积真冲突,重则**无冲突但静默回退** develop 上已合入的功能——后者是埋雷。

> 定位说明:本技能是软约束(与 AGENTS.md 同级),负责让规则在被匹配到时**必然完整呈现**;它不提供硬拦截,机械兜底属 hook 层,另行评估。
