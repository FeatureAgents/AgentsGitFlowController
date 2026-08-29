# agents-gitflow-guard

> **AI 에이전트가 GitFlow 규칙을 무단으로 건너뛰는 문제로 고민하고 계신가요?**

AI 코딩 에이전트를 위한 유연하고 안전한 브랜치 역할 가드 플러그인 — [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), [Codex](https://github.com/openai/codex), [OpenCode](https://github.com/opencode-ai/opencode), [Antigravity](https://github.com/google-deepmind), [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) 및 [Pi](https://github.com/mariozechner/pi) 지원.  
자신만의 브랜치 역할을 자유롭게 정의하세요 — **integration** (PR/MR을 통해 feature 통합), **preview** (스테이징/테스트 환경 엔드포인트), **production** (운영), **archive** (아카이브) — 각각 고유한 업데이트 규칙을 설정할 수 있습니다. 에이전트는 정의된 흐름을 임의로 건너뛸 수 없으며, 민감한 머지 권한은 확실하게 사람의 손에 유지됩니다.

[English](README.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-tw.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Русский](README.ru.md) · [라이선스](LICENSE)

[![ko-fi](https://img.shields.io/badge/ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## 목차

- [빠른 시작 — 30초 만에 저장소 보호하기](#빠른-시작--30초-만에-저장소-보호하기)
- [도입 배경 — 이 플러그인이 해결하는 문제](#도입-배경--이-플러그인이-해결하는-문제)
- [적용 대상 — 추천 시나리오 및 팀](#적용-대상--추천-시나리오-및-팀)
- [주요 기능 — 지원하는 동작](#주요-기능--지원하는-동작)
- [제한 사항 — 정직한 한계](#제한-사항--정직한-한계)
- [서버 측 브랜치 보호와의 차이점](#서버-측-브랜치-보호와의-차이점)
- [동작 원리 — 3줄 요약 메커니즘](#동작-원리--3줄-요약-메커니즘)
- [설정 레퍼런스](#설정-레퍼런스)
- [판정 매트릭스 — 차단 및 허용 규칙](#판정-매트릭스--차단-및-허용-규칙)
- [사람의 통제권이 유지되는 영역](#사람의-통제권이-유지되는-영역)
- [상세 설치 가이드](#상세-설치-가이드)
- [자주 묻는 질문 (FAQ)](#자주-묻는-질문-faq)
- [용어집](#용어집)
- [로드맵](#로드맵)
- [후원 및 지원](#후원-및-지원)
- [개발](#개발)
- [라이선스](#라이선스)

---

## 빠른 시작 — 30초 만에 저장소 보호하기

**1단계 — 설치.** 6개 클라이언트 모두 동일한 npm 패키지 `agents-gitflow-guard`를 사용하며, 사용하는 에이전트에 맞는 방식을 선택합니다:

```bash
# 모드 A: CLI Hook 클라이언트 (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# 모드 B: DSH 프로세스 내 플러그인 (설치 후 DSH 재시작 필요)
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# 모드 C: Pi 프로세스 내 확장
npm i -D agents-gitflow-guard
```

**2단계 — 클라이언트 연결 (설정 파일 불필요).** 본 가드는 **기본적으로 `develop` (통합) + `main` (아카이브)을 보호하는 내장 기본값**을 포함하고 있어, 별도 설정 없이 바로 활성화됩니다:

```bash
# Claude Code → 현재 저장소의 .claude/settings.json
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity (클라이언트별 전용 파일에 작성)
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# 미리보기 (쓰기 없음) / 제거 / 대화형 마법사:
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` 명령어는 기존 설정 파일에 **비파괴적으로** 병합됩니다.

> ⚠️ **main 브랜치는 기본적으로 보호됩니다.** 트렁크 기반 개발(단일 브런치에 직접 푸시)을 사용하는 경우, `gitflow-guard.config.json`에 `{ "enabled": false }`를 추가하여 가드를 비활성화할 수 있습니다.

**3단계 — 동작 검증.** 에이전트에게 `git push origin develop` 명령을 실행하도록 요청해 보세요. 즉시 차단됩니다:

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

---

## 도입 배경 — 이 플러그인이 해결하는 문제

AI 코딩 에이전트는 저장소 내에서 직접 작업합니다. 프로젝트 지침 문서(`AGENTS.md`, `CLAUDE.md` 등)를 통해 워크플로우를 지시하지만, 이는 텍스트 기반의 **소프트 규칙**에 불과합니다.

본 플러그인은 이러한 소프트 규칙을 **물리적인 하드 제약**으로 변환합니다. 에이전트가 시도하는 모든 Git 명령어는 실행 전에 로컬 저장소의 실제 상태를 기준으로 검증되며, 위반 시 명령 실행 자체가 즉시 차단됩니다.

---

## 주요 기능 — 지원하는 동작

- **실행 전 차단 (Pre-execution block)**: 보호 브랜치(integration, preview, production, archive)에 대한 직접 push, force-push, 브랜치 삭제 및 에이전트의 production/archive 머지 시도를 원천 차단.
- **사람 전용 머지 (Merge-by-user)**: 에이전트는 PR/MR 초안을 작성할 수 있지만, 최종 머지 버튼 클릭은 사람만 수행할 수 있습니다.
- **안전한 감사 로그**: 모든 차단 내역은 저장소 외부인 `~/.local/state/gitflow-guard/`에 기록되어 위변조를 방지합니다.

---

## 판정 매트릭스 — 차단 및 허용 규칙

| 에이전트 작업 | 판정 |
|---|---|
| feature 브랜치에서의 commit / push / rebase / sync | ✅ allow (허용) |
| integration / preview / production / archive로의 직접 push / force-push / 삭제 | 🚫 block (차단) |
| PR/MR 생성: feature → integration / preview | ✅ allow (허용) |
| PR/MR 생성: feature → production | ✅ 생성 허용; **머지 차단** (사람이 UI에서 수행) |
| PR/MR 생성 → archive | ✅ 생성 허용; 🚫 **머지 차단** (사람이 UI에서 수행) |
| integration / preview 상에서 로컬 `git merge feature/x` 실행 | 🚫 block (PR/MR 필수) |
| 보호 브랜치 대상 `git checkout -B` / `git switch -C` 강제 재작성 | 🚫 block |
| `sudo`로 래핑된 Git 명령어 | 🚫 래퍼 제거 후 내부 Git 명령어 검증 및 차단 |

---

## 상세 설치 가이드

**사전 요구사항**: `PATH`에 **Node.js ≥ 22** 설치 필요. 모든 클라이언트는 **동일한 npm 패키지** `agents-gitflow-guard`를 사용합니다.

### 1. CLI Hook 클라이언트 (Claude Code · Codex · OpenCode · Antigravity)

```bash
npm i -g agents-gitflow-guard
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

### 2. 프로세스 내 플러그인 및 확장 (DSH · Pi)

- **DeepSeek Harness (DSH)**: `dsh plugin --profile web add agents-gitflow-guard` (설치 후 DSH 재시작)
- **Pi**: `npm i -D agents-gitflow-guard` 및 `node_modules/agents-gitflow-guard/pi/gitflow-guard.ts` 파일을 `.pi/extensions/`로 복사

### 3. 소스코드 직접 설치 및 개발 (From Source)

```bash
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build

# 클라이언트에 맞게 로컬 빌드 연결:
npm link # CLI Hook 클라이언트 또는 Pi
dsh plugin --profile web add file:/path/to/AgentsGitFlowController # DSH
```

---

## 라이선스

[MIT](LICENSE) © FeatureAgents
