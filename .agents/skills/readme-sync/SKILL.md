---
name: readme-sync
description: Maintain 100% content parity, structural symmetry, and linguistic equality across all 11 language README files upon documentation updates or feature extensions.
---

# readme-sync · Multilingual README Equality & Parity Guard

Load this skill whenever updating **documentation, user-facing features, configuration rules, CLI options, or client integration protocols**.

> **Core Principle (Document Equality)**:
> All 11 language README files in this repository are **first-class citizens**. No language may be left as a truncated summary while others are full-length. Every language must provide 100% structural symmetry, identical heading hierarchies, matching table rows, valid TOC anchor links, and idiomatic technical terminology.

---

## The 11 First-Class Language Fleet

1. `README.md` — English (Master reference)
2. `README.zh.md` — 简体中文 (Simplified Chinese)
3. `README.zh-tw.md` — 繁體中文 (Traditional Chinese - Taiwan/HK developer terminology)
4. `README.ja.md` — 日本語 (Japanese - standard developer katakana & keigo)
5. `README.ko.md` — 한국어 (Korean - standard developer terminology & polite register)
6. `README.de.md` — Deutsch (German - formal Siezen tone & exact Git terminology)
7. `README.fr.md` — Français (French - correct diacritics & technical vocabulary)
8. `README.es.md` — Español (Spanish - correct diacritics & technical vocabulary)
9. `README.it.md` — Italiano (Italian - correct terminology: agente, matrice)
10. `README.pt.md` — Português (Portuguese - correct diacritics: Matriz, função)
11. `README.ru.md` — Русский (Russian - accurate technical cases & declensions)

---

## Trigger Scenarios

- Any edit to `README.md` or `README.zh.md` (adding/updating sections, tables, FAQs, examples, or rules).
- Adding support for a new AI Agent client platform (AGENTS.md §8 checklist).
- Changing command classification, gate evaluation logic, or default configuration models.
- Updating release version pins or installation guidance.

---

## Strict Parity Checklist

Whenever editing documentation, verify all 11 files against these 7 structural invariants:

| # | Check Dimension | Exact Specification |
|---|---|---|
| 1 | **Headings Hierarchy** | Exactly **44 headings** (1 H1, 18 H2, 22 H3, 3 H4) in identical order. |
| 2 | **Markdown Tables** | Exactly **7 tables** with identical row counts: Walkthrough (6 steps), Server vs Plugin (7 rows), Defaults (2 roles), Branch Roles (5 roles), Gate Matrix (11 actions), Install Matrix (3 tiers), Glossary (8 terms). |
| 3 | **Code Blocks** | Exactly **20 code blocks** preserving identical commands, CLI arguments, JSON keys, and schemas. |
| 4 | **FAQ Completeness** | Exactly **9 FAQ Q&A pairs** answering all common user questions. |
| 5 | **Glossary Completeness** | Exactly **8 core terms** defined in the Glossary table. |
| 6 | **TOC & Anchor Validity** | Exactly **17 TOC links** resolving to valid GitHub slug anchors with 0 broken links. |
| 7 | **Navigation Bar Symmetry** | All 11 language links + localized License link present in the exact same order. |

---

## Localization Standards & Conventions

- **Traditional Chinese (`README.zh-tw.md`)**: Use standard Taiwan/HK terms:
  - 專案 (project), 設定檔 (config), 套件 (package), 外掛 (plugin), 擴充 (extension), 進程 (process), 稽核 (audit), 儲存庫 (repo), 建置 (build), 直譯器 (interpreter), 唯讀 (read-only), 使用者 (user).
- **Japanese (`README.ja.md`)**: Use standard Japanese developer Katakana & terms:
  - 統合ブランチ (integration branch), 直接プッシュ (direct push), 丁寧語 (です/ます), 監査ログ (audit log).
- **Korean (`README.ko.md`)**: Use standard Korean developer terms:
  - 통합 브랜치 (integration branch), 단위 테스트 (unit tests), 보호 브랜치 (protected branch), 감사 로그 (audit log).
- **German (`README.de.md`)**: Formal register (*Siezen*), precise umlauts (`ä`, `ö`, `ü`, `ß`).
- **Romance & Slavic Languages (`FR`/`ES`/`IT`/`PT`/`RU`)**: Correct accents, inverted punctuation, grammatical cases, and standard terms (`agente`, `matriz`, `garde-fou`).

---

## Automated Verification Workflow

After any documentation change, run the automated validation suite:

```bash
# 1. Check structural parity and symmetry across all 11 READMEs
node scripts/check-readme-equality.mjs

# 2. Check version pins consistency across all READMEs and package.json
npm run check:pins

# 3. Run full test suite and type check
npm run typecheck && npm test

# 4. Verify continuous cross-agent matrix
npm run verify:matrix
```

All 4 steps must pass with **0 errors** before any PR or commit is ready.
