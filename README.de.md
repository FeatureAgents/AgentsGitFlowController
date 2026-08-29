# agents-gitflow-guard

> **Sind Sie es leid, dass KI-Agenten Ihren GitFlow umgehen?**

Ein konfigurierbarer Branch-Rollen-Guard für KI-Coding-Agenten — [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), [Codex](https://github.com/openai/codex), [OpenCode](https://github.com/opencode-ai/opencode), [Antigravity](https://github.com/google-deepmind), [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) und [Pi](https://github.com/mariozechner/pi).  
Sie definieren Ihre eigenen Branches — **integration** (Features werden über PR/MR zusammengeführt), **preview** (Umgebungs-Endpunkte), **production** (Produktion), **archive** (Archiv) — jeweils mit eigenen Aktualisierungsregeln. Agenten können den Flow nicht überspringen, und sensible Merges bleiben in Ihrer Hand.

[English](README.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-tw.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Русский](README.ru.md) · [Lizenz](LICENSE)

[![Support on Ko-fi](https://img.shields.io/badge/Support_on_Ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## Inhaltsverzeichnis

- [Schnellstart — In 30 Sekunden zu einem geschützten Repository](#schnellstart--in-30-sekunden-zu-einem-geschützten-repository)
- [Warum — Das Problem, das dieses Plugin löst](#warum--das-problem-das-dieses-plugin-löst)
- [Zielgruppe — Szenarien & Teams](#zielgruppe--szenarien--teams)
- [Funktionen — Was es tut](#funktionen--was-es-tut)
- [Einschränkungen — Was es NICHT tut](#einschränkungen--was-es-nicht-tut)
- [Server-seitiger Schutz vs. dieses Plugin](#server-seitiger-schutz-vs-dieses-plugin)
- [Funktionsweise — Der Mechanismus in drei Zeilen](#funktionsweise--der-mechanismus-in-drei-zeilen)
- [Konfigurationsreferenz](#konfigurationsreferenz)
- [Gate-Matrix — Was blockiert wird, was durchgelassen wird](#gate-matrix--was-blockiert-wird-was-durchgelassen-wird)
- [Menschliche Kontrolle — Wo der Entwickler die Kontrolle behält](#menschliche-kontrolle--wo-der-entwickler-die-kontrolle-behält)
- [Installation im Detail](#installation-im-detail)
- [FAQ](#faq)
- [Glossar](#glossar)
- [Roadmap](#roadmap)
- [Unterstützung](#unterstützung)
- [Entwicklung](#entwicklung)
- [Lizenz](#lizenz)

---

## Schnellstart — In 30 Sekunden zu einem geschützten Repository

**Schritt 1 — Installieren.** Alle sechs Clients verwenden dasselbe npm-Paket `agents-gitflow-guard` — wählen Sie den passenden Modus für Ihren Agenten:

```bash
# Modus A: CLI-Hook-Clients (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# Modus B: DSH In-Process-Plugin (DSH danach neu starten)
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# Modus C: Pi In-Process-Erweiterung
npm i -D agents-gitflow-guard
```

> **Hinweis**: Ein einfaches `add` oder `npm i` installiert die neueste Version aus der npm-Registry. Falls Ihr Registry-Spiegel Cache-Verzögerungen aufweist oder Sie eine feste Version benötigen, hängen Sie `@<version>` an (z. B. `npm i -g agents-gitflow-guard@<version>`). (DSH-Benutzer: Die pnpm Peer-Dependency-*Warnung* ist normal — DSH stellt `@deepseek-ai/cordis` / `@deepseek-ai/dsh-tools` beim Start bereit; das Plugin funktioniert regulär.)
>
> Die Hook-basierten Clients (Claude Code · Codex · OpenCode · Antigravity) erfordern nach der Installation einen einzigen Verdrahtungs-Befehl (**ein Befehl pro Client**, siehe unten). Pi benötigt das Kopieren einer Datei. DSH wird bei der Installation automatisch eingebunden.

**Schritt 2 — Client verdrahten (keine Konfigurationsdatei erforderlich).** Der Guard bringt **integrierte Standardeinstellungen mit, die `develop` (Integration) + `main` (Archiv) schützen** — null Konfigurationsaufwand, standardmäßig aktiv. Sie müssen Ihrem KI-Client lediglich mitteilen, den Guard aufzurufen:

```bash
# Claude Code → .claude/settings.json dieses Repositories
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity (jeweils eigene Konfigurationsdatei; --yes überspringt die Bestätigung)
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# Vorschau (ohne Schreiben) / Entfernen / Interaktiver Assistent:
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` fügt den Hook **zerstörungsfrei** in Ihre bestehende Konfiguration ein (vorhandene Hooks bleiben unberührt) und schreibt standardmäßig in das **Projektverzeichnis**. `--global` (für alle Repositories auf diesem Rechner) erfordert immer eine Bestätigung oder `--yes`. Die genauen Pfade und Formate finden Sie unter [Installation im Detail](#installation-im-detail).

> ⚠️ **main ist standardmäßig geschützt.** Entwickler, die Trunk-basiert arbeiten (direkter Push auf einen einzigen Branch), werden bei direkten Pushes auf `main` blockiert, bis sie den Guard deaktivieren — erstellen Sie dazu eine `gitflow-guard.config.json` mit `{ "enabled": false }` oder definieren Sie eigene Branch-Zuordnungen (siehe [Konfigurationsreferenz](#konfigurationsreferenz)). `gitflow-guard status` weist darauf hin, wenn die Standardeinstellungen aktiv sind.

**Schritt 3 — Überprüfen.** Weisen Sie den Agenten an, `git push origin develop` auszuführen. Der Aufruf wird blockiert:

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

Nachrichten werden standardmäßig auf Englisch ausgegeben; über `"locale": "zh"` kann auf Chinesisch gewechselt werden (siehe [Konfigurationsreferenz](#konfigurationsreferenz)).

**Fertig.** Der Guard ist mit den Standardeinstellungen aktiv. Für weitere Stages (`preview` / `production`) oder andere Branch-Namen erstellen Sie einfach eine `gitflow-guard.config.json` mit den gewünschten Feldern. Die vollständige Entscheidungstabelle finden Sie in der [Gate-Matrix](#gate-matrix--was-blockiert-wird-was-durchgelassen-wird).

---

## Warum — Das Problem, das dieses Plugin löst

KI-Coding-Agenten arbeiten direkt in Ihrem Repository. Ihnen wird über System-Prompts und Projektdateien (`AGENTS.md`, `CLAUDE.md` etc.) mitgeteilt, wie der Branching-Flow aussieht.

**Dies sind jedoch weiche Regeln.** Agenten überspringen oder „vergessen“ diese Regeln gelegentlich — nicht aus böser Absicht, sondern weil Textanweisungen für ein Sprachmodell unverbindlich sind.

Dieses Plugin verwandelt weiche Anweisungen in **harte Mechanismen**. Jede Git-Operation wird vor der Ausführung gegen den tatsächlichen lokalen Repository-Zustand geprüft. Verstöße werden blockiert, bevor der Befehl ausgeführt wird.

Niemand muss sich Regeln merken — die Regeln werden technisch durchgesetzt.

---

## Zielgruppe — Szenarien & Teams

- Sie haben einen definierten Branch-Flow (von einem einfachen `develop`-Zweig bis zu mehrstufigen Preview/Production-Pipelines).
- Ein Agent hat bereits einmal direkt auf einen geschützten Branch gepusht oder unerlaubt gemergt.
- Sie möchten Branch-Schutz nicht rein menschlicher Aufmerksamkeit überlassen.
- Mehrere Features werden parallel entwickelt und in geteilten Umgebungen zusammengeführt.

---

## Funktionen — Was es tut

- **Blockiert vor der Ausführung**: Direkte Pushes, Force-Pushes und Löschungen geschützter Branches (integration / preview / production / archive) sowie Agenten-Merges in production/archive.
- **Rollenbasiert & flexibel konfigurierbar**: `integration` (Standard: `develop`) als Kernrolle; `preview`, `production`, `archive` optional konfigurierbar.
- **Menschliche Freigabe (Merge-by-user)**: Merges in Produktions- und Archiv-Branches sind Agenten verwehrt — nur der Klick des Entwicklers im PR führt den Merge durch.
- **Vollständiges Audit-Log**: Jeder abgewiesene Befehl wird in `~/.local/state/gitflow-guard/` protokolliert — außerhalb des Repositories und manipulationssicher.
- **Plattformunabhängig**: Arbeitet rein mit lokalem Git; unterstützt optional `gh` (GitHub) oder `glab` (GitLab).

---

## Einschränkungen — Was es NICHT tut

- **Keine absolute Sicherheitsgrenze**: Die Befehlsanalyse basiert auf Heuristiken. Absichtlich stark verschleierte Befehle können die Textanalyse umgehen.
- **Kein Ersatz für Server-Branch-Protection**: Echter Schutz im Team gehört zusätzlich in die GitHub/GitLab-Einstellungen.
- **Kein Ersatz für den Workflow selbst**: Das Repository muss mindestens einen `integration`-Branch aufweisen.

---

## Konfigurationsreferenz

### Standardeinstellungen & Deep-Merge

Der Guard ist **ohne Konfigurationsdatei standardmäßig aktiv**:

| Standard | Rolle | Regel |
|---|---|---|
| `develop` | **integration** | Kein direkter Push; Aktualisierung über PR/MR (`update: "pr"`) |
| `main` | **archive** | Kein direkter Push / kein Agenten-Merge (`mergeBy: "user"`) |

Benutzerdefinierte Felder in `gitflow-guard.config.json` überschreiben die Standardwerte per **Deep-Merge**:

```jsonc
{
  "enabled": true,
  "featurePattern": "feature/[\\w-]+",
  "branches": {
    "integration": ["develop"],
    "preview": ["staging", "preview-[\\w-]+"],
    "production": { "branches": ["prod"], "update": "pr", "mergeBy": "user" },
    "archive": ["main"]
  }
}
```

---

## Gate-Matrix — Was blockiert wird, was durchgelassen wird

| Agenten-Aktion | Entscheidung |
|---|---|
| commit / push auf Feature-Branch / sync / rebase | ✅ allow (erlaubt) |
| Direkter push / force-push / Löschen von integration / preview / production / archive | 🚫 block (blockiert) |
| PR/MR: Feature → integration / preview | ✅ allow (erlaubt) |
| PR/MR: Feature → production | ✅ Erstellung erlaubt; **Merge blockiert** (Entwickler führt Merge aus) |
| PR/MR → archive | ✅ Erstellung erlaubt; 🚫 **Merge blockiert** (Entwickler führt Merge aus) |
| Lokales `git merge feature/x` auf integration / preview | 🚫 block (PR/MR erforderlich; `update: flexible` erlaubt es) |
| Verkettete Befehle (`checkout develop && merge feature/x`) | 🚫 block (Branch-Wechsel wird pro Segment simuliert) |
| Erzwingen des Zurücksetzens geschützter Branches (`git checkout -B/-C`) | 🚫 block (ref-update Gate) |
| `git symbolic-ref` Änderungen auf geschützten Branches | 🚫 block (ref-update Gate) |
| `git cherry-pick` / `git revert` auf geschützten Branches | 🚫 block (Verlaufsänderung auf geschütztem Branch verhindert) |
| Mit `sudo` gewrappte Git-Befehle | 🚫 Wrapper wird entfernt (`sudo -u …` inkl.) und Git-Befehl geprüft |

---

## Installation im Detail

**Voraussetzung**: **Node.js ≥ 22** auf Ihrem `PATH`. Alle Clients nutzen **dasselbe npm-Paket** `agents-gitflow-guard`.

### 1. Eigenständige CLI-Hook-Clients (Claude Code · Codex · OpenCode · Antigravity)

```bash
npm i -g agents-gitflow-guard
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

### 2. In-Process-Plugins und Erweiterungen (DSH · Pi)

- **DeepSeek Harness (DSH)**: `dsh plugin --profile web add agents-gitflow-guard` (nach Installation DSH neu starten)
- **Pi**: `npm i -D agents-gitflow-guard` und `node_modules/agents-gitflow-guard/pi/gitflow-guard.ts` nach `.pi/extensions/` kopieren

### 3. Installation aus dem Quellcode (From Source)

```bash
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build

# Je nach Client einbinden:
npm link # CLI-Hook-Clients oder Pi
dsh plugin --profile web add file:/path/to/AgentsGitFlowController # DSH
```

---

## FAQ

### Kann ich abweichende Branch-Namen verwenden?
Ja. Branch-Namen sind vollständig frei wählbar und werden über `gitflow-guard.config.json` definiert.

### Blockiert das Plugin meine normale Entwicklungsarbeit?
Nein. Sämtliche reguläre Feature-Branch-Arbeiten (Commits, Pushes, Rebase, Tests) laufen ohne jede Einschränkung.

---

## Lizenz

[MIT](LICENSE) © FeatureAgents
