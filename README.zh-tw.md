# agents-gitflow-guard

> **有沒有受夠了 AI Agent 隨意跳過你的 GitFlow 合併流程？**

一個可自由配置分支角色的流程守衛，專為主流 AI 寫碼 Agent 平台而生 — 支援 [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)、[Codex](https://github.com/openai/codex)、[OpenCode](https://github.com/opencode-ai/opencode)、[Antigravity](https://github.com/google-deepmind)、[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) 與 [Pi](https://github.com/mariozechner/pi)。  
你自己定義分支 — **集成分支**（feature 經 PR/MR 合入）、**預覽分支**（環境端點）、**生產分支**、**歸檔分支** — 每個角色各自配置規則。Agent 無法跳過流程，敏感合併始終留在你手上。

[English](README.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-tw.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Русский](README.ru.md) · [授權條款](LICENSE)

[![ko-fi](https://img.shields.io/badge/ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## 目錄

- [快速上手 — 30 秒為倉庫啟用守衛](#快速上手--30-秒為倉庫啟用守衛)
- [為什麼需要 — 本外掛解決的核心痛點](#為什麼需要--本外掛解決的核心痛點)
- [適用對象 — 場景與團隊](#適用對象--場景與團隊)
- [功能特點 — 它能做什麼](#功能特點--它能做什麼)
- [局限性 — 它不能做什麼](#局限性--它不能做什麼)
- [服務端分支保護 vs 本外掛](#服務端分支保護-vs-本外掛)
- [運作機制 — 三行看懂底層原理](#運作機制--三行看懂底層原理)
- [配置參考](#配置參考)
- [門禁判定矩陣 — 攔截與放行清單](#門禁判定矩陣--攔截与放行清單)
- [人為介入與控制點](#人為介入與控制點)
- [詳細安裝指南](#詳細安裝指南)
- [常見問題 (FAQ)](#常見問題-faq)
- [術語表](#術語表)
- [路線圖 (Roadmap)](#路線圖-roadmap)
- [支援與贊助](#支援與贊助)
- [開發](#開發)
- [授權條款](#授權條款)

---

## 快速上手 — 30 秒為倉庫啟用守衛

**第 1 步 — 安裝。** 六個客戶端共用同一個 npm 套件 `agents-gitflow-guard`，依據你的 Agent 類型選擇安裝方式：

```bash
# 模式 A: CLI Hook 客戶端 (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# 模式 B: DSH 進程內外掛（安裝後重啟 DSH 生效）
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# 模式 C: Pi 進程內擴充
npm i -D agents-gitflow-guard
```

**第 2 步 — 連接客戶端（無需配置文件）。** 守衛內建 **預設保護 `develop` (integration) + `main` (archive)** — 零配置、開箱即用啟用：

```bash
# Claude Code → 當前倉庫的 .claude/settings.json
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity（寫入各客戶端專屬設定檔）
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# 預覽（不寫入）/ 解除連接 / 互動式精靈：
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` 指令會 **非破壞性** 地合併進你現有的設定檔中。

> ⚠️ **main 預設受保護。** 若你的團隊採用 Trunk-based 單分支主幹開發，請在 `gitflow-guard.config.json` 中設定 `{ "enabled": false }` 關閉守衛。

**第 3 步 — 驗證。** 讓 Agent 嘗試執行 `git push origin develop`，該操作將被直接攔截：

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

---

## 為什麼需要 — 本外掛解決的核心痛點

AI 寫碼 Agent 直接在你的程式碼倉庫中工作。儘管在專案文檔（`AGENTS.md`、`CLAUDE.md` 等）中寫明了流程規約，但那只是文字層面的 **軟約束**。

本外掛將軟約束轉化為 **機械式硬門禁**。Agent 嘗試執行的每一條 Git 指令，都會在執行前對比本地倉庫的真實狀態進行判定，違規操作在執行前即被阻斷。

---

## 功能特點 — 它能做什麼

- **執行前攔截**：直推、強制推動、刪除受保護分支（integration、preview、production、archive）均在執行前被攔截。
- **敏感合併僅限人工 (Merge-by-user)**：Agent 可起草 PR/MR，但生產與歸檔分支的合併必須由用戶親手點擊確認。
- **不可篡改的審計記錄**：所有攔截日誌寫入倉庫外部的 `~/.local/state/gitflow-guard/` 目錄。

---

## 門禁判定矩陣 — 攔截與放行清單

| Agent 動作 | 門禁判定 |
|---|---|
| feature 分支上 commit / push / sync / rebase | ✅ allow (放行) |
| 直推 / 強推 / 刪除 integration / preview / production / archive | 🚫 block (攔截) |
| 建立 PR/MR：feature → integration / preview | ✅ allow (放行) |
| 建立 PR/MR：feature → production | ✅ 允許建立；**禁止合併**（用戶親手點合併） |
| 建立 PR/MR → archive | ✅ 允許建立；🚫 **禁止合併**（用戶親手點合併） |
| 在 integration / preview 上本地執行 `git merge feature/x` | 🚫 block (必須走 PR/MR) |
| 強制重建受保護分支 (`git checkout -B` / `git switch -C`) | 🚫 block (ref-update 門禁攔截) |
| 透過 `sudo` 包裝的 Git 指令 | 🚫 自動剝除外殼並判定底層 Git 指令 |

---

## 詳細安裝指南

**前置條件**：系統 `PATH` 中需有 **Node.js ≥ 22**。所有客戶端使用**同一個 npm 套件** `agents-gitflow-guard`。

### 1. CLI Hook 客戶端 (Claude Code · Codex · OpenCode · Antigravity)

```bash
npm i -g agents-gitflow-guard
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

### 2. 進程內外掛與擴充 (DSH · Pi)

- **DeepSeek Harness (DSH)**：`dsh plugin --profile web add agents-gitflow-guard`（安裝後重啟 DSH）
- **Pi**：`npm i -D agents-gitflow-guard` 並將 `node_modules/agents-gitflow-guard/pi/gitflow-guard.ts` 複製到 `.pi/extensions/`

### 3. 從源碼安裝與本地開發 (From Source)

```bash
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build

# 根據客戶端進行掛載：
npm link # CLI Hook (Claude Code / Codex / OpenCode / Antigravity) 或 Pi
dsh plugin --profile web add file:/path/to/AgentsGitFlowController # DSH
```

---

## 授權條款

[MIT](LICENSE) © FeatureAgents
