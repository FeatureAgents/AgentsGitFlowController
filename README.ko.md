# agents-gitflow-guard

> **AI 에이전트가 GitFlow 규칙을 무단으로 건너뛰는 문제로 고민하고 계신가요?**

AI 코딩 에이전트를 위한 유연하고 안전한 브랜치 역할 가드 플러그인 — [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), [Codex](https://github.com/openai/codex), [OpenCode](https://github.com/opencode-ai/opencode), [Antigravity](https://github.com/google-deepmind), [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) 및 [Pi](https://github.com/mariozechner/pi) 지원.  
자신만의 브랜치 역할을 자유롭게 정의하세요 — **integration** (PR/MR을 통해 feature 통합), **preview** (스테이징/테스트 환경 엔드포인트), **production** (운영), **archive** (아카이브) — 각각 고유한 업데이트 규칙을 설정할 수 있습니다. 에이전트는 정의된 흐름을 임의로 건너뛸 수 없으며, 민감한 머지 권한은 확실하게 사람의 손에 유지됩니다.

[English](README.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-tw.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Русский](README.ru.md) · [라이선스](LICENSE)

[![Support on Ko-fi](https://img.shields.io/badge/Support_on_Ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## 목차

- [빠른 시작 — 30초 만에 저장소 보호하기](#빠른-시작--30초-만에-저장소-보호하기)
- [도입 배경 — 이 플러그인이 해결하는 문제](#도입-배경--이-플러그인이-해결하는-문제)
- [대상 사용자 — 활용 시나리오 및 팀](#대상-사용자--활용-시나리오-및-팀)
- [주요 기능 — 지원하는 동작](#주요-기능--지원하는-동작)
- [제한 사항 — 명확한 한계](#제한-사항--명확한-한계)
- [서버 측 브랜치 보호와 본 플러그인의 차이점](#서버-측-브랜치-보호와-본-플러그인의-차이점)
- [작동 원리 — 3줄 요약 메커니즘](#작동-원리--3줄-요약-메커니즘)
- [설정 레퍼런스](#설정-레퍼런스)
- [게이트 매트릭스 — 차단 및 허용 규칙](#게이트-매트릭스--차단-및-허용-규칙)
- [사람이 통제권을 유지하는 영역](#사람이-통제권을-유지하는-영역)
- [상세 설치 가이드](#상세-설치-가이드)
- [자주 묻는 질문 (FAQ)](#자주-묻는-질문-faq)
- [용어 사전](#용어-사전)
- [로드맵](#로드맵)
- [개발 가이드](#개발-가이드)
- [후원 및 지원](#후원-및-지원)
- [라이선스](#라이선스)

---

## 빠른 시작 — 30초 만에 저장소 보호하기

**1단계 — 설치.** 6개 클라이언트 모두 동일한 npm 패키지 `agents-gitflow-guard`를 사용하며, 사용하는 에이전트에 맞는 방식을 선택합니다:

```bash
# 모드 A: CLI Hook 클라이언트 (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# 모드 B: DSH 프로세스 내 플러그인 (설치 후 DSH 재시작 필요. 프로세스 시작 시 로드됨)
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# 모드 C: Pi 프로세스 내 확장
npm i -D agents-gitflow-guard
```

> **참고**: 단순한 `add` 또는 `npm i`는 npm 레지스트리에서 최신 버전을 설치합니다. 미러의 캐시 지연이 있거나 특정 버전을 고정해야 하는 경우 뒤에 `@<버전>`을 추가하세요 (예: `npm i -g agents-gitflow-guard@<버전>`). DSH 전용 peer 의존성(`@deepseek-ai/cordis` / `@deepseek-ai/dsh-tools`)은 **optional**로 선언되어 있습니다 —— DSH 프로세스 내 플러그인만 필요하며, DSH가 런타임에 공유 프로필 모듈 폴백을 통해 제공합니다. CLI / Pi / OpenCode 사용자는 강제 설치되지 않습니다.
>
> CLI Hook 클라이언트는 설치 후 배선(wire) 명령을 1회 실행합니다 (2단계 참조). Pi는 확장 파일을 복사합니다. DSH는 플러그인 추가 시 자동으로 마운트됩니다.

**2단계 — 클라이언트 연결 (설정 파일 불필요).** 본 가드는 **기본적으로 `develop` (integration) + `main` (archive)을 보호하는 내장 기본값**을 포함하고 있어, 별도 설정 없이 바로 활성화됩니다. stdin-hook 클라이언트마다 단 한 줄의 명령어로 가드를 호출하도록 설정하기만 하면 됩니다 (DSH는 자동 연결, Pi는 파일 복사):

```bash
# Claude Code → 현재 저장소의 .claude/settings.json
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity (각 클라이언트 전용 설정 파일에 작성. --yes로 y/N 확인 건너뛰기)
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# 미리보기 (쓰기 없음) / 연결 해제 / 대화형 마법사:
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` 명령어는 기존 설정 파일에 **비파괴적으로 병합**되며 (기존 hook은 그대로 유지됨), 기본적으로 **현재 프로젝트 디렉토리**에 작성됩니다. `--global` (머신의 모든 저장소에 적용)을 사용할 때는 항상 사전에 확인을 요청합니다 (`--yes`로 자동 승인 가능). 클라이언트별 파일 및 형식은 [상세 설치 가이드](#상세-설치-가이드)를 참조하세요.

> ⚠️ **main 브랜치는 기본적으로 보호됩니다.** 트렁크 기반 개발 (모든 팀원이 단일 브랜치에 직접 푸시)을 사용하는 경우, 명시적으로 비활성화할 때까지 `main` 직접 푸시가 차단됩니다 — 비활성화하려면 `{ "enabled": false }`가 포함된 `gitflow-guard.config.json`을 생성하거나 고유한 브랜치 매핑을 설정하세요 ([설정 레퍼런스](#설정-레퍼런스) 참조). `gitflow-guard status`는 내장 기본값이 적용 중일 때 항상 이 안내를 표시합니다.

**3단계 — 동작 검증.** 에이전트에게 `git push origin develop` 명령을 실행하도록 요청해 보세요. 도구 호출이 즉시 거부됩니다:

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

메시지는 기본적으로 영문으로 출력됩니다. 프로젝트 설정에 `"locale": "zh"`를 추가하여 중국어로 전환할 수도 있습니다 (예: *已拦截:受保护分支「develop」禁止直推 / 下一步:集成分支(develop)由 PR/MR 合入 feature……*, [설정 레퍼런스](#설정-레퍼런스) 참조).

**완료되었습니다.** 내장 기본값을 통해 이 저장소의 가드가 활성화되었습니다. 더 많은 스테이지(`preview` / `production`)를 추가하거나 다른 브랜치 이름을 사용하고 싶으신가요? 변경하고자 하는 필드만 포함하여 `gitflow-guard.config.json`을 작성하면 되며, 작성되지 않은 나머지 항목은 기본값이 유지됩니다. 전체 판정 테이블은 [게이트 매트릭스](#게이트-매트릭스--차단-및-허용-규칙)를 확인하세요.

### 전체 워크스루 — 하나의 feature가 거치는 엔드투엔드 여정

시나리오: 팀에서 로그인 페이지 기능(`feature/login-page`)을 개발하며, `develop`은 통합 브랜치, `main`은 아카이브 브랜치입니다. 각 단계에서 에이전트의 작업, 플러그인 판정, 사용자 경험은 다음과 같습니다:

| # | 에이전트 실행 명령어 | 플러그인 판정 | 사용자 화면에 표시되는 결과 |
|---|---|---|---|
| 1 | `git checkout -b feature/login-page` (develop에서 분기) | ✅ 허용 (feature 작업은 자유) | 브랜치 생성됨 |
| 2 | `git add . && git commit -m "feat: login"` | ✅ 허용 | 커밋 완료 |
| 3 | `git push -u origin feature/login-page` | ✅ 허용 (feature 브랜치 푸시는 자유) | 푸시 완료 |
| 4 | `git checkout develop && git merge feature/login-page` | 🚫 **차단 (deny)** — integration은 PR/MR 전용 | develop 대상 PR/MR 생성이 요구됨 |
| 5 | `gh pr create --base develop` | ✅ 허용 (PR을 통한 integration 합류) | PR 생성됨, 사용자가 리뷰 후 머지 |
| 6 | `git push origin main` 또는 main으로의 머지 | 🚫 **차단 (deny)** — archive 머지는 사람 전용 | 배포 후 사용자가 직접 develop → main 아카이브 머지 |

에이전트가 **할 수 없는 작업**에 주목하세요: feature를 `develop`에 직접 머지하거나 `main`에 조금이라도 손대는 것은 불가능합니다. 모든 민감한 머지는 PR/MR 페이지나 개발자의 터미널에서 수행되는 의도적인 인간의 작업으로 남습니다.

---

## 도입 배경 — 이 플러그인이 해결하는 문제

AI 코딩 에이전트는 사용자의 저장소 내에서 직접 작업합니다. 에이전트는 시스템 프롬프트, 프로젝트 지침 문서(`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules` 등) 및 문서를 통해 feature 브랜치에서 개발하고 통합 브랜치(및 설정된 preview/production 단계)로 머지하며 배포/아카이브 머지는 사람에게 맡기라는 안내를 *전달받습니다*.

**하지만 이는 소프트 규칙(Soft rule)에 불과합니다.** 에이전트는 규칙을 건너뛰거나 순서를 바꾸거나 단순히 "잊어버립니다" — 악의가 있어서가 아니라, LLM 모델에게 텍스트 지침은 본질적으로 선택 사항이기 때문입니다.

본 플러그인은 소프트 규칙을 **물리적인 하드 제약(Hard mechanism)**으로 변환합니다. 에이전트가 시도하는 모든 Git 명령어는 *로컬 저장소의 실제 상태*를 기준으로 검증됩니다. 위반 사항은 명령어가 실행되기 전에 즉시 차단되며, 원인과 다음 조치 방법이 명확하게 안내됩니다.

누구도 규칙을 억지로 기억할 필요가 없습니다 — 규칙은 시스템에 의해 강제됩니다.

---

## 대상 사용자 — 활용 시나리오 및 팀

### 이런 신호가 있다면 이 플러그인이 적합합니다

- 단일 `develop` 스타일의 통합 브랜치부터 다단계 preview/production 파이프라인에 이르기까지 정의된 브랜치 워크플로우를 운영 중이거나 도입하고자 하는 경우.
- 에이전트가 이미 보호 브랜치에 직접 푸시하거나 머지하지 말아야 할 브랜치에 머지하는 실수를 범한 적이 있는 경우. 한 번 일어난 일은 다시 일어납니다 — 본 플러그인은 이에 대한 구조적 해결책입니다.
- 통합 및 아카이브 브랜치를 안전하게 보호하면서도, 모든 단축 행위를 사람이 일일이 감시하는 수고를 덜고 싶은 경우.
- 여러 기능이 병렬로 개발되어 공유 프리뷰 환경에 병합되며, 상위 환경으로의 진입을 반드시 검토하도록 강제하고 싶은 경우.

### 구체적인 활용 시나리오

1. **1인 개발자 + 외주/고객사 프로젝트에서의 에이전트 활용**: 에이전트에게 작업을 맡겼을 때 에이전트가 "친절하게" 통합 브랜치에 직접 푸시해버리는 사고를 방지합니다. 작은 설정 파일 하나로 에이전트는 감시가 없는 상황에서도 PR/MR 없이 보호 브랜치를 건드릴 수 없게 됩니다.
2. **소규모 팀 (3~10인) + CI 자동 배포 프리뷰 환경**: Staging 브랜치에 머지되면 즉시 자동 배포되는 환경에서 에이전트가 코드 리뷰 없이 `develop`에 머지하는 참사를 방지합니다. 이후 모든 보호 단계로의 진입은 의도적이고 감사 가능한 PR/MR을 통해 이루어집니다.
3. **다중 환경 파이프라인을 갖춘 엔터프라이즈 환경**: 다수의 프리뷰 엔드포인트와 엄격하게 통제되는 운영/아카이브 브랜치를 운영하는 경우, 각 역할을 설정하기만 하면 추가 규칙 없이도 무한히 확장 가능합니다.
4. **비동기 협업**: 항상 온라인 상태를 유지할 수 없는 환경에서도 세션 사이의 공백 동안 에이전트의 일탈을 막고, 운영/아카이브 머지 권한을 온전히 유지합니다.

**적합하지 않은 경우** ([제한 사항](#제한-사항--명확한-한계) 참조):

- **트렁크 기반 개발 (Trunk-based)** — 모든 팀원이 하나의 브랜치에 직접 머지하는 환경: 플러그인이 지속적으로 차단하므로 활성화하지 마세요.
- **정의된 프로세스가 없는 개인 저장소** — 강제할 규칙이 없으므로 가치가 없습니다.
- **어떤 브랜치에도 역할을 부여하지 않는 팀** — 본 플러그인은 보호할 최소 1개 이상의 `integration` 브랜치가 필요합니다.

---

## 주요 기능 — 지원하는 동작

- **실행 전 사전 차단**: 보호 대상 역할 브랜치(integration / preview / production / archive)에 대한 직접 push, force-push, 브랜치 삭제 및 에이전트의 production/archive 머지 시도를 명령어 실행 전에 차단.
- **역할 기반의 완벽한 커스터마이징**: `integration` (내장 기본값: `develop`)을 핵심 역할로 하며, `preview` / `production` / `archive`에 정확한 이름이나 정규식을 배열로 지정 가능. 역할별 업데이트 규칙(`pr` / `flexible`, `mergeBy`)을 독립적으로 설정하며 기본값 위에 딥 머지됩니다.
- **중요 영역에서의 사람 전용 머지 (Merge-by-user)**: 운영 및 아카이브 브랜치로의 머지는 사람의 손에 유지됩니다 — 플러그인이 에이전트의 머지 클릭을 차단하므로, 사람의 클릭만이 유일한 확인 수단이 됩니다.
- **모든 명명 규칙 지원**: 브랜치 이름은 설정을 통해 매핑되며 하드코딩되지 않습니다 ([설정 레퍼런스](#설정-레퍼런스) 참조).
- **완전한 감사 로그**: 모든 차단 기록은 사용자 상태 디렉토리(macOS/Linux `~/.local/state/gitflow-guard/`, Windows `%LOCALAPPDATA%\gitflow-guard`)의 감사 로그에 추가됩니다 — 저장소 외부에 저장되어 커밋되지 않고, 에이전트의 쓰기 가능 샌드박스 외부에 위치하며, 단일 저장소의 모든 linked worktree에서 공유됩니다.
- **플랫폼에 독립적인 코어 엔진**: 순수 로컬 Git으로 동작합니다. PR/MR 대상 분석을 위해 `gh` (GitHub) 또는 `glab` (GitLab)을 선택적으로 참조할 수 있으며, 해당 CLI가 없어도 안전하게 작동합니다.

---

## 제한 사항 — 명확한 한계

- **보안 방어벽이 아닙니다.** 명령어 파싱은 베스트 에포트(best-effort) 방식으로 동작합니다. 명령어를 의도적으로 복잡하게 난독화하는 에이전트는 텍스트 분석을 우회할 수 있습니다.
- **CI 플랫폼을 하드 게이팅하지 않습니다.** CI 상태는 참고용 로그로만 기록되며 하드 게이트로 작동하지 않습니다. 진정한 브랜치 보호는 GitHub/GitLab 설정의 브랜치 보호 규칙을 통해 병행해야 합니다.
- **워크플로우 자체를 대체하지 않습니다.** 저장소에 최소 1개 이상의 `integration` 브랜치가 존재해야 합니다. 모든 사람이 단일 브랜치에 직접 푸시하는 구조에서는 지속적으로 차단되므로 가드를 활성화하지 마세요.
- **운영 및 아카이브 머지를 자동화하지 않습니다.** 사람의 의도적인 클릭을 보장하기 위해 설계되었으므로 에이전트의 머지 시도에 대해 거부 응답만을 반환합니다.

---

## 서버 측 브랜치 보호와 본 플러그인의 차이점

서버 측 브랜치 보호(GitHub branch rules, GitLab protected branches)와 본 플러그인은 **서로 다른 문제를 해결**합니다. 두 기능은 상호 배타적이지 않으며 완벽하게 상호 보완적입니다.

| 비교 항목 | 서버 측 브랜치 보호 | 본 플러그인 |
|---|---|---|
| 통제 대상 | 보호 브랜치에 푸시/머지할 수 있는 **사용자 권한** | 에이전트가 워크플로우의 어떤 **역할**에 합류하는지 (워크플로우 규약) |
| 에이전트의 production/archive 머지 방지 | 불가능 (에이전트의 행위인지 구분 불가) | 가능 (에이전트의 production/archive 머지 기본 차단) |
| 역할별 유연성 | 호스팅 서비스 측의 브랜치별 단일 규칙 | 단일 설정 파일 내에서 역할별 `update` (pr/flexible) + `mergeBy` (user/anyone) 구성 |
| 적용 범위 | 저장소의 모든 사용자 (사람 포함) | 플러그인이 설정된 AI 에이전트 (사람의 직접 작업은 제한 없음) |
| 강제 시점 | 서버 측, 푸시 / 머지 시점 | 로컬 측, 명령어 실행 전 |
| 플랫폼 의존성 | 특정 코드 호스팅 서비스에 종속 | 순수 로컬 Git 기반, 플랫폼 무관 (`gh`/`glab`은 선택사항) |
| 우회 가능 대상 | 관리자 권한을 가진 사용자 | 에이전트 외부에서 작업하는 사람 또는 의도적으로 난독화하는 악성 에이전트 |

이것이 중요한 이유: 브랜치 보호는 "*이 푸시가 실행 가능한가?*"에 답합니다. 본 플러그인은 "*설정에 따라 이 에이전트가 해당 역할에 진입할 수 있는가?*"에 답합니다. 가장 강력한 구성은 **두 가지를 함께 사용하는 것**입니다 — 플러그인이 로컬에서 에이전트의 워크플로우 준수를 강제하고, 서버 측 브랜치 보호가 사람을 포함한 직접 푸시를 원천 차단합니다.

---

## 작동 원리 — 3줄 요약 메커니즘

1. 에이전트가 Git 명령어가 포함된 셸 도구(`pwsh` / `bash`)를 호출합니다.
2. 플러그인이 명령어를 분류하고 `gitflow-guard.config.json`에서 브랜치 역할을 해석한 후 게이트 매트릭스를 적용합니다.
3. 규칙 위반 시 → 도구 호출이 **실행 전에 거부**되고 이유와 다음 단계가 반환됩니다. 허용 시 → 명령어가 정상 실행되며, 모든 거부 기록은 사용자 로그(`~/.local/state/gitflow-guard/repos/<repo>-<hash>/audit.jsonl`)에 저장됩니다.

채팅 확인 절차나 별도의 권한 토큰 저장소가 필요하지 않습니다. 민감한 머지(production / archive)는 단순히 **사람 전용(User-only)**으로 지정되어 에이전트는 PR/MR 작성까지만 지원하고 머지 클릭은 사람의 몫으로 남습니다.

### 설계 원칙 — 효과적으로 작동하는 이유

#### 1. 설정이 유일한 단일 진실 공급원 (Single Source of Truth)

브랜치 이름이나 규칙은 일체 하드코딩되지 않습니다. `integration`은 내장 기본값(`develop`)으로 제공되며, `preview` / `production` / `archive`는 정확한 이름이나 정규식 배열을 통해 각각의 `update` 및 `mergeBy`를 설정하여 기본값 위에 딥 머지됩니다. 단일 `develop` 브랜치부터 대규모 엔터프라이즈 파이프라인까지 동일한 바이너리로 지원합니다.

#### 2. 실행 후 탐지가 아닌 실행 전 사전 차단

플러그인은 도구 파이프라인의 `tools/pre-execute` 단계(명령어가 디스패치되기 직전의 결정 지점)에 후킹됩니다. 여기서 `deny`된 명령어는 **절대 실행되지 않으며**, 에이전트는 거부 결과만을 수신합니다. 사후 탐지(로그 분석)는 이미 피해가 발생한 후이므로 진정한 강제 수단이 될 수 없습니다.

#### 3. 민감한 머지는 위조 불가능한 사람의 손으로만 수행

플러그인 내부 코드가 운영/아카이브에 대해 "이번 머지는 허용해도 되는가?"를 임의로 판단하지 않습니다. 게이트는 *에이전트*가 해당 머지를 수행하는 것을 일체 차단하므로, 오직 **사용자**가 PR/MR 페이지에서 머지 버튼을 클릭하는 것만이 유일한 합류 경로가 됩니다. 에이전트가 이를 우회하여 위조할 수 있는 토큰이나 허가증, 채팅 메시지는 존재하지 않습니다.

---

## 설정 레퍼런스

### 내장 기본값 및 딥 머지 (Deep-merge) 덮어쓰기

본 가드는 **별도의 설정 파일 없이도 기본적으로 활성화**되어 있습니다. 기본 보호 대상:

| 기본값 | 역할 | 규칙 |
|---|---|---|
| `develop` | **integration** | 직접 푸시 금지, PR/MR을 통해서만 합류 (`update: "pr"`) |
| `main` | **archive** | 직접 푸시 금지 / 에이전트 머지 금지, 아카이브 머지는 사용자가 직접 수행 (`mergeBy: "user"`) |

`gitflow-guard.config.json`을 생성하면 해당 필드가 **기본값 위에 딥 머지**됩니다. 작성된 필드/역할만 기본값을 덮어쓰고, 작성되지 않은 항목은 기본값을 유지합니다. 변경하려는 내용만 작성하세요:

```jsonc
{
  "branches": { "production": ["release-[\\w-]+"] }  // develop과 main은 유지되고 production이 추가됨
}
```

**완전 비활성화** (트렁크 기반 단일 브랜치 흐름 등): `{ "enabled": false }`를 작성합니다. 잘못된 차단이 발생했을 때 파일 하나로 즉시 수정할 수 있으며, `gitflow-guard status`는 현재 어떤 설정이 적용 중인지 명확히 표시합니다.

### 브랜치 역할 모델 — 검증 메커니즘의 기반

**역할(Role)**은 브랜치 이름(또는 정규식)을 규칙 세트에 매핑합니다. `integration`은 기본값으로 제공되며, 나머지 역할은 모두 선택 사항입니다.

```text
feature 브랜치 ──(자유)──> integration (통합 브랜치; PR/MR을 통해 합류)
                                 │
                                 ├──> preview (선택; 환경 엔드포인트; PR/MR 전용)
                                 │
                                 └──> production (선택; PR/MR + 사람만 머지 가능)
archive (선택; 배포 후 사람이 직접 아카이브)
```

| 역할 | 설정 키 | 필수 여부 | 강제되는 동작 |
|---|---|---|---|
| **feature** | `featurePattern` | — | 자유: commit / push / 동기화 / rebase 가능 |
| **integration** | `branches.integration` | 기본값 (`develop`) | 직접 푸시 금지 (기본 `pr`); feature에서 PR/MR을 통해 합류 |
| **preview** | `branches.preview` (배열) | 선택 | 직접 푸시 금지; PR/MR을 통해서만 업데이트 (환경 엔드포인트) |
| **production** | `branches.production` (배열) | 선택 | PR/MR 전용; 머지는 사람 전용 (`mergeBy: "user"`) |
| **archive** | `branches.archive` (배열) | 기본값 (`main`) | 에이전트의 PR/MR 생성은 허용; 머지는 사람 전용 |

### 브랜치 이름 및 규칙 커스터마이징 — 어떤 명명 규칙도 지원

**소규모 팀 (1인 / 2~3인 개발) — 최소 구성 (integration 전용):**

```jsonc
{
  "enabled": true,
  "featurePattern": "feature/[\\w-]+",
  "branches": { "integration": ["develop"] }
}
```

**대규모 팀 (다중 프리뷰 환경 + 운영 + 아카이브):**

```jsonc
{
  "enabled": true,
  "featurePattern": "(topic|feature)/[\\w-]+",
  "branches": {
    "integration": ["develop", "topic/[\\w-]+"],
    "preview": {
      "branches": ["ita1", "itb1", "itb2", "sg", "vb", "r1-conf", "r1-ope", "r2-conf", "r2-ope"],
      "update": "pr"
    },
    "production": {
      "branches": ["prd-conf", "prd-ope"],
      "update": "pr",
      "mergeBy": "user"
    },
    "archive": ["main"]
  }
}
```

### 전체 필드 상세 레퍼런스

```jsonc
{
  "enabled": true,                     // 기본값 true — false로 설정 시 가드 비활성화
  "featurePattern": "feature/[\\w-]+", // 작업/feature 브랜치를 식별하는 JS 정규식
  "branches": {
    "integration": { "branches": ["develop"], "update": "pr" },  // 기본값: ["develop"] — 생략 시 유지
    "preview":     { "branches": ["ita1"], "update": "pr" },     // 선택
    "production":  { "branches": ["prd"], "update": "pr", "mergeBy": "user" }, // 선택
    "archive":     ["main"]                                      // 선택
  },
  "worktree": {                        // 선택: 작업 트리 및 업스트림 베이스라인 가드
    "requireCleanOnPr": false,         // PR 생성 전 스테이징/미스테이징 변경 사항 클린 요구 (기본값 false)
    "requireCleanOnMerge": false,      // 머지 전 작업 트리 클린 요구 (기본값 false)
    "allowUntracked": true,            // 미추적 파일 (??) 허용 여부; false 시 존재할 경우 차단 (기본값 true)
    "requireUpstreamSynced": false     // PR 생성 전 업스트림 베이스라인과의 동기화 요구 (기본값 false)
  },
  "locale": "en",                      // 선택: 메시지 언어 — 등록된 locale ('en'/'zh' 내장); 미등록 값은 status에서 경고 후 영어로 폴백
  "strict": false,                     // 선택: fail-closed 모드 — 설정 오류/내부 오류 발생 시 경고 후 허용 대신 차단
  "ci": { "enabled": true }            // 선택: gh pr checks 결과를 참고용 로그로 기록
}
```

- 각 역할은 **배열** (단축 표기) 또는 **객체** `{ branches, update?, mergeBy? }` 형태로 작성할 수 있습니다.
- `update`: `pr` (기본값) = PR/MR을 통해서만 업데이트; `flexible` = 직접 푸시 및 로컬 머지 허용 (소규모 팀용).
- `mergeBy` (production): `user` (기본값) = 사람만 머지 버튼 클릭 가능; `anyone` = PR 머지 허용.
- **작업 트리 및 업스트림 베이스라인 가드 (`worktree`)**: 선택적 상태 및 이탈 검사 —— `requireCleanOnPr: true`는 커밋되지 않은 스테이징/미스테이징 변경 사항이 있을 때 PR 생성을 차단합니다. `requireCleanOnMerge: true`는 작업 트리가 더러운 상태에서의 로컬 및 PR 머지를 차단합니다. `allowUntracked` (기본값 `true`)는 미추적 파일 (`??`)을 마찰 없이 허용하며, 인간-AI 협업 환경에서 엄격한 통제를 위해 `false`로 설정할 수 있습니다. `requireUpstreamSynced: true`는 브랜치가 업스트림 베이스라인보다 뒤처져 있을 때 PR 생성을 차단합니다. 다중 세그먼트 복합 명령(예: `git add . && git commit && gh pr create`)에서는 후속 세그먼트에 대해 클린 상태가 동적으로 시뮬레이션됩니다.
- 각 브랜치 항목은 정확한 이름 또는 정규식(자동 감지)입니다. **정규식 안전성**: 브랜치 패턴은 사용자가 작성한 대로 컴파일되므로 `featurePattern` 및 브랜치 항목에 치명적인 백트래킹(예: `(\w+)+`와 같은 중첩 수량자)을 유발하는 표현을 피하세요.
- **메시지 언어**: 기본값은 영어입니다. 중국어로 변경하려면 `"locale": "zh"`를 추가하거나 임의의 `gitflow-guard` 하위 명령에 `--locale <en|zh>`를 전달할 수 있습니다 (우선순위: CLI 플래그 > 프로젝트 설정 > 영어). `--help`, 알 수 없는 명령어 안내, 빈 감사 로그 안내 등 모든 CLI 프레임워크 텍스트가 locale을 따릅니다.
- **커스텀 언어 등록**: 다운스트림 패키지는 런타임에 언어를 추가할 수 있습니다 — `import { registerLocale } from 'agents-gitflow-guard'`, 내장 영문 사전과 완전히 동일한 키를 가진 딕셔너리를 전달하여 `registerLocale('fr', frDict)`를 호출하고, 프로젝트 설정에 `"locale": "fr"`을 지정하면 활성화됩니다.

  ```js
  import { registerLocale, MESSAGE_KEYS } from 'agents-gitflow-guard'
  // MESSAGE_KEYS는 딕셔너리가 반드시 정의해야 하는 모든 키 목록입니다 (내장 영문과 동일한 키 세트).
  // 키가 누락되거나 초과할 경우 등록 시 에러가 발생합니다.
  const fr = { /* MESSAGE_KEYS 항목별 정의, 예: */ 'deny.header': ({ why }) => `[gitflow-guard] bloqué : ${why}` }
  registerLocale('fr', fr)
  ```
- **미등록 언어**: 등록되지 않은 `"locale"` 값은 가드 인터셉트 중에 조용히 영어로 폴백됩니다 (문구 누락으로 인해 훅이 중단되지 않도록 설계됨). 오타가 있는 경우 `gitflow-guard status`에서 경고가 표시됩니다.
- **유효성 검사**: 역할 간 브랜치 정의가 중복되면 거부되며, 유효하지 않은 정규식은 에러를 발생시킵니다. **설정 오류가 발생하면 불완전한 추측 설정을 적용하는 대신 해당 프로젝트의 가드를 "비활성화" 상태로 전환하고 보고합니다**. 기본 역할과 동일한 브랜치 이름을 다른 역할로 재정의하는 경우(예: 기본 archive가 `main`인 상태에서 `main`을 integration으로 설정) 중복 에러가 발생하므로 다른 역할도 함께 덮어쓰거나 제거해야 합니다.
- **Strict 모드**: 기본적으로 설정이 손상되었을 때 stderr에 1회 경고를 출력한 후 명령어를 통과시킵니다 (fail-open, 사소한 오타로 툴체인이 멈추는 것을 방지). `"strict": true`는 설정 에러 및 내부 에러 시 **차단** (fail-closed)하도록 동작을 전환합니다 — 고위험 저장소에 적합합니다. 명시적인 `enabled: false`는 조용히 비활성화되며, *파일이 없는 경우*는 오류가 아니라 내장 기본값(develop+main)이 정상 적용됩니다.

---

## 게이트 매트릭스 — 차단 및 허용 규칙

| 에이전트 동작 | 가드 판정 |
|---|---|
| feature 브랜치에서의 commit / push / sync / rebase / 읽기 전용 명령어 | ✅ 허용 (allow) |
| integration / preview / production / archive로의 직접 push / force-push / 삭제 | 🚫 차단 (block, integration/preview에 `flexible` 설정 시 직접 push 허용) |
| PR/MR 생성: feature → integration / preview | ✅ 허용 (allow) |
| PR/MR 생성: feature → production | ✅ 생성 허용; **머지 차단** (사람이 UI에서 직접 머지) |
| archive를 대상으로 하는 PR/MR | ✅ 생성 허용; 🚫 **머지 차단** (사람이 UI에서 직접 머지) |
| integration / preview 상에서 로컬 `git merge feature/x` 실행 | 🚫 차단 (PR/MR 필수, `update: flexible` 설정 시 허용) |
| 체이닝된 명령어 (`checkout develop && merge feature/x`) | 🚫 차단 — 세그먼트별 브랜치 전환 시뮬레이션 적용, 순서 우회 불가 |
| 보호 브랜치 강제 재생성 (`git checkout -B/-C <브랜치>` / `git switch -C`) | 🚫 차단 (직접 ref-update 게이트) |
| `git symbolic-ref`를 통한 보호 브랜치 대상 변경/삭제 | 🚫 차단 (직접 ref-update 게이트) |
| integration / preview / production / archive 상에서의 `git cherry-pick` / `git revert` | 🚫 차단 (보호 브랜치 상의 이력 재작성 차단; `-n`/`--no-commit` 및 `--abort`/`--continue`/`--skip`/`--quit` 허용) |
| `sudo`로 래핑된 Git 명령어 (권한 상승 래퍼) | 🚫 래퍼 제거 후 (`sudo -u …` 포함) 내부 Git 명령어 기준으로 판정 |

> 의도적으로 차단하지 않는 예외 항목: `git tag -f` (태그 이동은 브랜치 역할 범위 밖이므로 `push --tags`와 동일하게 면제됨), 보호 브랜치 상에서의 일반 `git commit` (가드는 브랜치 역할과 합류 경로를 관리하며 커밋 내용은 관여하지 않음. 이후 `git push`가 차단되므로 원격 저장소는 안전하게 유지됨).

PR/MR 대상은 `gh pr view` (GitHub) 또는 `glab mr view` (GitLab)를 통해 분석됩니다. 플랫폼 CLI 도구가 없는 경우 플러그인은 안전한 보수적 기준을 적용합니다.

---

## 사람이 통제권을 유지하는 영역

- **운영 머지 및 아카이브 머지**는 기본적으로 사람 전용입니다: 에이전트는 PR/MR 초안 작성을 도울 수 있지만, **머지 버튼은 사용자가 직접 클릭**해야 합니다 — 그 클릭 자체가 유일한 확인입니다. 이 결정을 위임할 수 있는 별도의 권한 토큰 저장소는 존재하지 않습니다.
- 모든 차단 기록은 사용자 레벨 감사 로그(`gitflow-guard audit`)에 지속적으로 추가되어 검토할 수 있습니다.

---

## 상세 설치 가이드

**사전 요구사항**: 시스템 `PATH`에 **Node.js ≥ 22**가 설치되어 있어야 합니다 (패키지 `engines` 기준 및 CI 최하위 계층 지원 기준). 모든 클라이언트는 **동일한 npm 패키지** `agents-gitflow-guard`를 사용하며 마운트 및 배선 방식만 다릅니다.

| 클라이언트 유형 / 플랫폼 | 설치 명령어 | 마운트 및 배선 단계 |
|---|---|---|
| Claude Code · Codex · OpenCode · Antigravity | `npm i -g agents-gitflow-guard` | `gitflow-guard wire --client <name> --project --yes` |
| DeepSeek Harness (DSH) | `dsh plugin --profile web add agents-gitflow-guard` | DSH 재시작 — 프로필 레이어로 자동 마운트 |
| Pi | `npm i -D agents-gitflow-guard` | `pi/gitflow-guard.ts`를 `.pi/extensions/`로 복사 |

### 1. 독립형 CLI Hook 클라이언트 (Claude Code · Codex · OpenCode · Antigravity)

CLI를 전역으로 1회 설치한 후, **각 클라이언트마다 명령어 한 줄로 배선을 완료합니다** (가드는 내장 기본값을 통해 기본 활성화되어 있으므로 배선만 완료하면 즉시 적용됩니다):

```bash
npm i -g agents-gitflow-guard   # `gitflow-guard` 실행 바이너리 제공
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

`wire`는 기존 설정 파일(있는 경우)을 읽어 다른 항목을 건드리지 않고 hook 항목을 안전하게 병합합니다. 멱등성을 지원하며 (이미 연결된 경우 건너뜀), `--dry-run`으로 미리보기 및 `--unwire`로 제거를 지원하고, `--global` 파일 변경 전에는 항상 사용자에게 확인을 요청합니다. 참조용으로 작성되는 실제 설정 파일 형식은 다음과 같습니다:

```jsonc
// Claude Code — .claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "gitflow-guard check --platform claude" }] }
    ]
  }
}
```

```jsonc
// Codex — .codex/hooks.json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "^Bash$", "hooks": [{ "type": "command", "command": "gitflow-guard check --platform codex" }] }
    ]
  }
}
```

```ts
// OpenCode — `.opencode/plugins/gitflow-guard.ts` (패키지에 포함된 `opencode/gitflow-guard.ts`의 복사본;
// OpenCode 1.18+에서는 hooks.yaml이 제거되고 확장 포인트가 plugins로 전환되었습니다 —
// `tool.execute.before` 이벤트, 거부 시 에러 throw; `wire --client opencode`가 자동으로 복사합니다)
```

```json
// Antigravity (Google) — .agents/hooks.json
// (agy hook 프로세스의 cwd는 hook 설정 파일이 위치한 디렉토리이므로 bin/… 상대 경로는 실패합니다.
// `wire`는 프로젝트 단위에서는 절대 경로, 전역에서는 PATH의 gitflow-guard를 작성합니다.
// 여기서는 전역 설치 형태를 나타냅니다.)
{
  "gitflow-guard": {
    "PreToolUse": [
      { "matcher": "run_command", "hooks": [ { "type": "command", "command": "gitflow-guard check --platform antigravity" } ] }
    ]
  }
}
```

### 2. 프로세스 내 플러그인 및 확장 (DSH · Pi)

- **DeepSeek Harness (DSH)**:
  ```bash
  dsh plugin --profile web add agents-gitflow-guard
  ```
  설치 후 DSH를 재시작합니다. 패키지가 `dsh.bundle.patch`를 선언하고 있으므로 `dsh plugin add`가 수동 프로필 수정 없이 자동으로 프로필 레이어로 마운트합니다. 업그레이드 시에도 동일한 명령어를 실행하고 재시작합니다.

- **Pi**:
  Pi는 프로세스 내 확장으로 로드됩니다 (stdin 페이로드나 자식 프로세스 hook이 없음). 패키지에 동봉된 엔트리포인트를 프로젝트에 복사하고 devDependencies에 패키지를 유지합니다:
  ```bash
  npm i -D agents-gitflow-guard
  mkdir -p .pi/extensions
  cp node_modules/agents-gitflow-guard/pi/gitflow-guard.ts .pi/extensions/gitflow-guard.ts
  ```
  `.pi/settings.json`에 구성합니다:
  ```jsonc
  // Pi — .pi/settings.json (extensions 경로는 .pi를 기준으로 해석됨)
  { "extensions": ["extensions/gitflow-guard.ts"] }
  ```

### 3. 소스코드 직접 빌드 및 로컬 개발 (From Source)

컨트리뷰터 또는 최신 소스코드 체크아웃을 직접 로컬에서 실행하고 디버깅하려는 개발자용:

```bash
# 저장소 클론 및 빌드
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build
```

사용하려는 에이전트 플랫폼에 맞게 로컬 빌드를 마운트합니다:

```bash
# A. CLI Hook 클라이언트 (Claude Code · Codex · OpenCode · Antigravity)
npm link # 또는 npm install -g .
gitflow-guard wire --client <claude|codex|opencode|antigravity> --project --yes

# B. DeepSeek Harness (DSH)
dsh plugin --profile web add file:/path/to/AgentsGitFlowController
# 또는 스크립트 실행: node scripts/install-dsh.mjs web (설치 후 DSH 재시작)

# C. Pi
npm link
# 또는 저장소 내의 pi/gitflow-guard.ts를 대상 프로젝트의 .pi/extensions/로 직접 복사
```

### 4. GitHub Copilot 안내

**GitHub Copilot — 의도적으로 전용 hook을 제공하지 않습니다.** Copilot은 이미 도구별 **allow/deny/ask** 권한 설정 및 프로젝트 **rules** (`rules.json` + `AGENTS.md`)라는 자체 가드레일 기능을 내장하고 있습니다. Copilot 사용자에게는 플러그인 훅 대신 공식 문서를 안내하세요:

- [도구 사용 허용 및 거부 (GitHub Docs)](https://docs.github.com/ko/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools)
- [Copilot 코딩 에이전트에 대한 사용자 지정 규칙 추가 (GitHub Docs)](https://docs.github.com/ko/copilot/customizing-copilot/adding-custom-rules-for-the-copilot-coding-agent)
- 선택 사항: 명령어 수준의 인터셉트를 원하는 경우 Copilot 공식 [hooks 시스템](https://docs.github.com/ko/copilot/reference/hooks-reference) (`preToolUse` → `permissionDecision:"deny"`)을 직접 연동할 수 있습니다.

### 5. Hook 메커니즘 및 기술 세부사항

- **플랫폼 프로토콜 규약**: Hook은 stdin에서 페이로드를 읽고 각 플랫폼의 규약에 맞게 응답합니다:
  - **Claude Code / OpenCode**: `exit 2` (stderr로 차단 이유 및 조치 안내 출력).
  - **Codex**: stdout으로 JSON `{"hookSpecificOutput":{"permissionDecision":"deny",...}}` 출력.
  - **Antigravity**: stdout으로 JSON `{"decision":"deny","reason":...}`을 출력하고 `exit 0` 유지 (플랫폼 필수 요건).
  - **Pi**: 프로세스 내 확장이 `tool_call` 이벤트를 감지하고 `{ block: true, reason }` 반환.
- **사전 이벤트만 인터셉트**: 명령어 실행 *전*에 차단이 완료되므로 사후 정리나 권한 토큰 회수 작업이 전혀 필요하지 않습니다.
- **PATH 및 바이너리 확인**: 전역 설치 시 `gitflow-guard` 바이너리가 제공됩니다. 에이전트 자식 프로세스가 `PATH`를 상속받지 못하는 경우 `npm bin -g`가 반환하는 절대 경로를 지정하세요.
- **기본 활성화**: 별도의 설정 파일 없이도 내장 기본값(`integration: ["develop"]`, `archive: ["main"]`)이 즉시 적용되며, 커스텀 설정은 딥 머지됩니다.
- **안전한 배선**: `gitflow-guard wire`는 기존의 다른 Hook을 보존하며 멱등하게 병합하고, `--unwire`를 통해 해당 가드 항목만을 정확하게 제거합니다.

---

## 자주 묻는 질문 (FAQ)

### 브랜치 이름이 기본값과 달라도 사용할 수 있나요?

네. 브랜치 이름은 일체 고정되어 있지 않습니다. `integration`은 내장 기본값(`develop`)으로 제공되며 커스텀 설정이 그 위에 딥 머지됩니다. 해당 항목(및 `preview` / `production` / `archive`)에는 원하는 브랜치 이름이나 정규식을 자유롭게 지정할 수 있습니다. `featurePattern`은 에이전트에게 작업 브랜치를 판별하는 방식을 알려줍니다.

예를 들어 통합 브랜치를 `master`로 부르고, `beta` 프리뷰를 추가하며, feature 브랜치 접두사로 `fix/`를 사용하는 팀이라면 해당 내용을 그대로 설정에 작성하면 됩니다. 모든 차단, 보고, 감사 로그가 지정된 이름에 맞추어 동작합니다. 반드시 따라야 하는 강제 규약은 없으며 오직 사용자가 선언한 매핑만을 따릅니다. [브랜치 이름 및 규칙 커스터마이징](#브랜치-이름-및-규칙-커스터마이징--어떤-명명-규칙도-지원)을 참조하세요.

---

### preview / production / archive 브랜치를 반드시 모두 설정해야 하나요?

아닙니다. 실제 워크플로우에 존재하는 역할만 설정하세요. `develop` 브랜치만 사용하는 1인 개발 저장소라면 `integration: ["develop"]`만 설정하면 충분합니다. 10개의 배포 환경을 운영하는 대규모 기업 팀이라면 `preview` 배열과 `production` 역할을 추가하세요. 나머지는 비활성화 상태를 유지합니다.

---

### 이것은 보안 도구인가요?

아닙니다. 보안 도구로 취급해서는 안 됩니다. 본 플러그인은 합의된 개발 프로세스를 기계적으로 강제하기 위한 워크플로우 가드입니다. 텍스트 기반 명령어 파싱은 본질적으로 베스트 에포트(best-effort) 방식이며, 의도적으로 명령어를 난독화하는 에이전트는 파서를 우회할 가능성이 있습니다.

지원되는 명령어 형식의 범위 내에서 역할 경계는 로컬에서 엄격하게 강제됩니다. 보호 대상 역할 브랜치(integration / preview / production / archive)로의 합류는 반드시 설정된 경로(PR/MR 또는 사람의 직접 머지)를 거쳐야 합니다. 표준적인 난독화 래퍼는 모두 분류 및 차단 대상에 포함되어 있습니다 — 셸 래퍼(`sh -c` / `bash -lc`), 서브셸 및 백틱/`$()` 중첩, `env`/`command`/`nohup`/`xargs`/`sudo` 접두사 및 `VAR=x` 할당, 절대 경로, 파이프라인 및 `||` 후속 구문, Git 전역 옵션(`-C .`, `--git-dir=…`), 와일드카드 refspec(`refs/heads/*:refs/heads/*`), fetch+merge 용도로 사용되는 `git pull`, `send-pack`/`update-ref`/`symbolic-ref` 등의 plumbing 명령어. 보호 브랜치 강제 재생성(`checkout -B`/`switch -C`) 및 보호 브랜치에서의 cherry-pick/revert는 ref-update / ref-move 게이트에 의해 차단됩니다. 실행 가능한 적대적 테스트 코퍼스는 `tests/accuracy-audit.spec.ts`에 수록되어 있습니다.

**로컬에서 방어할 수 없는 영역**: 호스팅 서비스의 API를 직접 호출하는 방식(`gh api repos/…/pulls/N/merge`, `curl`)이나 인터프리터 자식 프로세스 내부 실행(`node -e "child_process.exec('git push …')"`) 등은 구조상 베스트 에포트로 남습니다. 또한 `$()` / 백틱 중첩이 10단계를 넘으면 더 이상 전개되지 않습니다(파서는 비정상 입력으로 충돌하는 대신 전개를 중단합니다). 진정으로 우회 불가능한 경계는 호스팅 서비스의 브랜치 보호 규칙입니다. 본 가드를 즉각적인 피드백 및 감사 추적 도구로 활용하고 서버 측 브랜치 보호와 병행하세요.

---

### 왜 에이전트가 직접 production/archive에 머지할 수 없나요?

게이트가 해당 작업을 **사람 전용(User-only)**으로 분류하기 때문입니다. 플러그인은 production 및 archive 브랜치에 대한 *머지 작업*을 차단합니다 — *PR/MR 생성은 허용*되므로 에이전트는 여전히 `develop` → `main` 아카이브 PR 초안을 작성할 수 있습니다. 하지만 머지 실행 자체는 **사용자**가 직접 머지 버튼을 클릭하는 유일한 경로만 갖습니다. 에이전트가 스스로에게 머지 권한을 부여할 수 있는 토큰이나 허가증, 채팅 메시지는 존재하지 않습니다.

---

### `gh` 또는 `glab` CLI가 반드시 필요한가요?

아닙니다. 필수 사항이 아닙니다. 두 도구는 `pr merge` / `mr merge` 명령어가 어떤 대상 브랜치를 향하고 있는지 확인하기 위한 선택적 어댑터입니다. 이를 통해 게이트는 "integration/preview로의 머지(허용)"와 "production/archive로의 머지(차단)"를 구분합니다. 두 CLI 모두 대상을 확인할 수 없는 경우(미설치, 미인증, 오프라인, 쿼리 실패 시), 게이트는 feature 브랜치에서 실행되었더라도 **머지를 일체 차단**합니다 (해당 PR이 실제로는 운영이나 아카이브를 향하고 있을 수 있기 때문입니다). CLI가 정상 작동할 때 다시 시도하거나 사람이 UI에서 직접 머지를 클릭하세요. 나머지 기능은 모두 동일하게 정상 동작합니다. 핵심 검증 로직은 호스팅 서비스와 통신하지 않으므로 GitHub, GitLab, 자체 호스팅 또는 완전 오프라인 환경에서도 동일하게 작동합니다.

---

### 일반적인 일상 개발 작업이 방해받지 않나요?

의도적으로 방해받지 않도록 설계되었습니다. feature 브랜치에서 수행해야 하는 모든 일상적인 작업 — 커밋, 푸시, 통합 브랜치로부터의 동기화, rebase, 읽기 전용 확인 명령어, `gitflow-guard status` 실행 등 — 은 아무런 제약 없이 허용됩니다.

차단은 오직 다음 경우에만 발생합니다: (1) 보호 대상 역할 브랜치에 직접 쓰기 시도, (2) 에이전트의 production 또는 archive 머지 시도. 잘못된 차단이라고 판단되는 경우 먼저 `gitflow-guard status`를 실행하세요. 각 로컬 브랜치에 할당된 역할이 명확하게 출력되어 설정 오류를 쉽게 확인하고 수정할 수 있습니다.

---

### 설정 파일에 오류가 있으면 어떻게 되나요?

불완전한 추측 설정이 잘못 적용되는 일은 절대 없습니다. 유효성 검사 에러가 발생하면 해당 프로젝트의 가드가 비활성화되고 에러 상세가 보고됩니다.

자주 발생하는 실수: 기본 역할과 동일한 브랜치 이름으로 덮어쓰기(예: 기본 archive가 `main`인 상태에서 `main`을 integration으로 설정 — 명시적 중복 에러이므로 다른 역할도 함께 덮어쓰거나 제거해야 함), 동일한 브랜치를 2개의 역할에 중복 지정(거부), 컴파일할 수 없는 `featurePattern`(유효하지 않은 정규식으로 거부). 에러 안내는 매우 명확하며 설정 파일은 단순한 JSON 객체 하나이므로 30초 내에 수정할 수 있습니다.

---

### 로컬 저장소에서 정확히 어떤 항목을 검사하나요?

현재 체크아웃된 브랜치(`git branch --show-current`), 그리고 `pr merge` / `mr merge` 실행 시 `gh pr view` / `glab mr view`를 통한 PR/MR 대상 브랜치만을 검사합니다. 모델이 순서 기반이 아니라 **역할 기반**(대상 브랜치가 어떤 역할인가)으로 동작하므로 커밋 히스토리의 조상 관계 분석은 필요하지 않습니다.

디스크에 데이터를 쓰거나 원격 서버에 통신하지 않으며, 호스팅 서비스 기능이 필수로 요구되지 않습니다. 에이전트의 운영/아카이브 머지는 단순히 거부되며, 사람의 머지는 Web UI 상에서 이루어집니다.

---

### 라이선스 및 비용은 어떻게 되나요?

MIT 라이선스로 배포되는 무료 오픈소스입니다. 아무런 조건 없이 자유롭게 사용, 수정, 배포할 수 있으며, 유일한 의무는 저작권 고지를 유지하는 것입니다.

본 도구가 팀의 치명적인 워크플로우 실수를 방지하는 데 도움이 되었다면 페이지 상단의 커피 후원을 환영합니다 (의무 사항은 아닙니다). [라이선스](#라이선스)를 참조하세요.

---

## 용어 사전

| 용어 | 의미 |
|---|---|
| **integration** | 기본 통합 브랜치, 핵심 역할 (내장 기본값: `develop`). feature는 PR/MR을 통해 합류함. 보호 대상. |
| **preview** | 선택적 환경 엔드포인트 브랜치 (`branches.preview` 배열). PR/MR을 통해서만 업데이트. |
| **production** | 선택적 운영 브랜치 (`branches.production` 배열). PR/MR + 사람 전용 머지. |
| **archive** | 선택적 릴리스 후 아카이브 브랜치 (`branches.archive` 배열). 에이전트의 PR/MR 생성은 허용되나 머지는 사람 전용. |
| **feature 브랜치** | `featurePattern` 정규식과 일치하는 작업 브랜치. 제약 없는 자유 작업 영역. |
| **게이트 매트릭스 (Gate Matrix)** | 분류된 각 명령어의 허용/차단 여부를 정의하는 판정 테이블. |
| **pre-execute** | 명령어 실행 전에 인터셉트하여 차단을 수행하는 도구 파이프라인 후킹 지점. |
| **사람 전용 머지 (Merge-by-user)** | 운영/아카이브 머지 권한을 사람의 손에 유지하는 설계. PR/MR 상의 클릭이 유일한 확인 수단임. |

---

## 로드맵

향후 계획 및 현재 활발히 탐색 중인 기능:

- **신규 에이전트 플랫폼 지원**: Cursor, Windsurf, 차세대 CLI 에이전트 등 새로운 AI 도구의 Hook/확장 메커니즘 조사 및 연동.
- **감사 로그 집계 및 내보내기**: 여러 머신 간 감사 로그 동기화 및 팀 수준의 보안 규정 준수용 내보내기 포맷 지원.
- **워크플로우 프리셋**: 널리 사용되는 Git 브랜치 전략(트렁크 기반 단일 메인 브랜치, 다중 환경 엔터프라이즈 GitFlow)을 위한 즉시 사용 가능한 설정 프리셋 제공.
- **CI 하드 게이트 연동**: 로컬 실행의 무의존성을 유지하면서 네이티브 CI 파이프라인 연동 및 PR 검사 지원 탐색.

릴리스 이력과 버전별 세부 변경 사항은 [CHANGELOG.md](CHANGELOG.md)를 참조하세요.

---

## 개발 가이드

```bash
npm install
npm test              # 단위 테스트: classify / gate / config / cli / repo / platform / i18n / index / accuracy-audit / pi
npm run typecheck     # 타입 체크: tsc --noEmit, 0 Error
npm run build         # 빌드: tsdown → lib/ (CLI 및 플러그인 공유)
npm run check:pins    # package.json 버전과 CHANGELOG 제목 및 README 핀 일치 여부 확인
npm run verify:matrix # 연속 회귀 매트릭스 테스트: DSH 로직 + zh 로케일 + 멀티 클라이언트 hook + Pi 확장
```

- **품질 규칙**: 모든 로직 변경은 타입 체크(0 에러), 단위 테스트 전체 통과 및 연속 회귀 매트릭스(`verify:matrix`) 통과가 필수입니다.
- **신규 클라이언트 연동**: 새로운 에이전트 플랫폼을 추가할 때는 [AGENTS.md](AGENTS.md) §8의 동기화 체크리스트를 준수하세요.

---

## 후원 및 지원

본 플러그인은 MIT 라이선스의 무료 오픈소스입니다. 여러분과 팀의 실수 없는 안전한 개발 흐름에 도움이 되었다면 커피 한 잔으로 응원해 주세요:

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/keanz21)

---

## 라이선스

[MIT](LICENSE) © FeatureAgents
