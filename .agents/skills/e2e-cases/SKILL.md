---
name: e2e-cases
description: Synchronize and expand real-machine E2E test cases after guard logic or protocol changes.
---

# e2e-cases · Synchronize and Execute Real-Device E2E Test Cases

After **any guard logic, protocol, or wiring change** passes unit tests and the verification matrix, this skill synchronizes changes into real-device test cases and **executes physical verification to collect evidence** (paired with `design-sync`: one governs specifications, one governs testing).

## Trigger Scenarios

- Guard kernel changes (`classify`/`gate`/`config`): adding blocked command surfaces, exemptions, or closing logic gaps.
- Protocol or wiring changes (`platform`/`wire`/`pi`/`index`): encoding, payload extraction, config file placement, or hook commands.

## Steps

1. **Assess Impact Scope**: Map affected clients according to the modified layer:
   | Modified Layer | Affected Clients |
   |---|---|
   | `classify`/`gate`/`config`/`i18n` (Guard kernel) | **All 6 clients** (share the `evaluateCommand` core) |
   | `platform.ts` (Encoding / Payload extraction) | Corresponding platform files (`claude`/`codex`/`opencode`/`antigravity`) |
   | `pi.ts` / `index.ts` (In-process integration) | `pi` / `dsh` |
   | `wire.ts` (Configuration file drop-in) | Corresponding stdin-hook clients |
2. **Synchronize `docs/e2e/<client>.md`**: Add or update test cases under the unified case ID system (`<CLIENT>-A*` Deny / `B*` Allow / `C*` Wire / `D*` Platform-Specific). Specify commands, prerequisite branches, expectations, and key assertion criteria. If changes involve new command families, add cases to `scripts/test-git-matrix.sh` (the 135-case decision matrix) simultaneously.
3. **Execute Testing**: Invoke the **`e2e-run`** skill to run live test cases for affected clients. Guard kernel changes must be sampled against **at least one real client channel** (e.g., Codex or Pi extension channel) for the modified command family. Wire/protocol changes must be verified against that specific client (wire artifacts must actively trigger blocking/allowing; file existence alone is insufficient).
4. **Update `TestResult`**: Record test outcomes and physical evidence (session output excerpts, remote ref comparison before/after execution, and audit entries) in `docs/e2e/TestResult/<client>.md`, preserving historical test sections per the evidence specification.
5. **Finalize**: Run the full QA verification suite (`npm run test:all`, including type checking, unit tests, platform matrix, Git 135 matrix, and lifecycle realflow). Test case documentation and `TestResult` entries must ship within the same PR as the code changes.

## Decision Criteria (Consistent with `TestResult/README.md`)

- Deny case PASS: The command is **NOT executed physically** (protected remote refs remain untouched with zero side-effects), and the client displays the rejection reason.
- Allow case PASS: The command is **executed physically with visible side-effects**.
- Protocol-level matrix passing (`verify:matrix`) does NOT substitute for physical evidence — verification through real client channels is mandatory.

## Pitfalls & Lessons Learned

- **Prerequisite State**: Pi Case D depends on the presence of a local feature branch (`gfguard-pi-cases.sh` does not create it automatically) — create the branch before executing; investigate script prerequisites before suspecting the guard.
- **Version Mounting**: `^0.0.17` will not resolve to `0.0.21` (Node/npm caret semver on `0.0.x` locks patches). Verify that the testbed mounts the exact version under test before execution.
- **Bare Remote Isolation**: Controlled repositories must strictly use local bare remotes (`/tmp`), and never execute allow/push test cases against real production remotes.
- **Model Command Rewriting**: Headless agent sessions may rewrite commands (e.g., adding `--set-upstream`). Base assertions strictly on physical Git refs before and after execution, never relying solely on model phrasing.
