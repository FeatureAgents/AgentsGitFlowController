# agents-gitflow-guard

> **有沒有受夠了 AI Agent 隨意跳過你的 GitFlow 合併流程？**

一個可自由配置分支角色的流程守衛，專為主流 AI 寫碼 Agent 平台而生 —— [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)、[Codex](https://github.com/openai/codex)、[OpenCode](https://github.com/opencode-ai/opencode)、[Antigravity](https://github.com/google-deepmind)、[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) 與 [Pi](https://github.com/mariozechner/pi)。  
你自己定義分支 —— **集成分支**（feature 經 PR/MR 合入）、**預覽分支**（環境端點）、**生產分支**、**歸檔分支** —— 每個角色各自配置規則。Agent 無法跳過流程，敏感合併始終留在你手上。

[English](README.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-tw.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Русский](README.ru.md) · [授權條款](LICENSE)

[![Support on Ko-fi](https://img.shields.io/badge/Support_on_Ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## 目錄

- [快速開始 — 30 秒上手](#快速開始--30-秒上手)
- [為什麼需要它 — 解決的問題](#為什麼需要它--解決的問題)
- [適合誰 — 場景與團隊](#適合誰--場景與團隊)
- [它能做什麼](#它能做什麼)
- [它不能做什麼 — 誠實的邊界](#它不能做什麼--誠實的邊界)
- [與伺服器端分支保護的對比](#與伺服器端分支保護的對比)
- [工作原理 — 三句話](#工作原理--三句話)
- [設定參考](#設定參考)
- [門禁矩陣 — 攔截什麼、放行什麼](#門禁矩陣--攔截什麼放行什麼)
- [人類保持控制權之處](#人類保持控制權之處)
- [安裝詳解](#安裝詳解)
- [常見疑問 (FAQ)](#常見疑問-faq)
- [術語表](#術語表)
- [路線圖](#路線圖)
- [開發](#開發)
- [贊助支援](#贊助支援)
- [授權條款](#授權條款)

---

## 快速開始 — 30 秒上手

**第 1 步 — 安裝。** 六個客戶端全部使用同一個 npm 套件 `agents-gitflow-guard`，依據你的 Agent 類型選擇對應安裝方式：

```bash
# 模式 A: CLI Hook 客戶端 (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# 模式 B: DSH 進程內外掛 (安裝後重啟 DSH，外掛在進程啟動時載入)
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# 模式 C: Pi 進程內擴充
npm i -D agents-gitflow-guard
```

> **提示**：預設安裝 npm 註冊表上的最新版本。若鏡像源快取有延遲或需鎖定版本，可指定版本號（例如 `npm i -g agents-gitflow-guard@<版本>`）。（使用 DSH 時若 pnpm 印出 peer 依賴警告屬正常預期 —— DSH 執行階段會自動透過共享模組解析 `@deepseek-ai/cordis` / `@deepseek-ai/dsh-tools`；外掛可正常運作。）
>
> CLI Hook 客戶端安裝後執行一步接線指令（每個客戶端一條指令，見第 2 步）；Pi 複製一個擴充檔案；DSH 在外掛新增後自動完成掛載。

**第 2 步 — 接線（無需設定檔）。** 守衛內建**預設配置，開箱即用：預設保護 `develop` (integration) + `main` (archive)**，零配置。你要做的只是讓 AI 客戶端去呼叫守衛 —— 每個 stdin-hook 客戶端只需一條指令（DSH 自動接線；Pi 複製檔案，見下）：

```bash
# Claude Code → 本專案 .claude/settings.json
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity（各寫各的設定檔；--yes 跳過 y/N 確認）
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# 僅預覽不寫入 / 移除 / 互動式精靈：
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` 對現有配置**非破壞性合併**（已存在的 hook 保持不動），預設只寫入**當前專案目錄**；`--global`（本機所有倉庫）寫入前必先確認或需帶 `--yes`。各客戶端的檔案與格式見[安裝詳解](#安裝詳解)。

> ⚠️ **main 預設受保護。** Trunk / 單分支工作流程（所有人直推同一條分支）的使用者，安裝後第一次直推 `main` 就會被攔截 —— 建立 `gitflow-guard.config.json` 寫入 `{ "enabled": false }`，或自行映射分支（見[設定參考](#設定參考)）。`gitflow-guard status` 在預設配置生效時也會反覆提示這一點。

**第 3 步 — 驗證。** 讓 Agent 執行 `git push origin develop`，預期工具呼叫被拒絕：

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

**提示訊息預設為英文**（面向國際化）。要在你的專案中顯示中文，建立設定檔並加入 `"locale": "zh"`；中文效果為：*已拦截:受保护分支「develop」禁止直推 / 下一步:集成分支(develop)由 PR/MR 合入 feature……*（見[設定參考](#設定參考)）。

**完成。** 守衛已使用內建預設配置生效。想要更多關卡（`preview` / `production`）或修改分支名稱？撰寫一個 `gitflow-guard.config.json`，只寫入你在意的欄位，其餘保持內建預設。完整判定表見[門禁矩陣](#門禁矩陣--攔截什麼放行什麼)。

### 完整實戰範例 — 一個 feature 的端到端旅程

場景：團隊開發登入頁面（`feature/login-page`）；`develop` 是集成分支，`main` 是歸檔分支。每一步 Agent 做什麼、外掛判定什麼、你看到什麼：

| # | Agent 執行 | 外掛判定 | 你看到 |
|---|---|---|---|
| 1 | `git checkout -b feature/login-page`（從 develop 切出） | ✅ 放行（feature 自由） | 分支已建立 |
| 2 | `git add . && git commit -m "feat: login"` | ✅ 放行 | 已提交 |
| 3 | `git push -u origin feature/login-page` | ✅ 放行（推 feature 沒問題） | 已推送 |
| 4 | `git checkout develop && git merge feature/login-page` | 🚫 **攔截** —— 集成分支只收 PR/MR | 必須對 develop 開立 PR/MR |
| 5 | `gh pr create --base develop` | ✅ 放行（feature → 集成經由 PR） | PR 已建立，由你審查並合併 |
| 6 | `git push origin main` 或合入 main | 🚫 **攔截** —— 歸檔僅限用戶親手 | 發布後由你親自 develop → main 歸檔 |

注意 Agent **做不到**的事：把 feature 直接合進 `develop`，或碰 `main` 一下都不行。每個敏感合併都是你在 PR/MR 頁面或自己終端機裡的有意識操作。

---

## 為什麼需要它 — 解決的問題

AI 寫碼 Agent 在你的程式碼倉庫裡工作。它透過系統提示詞、專案 Agent 指令檔案（`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`.cursorrules` 等各家命名）和專案文檔被「告知」遵循合併流程：feature 分支開發 → 合入集成分支（以及若有配置各 preview/production 階段）→ 生產/歸檔交給你。

**這是軟規則。** Agent 會跳過、重排、甚至乾脆「忘記」它 —— 不是出於惡意，而是因為軟性指令對模型來說本來就是可選的。

這個外掛把軟規則變成**硬機制**。Agent 每次嘗試的 Git 操作都會對照*本地倉庫的真實狀態*進行檢查；違規操作在指令執行前就會被攔截，並給出原因與下一步指引。

沒有人需要刻意記住規則 —— 規則被強制執行。

---

## 適合誰 — 場景與團隊

### 這些信號說明它適合你

- 你有（或想要）一個明確的分支流程 —— 從單條 `develop` 式集成分支，一直到多級 preview/production 流水線。
- Agent 已經抄過近路：直推受保護分支，或合併到不該合併的地方。發生過一次就會再次發生 —— 這個外掛是結構性修正。
- 你想保護集成/歸檔分支，又不想全靠人工 Review 來抓每一次抄近路。
- 多個 feature 平行開發、匯入同一個預覽環境，你想讓每個進入更嚴格階段的動作都被嚴格把關。

### 具體場景舉例

1. **獨立開發者 + Agent 承接客戶專案。** 你把任務交給 Agent，它「好心」直接推送到集成分支。一份小設定檔，Agent 在機制上不經由 PR/MR 就無法碰觸受保護分支 —— 哪怕你沒有盯著它。
2. **3–10 人小團隊 + CI 自動部署的預覽環境。** Staging 合併即自動部署；某天 Agent 未經審查就把 feature 合進 `develop`。此後進入任何受保護階段都必須透過 PR/MR —— 一次有意識、有紀錄的動作。
3. **多環境流水線的大型企業團隊。** 擁有眾多預覽端點 + 受管制的生產線與歸檔線 —— 每個角色各自配置規則，守衛無需額外邏輯就能擴展到任意規模。
4. **非同步協同作業。** 你不一定隨時在線。守衛在你的會話間隙中保持流程端正；生產/歸檔合併依然專屬於你。

**不適合你**（另見[它不能做什麼](#它不能做什麼--誠實的邊界)）：

- **主幹直推流 (Trunk-based)** —— 所有人都直接合併到同一條分支：外掛會不斷攔截，請勿開啟。
- **未定義流程的個人倉庫** —— 沒有規範可守，毫無價值。
- **一個分支角色都不願意賦予的專案** —— 外掛至少需要一條 `integration` 分支來進行保護。

---

## 它能做什麼

- **執行前攔截**：直推 / 強推 / 刪除受保護角色分支（integration / preview / production / archive）；Agent 試圖合併入生產或歸檔。
- **角色驅動、完全可配**：`integration`（內建預設 `develop`）是核心角色；`preview` / `production` / `archive` 是可選陣列（精確名稱或正則），每個角色獨立配置 `update`（`pr` / `flexible`）與 `mergeBy`，自訂配置深度合併於預設值之上。
- **在關鍵處保留人類的操作權**：生產與歸檔合併始終在你手上 —— 外掛阻止 Agent 點擊合併，因此你的動作*就是*確認。
- **支援任何命名慣例**：分支名稱全由配置映射，絕無寫死（見[設定參考](#設定參考)）。
- **全程稽核記錄**：每次攔截都追加至使用者層級狀態目錄（macOS/Linux `~/.local/state/gitflow-guard/`，Windows `%LOCALAPPDATA%\gitflow-guard`）下的稽核日誌 —— 位於倉庫外部、絕不進入版本庫、位於 Agent 可寫沙箱之外，且同一倉庫的所有工作樹 (worktree) 共享同一份日誌。
- **平台無關核心**：純本地 Git；可選呼叫 `gh` (GitHub) 或 `glab` (GitLab) 進行 PR/MR 目標解析，沒有安裝它們也能安全運作。

---

## 它不能做什麼 — 誠實的邊界

- **它不是安全防禦邊界。** 指令解析是盡力而為；執意混淆指令的 Agent 可能繞過文字分析。
- **它不接管 CI。** CI 狀態僅作為參考日誌，從不作為硬性門檻。真正的分支保護應設定於 GitHub/GitLab 中，兩者可疊加使用。
- **它不能替代流程本身。** 你的專案至少必須有一條 `integration` 分支；如果所有人都直接往單一分支推送，這個外掛會持續攔截 —— 那種情況下請勿開啟。
- **生產/歸檔流程不自動化** —— 它們被刻意保留給你人工點擊；外掛僅僅是對 Agent 說「不行」。

---

## 與伺服器端分支保護的對比

伺服器端分支保護（GitHub branch rules、GitLab protected branches）與本外掛解決**不同的問題**，兩者互補而非互相替代。

| 維度 | 伺服器端保護 | 本外掛 |
|---|---|---|
| 管轄對象 | *誰*能推/合併到受保護分支（權限控制） | *Agent 怎麼*進入流程（工作流程規範）—— 這次合併落在哪個角色 |
| 防止 Agent 合入生產/歸檔 | 不能 —— 無法分辨「這是 Agent 執行的」 | 能 —— 生產/歸檔合併預設對 Agent 禁用 |
| 依角色靈活配置 | 每個分支在主機上一條規則 | 一個設定檔內依角色定義 `update` (pr/flexible) + `mergeBy` (user/anyone) |
| 涵蓋範圍 | 倉庫的所有使用者，包含人類 | 配置了外掛的 Agent（人類作業不受限制） |
| 執行時機 | 伺服器端，推送/合併時 | 本地端，指令執行前 |
| 平台依賴 | 綁定特定程式碼託管平台 | 純本地 Git，平台無關（`gh` / `glab` 為可選） |
| 誰能繞過 | 具備管理員權限的使用者 | 在 Agent 環境外部工作的人，或執意混淆的惡意 Agent |

為什麼這很重要：分支保護回答的是「*這次推送究竟能不能發生？*」；本外掛回答的是「*根據配置，這個 Agent 是否可以進入該角色？*」。最強大的架構是**兩者並用** —— 外掛確保 Agent 嚴格遵守工作流程，而伺服器端保護則保證任何人（無論 Agent 還是人類）都無法直接推送至受保護分支。

---

## 工作原理 — 三句話

1. Agent 呼叫 shell 工具（`pwsh` / `bash`）執行一條 Git 指令。
2. 外掛對指令進行分類，從 `gitflow-guard.config.json` 解析分支角色，並套用門禁矩陣。
3. 違規 → 工具呼叫在**執行前被拒絕**，附帶原因與下一步引導；放行 → 指令正常執行，每次攔截均寫入使用者層級日誌（`~/.local/state/gitflow-guard/repos/<repo>-<hash>/audit.jsonl`）。

沒有聊天確認機制，也沒有許可權儲存庫：敏感合併（生產/歸檔）就是**僅限使用者操作** —— Agent 可以幫你準備 PR/MR，但點擊合併的始終是你自己。

### 設計原則 — 它為什麼有效

#### 1. 設定是唯一事實來源

分支名稱與規則絕無硬編碼。`integration` 以內建預設（`develop`）提供；`preview` / `production` / `archive` 為可選陣列（精確名稱或正則表達式），每個角色都具備獨立的 `update` 與 `mergeBy` —— 在預設值之上進行深度合併。同一個二進位檔案即可從單人 `develop` 擴展到企業級多環境流水線。

#### 2. 攔截發生在執行前，不是執行後

外掛掛載在工具管線的 `tools/pre-execute` —— 這是指令分派*之前*的決策點。在此處 `deny`，指令**根本不會被執行**，Agent 只會看到被拒絕的回應。事後偵測（掃描日誌）無法作為強制手段 —— 因為損害早已造成。

#### 3. 敏感合併在機制上只能由人操作

沒有任何外掛程式碼代為判斷生產或歸檔「這次合併可不可以」。門禁機制純粹拒絕讓 *Agent* 執行這些合併，因此唯一的路徑就是 PR/MR 頁面中由**你**親自點擊合併 —— 那個點擊本身就是確認。不存在任何 Agent 可以偽造的 Token、許可證或對話訊息能繞過你。

---

## 設定參考

### 內建預設配置 + 深度合併覆蓋

守衛**預設開啟** —— 不需要 `gitflow-guard.config.json` 即可運作。預設保護：

| 預設值 | 角色 | 規則 |
|---|---|---|
| `develop` | **integration** | 禁止直推；僅能透過 PR/MR 合入 (`update: "pr"`) |
| `main` | **archive** | 禁止直推 / 禁止 Agent 合併；歸檔合併留由你親自執行 (`mergeBy: "user"`) |

當你建立 `gitflow-guard.config.json` 時，其欄位會**深度合併覆蓋預設值**：寫入的欄位/角色會取代預設，未寫入的則保持預設值。只需寫入你想變更的內容：

```jsonc
{
  "branches": { "production": ["release-[\\w-]+"] }  // 預設的 develop+main 維持不變；新增 production
}
```

**完全關閉**（Trunk / 單分支工作流）：`{ "enabled": false }`。誤攔時修改單一檔案即可解除；`gitflow-guard status` 始終會說明當前生效的是內建預設值還是自訂配置。

### 分支角色 — 外掛校驗的模型

**角色**將分支名稱（或正則表達式）映射至規則集。`integration` 由內建預設提供；其餘角色皆為可選。

```text
feature 分支 ──(自由)──> integration (集成分支，PR/MR 合入)
                                 │
                                 ├──> preview (可選，環境端點，僅走 PR/MR)
                                 │
                                 └──> production (可選，PR/MR + 只有你能點擊合併)
archive (可選，發布後由你親手歸檔)
```

| 角色 | 配置鍵 | 必填？ | 強制行為 |
|---|---|---|---|
| **feature** | `featurePattern` | — | 自由：commit / push / 同步 / rebase |
| **integration** | `branches.integration` | 預設 (`develop`) | 禁止直推（預設 `pr`）；feature 僅能透過 PR/MR 合入 |
| **preview** | `branches.preview` (陣列) | 可選 | 禁止直推；僅走 PR/MR（環境端點） |
| **production** | `branches.production` (陣列) | 可選 | 僅走 PR/MR；合併操作僅限使用者本人 (`mergeBy: "user"`) |
| **archive** | `branches.archive` (陣列) | 預設 (`main`) | 允許 Agent 建立指向它的 PR/MR；合併依然僅限使用者親手執行 |

### 自訂分支名與規則 — 任何命名都可以

**小團隊（個人 / 2–3 人）—— 極簡：僅配置 integration：**

```jsonc
{
  "enabled": true,
  "featurePattern": "feature/[\\w-]+",
  "branches": { "integration": ["develop"] }
}
```

**大型團隊（多個預覽環境 + 生產環境 + 歸檔）：**

```jsonc
{
  "enabled": true,
  "featurePattern": "(topic|feature)/[\\w-]+",
  "branches": {
    "integration": ["develop", "topic/[\\w-]+"],
    "preview": {
      "branches": ["ita1", "itb1", "itb2", "sg", "vb", "r1-conf", "r1-ope", "r2-conf", "r2-ope"],
      "update": "pr"
    },
    "production": {
      "branches": ["prd-conf", "prd-ope"],
      "update": "pr",
      "mergeBy": "user"
    },
    "archive": ["main"]
  }
}
```

### 完整欄位參考

```jsonc
{
  "enabled": true,                     // 預設 true — 設為 false 即關閉守衛
  "featurePattern": "feature/[\\w-]+", // 比對工作/feature 分支的 JS 正則表達式
  "branches": {
    "integration": { "branches": ["develop"], "update": "pr" },  // 預設: ["develop"] — 省略即維持預設
    "preview":     { "branches": ["ita1"], "update": "pr" },     // 可選
    "production":  { "branches": ["prd"], "update": "pr", "mergeBy": "user" }, // 可選
    "archive":     ["main"]                                      // 可選
  },
  "locale": "en",                      // 可選: 訊息語言 —— 任意已註冊 locale ('en'/'zh' 內建)；未註冊值會在 status 警告並回退為英文
  "strict": false,                     // 可選: fail-closed —— 配置異常或內部錯誤改為攔截，而非警告並放行
  "ci": { "enabled": true }            // 可選: gh pr checks 作為參考日誌記錄
}
```

- 每個角色既可使用**陣列**（簡寫），也可使用**物件** `{ branches, update?, mergeBy? }`。
- `update`：`pr`（預設）= 只能透過 PR/MR 合入；`flexible` = 允許直推/本地合入（適用於小團隊）。
- `mergeBy`（production）：`user`（預設）= 只能由你親手點擊合併；`anyone` = 允許放行 PR 合併。
- 每個分支項目為精確名稱或正則表達式（自動識別）。**正則安全**：分支正則由專案作者提供並按原樣編譯 —— `featurePattern` 與分支項目請避免災難性回溯寫法（例如 `(\w+)+` 這類巢狀量詞）。
- **訊息語言**：預設為英文；加入 `"locale": "zh"` 切換為中文，或傳遞 `--locale <en|zh>` 給任意 `gitflow-guard` 子指令（優先順序：CLI 旗標 > 專案配置 > 英文）。所有使用者可見文案均遵循 locale —— 包含 `--help`、未知指令提示、稽核記錄為空的提示等 CLI 框架文字。
- **自訂語言**：下游套件可在執行階段擴充語言 —— `import { registerLocale } from 'agents-gitflow-guard'`，呼叫 `registerLocale('fr', frDict)` 註冊一份與內建英文字典完全一致的鍵值字典（註冊時自動校驗），再於專案配置中設定 `"locale": "fr"` 即可生效。

  ```js
  import { registerLocale, MESSAGE_KEYS } from 'agents-gitflow-guard'
  // MESSAGE_KEYS 列出字典必須覆蓋的全部鍵（與內建英文同一個鍵集合）；
  // 缺鍵或多鍵在註冊時皆會拋出錯誤。
  const fr = { /* 每個 MESSAGE_KEYS 一筆, 例如 */ 'deny.header': ({ why }) => `[gitflow-guard] bloqué : ${why}` }
  registerLocale('fr', fr)
  ```
- **未註冊語言**：攔截路徑對未註冊的 `"locale"` 值會靜默回退為英文（此為刻意設計 —— hook 不應因文案缺失而卡住流程），拼寫錯誤因此容易被忽略；單行警告訊息會在 `gitflow-guard status` 中明確顯示。
- **驗證機制**：重疊的角色配置將被拒絕；無效的正則表達式會報錯。**任何配置錯誤都會讓該專案的守衛回退為「未啟用」狀態並回報**（而不是套用半吊子的猜測配置）；請注意，若你覆蓋的角色包含與預設角色相同的分支名稱（例如將 `main` 映射為 integration，而預設 archive 仍為 `main`），將觸發重疊錯誤 —— 請一併覆蓋或移除另一個角色。
- **嚴格模式 (Strict mode)**：預設情況下損壞的配置會在 stderr 輸出一次警告後放行指令（fail-open，避免單一打字錯誤導致工具鏈中斷）；`"strict": true` 會將配置異常與內部錯誤反轉為**攔截**（fail-closed）—— 適用於高風險倉庫。顯式的 `enabled: false` 保持靜默；而*檔案不存在*不再視為錯誤 —— 內建預設配置 (develop+main) 直接生效。

---

## 門禁矩陣 — 攔截什麼、放行什麼

| Agent 動作 | 判定 |
|---|---|
| commit / 推送 feature / 同步 / rebase / 唯讀指令 | ✅ 放行 |
| 直推 / 強推 / 刪除 integration / preview / production / archive | 🚫 攔截（integration/preview 配置 `flexible` 時直推放行） |
| PR/MR: feature → integration / preview | ✅ 放行 |
| PR/MR: feature → production | ✅ 允許建立；**合併被攔截**（由你在 UI 中合併） |
| 指向 archive 的 PR/MR | ✅ 允許建立；🚫 合併被攔截（由你在 UI 中合併） |
| 在 integration / preview 上執行本地 `git merge feature/x` | 🚫 攔截（必須透過 PR/MR）；`update: flexible` 則放行 |
| 串聯指令（`checkout develop && merge feature/x`） | 🚫 攔截 —— 逐段模擬分支切換，無法藉由順序繞過 |
| 強制重建受保護分支（`git checkout -B/-C <分支>` / `git switch -C`） | 🚫 攔截（直改 ref-update 門禁） |
| 使用 `git symbolic-ref` 重定向/刪除受保護分支 | 🚫 攔截（直改 ref-update 門禁） |
| 在 integration / preview / production / archive 上執行 `git cherry-pick` / `git revert` | 🚫 攔截（受保護分支上改寫歷史）；`-n`/`--no-commit` 與 `--abort`/`--continue`/`--skip`/`--quit` 放行 |
| `sudo` 包裝的 Git 指令（特權外殼） | 🚫 剝除外殼（含 `sudo -u …`）後按內層指令判定 |

> 兩處**刻意不攔截**的邊界，防止日後維護時「順手補上」導致語意回歸：`git tag -f` 移動標籤（即使指向受保護分支）維持豁免 —— tag 不在分支角色守衛範疇，與 `push --tags` 相同；受保護分支上的普通 `git commit` 維持放行 —— 守衛只管分支角色與合入路徑、不管提交內容，後續的 `git push` 依然會被攔截（遠端保持零污染）。

PR/MR 目標透過 `gh pr view` (GitHub) 或 `glab mr view` (GitLab) 進行解析；若無平台 CLI 工具，外掛採取保守策略。

---

## 人類保持控制權之處

- **生產合併與歸檔**預設僅限使用者親自執行：Agent 可以幫你起草 PR/MR，但**合併按鈕必須由你親自點擊** —— 那個點擊*就是*確認。沒有獨立的許可權庫可以把這個決定委派出去。
- 每次攔截均會追加至使用者層級稽核日誌中以供查閱 (`gitflow-guard audit`)。

---

## 安裝詳解

**前置條件**：系統 `PATH` 中需有 **Node.js ≥ 22**（與套件 `engines` 及 CI 矩陣最低支援版本一致）。所有客戶端均使用**同一個 npm 套件** `agents-gitflow-guard` —— 僅掛載與接線方式有所不同。

| 客戶端類型 / 平台 | 安裝指令 | 掛載與接線步驟 |
|---|---|---|
| Claude Code · Codex · OpenCode · Antigravity | `npm i -g agents-gitflow-guard` | `gitflow-guard wire --client <名稱> --project --yes` |
| DeepSeek Harness (DSH) | `dsh plugin --profile web add agents-gitflow-guard` | 重啟 DSH —— 外掛自動掛載為 profile 層 |
| Pi | `npm i -D agents-gitflow-guard` | 將 `pi/gitflow-guard.ts` 複製進 `.pi/extensions/` |

### 1. CLI Hook 客戶端 (Claude Code · Codex · OpenCode · Antigravity)

全域安裝一次 CLI，接著**針對每個客戶端執行一條指令完成接線**（守衛依賴內建預設配置已預設啟用，接線是唯一剩下的步驟）：

```bash
npm i -g agents-gitflow-guard   # 提供 `gitflow-guard` 二進位執行檔
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

`wire` 讀取現有的設定檔（若有）並將 hook 項目合併入內 —— 不觸碰其他內容、具冪等性（已接線則自動跳過）、支援 `--dry-run` 預覽與 `--unwire` 移除、寫入 `--global` 前必定先行確認。它所寫入的確切檔案內容（供參考，亦可代替 `wire` 手動編寫）為：

```jsonc
// Claude Code — .claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "gitflow-guard check --platform claude" }] }
    ]
  }
}
```

```jsonc
// Codex — .codex/hooks.json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "^Bash$", "hooks": [{ "type": "command", "command": "gitflow-guard check --platform codex" }] }
    ]
  }
}
```

```ts
// OpenCode — `.opencode/plugins/gitflow-guard.ts` (隨套件 `opencode/gitflow-guard.ts` 的複本;
// OpenCode 1.18+ 已移除 hooks.yaml，擴充點改為 plugins —— `tool.execute.before` 事件，
// 拒絕語意 = 拋出異常; `wire --client opencode` 會自動複製該檔案)
```
`gitflow-guard wire --client opencode` 會自動從套件內寫入此檔案；非必要不建議手動編寫。

```json
// Antigravity (Google) — .agents/hooks.json
// (agy hook 進程 cwd = hook 設定檔所在目錄，相對 bin/… 會解析失敗; `wire` 專案級寫絕對路徑、
// 全域寫 PATH 上的 gitflow-guard。此處展示全域安裝形態。)
{
  "gitflow-guard": {
    "PreToolUse": [
      { "matcher": "run_command", "hooks": [ { "type": "command", "command": "gitflow-guard check --platform antigravity" } ] }
    ]
  }
}
```

### 2. 進程內外掛與擴充 (DSH · Pi)

- **DeepSeek Harness (DSH)**：
  ```bash
  dsh plugin --profile web add agents-gitflow-guard
  ```
  安裝完成後重啟 DSH。套件已自帶 `dsh.bundle.patch` 宣告，`dsh plugin add` 會自動將其掛載為 profile 層，無需手動編輯 profile。日後升級亦採用相同指令並重啟。

- **Pi**：
  Pi 以進程內擴充方式載入（無 stdin payload，亦無子進程 hook）。將隨套件發布的進入點安裝至專案中、並將套件保留於 devDependencies：
  ```bash
  npm i -D agents-gitflow-guard
  mkdir -p .pi/extensions
  cp node_modules/agents-gitflow-guard/pi/gitflow-guard.ts .pi/extensions/gitflow-guard.ts
  ```
  並於 `.pi/settings.json` 中配置：
  ```jsonc
  // Pi — .pi/settings.json (extensions 路徑相對於 .pi 進行解析)
  { "extensions": ["extensions/gitflow-guard.ts"] }
  ```

### 3. 從源碼安裝與本地開發 (From Source)

供貢獻者使用，或希望在本地直接以最新源碼 checkout 進行執行與除錯：

```bash
# 複製倉庫並建置
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build
```

根據你所使用的 Agent 客戶端掛載本地開發版本：

```bash
# A. CLI Hook 客戶端 (Claude Code · Codex · OpenCode · Antigravity)
npm link # 或 npm install -g .
gitflow-guard wire --client <claude|codex|opencode|antigravity> --project --yes

# B. DeepSeek Harness (DSH)
dsh plugin --profile web add file:/path/to/AgentsGitFlowController
# 或使用腳本: node scripts/install-dsh.mjs web (安裝後重啟 DSH)

# C. Pi
npm link
# 或直接將倉庫內的 pi/gitflow-guard.ts 複製到目標專案的 .pi/extensions/
```

### 4. GitHub Copilot 說明

**GitHub Copilot —— 刻意不提供專屬 hook**。Copilot 自身已內建此類守衛的原生機制：工具層級的 **allow/deny/ask** 權限設定以及專案 **rules** (`rules.json` + `AGENTS.md`)。針對 Copilot 使用者，直接參考官方文檔即可，無須使用本外掛的 hook：

- [允許和拒絕工具使用 (GitHub Docs)](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools)
- [為 Copilot coding agent 新增自訂規則 (GitHub Docs)](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-rules-for-the-copilot-coding-agent)
- 可選：Copilot 亦具備官方 [hooks 系統](https://docs.github.com/en/copilot/reference/hooks-reference) (`preToolUse` → `permissionDecision:"deny"`)，若需要指令層級的攔截可自行串接。

### 5. Hook 機制與協定細節

- **平台協定規範**：Hook 從 stdin 讀取 payload 並依據各平台規範進行回應：
  - **Claude Code / OpenCode**：`exit 2`（stderr 輸出攔截原因與下一步行動指引）。
  - **Codex**：stdout 輸出 JSON `{"hookSpecificOutput":{"permissionDecision":"deny",...}}`。
  - **Antigravity**：stdout 輸出 JSON `{"decision":"deny","reason":...}` 且維持 `exit 0`（平台要求）。
  - **Pi**：進程內擴充監聽 `tool_call` 事件並回傳 `{ block: true, reason }`。
- **僅攔截前置事件**：門禁在指令執行*前*即完成攔截，無需事後清理或消耗特許權杖。
- **PATH 與二進位解析**：全域安裝提供 `gitflow-guard` 執行檔；若 Agent 子進程環境未繼承使用者的 `PATH`，可配置 `npm bin -g` 所回傳的絕對路徑。
- **開箱即用**：內建預設配置（`integration: ["develop"]`, `archive: ["main"]`）無需額外建立檔案即生效；自訂配置自動執行深度合併。
- **安全接線**：`gitflow-guard wire` 具備冪等性，安全合併配置且不影響現有其他 Hook；`--unwire` 精準移除對應條目。

---

## 常見疑問 (FAQ)

### 我的分支不叫預設名字，能用嗎？

能用 —— 分支名稱絕無任何寫死限制。`integration` 由內建預設（`develop`）提供，自訂配置在預設之上進行深度合併；其條目（以及 `preview` / `production` / `archive` 的條目）可以是任何精確分支名稱或正則表達式。`featurePattern` 用於告知外掛如何辨識你的工作分支。

例如將集成分支命名為 `master`、增加 `beta` 作為預覽分支、feature 前綴使用 `fix/` —— 只要寫入設定檔即可；所有的攔截、報告與稽核記錄都會依據你的命名運作。沒有任何強制的約定俗成，完全由你宣告的映射關係決定。詳見[自訂分支名與規則](#自訂分支名與規則--任何命名都可以)。

---

### 我非得配置 preview/production/archive 嗎？

不用。只需配置你的工作流程中實際存在的角色。只使用 `develop` 的單人專案配置 `integration: ["develop"]` 即可；擁有十個環境的企業團隊再補充 `preview` 陣列與 `production` 角色。其餘保持關閉即可。

---

### 它是安全工具嗎？

不是，請務必不要將它視為資安防護工具。它是工作流程守衛：旨在將約定好的團隊規範落實為具備機械約束力的機制。基於文字的指令識別本質上屬於盡力而為（best-effort）—— 執意混淆指令的 Agent 可能繞過解析器。

在其支援的指令形態內，角色邊界在本地端被強制執行：合入受保護角色分支（integration / preview / production / archive）必須遵循配置好的路徑（PR/MR，或生產/歸檔的人工合併）。常見的混淆包裝均已納入分類與攔截 —— shell 包裝（`sh -c` / `bash -lc`）、子 shell 與反引號/`$()` 巢狀嵌合、`env`/`command`/`nohup`/`xargs`/`sudo` 前綴與 `VAR=x` 賦值、絕對路徑、管線與 `||` 後半段、Git 全域選項（`-C .`、`--git-dir=…`）、萬用字元 refspec（`refs/heads/*:refs/heads/*`）、作為 fetch+merge 使用的 `git pull`，以及 `send-pack`/`update-ref`/`symbolic-ref` 等底層 plumbing 指令；強制重建受保護分支（`checkout -B`/`switch -C`）與受保護分支上的 cherry-pick/revert 則由 ref-update / ref-move 門禁攔截。可執行的對抗測試語料庫位於 `tests/accuracy-audit.spec.ts`。

目前已知**本地端無法防禦**的途徑：直接呼叫代碼託管平台的 API（`gh api repos/…/pulls/N/merge`、`curl`）以及直譯器子進程內嵌執行（`node -e "child_process.exec('git push …')"`）；任意深度的引號與編碼變換天然只能盡力而為。真正不可繞過的安全防禦邊界在於你程式碼託管平台上的分支保護規則。請兩者搭配使用 —— 將本守衛視為即時反饋與稽核留痕工具，而非資安防火牆。

---

### 為什麼 Agent 不能自己合併進生產/歸檔？

因為門禁機制將這些動作分類為**僅限使用者本人**執行。外掛對生產環境的*合併*以及歸檔分支的*合併*一律進行攔截 —— *建立 PR/MR 是被允許的*，Agent 依然可以為你起草 `develop` → `main` 的歸檔 PR。但合併動作本身只有一條途徑：由**你**親手點擊合併按鈕 —— 不存在任何 Agent 可以用來為自己授權的許可證、Token 或對話訊息。

---

### 必須安裝 `gh` 或 `glab` CLI 嗎？

不用。它們僅是可選的適配器，用於解析 `pr merge` / `mr merge` 究竟指向哪個目標分支，好讓門禁能分辨「合入 integration/preview」（放行）還是「合入 production/archive」（攔截）。當兩個 CLI 都無法確認目標時 —— 未安裝、未認證、離線或查詢失敗 —— 門禁**一律拒絕合併**，即便該指令是在 feature 分支上執行亦會被攔截：因為該 PR 實際上可能指向生產或歸檔分支。待 CLI 可用後重試，或由使用者親自手動點擊合併。其餘功能均正常運作。核心校驗完全不接觸外部託管平台，因此在 GitHub、GitLab、自架平台或純離線環境中的行為完全一致。

---

### 會誤攔我的正常日常開發工作嗎？

刻意設計為不會。feature 分支本來該進行的所有工作 —— 提交、推送、從集成分支同步、rebase、唯讀檢查指令、執行 `gitflow-guard status` —— 全部暢通無阻放行。

攔截僅保留給：(1) 直接寫入受保護角色分支，以及 (2) Agent 試圖合併進生產或歸檔分支。若你遇到認為不正確的攔截，先執行 `gitflow-guard status` —— 它會清晰展示每個本地分支被歸類為哪個角色，誤判一目了然且容易修正。

---

### 設定寫錯了會怎樣？

半吊子的錯誤配置絕不會意外生效：任何校驗錯誤都會讓該專案的守衛回退為禁用狀態並回報錯誤詳情。

常見錯誤：覆蓋的角色與預設角色同名（例如將 `main` 設定為 integration，而預設的 archive 依然是 `main` —— 此為明確的重疊報錯，需一併覆蓋或移除另一角色）、同一個分支被重複配置到兩個角色中（明確拒絕）、`featurePattern` 無法編譯為合法正則表達式（報錯）。錯誤提示非常明確，且檔案僅為一個單純的 JSON 物件，通常三十秒內即可修正完畢。

---

### 外掛到底檢查了本地倉庫的什麼？

當前檢出的分支（`git branch --show-current`），以及 —— 僅在執行 `pr merge` / `mr merge` 時 —— 透過 `gh pr view` / `glab mr view` 查詢 PR/MR 的目標分支。不需要進行任何提交祖先關係判斷，因為模型是**角色驅動**（目標屬於哪個角色分支），而非順序驅動。

核心校驗不寫入任何資料、不連接遠端伺服器、亦不需要程式碼託管平台功能。生產與歸檔的合併直接對 Agent 拒絕；人工合併則在你的 Web UI 介面中完成。

---

### 授權條款 / 是否收費？

MIT 授權，免費開源，無任何附加條件。隨意使用、修改、分發，唯一的義務是保留原著作權聲明。

如果它曾幫助你或你的團隊避免了一次不當操作，歡迎透過頁面頂部的按鈕請作者喝杯咖啡，但這絕非強制要求。詳見[授權條款](#授權條款)。

---

## 術語表

| 術語 | 涵義 |
|---|---|
| **integration** | 集成分支，核心角色（內建預設 `develop`）；feature 透過 PR/MR 合入；受保護 |
| **preview** | 可選的環境端點分支（`branches.preview` 陣列）；僅透過 PR/MR 更新 |
| **production** | 可選的生產環境分支（`branches.production` 陣列）；PR/MR + 合併僅限使用者親手執行 |
| **archive** | 可選的發布後歸檔分支（`branches.archive` 陣列）；允許 Agent 建立指向它的 PR/MR，合併仍限使用者親手點擊 |
| **feature 分支** | 你的工作分支，由 `featurePattern` 正則比對識別；自由作業區 |
| **門禁矩陣 (Gate Matrix)** | 將每條被分類的指令映射為放行或攔截的決策判定表 |
| **pre-execute** | 工具管線中攔截發生的掛載點 —— 在指令實際執行之前 |
| **合併僅限使用者 (Merge-by-user)** | 生產與歸檔的合併權限保留在你的手上 —— 你在 PR/MR 上的點擊就是確認動作 |

---

## 路線圖

未來規劃與正在積極探索的方向：

- **更多 Agent 平台整合**：調研並適配新興的 AI Coding Agent 工具（例如 Cursor、Windsurf、新一代 CLI Agent）。
- **稽核記錄彙整與匯出**：跨機器稽核日誌同步機制及團隊級安全合規性匯出格式。
- **情境化工作流程預設檔**：針對常見 Git 分支模式（Trunk-based 單主幹模式、多環境企業級 GitFlow）提供開箱即用的配置預設。
- **CI 門禁與 PR 校驗聯動**：探索原生 CI 流水線整合與 PR 檢查聯動機制，同時保有本地端零依賴執行的優勢。

已發布的功能與歷史版本更新記錄詳見 [CHANGELOG.md](CHANGELOG.md)。

---

## 開發

```bash
npm install
npm test              # 單元測試: classify / gate / config / cli / repo / platform / i18n / index / accuracy-audit / pi
npm run typecheck     # 型別檢查: tsc --noEmit, 0 Error
npm run build         # 建置構建: tsdown → lib/ (CLI 與外掛共享)
npm run check:pins    # 校驗 package.json 版本與 CHANGELOG 標題及版本範例一致
npm run verify:matrix # 連續回歸矩陣測試: DSH 邏輯 + zh 文案回歸 + 多平台 hook 編碼 + Pi 擴充
```

- **品質鐵律**：任何邏輯改動必須通過型別檢查（0 錯誤）、單元測試全數通過，並通過連續回歸矩陣測試（`verify:matrix`）。
- **客戶端接入規範**：新增支援的 Agent 平台時，必須嚴格遵循 [AGENTS.md](AGENTS.md) §8 中的同步清單。

---

## 贊助支援

本外掛免費開源 (MIT)。如果它曾幫助你與團隊避免了一次流程脫軌，歡迎請喝一杯咖啡以表支持：

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/keanz21)

---

## 授權條款

[MIT](LICENSE) © FeatureAgents
