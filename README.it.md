# agents-gitflow-guard

> **Sei stanco che gli agenti IA ignorino il tuo GitFlow?**

Un guardiano configurabile per i ruoli dei branch Git per agenti di codifica IA — [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), [Codex](https://github.com/openai/codex), [OpenCode](https://github.com/opencode-ai/opencode), [Antigravity](https://github.com/google-deepmind), [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) e [Pi](https://github.com/mariozechner/pi).
Definisci i tuoi branch —
**integration** (le feature confluiscono tramite PR/MR), **preview** (endpoint di ambiente), **production**, **archive** — ciascuno con le proprie regole di aggiornamento. Gli agenti non possono aggirare il flusso e i merge critici rimangono nelle tue mani.

[English](README.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-tw.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Русский](README.ru.md) · [Licenza](LICENSE)

[![Support on Ko-fi](https://img.shields.io/badge/Support_on_Ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## Indice

- [Guida rapida — 30 secondi per proteggere il repository](#guida-rapida--30-secondi-per-proteggere-il-repository)
- [Perché — Il problema risolto da questo plugin](#perché--il-problema-risolto-da-questo-plugin)
- [A chi è rivolto — Scenari e team](#a-chi-è-rivolto--scenari-e-team)
- [Cosa fa — Funzionalità](#cosa-fa--funzionalità)
- [Cosa NON fa — Limiti oggettivi](#cosa-non-fa--limiti-oggettivi)
- [Protezione lato server rispetto a questo plugin](#protezione-lato-server-rispetto-a-questo-plugin)
- [Come funziona — Il meccanismo in tre righe](#come-funziona--il-meccanismo-in-tre-righe)
- [Riferimento di configurazione](#riferimento-di-configurazione)
- [Matrice dei controlli (Gate Matrix) — Cosa viene bloccato e cosa passa](#matrice-dei-controlli-gate-matrix--cosa-viene-bloccato-e-cosa-passa)
- [Dove l'essere umano mantiene il controllo](#dove-lessere-umano-mantiene-il-controllo)
- [Installazione dettagliata](#installazione-dettagliata)
- [FAQ](#faq)
- [Glossario](#glossario)
- [Roadmap](#roadmap)
- [Sviluppo](#sviluppo)
- [Supporto](#supporto)
- [Licenza](#licenza)

---

## Guida rapida — 30 secondi per proteggere il repository

**Passo 1 — installazione.** Tutti e sei i client utilizzano lo stesso pacchetto npm `agents-gitflow-guard` — scegli la modalità di installazione corrispondente al tuo agente:

```bash
# Modalità A: Client Hook CLI (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# Modalità B: Plugin in-process DSH (riavviare DSH dopo l'installazione; i plugin vengono caricati all'avvio)
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# Modalità C: Estensione in-process Pi
npm i -D agents-gitflow-guard
```

> **Nota**: Un semplice `add` o `npm i` installa la versione più recente dal registro npm. Se il tuo mirror del registro presenta ritardi di cache o devi bloccare una versione specifica, aggiungi `@<versione>` (es. `npm i -g agents-gitflow-guard@<versione>`). (Quando si usa DSH, l'avviso di peer dependency di pnpm è previsto — DSH fornisce `@deepseek-ai/cordis` / `@deepseek-ai/dsh-tools` tramite il fallback del modulo profile condiviso a runtime; il plugin funziona normalmente.)
>
> I client hook CLI eseguono un comando di collegamento (wiring) dopo l'installazione (vedere Passo 2); Pi copia un file di estensione; DSH si monta automaticamente all'installazione del plugin.

**Passo 2 — collega il tuo client (nessun file di configurazione richiesto).** Il guardiano include **impostazioni predefinite integrate che proteggono `develop` (integration) + `main` (archive)** — zero configurazione, attivo per impostazione predefinita. L'unica cosa necessaria è indicare al tuo client IA di invocare il guardiano, con un solo comando per ciascun client stdin-hook (DSH è collegato automaticamente; Pi copia semplicemente un file, vedere sotto):

```bash
# Claude Code → .claude/settings.json di questo repository
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity (ciascuno con il proprio file di configurazione; --yes salta la richiesta y/N)
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# Anteprima (nessuna scrittura) / rimozione / guida interattiva:
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` unisce le impostazioni nella configurazione esistente in modo **non distruttivo** (gli hook già presenti non vengono toccati) e scrive nella **directory del progetto per impostazione predefinita** — `--global` (tutti i repository su questa macchina) richiede sempre conferma preventiva o necessita di `--yes`. I file e i formati per ciascun client sono riportati in [Installazione dettagliata](#installazione-dettagliata).

> ⚠️ **main è protetto per impostazione predefinita.** Gli utenti di flussi basati su trunk / singolo branch (in cui tutti eseguono il push direttamente su un unico branch) verranno bloccati sui push diretti su `main` a meno che non disattivino la protezione — crea `gitflow-guard.config.json` con `{ "enabled": false }` oppure mappa i tuoi branch (vedere [Riferimento di configurazione](#riferimento-di-configurazione)). `gitflow-guard status` ripete questo avviso ogni volta che sono attive le impostazioni predefinite integrate.

**Passo 3 — verifica.** Chiedi all'agente di eseguire `git push origin develop`. La chiamata allo strumento verrà respinta:

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

I messaggi sono in inglese per impostazione predefinita; crea una configurazione con `"locale": "zh"` per passare al cinese — i messaggi appariranno come: *已拦截:受保护分支「develop」禁止直推 / 下一步:集成分支(develop)由 PR/MR 合入 feature……* (vedere [Riferimento di configurazione](#riferimento-di-configurazione)).

**Fatto.** Il guardiano è attivo per questo repository con le impostazioni predefinite integrate. Desideri più stadi (`preview` / `production`) o nomi di branch differenti? Scrivi un file `gitflow-guard.config.json` includendo solo i campi che ti interessano — tutto il resto manterrà i valori predefiniti integrati. Per la tabella decisionale completa, consulta la [Matrice dei controlli (Gate Matrix)](#matrice-dei-controlli-gate-matrix--cosa-viene-bloccato-e-cosa-passa).

### Procedura dettagliata — una feature, dall'inizio alla fine

Scenario: il tuo team rilascia una pagina di login (`feature/login-page`); `develop` è il branch di integrazione, `main` l'archivio. Cosa sperimentano tu e l'agente a ogni passo:

| # | cosa esegue l'agente | decisione del plugin | cosa vedi |
|---|---|---|---|
| 1 | `git checkout -b feature/login-page` (da develop) | ✅ consentito (il lavoro su feature è libero) | branch creato |
| 2 | `git add . && git commit -m "feat: login"` | ✅ consentito | commit eseguito |
| 3 | `git push -u origin feature/login-page` | ✅ consentito (il push della tua feature è consentito) | push eseguito |
| 4 | `git checkout develop && git merge feature/login-page` | 🚫 **bloccato** — il branch di integrazione accetta solo PR/MR | è necessario aprire una PR/MR verso develop |
| 5 | `gh pr create --base develop` | ✅ consentito (feature → integrazione tramite PR) | PR creata, tu la revisioni e la unisci |
| 6 | `git push origin main` o merge in main | 🚫 **bloccato** — l'archivio è riservato all'intervento manuale dell'utente | archivi tu stesso develop → main dopo il rilascio |

Nota cosa l'agente *non può* fare: unire una feature direttamente in `develop`, o toccare `main` in qualsiasi modo. Ogni merge critico è un'azione umana intenzionale nella pagina della PR/MR o nel tuo terminale.

---

## Perché — Il problema risolto da questo plugin

Gli agenti di codifica IA operano nel tuo repository. A loro viene *detto* — tramite prompt di sistema, file di istruzioni di progetto (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules` e simili) e documentazione — di seguire un flusso di merge: sviluppare su un branch feature, unire nel branch di integrazione (e negli stadi di preview/production se presenti) e lasciare a te i merge verso archivio e produzione.

**Questa è una regola debole (soft rule).** Gli agenti la saltano, ne modificano l'ordine o semplicemente la "dimenticano" — non per malizia, ma perché le istruzioni testuali sono opzionali per un modello linguistico.

Questo plugin trasforma la regola debole in un **meccanismo rigido (hard mechanism)**. Ogni operazione git tentata da un agente viene verificata rispetto allo *stato effettivo del tuo repository locale*. Le violazioni vengono bloccate prima dell'esecuzione del comando, con una spiegazione del motivo e dei passi successivi da seguire.

Nessuno deve ricordarsi le regole — le regole vengono applicate forzatamente.

---

## A chi è rivolto — Scenari e team

### Segnali che questo plugin fa per te

- Hai — o desideri avere — un flusso di branch definito, da un singolo branch di integrazione in stile `develop` fino a pipeline multi-stadio di preview/production.
- Un agente ha già preso una scorciatoia: ha effettuato un push diretto su un branch protetto o ha eseguito un merge dove non avrebbe dovuto. Se è successo una volta, accadrà di nuovo — questo plugin rappresenta la correzione strutturale.
- Proteggi i tuoi branch di integrazione/archivio ma non vuoi fare affidamento sulla revisione manuale per rilevare ogni scorciatoia.
- Più feature vengono sviluppate in parallelo e convergono in un unico ambiente di preview condiviso, e desideri che ogni passaggio a uno stadio più rigoroso sia sottoposto a revisione.

### Scenari concreti

1. **Sviluppatore singolo + agente su progetti per clienti.** Assegni un ticket all'agente; questo "aiuta" eseguendo il push direttamente nel branch di integrazione. Con un piccolo file di configurazione, l'agente è fisicamente impossibilitato a toccare i branch protetti senza una PR/MR — anche quando non lo stai osservando.
2. **Piccolo team (3–10 persone) con preview distribuita via CI.** L'ambiente di staging si distribuisce automaticamente al merge; un giorno un agente ha unito una feature in `develop` senza alcuna revisione. Da quel momento in poi, ogni accesso agli stadi protetti richiede una PR/MR — un atto intenzionale e tracciato.
3. **Impresa con pipeline multi-ambiente.** Molti endpoint di preview oltre a una linea controllata di produzione e archivio — ogni ruolo viene semplicemente configurato e il guardiano scala senza necessità di regole aggiuntive.
4. **Collaborazione asincrona.** Non sei sempre online. Il guardiano mantiene integro il flusso tra le tue sessioni; i merge verso produzione e archivio rimangono esclusivamente di tua competenza.

**Non fa per te** (vedere anche [Cosa NON fa — Limiti oggettivi](#cosa-non-fa--limiti-oggettivi)):

- **Flusso basato su trunk (Trunk-based)** — tutti eseguono il merge direttamente su un unico branch: il plugin bloccherebbe continuamente.
- **Repository personale senza un flusso definito** — nulla da applicare, nessun valore aggiunto.
- **Un team non disposto ad assegnare ruoli ai branch** — il plugin richiede almeno un branch `integration` da proteggere.

---

## Cosa fa — Funzionalità

- **Blocca prima dell'esecuzione**: push diretto / force-push / cancellazione di branch con ruoli protetti (integration / preview / production / archive); merge dell'agente verso production o archive.
- **Guidato dai ruoli, completamente configurabile**: `integration` (predefinito integrato: `develop`) è il ruolo principale; `preview` / `production` / `archive` sono array opzionali di nomi di branch o regex, ciascuno con le proprie regole di aggiornamento (`pr` / `flexible`, `mergeBy`).
- **Merge da parte dell'utente dove conta (Merge-by-user)**: i merge verso production e archive rimangono nelle tue mani — il plugin impedisce all'agente di cliccare su merge, quindi la tua azione *è* la conferma.
- **Funziona con qualsiasi schema di denominazione**: i nomi dei branch sono mappati tramite la configurazione, mai cablati nel codice (vedere [Riferimento di configurazione](#riferimento-di-configurazione)).
- **Completamente verificabile (Audit log)**: ogni blocco viene aggiunto a un log di audit nella directory di stato dell'utente (`~/.local/state/gitflow-guard/`, `%LOCALAPPDATA%\gitflow-guard` su Windows) — all'esterno del repository, mai tracciato in git, fuori dalla sandbox scrivibile dall'agente e condiviso tra tutti i worktree collegati di uno stesso repository.
- **Nucleo agnostico rispetto alla piattaforma**: puro git locale; opzionalmente consulta `gh` (GitHub) o `glab` (GitLab) per la risoluzione della destinazione di PR/MR, funzionando perfettamente anche senza di essi.

---

## Cosa NON fa — Limiti oggettivi

- **Non è un perimetro di sicurezza assoluto.** Il parsing dei comandi è svolto al meglio delle possibilità (best-effort); un agente determinato a offuscare i comandi può eludere l'analisi testuale.
- **Non funge da gate sulle piattaforme CI.** Lo stato della CI viene registrato solo come riferimento, mai come vincolo rigido. La vera protezione dei branch appartiene alle impostazioni di GitHub/GitLab, che possono stratificarsi al di sopra.
- **Non sostituisce il flusso stesso.** Il tuo progetto deve avere almeno un branch `integration`; se tutti eseguono il push direttamente su un unico branch, questo plugin bloccherà costantemente — non abilitarlo in quel caso.
- **Produzione e archivio non sono automatizzati** — sono deliberatamente lasciati al tuo clic manuale; il plugin si limita a dire "no" agli agenti.

---

## Protezione lato server rispetto a questo plugin

La protezione dei branch lato server (regole di protezione dei branch su GitHub, branch protetti su GitLab) e questo plugin risolvono **problemi diversi**. Sono complementari, non alternativi.

| dimensione | protezione lato server | questo plugin |
|---|---|---|
| cosa controlla | *chi* può eseguire push / merge sui branch protetti (permessi) | *come* gli agenti possono entrare nel flusso (flusso di lavoro) — in quale ruolo confluisce un merge |
| impedisce agli agenti di effettuare merge in produzione/archivio | no — non può distinguere "è stato un agente" | sì — i merge in produzione/archivio sono bloccati per gli agenti per impostazione predefinita |
| flessibilità per ruolo | una regola per branch sull'host | `update` (`pr`/`flexible`) + `mergeBy` (`user`/`anyone`) per ruolo in un unico file di configurazione |
| ambito di applicazione | ogni utente del repository, esseri umani inclusi | agenti DSH con il plugin configurato (gli esseri umani non hanno restrizioni) |
| punto di applicazione | lato server, al momento del push / merge | locale, prima dell'esecuzione del comando |
| piattaforma | vincolata al servizio di hosting | puro git locale, indipendente dalla piattaforma (`gh` / `glab` opzionali) |
| aggirabile da | utenti con privilegi di amministratore | chiunque lavori al di fuori di DSH, o un agente intenzionalmente malevolo |

Perché questo è importante: la protezione dei branch risponde alla domanda *"questo push può avvenire?"*; questo plugin risponde alla domanda *"questo agente può accedere a questo ruolo, in base alla configurazione?"*. La configurazione più robusta le adotta **entrambe** — il plugin mantiene gli agenti conformi al flusso di lavoro e la protezione dei branch garantisce che nessuno, agente o essere umano, effettui un push diretto su un branch protetto.

---

## Come funziona — Il meccanismo in tre righe

1. Un agente invoca uno strumento shell (`pwsh` / `bash`) con un comando git.
2. Il plugin classifica il comando, risolve i ruoli dei branch da `gitflow-guard.config.json` e applica la matrice dei controlli.
3. Violazione → la chiamata allo strumento viene **negata prima dell'esecuzione**, indicando la motivazione e il passo successivo. Consentito → il comando procede; ogni blocco viene registrato nel log a livello utente (`~/.local/state/gitflow-guard/repos/<repo>-<hash>/audit.jsonl`).

Nessuna conferma in chat o archivio di permessi: i merge sensibili (produzione / archivio) sono semplicemente **riservati all'utente** — un agente può preparare la PR/MR, ma il clic di merge rimane tuo.

### Principi di progettazione — perché funziona

#### 1. La configurazione è l'unica fonte di verità

Nulla relativo ai nomi dei branch o alle regole è cablato nel codice. `integration` viene fornito con un valore predefinito integrato (`develop`); `preview` / `production` / `archive` sono array opzionali di nomi esatti o regex, ciascuno con i propri parametri `update` e `mergeBy` — uniti in modalità deep-merge sui valori predefiniti. Lo stesso file binario scala da un singolo `develop` a una pipeline aziendale multi-ambiente.

#### 2. Il blocco avviene prima dell'esecuzione, non dopo

Il plugin intercetta la pipeline degli strumenti in corrispondenza di `tools/pre-execute` — il punto decisionale eseguito *prima* che il comando venga inviato. Un `deny` in tale punto significa che il comando **non viene mai eseguito**; l'agente riceve esclusivamente il rifiuto. Il rilevamento a posteriori (scansione dei log dopo l'evento) non può funzionare come controllo — il danno sarebbe già stato causato.

#### 3. I merge sensibili sono non falsificabilmente umani

Nessun codice del plugin decide "questo merge è valido?" per la produzione o l'archivio. Il gate si rifiuta semplicemente di consentire a un *agente* di eseguire tali merge, per cui l'unico percorso è una pagina PR/MR in cui **tu** clicchi su merge — e quel clic costituisce la conferma. Non esiste token, permesso o messaggio di chat che un agente possa falsificare per aggirarti.

---

## Riferimento di configurazione

### Valori predefiniti integrati e override tramite deep-merge

Il guardiano è **attivo per impostazione predefinita** — non è necessario alcun file `gitflow-guard.config.json`. Protegge:

| impostazione predefinita | ruolo | regola |
|---|---|---|
| `develop` | **integration** | nessun push diretto; aggiornamenti tramite PR/MR (`update: "pr"`) |
| `main` | **archive** | nessun push diretto / nessun merge da parte dell'agente; il merge di archiviazione spetta a te (`mergeBy: "user"`) |

Quando crei `gitflow-guard.config.json`, i suoi campi vengono **uniti in modalità deep-merge sui valori predefiniti**: ogni campo/ruolo che specifichi sostituisce il valore predefinito corrispondente, mentre tutto ciò che non specifichi mantiene il valore predefinito. Specifica solo ciò che desideri modificare:

```jsonc
{
  "branches": { "production": ["release-[\\w-]+"] }  // i valori predefiniti mantengono develop+main; production viene aggiunto
}
```

**Disattivazione completa** (flussi trunk / a singolo branch): `{ "enabled": false }`. La correzione di un blocco accidentale richiede la modifica di un solo file e `gitflow-guard status` illustra sempre la configurazione effettiva (incluso quando sono attivi i valori predefiniti integrati).

### Ruoli dei branch — il modello alla base dei controlli

Un **ruolo** mappa i nomi dei branch (o le regex) su un insieme di regole. `integration` è fornito dai valori predefiniti; ogni altro ruolo è opzionale.

```text
branch feature ──(libero)──> integration (branch di integrazione; aggiornato tramite PR/MR)
                                    │
                                    ├──> preview (opzionale; endpoint di ambiente; aggiornato tramite PR/MR)
                                    │
                                    └──> production (opzionale; PR/MR + solo tu clicchi su merge)
archive (opzionale; archivi tu dopo il rilascio)
```

| ruolo | chiave di configurazione | obbligatorio? | comportamento imposto |
|---|---|---|---|
| **feature** | `featurePattern` | — | libero: commit / push / sync / rebase |
| **integration** | `branches.integration` | predefinito (`develop`) | nessun push diretto (predefinito `pr`); le feature si uniscono tramite PR/MR |
| **preview** | `branches.preview` (array) | opzionale | nessun push diretto; aggiornamenti solo tramite PR/MR (endpoint di ambiente) |
| **production** | `branches.production` (array) | opzionale | solo PR/MR; merge eseguito esclusivamente dall'utente (`mergeBy: "user"`) |
| **archive** | `branches.archive` (array) | predefinito (`main`) | le PR/MR verso l'archivio possono essere create dagli agenti; il merge rimane riservato all'intervento manuale dell'utente |

### Personalizzazione dei nomi e delle regole dei branch — qualsiasi convenzione è supportata

**Piccolo team (singolo / 2–3 sviluppatori) — minimale: solo integrazione:**

```jsonc
{
  "enabled": true,
  "featurePattern": "feature/[\\w-]+",
  "branches": { "integration": ["develop"] }
}
```

**Team più grande (molteplici ambienti di preview + produzione + archivio):**

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

### Riferimento completo dei campi

```jsonc
{
  "enabled": true,                     // predefinito true — imposta su false per disattivare il guardiano
  "featurePattern": "feature/[\\w-]+", // regex JS corrispondente ai tuoi branch di lavoro/feature
  "branches": {
    "integration": { "branches": ["develop"], "update": "pr" },  // predefinito: ["develop"] — ometti per mantenere
    "preview":     { "branches": ["ita1"], "update": "pr" },     // opzionale
    "production":  { "branches": ["prd"], "update": "pr", "mergeBy": "user" }, // opzionale
    "archive":     ["main"]                                      // opzionale
  },
  "worktree": {                        // opzionale: guardiano del working tree e della baseline upstream
    "requireCleanOnPr": false,         // richiede modifiche staged/unstaged pulite prima di creare la PR (predefinito false)
    "requireCleanOnMerge": false,      // richiede un working tree pulito prima del merge (predefinito false)
    "allowUntracked": true,            // consente file non tracciati (??); false blocca se presenti (predefinito true)
    "requireUpstreamSynced": false     // richiede sincronizzazione con la baseline upstream prima della PR (predefinito false)
  },
  "locale": "en",                      // opzionale: lingua dei messaggi — qualsiasi locale registrato ('en'/'zh' integrati); valori sconosciuti mostrano un avviso in status e ripiegano sull'inglese
  "strict": false,                     // opzionale: fail-closed — configurazioni non valide / errori interni bloccano invece di avvisare e consentire
  "ci": { "enabled": true }            // opzionale: controlli gh pr registrati come riferimento
}
```

- I ruoli accettano un **array** (sintassi abbreviata) o un **oggetto** `{ branches, update?, mergeBy? }`.
- `update`: `pr` (predefinito) = aggiornamenti solo tramite PR/MR; `flexible` = consente merge diretti/locali (piccoli team).
- `mergeBy` (produzione): `user` (predefinito) = solo tu clicchi su merge; `anyone` = consente il merge della PR.
- **Guardiano del working tree e della baseline upstream (`worktree`)**: controlli opzionali sullo stato e sulla divergenza —— `requireCleanOnPr: true` blocca la creazione della PR in presenza di modifiche non salvate (staged/unstaged); `requireCleanOnMerge: true` blocca i merge locali e delle PR su working tree non puliti; `allowUntracked` (`true` per impostazione predefinita) consente i file non tracciati (`??`) senza frizioni, o può essere impostato su `false` per una rigida collaborazione uomo-agente; `requireUpstreamSynced: true` blocca la creazione della PR quando il branch è indietro rispetto alla baseline upstream. Nei comandi composti a più segmenti (es. `git add . && git commit && gh pr create`), viene simulato dinamicamente uno stato pulito per i segmenti successivi.
- Ciascuna voce di branch è un nome esatto o una regex (rilevata automaticamente). **Sicurezza delle regex**: i pattern dei branch sono definiti dall'utente e compilati così come sono — evita costrutti con backtracking catastrofico (ad es. quantificatori annidati come `(\w+)+`) in `featurePattern` e nelle voci dei branch.
- **Lingua**: i messaggi sono in inglese per impostazione predefinita; aggiungi `"locale": "zh"` per il cinese o passa `--locale <en|zh>` a qualsiasi sottocomando `gitflow-guard` (priorità: flag CLI > configurazione di progetto > inglese). Tutto il testo rivolto all'utente rispetta il locale — inclusi i messaggi del framework CLI come `--help`, le notifiche di comandi sconosciuti e la riga di log vuoto.
- **Locale personalizzati**: i pacchetti a valle possono aggiungere una lingua a runtime — `import { registerLocale } from 'agents-gitflow-guard'`, chiama `registerLocale('fr', frDict)` con un dizionario che copre esattamente le stesse chiavi dell'inglese integrato (convalidato alla registrazione), quindi imposta `"locale": "fr"` nella configurazione del progetto per attivarlo.

  ```js
  import { registerLocale, MESSAGE_KEYS } from 'agents-gitflow-guard'
  // MESSAGE_KEYS elenca tutte le chiavi che un dizionario deve definire (stesso set dell'inglese integrato);
  // la registrazione genera un errore se una chiave è mancante o in eccesso.
  const fr = { /* una voce per ciascun elemento di MESSAGE_KEYS, es. */ 'deny.header': ({ why }) => `[gitflow-guard] bloqué : ${why}` }
  registerLocale('fr', fr)
  ```
- **Locale sconosciuti**: un valore `"locale"` non registrato ripiega sull'inglese durante l'intercettazione (per progettazione — gli hook non si bloccano mai per questioni linguistiche), rendendo facile non notare un refuso; l'avviso di una riga viene mostrato in `gitflow-guard status`.
- **Convalida**: voci di ruolo sovrapposte vengono respinte; le regex non valide vengono respinte. **Qualsiasi errore di configurazione riporta il progetto allo stato "non abilitato"** (segnalato) invece di applicare una configurazione parzialmente presunta; fai attenzione al fatto che sovrascrivere un ruolo con lo stesso nome di branch di un ruolo predefinito (ad es. mappando `main` su integration mentre l'archive predefinito è ancora `main`) genera un errore di sovrapposizione — copri o rimuovi anche l'altro ruolo.
- **Modalità Strict**: per impostazione predefinita, una configurazione errata emette un avviso su stderr una sola volta e lascia passare il comando (fail-open, in modo che un refuso non blocchi i tuoi strumenti). `"strict": true` converte gli errori di configurazione e gli errori interni in **blocco** (fail-closed) — ideale per repository ad alto rischio. Un valore esplicito `enabled: false` rimane silenzioso; un file *mancante* non è più considerato un errore — entrano in vigore le impostazioni predefinite integrate (develop+main).

---

## Matrice dei controlli (Gate Matrix) — Cosa viene bloccato e cosa passa

| azione dell'agente | decisione |
|---|---|
| commit / push su feature / sync / rebase / comandi in sola lettura | ✅ consentito |
| push diretto / force-push / cancellazione di integration / preview / production / archive | 🚫 bloccato (push diretto consentito per integration/preview con `flexible`) |
| PR/MR: feature → integration / preview | ✅ consentito |
| PR/MR: feature → production | ✅ creazione consentita; **merge bloccato** (esegui tu il merge nell'UI) |
| PR/MR verso archive | ✅ creazione consentita; 🚫 merge bloccato (esegui tu il merge nell'UI) |
| `git merge feature/x` locale mentre ci si trova su integration / preview | 🚫 bloccato (PR/MR obbligatoria); consentito con `update: flexible` |
| comandi concatenati (`checkout develop && merge feature/x`) | 🚫 bloccato — i cambi di branch sono simulati per segmento, nessun bypass |
| ricreazione forzata di un branch protetto (`git checkout -B/-C <branch>` / `git switch -C`) | 🚫 bloccato (controllo diretto ref-update) |
| reindirizzamento/cancellazione di un branch protetto tramite `git symbolic-ref` | 🚫 bloccato (controllo diretto ref-update) |
| `git cherry-pick` / `git revert` mentre ci si trova su integration / preview / production / archive | 🚫 bloccato (riscrittura della cronologia su un branch protetto); passano `-n` / `--no-commit` e `--abort`/`--continue`/`--skip`/`--quit` |
| comandi git incapsulati in `sudo` (wrapper di privilegi) | 🚫 wrapper rimosso (`sudo -u …` incluso), comando sottostante controllato |

> Due situazioni deliberate di non-blocco, per evitare che vengano "chiuse" per errore in seguito: `git tag -f` (spostamento di un tag, anche se punta a un branch protetto) rimane esente — i tag sono al di fuori dell'ambito dei ruoli dei branch, analogamente a `push --tags`; e un semplice `git commit` su un branch protetto rimane consentito — il guardiano controlla i ruoli dei branch e i percorsi di merge, non i contenuti, e il successivo `git push` viene comunque bloccato (il remoto rimane pulito).

La destinazione della PR/MR viene risolta tramite `gh pr view` (GitHub) o `glab mr view` (GitLab). In assenza della CLI della piattaforma, il plugin adotta un comportamento prudenziale.

---

## Dove l'essere umano mantiene il controllo
- **Merge in produzione** e **archivio** sono riservati esclusivamente all'utente per impostazione predefinita: un agente può aiutare a preparare la PR/MR, ma **sei tu a cliccare sul pulsante di merge** — quel clic *è* la conferma. Non esiste un archivio di permessi separato a cui delegare tale decisione.
- Ogni blocco viene aggiunto al log di audit a livello utente per la consultazione (`gitflow-guard audit`).

---

## Installazione dettagliata

**Prerequisito**: **Node.js ≥ 22** nel tuo `PATH` (requisito minimo del pacchetto `engines` e livello base della matrice di CI). Ciascun client utilizza lo **stesso pacchetto npm** `agents-gitflow-guard` — differiscono solo le fasi di montaggio e collegamento.

| Tipo di Client / Piattaforma | Comando di Installazione | Passo di Montaggio e Collegamento |
|---|---|---|
| Claude Code · Codex · OpenCode · Antigravity | `npm i -g agents-gitflow-guard` | `gitflow-guard wire --client <nome> --project --yes` |
| DeepSeek Harness (DSH) | `dsh plugin --profile web add agents-gitflow-guard` | Riavviare DSH — il plugin si monta automaticamente come layer del profilo |
| Pi | `npm i -D agents-gitflow-guard` | Copiare `pi/gitflow-guard.ts` in `.pi/extensions/` |

### 1. Client Hook CLI autonomi (Claude Code · Codex · OpenCode · Antigravity)

Installa la CLI globalmente una sola volta, quindi **collega ciascun client con un singolo comando** (il guardiano è attivo per impostazione predefinita tramite la sua configurazione integrata, quindi il collegamento è tutto ciò che resta da fare):

```bash
npm i -g agents-gitflow-guard   # fornisce l'eseguibile `gitflow-guard`
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

`wire` legge il file di configurazione esistente (se presente), inserisce la voce dell'hook senza toccare nient'altro, è idempotente (già collegato → saltato), supporta `--dry-run` per visualizzare l'anteprima e `--unwire` per rimuovere, e richiede conferma prima di modificare i file `--global`. I file esatti scritti (a scopo di riferimento e per la scrittura manuale alternativa a `wire`) sono:

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
// OpenCode — `.opencode/plugins/gitflow-guard.ts`
```

```json
// Antigravity (Google) — .agents/hooks.json
{
  "gitflow-guard": {
    "PreToolUse": [
      { "matcher": "run_command", "hooks": [ { "type": "command", "command": "gitflow-guard check --platform antigravity" } ] }
    ]
  }
}
```

### 2. Plugin ed estensioni in-process (DSH · Pi)

- **DeepSeek Harness (DSH)**:
  ```bash
  dsh plugin --profile web add agents-gitflow-guard
  ```
  Quindi riavvia DSH. Il pacchetto dichiara `dsh.bundle.patch`, pertanto `dsh plugin add` lo monta automaticamente come layer del profilo senza modifiche manuali. Gli aggiornamenti seguono lo stesso comando e riavvio.

- **Pi**:
  Pi carica le estensioni in-process (nessun payload stdin, nessun hook di sottoprocesso). Installa il punto di ingresso fornito nel progetto e mantieni il pacchetto in devDependencies:
  ```bash
  npm i -D agents-gitflow-guard
  mkdir -p .pi/extensions
  cp node_modules/agents-gitflow-guard/pi/gitflow-guard.ts .pi/extensions/gitflow-guard.ts
  ```
  Configura `.pi/settings.json`:
  ```jsonc
  // Pi — .pi/settings.json (le estensioni si risolvono relativamente a .pi)
  { "extensions": ["extensions/gitflow-guard.ts"] }
  ```

### 3. Da sorgente e sviluppo locale

Per collaboratori o sviluppatori che desiderano eseguire il debug rispetto all'ultimo checkout dei sorgenti:

```bash
# Clona e compila
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build
```

Monta la build locale nella piattaforma target del tuo agente:

```bash
# A. Client Hook CLI autonomi (Claude Code · Codex · OpenCode · Antigravity)
npm link # o npm install -g .
gitflow-guard wire --client <claude|codex|opencode|antigravity> --project --yes

# B. DeepSeek Harness (DSH)
dsh plugin --profile web add file:/path/to/AgentsGitFlowController
# oppure esegui: node scripts/install-dsh.mjs web (riavviare DSH dopo l'installazione)

# C. Pi
npm link
# oppure copia direttamente il file pi/gitflow-guard.ts del repository in .pi/extensions/
```

### 4. Nota su GitHub Copilot

**GitHub Copilot — deliberatamente nessun hook in questo progetto.** Copilot include le proprie protezioni native esattamente per questo scopo: autorizzazioni per strumento **allow/deny/ask** e **regole** di progetto (`rules.json` + `AGENTS.md`). Indirizza gli utenti di Copilot alla documentazione ufficiale invece di usare un hook del plugin:

- [Consentire e negare l'uso degli strumenti (Documentazione GitHub)](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools)
- [Aggiungere regole personalizzate per l'agente di codifica Copilot (Documentazione GitHub)](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-rules-for-the-copilot-coding-agent)
- Opzionale: Copilot dispone anche di un [sistema di hook](https://docs.github.com/en/copilot/reference/hooks-reference) (`preToolUse` → `permissionDecision:"deny"`) se desideri l'intercettazione a livello di comando.

### 5. Meccanismo degli hook e note tecniche

- **Protocollo della piattaforma**: L'hook legge il payload su stdin e risponde secondo il protocollo della piattaforma specifica:
  - **Claude Code / OpenCode**: `exit 2` (stderr contiene la motivazione e i passi operativi successivi).
  - **Codex**: stdout JSON `{"hookSpecificOutput":{"permissionDecision":"deny",...}}`.
  - **Antigravity**: stdout JSON `{"decision":"deny","reason":...}` con `exit 0` (Antigravity richiede exit 0).
  - **Pi**: Estensione in-process in ascolto sull'evento `tool_call` con rifiuto tramite `{ block: true, reason }`.
- **Esecuzione pre-tool**: Viene intercettato solo l'evento pre-tool; il guardiano blocca *prima* dell'esecuzione dei comandi, pertanto non sono necessari hook post-tool o fasi di pulizia dei permessi.
- **Risoluzione di PATH per gli eseguibili**: L'installazione globale (`npm i -g`) fornisce l'eseguibile `gitflow-guard`. Se l'ambiente di esecuzione dell'agente non eredita il `PATH` interattivo, utilizza il percorso completo ottenuto con `npm bin -g`.
- **Abilitato per impostazione predefinita**: I valori predefiniti integrati (`integration: ["develop"]`, `archive: ["main"]`) hanno effetto senza alcun file di configurazione. Le configurazioni personalizzate in `gitflow-guard.config.json` vengono applicate tramite deep-merge sui valori predefiniti.
- **Collegamento non distruttivo**: `gitflow-guard wire` unisce le configurazioni degli hook in modo idempotente senza modificare gli hook esistenti, e `wire --unwire` rimuove unicamente la voce del guardiano.

---

## FAQ

### I miei branch non seguono i nomi predefiniti — posso utilizzarlo?

Sì — nulla nei nomi dei branch è fisso. `integration` viene fornito con un valore predefinito integrato (`develop`) e qualsiasi configurazione personalizzata viene applicata in deep-merge sopra di esso; le sue voci (e quelle di `preview` / `production` / `archive`) possono essere qualsiasi nome esatto di branch o pattern regex di tuo gradimento. `featurePattern` indica al plugin come riconoscere i tuoi branch di lavoro.

Un team che chiama il proprio branch di integrazione `master`, aggiunge una preview `beta` e usa il prefisso `fix/` per i branch di feature scriverà esattamente questo nella configurazione; ogni blocco, report e audit utilizzerà quindi tali nomi. Non c'è alcuna convenzione che tu debba adottare obbligatoriamente — solo una mappatura che dichiari. Vedere [Personalizzazione dei nomi e delle regole dei branch — qualsiasi convenzione è supportata](#personalizzazione-dei-nomi-e-delle-regole-dei-branch--qualsiasi-convenzione-è-supportata).

---

### Ho davvero bisogno di preview/production/archive?

No. Aggiungi solo i ruoli che il tuo flusso possiede effettivamente. Un repository personale con solo `develop` configura `integration: ["develop"]` e nient'altro; un'azienda con dieci ambienti aggiunge l'array `preview` e un ruolo `production`. Il resto rimane disattivato.

---

### Si tratta di uno strumento di sicurezza?

No, ed è importante non trattarlo come tale. È un guardiano del flusso di lavoro: rende un processo concordato meccanicamente vincolante. Il riconoscimento dei comandi basato sul testo è intrinsecamente best-effort — un agente determinato a offuscare un comando può eludere il parser.

Nell'ambito delle forme di comando supportate, il perimetro del ruolo viene applicato localmente: l'unione in un branch con ruolo protetto (integration / preview / production / archive) richiede il percorso configurato (PR/MR, oppure un merge manuale umano per production/archive). I comuni wrapper di offuscamento vengono classificati e bloccati — wrapper di shell (`sh -c` / `bash -lc`), subshell e annidamenti con backtick/`$()`, prefissi `env`/`command`/`nohup`/`xargs`/`sudo` e assegnazioni `VAR=x`, percorsi assoluti, pipeline e code `||`, opzioni globali git (`-C .`, `--git-dir=…`), refspec con caratteri jolly (`refs/heads/*:refs/heads/*`), `git pull` utilizzato come fetch+merge, e le istruzioni di basso livello (plumbing) come `send-pack`/`update-ref`/`symbolic-ref`; la ricreazione forzata di un branch protetto (`checkout -B`/`switch -C`) e cherry-pick/revert su un branch protetto vengono bloccati dai gate di aggiornamento e spostamento dei ref. Il corpus avversariale eseguibile si trova in `tests/accuracy-audit.spec.ts`.

Ciò che rimane **non difendibile localmente**: chiamate dirette alle API del forge (`gh api repos/…/pulls/N/merge`, `curl`) e comandi all'interno di sottoprocessi dell'interprete (`node -e "child_process.exec('git push …')"`); sequenze arbitrarie e profonde di virgolette o codifiche rimangono per loro natura gestite in modalità best-effort. Il vero perimetro non aggirabile risiede nelle regole di protezione dei branch del servizio di hosting. Usali entrambi — considera questo guardiano come feedback istantaneo e traccia di audit, non come perimetro di sicurezza.

---

### Perché l'agente non può semplicemente eseguire il merge in produzione/archivio da solo?

Perché il gate classifica tali azioni come **riservate all'utente**. Il plugin nega il *merge* per la produzione e per l'archivio — la creazione di una PR/MR rimane consentita, quindi un agente può comunque predisporre per te una PR di archiviazione da `develop` verso `main`. Il merge effettivo, tuttavia, ha esattamente un unico percorso: **tu** che clicchi su di esso — non esiste permesso, token o messaggio di chat che un agente possa utilizzare per attribuirsi tale facoltà.

---

### Ho bisogno della CLI `gh` o `glab`?

No. Sono adattatori opzionali utilizzati unicamente per determinare a quale branch si rivolge un `pr merge` / `mr merge`, consentendo al gate di distinguere tra "merge in integration/preview" (consentito) e "merge in production/archive" (bloccato). Quando nessuna delle due CLI è in grado di confermare la destinazione — assente, non autenticata, offline o se la query fallisce — il gate **rifiuta il merge**, anche se eseguito da un branch feature: quella PR potrebbe in realtà puntare a production/archive. Riprova quando la CLI funziona, oppure lascia che sia l'utente a cliccare su merge. Tutto il resto funziona allo stesso modo. Il controllo principale non contatta mai un servizio di hosting, motivo per cui funziona in modo identico su GitHub, GitLab, istanze self-hosted o in modalità offline.

---

### Bloccherà il mio normale lavoro?

Deliberatamente, no. Tutto ciò a cui serve un branch feature — commit, push, sincronizzazione da `integration`, rebase, ispezione con comandi di sola lettura, esecuzione di `gitflow-guard status` — è consentito senza alcun ostacolo.

I blocchi sono riservati a: (1) scritture dirette sui branch con ruoli protetti e (2) un agente che tenta di eseguire un merge in produzione o archivio. Se riscontri un blocco che ritieni errato, esegui `gitflow-guard status` — mostra esattamente quale ruolo è stato assegnato a ciascun branch locale, rendendo qualsiasi valutazione errata visibile e correggibile.

---

### Cosa succede se la mia configurazione contiene un errore?

Una configurazione definita a metà non viene mai applicata accidentalmente: qualsiasi errore di convalida disattiva il guardiano per quel progetto e segnala gli errori.

Errori frequenti: sovrascrivere un ruolo con lo stesso nome di branch di un ruolo predefinito (ad es. `main` come integration mentre l'archive predefinito è ancora `main` — un esplicito errore di sovrapposizione; sovrascrivi o rimuovi anche l'altro ruolo), associare uno stesso branch a due ruoli (respinto) e un `featurePattern` che non compila (respinto come regex non valida). L'errore viene segnalato in modo evidente e il file è un singolo oggetto JSON, pertanto la correzione richiede solitamente una trentina di secondi.

---

### Cosa viene verificato esattamente rispetto al repository locale?

Il branch corrente (`git branch --show-current`) e — solo per `pr merge` / `mr merge` — la destinazione della PR/MR tramite `gh pr view` / `glab mr view`. Non è necessaria alcuna verifica sulla genealogia dei commit, poiché il modello è **guidato dai ruoli** (quale branch *è* la destinazione) anziché basato sull'ordine cronologico.

Non viene scritto nulla, nessun server remoto viene contattato e non è richiesta alcuna funzionalità del servizio di hosting per i controlli principali. I merge verso produzione/archivio vengono semplicemente rifiutati per gli agenti; il merge umano avviene nella tua interfaccia grafica.

---

### Licenza / costi?

MIT, gratuito, senza vincoli. Usalo, modificalo, distribuiscilo — l'unico obbligo è mantenere l'avviso di copyright.

Se evita al tuo team una scorciatoia rischiosa, il pulsante per il caffè in cima a questa pagina è gradito ma mai obbligatorio. Vedere [Licenza](#licenza).

---

## Glossario

| termine | significato |
|---|---|
| **integration** | il ruolo principale (predefinito integrato: `develop`); le feature vengono integrate tramite PR/MR; protetto |
| **preview** | branch opzionali per endpoint di ambiente (`branches.preview`, array); aggiornamenti solo tramite PR/MR |
| **production** | branch opzionali di produzione (`branches.production`, array); PR/MR + merge eseguito solo dall'utente |
| **archive** | branch opzionale di archiviazione post-rilascio (`branches.archive`, array); gli agenti possono creare PR/MR verso di esso, ma il merge rimane manuale per l'utente |
| **feature branch** | il tuo branch di lavoro, identificato da `featurePattern`; zona libera |
| **gate matrix** | la tabella decisionale che mappa ciascun comando classificato in consentito/negato |
| **pre-execute** | l'hook della pipeline degli strumenti in cui avviene il blocco — prima dell'esecuzione del comando |
| **merge-by-user** | i merge verso produzione/archivio rimangono nelle tue mani — il tuo clic sulla PR/MR costituisce la conferma |

---

## Roadmap

Funzionalità future e aree in corso di esplorazione attiva:

- **Integrazioni con nuovi agenti**: Ricerca e adattamento a hook/estensioni di agenti emergenti (ad es. Cursor, Windsurf, nuove CLI per agenti).
- **Aggregazione degli audit**: Sincronizzazione dei log di audit tra macchine diverse e formati di esportazione per la conformità a livello di team.
- **Preset di workflow**: Preset di configurazione pronti all'uso per i flussi di branching Git più comuni (sviluppo basato su trunk, configurazioni enterprise multi-ambiente).
- **Gate vincolanti in CI**: Hook nativi per pipeline CI e integrazione con i controlli delle PR, preservando l'esecuzione locale a zero dipendenze.

Per le funzionalità rilasciate e la cronologia delle versioni, consulta [CHANGELOG.md](CHANGELOG.md).

---

## Sviluppo

```bash
npm install
npm test              # unit test: classify / gate / config / cli / repo / platform / i18n / index / accuracy-audit / pi
npm run typecheck     # tsc --noEmit, 0 errori
npm run build         # tsdown → lib/ (CLI e plugin condividono la build)
npm run check:pins    # verifica che la versione in package.json corrisponda all'intestazione di CHANGELOG e ai riferimenti di versione nei README
npm run verify:matrix # regressione continua cross-agent: logica DSH + locale zh + hook multi-client + estensione Pi
```

- **Regola di qualità**: Ogni modifica alla logica richiede un typecheck con 0 errori, tutti i test superati e il passaggio positivo di `verify:matrix`.
- **Aggiunta di client**: Quando aggiungi il supporto per una nuova piattaforma di agenti, segui la checklist di sincronizzazione in [AGENTS.md](AGENTS.md) §8.

---

## Supporto

Il plugin è gratuito e open source (MIT). Se ha evitato a te e al tuo team una scorciatoia rischiosa, un caffè è gradito:

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/keanz21)

---

## Licenza

[MIT](LICENSE) © FeatureAgents
