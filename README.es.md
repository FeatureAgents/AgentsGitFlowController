# agents-gitflow-guard

> **¿Cansado de que los agentes de IA ignoren tu GitFlow?**

Un guardián configurable para roles de ramas Git, diseñado para agentes de programación de IA — [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), [Codex](https://github.com/openai/codex), [OpenCode](https://github.com/opencode-ai/opencode), [Antigravity](https://github.com/google-deepmind), [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) y [Pi](https://github.com/mariozechner/pi).  
Define tus propias ramas — **integration** (las funcionalidades se integran mediante PR/MR), **preview** (entornos de prueba), **production** (producción), **archive** (archivo) — cada una con sus propias reglas de actualización. Los agentes no pueden eludir el flujo y los merges críticos permanecen bajo tu control humano.

[English](README.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-tw.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Русский](README.ru.md) · [Licencia](LICENSE)

[![ko-fi](https://img.shields.io/badge/ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## Índice

- [Inicio Rápido — 30 segundos para proteger tu repositorio](#inicio-rápido--30-segundos-para-proteger-tu-repositorio)
- [Por qué — El problema que resuelve este plugin](#por-qué--el-problema-que-resuelve-este-plugin)
- [Para quién es — Escenarios y equipos](#para-quién-es--escenarios-y-equipos)
- [Qué hace — Capacidades](#qué-hace--capacidades)
- [Qué NO hace — Límites](#qué-no-hace--límites)
- [Protección del lado del servidor vs este plugin](#protección-del-lado-del-servidor-vs-este-plugin)
- [Cómo funciona — El mecanismo en tres líneas](#cómo-funciona--el-mecanismo-en-tres-líneas)
- [Referencia de Configuración](#referencia-de-configuración)
- [Matriz de Decisión — Qué se bloquea y qué se permite](#matriz-de-decisión--qué-se-bloquea-y-qué-se-permite)
- [Dónde el humano mantiene el control](#dónde-el-humano-mantiene-el-control)
- [Instalación Detallada](#instalación-detallada)
- [Preguntas Frecuentes (FAQ)](#preguntas-frecuentes-faq)
- [Glosario](#glosario)
- [Hoja de Ruta (Roadmap)](#hoja-de-ruta-roadmap)
- [Soporte](#soporte)
- [Desarrollo](#desarrollo)
- [Licencia](#licencia)

---

## Inicio Rápido — 30 segundos para proteger tu repositorio

**Paso 1 — Instalación.** Todos los seis clientes utilizan el mismo paquete npm `agents-gitflow-guard` — selecciona el modo adecuado para tu agente:

```bash
# Modo A: Clientes Hook CLI (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# Modo B: Plugin en proceso DSH (reiniciar DSH después de la instalación)
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# Modo C: Extensión en proceso Pi
npm i -D agents-gitflow-guard
```

**Paso 2 — Conectar el cliente (sin necesidad de archivo de configuración).** El plugin viene con **valores predeterminados integrados que protegen `develop` (integración) + `main` (archivo)** — activado por defecto con cero configuración:

```bash
# Claude Code → .claude/settings.json de este repositorio
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity (archivos dedicados por cliente)
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# Vista previa sin escribir / Desinstalación / Asistente interactivo:
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` inserta la configuración de forma **no destructiva** en tus archivos existentes.

> ⚠️ **main está protegido por defecto.** Para flujos de tipo Trunk-based, desactiva el guard estableciendo `{ "enabled": false }` en `gitflow-guard.config.json`.

**Paso 3 — Verificación.** Pide al agente que ejecute `git push origin develop`. La operación será bloqueada:

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

---

## Por qué — El problema que resuelve este plugin

Los agentes de programación de IA trabajan directamente en tu repositorio. Las instrucciones en prompts y archivos de documentación (`AGENTS.md`, `CLAUDE.md`, etc.) son **reglas flexibles**: los modelos pueden ignorarlas u olvidarlas.

Este plugin transforma reglas de texto en **mecanismos rígidos de sistema**. Cada comando Git intentado por el agente es interceptado y validado contra el estado real del repositorio local antes de su ejecución.

---

## Qué hace — Capacidades

- **Bloqueo previo a la ejecución**: Push directo, force push y eliminación de ramas protegidas (integration, preview, production, archive) se bloquean antes de ejecutarse.
- **Merge exclusivo por humanos (Merge-by-user)**: Los agentes pueden crear PR/MR hacia producción o archivo, pero el merge efectivo está reservado al usuario.
- **Registro de auditoría seguro**: Cada denegación se registra en `~/.local/state/gitflow-guard/` fuera del repositorio.

---

## Matriz de Decisión — Qué se bloquea y qué se permite

| Acción del Agente | Decisión |
|---|---|
| commit / push en rama feature / sync / rebase | ✅ allow (permitido) |
| Push directo / force push / eliminación en integration / preview / production / archive | 🚫 block (bloqueado) |
| Creación de PR/MR: feature → integration / preview | ✅ allow (permitido) |
| Creación de PR/MR: feature → production | ✅ Creación permitida; **Merge bloqueado** (el usuario realiza el merge) |
| Creación de PR/MR → archive | ✅ Creación permitida; 🚫 **Merge bloqueado** (el usuario realiza el merge) |
| `git merge feature/x` local en integration / preview | 🚫 block (PR/MR obligatorio) |
| Comandos encadenados (`checkout develop && merge feature/x`) | 🚫 block (simulación por segmento) |
| `git checkout -B` / `git switch -C` hacia ramas protegidas | 🚫 block |
| Comandos Git ejecutados con `sudo` | 🚫 Envoltura eliminada y comando subyacente validado |

---

## Instalación Detallada

**Requisito previo**: **Node.js ≥ 22** en tu `PATH`. Todos los clientes utilizan el **mismo paquete npm** `agents-gitflow-guard`.

### 1. Clientes Hook CLI autónomos (Claude Code · Codex · OpenCode · Antigravity)

```bash
npm i -g agents-gitflow-guard
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

### 2. Plugins y extensiones en proceso (DSH · Pi)

- **DeepSeek Harness (DSH)**: `dsh plugin --profile web add agents-gitflow-guard` (reiniciar DSH después de la instalación)
- **Pi**: `npm i -D agents-gitflow-guard` y copiar `node_modules/agents-gitflow-guard/pi/gitflow-guard.ts` a `.pi/extensions/`

### 3. Instalación desde el código fuente (From Source)

```bash
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build

# Conectar según tu cliente:
npm link # Clientes Hook CLI o Pi
dsh plugin --profile web add file:/path/to/AgentsGitFlowController # DSH
```

---

## Licencia

[MIT](LICENSE) © FeatureAgents
