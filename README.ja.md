# agents-gitflow-guard

> **AI エージェントが勝手に GitFlow をスキップするのにうんざりしていませんか？**

AI コーディングエージェントのための、柔軟にカスタマイズ可能なブランチ役割ガードプラグイン — [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)、[Codex](https://github.com/openai/codex)、[OpenCode](https://github.com/opencode-ai/opencode)、[Antigravity](https://github.com/google-deepmind)、[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH)、[Pi](https://github.com/mariozechner/pi) をサポート。  
ブランチの役割は自由に定義可能 — **integration**（PR/MR 経由で feature をマージ）、**preview**（検証環境用エンドポイント）、**production**（本番）、**archive**（アーカイブ）— それぞれに独自の更新ルールを設定できます。エージェントによるプロセスのスキップを物理的に防ぎ、重要なマージ権限を確実に人間の手に残します。

[English](README.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-tw.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Русский](README.ru.md) · [ライセンス](LICENSE)

[![Support on Ko-fi](https://img.shields.io/badge/Support_on_Ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## 目次

- [クイックスタート — 30秒でリポジトリを保護](#クイックスタート--30秒でリポジトリを保護)
- [導入の理由 — このプラグインが解決する課題](#導入の理由--このプラグインが解決する課題)
- [対象ユーザー — 利用シナリオとチーム](#対象ユーザー--利用シナリオとチーム)
- [主な機能 — できること](#主な機能--できること)
- [制限事項 — 誠実な限界](#制限事項--誠実な限界)
- [サーバー側のブランチ保護との違い](#サーバー側のブランチ保護との違い)
- [仕組み — 3行でわかる動作メカニズム](#仕組み--3行でわかる動作メカニズム)
- [設定リファレンス](#設定リファレンス)
- [判定マトリクス — ブロック対象と許可対象](#判定マトリクス--ブロック対象と許可対象)
- [人間がコントロールを保持するポイント](#人間がコントロールを保持するポイント)
- [インストール詳細](#インストール詳細)
- [よくある質問 (FAQ)](#よくある質問-faq)
- [用語集](#用語集)
- [ロードマップ](#ロードマップ)
- [開発](#開発)
- [サポート](#サポート)
- [ライセンス](#ライセンス)

---

## クイックスタート — 30秒でリポジトリを保護

**ステップ 1 — インストール。** 6 つのクライアントすべてが共通の npm パッケージ `agents-gitflow-guard` を使用します。ご利用のエージェント種別に応じて選択してください：

```bash
# モード A: CLI Hook クライアント (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# モード B: DSH プロセス内プラグイン（インストール後に DSH を再起動してください。起動時にロードされます）
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# モード C: Pi プロセス内拡張
npm i -D agents-gitflow-guard
```

> **注意**: 単純な `add` または `npm i` は npm レジストリから最新版をインストールします。ミラーのキャッシュ遅延がある場合やバージョンを固定したい場合は、末尾に `@<version>` を指定してください（例: `npm i -g agents-gitflow-guard@<version>`）。DSH 専用の peer 依存（`@deepseek-ai/cordis` / `@deepseek-ai/dsh-tools`）は **optional** として宣言されています —— DSH プロセス内プラグインのみが必要とし、DSH が実行時に共有プロファイルモジュールのフォールバックを通じて提供します。CLI / Pi / OpenCode ユーザーには強制インストールされません。
>
> CLI フック系クライアントはインストール後に配線（wire）コマンドを 1 回実行します（ステップ 2 参照）。Pi は拡張ファイルをコピーします。DSH はプラグイン追加時に自動マウントされます。

**ステップ 2 — クライアントの配線（設定ファイル不要）。** 本ガードは、**デフォルトで `develop` (integration) と `main` (archive) を保護する組み込み設定** を備えており、設定ファイルなしで最初から有効になっています。必要なのは、AI クライアントにガードを呼び出すよう設定することだけです（各 stdin-hook クライアントにつき 1 つのコマンド。DSH は自動配線、Pi はファイルコピー）：

```bash
# Claude Code → このリポジトリの .claude/settings.json
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity（各クライアント専用の設定ファイルに書き込み。--yes で y/N 確認をスキップ）
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# プレビュー（書き込まず確認）/ 削除 / 対話型ウィザード：
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` コマンドは既存の設定に **非破壊的** にマージされ（既存のフックはそのまま保持されます）、デフォルトで **プロジェクトディレクトリ** に書き込まれます。`--global`（マシン内の全リポジトリに適用）を実行する場合は必ず事前に確認されます（`--yes` でスキップ可能）。クライアントごとのファイルと形式の詳細は [インストール詳細](#インストール詳細) を参照してください。

> ⚠️ **デフォルトで main は保護されています。** トランクベース開発（全員が単一ブランチに直接プッシュする運用）を行っている場合、明示的に無効化するまで直接の `main` プッシュはブロックされます — 無効化するには `{ "enabled": false }` と書いた `gitflow-guard.config.json` を作成するか、独自のブランチマッピングを設定してください（[設定リファレンス](#設定リファレンス) 参照）。`gitflow-guard status` を実行すると、組み込みデフォルト設定が有効である旨の通知が表示されます。

**ステップ 3 — 動作確認。** エージェントに `git push origin develop` を実行させてみてください。ツール呼び出しが拒否されることを確認できます：

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

メッセージはデフォルトで英語です。設定ファイルに `"locale": "zh"` を指定することで中国語に切り替えることも可能です（例: *已拦截:受保护分支「develop」禁止直推 / 下一步:集成分支(develop)由 PR/MR 合入 feature……*、[設定リファレンス](#設定リファレンス) 参照）。

**完了です。** 組み込みのデフォルト設定でリポジトリの保護が有効になりました。より多くのステージ（`preview` / `production`）を追加したり、ブランチ名を変更したい場合は、変更したい項目のみを記述した `gitflow-guard.config.json` を作成してください（未記述の項目はデフォルト値が維持されます）。全判定ルールの一覧は [判定マトリクス](#判定マトリクス--ブロック対象と許可対象) をご覧ください。

### エンドツーエンドの全体フロー例

シナリオ: チームでログイン画面機能（`feature/login-page`）を開発する場合。`develop` が統合ブランチ、`main` がアーカイブブランチです。各ステップでの挙動は以下の通りです：

| # | エージェントが実行するコマンド | ガードの判定 | 実際の挙動 |
|---|---|---|---|
| 1 | `git checkout -b feature/login-page`（develop から切出） | ✅ 放行（feature 作業は自由） | ブランチが作成される |
| 2 | `git add . && git commit -m "feat: login"` | ✅ 放行 | コミットされる |
| 3 | `git push -u origin feature/login-page` | ✅ 放行（feature プッシュは自由） | プッシュ成功 |
| 4 | `git checkout develop && git merge feature/login-page` | 🚫 **拒否** — integration は PR/MR 経由のみ | develop への PR/MR 作成を促される |
| 5 | `gh pr create --base develop` | ✅ 放行（PR 経由で integration に合流） | PR が作成され、人間がレビューしてマージ |
| 6 | `git push origin main` または main へのマージ | 🚫 **拒否** — archive へのマージは人間限定 | リリース後に人間自身が develop → main をマージ |

エージェントが **実行できない** ことに注目してください：feature を直接 `develop` にマージすることや、`main` に触れることはできません。すべてのセンシティブなマージは、PR/MR 画面または自分自身のターミナルでの意図的な人間の操作として行われます。

---

## 導入の理由 — このプラグインが解決する課題

AI コーディングエージェントはリポジトリ内で直接作業します。システムプロンプトやプロジェクト指示ファイル（`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`.cursorrules` など）およびプロジェクトドキュメントを通じて、「feature ブランチで開発し、PR 経由で統合ブランチにマージし、本番/アーカイブのマージは人間に任せる」というワークフローが *指示* されています。

**しかし、これは「ソフトな規則」に過ぎません。** エージェントは規則をスキップしたり、順序を入れ替えたり、単に「忘れたり」します — 悪意からではなく、LLM にとってテキストの指示は任意のものだからです。

本プラグインは、そのソフトな規則を **「ハードな機械的制約」** に変換します。エージェントが試みるすべての Git 操作は、*ローカルリポジトリの実際の状態* に基づいて判定されます。違反はコマンド実行前に即座にブロックされ、理由と次の手順が通知されます。

ルールを記憶し続ける必要はありません — システムがルールを強制します。

---

## 対象ユーザー — 利用シナリオとチーム

### 本プラグインが適しているケース

- 単一の `develop` 統合ブランチから、複数ステージの preview/production パイプラインまで、定義されたブランチフローを運用している（または運用したい）。
- エージェントが勝手に保護ブランチに直接プッシュしたり、マージしてはならないブランチにマージしてしまった経験がある。一度起きたことは再び起きます — このプラグインはその根本的な構造的修正です。
- 統合ブランチやアーカイブブランチを保護したいが、すべてのショートカットを人間の目視レビューだけで防ぎたくはない。
- 複数の機能が並行開発され、共有の preview 環境に集約されるため、より厳格なステージへの合流を確実にレビュー必須にしたい。

### 具体的な利用シナリオ

1. **個人開発者 + エージェント（受託・クライアント案件）**: タスクを渡したエージェントが「親切心」で統合ブランチに直接プッシュする事故を防止。小さな設定ファイル 1 つで、人間が見ていない間もエージェントは PR/MR なしに保護ブランチに触れなくなります。
2. **小規模チーム（3〜10人）+ CI 自動デプロイ環境**: マージ時に自動デプロイされる環境で、エージェントが未レビューのまま `develop` にマージする事故を防止。以降、保護ステージへの合流はすべて PR/MR による意図的で監査可能な操作になります。
3. **複数環境パイプラインを持つ企業環境**: 多数の preview エンドポイントと厳格に管理された本番・アーカイブ環境を運用。各役割を設定するだけで、追加ルールなしでスケール可能。
4. **非同期コラボレーション**: 自分がオフラインの間もエージェントの規約違反を防ぎ、本番・アーカイブへのマージ権限を確実に自分自身の手に保持。

**適していないケース**（[制限事項](#制限事項--誠実な限界) も参照）：

- **トランクベース開発** — 全員が 1 つのブランチに直接コミット・プッシュする運用（常にブロックされてしまいます）。
- **フローが定義されていない個人用リポジトリ** — 強制する対象がなく、価値を発揮しません。
- **ブランチに役割を持たせたくないチーム** — 少なくとも 1 つの `integration` ブランチが必要です。

---

## 主な機能 — できること

- **実行前ブロック**: 保護対象ブランチ（integration / preview / production / archive）への直接プッシュ、強制プッシュ、ブランチ削除、およびエージェントによる production / archive へのマージをコマンド実行前に阻止。
- **柔軟な役割ベース設計**: `integration`（組み込みデフォルト: `develop`）を基本とし、`preview` / `production` / `archive` に任意のブランチ名や正規表現を配列で指定可能。更新ルール（`pr` / `flexible`、`mergeBy`）も個別に設定可能で、デフォルト設定の上にディープマージされます。
- **人間限定マージ（Merge-by-user）**: 本番およびアーカイブへのマージはエージェントによる実行を拒否。PR 画面で人間がマージボタンをクリックすることが唯一の確認となります。
- **任意の命名規約に対応**: ブランチ名は設定によってマッピングされ、ハードコードされていません（[設定リファレンス](#設定リファレンス) 参照）。
- **完全な監査ログ**: すべての拒否ログはユーザー状態ディレクトリ（macOS/Linux `~/.local/state/gitflow-guard/`、Windows の場合は `%LOCALAPPDATA%\gitflow-guard`）に記録。リポジトリ外に保存されるため、コミットされたりエージェントの書き込み可能サンドボックスから改ざんされる心配がなく、リポジトリの全 linked worktree で共有されます。
- **プラットフォーム非依存コア**: 純粋なローカル Git で動作。PR/MR のターゲット判定のために `gh` (GitHub) や `glab` (GitLab) を任意で参照しますが、CLI がなくても安全側に倒れて動作します。

---

## 制限事項 — 誠実な限界

- **セキュリティ境界ではありません。** コマンド解析はベストエフォートです。悪意を持って高度に難読化されたコマンドはテキスト解析をすり抜ける可能性があります。
- **CI 上のハードゲートではありません。** CI ステータスは参考情報としてログ記録されるのみです。真のブランチ保護は GitHub/GitLab 側のブランチプロテクション設定で行い、本プラグインと併用してください。
- **フロー自体の代替ではありません。** リポジトリに少なくとも 1 つの `integration` ブランチが存在する必要があります。全員が 1 つのブランチに直接プッシュする環境では有効化しないでください。
- **本番・アーカイブのマージ自動化ツールではありません。** 人間による意図的なクリックを必須とする設計のため、エージェントによるマージは拒否されます。

---

## サーバー側のブランチ保護との違い

サーバー側のブランチ保護（GitHub ブランチ保護ルール、GitLab 保護ブランチ）と本プラグインは **異なる課題を解決** します。互いに排他ではなく、補完し合う関係です。

| 比較項目 | サーバー側のブランチ保護 | 本プラグイン |
|---|---|---|
| 管轄対象 | 保護ブランチにプッシュ/マージできる **ユーザー権限** | エージェントがワークフローのどの **役割** に合流するか（ワークフロー規範） |
| エージェントによる本番マージの防止 | 不可（「エージェントによる操作か」を区別できない） | 可能（エージェントによる本番/アーカイブマージをデフォルトで拒否） |
| 役割ごとの柔軟性 | ホスティングサービス側のブランチ単位ルール | 1 つの設定ファイル内で役割ごとに `update` (pr/flexible) + `mergeBy` (user/anyone) を定義可能 |
| 適用範囲 | リポジトリの全ユーザー（人間を含む） | ガードが設定された AI エージェント（人間の直接操作は制限されない） |
| 強制タイミング | サーバー側、プッシュ / マージ時 | ローカル側、コマンド実行前 |
| プラットフォーム依存 | 特定のホスティングサービスに依存 | 純粋なローカル Git、プラットフォーム非依存（`gh` / `glab` は任意） |
| バイパス可能性 | 管理者権限を持つユーザー | エージェント環境外で作業する人間、または高度に悪意あるエージェント |

なぜこれが重要か：ブランチ保護は「*このプッシュは実行可能か？*」に答えます。本プラグインは「*設定に基づき、このエージェントはこの役割に入ってよいか？*」に答えます。最も強固な構成は **両方を併用すること** です — 本プラグインがローカルでエージェントにワークフローを遵守させ、サーバー側の保護ルールによって人間も含めた直接プッシュを確実に防止します。

---

## 仕組み — 3行でわかる動作メカニズム

1. エージェントが Git コマンドを含むシェルツール（`pwsh` / `bash`）を呼び出します。
2. プラグインがコマンドを分類し、`gitflow-guard.config.json` からブランチの役割を解決して判定マトリクスを適用します。
3. 違反がある場合 → ツール呼び出しは **実行前に拒否** され、理由と次の手順が返されます。許可される場合 → コマンドが実行され、拒否履歴はユーザーログ（`~/.local/state/gitflow-guard/repos/<repo>-<hash>/audit.jsonl`）に記録されます。

チャットでの確認やトークンストアは不要です。センシティブなマージ（production / archive）は単に **人間限定** となっており、エージェントは PR/MR の起草までを担当し、マージのクリックは人間が行います。

### 設計原則 — なぜ機能するのか

#### 1. 設定が唯一の信頼できる情報源（Single Source of Truth）

ブランチ名やルールは一切ハードコードされていません。`integration` は組み込みデフォルト（`develop`）として提供され、`preview` / `production` / `archive` は任意の配列（完全一致名または正規表現）として、それぞれの `update` と `mergeBy` を設定してデフォルトの上にディープマージされます。単一の `develop` から企業の多環境パイプラインまで同一バイナリでスケールします。

#### 2. 実行後検知ではなく、実行前ブロック

プラグインはツールの `tools/pre-execute`（コマンドがディスパッチされる直前の決定ポイント）にフックします。ここで `deny` されたコマンドは **一切実行されません**。エージェントは拒否結果のみを受け取ります。事後検出（ログスキャン）は強制手段として機能しません — 被害はすでに発生してしまっているからです。

#### 3. 重要なマージにおける改ざん不可能な人間の介在

プラグイン自身が「この本番マージは許可して良いか？」を判断することはありません。エージェントによるマージ操作を一律に拒否することで、**人間が PR/MR 画面でマージボタンを押すこと** を唯一の合流経路にします。エージェントが偽造できるトークンや許可証、チャットメッセージは存在しません。

---

## 設定リファレンス

### 組み込みデフォルトとディープマージ

本ガードは **設定ファイルなしで最初から有効** です。以下の保護が標準で適用されます：

| デフォルト値 | 役割 | ルール |
|---|---|---|
| `develop` | **integration** | 直接プッシュ禁止、PR/MR 経由で更新 (`update: "pr"`) |
| `main` | **archive** | 直接プッシュ禁止、エージェントによるマージ禁止 (`mergeBy: "user"`) |

`gitflow-guard.config.json` を作成した場合、その内容は **デフォルト設定の上にディープマージ** されます。記述したフィールドや役割のみがデフォルトを上書きし、未記述の項目はデフォルト値が維持されます。変更したい項目のみを記述してください：

```jsonc
{
  "branches": { "production": ["release-[\\w-]+"] }  // develop と main は維持され、production が追加される
}
```

**ガードを完全に無効化する**（トランクベース開発など）：`{ "enabled": false }` を指定します。誤ったブロックが発生した場合も 1 ファイルの変更で解除できます。`gitflow-guard status` を実行すれば、現在どの設定が有効になっているかをいつでも確認できます。

### ブランチの役割モデル

**役割（Role）** はブランチ名（または正規表現）を一連のルールセットにマッピングします。`integration` はデフォルトで提供され、それ以外の役割はすべて任意です。

```text
feature ブランチ ──(自由)──> integration (統合ブランチ; PR/MR 経由で更新)
                                 │
                                 ├──> preview (任意; 検証環境用; PR/MR 経由で更新)
                                 │
                                 └──> production (任意; PR/MR + 人間のみがマージ可能)
archive (任意; リリース後に人間がアーカイブ)
```

| 役割 | 設定キー | 必須？ | 強制される動作 |
|---|---|---|---|
| **feature** | `featurePattern` | — | 自由: commit / push / 同期 / rebase が可能 |
| **integration** | `branches.integration` | デフォルトあり (`develop`) | 直接プッシュ禁止 (デフォルト `pr`); feature から PR/MR 経由で合流 |
| **preview** | `branches.preview` (配列) | 任意 | 直接プッシュ禁止; PR/MR 経由のみで更新 (検証環境) |
| **production** | `branches.production` (配列) | 任意 | PR/MR 経由のみ; マージは人間限定 (`mergeBy: "user"`) |
| **archive** | `branches.archive` (配列) | デフォルトあり (`main`) | エージェントによる PR/MR 起草は可能; マージは人間限定 |

### ブランチ名とルールのカスタマイズ例

**小規模チーム（個人 / 2〜3人）— 最小構成（integration のみ）：**

```jsonc
{
  "enabled": true,
  "featurePattern": "feature/[\\w-]+",
  "branches": { "integration": ["develop"] }
}
```

**中〜大規模チーム（複数 preview 環境 + production + archive）：**

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

### 全フィールド詳細リファレンス

```jsonc
{
  "enabled": true,                     // デフォルト true — false でガードを無効化
  "featurePattern": "feature/[\\w-]+", // 作業/feature ブランチにマッチする JS 正規表現
  "branches": {
    "integration": { "branches": ["develop"], "update": "pr" },  // デフォルト: ["develop"] — 省略時は維持
    "preview":     { "branches": ["ita1"], "update": "pr" },     // 任意
    "production":  { "branches": ["prd"], "update": "pr", "mergeBy": "user" }, // 任意
    "archive":     ["main"]                                      // 任意
  },
  "worktree": {                        // 任意: ワークツリーと上流ベースラインガード
    "requireCleanOnPr": false,         // PR 作成前にステージ/未ステージ変更のクリーンを要求 (デフォルト false)
    "requireCleanOnMerge": false,      // マージ前にワークツリーのクリーンを要求 (デフォルト false)
    "allowUntracked": true,            // 未追跡ファイル (??) を許可するか; false で存在時にブロック (デフォルト true)
    "requireUpstreamSynced": false     // PR 作成前に上流ベースラインとの同期を要求 (デフォルト false)
  },
  "locale": "en",                      // 任意: メッセージ言語 — 登録済み locale ('en'/'zh' 組み込み); 未登録値は status で警告され英語にフォールバック
  "strict": false,                     // 任意: fail-closed モード — 設定エラーや内部エラー時に警告放行ではなくブロックする
  "ci": { "enabled": true }            // 任意: gh pr checks を参考情報として記録
}
```

- 各役割には **配列**（短縮形）または **オブジェクト** `{ branches, update?, mergeBy? }` を指定できます。
- `update`: `pr`（デフォルト）= PR/MR 経由でのみ合流可能; `flexible` = 直接プッシュおよびローカルマージを許可（小規模チーム向け）。
- `mergeBy`（production）: `user`（デフォルト）= 人間のみがマージボタンをクリック可能; `anyone` = PR マージを許可。
- **ワークツリーと上流ベースラインガード (`worktree`)**: 任意の状態および乖離度チェック —— `requireCleanOnPr: true` は未コミットのステージ/未ステージ変更がある場合に PR 作成をブロックします。`requireCleanOnMerge: true` はワークツリーがダーティな状態でのローカルおよび PR マージをブロックします。`allowUntracked`（デフォルト `true`）は未追跡ファイル（`??`）を摩擦なく許可し、人間と AI の厳格な共同開発環境では `false` に設定してブロックできます。`requireUpstreamSynced: true` はブランチが上流ベースラインより遅れている場合に PR 作成をブロックします。複合コマンド（例: `git add . && git commit && gh pr create`）では後続セグメントに対してクリーン状態が動的にシミュレートされます。
- 各ブランチ項目は完全一致名または正規表現（自動判別）です。**正規表現の安全性**: ブランチパターンはそのままコンパイルされるため、`featurePattern` やブランチエントリで壊滅的なバックトラッキングを引き起こす構文（`(\w+)+` などのネストされた量詞）は避けてください。
- **言語設定**: メッセージはデフォルトで英語です。`"locale": "zh"` を追加すると中国語に切り替わります。また、任意の `gitflow-guard` サブコマンドに `--locale <en|zh>` を渡すこともできます（優先順位: CLI フラグ > プロジェクト設定 > 英語）。`--help` や未知のコマンド通知、空の監査ログ行など、すべての CLI フレームワークテキストが locale に追従します。
- **カスタム言語の登録**: 下流パッケージは実行時に言語を追加できます — `import { registerLocale } from 'agents-gitflow-guard'`、内蔵の英語辞書と同じキーセットを持つ辞書を渡して `registerLocale('fr', frDict)` を呼び出し、プロジェクト設定で `"locale": "fr"` を指定します。

  ```js
  import { registerLocale, MESSAGE_KEYS } from 'agents-gitflow-guard'
  // MESSAGE_KEYS は辞書が定義すべき全キーを列挙しています（組み込み英語と同じキーセット）。
  // キーの不足や過剰がある場合、登録時にエラーをスローします。
  const fr = { /* MESSAGE_KEYS ごとに定義、例: */ 'deny.header': ({ why }) => `[gitflow-guard] bloqué : ${why}` }
  registerLocale('fr', fr)
  ```
- **未登録言語**: 登録されていない `"locale"` 値は、インターセプト処理中に自動的に英語にフォールバックします（フック処理が言語の不備で停止しないための設計です）。タイポがある場合は `gitflow-guard status` に警告が表示されます。
- **バリデーション**: 役割間で重複するブランチ定義は拒否されます。無効な正規表現も拒否されます。**設定エラーがある場合、不完全な推測設定を適用するのではなく、プロジェクトのガードを「無効」として扱い報告します**。デフォルトの役割と同じブランチ名でオーバーライドする場合（例: デフォルトの archive が `main` のまま `main` を integration に設定する）は重複エラーとなりますので、もう一方の役割も明示的に上書きまたは削除してください。
- **Strict モード**: デフォルトでは壊れた設定に対して stderr に 1 回警告を出力した上でコマンドを通過させます（fail-open、タイポでツールチェーンが停止するのを防ぐため）。`"strict": true` を指定すると、設定エラーや内部エラー時に **ブロック** します（fail-closed、高リスクリポジトリ向け）。明示的な `enabled: false` は通知を出さず静かに停止します。また、*ファイルが存在しないこと* はエラーではなく、組み込みデフォルト（develop+main）が有効になります。

---

## 判定マトリクス — ブロック対象と許可対象

| エージェントの操作 | ガード判定 |
|---|---|
| feature ブランチでの commit / push / 同期 / rebase / 読み取り専用操作 | ✅ allow（許可） |
| integration / preview / production / archive への直接 push / force-push / 削除 | 🚫 block（ブロック。integration/preview に `flexible` 設定時は直接 push 許可） |
| PR/MR: feature → integration / preview | ✅ allow（許可） |
| PR/MR: feature → production | ✅ 作成は許可; **マージはブロック**（人間が UI 上で実行） |
| archive 宛ての PR/MR | ✅ 作成は許可; 🚫 **マージはブロック**（人間が UI 上で実行） |
| integration / preview 上でのローカル `git merge feature/x` | 🚫 block（PR/MR 必須。`update: flexible` の場合は許可） |
| 連結コマンド (`checkout develop && merge feature/x`) | 🚫 block（ブランチ切り替えはセグメントごとにシミュレートされ回避不可） |
| 保護ブランチの強制再作成 (`git checkout -B/-C <ブランチ>` / `git switch -C`) | 🚫 block（ref-update ゲートで阻止） |
| `git symbolic-ref` による保護ブランチの付け替え・削除 | 🚫 block（ref-update ゲートで阻止） |
| integration / preview / production / archive 上での `git cherry-pick` / `git revert` | 🚫 block（保護ブランチ上の履歴改変を阻止。`-n` / `--no-commit` や `--abort`/`--continue`/`--skip`/`--quit` は通過） |
| `sudo` でラップされた Git コマンド | 🚫 ラッパーが剥がされ (`sudo -u …` 含む)、内部の Git コマンドが判定される |

> 意図的にブロックしない対象（後から誤って塞いでしまわないための仕様）: `git tag -f`（タグの移動はブランチの役割範囲外であるため免除、`push --tags` と同様）、および保護ブランチ上での通常の `git commit`（その後の `git push` がブロックされるためリモートは汚染されません）。

PR/MR ターゲットは `gh pr view` (GitHub) または `glab mr view` (GitLab) 経由で解決されます。プラットフォーム CLI がない場合、プラグインは安全側に倒れて動作します。

---

## 人間がコントロールを保持するポイント

- **Production マージ** と **Archive マージ** はデフォルトでユーザー限定です。エージェントは PR/MR の起草を支援できますが、**マージボタンをクリックするのは人間** です — そのクリック自体が確認となります。この決定を委譲するための外部パーミットストアは存在しません。
- すべての拒否操作はユーザーレベルの監査ログ（`gitflow-guard audit`）に追記され確認可能です。

---

## インストール詳細

**前提条件**: `PATH` に **Node.js ≥ 22** がインストールされていること（パッケージの `engines` 下限および CI マトリクスの最低階層）。全クライアント共通で **同じ npm パッケージ** `agents-gitflow-guard` を使用します — マウントと配線手順のみが異なります。

| クライアント種別 / プラットフォーム | インストールコマンド | 配線・マウント手順 |
|---|---|---|
| Claude Code · Codex · OpenCode · Antigravity | `npm i -g agents-gitflow-guard` | `gitflow-guard wire --client <name> --project --yes` |
| DeepSeek Harness (DSH) | `dsh plugin --profile web add agents-gitflow-guard` | DSH を再起動 — プロファイル層として自動マウント |
| Pi | `npm i -D agents-gitflow-guard` | `pi/gitflow-guard.ts` を `.pi/extensions/` にコピー |

### 1. 独立した CLI フック系クライアント (Claude Code · Codex · OpenCode · Antigravity)

CLI をグローバルに 1 回インストールし、**クライアントごとに 1 つのコマンドを実行して配線します**（ガードは組み込み設定によりデフォルトで有効なため、配線のみで完了します）：

```bash
npm i -g agents-gitflow-guard   # `gitflow-guard` バイナリを提供
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

`wire` は既存の設定ファイル（存在する場合）を読み込み、他の設定に触れずにフックエントリを安全にマージします。冪等性があり（配線済みの場合はスキップ）、`--dry-run` によるプレビューや `--unwire` による削除に対応し、`--global` ファイルを変更する前には必ず確認を求めます。書き込まれる正確な設定ファイルの内容は以下の通りです（手動で作成する場合の参照用）：

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
// OpenCode — `.opencode/plugins/gitflow-guard.ts`（パッケージ同梱の `opencode/gitflow-guard.ts` の複製;
// OpenCode 1.18+ では hooks.yaml が廃止され、拡張ポイントが plugins（`tool.execute.before` イベント、
// 拒否 = 例外スロー）に移行しました。`wire --client opencode` が自動的に配置します）
```

```json
// Antigravity (Google) — .agents/hooks.json
// (agy hook プロセスの cwd は設定ファイルのあるディレクトリとなるため、bin/ への相対パスは失敗します。
// `wire` はプロジェクト単位では絶対パス、グローバルでは PATH 上の gitflow-guard を書き込みます。
// ここではグローバルインストールの形式を示しています。)
{
  "gitflow-guard": {
    "PreToolUse": [
      { "matcher": "run_command", "hooks": [ { "type": "command", "command": "gitflow-guard check --platform antigravity" } ] }
    ]
  }
}
```

### 2. プロセス内プラグイン・拡張機能 (DSH · Pi)

- **DeepSeek Harness (DSH)**：
  ```bash
  dsh plugin --profile web add agents-gitflow-guard
  ```
  インストール後に DSH を再起動します。パッケージは `dsh.bundle.patch` を宣言しているため、`dsh plugin add` によって自動的にプロファイル層として組み込まれ、手動でのプロファイル編集は不要です。アップグレード時も同じコマンドを実行して再起動します。

- **Pi**：
  Pi はプロセス内拡張として読み込まれます（stdin ペイロードや子プロセスフックはありません）。パッケージ同梱のエントリポイントをプロジェクトに配置し、パッケージを devDependencies に追加します：
  ```bash
  npm i -D agents-gitflow-guard
  mkdir -p .pi/extensions
  cp node_modules/agents-gitflow-guard/pi/gitflow-guard.ts .pi/extensions/gitflow-guard.ts
  ```
  `.pi/settings.json` に設定します：
  ```jsonc
  // Pi — .pi/settings.json (extensions のパスは .pi からの相対パスで解決されます)
  { "extensions": ["extensions/gitflow-guard.ts"] }
  ```

### 3. ソースコードからのインストールと開発 (From Source)

コントリビューター、または最新のソースコードチェックアウトで直接実行・デバッグを行いたい方向け：

```bash
# クローンとビルド
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build
```

利用するエージェントプラットフォームに応じてローカルビルドをマウントします：

```bash
# A. CLI Hook クライアント (Claude Code · Codex · OpenCode · Antigravity)
npm link # または npm install -g .
gitflow-guard wire --client <claude|codex|opencode|antigravity> --project --yes

# B. DeepSeek Harness (DSH)
dsh plugin --profile web add file:/path/to/AgentsGitFlowController
# またはスクリプトを実行: node scripts/install-dsh.mjs web (インストール後 DSH を再起動)

# C. Pi
npm link
# またはリポジトリ内の pi/gitflow-guard.ts を対象プロジェクトの .pi/extensions/ に直接コピー
```

### 4. GitHub Copilot について

**GitHub Copilot — 意図的に専用フックを提供していません。** Copilot には、ツールごとの **allow/deny/ask** 権限設定およびプロジェクト **rules** (`rules.json` + `AGENTS.md`) というネイティブなガードレール機能がすでに備わっています。Copilot ユーザーにはプラグインのフックではなく公式ドキュメントを参照することを案内してください：

- [ツール使用の許可と拒否 (GitHub Docs)](https://docs.github.com/ja/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools)
- [Copilot コーディング エージェントへのカスタム ルールの追加 (GitHub Docs)](https://docs.github.com/ja/copilot/customizing-copilot/adding-custom-rules-for-the-copilot-coding-agent)
- 任意: コマンドレベルのインターセプトを行いたい場合、Copilot にも公式の [hooks システム](https://docs.github.com/ja/copilot/reference/hooks-reference) (`preToolUse` → `permissionDecision:"deny"`) が存在します。

### 5. Hook メカニズムと技術仕様

- **プラットフォームプロトコル仕様**: Hook は stdin からペイロードを読み取り、各プラットフォームの仕様に従って応答します：
  - **Claude Code / OpenCode**: `exit 2`（stderr に拒否理由と次のステップを出力）。
  - **Codex**: stdout に JSON `{"hookSpecificOutput":{"permissionDecision":"deny",...}}` を出力。
  - **Antigravity**: stdout に JSON `{"decision":"deny","reason":...}` を出力し、`exit 0` を維持（プラットフォーム要件）。
  - **Pi**: プロセス内拡張が `tool_call` イベントをリッスンし、`{ block: true, reason }` を返却。
- **事前イベントのみをインターセプト**: コマンド実行*前*にブロックを行うため、事後のクリーンアップやパーミットトークンの消費処理は一切不要です。
- **PATH とバイナリの解決**: グローバルインストールにより `gitflow-guard` バイナリが提供されます。エージェントの子プロセスがユーザーの `PATH` を継承しない場合は、`npm bin -g` が返す絶対パスを設定してください。
- **初期状態で有効**: 組み込みデフォルト設定（`integration: ["develop"]`, `archive: ["main"]`）により、設定ファイルなしで即座に機能します。カスタム設定は自動的にディープマージされます。
- **非破壊的な配線**: `gitflow-guard wire` は既存のフックに影響を与えることなく安全にマージし、`--unwire` で正確に対象エントリのみを削除します。

---

## よくある質問 (FAQ)

### ブランチ名がデフォルトと異なる場合でも利用できますか？

はい。ブランチ名は一切固定されていません。`integration` は組み込みデフォルト（`develop`）として提供され、カスタム設定はその上にディープマージされます。そのエントリ（および `preview` / `production` / `archive` のエントリ）には、任意の完全一致ブランチ名または正規表現パターンを指定できます。`featurePattern` はエージェントに作業ブランチの判定方法を伝えます。

例えば、統合ブランチを `master` と呼び、`beta` プレビューブランチを追加し、feature ブランチに `fix/` プレフィックスを付けるチームは、それをそのまま設定ファイルに記述するだけで動作します。すべてのブロック、レポート、監査ログがその名前に従って出力されます。強制される規約は一切なく、あなたが宣言したマッピングのみに従います。[ブランチ名とルールのカスタマイズ例](#ブランチ名とルールのカスタマイズ例) を参照してください。

---

### preview / production / archive はすべて設定する必要がありますか？

いいえ。実際に運用している役割のみを設定してください。`develop` のみを使用する個人開発のリポジトリであれば `integration: ["develop"]` のみを設定し、他は設定不要です。10 個の環境を運用する企業チームであれば `preview` 配列と `production` 役割を追加します。それ以外は無効のままとなります。

---

### これはセキュリティツールですか？

いいえ。セキュリティツールとしては扱わないでください。本プラグインはワークフローガードであり、合意された開発プロセスを機械的に強制するためのツールです。テキストベースのコマンド認識は本質的にベストエフォートであり、意図的にコマンドを難読化しようとするエージェントはパーサーを回避する可能性があります。

サポートされているコマンド構文の範囲内において、役割の境界はローカルで厳格に強制されます。保護された役割ブランチ（integration / preview / production / archive）への合流には、設定されたパス（PR/MR、または本番/アーカイブの手動マージ）が必須となります。一般的な難読化ラッパーは分類・ブロックの対象となっています — shell ラッパー（`sh -c` / `bash -lc`）、サブシェルおよびバッククォート/`$()` ネスト、`env`/`command`/`nohup`/`xargs`/`sudo` プレフィックスおよび `VAR=x` 代入、絶対パス、パイプラインおよび `||` 後続コマンド、Git グローバルオプション（`-C .`、`--git-dir=…`）、ワイルドカード refspec（`refs/heads/*:refs/heads/*`）、fetch+merge として使用される `git pull`、ならびに `send-pack`/`update-ref`/`symbolic-ref` などの plumbing コマンド。保護ブランチの強制再作成（`checkout -B`/`switch -C`）および保護ブランチ上での cherry-pick/revert は ref-update / ref-move ゲートによってブロックされます。実行可能な敵対的テストコーパスは `tests/accuracy-audit.spec.ts` に配置されています。

**ローカル側で防御不能** な経路として残るもの：Git ホスティングサービスの API を直接叩く操作（`gh api repos/…/pulls/N/merge`、`curl`）や、インタプリタの子プロセス内からの実行（`node -e "child_process.exec('git push …')"`）。また、任意の深さのクォートやエンコード変換は性質上ベストエフォートとなります。また、`$()` やバッククォートの入れ子が 10 階層を超える場合は展開されません(パーサーは異常な入力でクラッシュするのではなく、展開を停止します)。真に回避不能な境界は、ホスティングサービス側のブランチ保護ルールに存在します。本ガードを即時フィードバックおよび監査証跡ツールとして位置づけ、サーバー側の保護と併用してください。

---

### なぜエージェント自身に本番・アーカイブへのマージを実行させないのですか？

ゲートがそれらのアクションを **人間限定（User-only）** として分類しているためです。プラグインは本番およびアーカイブに対する *マージ操作* を拒否します — *PR/MR の作成は許可されている* ため、エージェントは依然として `develop` → `main` のアーカイブ PR を起草できます。しかし、マージの実行には **人間がマージボタンをクリックすること** という唯一の経路しかありません。エージェントが自身にその権限を付与するために使用できる許可証やトークン、チャットメッセージは存在しません。

---

### `gh` または `glab` CLI のインストールは必須ですか？

いいえ、必須ではありません。これらは `pr merge` / `mr merge` がどのブランチをターゲットにしているかを解決するためだけの任意のオプショナルアダプターです。これにより、ゲートは「integration/preview へのマージ（許可）」と「production/archive へのマージ（拒否）」を判別します。いずれの CLI もターゲットを確認できない場合（未インストール、未認証、オフライン、またはクエリ失敗時）、ゲートは feature ブランチから実行された場合であっても **マージを一律に拒否** します（その PR が実際には本番やアーカイブをターゲットにしている可能性があるためです）。CLI が利用可能になってから再試行するか、人間が UI 上でマージをクリックしてください。その他の機能はすべて通常通り動作します。コアの検証ロジックは外部サービスと通信しないため、GitHub、GitLab、セルフホスト環境、完全オフライン環境のいずれでも全く同じ挙動を示します。

---

### 通常の開発作業が妨げられることはありますか？

意図的に妨げられないよう設計されています。feature ブランチで行うべきすべての作業 — コミット、プッシュ、統合ブランチからの同期、リベース、読み取り専用コマンドでの確認、`gitflow-guard status` の実行など — は何一つ摩擦なく許可されます。

ブロックされるのは次の操作のみです：(1) 保護された役割ブランチへの直接の書き込み、(2) エージェントによる本番またはアーカイブへのマージ試行。もし誤認と思われるブロックが発生した場合は、`gitflow-guard status` を実行してください。各ローカルブランチがどの役割に割り当てられているかが正確に表示され、設定ミスを迅速に特定・修正できます。

---

### 設定ファイルに記述ミスがあった場合はどうなりますか？

不完全な推測設定が誤って適用されることは決してありません。バリデーションエラーが発生した場合、そのプロジェクトのガードは無効化され、エラー内容がレポートされます。

よくあるミス：デフォルトの役割と同じブランチ名でオーバーライドすること（例: デフォルトの archive が `main` のまま `main` を integration に設定する — 明示的な重複エラーとなります。もう一方の役割も明示的に上書きまたは削除してください）、同一ブランチを 2 つの役割に重複設定すること（拒否）、コンパイルできない `featurePattern`（無効な正規表現として拒否）。エラーは明確に通知され、ファイルはシンプルな 1 つの JSON オブジェクトであるため、通常は 30 秒程度で修正できます。

---

### プラグインはローカルリポジトリの何を検証しているのですか？

現在チェックアウトされているブランチ（`git branch --show-current`）、および `pr merge` / `mr merge` 実行時の PR/MR ターゲット（`gh pr view` / `glab mr view` 経由）のみです。モデルは順序駆動ではなく **役割駆動**（ターゲットがどの役割のブランチか）であるため、コミットの祖先関係を解析する必要はありません。

ディスクへの書き込みやリモートへの通信は行われず、コアチェックにホスティングサービスの機能は不要です。エージェントによる本番・アーカイブへのマージは単に拒否され、人間によるマージは Web UI 上で実行されます。

---

### ライセンス / 費用について

MIT ライセンスで提供されており、完全無料・無条件で利用できます。使用、改変、再配布は自由であり、唯一の義務は著作権表示を保持することです。

もしこのツールがチームの開発フローにおける誤操作を未然に防ぐのに役立ちましたら、ページ上部のコーヒーボタンよりご支援いただけると幸いです（必須ではありません）。[ライセンス](#ライセンス) を参照してください。

---

## 用語集

| 用語 | 意味 |
|---|---|
| **integration** | 基本となる統合ブランチ、コアの役割（組み込みデフォルト: `develop`）。feature は PR/MR 経由で合流する。保護対象。 |
| **preview** | 任意の検証環境エンドポイントブランチ（`branches.preview` 配列）。PR/MR 経由でのみ更新可能。 |
| **production** | 任意の本番ブランチ（`branches.production` 配列）。PR/MR 経由 + マージは人間限定。 |
| **archive** | 任意のリリース後アーカイブブランチ（`branches.archive` 配列）。エージェントは PR/MR 起草可能、マージは人間限定。 |
| **feature ブランチ** | `featurePattern` に一致する作業ブランチ。制限のない自由作業領域。 |
| **判定マトリクス (Gate Matrix)** | 分類された各コマンドの許可/拒否を定義する決定テーブル。 |
| **pre-execute** | コマンド実行前にフックして拒否を行うツールパイプラインのフックポイント。 |
| **人間限定マージ (Merge-by-user)** | 本番/アーカイブへのマージ権限を人間の手に残す設計。PR/MR 上でのクリックが確認となる。 |

---

## ロードマップ

今後の拡張計画および現在アクティブに探索中の領域：

- **新しいエージェントプラットフォームの統合**: Cursor、Windsurf、次世代 CLI エージェントなど、新興ツールのフック/拡張機構の調査と適合。
- **監査ログの集約**: 複数マシン間での監査ログ同期およびチームレベルのコンプライアンス出力フォーマットの提供。
- **ワークフロープリセット**: 一般的なブランチモデル（トランクベース開発、多環境エンタープライズ構成など）向けの設定プリセット。
- **CI ハードゲート連携**: ゼロ依存のローカル実行性を保ちつつ、ネイティブな CI パイプライン連携および PR チェック連携を探索。

リリース履歴と詳細については [CHANGELOG.md](CHANGELOG.md) をご覧ください。

---

## 開発

```bash
npm install
npm test              # 単体テスト: classify / gate / config / cli / repo / platform / i18n / index / accuracy-audit / pi
npm run typecheck     # 型チェック: tsc --noEmit, 0 Error
npm run build         # ビルド: tsdown → lib/ (CLI とプラグインで共有)
npm run check:pins    # package.json バージョンと CHANGELOG 見出し・README 内のピン留め整合性チェック
npm run verify:matrix # 連続回帰マトリクステスト: DSH ロジック + zh ロケール + 複数クライアント hook + Pi 拡張
```

- **品質ルール**: すべてのロジック変更は型チェック（0 エラー）、単体テスト全緑、および連続回帰マトリクス（`verify:matrix`）の通過が必須です。
- **クライアント追加**: 新しいエージェントプラットフォームを追加する際は、[AGENTS.md](AGENTS.md) §8 の同期チェックリストに従ってください。

---

## サポート

本プラグインは完全無料のオープンソース（MIT）です。もしチームの開発フロー保護にお役に立ちましたら、コーヒー 1 杯のご支援をいただけると励みになります：

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/keanz21)

---

## ライセンス

[MIT](LICENSE) © FeatureAgents
