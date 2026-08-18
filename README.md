# agents-gitflow-guard

> **Are you tired of agents skipping your GitFlow?**

A plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) that enforces the **feature → preview → baseline** merge order from local git facts —  
agents can't skip the flow, and only you can grant an exception.

[中文文档](README.zh.md) · [License](LICENSE)

[![ko-fi](https://img.shields.io/badge/ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## Table of Contents

- [Quick Start — 30 seconds to a guarded repo](#quick-start--30-seconds-to-a-guarded-repo)
- [Why — the problem this plugin solves](#why--the-problem-this-plugin-solves)
- [Who this is for — scenarios & teams](#who-this-is-for--scenarios--teams)
- [What it does — capabilities](#what-it-does--capabilities)
- [What it does NOT do — honest limits](#what-it-does-not-do--honest-limits)
- [Server-side protection vs this plugin](#server-side-protection-vs-this-plugin)
- [How it works — the mechanism in three lines](#how-it-works--the-mechanism-in-three-lines)
- [Configuration Reference](#configuration-reference)
- [Gate Matrix — what gets blocked, what passes](#gate-matrix--what-gets-blocked-what-passes)
- [User Exceptions (Permits) — the only way to break the rules](#user-exceptions-permits--the-only-way-to-break-the-rules)
- [Installation in detail](#installation-in-detail)
- [FAQ](#faq)
- [Glossary](#glossary)
- [Roadmap](#roadmap)
- [Support](#support)
- [Development](#development)
- [License](#license)

---

## Quick Start — 30 seconds to a guarded repo

**Step 1 — install**, one command, then restart DSH (plugins load at process startup):

```bash
dsh plugin --profile web add agents-gitflow-guard
```

**Step 2 — configure**, create `gitflow-guard.config.json` in your **project root**:

```jsonc
{
  "enabled": true,
  "mode": "pr",
  "branches": {
    "base": "develop",
    "preview": "staging",
    "trunk": "main"
  }
}
```

This one file is the entire setup: it says "this project uses the guard", "my baseline is `develop`", "my preview is `staging`". The plugin is opt-in per project — absent or `enabled: false`, it does nothing.

**Step 3 — verify.** Ask the agent (or run in a DSH session) to `git push origin develop`. Expect the tool call to be denied:

```text
Error: [gitflow-guard] 已拦截: 受保护分支「develop」禁止直推
下一步: 基线分支(develop)由 PR 合入: 先合入预览并确认(P2), 再创建指向基线的 PR
```

The block message is currently Chinese by default (localization is on the [Roadmap](#roadmap)); in English it means: *blocked: protected branch `develop` — direct push forbidden. Next: baseline merges via PR — merge into preview first, get P2 confirmation, then create the PR.*

**Done.** The guard is live for this repo. Keep reading for the [full walkthrough](#full-walkthrough--one-feature-end-to-end), or jump to [Configuration](#configuration-reference) when you're ready to map your own branch names.

### Full walkthrough — one feature, end to end

Scenario: your team ships a login page (`feature/login-page`); baseline `develop`, preview `staging`. What you and the agent experience at every step:

| # | what the agent runs | plugin decision | what you see |
|---|---|---|---|
| 1 | `git checkout -b feature/login-page` | ✅ allow (feature work is free) | branch created |
| 2 | `git add . && git commit -m "feat: login"` | ✅ allow | committed |
| 3 | `git push -u origin feature/login-page` | ✅ allow (pushing your feature is fine) | pushed |
| 4 | `git checkout develop && git merge feature/login-page` | 🚫 **deny** — not in preview yet | blocked with: merge into staging first (PR①), test, then P2 |
| 5 | *(tries to bypass)* `git checkout develop && git merge feature/login-page` in one chained command | 🚫 **deny** — branch switches are simulated per segment; no bypass | same rejection |
| 6 | `gh pr create --base staging` | ✅ allow (PR①: feature → preview is the flow's first step) | PR created |
| 7 | *(you merge PR①)* | — | feature now in `staging`, deployed to test env |
| 8 | you type in DSH chat: `feature/login-page 测试 OK,可以合入` | plugin records **P2 permit** (`grant` in audit) | confirmed |
| 9 | `git checkout develop && git merge feature/login-page` | ✅ allow — order (∈ preview) + P2 both satisfied | merge succeeds |
| 10 | *(after the merge)* | plugin **consumes** the P2 permit (`consume` in audit) | one-shot used up |
| 11 | `gitflow-guard status` / `gitflow-guard audit` | ✅ allow (read-only) | full state & trail: grant → consume |

Notice what the agent *cannot* do anywhere in this flow: skip step 6/7, self-confirm in step 8, or re-use the same confirmation in a later feature. Every exception is one explicit user action, visible in the audit.

---

## Why — the problem this plugin solves

AI coding agents work in your repository. They are *told* — via system prompts, project instruction files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, and similar), and project docs — to follow a merge flow: develop on a feature branch, merge to a preview branch (the deployed test environment), let the user confirm, then merge to baseline.

**That is a soft rule.** Agents skip it, reorder it, or simply "forget" it — not out of malice, but because soft instructions are optional to a model.

This plugin turns the soft rule into a **hard mechanism**. Every git operation an agent attempts is checked against the *actual state of your local repository*. Violations are blocked before the command runs, with an explanation of why and what to do next.

Nobody has to remember the rules — the rules are enforced.

---

## Who this is for — scenarios & teams

### Signs this plugin is for you

- Your team works with AI agents in the repository, and you have — or want — a formal branch flow (feature → preview → baseline).
- An agent has already cut a corner: merged straight to the baseline without the preview, or merged before tests were confirmed. If it happened once, it will happen again — this plugin is the structural fix.
- You protect your baseline/trunk but don't want to rely on human review to catch every shortcut.
- Multiple features develop in parallel and land in one shared preview environment, and you need per-feature verification before the baseline.

### Concrete scenarios

1. **Solo developer + agent on client projects.** You hand the agent a ticket; it "helps" by merging straight into the baseline and the preview environment goes stale. One config file per project, and the agent physically cannot merge into the baseline before the preview + your confirmation — even when you're not watching.
2. **Small team (3–10) with a CI-deployed preview.** Staging auto-deploys on merge; one day an agent merged a feature into `develop` that was never deployed or tested. From then on, every baseline merge requires: feature ∈ preview **and** your chat confirmation — a deliberate, audited act, not a forgotten one.
3. **Large team, many agents.** Agents work freely on feature branches (commit, push, sync, rebase — all allowed); the gate guarantees nothing enters the baseline unconfirmed. Feature velocity stays unchanged; only the shortcut is removed.
4. **Async collaboration.** You're not always online. The guard keeps the flow honest between your sessions; exceptions remain exclusively yours to grant, and every one of them leaves an audit trail.

**Not for you** (see also [What it does NOT do](#what-it-does-not-do--honest-limits)):

- **Trunk-based flow** — everyone merges straight to one branch: the plugin would block constantly.
- **Personal repo without a defined flow** — nothing to enforce, no value.
- **A team unwilling to establish feature → preview → baseline** — the plugin enforces a flow; it will not invent one.

---

## What it does — capabilities

- **Blocks, before execution**: direct push / force-push / delete of protected branches; merging a feature into the baseline before it reached the preview branch; merging into trunk; an agent trying to grant itself an exception.
- **Enforces order from git facts**: "is this feature merged into preview?" is answered by `merge-base --is-ancestor` on your local repository — no hosting service involved, no trusting the agent's word.
- **One exception authority — you**: the user can permit early PRs, confirm a feature's tests, or allow a trunk PR. Agents can never authorize themselves.
- **Works with any naming**: branch names are mapped by your config, never hard-coded (see [Configuration](#configuration-reference)).
- **Fully audited**: every block, grant, and consumption is written to `.git/gitflow-guard/` (audit trail + state) — inside `.git`, never committed.
- **Platform-agnostic core**: pure local git; optionally consults `gh` when available (PR target resolution, CI status as a log reference), and works fine without it.

---

## What it does NOT do — honest limits

- **It is not a security boundary.** Command parsing is best-effort; an agent determined to obfuscate commands can evade text analysis. What *cannot* be evaded is the order check itself: git ancestry is a fact, not a claim.
- **It does not gate on CI platforms.** `gh pr checks` is logged as a reference only, never as a hard gate. No GitHub/GitLab API enforcement (that belongs in branch protection rules, which can layer on top).
- **It is not a replacement for the flow itself.** Your project must actually use a feature → preview → baseline flow. If your team merges everything straight to one branch, this plugin will block constantly — don't enable it there.
- **No multi-machine state sync (v1).** Permits are stored locally; a second machine won't see them (planned in v2).
- **No pop-up notifications (v1).** Post-actions are reported through the audit trail and the conversation, not pushed to you.

---

## Server-side protection vs this plugin

Server-side branch protection (GitHub branch rules, GitLab protected branches) and this plugin solve **different problems**. They are complementary, not alternatives.

| dimension | server-side protection | this plugin |
|---|---|---|
| what it governs | *who* may push / merge to protected branches (permissions) | *the order and prerequisites* of agent merges (workflow) |
| can express "user confirmed tests" | no — at best it requires review approvals, which mean little when agents are the reviewers | yes — a dedicated, audited permit (P2) that agents cannot self-grant |
| can enforce "preview before baseline" | no — protection is per-branch, not per-flow | yes — the gate checks feature ∈ preview before any baseline merge |
| scope | every user of the repository, humans included | DSH agents with the plugin configured (humans are not restricted) |
| enforcement point | server-side, at push / merge time | local, before the command runs |
| platform | tied to the hosting service | pure local git, platform-agnostic |
| bypassable by | users with admin rights | anyone working outside DSH, or a determined malicious agent |

Why this matters: branch protection answers *"can this push happen at all?"*; this plugin answers *"may this agent merge now, given the flow?"*. The strongest setup uses **both** — the plugin keeps agents honest about the workflow, and branch protection guarantees that no one, agent or human, pushes straight to a protected branch.

---

## How it works — the mechanism in three lines

1. An agent calls a shell tool (`pwsh` / `bash`) with a git command.
2. The plugin classifies the command, reads local git facts (current branch, whether the feature is an ancestor of the preview branch), consults permit state, and applies the gate matrix.
3. Violation → the tool call is **denied before it runs**, with a reason and the next step. Allowed → the command proceeds, audited.

Confirmation channel: the plugin listens to your chat messages in DSH and only accepts messages whose source is a **real human** (`source.kind === 'user'`) — an agent cannot forge that.

### Design principles — why it works

#### 1. Local git facts are the only trusted source

The plugin never asks the agent "which branch are you on?" or "did the user confirm?" — it runs read-only git queries itself (`branch --show-current`, `merge-base --is-ancestor feature preview`).

Git ancestry is a fact of the repository: if the feature's HEAD is an ancestor of the preview branch, the merge happened; otherwise it did not. An agent can claim anything; the repository cannot lie.

---

#### 2. Blocking happens before execution, not after

The plugin hooks the tool pipeline at `tools/pre-execute` — the decision point that runs *before* the command is dispatched. A `deny` there means the command **never runs**; the agent only ever sees the rejection. Post-hoc detection (scanning logs after the fact) can't work as enforcement — the damage would already be done.

---

#### 3. The confirmation channel is unforgeable by design

Chat messages in DSH carry a producer tag (`source`). Only input typed by the real user has `source.kind === 'user'`; model output, tool results, and plugin injections all carry different sources. The plugin accepts confirmations exclusively from the user source — so "user confirmed it" cannot be faked by the agent, the model, or another plugin.

---

#### 4. Permits are one-shot and consumed after the action succeeds

"One-shot" means every exception is explicit, auditable, and non-recurring — there is no "permanently exempted feature". "Consumed after success" means a failed attempt (e.g. a PR that fails to create) does not waste the permit: it stays valid for the next attempt. Both properties are visible in the audit trail (`grant` → `consume`).

---

## Configuration Reference

### Branch roles — the model behind the checks

The plugin models **four roles**. Only the roles are fixed; the names are yours.

```text
trunk ─── (optional, release)  merging into it: ALWAYS BLOCKED — user hands only
  ▲
baseline ─ merging into it requires: feature ∈ preview  AND  user confirmation (P2)
  ▲
preview ── merging into it: always allowed (PR①) — parallel features OK
  ▲
feature branches — your working branches, recognized by featurePattern
```

| role | config key | protected? | enforced behavior |
|---|---|---|---|
| **baseline** | `branches.base` | always | no direct push / force-push / delete; merges need order + P2 |
| **preview** | `branches.preview` | in `pr` mode | no direct push / local merge in `pr` mode; merging *into* it is always allowed |
| **trunk** | `branches.trunk` (optional) | always | nothing merges into it except the user themselves |
| **feature** | matched by `confirm.featurePattern` | — | free: commit / push / sync / rebase |

### Customizing branch names — any naming works

`branches` maps your repository's *actual* branch names onto the roles. Nothing is hard-coded. Example: baseline `master`, preview `beta`, trunk `production`, feature branches `fix/`- and `task/`-prefixed:

```jsonc
{
  "enabled": true,
  "mode": "pr",
  "branches": {
    "base": "master",
    "preview": "beta",
    "trunk": "production"
  },
  "confirm": {
    "keywords": ["确认", "OK", "可以", "特许"],
    "featurePattern": "(fix|task)/[\\w-]+"
  }
}
```

With this config, `master` is treated exactly as `develop` is in the default examples: agents pushing `master` are blocked; merging `fix/auth-42` into `master` is blocked until `fix/auth-42` is in `beta` *and* you confirm it; `gitflow-guard status` reports with your branch names.

**`featurePattern`**: a JS regular expression matched against branch names. Matches → feature branch (free to push, merge, sync). Non-matches that are also not role branches → "anything else" (allowed). Configure it to your actual convention.

### Full field reference

```jsonc
{
  "enabled": true,                 // opt-in: file exists AND enabled=true
  "mode": "pr",                    // "pr" = PR-only | "flexible" = direct push/local merge into preview allowed
  "branches": {
    "base": "develop",             // REQUIRED: baseline branch
    "preview": "staging",          // REQUIRED: preview branch
    "trunk": "main"                // optional: trunk branch (release)
  },
  "confirm": {
    "keywords": ["确认", "OK", "可以", "特许"],   // chat-confirmation trigger words
    "featurePattern": "feature/[\\w-]+"          // JS regex matching your feature branches
  },
  "ci": { "enabled": true }        // optional adapter: gh pr checks logged as reference, skipped when unavailable
}
```

**Validation**: `branches.base` and `branches.preview` are required; mapping two roles to the same branch is rejected; `mode` must be `pr` or `flexible`; an invalid `featurePattern` regex is rejected. **Any error disables the plugin for that project** (errors are reported) rather than applying a half-guessed setup.

**`mode`**:
- `pr` (default): preview is protected — features reach it only via PRs (no direct push, no local merge).
- `flexible`: preview may be pushed to / merged into directly; baseline merges still require order + P2.

---

## Gate Matrix — what gets blocked, what passes

| agent action | decision |
|---|---|
| merge into preview (PR①) | ✅ allow (first step; parallel features OK) |
| create PR targeting baseline | ✅ if feature ∈ preview · else P1 permit ? allow : 🚫 block |
| create PR targeting trunk | P3 permit ? ✅ allow : 🚫 block |
| merge into baseline (PR merge / local merge) | feature ∈ preview + P2 ? ✅ allow : 🚫 block |
| merge into trunk | 🚫 always blocked (user hands only) |
| direct push / force-push / delete protected branch | 🚫 block |
| chained commands (`checkout develop && merge feature/x`) | 🚫 blocked — branch switches are simulated per segment, no bypass |
| commit / push feature / sync from baseline / rebase / read-only / `gitflow-guard status` | ✅ allow |

`gh pr merge` resolves its target via `gh pr view` (optional adapter); without `gh`, the plugin conservatively applies the baseline rules.

---

## User Exceptions (Permits) — the only way to break the rules

| permit | meaning | granted by | consumed when |
|---|---|---|---|
| P1 `early-pr` | create a baseline PR before order is satisfied | chat / CLI | PR created |
| P2 `confirm` | "feature X tests OK" — allow baseline merge | chat / CLI | merge succeeded |
| P3 `trunk-pr` | allow creating a PR targeting trunk | chat / CLI | PR created |

**One-shot**: consumed automatically after the action succeeds (audited). Optional TTL via `--ttl`; expired-unused permits are logged.

**Agents can never self-authorize** — the plugin blocks agents from running `permit` / `confirm`.

**① Chat confirmation** — in DSH, just type it (real user message only):

```text
feature/dev-x-01 测试 OK,可以合入     → P2 confirm
feature/dev-x-01 提前建 PR            → P1 early-pr
feature/dev-x-01 可以发布上主干        → P3 trunk-pr
```

(The default trigger words are Chinese; configure `confirm.keywords` for your language.)

**② Terminal CLI** (user-only):

```bash
gitflow-guard permit <feature> [--kind early-pr|confirm|trunk-pr] [--ttl <minutes>]
gitflow-guard confirm <feature> [--ttl <minutes>]
gitflow-guard status [--repo <path>]     # read-only: preview contents / permits per feature
gitflow-guard audit [--lines <N>]        # read-only: audit trail
```

---

## Installation in detail

**Prerequisite**: a working [DSH](https://github.com/deepseek-ai/deepseek-harness) installation.

**From the npm registry** — the standard path, already covered in [Quick Start](#quick-start--30-seconds-to-a-guarded-repo):

```bash
dsh plugin --profile web add agents-gitflow-guard
```

Then restart DSH. Upgrades are the same command, followed by another restart.

**From source** — for contributors, or to run the latest checkout:

```bash
pnpm install && pnpm build
dsh plugin --profile web add file:/path/to/agents-gitflow-guard
```

The package declares `dsh.bundle.patch`, so `dsh plugin add` automatically makes it a profile layer — no manual profile editing.

---

## FAQ

### My branches don't follow the default names — can I use it?

Yes — nothing about the branch names is fixed. The three roles (baseline, preview, trunk) are concepts; the `branches` field maps your repository's actual names onto them, and `featurePattern` tells the plugin how to recognize your feature branches.

A team that calls its baseline `master`, its preview `beta`, and prefixes feature branches with `fix/` writes exactly that into the config, and everything — the blocks, the reports, the audit — then speaks those names. There is no convention you must adopt; there is only a mapping you declare.

The full worked example is in [Customizing branch names](#customizing-branch-names--any-naming-works).

---

### My project doesn't use a feature → preview → baseline flow.

Then this plugin is not for you, and enabling it would be a frustrating mistake: every routine merge would be blocked, because the guard enforces an order your workflow does not have. It is a mechanism for a flow that already exists, not a substitute for one.

One nuance worth knowing: if your team is close — you do separate feature branches and a shared preview, but you prefer direct pushes into preview over PRs — the `flexible` mode keeps the order + confirmation requirement on the baseline while relaxing the preview rules.

---

### Is this a security tool?

No, and it is important that you don't treat it as one. It is a workflow guard: it makes an agreed process mechanically enforceable. Text-based command recognition is inherently best-effort — an agent determined to obfuscate a command can slip past the parser.

What cannot be forged is the *order check itself*: whether a feature is an ancestor of the preview branch is a property of the repository, not a claim the agent can invent. If you need real protection against hostile agents, that belongs in branch-protection rules on your hosting service; this plugin is the layer that keeps honest workflows honest.

---

### Why can't the agent just run `gitflow-guard permit ...` itself?

Because both exception channels are sealed against it. The `permit` / `confirm` commands are classified as user-only: when they arrive as tool calls, the plugin denies them outright.

The chat channel is sealed the same way — the plugin only accepts confirmations whose message source is `source.kind === 'user'`, a tag that only genuine human input carries; model output, tool results, and plugin injections all carry different sources.

The two channels converge on the same guarantee: an exception can only ever originate from the person, never from the agent. This is the property that makes "the user is the only exception authority" more than a slogan.

---

### Do I need the `gh` CLI?

No. The `gh` integration is an optional adapter: it lets the plugin resolve what `gh pr merge` is actually targeting, and it logs `pr checks` status as a reference.

Without `gh`, the plugin simply takes the conservative path — an unresolvable `pr merge` is treated under the baseline rules — and everything else works exactly the same. The core enforcement never touches a hosting service, which is also why the plugin works identically on GitHub, GitLab, a self-hosted server, or an offline repository.

---

### Will it block my normal work?

Deliberately, no. Everything a feature branch is for — committing, pushing, syncing from the baseline, rebasing, inspecting with read-only commands, running `gitflow-guard status` — is allowed without friction.

The blocks are reserved for exactly two families of actions: writes to protected branches, and baseline merges that skip the order or the confirmation.

If you ever see a block you believe is wrong, run `gitflow-guard status` before anything else: the report shows the precise facts the decision was built on (whether the feature is in the preview, which permits exist), so a misjudgment is visible and correctable rather than mysterious.

---

### What if my config has a mistake?

The plugin prefers failing closed: any validation error in the config disables the guard for that project and reports the errors, so a half-guessed setup never applies by accident.

The most common mistakes are mapping two roles to the same branch (rejected explicitly), a `featurePattern` that doesn't compile (rejected as invalid regex), and a typo in `mode`. Because the failure is loud and the file is one JSON object, the fix is usually a thirty-second correction followed by a working guard.

---

### Does it work across multiple machines?

Within one machine, fully — permit state and audit live in `.git/gitflow-guard/` and survive DSH restarts.

Across machines, not yet: if you and an agent work from different computers, a confirmation granted on one machine is not visible on the other, so a merge attempted there would be blocked until you confirm again. This is a v1 limitation with a straightforward v2 plan (synchronizing state), listed in the [Roadmap](#roadmap).

---

### Will my agent's legitimate PR① (feature → preview) be blocked?

No. Merging into the preview branch is the first step of the flow and is always allowed — parallel features landing in preview are precisely what the model expects.

The order gate applies only to baseline merges, so the normal path (feature → preview → confirm → baseline) never trips it.

---

### What exactly is checked against the local repository?

Three read-only queries, nothing more: the current branch (`git branch --show-current`), whether the feature is an ancestor of the preview branch (`git merge-base --is-ancestor`), and — only for `gh pr merge` — the PR's base branch (`gh pr view`).

Nothing is written, no remote is contacted, and no hosting-service feature is required. This is the whole reason the plugin can make hard promises about order: the facts it trusts come from the repository itself.

---

### License / cost?

MIT, free, no strings. Use it, modify it, ship it — the only obligation is keeping the copyright notice.

If it saves your team from a shortcut gone wrong, the coffee button at the top of this page is appreciated but never required. See [License](#license).

---

## Glossary

| term | meaning |
|---|---|
| **baseline** | your stable integration branch (`branches.base`); protected; merges need order + P2 |
| **preview** | the test-env branch (`branches.preview`); features merge in freely (PR①) |
| **trunk** | the release branch (`branches.trunk`, optional); user-hands only |
| **feature branch** | your working branch, matched by `featurePattern` |
| **PR① / PR②** | feature → preview / feature → baseline |
| **permit** | a one-shot user-granted exception (P1 early-pr / P2 confirm / P3 trunk-pr) |
| **gate matrix** | the decision table mapping each classified command to allow/deny |
| **P2** | the user confirmation that unlocks a baseline merge |
| **pre-execute** | the tool-pipeline hook where denial happens — before the command runs |
| **`source.kind === 'user'`** | the DSH message tag that marks a real human's input — the unforgeable confirmation channel |
| **`merge-base --is-ancestor`** | the git query that answers "is this feature merged into preview?" truthfully |

---

## Roadmap

- **i18n — localized block messages**: deny messages are Chinese by default today; make them follow the user's language (and the plugin config).
- **v2 — multi-machine state**: sync permits/audit across machines.
- **v2 — platform adapters**: GitLab / Gitea support (interface already reserved).
- **v2 — notifications**: push notice to the user when a permit is consumed (currently audit + conversation only).
- **v2 — CI hard-gating research**: whether `gh pr checks` can become a real gate without hurting the platform-agnostic core.
- **Ecosystem**: ready-made config templates for common workflows; community-contributed confirmation keywords.

Contributions welcome — see [Development](#development).

---

## Support

The plugin is free and open source (MIT). If it saves you and your team from a shortcut gone wrong, a coffee is appreciated:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/keanz21)

---

## Development

```bash
pnpm install
pnpm test          # unit tests: classify / gate / config / permits / session / real-git integration
pnpm typecheck     # tsc --noEmit, 0 errors
pnpm build         # tsdown → lib/ (CLI and plugin share the build)
```

**Rule**: any logic change must pass a 0-error build + all green tests before done.

---

## License

[MIT](LICENSE) © FeatureAgents

Design specification (Chinese, decision record): [docs/design.md](docs/design.md).
