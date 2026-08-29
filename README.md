# agents-gitflow-guard

> **Are you tired of agents skipping your GitFlow?**

A configurable branch-role guard for AI coding agents — [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), [Codex](https://github.com/openai/codex), [OpenCode](https://github.com/opencode-ai/opencode), [Antigravity](https://github.com/google-deepmind), [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH), and [Pi](https://github.com/mariozechner/pi).
You define your own branches —
**integration** (features merge in via PR/MR), **preview** (env endpoints), **production**, **archive** — each with its own update rules. Agents can't skip the flow, and sensitive merges stay in your hands.

[English](README.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-tw.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Русский](README.ru.md) · [License](LICENSE)

[![Support on Ko-fi](https://img.shields.io/badge/Support_on_Ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

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
- [Development](#development)
- [Support](#support)
- [License](#license)

---

## Quick Start — 30 seconds to a guarded repo

**Step 1 — install.** All six clients consume the same npm package `agents-gitflow-guard` — choose the installation mode matching your agent:

```bash
# Mode A: CLI Hook clients (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# Mode B: DSH in-process plugin (restart DSH afterwards; plugins load at startup)
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# Mode C: Pi in-process extension
npm i -D agents-gitflow-guard
```

> **Note**: A bare `add` or `npm i` installs the latest version from npm registry. If your registry mirror has a cache delay or you need to lock to a specific version, append `@<version>` (e.g. `npm i -g agents-gitflow-guard@<version>`). (When using DSH, the pnpm peer-dependency *warning* is expected — DSH supplies `@deepseek-ai/cordis` / `@deepseek-ai/dsh-tools` through its shared profile module fallback at runtime; the plugin works normally.)
>
> CLI hook clients perform one wiring command after install (see Step 2); Pi copies an extension file; DSH auto-mounts on plugin installation.

**Step 2 — wire your client (no config file needed).** The guard ships with **built-in defaults that protect `develop` (integration) + `main` (archive)** — zero configuration, on by default. The only thing you need is to tell your AI client to invoke the guard, with one command per stdin-hook client (DSH is wired automatically; Pi just copies a file, see below):

```bash
# Claude Code → this repo's .claude/settings.json
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity (each its own config file; --yes skips the y/N prompt)
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# Preview (no writes) / remove / interactive guide:
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` merges into your existing config **non-destructively** (already-present hooks are left untouched), and writes to your **project dir by default** — `--global` (all repos on this machine) always asks first or needs `--yes`. Per-client files and formats are mirrored in [Installation in detail](#installation-in-detail).

> ⚠️ **main is protected by default.** Trunk / single-branch users (everyone pushes straight to one branch) will get blocked on direct `main` pushes until they opt out — create `gitflow-guard.config.json` with `{ "enabled": false }`, or map your own branches (see [Configuration Reference](#configuration-reference)). `gitflow-guard status` repeats this notice whenever the built-in defaults are in effect.

**Step 3 — verify.** Ask the agent to `git push origin develop`. Expect the tool call to be denied:

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

Messages are English by default; create a config with `"locale": "zh"` to switch to Chinese — messages then read like: *已拦截:受保护分支「develop」禁止直推 / 下一步:集成分支(develop)由 PR/MR 合入 feature……* (see [Configuration Reference](#configuration-reference)).

**Done.** The guard is live for this repo with the built-in defaults. Want more stages (`preview` / `production`) or different branch names? Write a `gitflow-guard.config.json` and only the fields you care about — everything else keeps the built-in defaults. For the full decision table, see the [Gate Matrix](#gate-matrix--what-gets-blocked-what-passes).

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
- **Role-driven, fully configurable**: `integration` (built-in default: `develop`) is the core role; `preview` / `production` / `archive` are optional arrays of branch names or regexes, each with its own update rules (`pr` / `flexible`, `mergeBy`).
- **Merge-by-user where it matters**: production & archive merges stay in your hands — the plugin blocks the agent from clicking merge, so your action *is* the confirmation.
- **Works with any naming**: branch names are mapped by your config, never hard-coded (see [Configuration](#configuration-reference)).
- **Fully audited**: every deny is appended to an audit log under your user state directory (`~/.local/state/gitflow-guard/`, `%LOCALAPPDATA%\gitflow-guard` on Windows) — outside the repository, never committed, outside the agent's writable sandbox, and shared across all linked worktrees of one repository.
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
3. Violation → the tool call is **denied before it runs**, with a reason and the next step. Allowed → the command proceeds; every deny is audited to the user-level log (`~/.local/state/gitflow-guard/repos/<repo>-<hash>/audit.jsonl`).

No chat-confirmation or permit store: sensitive merges (production / archive) are simply **user-only** — an agent may prepare the PR/MR, but the merge click stays yours.

### Design principles — why it works

#### 1. Config is the single source of truth

Nothing about branch names or rules is hard-coded. `integration` ships as a built-in default (`develop`); `preview` / `production` / `archive` are optional arrays of exact names or regexes, each with its own `update` and `mergeBy` — deep-merged over the defaults. The same binary scales from a solo `develop` to an enterprise multi-env pipeline.

#### 2. Blocking happens before execution, not after

The plugin hooks the tool pipeline at `tools/pre-execute` — the decision point that runs *before* the command is dispatched. A `deny` there means the command **never runs**; the agent only ever sees the rejection. Post-hoc detection (scanning logs after the fact) can't work as enforcement — the damage would already be done.

#### 3. The sensitive merges are unforgeably human

No plugin code decides "is this merge OK?" for production or archive. The gate simply refuses to let an *agent* perform those merges, so the only path is a PR/MR page where **you** click merge — and that click is the confirmation. There is no token, permit, or chat message an agent could forge to get past you.

---

## Configuration Reference

### Built-in defaults & deep-merge override

The guard is **on by default** — no `gitflow-guard.config.json` needed. It protects:

| default | role | rule |
|---|---|---|
| `develop` | **integration** | no direct push; updates via PR/MR (`update: "pr"`) |
| `main` | **archive** | no direct push / no agent merge; the archive merge is yours (`mergeBy: "user"`) |

When you do create `gitflow-guard.config.json`, its fields are **deep-merged over the defaults**: each field/role you write replaces the default for that field/role, everything you don't write keeps the default. Write only what you want to change:

```jsonc
{
  "branches": { "production": ["release-[\\w-]+"] }  // defaults keep develop+main; production is added
}
```

**Disable entirely** (trunk / single-branch flows): `{ "enabled": false }`. Fixing an accidental block is a one-file change, and `gitflow-guard status` always explains what is in effect (including when it is the built-in defaults).

### Branch roles — the model behind the checks

A **role** maps branch names (or regexes) to a rule set. `integration` is provided by the defaults; every other role is optional.

```text
feature branches ──(free)──> integration (integration branch; updates via PR/MR)
                                   │
                                   ├──> preview (optional; env endpoints; updates via PR/MR)
                                   │
                                   └──> production (optional; PR/MR + only you click merge)
archive (optional; you archive after release)
```

| role | config key | required? | enforced behavior |
|---|---|---|---|
| **feature** | `featurePattern` | — | free: commit / push / sync / rebase |
| **integration** | `branches.integration` | default (`develop`) | no direct push (default `pr`); features merge in via PR/MR |
| **preview** | `branches.preview` (array) | optional | no direct push; updates via PR/MR only (env endpoints) |
| **production** | `branches.production` (array) | optional | PR/MR only; merge by user only (`mergeBy: "user"`) |
| **archive** | `branches.archive` (array) | default (`main`) | archive PR/MR may be created by agents; the merge stays user-hand only |

### Customizing branch names & rules — any naming works

**Small team (solo / 2–3 devs) — minimal: integration only:**

```jsonc
{
  "enabled": true,
  "featurePattern": "feature/[\\w-]+",
  "branches": { "integration": ["develop"] }
}
```

**Larger team (multiple preview envs + production + archive):**

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
  "enabled": true,                     // default true — set false to turn the guard off
  "featurePattern": "feature/[\\w-]+", // JS regex matching your working/feature branches
  "branches": {
    "integration": { "branches": ["develop"], "update": "pr" },  // default: ["develop"] — omit to keep
    "preview":     { "branches": ["ita1"], "update": "pr" },     // optional
    "production":  { "branches": ["prd"], "update": "pr", "mergeBy": "user" }, // optional
    "archive":     ["main"]                                      // optional
  },
  "worktree": {                        // optional: working tree and upstream baseline guard
    "requireCleanOnPr": false,         // require clean staged/unstaged changes before creating PR (default false)
    "requireCleanOnMerge": false,      // require clean working tree before merging (default false)
    "allowUntracked": true,            // allow untracked files (??); false blocks if untracked exist (default true)
    "requireUpstreamSynced": false     // require branch to be synced with upstream baseline (default false)
  },
  "locale": "en",                      // optional: message language — any registered locale ('en'/'zh' built-in); unknown values warn in status and fall back to English
  "strict": false,                     // optional: fail-closed — invalid config / internal errors block instead of warn-and-allow
  "ci": { "enabled": true }            // optional: gh pr checks logged as reference
}
```

- Roles accept either an **array** (shorthand) or an **object** `{ branches, update?, mergeBy? }`.
- `update`: `pr` (default) = updates only via PR/MR; `flexible` = allow direct/local merges (small teams).
- `mergeBy` (production): `user` (default) = only you click merge; `anyone` = allow PR merge through.
- Each branch entry is an exact name or a regex (auto-detected). **Regex safety**: branch patterns are authored by you and compiled as-is — avoid catastrophic-backtracking constructs (e.g. nested quantifiers like `(\w+)+`) in `featurePattern` and branch entries.
- **Language**: messages are English by default; add `"locale": "zh"` for Chinese, or pass `--locale <en|zh>` to any `gitflow-guard` subcommand (priority: CLI flag > project config > English). All user-facing text follows the locale — including CLI framework messages such as `--help`, unknown-command notices, and the empty-audit line.
- **Custom locales**: downstream packages can add a language at runtime — `import { registerLocale } from 'agents-gitflow-guard'`, call `registerLocale('fr', frDict)` with a dictionary covering exactly the same keys as built-in English (validated on registration), then set `"locale": "fr"` in the project config to activate it.

  ```js
  import { registerLocale, MESSAGE_KEYS } from 'agents-gitflow-guard'
  // MESSAGE_KEYS lists every key a dictionary must define (same set as built-in English);
  // registration throws if a key is missing or extra.
  const fr = { /* one entry per MESSAGE_KEYS, e.g. */ 'deny.header': ({ why }) => `[gitflow-guard] bloqué : ${why}` }
  registerLocale('fr', fr)
  ```
- **Unknown locales**: an unregistered `"locale"` value falls back to English during interception (by design — hooks never stall on wording), so a typo is easy to miss; the one-line warning shows up in `gitflow-guard status`.
- **Validation**: overlapping role entries are rejected; invalid regex is rejected. **Any config error reverses the project to "not enabled"** (reported) rather than applying a half-guessed setup; watch out that a role you override with the same branch name as a default role (e.g. mapping `main` to integration while the default archive is still `main`) is an overlap error — cover or drop the other role too.
- **Strict mode**: by default a broken config warns on stderr once and lets the command pass (fail-open, so a typo can't wedge your tooling). `"strict": true` flips config errors and internal errors to **block** (fail-closed) — for high-risk repos. An explicit `enabled: false` stays silent; a *missing* file is not an error anymore — the built-in defaults (develop+main) are in effect.

---

## Gate Matrix — what gets blocked, what passes

| agent action | decision |
|---|---|
| commit / push feature / sync / rebase / read-only | ✅ allow |
| direct push / force-push / delete integration / preview / production / archive | 🚫 block (integration/preview `flexible` direct push allowed) |
| PR/MR: feature → integration / preview | ✅ allow |
| PR/MR: feature → production | ✅ allow to create; **merge blocked** (you merge in UI) |
| PR/MR into archive | ✅ create allowed; 🚫 merge blocked (you merge in UI) |
| local `git merge feature/x` while on integration / preview | 🚫 block (PR/MR required); `update: flexible` allows |
| chained commands (`checkout develop && merge feature/x`) | 🚫 blocked — branch switches are simulated per segment, no bypass |
| force-recreate a protected branch (`git checkout -B/-C <branch>` / `git switch -C`) | 🚫 block (direct ref-update gate) |
| retarget/delete a protected branch via `git symbolic-ref` | 🚫 block (direct ref-update gate) |
| `git cherry-pick` / `git revert` while on integration / preview / production / archive | 🚫 block (history rewrite on a protected branch); `-n` / `--no-commit` and `--abort`/`--continue`/`--skip`/`--quit` pass |
| `sudo`-wrapped git commands (privilege wrapper) | 🚫 wrapper peeled (`sudo -u …` included), underlying command gated |

> Two deliberate non-gates, so they don't get "closed" by accident later: `git tag -f` (moving a tag, even pointing at a protected branch) stays exempt — tags are outside the branch-role scope, same as `push --tags`; and a plain `git commit` on a protected branch stays allowed — the guard governs branch roles and merge paths, not content, and the following `git push` is still blocked (remote stays clean).

The PR/MR target is resolved via `gh pr view` (GitHub) or `glab mr view` (GitLab). Without a platform CLI, the plugin is conservative.

---

## Where the human stays in control

- **Production merge** and **archive** are user-only by default: an agent may help prepare the PR/MR, but **you click the merge button** — that click *is* the confirmation. There is no separate permit store to outsource that decision.
- Every deny is appended to the user-level audit log for review (`gitflow-guard audit`).

---

## Installation in detail

**Prerequisite**: **Node.js ≥ 22** on your `PATH` (the package `engines` floor and the lowest CI matrix tier). Every client consumes the **same npm package** `agents-gitflow-guard` — only the mounting and wiring step differs.

| Client Type / Platform | Install Command | Mounting & Wiring Step |
|---|---|---|
| Claude Code · Codex · OpenCode · Antigravity | `npm i -g agents-gitflow-guard` | `gitflow-guard wire --client <name> --project --yes` |
| DeepSeek Harness (DSH) | `dsh plugin --profile web add agents-gitflow-guard` | Restart DSH — plugin auto-mounts as a profile layer |
| Pi | `npm i -D agents-gitflow-guard` | Copy `pi/gitflow-guard.ts` into `.pi/extensions/` |

### 1. Standalone CLI Hook Clients (Claude Code · Codex · OpenCode · Antigravity)

Install the CLI globally once, then **wire each client with a single command** (the guard is on by default via its built-in config, so wiring is all that remains):

```bash
npm i -g agents-gitflow-guard   # provides the `gitflow-guard` binary
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

`wire` reads the existing config file (if any), merges the hook entry in without touching anything else, is idempotent (already wired → skipped), supports `--dry-run` to preview and `--unwire` to remove, and asks before touching `--global` files. The exact files it writes (for reference, and for hand-writing instead of `wire`) are:

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
// OpenCode — `.opencode/plugins/gitflow-guard.ts`
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

### 2. In-Process Plugins and Extensions (DSH · Pi)

- **DeepSeek Harness (DSH)**:
  ```bash
  dsh plugin --profile web add agents-gitflow-guard
  ```
  Then restart DSH. The package declares `dsh.bundle.patch`, so `dsh plugin add` automatically mounts it as a profile layer without manual profile editing. Upgrades follow the same command and restart.

- **Pi**:
  Pi loads extensions in-process (no stdin payload, no subprocess hook). Install the shipped entry point into the project and keep the package in devDependencies:
  ```bash
  npm i -D agents-gitflow-guard
  mkdir -p .pi/extensions
  cp node_modules/agents-gitflow-guard/pi/gitflow-guard.ts .pi/extensions/gitflow-guard.ts
  ```
  Configure `.pi/settings.json`:
  ```jsonc
  // Pi — .pi/settings.json (extensions resolve relative to .pi)
  { "extensions": ["extensions/gitflow-guard.ts"] }
  ```

### 3. From Source & Local Development

For contributors or developers looking to run and debug against the latest source checkout:

```bash
# Clone and build
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build
```

Mount the local build into your target agent platform:

```bash
# A. Standalone CLI Hook Clients (Claude Code · Codex · OpenCode · Antigravity)
npm link # or npm install -g .
gitflow-guard wire --client <claude|codex|opencode|antigravity> --project --yes

# B. DeepSeek Harness (DSH)
dsh plugin --profile web add file:/path/to/AgentsGitFlowController
# or run: node scripts/install-dsh.mjs web (restart DSH afterwards)

# C. Pi
npm link
# or copy the repository's pi/gitflow-guard.ts directly to .pi/extensions/
```

### 4. GitHub Copilot Note

**GitHub Copilot — deliberately no hook here.** Copilot ships its own guardrails for exactly this job: per-tool **allow/deny/ask** permissions and project **rules** (`rules.json` + `AGENTS.md`). Point Copilot users at the official docs instead of a plugin hook:

- [Allowing and denying tool use (GitHub Docs)](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools)
- [Adding custom rules for the Copilot coding agent (GitHub Docs)](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-rules-for-the-copilot-coding-agent)
- Optional: Copilot also has a [hooks system](https://docs.github.com/en/copilot/reference/hooks-reference) (`preToolUse` → `permissionDecision:"deny"`) if you want command-level interception.

### 5. Hook Mechanism & Technical Notes

- **Platform protocol**: The hook reads the payload on stdin and answers with that platform's protocol:
  - **Claude Code / OpenCode**: `exit 2` (stderr contains the reason and actionable next steps).
  - **Codex**: stdout JSON `{"hookSpecificOutput":{"permissionDecision":"deny",...}}`.
  - **Antigravity**: stdout JSON `{"decision":"deny","reason":...}` with `exit 0` (Antigravity requires exit 0).
  - **Pi**: In-process extension listening to `tool_call` event and denying via `{ block: true, reason }`.
- **Pre-tool execution**: Only the pre-tool event is intercepted; the guard blocks *before* commands execute, so no post-tool hooks or permit-cleanup steps are needed.
- **Binary PATH resolution**: Global installation (`npm i -g`) provides the `gitflow-guard` binary. If your agent runner does not inherit your interactive `PATH`, use the full path from `npm bin -g`.
- **Enabled by default**: Built-in defaults (`integration: ["develop"]`, `archive: ["main"]`) take effect without any config file. Custom configurations in `gitflow-guard.config.json` deep-merge on top of defaults.
- **Non-destructive wiring**: `gitflow-guard wire` merges hook configurations idempotently without modifying existing hooks, and `wire --unwire` removes only the guard entry.

---

## FAQ

### My branches don't follow the default names — can I use it?

Yes — nothing about the branch names is fixed. `integration` ships as a built-in default (`develop`) and any custom config deep-merges over it; its entries (and those of `preview` / `production` / `archive`) are any exact branch names or regex patterns you like. `featurePattern` tells the plugin how to recognize your working branches.

A team that calls its integration branch `master`, adds a `beta` preview, and prefixes feature branches with `fix/` writes exactly that into the config; every block, report, and audit then speaks those names. There is no convention you must adopt — only a mapping you declare. See [Customizing branch names & rules](#customizing-branch-names--rules--any-naming-works).

---

### Do I need a preview/production/archive at all?

No. Add only the roles your flow actually has. A solo repo with just `develop` configures `integration: ["develop"]` and nothing else; an enterprise with ten environments adds the `preview` array and a `production` role. The rest stays off.

---

### Is this a security tool?

No, and it is important that you don't treat it as one. It is a workflow guard: it makes an agreed process mechanically enforceable. Text-based command recognition is inherently best-effort — an agent determined to obfuscate a command can slip past the parser.

Within its supported command forms, the role boundary is enforced locally: merging into a protected role branch (integration / preview / production / archive) requires the configured path (PR/MR, or a human merge for production/archive). Standard obfuscation wrappers are classified and blocked — shell wrappers (`sh -c` / `bash -lc`), subshells and backtick/`$()` nesting, `env`/`command`/`nohup`/`xargs`/`sudo` prefixes and `VAR=x` assignments, absolute paths, pipelines and `||` tails, git global options (`-C .`, `--git-dir=…`), wildcard refspecs (`refs/heads/*:refs/heads/*`), `git pull` used as fetch+merge, and the `send-pack`/`update-ref`/`symbolic-ref` plumbing; force-recreating a protected branch (`checkout -B`/`switch -C`) and cherry-pick/revert on a protected branch are blocked by the ref-update / ref-move gates. The executable adversarial corpus lives in `tests/accuracy-audit.spec.ts`.

What remains **locally non-defensible**: direct forge-API calls (`gh api repos/…/pulls/N/merge`, `curl`) and commands inside interpreter subprocesses (`node -e "child_process.exec('git push …')"`); arbitrarily deep quoting or encoding stays best-effort by nature. The real, non-bypassable boundary lives in branch-protection rules on your hosting service. Use both — treat this guard as instant feedback and audit trail, not as a security boundary.

---

### Why can't the agent just merge into production/archive itself?

Because the gate classifies those as **user-only** actions. The plugin denies the *merge* for production and for archive — creating a PR/MR stays allowed, so an agent can still draft a `develop` → `main` archive PR for you. The merge itself, however, has exactly one path: **you** clicking it — there is no permit, token, or chat message an agent could use to confer that power on itself.

---

### Do I need the `gh` or `glab` CLI?

No. They are optional adapters used only to resolve what a `pr merge` / `mr merge` is targeting, so the gate can tell "merge into integration/preview" (okay) from "merge into production/archive" (blocked). When neither CLI can confirm the target — missing, unauthenticated, offline, or the query fails — the gate **refuses the merge**, even when run from a feature branch: that PR could actually point at production/archive. Retry once the CLI works, or let the user click merge. Everything else works the same. The core enforcement never touches a hosting service, which is why it works identically on GitHub, GitLab, self-hosted, or offline.

---

### Will it block my normal work?

Deliberately, no. Everything a feature branch is for — committing, pushing, syncing from `integration`, rebasing, inspecting with read-only commands, running `gitflow-guard status` — is allowed without friction.

The blocks are reserved for: (1) direct writes to protected role branches, and (2) an agent trying to merge into production or archive. If you ever see a block you believe is wrong, run `gitflow-guard status` — it shows exactly which role each local branch got, so a misjudgment is visible and correctable.

---

### What if my config has a mistake?

A half-guessed setup is never applied by accident: any validation error disables the guard for that project and reports the errors.

Common mistakes: overriding a role with the same branch name as a default role (e.g. `main` as integration while the default archive is still `main` — an explicit overlap error; cover or drop the other role too), overlapping a branch across two roles (rejected), and a `featurePattern` that doesn't compile (rejected as invalid regex). The failure is loud and the file is one JSON object, so the fix is usually a thirty-second correction.

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
| **integration** | the core role (built-in default: `develop`); features merge in via PR/MR; protected |
| **preview** | optional env-endpoint branches (`branches.preview`, array); updates via PR/MR only |
| **production** | optional production branches (`branches.production`, array); PR/MR + merge by user only |
| **archive** | optional post-release archive branch (`branches.archive`, array); agents may create PR/MRs into it, but the merge stays user-hand only |
| **feature branch** | your working branch, matched by `featurePattern`; free zone |
| **gate matrix** | the decision table mapping each classified command to allow/deny |
| **pre-execute** | the tool-pipeline hook where denial happens — before the command runs |
| **merge-by-user** | production/archive merges stay in your hands — your click on the PR/MR is the confirmation |

---

## Roadmap

Future capabilities and areas under active exploration:

- **New agent integrations**: Research and adapt to emerging agent hooks/extensions (e.g. Cursor, Windsurf, emerging agent CLIs).
- **Audit aggregation**: Cross-machine audit trail synchronization and team-level compliance export formats.
- **Workflow presets**: Ready-to-use configuration presets for common Git branching flows (Trunk-based development, multi-environment enterprise setups).
- **CI hard-gating**: Native CI pipeline hooks and PR check integration while keeping zero-dependency local execution.

For shipped features and release history, see [CHANGELOG.md](CHANGELOG.md).

---

## Development

```bash
npm install
npm test              # unit tests: classify / gate / config / cli / repo / platform / i18n / index / accuracy-audit / pi
npm run typecheck     # tsc --noEmit, 0 errors
npm run build         # tsdown → lib/ (CLI and plugin share the build)
npm run check:pins    # assert package.json version matches CHANGELOG heading and any README version pins
npm run verify:matrix # continuous cross-agent regression: DSH logic + zh-locale + multi-client hooks + Pi extension
```

- **Quality Rule**: Every logic change requires a 0-error typecheck, all tests green, and a passing `verify:matrix`.
- **Client Additions**: When adding support for a new agent platform, follow the synchronization checklist in [AGENTS.md](AGENTS.md) §8.

---

## Support

The plugin is free and open source (MIT). If it saves you and your team from a shortcut gone wrong, a coffee is appreciated:

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/keanz21)

---

## License

[MIT](LICENSE) © FeatureAgents
