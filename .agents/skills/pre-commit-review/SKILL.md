---
name: pre-commit-review
description: Run BEFORE any git add, commit, push, or PR creation in this repo. Builds the commit manifest — one line per file with change type, public-into-PR vs private-stays-local, and inclusion/exclusion reason — runs the privacy self-check (gitignored drafts must never be staged, near-identical paths called out), and requires explicit user confirmation of that manifest before any staging or commit command is executed. Forbids blanket git add -A / git add .
---

# pre-commit-review · Commit Manifest and Confirmation (Before Any Commit)

Execute before **any** staging (`git add`), commit, push, or PR creation — including docs-only and single-file commits. Never propose or run a commit whose content the user has not seen as an explicit file-by-file manifest.

## Why

Commits were repeatedly proposed with unclear content ("不明不白"): private per-client design drafts (`docs/design/*.md`, gitignored) nearly landed alongside the public authoritative spec `docs/design.md`, and the two near-identical paths (`docs/design.md` vs `docs/design/<client>.md`) caused a denial round-trip. An unclear manifest wastes a turn and risks leaking private working notes into the public repo.

## Steps

1. **Build the manifest before touching the index** — one line per changed/untracked file:

   | 文件 | 状态 | 公开/私有 | 一句话说明 |
   |---|---|---|---|
   | path | 新增 / 修改 | 公开(进 PR) / 私有(留本地) | why included |

   Then add: explicit **exclusion list** (gitignored/private files and why), the **commit message subject**, and the **target branch** of the PR.

2. **Privacy self-check**:
   - `git status --short` — every entry must appear in the manifest; anything unexpected re-opens step 1.
   - Private-by-gitignore files (`docs/design/*.md`, `docs/issues.md`, `handoff.md`, `.claude/settings.local.json`, …) must NOT appear in the staging list.
   - Call out near-identical paths explicitly (`docs/design.md` ≠ `docs/design/<client>.md`; root config files vs dotdir files).
3. **Request explicit user confirmation** of the manifest, then wait for the answer. A denial of an unclear commit is a wasted round-trip — the manifest IS the request.
4. **Only after confirmation**, execute each step separately and verifiably: `git add <explicit file list>` → `git commit` → `git push` → PR creation.
5. Report back: commit hash and PR URL.

## Disciplines

- Blanket `git add -A` / `git add .` is **forbidden**; staging lists explicit file paths only.
- Confirmation is bound to the confirmed manifest — any file appearing afterwards re-triggers step 1 (amend the manifest, re-confirm).
- `git commit` and `git push` are never chained into one compound command with staging; each stage is a separate, inspectable call.
- No AI attribution in commits or PRs (AGENTS.md §5).
