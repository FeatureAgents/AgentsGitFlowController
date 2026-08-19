# agents-gitflow-guard

> **Are you tired of agents skipping your GitFlow?**

A configurable branch-role guard for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). You define your own branches —
**integration** (features merge in via PR/MR), **preview** (env endpoints), **production**, **archive** — each with its own update rules. Agents can't skip the flow, and sensitive merges stay in your hands.

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
- [Where the human stays in control](#where-the-human-stays-in-control)
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
  "featurePattern": "feature/[\\w-]+",
  "branches": {
    "integration": ["develop"],   // 集成分支: feature 经 PR 合入, 受保护
    "archive": ["main"]           // 归档分支: 发布后由你亲手合入
  }
}
```

This one file is the entire setup: `integration` is the **only required** role; `preview` / `production` / `archive` are optional — add them only if your flow needs them. The plugin is opt-in per project — absent or `enabled: false`, it does nothing.

**Step 3 — verify.** Ask the agent (or run in a DSH session) to `git push origin develop`. Expect the tool call to be denied:

```text
Error: [gitflow-guard] 已拦截: 受保护分支「develop」禁止直推
下一步: 集成分支(develop)由 PR/MR 合入 feature: 先推 feature 分支, 再 gh pr create --base develop / glab mr create --target-branch develop
```

The block message is currently Chinese by default (localization is on the [Roadmap](#roadmap)); in English it means: *blocked: protected branch `develop` — direct push forbidden. Next: integration branch is updated by PR/MR — push the feature branch first, then open a PR/MR into `develop`.*

**Done.** The guard is live for this repo. Keep reading for the [Configuration](#configuration-reference) to map your own branches, or the [Gate Matrix](#gate-matrix--what-gets-blocked-what-passes) for the full decision table.

### Full walkthrough — one feature, end to end

Scenario: your team ships a login page (`feature/login-page`); `develop` is the integration branch, `main` the archive. What you and the agent experience at every step:

| # | what the agent runs | plugin decision | what you see |
|---|---|---|---|
| 1 | `git checkout -b feature/login-page` (from develop) | ✅ allow (feature work is free) | branch created |
| 2 | `git add . && git commit -m "feat: login"` | ✅ allow | committed |
| 3 | `git push -u origin feature/login-page` | ✅ allow (pushing your feature is fine) | pushed |
| 4 | `git checkout develop && git merge feature/login-page` | 🚫 **deny** — integration branch is PR/MR-only | must open a PR/MR into develop |
| 5 | `gh pr create --base develop` | ✅ allow (feature → integration via PR) | PR created, you review & merge |
| 6 | `git push origin main` or merge into main | 🚫 **deny** — archive is user-hand only | you archive develop → main yourself after release |

Notice what the agent *cannot* do: merge a feature straight into `develop`, or touch `main` at all. Every sensitive merge is a deliberate human action in the PR/MR page or your own terminal.

---

## Why — the problem this plugin solves

AI coding agents work in your repository. They are *told* — via system prompts, project instruction files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, and similar), and project docs — to follow a merge flow: develop on a feature branch, merge into the integration branch (and your preview/production stages when you have them), and leave archive/production merges to you.

**That is a soft rule.** Agents skip it, reorder it, or simply "forget" it — not out of malice, but because soft instructions are optional to a model.

This plugin turns the soft rule into a **hard mechanism**. Every git operation an agent attempts is checked against the *actual state of your local repository*. Violations are blocked before the command runs, with an explanation of why and what to do next.

Nobody has to remember the rules — the rules are enforced.

---

## Who this is for — scenarios & teams

### Signs this plugin is for you

- You have — or want — a defined branch flow, from a single `develop`-style integration branch up to multi-stage preview/production pipelines.
- An agent has already cut a corner: pushed straight into a protected branch, or merged somewhere it shouldn't. If it happened once, it will happen again — this plugin is the structural fix.
- You protect your integration/archive branches but don't want to rely on human review to catch every shortcut.
- Multiple features develop in parallel and land in one shared preview environment, and you want each entry to a stricter stage reviewed.

### Concrete scenarios

1. **Solo developer + agent on client projects.** You hand the agent a ticket; it "helps" by pushing straight into the integration branch. One small config file, and the agent physically cannot touch protected branches without a PR/MR — even when you're not watching.
2. **Small team (3–10) with a CI-deployed preview.** Staging auto-deploys on merge; one day an agent merged a feature into `develop` without review. From then on, every entry to the protected stages requires a PR/MR — a deliberate, audited act.
3. **Enterprise with multi-env pipelines.** Many preview endpoints plus a gated production and archive line — each role simply gets configured, and the guard scales without extra rules.
4. **Async collaboration.** You're not always online. The guard keeps the flow honest between your sessions; production/archive merges remain yours alone.

**Not for you** (see also [What it does NOT do](#what-it-does-not-do--honest-limits)):

- **Trunk-based flow** — everyone merges straight to one branch: the plugin would block constantly.
- **Personal repo without a defined flow** — nothing to enforce, no value.
- **A team unwilling to give any branch a role** — the plugin needs at least one `integration` branch to protect.

---

## What it does — capabilities

- **Blocks, before execution**: direct push / force-push / delete of protected role branches (integration / preview / production / archive); agent merging into production or archive.
- **Role-driven, fully configurable**: `integration` is the only required role; `preview` / `production` / `archive` are optional arrays of branch names or regexes, each with its own update rules (`pr` / `flexible`, `mergeBy`).
- **Merge-by-user where it matters**: production & archive merges stay in your hands — the plugin blocks the agent from clicking merge, so your action *is* the confirmation.
- **Works with any naming**: branch names are mapped by your config, never hard-coded (see [Configuration](#configuration-reference)).
- **Fully audited**: every deny is written to `.git/gitflow-guard/audit.jsonl` — inside `.git`, never committed.
- **Platform-agnostic core**: pure local git; optionally consults `gh` (GitHub) or `glab` (GitLab) for PR/MR target resolution, and works fine without them.

---

## What it does NOT do — honest limits

- **It is not a security boundary.** Command parsing is best-effort; an agent determined to obfuscate commands can evade text analysis.
- **It does not gate on CI platforms.** CI status is logged as a reference only, never a hard gate. Real branch protection belongs in GitHub/GitLab settings, which can layer on top.
- **It is not a replacement for the flow itself.** Your project must have at least one `integration` branch; if everyone pushes straight to one branch, this plugin will block constantly — don't enable it there.
- **Production/archive are not automated** — they're deliberately left to your human click; the plugin only tells agents "no".

---

## Server-side protection vs this plugin

Server-side branch protection (GitHub branch rules, GitLab protected branches) and this plugin solve **different problems**. They are complementary, not alternatives.

| dimension | server-side protection | this plugin |
|---|---|---|
| what it governs | *who* may push / merge to protected branches (permissions) | *how* agents may enter the flow (workflow) — which role a merge lands in |
| keeps agents from merging into production/archive | no — it can't tell "agent did it" | yes — production/archive merges are blocked for agents by default |
| per-role flexibility | one rule per branch on the host | per-role `update` (`pr`/`flexible`) + `mergeBy` (`user`/`anyone`) in one config file |
| scope | every user of the repository, humans included | DSH agents with the plugin configured (humans are not restricted) |
| enforcement point | server-side, at push / merge time | local, before the command runs |
| platform | tied to the hosting service | pure local git, platform-agnostic (`gh` / `glab` optional) |
| bypassable by | users with admin rights | anyone working outside DSH, or a determined malicious agent |

Why this matters: branch protection answers *"can this push happen at all?"*; this plugin answers *"may this agent enter this role, given the config?"*. The strongest setup uses **both** — the plugin keeps agents honest about the workflow, and branch protection guarantees that no one, agent or human, pushes straight to a protected branch.

---

## How it works — the mechanism in three lines

1. An agent calls a shell tool (`pwsh` / `bash`) with a git command.
2. The plugin classifies the command, resolves the branch roles from `gitflow-guard.config.json`, and applies the gate matrix.
3. Violation → the tool call is **denied before it runs**, with a reason and the next step. Allowed → the command proceeds; every deny is audited to `.git/gitflow-guard/audit.jsonl`.

No chat-confirmation or permit store: sensitive merges (production / archive) are simply **user-only** — an agent may prepare the PR/MR, but the merge click stays yours.

### Design principles — why it works

#### 1. Config is the single source of truth

Nothing about branch names or rules is hard-coded. `integration` is the only required role; `preview` / `production` / `archive` are optional arrays of exact names or regexes, each with its own `update` and `mergeBy`. The same binary scales from a solo `develop` to an enterprise multi-env pipeline.

#### 2. Blocking happens before execution, not after

The plugin hooks the tool pipeline at `tools/pre-execute` — the decision point that runs *before* the command is dispatched. A `deny` there means the command **never runs**; the agent only ever sees the rejection. Post-hoc detection (scanning logs after the fact) can't work as enforcement — the damage would already be done.

#### 3. The sensitive merges are unforgeably human

No plugin code decides "is this merge OK?" for production or archive. The gate simply refuses to let an *agent* perform those merges, so the only path is a PR/MR page where **you** click merge — and that click is the confirmation. There is no token, permit, or chat message an agent could forge to get past you.

---

## Configuration Reference

### Branch roles — the model behind the checks

Only **`integration`** is required. Every other role is optional — configure what your flow actually uses, and each entry is an exact branch name **or** a regex pattern.

```text
feature branches ──(free)──> integration（集成分支, PR/MR 合入）
                                   │
                                   ├──> preview（可选, 环境终点, PR/MR 更新）
                                   │
                                   └──> production（可选, PR/MR + 只有你能点合并）
