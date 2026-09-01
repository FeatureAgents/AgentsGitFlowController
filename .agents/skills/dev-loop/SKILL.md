---
name: dev-loop
description: The executable development loop for this repo. Wires start-work → TDD (unit-testcase/e2e-testcase → coder → unit-tester/e2e-tester) → review gate (code-reviewer + security-checker + test-reviewer) → (loop back on any [問題] item) → closeout (bump/CHANGELOG/QA/PR). Load this skill for ANY content work; the review gate is a hard loop — never enter closeout with unresolved [問題] items.
---

# dev-loop · Executable Development Loop (Hard Gate, Not a Suggestion)

This skill is the **runnable form** of the pipeline declared in AGENTS.md §4. AGENTS.md states the *rules* (review before merge, local develop untouched, etc.); this file states the *sequence and the loop back-edges*. The loop is **mandatory** — content work that skips or short-circuits it violates discipline, not just style.

## The Loop

```
┌─ start-work (baseline first: git fetch + derive feature/<topic> from origin/develop)
│
├─ TDD INNER LOOP (repeat until green + behavior-verified)
│     red   → unit-testcase / e2e-testcase: write failing unit tests or define E2E scenarios
│     green → coder: minimal implementation
│     test  → unit-tester: green unit tests / e2e-tester: verify real sandbox & physical evidence
│     refactor → cleanup; re-run tests
│
├─ code-reviewer     ──┐
├─ security-checker  ──┼─ (all run; each emits [通過] / [問題] lists)
├─ test-reviewer     ──┘
│                      │
│            any [問題] item present? ──YES──▶ back to coder/tester, fix, RE-RUN REVIEWS (loop)
│                      │
│                      NO (all clean)
│                      ▼
├─ doc-writer (update AGENTS.md, READMEs via readme-sync if needed)
│
├─ closeout
│     • bump version (npm version patch) on the feature branch
│     • CHANGELOG entry (version number only, no date, same PR)
│     • QA triple: typecheck 0 Error · npm test all green · npm run verify:matrix all green
│     • pre-commit-review: list files, confirm manifest with user before commit
│     • PR to develop (title + body in ENGLISH) — merge only after user confirmation
│
└─ after merge: delete branch (remote + local); never append to a merged branch
```

## Gate Definition (the loop's exit condition)

**"Review passed" is precisely: `code-reviewer`, `security-checker`, and `test-reviewer` emit conclusions with ZERO `[問題]` items** (no blocking, no violation). Only then is closeout unlocked.

- **code-reviewer checks against**: AGENTS.md §4/§5 iron rules (local develop zero-change, no AI co-author signature, CHANGELOG-with-PR, 11-language README parity, atomic/minimal change), §7 pitfall log, §8 client checklist.
- **security-checker checks against**: AGENTS.md §5 safety rules (no destructive shell usage, no unsafe exec/injection, secret leakage, boundary regressions).
- **test-reviewer checks against**: AGENTS.md §6 test rules (assert behavior not just "no throw", real coverage not line-counting, restrained mocking).
- **On any `[問題]` item**: closeout is FORBIDDEN. Return to the responsible implementation stage (coder / unittester / e2e-tester), fix, then **re-run all reviews**. Do NOT merge with unresolved `[問題]` items — there is no "approved-with-issues" path.
- **Review output format**: each reviewer MUST emit explicit `[通過]` and `[問題]` lists; when clean, output verbatim "審查通過，可進入收尾" (review passed, may close out).

## Why a Loop, Not a Line

The pipeline in AGENTS.md §4 is written as a chain. A chain invites "I'll do the reviews later / after closeout" — which is exactly how审查 got skipped in practice. This skill makes the back-edge explicit: **審查失敗 → 回退實現端 → 重審**, repeating until both gates are clean. The loop is the enforcement of "審查通過才進入收尾" (AGENTS.md §4): closeout is only reachable through the gate, never around it.

## Hard Rules Referenced (do not bypass)

- **Local develop zero-change** (AGENTS.md §4): never commit/amend/reset/tag/`npm version` on local `develop`. All evolution via GitHub PR merge. `npm version` runs ON the feature branch; delete the local tag it creates (CI re-tags on `develop` after merge).
- **One branch, one PR, merge-and-discard** (AGENTS.md §4): never append to a merged branch.
- **No AI signature** (AGENTS.md §5): commits/PRs carry no `Co-Authored-By` / `Generated with` lines.
- **PR title/body in English** (AGENTS.md §4) even though chat/code is Chinese.
- **CHANGELOG with PR, version-only heading, no date** (AGENTS.md §4).
- **11-language README parity** (AGENTS.md §4 readme-sync) when user-facing docs/config/CLI change.

## Trigger

Load this skill at the START of any content work in this repo, immediately after `start-work`. It governs the whole arc until the PR is opened and (post-merge) the branch is deleted.
