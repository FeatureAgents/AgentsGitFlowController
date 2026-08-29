# agents-gitflow-guard

> **Sei stanco che gli agenti IA ignorino il tuo GitFlow?**

Un guardiano configurabile per i ruoli dei branch Git, progettato per gli agenti di sviluppo IA — [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), [Codex](https://github.com/openai/codex), [OpenCode](https://github.com/opencode-ai/opencode), [Antigravity](https://github.com/google-deepmind), [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) e [Pi](https://github.com/mariozechner/pi).  
Definisci i tuoi branch — **integration** (le funzionalità vengono integrate tramite PR/MR), **preview** (ambienti di test), **production** (produzione), **archive** (archivio) — ciascuno con le proprie regole di aggiornamento. Gli agenti non possono saltare il flusso e i merge critici rimangono sotto il tuo controllo.

[English](README.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-tw.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Русский](README.ru.md) · [Licenza](LICENSE)

[![ko-fi](https://img.shields.io/badge/ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## Indice

- [Guida rapida — 30 secondi per proteggere il repository](#guida-rapida--30-secondi-per-proteggere-il-repository)
- [Perché — Il problema risolto da questo plugin](#perché--il-problema-risolto-da-questo-plugin)
- [Per chi è pensato — Scenari e team](#per-chi-è-pensato--scenari-e-team)
- [Funzionalità — Cosa fa il plugin](#funzionalità--cosa-fa-il-plugin)
- [Cosa NON fa — Limiti](#cosa-non-fa--limiti)
- [Protezione lato server vs questo plugin](#protezione-lato-server-vs-questo-plugin)
- [Come funziona — Il meccanismo in tre righe](#come-funziona--il-meccanismo-in-tre-righe)
- [Riferimento configurazione](#riferimento-configurazione)
- [Matrice decisionale — Cosa viene bloccato e cosa consentito](#matrice-decisionale--cosa-viene-bloccato-e-cosa-consentito)
- [Il controllo umano](#il-controllo-umano)
- [Installazione dettagliata](#installazione-dettagliata)
- [Domande frequenti (FAQ)](#domande-frequenti-faq)
- [Glossario](#glossario)
- [Tabella di marcia](#tabella-di-marcia)
- [Supporto](#supporto)
- [Sviluppo](#sviluppo)
- [Licenza](#licenza)

---

## Guida rapida — 30 secondi per proteggere il repository

**Passo 1 — Installazione.** Tutti e sei i client utilizzano lo stesso pacchetto npm `agents-gitflow-guard` — seleziona la modalità corrispondente al tuo agent:

```bash
# Modalità A: Client Hook CLI (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# Modalità B: Plugin in-process DSH (riavviare DSH dopo l'installazione)
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# Modalità C: Estensione in-process Pi
npm i -D agents-gitflow-guard
```

**Passo 2 — Configurazione del client (nessun file di configurazione richiesto).** Il plugin include **valori predefiniti integrati per proteggere `develop` (integrazione) + `main` (archivio)** — attivo per impostazione predefinita senza alcuna configurazione iniziale:

```bash
# Claude Code → .claude/settings.json di questo repository
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity (file dedicati per ciascun client)
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# Anteprima senza scrittura / Rimozione / Configurazione guidata:
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` applica le modifiche in modo **non distruttivo** ai file di configurazione esistenti.

> ⚠️ **main è protetto per impostazione predefinita.** Per i flussi di tipo Trunk-based, disattiva il plugin impostando `{ "enabled": false }` in `gitflow-guard.config.json`.

**Passo 3 — Verifica.** Chiedi all'agente di eseguire `git push origin develop`. L'operazione verrà bloccata:

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

---

## Perché — Il problema risolto da questo plugin

Gli agenti IA lavorano direttamente nel repository. Le istruzioni nei prompt di sistema e nei file di progetto (`AGENTS.md`, `CLAUDE.md`, ecc.) sono **regole flessibili**: i modelli possono dimenticarle o ignorarle.

Questo plugin trasforma le regole testuali in **vincoli rigidi di sistema**. Ogni comando Git tentato dall'agente viene intercettato e verificato rispetto allo stato reale del repository locale prima dell'esecuzione.

---

## Funzionalità — Cosa fa il plugin

- **Blocco pre-esecuzione**: Push diretti, force push e cancellazioni su branch protetti (integration, preview, production, archive) vengono bloccati prima dell'esecuzione.
- **Merge riservato all'umano (Merge-by-user)**: Gli agenti possono creare PR/MR verso la produzione o l'archivio, ma il merge effettivo è riservato all'utente.
- **Audit log protetto**: Tutte le operazioni respinte vengono registrate in `~/.local/state/gitflow-guard/` al di fuori del repository.

---

## Matrice decisionale — Cosa viene bloccato e cosa consentito

| Azione dell'agente | Decisione |
|---|---|
| commit / push su branch feature / sync / rebase | ✅ allow (consentito) |
| Push diretto / force push / cancellazione su integration / preview / production / archive | 🚫 block (bloccato) |
| Creazione PR/MR: feature → integration / preview | ✅ allow (consentito) |
| Creazione PR/MR: feature → production | ✅ Creazione consentita; **Merge bloccato** (eseguito dall'utente) |
| Creazione PR/MR → archive | ✅ Creazione consentita; 🚫 **Merge bloccato** (eseguito dall'utente) |
| `git merge feature/x` locale su integration / preview | 🚫 block (PR/MR richiesto) |
| Comandi concatenati (`checkout develop && merge feature/x`) | 🚫 block (simulazione per segmento) |
| `git checkout -B` / `git switch -C` verso branch protetti | 🚫 block |
| Comandi Git eseguiti con `sudo` | 🚫 Wrapper rimosso e comando sottostante verificato |

---

## Installazione dettagliata

**Prerequisiti**: **Node.js ≥ 22** nel tuo `PATH`. Tutti i client utilizzano lo **stesso pacchetto npm** `agents-gitflow-guard`.

### 1. Client Hook CLI autonomi (Claude Code · Codex · OpenCode · Antigravity)

```bash
npm i -g agents-gitflow-guard
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

### 2. Plugin ed estensioni in-process (DSH · Pi)

- **DeepSeek Harness (DSH)**: `dsh plugin --profile web add agents-gitflow-guard` (riavviare DSH dopo l'installazione)
- **Pi**: `npm i -D agents-gitflow-guard` e copiare `node_modules/agents-gitflow-guard/pi/gitflow-guard.ts` in `.pi/extensions/`

### 3. Installazione da sorgente e sviluppo locale (From Source)

```bash
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build

# Collega in base al client:
npm link # Client Hook CLI o Pi
dsh plugin --profile web add file:/path/to/AgentsGitFlowController # DSH
```

---

## Licenza

[MIT](LICENSE) © FeatureAgents
