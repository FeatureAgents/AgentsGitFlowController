# agents-gitflow-guard

> **Устали от того, что ИИ-агенты нарушают ваш GitFlow?**

Настраиваемый страж ролей веток Git для ИИ-агентов кодинга — поддержка [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), [Codex](https://github.com/openai/codex), [OpenCode](https://github.com/opencode-ai/opencode), [Antigravity](https://github.com/google-deepmind), [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) и [Pi](https://github.com/mariozechner/pi).  
Определяйте свои ветки — **integration** (слияние фич через PR/MR), **preview** (тестовые окружения), **production** (продакшн), **archive** (архив) — каждая со своими правилами. Агенты не могут обойти процесс, а критические слияния остаются под контролем человека.

[English](README.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-tw.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Русский](README.ru.md) · [Лицензия](LICENSE)

[![ko-fi](https://img.shields.io/badge/ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## Содержание

- [Быстрый старт — Защита репозитория за 30 секунд](#быстрый-старт--защита-репозитория-за-30-секунд)
- [Зачем это нужно — Проблема, которую решает плагин](#зачем-это-нужно--проблема-которую-решает-плагин)
- [Для кого — Сценарии и команды](#для-кого--сценарии-и-команды)
- [Возможности — Что делает плагин](#возможности--что-делает-плагин)
- [Ограничения — Чего плагин НЕ делает](#ограничения--чего-плагин-не-делает)
- [Защита на стороне сервера vs этот плагин](#защита-на-стороне-сервера-vs-этот-плагин)
- [Принцип работы — Механизм в трех строках](#принцип-работы--механизм-в-трех-строках)
- [Справочник по конфигурации](#справочник-по-конфигурации)
- [Матрица решений — Что блокируется, а что разрешено](#матрица-решений--что-блокируется-а-что-разрешено)
- [Контроль человека](#контроль-человека)
- [Подробная установка](#подробная-установка)
- [Часто задаваемые вопросы (FAQ)](#часто-задаваемые-вопросы-faq)
- [Глоссарий](#глоссарий)
- [Планы развития (Roadmap)](#планы-развития-roadmap)
- [Поддержка](#поддержка)
- [Разработка](#разработка)
- [Лицензия](#лицензия)

---

## Быстрый старт — Защита репозитория за 30 секунд

**Шаг 1 — Установка.** Все 6 клиентов используют один и тот же npm-пакет `agents-gitflow-guard` — выберите подходящий режим для вашего агента:

```bash
# Режим A: CLI Hook клиенты (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# Режим B: Внутрипроцессный плагин DSH (перезапустите DSH после установки)
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# Режим C: Внутрипроцессное расширение Pi
npm i -D agents-gitflow-guard
```

**Шаг 2 — Подключение клиента (файл конфигурации не требуется).** Плагин поставляется со **встроенными настройками по умолчанию, защищающими `develop` (интеграция) + `main` (архив)** — включен сразу без настроек:

```bash
# Claude Code → .claude/settings.json текущего репозитория
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity (отдельные файлы конфигурации для каждого клиента)
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# Предпросмотр без записи / Удаление / Интерактивный мастер:
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` внедряет конфигурацию **неразрушающим образом** в существующие файлы.

> ⚠️ **main защищен по умолчанию.** Для Trunk-based разработки отключите плагин, указав `{ "enabled": false }` в `gitflow-guard.config.json`.

**Шаг 3 — Проверка.** Попросите агента выполнить `git push origin develop`. Команда будет заблокирована:

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

---

## Зачем это нужно — Проблема, которую решает плагин

ИИ-агенты кодинга работают непосредственно в вашем репозитории. Инструкции в системных промптах и проектных файлах (`AGENTS.md`, `CLAUDE.md` и др.) — это лишь **мягкие правила**, которые модели могут пропустить или проигнорировать.

Этот плагин превращает текстовые правила в **жесткие системные ограничения**. Каждая Git-команда перехватывается и проверяется относительно реального состояния локального репозитория до ее фактического запуска.

---

## Возможности — Что делает плагин

- **Блокировка до выполнения**: Прямой push, force push и удаление защищенных веток (integration, preview, production, archive) блокируются до старта.
- **Слияние только человеком (Merge-by-user)**: Агенты могут создавать PR/MR, но фактическое слияние в production/archive выполняет только человек в веб-интерфейсе.
- **Безопасный журнал аудита**: Все факты блокировок записываются в `~/.local/state/gitflow-guard/` вне рабочего каталога репозитория.

---

## Матрица решений — Что блокируется, а что разрешено

| Действие агента | Решение |
|---|---|
| commit / push в ветке feature / rebase / sync | ✅ allow (разрешено) |
| Прямой push / force push / удаление в integration / preview / production / archive | 🚫 block (заблокировано) |
| Создание PR/MR: feature → integration / preview | ✅ allow (разрешено) |
| Создание PR/MR: feature → production | ✅ Создание разрешено; **Слияние заблокировано** (выполняет человек) |
| Создание PR/MR → archive | ✅ Создание разрешено; 🚫 **Слияние заблокировано** (выполняет человек) |
| Локальный `git merge feature/x` на integration / preview | 🚫 block (требуется PR/MR) |
| Принудительное пересоздание защищенной ветки (`git checkout -B` / `git switch -C`) | 🚫 block |
| Git-команды, обернутые в `sudo` | 🚫 Оболочка снимается, проверяется вложенная Git-команда |

---

## Подробная установка

**Требование**: **Node.js ≥ 22** в вашем `PATH`. Все клиенты используют **один и тот же npm-пакет** `agents-gitflow-guard`.

### 1. Автономные CLI Hook клиенты (Claude Code · Codex · OpenCode · Antigravity)

```bash
npm i -g agents-gitflow-guard
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

### 2. Внутрипроцессные плагины и расширения (DSH · Pi)

- **DeepSeek Harness (DSH)**: `dsh plugin --profile web add agents-gitflow-guard` (перезапустите DSH после установки)
- **Pi**: `npm i -D agents-gitflow-guard` и скопируйте `node_modules/agents-gitflow-guard/pi/gitflow-guard.ts` в `.pi/extensions/`

### 3. Установка из исходного кода (From Source)

```bash
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build

# Подключение в зависимости от клиента:
npm link # CLI Hook клиенты или Pi
dsh plugin --profile web add file:/path/to/AgentsGitFlowController # DSH
```

---

## Лицензия

[MIT](LICENSE) © FeatureAgents
