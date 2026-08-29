---
name: e2e-run
description: Execute live end-to-end testing and collect physical Git evidence based on self-contained test scripts and controlled sandboxes.
---

# e2e-run · Execute Live E2E Testing and Collect Evidence

This skill defines how to execute live end-to-end testing and collect physical evidence: test cases originate from `docs/e2e/<client>.md`, evidence is recorded in `docs/e2e/TestResult/<client>.md` (refer to its README for evidence guidelines), and test suite scripts are located in `scripts/`.

## Mandatory Prerequisites

1. **Verify Guard Build**: Ensure the guard under test is built from the latest codebase (`npm run build` has been executed, `lib/` is fresh).
2. **Matrix and Realflow Regression**: Execute `npm run test:git-matrix` (the 135-case exhaustive Git command decision matrix) and `npm run test:realflow` (full feature branch lifecycle flow), asserting that all tests pass.
3. **Controlled Sandboxes**: Run client tests strictly within temporary directories (e.g., `/tmp/e2e-<client>-repo` with `master=integration`, `beta=preview`, `(fix|task)/*=feature`, local bare remotes, and local config). **Never execute commands with successful push side-effects against real remotes.**
4. **Client Credentials**: Smoke-test each client with a simple prompt (e.g., `codex exec "Reply with exactly: OK"`, `claude -p "Reply with exactly: OK"`, `pi --mode json ... "PI-OK"`, `opencode run "OK"`). When running in restricted sandbox environments, mirror credentials using platform-specific XDG/temporary directory variables.

## Execution Workflow

1. **Wire Configuration** (stdin-hook clients): Run `gitflow-guard wire --client <x> --project --yes` inside the sandbox repository and verify generated artifacts; DSH and Pi use in-process extensions (DSH requires reinstalling the profile and restarting the session).
2. **Execute Cases per `docs/e2e/<client>.md`**: Run in sequence: Deny group (A) → Allow group (B) → Wiring group (C) → Platform-specific group (D).
3. **Collect Physical Evidence for Each Case**:
   - Record remote refs before execution (`git ls-remote origin <ref>`).
   - Compare remote refs after execution (Deny: untouched; Allow: new ref created or advanced).
   - Capture rejection reasons and hook stderr displayed by the client (from session transcripts / logs).
   - Collect audit evidence: `gitflow-guard audit` (inside repository) or `~/.local/state/gitflow-guard/repos/*/audit.jsonl`.
   - Store raw logs and **extract key evidence snippets into `TestResult`** (temporary files may vanish across system restarts).

## Evidence Recording (Required in `TestResult`)

- Test Information Table: Date, guard version, client version, test environment, LLM provider/model, and mounting method.
- Summary Table: Case ID (matching `docs/e2e`), status (PASS / FAIL / NOT RUN), and concise evidence statement.
- Evidence Details: Session output excerpts + remote ref comparison before and after.
- Findings and Action Items: Defects, pending items, and reproduction steps.

## Handling Defects

1. **Record First, Analyze Second**: Log failure symptoms and raw evidence verbatim (e.g., the OpenCode 1.18 hook deprecation case where green wire protocol tests did not guarantee live execution).
2. Distinguish between "test environment prerequisite issues" (missing branches, stale mounted versions) and "genuine product defects".
3. For genuine defects: Document the impact scope and reproduction steps in `TestResult`, open an issue/PR to resolve, and **re-run the complete test suite for that platform** after fixing.
4. Consistent criteria: Deny = command did not execute + rejection reason shown; Allow = physical side-effects visible on remote ref.

## Finalization

- Once all affected platforms complete execution, run the full QA suite and commit documentation along with the feature PR. Unverified platforms must be marked as `NOT RUN` in `TestResult` with necessary user setup instructions (installation / credentials).
