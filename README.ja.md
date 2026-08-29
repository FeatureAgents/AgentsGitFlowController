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
- [サポート](#サポート)
- [開発](#開発)
- [ライセンス](#ライセンス)

---

## クイックスタート — 30秒でリポジトリを保護

**ステップ 1 — インストール。** 6 つのクライアントすべてが共通の npm パッケージ `agents-gitflow-guard` を使用します。ご利用のエージェント種別に応じて選択してください：

```bash
# モード A: CLI Hook クライアント (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# モード B: DSH プロセス内プラグイン（インストール後に DSH を再起動してください）
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# モード C: Pi プロセス内拡張
npm i -D agents-gitflow-guard
```

> **注意**: 単純な `add` または `npm i` は npm レジストリから最新版をインストールします。ミラーのキャッシュ遅延がある場合やバージョンを固定したい場合は、末尾に `@<version>` を指定してください（例: `npm i -g agents-gitflow-guard@<version>`）。（DSH ユーザーへ: pnpm の peer-dependency に関する *warning* は想定内です — DSH は起動時に共有プロファイルモジュールのフォールバックを通じて `@deepseek-ai/cordis` / `@deepseek-ai/dsh-tools` を提供するため、プラグインは正常に動作します。）
>
> フック系クライアント（Claude Code · Codex · OpenCode · Antigravity）は、インストール後に配線（wire）コマンドを **1 回実行** する必要があります（下記参照）。Pi はファイルコピーが必要です。DSH はインストール時に自動配線されます。

**ステップ 2 — クライアントの配線（設定ファイル不要）。** 本ガードは、**デフォルトで `develop` (integration) と `main` (archive) を保護する組み込み設定** を備えており、設定ファイルなしで最初から有効になっています。必要なのは、AI クライアントにガードを呼び出すよう設定することだけです（DSH は自動配線、Pi はファイルコピーのみ）：

```bash
# Claude Code → このリポジトリの .claude/settings.json
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity（各クライアント専用の設定ファイルに書き込み。--yes で確認をスキップ）
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

`wire` コマンドは既存の設定に **非破壊的** にマージされ（既存のフックはそのまま保持されます）、デフォルトで **プロジェクトディレクトリ** に書き込まれます。`--global`（マシン内の全リポジトリに適用）を実行する場合は必ず確認を求められます（`--yes` でスキップ可能）。クライアントごとのファイルと形式の詳細は [インストール詳細](#インストール詳細) を参照してください。

> ⚠️ **デフォルトで main は保護されています。** トランクベース開発（全員が単一ブランチに直接プッシュする運用）を行っている場合、明示的に無効化するまで直接の `main` プッシュはブロックされます — 無効化するには `{ "enabled": false }` と書いた `gitflow-guard.config.json` を作成するか、独自のブランチマッピングを設定してください（[設定リファレンス](#設定リファレンス) 参照）。`gitflow-guard status` を実行すると、組み込みデフォルト設定が有効である旨の通知が表示されます。

**ステップ 3 — 動作確認。** エージェントに `git push origin develop` を実行させてみてください。ツール呼び出しが拒否されることを確認できます：

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

メッセージはデフォルトで英語です。設定ファイルに `"locale": "zh"` を指定することで中国語に切り替えることも可能です（[設定リファレンス](#設定リファレンス) 参照）。

**完了です。** 組み込みのデフォルト設定でリポジトリの保護が有効になりました。より多くのステージ（`preview` / `production`）を追加したり、ブランチ名を変更したい場合は、変更したい項目のみを記述した `gitflow-guard.config.json` を作成してください（未記述の項目はデフォルト値が維持されます）。全判定ルールの一覧は [判定マトリクス](#判定マトリクス--ブロック対象と許可対象) をご覧ください。

### エンドツーエンドの全体フロー例

シナリオ: チームでログイン画面機能（`feature/login-page`）を開発する場合。`develop` が集成分支、`main` がアーカイブブランチです。各ステップでの挙動は以下の通りです：

| # | エージェントが実行するコマンド | ガードの判定 | 実際の挙動 |
|---|---|---|---|
| 1 | `git checkout -b feature/login-page` (develop から) | ✅ allow（feature ブランチでの作業は自由） | ブランチが作成される |
| 2 | `git add . && git commit -m "feat: login"` | ✅ allow | コミットされる |
| 3 | `git push -u origin feature/login-page` | ✅ allow（feature ブランチのプッシュは自由） | プッシュ成功 |
| 4 | `git checkout develop && git merge feature/login-page` | 🚫 **deny** — integration ブランチは PR/MR 経由のみ | develop への PR/MR 作成を促される |
| 5 | `gh pr create --base develop` | ✅ allow（PR 経由の統合） | PR が作成され、人間がレビューしてマージ |
| 6 | `git push origin main` または main へのマージ | 🚫 **deny** — archive へのマージは人間限定 | リリース後に人間自身が develop → main をマージ |

エージェントが **実行できない** ことに注目してください：feature を直接 `develop` にマージすることや、`main` に触れることはできません。すべてのセンシティブなマージは、PR/MR 画面または自分自身のターミナルでの意図的な人間の操作として行われます。

---

## 導入の理由 — このプラグインが解決する課題

AI コーディングエージェントはリポジトリ内で直接作業します。システムプロンプトやプロジェクト指示ファイル（`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`.cursorrules` など）を通じて、「feature ブランチで開発し、PR 経由で集成分支にマージし、本番/アーカイブのマージは人間に任せる」というワークフローが *指示* されています。

**しかし、これは「ソフトな規則」に過ぎません。** エージェントは規則をスキップしたり、順序を入れ替えたり、単に「忘れたり」します — 悪意からではなく、LLM にとってテキストの指示は任意のものだからです。

本プラグインは、そのソフトな規則を **「ハードな機械的制約」** に変換します。エージェントが試みるすべての Git 操作は、*ローカルリポジトリの実際の状態* に基づいて判定されます。違反はコマンド実行前に即座にブロックされ、理由と次の手順が通知されます。

ルールを記憶し続ける必要はありません — システムがルールを強制します。

---

## 対象ユーザー — 利用シナリオとチーム

### 本プラグインが適しているケース

- 単一の `develop` 集成分支から、複数ステージの preview/production パイプラインまで、定義されたブランチフローを運用している（または運用したい）。
- エージェントが勝手に保護ブランチに直接プッシュしたり、マージしてはならないブランチにマージしてしまった経験がある。
- レビュー漏れに依存せず、機械的にブランチ保護を徹底したい。
- 複数の機能が並行開発され、共有の preview 環境に集約されるため、より厳格なステージへの合流をレビュー必須にしたい。

### 具体的な利用シナリオ

1. **個人開発者 + エージェント（受託・クライアント案件）**: タスクを渡したエージェントが「親切心」で集成分支に直接プッシュする事故を防止。設定ファイルを置くだけで、人間が見ていない間もエージェントは保護ブランチに触れなくなります。
2. **小規模チーム（3〜10人）+ CI 自動デプロイ環境**: マージ時に自動デプロイされる環境で、エージェントが未レビューのまま `develop` にマージする事故を防止。
3. **複数環境パイプラインを持つ企業環境**: 多数の preview エンドポイントと本番・アーカイブ環境を運用。各役割を設定するだけで、追加ルールなしでスケール可能。
4. **非同期コラボレーション**: 自分がオフラインの間もエージェントの暴走を防ぎ、本番・アーカイブへのマージ権限を確実に保持。

**適していないケース**（[制限事項](#制限事項--誠実な限界) も参照）：

- **トランクベース開発** — 全員が 1 つのブランチに直接コミット・プッシュする運用（常にブロックされてしまいます）。
- **フローが定義されていない個人用リポジトリ** — 強制する対象がなく、価値を発揮しません。
- **ブランチに役割を持たせたくないチーム** — 少なくとも 1 つの `integration` ブランチが必要です。

---

## 主な機能 — できること

- **実行前ブロック**: 保護対象ブランチ（integration / preview / production / archive）への直接プッシュ、強制プッシュ、ブランチ削除、およびエージェントによる production / archive へのマージをコマンド実行前に阻止。
- **柔軟な役割ベース設計**: `integration`（デフォルト: `develop`）を基本とし、`preview` / `production` / `archive` に任意のブランチ名や正規表現を配列で指定可能。更新ルール（`pr` / `flexible`、`mergeBy`）も個別に設定可能。
- **人間限定マージ（Merge-by-user）**: 本番およびアーカイブへのマージはエージェントによる実行を拒否。PR 画面で人間がマージボタンをクリックすることが唯一の確認となります。
- **任意の命名規約に対応**: ブランチ名は設定によってマッピングされ、ハードコードされていません（[設定リファレンス](#設定リファレンス) 参照）。
- **完全な監査ログ**: すべての拒否ログはユーザー状態ディレクトリ（`~/.local/state/gitflow-guard/`、Windows の場合は `%LOCALAPPDATA%\gitflow-guard`）に記録。リポジトリ外に保存されるため、コミットされたりエージェントのサンドボックスから改ざんされる心配がなく、リポジトリの全 linked worktree で共有されます。
- **プラットフォーム非依存**: 純粋なローカル Git で動作。PR/MR のターゲット判定のために `gh` (GitHub) や `glab` (GitLab) を任意で参照しますが、CLI がなくても安全側に倒れて動作します。

---

## 制限事項 — 誠実な限界

- **セキュリティ境界ではありません。** コマンド解析はベストエフォートです。悪意を持って高度に難読化されたコマンドはテキスト解析をすり抜ける可能性があります。
- **CI 上のハードゲートではありません。** CI ステータスは参考情報としてログ記録されるのみです。真のブランチ保護は GitHub/GitLab 側のブランチプロテクション設定で行い、本プラグインと併用してください。
- **フロー自体の代替ではありません。** リポジトリに少なくとも 1 つの `integration` ブランチが存在する必要があります。
- **本番・アーカイブのマージ自動化ツールではありません。** 人間による意図的なクリックを必須とする設計のため、エージェントによるマージは拒否されます。

---

## サーバー側のブランチ保護との違い

サーバー側のブランチ保護（GitHub ブランチ保護ルール、GitLab 保護ブランチ）と本プラグインは **異なる課題を解決** します。互いに排他ではなく、補完し合う関係です。

| 比較項目 | サーバー側のブランチ保護 | 本プラグイン |
|---|---|---|
| 管轄対象 | 保護ブランチにプッシュ/マージできる **ユーザー権限** | エージェントがワークフローのどの **役割** に合流するか |
| エージェントによる本番マージの防止 | 不可（「エージェントによる操作か」を区別できない） | 可能（エージェントによる本番/アーカイブマージを拒否） |
| 役割ごとの柔軟性 | ホスティングサービス側のブランチ単位ルール | 1 つの設定ファイル内で役割ごとに `update` / `mergeBy` を定義可能 |
| 適用範囲 | リポジトリの全ユーザー（人間を含む） | ガードが設定された AI エージェント（人間の作業は制限されない） |
| 強制タイミング | サーバー側、プッシュ / マージ時 | ローカル側、コマンド実行前 |
| プラットフォーム依存 | ホスティングサービスに依存 | ローカル Git 依存、プラットフォーム非依存 |
| バイパス可能性 | 管理者権限を持つユーザー | エージェント環境外の人間、または高度に悪意あるエージェント |

**両方を併用することが最も強固なセットアップです** — 本プラグインがローカルでエージェントにワークフローを遵守させ、サーバー側の保護ルールによって人間も含めた直接プッシュを確実に防止します。

---

## 仕組み — 3行でわかる動作メカニズム

1. エージェントが Git コマンドを含むシェルツール（`bash` / `pwsh`）を呼び出す。
2. プラグインがコマンドを分類し、`gitflow-guard.config.json` からブランチの役割を解決して判定マトリクスを適用する。
3. 違反がある場合 → コマンドは **実行前に拒否** され、理由と次の手順が返される。許可される場合 → コマンドが実行され、拒否履歴はユーザーログに記録される。

チャットでの確認やトークンストアは不要です。センシティブなマージ（production / archive）は単に **人間限定** となっており、エージェントは PR/MR の起草までを担当し、マージのクリックは人間が行います。

### 設計原則

#### 1. 設定が唯一の信頼できる情報源（Single Source of Truth）
ブランチ名やルールは一切ハードコードされていません。組み込みデフォルト（`develop`）をベースに、`preview` / `production` / `archive` を必要に応じてディープマージで上書き・追加できます。

#### 2. 実行後検知ではなく、実行前ブロック
プラグインはツールの `tools/pre-execute`（コマンドがディスパッチされる直前の決定ポイント）にフックします。ここで `deny` されたコマンドは **一切実行されません**。

#### 3. 重要なマージにおける改ざん不可能な人間の介在
プラグイン自身が「この本番マージは許可して良いか？」を判断することはありません。エージェントによるマージ操作を一律に拒否することで、**人間が PR/MR 画面でマージボタンを押すこと** を唯一の合流経路にします。

---

## 設定リファレンス

### 組み込みデフォルトとディープマージ

本ガードは **設定ファイルなしで最初から有効** です。以下の保護が標準で適用されます：

| デフォルト | 役割 | ルール |
|---|---|---|
| `develop` | **integration** | 直接プッシュ禁止、PR/MR 経由で更新 (`update: "pr"`) |
| `main` | **archive** | 直接プッシュ禁止、エージェントによるマージ禁止 (`mergeBy: "user"`) |

`gitflow-guard.config.json` を作成した場合、その内容は **デフォルト設定の上にディープマージ** されます。変更したいフィールドや役割のみを記述してください：

```jsonc
{
  "branches": { "production": ["release-[\\w-]+"] }  // develop と main は維持され、production が追加される
}
```

**ガードを完全に無効化する**（トランクベース開発など）：`{ "enabled": false }` を指定します。`gitflow-guard status` を実行すれば、現在どの設定が有効になっているかをいつでも確認できます。

### ブランチの役割モデル

**役割（Role）** はブランチ名（または正規表現）を一連のルールにマッピングします。

```text
feature ブランチ ──(自由)──> integration (集成分支; PR/MR 経由で更新)
                                 │
                                 ├──> preview (任意; 検証環境用; PR/MR 経由で更新)
                                 │
                                 └──> production (任意; PR/MR + 人間のみがマージ可能)
archive (任意; リリース後に人間がアーカイブ)
```

| 役割 | 設定キー | 必須？ | 強制される動作 |
|---|---|---|---|
| **feature** | `featurePattern` | — | 自由: commit / push / sync / rebase が可能 |
| **integration** | `branches.integration` | デフォルトあり (`develop`) | 直接プッシュ禁止 (`pr`); feature から PR/MR 経由で合流 |
| **preview** | `branches.preview` (配列) | 任意 | 直接プッシュ禁止; PR/MR 経由のみで更新 |
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
  "featurePattern": "feature/[\\w-]+", // 作業/feature ブランチにマッチする正規表現
  "branches": {
    "integration": { "branches": ["develop"], "update": "pr" },  // デフォルト: ["develop"]
    "preview":     { "branches": ["ita1"], "update": "pr" },     // 任意
    "production":  { "branches": ["prd"], "update": "pr", "mergeBy": "user" }, // 任意
    "archive":     ["main"]                                      // 任意
  },
  "locale": "en",                      // メッセージ言語 — 登録済み言語 ('en' / 'zh')
  "strict": false,                     // 任意: fail-closed モード — 設定エラーや内部エラー時に警告放行ではなくブロックする
  "ci": { "enabled": true }            // 任意: gh pr checks を参考情報として記録
}
```

---

## 判定マトリクス — ブロック対象と許可対象

| エージェントの操作 | ガード判定 |
|---|---|
| feature ブランチでの commit / push / sync / rebase / 読み取り専用操作 | ✅ allow（許可） |
| integration / preview / production / archive への直接 push / force-push / 削除 | 🚫 block（ブロック。flexible 設定時は直接 push 許可） |
| PR/MR: feature → integration / preview | ✅ allow（許可） |
| PR/MR: feature → production | ✅ 作成は許可; **マージはブロック**（人間が UI 上で実行） |
| PR/MR → archive | ✅ 作成は許可; 🚫 **マージはブロック**（人間が UI 上で実行） |
| integration / preview 上でのローカル `git merge feature/x` | 🚫 block（PR/MR 必須。update: flexible の場合は許可） |
| 連結コマンド (`checkout develop && merge feature/x`) | 🚫 block（ブランチ切り替えはセグメントごとにシミュレートされ回避不可） |
| 保護ブランチの強制再作成 (`git checkout -B/-C <branch>` / `git switch -C`) | 🚫 block（ref-update ゲートで阻止） |
| `git symbolic-ref` による保護ブランチの付け替え・削除 | 🚫 block（ref-update ゲートで阻止） |
| integration / preview / production / archive 上での `git cherry-pick` / `git revert` | 🚫 block（保護ブランチ上の履歴改変を阻止。`-n` / `--no-commit` や `--abort` 等は通過） |
| `sudo` でラップされた Git コマンド | 🚫 ラッパーが剥がされ (`sudo -u …` 含む)、内部の Git コマンドが判定される |

> 意図的にブロックしない対象: `git tag -f`（タグの移動はブランチの役割範囲外であるため免除）、および保護ブランチ上での通常の `git commit`（その後の `git push` がブロックされるためリモートは汚染されません）。

---

## 人間がコントロールを保持するポイント

- **Production マージ** と **Archive マージ** はデフォルトでユーザー限定です。エージェントは PR/MR の起草を支援できますが、**マージボタンをクリックするのは人間** です。
- すべての拒否操作はユーザーレベルの監査ログ（`gitflow-guard audit`）に追記されます。

---

## インストール詳細

**前提条件**: `PATH` に **Node.js ≥ 22** がインストールされていること。全クライアント共通で **同じ npm パッケージ** `agents-gitflow-guard` を使用します。

| クライアント種別 / プラットフォーム | インストールコマンド | 配線・マウント手順 |
|---|---|---|
| Claude Code · Codex · OpenCode · Antigravity | `npm i -g agents-gitflow-guard` | `gitflow-guard wire --client <name> --project --yes` |
| DeepSeek Harness (DSH) | `dsh plugin --profile web add agents-gitflow-guard` | DSH を再起動（プロファイル層として自動マウント） |
| Pi | `npm i -D agents-gitflow-guard` | `pi/gitflow-guard.ts` を `.pi/extensions/` にコピー |

### 1. 独立した CLI フック系クライアント (Claude Code · Codex · OpenCode · Antigravity)

```bash
npm i -g agents-gitflow-guard   # `gitflow-guard` バイナリを提供
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

各クライアントで生成される設定ファイルの内容：

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

```json
// Antigravity (Google) — .agents/hooks.json
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
  インストール後に DSH を再起動します。`dsh.bundle.patch` 宣言により自動的にプロファイル層として組み込まれます。

- **Pi**：
  ```bash
  npm i -D agents-gitflow-guard
  mkdir -p .pi/extensions
  cp node_modules/agents-gitflow-guard/pi/gitflow-guard.ts .pi/extensions/gitflow-guard.ts
  ```
  `.pi/settings.json` に設定: `{ "extensions": ["extensions/gitflow-guard.ts"] }`

### 3. ソースコードからのインストールと開発 (From Source)

```bash
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build

# 利用するエージェントに応じてマウント:
npm link # CLI Hook クライアントまたは Pi
dsh plugin --profile web add file:/path/to/AgentsGitFlowController # DSH
```

### 4. GitHub Copilot について

**GitHub Copilot について**: Copilot は自身でツールごとの **allow/deny/ask** 権限およびプロジェクトルール（`rules.json` + `AGENTS.md`）を備えているため、本プラグインではフックを提供していません。

---

## よくある質問 (FAQ)

### ブランチ名がデフォルトと異なる場合でも利用できますか？
はい。ブランチ名は一切固定されていません。`gitflow-guard.config.json` で自由にマッピングできます。

### preview / production / archive はすべて設定する必要がありますか？
いいえ。実際に運用している役割のみを設定してください。小規模であれば `integration: ["develop"]` のみで運用できます。

### これはセキュリティツールですか？
いいえ、ワークフローを遵守させるためのガードツールです。真のセキュリティ境界には、GitHub/GitLab 側のブランチ保護ルールを必ず併用してください。

### エージェント自身に本番マージを実行させられないのはなぜですか？
本番やアーカイブへのマージは意図的に **人間限定（User-only）** として分類されているためです。エージェントがマージ権限を自己付与できる仕組みは排除されています。

### 通常の開発作業が妨げられることはありますか？
ありません。feature ブランチ内でのコミット、プッシュ、同期、リベース等の日常的な作業は一切ブロックされません。

---

## 用語集

| 用語 | 意味 |
|---|---|
| **integration** | 基本となる集成分支（デフォルト: `develop`）。feature は PR/MR 経由で合流する。保護対象。 |
| **preview** | 任意の検証環境ブランチ（`branches.preview` 配列）。PR/MR 経由のみで更新。 |
| **production** | 任意の本番ブランチ（`branches.production` 配列）。PR/MR 経由 + マージは人間限定。 |
| **archive** | 任意のアーカイブブランチ（`branches.archive` 配列）。エージェントは PR/MR 起草可能、マージは人間限定。 |
| **feature branch** | `featurePattern` に一致する作業ブランチ。制限のない自由領域。 |
| **gate matrix** | 分類された各コマンドの許可/拒否を定義する判定テーブル。 |
| **pre-execute** | コマンド実行前にフックして拒否を行うツールパイプラインのフックポイント。 |
| **merge-by-user** | 本番/アーカイブへのマージ権限を人間の手に残す設計。PR/MR 上でのクリックが確認となる。 |

---

## ロードマップ

現在検討・進行中の機能拡張：

- **新しいエージェントの統合**: Cursor、Windsurf、その他の新しいエージェント CLI への対応調査と適合。
- **監査ログの集約**: 複数マシン間での監査ログ同期およびチームレベルのコンプライアンス出力。
- **ワークフロープリセット**: 一般的なブランチモデル（トランクベース、多環境エンタープライズ構成など）用の設定プリセット。
- **CI ハードゲート連携**: ゼロ依存のローカル実行性を保ちつつ、ネイティブな CI パイプライン連携を提供。

リリース履歴の詳細は [CHANGELOG.md](CHANGELOG.md) をご覧ください。

---

## サポート

本プラグインは MIT ライセンスのオープンソースです。もしチームの開発フロー保護にお役に立ちましたら、ご支援いただけると幸いです：

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/keanz21)

---

## 開発

```bash
npm install
npm test              # 単体テスト (vitest)
npm run typecheck     # 型チェック (tsc --noEmit)
npm run build         # ビルド (tsdown -> lib/)
npm run test:platforms # 6 プラットフォームの Wire プロトコル復測マトリクス
npm run test:git-matrix # 135 種類の Git コマンド判定窮挙マトリクス
npm run test:realflow # Feature ブランチ全ライフサイクルの実機放行テスト
npm run test:all      # 全テストスイートの一括実行
```

---

## ライセンス

[MIT](LICENSE) © FeatureAgents
