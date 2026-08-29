# Contributing to agents-gitflow-guard

Thank you for your interest in contributing to `agents-gitflow-guard`!

---

## Language Policy

We welcome contributions, issues, and discussions from the global developer community in **any of the languages supported by our documentation suite** (or any native language via AI-assisted translation):
- **English**
- **Simplified Chinese (简体中文)** / **Traditional Chinese (繁體中文)**
- **Japanese (日本語)**
- **Korean (한국어)**
- **German (Deutsch)**
- **French (Français)**
- **Italian (Italiano)**
- **Portuguese (Português)**
- **Spanish (Español)**
- **Russian (Русский)**

Code comments in the repository are primarily written in Chinese, but feel free to open Pull Requests, Issues, and Discussions in your preferred language. Maintainers review with AI translation support.

---

## Development Workflow & GitFlow

This repository enforces a GitFlow branching model:

1. **Base Branch**:
   - All feature and fix branches must be derived from the latest `origin/develop`.
   - Never commit directly to `develop` or `main`.
2. **Branch Naming**:
   - Features: `feature/<topic>`
   - Bug fixes: `fix/<topic>`
3. **Commit Messages**:
   - Follow [Conventional Commits](https://www.conventionalcommits.org/):
     - `feat: ...` (New features)
     - `fix: ...` (Bug fixes)
     - `docs: ...` (Documentation changes)
     - `test: ...` (Test additions or updates)
     - `refactor: ...` (Code refactoring)
     - `chore: ...` (Build, toolchain, or release changes)
4. **Pull Requests**:
   - Target the `develop` branch.
   - Follow the "one branch, one PR" principle: delete the branch after the PR is merged.
   - Do not include AI attribution signatures (e.g. `Co-Authored-By: ...`).

---

## Quality Assurance & Verification

Before submitting a Pull Request, ensure all checks pass locally:

```bash
# 1. Type check (must have 0 errors)
npm run typecheck

# 2. Run unit and integration tests (all must pass)
npm test

# 3. Build the package
npm run build

# 4. Run the multi-platform regression matrix (all platforms must pass)
npm run verify:matrix

# 5. Check version pin consistency
npm run check:pins
```

---

## Adding a New Agent Platform

If you are adding support for a new AI coding agent platform, please ensure the following checklist is completed:

1. Protocol layer in `src/platform.ts` + unit tests in `tests/platform.spec.ts`.
2. Reference documentation in `.agents/hooks/references/<platform>.md`.
3. Wiring template in `src/wire.ts` and CLI integration.
4. Regression test cases added to `scripts/verify-matrix.mjs`.
5. Bilingual `README.md` and `README.zh.md` updated.
6. `package.json` keywords and description updated.
7. Test suite, type check, and matrix verification all passing.
