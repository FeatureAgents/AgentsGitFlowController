# agents-gitflow-guard

> **Cansado de agentes de IA ignorando seu GitFlow?**

Um guardião configurável para papéis de branches Git, desenvolvido para agentes de codificação IA — [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH), Claude Code, Codex, OpenCode, Antigravity e Pi.  
Defina suas próprias branches — **integration** (funcionalidades são mescladas via PR/MR), **preview** (ambientes de teste), **production** (produção), **archive** (arquivo) — cada uma com suas próprias regras de atualização. Os agentes não podem burlar o processo e os merges críticos permanecem sob seu controle humano.

[English](README.md) · [简体中文](README.zh.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Licença](LICENSE)

[![ko-fi](https://img.shields.io/badge/ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## Índice

- [Início Rápido — 30 segundos para proteger seu repositório](#início-rápido--30-segundos-para-proteger-seu-repositório)
- [Por que — O problema resolvido por este plugin](#por-que--o-problema-resolvido-por-este-plugin)
- [Para quem — Cenários e equipes](#para-quem--cenários-e-equipes)
- [Funcionalidades — O que o plugin faz](#funcionalidades--o-que-o-plugin-faz)
- [O que o plugin NÃO faz — Limites](#o-que-o-plugin-não-faz--limites)
- [Proteção do lado do servidor vs este plugin](#proteção-do-lado-do-servidor-vs-este-plugin)
- [Como funciona — O mecanismo em três linhas](#como-funciona--o-mecanismo-em-três-linhas)
- [Referência de Configuração](#referência-de-configuração)
- [Matriz de Decisão — O que é bloqueado e o que é permitido](#matriz-de-decisão--o-que-é-bloqueado-e-o-que-é-permitido)
- [Onde o humano mantém o controle](#onde-o-humano-mantém-o-controle)
- [Instalação Detalhada](#instalação-detalhada)
- [Perguntas Frequentes (FAQ)](#perguntas-frequentes-faq)
- [Glossário](#glossário)
- [Roteiro (Roadmap)](#roteiro-roadmap)
- [Suporte](#suporte)
- [Desenvolvimento](#desenvolvimento)
- [Licença](#licença)

---

## Início Rápido — 30 segundos para proteger seu repositório

**Passo 1 — Instalação.** Todos os seis clientes utilizam o mesmo pacote npm `agents-gitflow-guard`:

```bash
# DSH — Plugin in-process (reinicie o DSH após a instalação)
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# Claude Code · Codex · OpenCode · Antigravity — Hooks autônomos (sem necessidade de DSH)
npm i -g agents-gitflow-guard
```

```bash
# Pi — Extensão in-process
npm i -D agents-gitflow-guard
```

**Passo 2 — Conectar o cliente (nenhum arquivo de configuração necessário).** O plugin vem com **padrões integrados que protegem `develop` (integração) + `main` (arquivo)** — ativado por padrão com zero configuração:

```bash
# Claude Code → .claude/settings.json deste repositório
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity (arquivos dedicados por cliente)
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# Pré-visualização sem gravação / Remoção / Assistente interativo:
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` insere as configurações de forma **não destrutiva** nos arquivos existentes.

> ⚠️ **main é protegido por padrão.** Para fluxos Trunk-based, desative o guard definindo `{ "enabled": false }` em `gitflow-guard.config.json`.

**Passo 3 — Verificação.** Peça ao agente para executar `git push origin develop`. A operação será bloqueada:

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

---

## Por que — O problema resolvido por este plugin

Os agentes de codificação IA trabalham diretamente no seu repositório. As instruções em prompts e arquivos de documentação (`AGENTS.md`, `CLAUDE.md`, etc.) são **regras flexíveis**: os modelos podem ignorá-las ou esquecê-las.

Este plugin transforma regras de texto em **mecanismos rígidos**. Qualquer comando Git executado pelo agente é interceptado e validado contra o estado real do repositório local antes de sua execução.

---

## Funcionalidades — O que o plugin faz

- **Bloqueio pré-execução**: Push direto, force push e exclusão de branches protegidas (integration, preview, production, archive) são bloqueados antes de rodar.
- **Merge exclusivo por humanos (Merge-by-user)**: Os agentes podem criar PR/MR para produção ou arquivo, mas o merge efetivo só pode ser realizado pelo usuário.
- **Auditoria segura**: Todo bloqueio é registrado em `~/.local/state/gitflow-guard/` fora do repositório.

---

## Matriz de Decisão — O que é bloqueado e o que é permitido

| Ação do Agente | Decisão |
|---|---|
| commit / push na branch feature / sync / rebase | ✅ allow (permitido) |
| Push direto / force push / exclusão em integration / preview / production / archive | 🚫 block (bloqueado) |
| Criação de PR/MR: feature → integration / preview | ✅ allow (permitido) |
| Criação de PR/MR: feature → production | ✅ Criação permitida; **Merge bloqueado** (usuário realiza o merge) |
| Criação de PR/MR → archive | ✅ Criação permitida; 🚫 **Merge bloqueado** (usuário realiza o merge) |
| `git merge feature/x` local em integration / preview | 🚫 block (PR/MR obrigatório) |
| Comandos encadeados (`checkout develop && merge feature/x`) | 🚫 block (simulado por segmento) |
| `git checkout -B` / `git switch -C` para branches protegidas | 🚫 block |
| Comandos Git executados via `sudo` | 🚫 Invólucro removido e comando subjacente validado |

---

## Instalação Detalhada

**Pré-requisito**: **Node.js ≥ 22** no seu `PATH`.

```bash
npm i -g agents-gitflow-guard
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

---

## Licença

[MIT](LICENSE) © FeatureAgents