archive（可选, 发布后你亲手归档）
```

| role | config key | required? | enforced behavior |
|---|---|---|---|
| **feature** | `featurePattern` | — | free: commit / push / sync / rebase |
| **integration** | `branches.integration` | always | no direct push (default `pr`); features merge in via PR/MR |
| **preview** | `branches.preview` (array) | optional | no direct push; updates via PR/MR only (env endpoints) |
| **production** | `branches.production` (array) | optional | PR/MR only; merge by user only (`mergeBy: "user"`) |
| **archive** | `branches.archive` (array) | optional | user-hand only — agents cannot even create a PR |

### Customizing branch names & rules — any naming works

**小团队（个人 / 2-3 人）—— 最简，只有 integration：**

```jsonc
{
  "enabled": true,
  "featurePattern": "feature/[\\w-]+",
  "branches": { "integration": ["develop"] }
}
```

**大团队（多预览环境 + 生产 + 归档）：**

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

### Full field reference

```jsonc
{
  "enabled": true,                     // opt-in: file exists AND enabled=true
  "featurePattern": "feature/[\\w-]+", // JS regex matching your working/feature branches
  "branches": {
    "integration": { "branches": ["develop"], "update": "pr" },  // REQUIRED
    "preview":     { "branches": ["ita1"], "update": "pr" },     // optional
    "production":  { "branches": ["prd"], "update": "pr", "mergeBy": "user" }, // optional
    "archive":     ["main"]                                      // optional
  },
  "ci": { "enabled": true }            // optional: gh pr checks logged as reference
}
```

- Roles accept either an **array** (shorthand) or an **object** `{ branches, update?, mergeBy? }`.
- `update`: `pr` (default) = updates only via PR/MR; `flexible` = allow direct/local merges (small teams).
- `mergeBy` (production): `user` (default) = only you click merge; `anyone` = allow PR merge through.
- Each branch entry is an exact name or a regex (auto-detected).
- **Validation**: `integration` is required; overlapping role entries are rejected; invalid regex is rejected. **Any error disables the plugin for that project** (reported) rather than applying a half-guessed setup.

---

## Gate Matrix — what gets blocked, what passes

| agent action | decision |
|---|---|
| commit / push feature / sync / rebase / read-only | ✅ allow |
| direct push / force-push / delete integration / preview / production / archive | 🚫 block (integration/preview `flexible` direct push allowed) |
| PR/MR: feature → integration / preview | ✅ allow |
| PR/MR: feature → production | ✅ allow to create; **merge blocked** (you merge in UI) |
| PR/MR targeting archive | 🚫 block |
| local `git merge feature/x` while on integration / preview | 🚫 block (PR/MR required); `update: flexible` allows |
| chained commands (`checkout develop && merge feature/x`) | 🚫 blocked — branch switches are simulated per segment, no bypass |

The PR/MR target is resolved via `gh pr view` (GitHub) or `glab mr view` (GitLab). Without a platform CLI, the plugin is conservative.

---

## Where the human stays in control

- **Production merge** and **archive** are user-only by default: an agent may help prepare the PR/MR, but **you click the merge button** — that click *is* the confirmation. There is no separate permit store to outsource that decision.
- Every deny is written to `.git/gitflow-guard/audit.jsonl` for review (`gitflow-guard audit`).

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
npm install && npm run build
dsh plugin --profile web add file:/path/to/agents-gitflow-guard
```

