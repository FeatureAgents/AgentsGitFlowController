---
name: design-sync
description: Synchronize design docs, reference specs, and implementation before extending features.
---

# design-sync · Synchronize Design Docs During Feature Extensions

Load this skill before implementing **any feature extension or behavioral change** in code. Ensure that "implementation = design specifications = reference documentation" remain strictly synchronized. Never write code first and backfill documentation later.

## Trigger Scenarios

- Adding or modifying command family classification (`classify`), guard gate semantics (`gate`), configuration options (`config`), or localization messages (`i18n`).
- Adding or modifying client integrations or hook protocols (`platform`/`wire`/`cli`/`index`/`pi`).
- Any changes that impact interception behavior (decision evaluation, encoding, degradation, wiring).

## Steps

1. **Locate Changes**: Identify which architectural layer and file the extension belongs to (refer to the mapping table below) before editing code.
2. **Update `docs/design.md`** (Authoritative Specification): Update corresponding sections including the guard matrix, classifier hardening surface, platform protocol table, configuration schema, and test strategies.
3. **Update `docs/design/<client>.md`** (Per-Client Implementation Details): Update files for affected clients. If changes involve the shared pipeline (`evaluateCommand` core), review the relevant sections across all client files.
4. **Update `.agents/hooks/references/<client>.md`** (Protocol Quick Reference): Keep in strict parity with wire artifacts and `platform.ts` encoding (AGENTS.md §8 checklist item 4).
5. **Consistency Self-Check**:
   - Verify `encodeDeny` and `extractHookPayload` in `src/platform.ts` match reference docs and the `docs/design.md` encoding table verbatim.
   - Verify `COMMANDS` / templates in `src/wire.ts` match reference doc examples.
   - Verify new behaviors are cataloged in the `docs/design.md` guard matrix (including exemption rationales).
   - If user-facing behaviors change (such as new blocked surfaces or exemptions), synchronize README documentations.
6. **Associated Changes** (Follow AGENTS.md workflow): Add a `feat` or `fix` entry in `CHANGELOG.md` within the same PR; cover unit tests and continuous regression matrix via the `e2e-cases` skill.

## Documentation-to-Implementation Mapping

| Documentation | Corresponding Implementation |
|---|---|
| `docs/design.md` (Guard matrix & classifier hardening) | `src/classify.ts` / `src/gate.ts` / `src/index.ts` |
| `docs/design.md` (Configuration schema) | `src/config.ts` / `src/types.ts` |
| `docs/design/<client>.md` (Client implementation overview) | Client integration code (see "Code Location Index" section in each file) |
| `.agents/hooks/references/<client>.md` (Protocol spec) | `src/platform.ts` / `src/wire.ts` / `src/pi.ts` / `src/index.ts` / `patch.yml` |
| READMEs (User-facing behavioral surface) | User-visible behavior (default configuration, blocked commands, exemptions) |

## Disciplines

- **Design first, code second** (or synchronized in the exact same commit). All three facets are cross-reviewed during code reviews.
- `docs/design/<client>.md` serves as local working notes (untracked), but must be kept up-to-date as the baseline for future agent sessions.
- For uncertain protocol details (e.g., wire format for a new client): explicitly mark as "Pending real-device verification" rather than stating it as finalized.
