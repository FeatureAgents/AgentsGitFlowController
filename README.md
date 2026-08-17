# dsh-gitflow-guard

> Enforce the **feature → preview → baseline** merge order for AI agents, from **local git facts**.
> The user is the only one who can break the rules — agents can never authorize themselves.

[中文文档](README.zh.md) | [License](LICENSE)

A plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) that validates every git operation an agent attempts, blocks workflow violations **hard**, and guides the next step. Order checks rely only on the local repository state (`merge-base --is-ancestor`) — never on any git hosting service (GitHub / GitLab / self-hosted all work).

## Workflow

```
develop (baseline, protected)
  ├── → feature/dev-x-01        (feature work)
  ├── → staging                 (long-lived preview branch, auto-deployed test env)
  feature/dev-x-01 ──PR①──▶ staging ──▶ user confirms tests
  feature/dev-x-01 ──PR②──▶ develop   ◀── allowed only after PR① + confirmation
```

Core invariant: **PR② must come after PR① is merged and the user confirms.** Multiple features may merge into preview in parallel, without blocking each other.

## Installation

Install into a DSH profile via the plugin manager (example profile `web`):

```bash
# From the npm registry:
dsh plugin --profile web add dsh-gitflow-guard

# ...or from a local checkout:
#   pnpm install && pnpm build
#   dsh plugin --profile web add file:/path/to/dsh-gitflow-guard

# Restart DSH — plugins load at process startup.
```

The package ships a `dsh.bundle.patch` declaration, so `dsh plugin add` automatically makes it a profile layer — no manual profile editing. After changing plugin code, rebuild (`pnpm build`) and restart DSH.

## Quick Start

1. Install the plugin and restart DSH (above).
2. Put a `gitflow-guard.config.json` at your **project root** (opt-in: the plugin does nothing if the file is absent or `enabled: false`):

```jsonc
// gitflow-guard.config.json (project root)
{
  "enabled": true,                 // opt-in: file exists AND enabled=true
  "mode": "pr",                    // "pr" = PR-only | "flexible" = direct push/local merge into preview allowed
  "branches": {
    "base": "develop",             // baseline branch (merge needs order + user confirmation)
    "preview": "staging",          // preview branch (deployed to test env)
    "trunk": "main"                // trunk branch (release; optional)
  },
  "confirm": {
    "keywords": ["确认", "OK", "可以", "特许"],
    "featurePattern": "feature/[\\w-]+"
  },
  "ci": { "enabled": true }        // optional adapter: gh pr checks logged as reference, skipped when unavailable
}
```

> Branch names are **fully configurable** — nothing is hard-coded. `branches` is required; `mode` / `confirm` / `ci` have sensible defaults. A config that maps two roles to the same branch is rejected with a validation error.

3. Done. Git operations by agents in this repo are now guarded. Verify with `gitflow-guard status`, or ask the agent to run `git push origin <baseline-branch>` (it will be blocked).

## Gate Matrix

| agent action | decision |
|---|---|
| merge into preview (PR①) | allow (first step; parallel features allowed) |
| create PR targeting baseline | feature ∈ preview ? allow : (permit P1 ? allow : deny) |
| create PR targeting trunk | permit P3 ? allow : deny |
| merge into baseline (PR merge / local merge) | feature ∈ preview + permit P2 ? allow : deny |
| merge into trunk | always deny (user hands only) |
| direct push / force-push / delete protected branch | deny (base & trunk always protected; preview protected in `pr` mode) |
| anything else (commit, push feature, sync, read-only, status) | allow |

`pr` mode additionally denies direct push into preview and local merge into preview; `flexible` mode allows both — baseline merges still require order + confirmation in both modes.

`gh pr merge` resolves its target via `gh pr view --json baseRefName` (optional adapter); when gh is unavailable the plugin conservatively applies the baseline rules.

## User Exceptions (Permits)

| permit | meaning | granted by | consumed when |
|---|---|---|---|
| P1 `early-pr` | create a PR to baseline before order is satisfied | chat / CLI | PR created |
| P2 `confirm` | "feature X tests OK" — allow baseline merge | chat / CLI | merge succeeded |
| P3 `trunk-pr` | allow creating a PR targeting trunk | chat / CLI | PR created |

- **One-shot**: consumed automatically after the action succeeds (audited); optional TTL (`--ttl`), expired-unused permits are logged.
- **Agents can never self-authorize.** Two channels, both supported:

**① Chat confirmation** — the plugin listens to `session/event` and only accepts messages with `source.kind === 'user'` (real humans; agents cannot forge this). Examples:

```
feature/dev-x-01 测试 OK,可以合入     → P2 confirm
feature/dev-x-01 提前建 PR            → P1 early-pr
feature/dev-x-01 可以发布上主干        → P3 trunk-pr
```

(The default keywords are Chinese; configure `confirm.keywords` for your language.)

**② Terminal CLI** (user-only; the plugin blocks agents from running `permit`/`confirm`):

```bash
gitflow-guard permit <feature> [--kind early-pr|confirm|trunk-pr] [--ttl <minutes>]
gitflow-guard confirm <feature> [--ttl <minutes>]
gitflow-guard status [--repo <path>]     # read-only status: preview contents / permits
gitflow-guard audit [--lines <N>]        # read-only audit trail
```

Every interception / grant / consumption is written to `.git/gitflow-guard/audit.jsonl` and `state.json` (inside `.git`, never committed). Deny messages explain **why** and **what to do next**.

## When NOT to use

The plugin assumes a GitFlow-style workflow (feature → preview → baseline). If your project does not use such a flow (e.g. everyone merges straight to one branch), the plugin will block constantly — do not enable it.

## Limitations

- Plain-text command recognition cannot be a security boundary (encoding / variable obfuscation); order verification rests on git facts, which cannot be forged.
- Permit state is stored locally (`.git/gitflow-guard/`); multi-machine workflows need sync (v2).
- The preview environment is shared: when confirming feature X, other features may be in preview. Check `gitflow-guard status` before confirming.
- No CI-platform hard gating (`gh pr checks` is logged as reference only). Core is platform-agnostic.

## Development

```bash
pnpm install
pnpm test          # unit tests (classify / gate / config / permits / session / integration)
pnpm typecheck     # tsc --noEmit, 0 errors
pnpm build         # tsdown → lib/ (CLI and plugin share the build)
```

**Rule**: any logic change must pass 0-error build + all green tests before done.

## License

[MIT](LICENSE) © FeatureAgents

Design specification (Chinese, decision record): [docs/design.md](docs/design.md).
