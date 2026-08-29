---
name: start-work
description: Run BEFORE touching any file in this repo. Fetches origin, verifies which ref the workspace sits on, derives feature/<topic> from latest origin/develop, and displays the branch-rule digest.
---

# start-work · Step Zero Before Starting Work (Baseline First)

Execute this workflow before touching **any content files** in this repository. Editing any files before completing baseline verification is strictly forbidden.

## Steps

1. Run `git fetch origin`.
2. Run `git status --short --branch` and `git log --oneline -3`: check the current branch, commit lag, and any uncommitted changes.
3. Dispatch according to the state table:

| Current State | Action |
|---|---|
| Already on an **unmerged** `feature/*` branch | Proceed with work. If `origin/develop` has advanced, rebase only upon user confirmation. |
| On `main` or any non-working branch (old or new) | **Never edit in place.** If there are uncommitted changes, save them with `git stash push -u`, then run `git switch -c feature/<topic> origin/develop`. Never blindly `stash pop` into a commit — replay changes against the fresh tree file by file. |
| Sits on local `develop` | Follow the "Zero Local develop Changes" iron rule: do not edit or commit; derive a new branch from `origin/develop`. |

4. Report a one-line summary to the user: original branch / commit lag / newly derived feature branch name.

## Branch Rules Digest (Authoritative text in AGENTS.md §4)

- All work branches derive from the **latest `origin/develop`**; local `develop` remains untouched.
- Direct `commit` / `push` to `develop` is strictly forbidden; `develop` evolves exclusively through GitHub PR merges.
- **One Branch, One PR, Merge and Discard**: Never append new commits to a branch that has already been merged (rebase rewrites SHAs → split commit histories → spurious merge conflicts, as verified in v0.0.12).
- Version bumps (`npm version patch`) are applied directly on the content feature branch; `CHANGELOG.md` updates accompany the exact same PR. Once merged into `develop`, CI automatically detects the new version, tags the commit, and publishes releases (zero manual local tagging required).

## Why This Step Exists

An agent workspace session may linger on any stale checkout (e.g., historical incident where a workspace sat on `main` from 0.0.6 while `develop` had progressed to 0.0.13). Editing files on an outdated baseline before opening a PR causes severe merge conflicts at best, or **silent regressions of already merged features** without conflicts at worst.