The package declares `dsh.bundle.patch`, so `dsh plugin add` automatically makes it a profile layer — no manual profile editing.

**Claude Code hook** — the same guard inside Claude Code, no DSH required. This repo already ships the config at `.claude/settings.json`; for any other repo, add these hooks:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "/abs/path/gitflow-guard check --platform claude" }] }
    ]
  }
}
```

- The hook reads the payload on stdin and answers `exit 0` (allow) or `exit 2` (block — stderr is the reason shown to the model, plus a "next step" hint).
- Only `PreToolUse` is needed: the guard blocks *before* the command runs. There is no permit to consume afterwards, so no `PostToolUse` hooks are required.
- Use an **absolute path** to the binary — hook subprocesses may not inherit your shell `PATH`. `${CLAUDE_PROJECT_DIR}/bin/gitflow-guard.mjs` (after `npm run build`) also works from a checkout.
- Fully opt-in: the hook does nothing unless the repo has `gitflow-guard.config.json` with `enabled: true`.

---

## FAQ

### My branches don't follow the default names — can I use it?

Yes — nothing about the branch names is fixed. `integration` is the only required role; its entries (and those of `preview` / `production` / `archive`) are any exact branch names or regex patterns you like. `featurePattern` tells the plugin how to recognize your working branches.

A team that calls its integration branch `master`, adds a `beta` preview, and prefixes feature branches with `fix/` writes exactly that into the config; every block, report, and audit then speaks those names. There is no convention you must adopt — only a mapping you declare. See [Customizing branch names & rules](#customizing-branch-names--rules--any-naming-works).

---

### Do I need a preview/production/archive at all?

No. Add only the roles your flow actually has. A solo repo with just `develop` configures `integration: ["develop"]` and nothing else; an enterprise with ten environments adds the `preview` array and a `production` role. The rest stays off.

---

### Is this a security tool?

No, and it is important that you don't treat it as one. It is a workflow guard: it makes an agreed process mechanically enforceable. Text-based command recognition is inherently best-effort — an agent determined to obfuscate a command can slip past the parser.

But what cannot be bypassed is the **role boundary itself**: merging into a protected role branch (integration / preview / production / archive) requires the configured path (PR/MR, or a human merge for production/archive). If you need real protection against hostile agents, that belongs in branch-protection rules on your hosting service.

---

### Why can't the agent just merge into production/archive itself?

Because the gate classifies those as **user-only** actions. An agent may create the PR/MR, but the plugin denies the *merge* for production and the *PR creation* (and merge) for archive. The only path is for **you** to click merge — there is no permit, token, or chat message an agent could use to confer that power on itself.

---

### Do I need the `gh` or `glab` CLI?

No. They are optional adapters used only to resolve what a `pr merge` / `mr merge` is targeting, so the gate can tell "merge into integration/preview" (okay) from "merge into production/archive" (blocked). Without them, the plugin takes a conservative path — it refuses when it can't confirm the target — and everything else works the same. The core enforcement never touches a hosting service, which is why it works identically on GitHub, GitLab, self-hosted, or offline.

---

### Will it block my normal work?

Deliberately, no. Everything a feature branch is for — committing, pushing, syncing from `integration`, rebasing, inspecting with read-only commands, running `gitflow-guard status` — is allowed without friction.

The blocks are reserved for: (1) direct writes to protected role branches, and (2) an agent trying to merge into production or archive. If you ever see a block you believe is wrong, run `gitflow-guard status` — it shows exactly which role each local branch got, so a misjudgment is visible and correctable.

---

### What if my config has a mistake?

The plugin prefers failing closed: any validation error disables the guard for that project and reports the errors, so a half-guessed setup never applies by accident.

Common mistakes: missing `integration` (required), overlapping a branch across two roles (rejected explicitly), and a `featurePattern` that doesn't compile (rejected as invalid regex). The failure is loud and the file is one JSON object, so the fix is usually a thirty-second correction.

---

### What exactly is checked against the local repository?

The current branch (`git branch --show-current`), and — only for `pr merge` / `mr merge` — the PR/MR target via `gh pr view` / `glab mr view`. Nothing about ancestry is needed, because the model is role-driven (which branch *is* the target) rather than order-driven.

Nothing is written, no remote is contacted, and no hosting-service feature is required for the core checks. Production/archive merges are simply denied for agents; the human merge happens in your UI.

---

### License / cost?

MIT, free, no strings. Use it, modify it, ship it — the only obligation is keeping the copyright notice.

If it saves your team from a shortcut gone wrong, the coffee button at the top of this page is appreciated but never required. See [License](#license).

---
## Glossary

| term | meaning |
|---|---|
| **integration** | the branch and only required role (`branches.integration`); features merge in via PR/MR; protected |
| **preview** | optional env-endpoint branches (`branches.preview`, array); updates via PR/MR only |
| **production** | optional production branches (`branches.production`, array); PR/MR + merge by user only |
| **archive** | optional post-release archive branch (`branches.archive`); user-hand only |
| **feature branch** | your working branch, matched by `featurePattern`; free zone |
| **gate matrix** | the decision table mapping each classified command to allow/deny |
| **pre-execute** | the tool-pipeline hook where denial happens — before the command runs |
| **merge-by-user** | production/archive merges stay in your hands — your click on the PR/MR is the confirmation |

---

## Roadmap

- **i18n — localized block messages**: deny messages are Chinese by default today; make them follow the user's language (and the plugin config).
- **v2 — audit sync**: sync `.git/gitflow-guard/audit.jsonl` across machines (audit is local-only today).
- **v2 — more pre-built templates**: ready-made config templates for common flows (solo `develop`, multi-env enterprise) as community-contributed presets.
- **v2 — CI hard-gating research**: whether `pr checks` could become a real gate without hurting the platform-agnostic core.

Contributions welcome — see [Development](#development).

---

## Support

The plugin is free and open source (MIT). If it saves you and your team from a shortcut gone wrong, a coffee is appreciated:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/keanz21)

---

## Development

```bash
npm install
npm test          # unit tests: classify / gate / config / cli / repo / platform
npm run typecheck     # tsc --noEmit, 0 errors
npm run build         # tsdown → lib/ (CLI and plugin share the build)
```

**Rule**: any logic change must pass a 0-error build + all green tests before done.

---

## License

[MIT](LICENSE) © FeatureAgents

Design specification (Chinese, decision record): [docs/design.md](docs/design.md).
