# agents-gitflow-guard

> **Sind Sie es leid, dass KI-Agenten Ihren GitFlow umgehen?**

Ein konfigurierbarer Branch-Rollen-Guard für KI-Coding-Agenten — [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), [Codex](https://github.com/openai/codex), [OpenCode](https://github.com/opencode-ai/opencode), [Antigravity](https://github.com/google-deepmind), [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) und [Pi](https://github.com/mariozechner/pi).
Sie definieren Ihre eigenen Branches —
**integration** (Features werden über PR/MR zusammengeführt), **preview** (Umgebungs-Endpunkte), **production**, **archive** — jeweils mit eigenen Aktualisierungsregeln. Agenten können den Flow nicht überspringen, und sensible Merges bleiben in Ihrer Hand.

[English](README.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-tw.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Русский](README.ru.md) · [Lizenz](LICENSE)

[![Support on Ko-fi](https://img.shields.io/badge/Support_on_Ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## Inhaltsverzeichnis

- [Schnellstart — In 30 Sekunden zu einem geschützten Repository](#schnellstart--in-30-sekunden-zu-einem-geschützten-repository)
- [Warum — Das Problem, das dieses Plugin löst](#warum--das-problem-das-dieses-plugin-löst)
- [Für wen dies gedacht ist — Szenarien & Teams](#für-wen-dies-gedacht-ist--szenarien--teams)
- [Was es tut — Funktionen](#was-es-tut--funktionen)
- [Was es NICHT tut — Ehrliche Grenzen](#was-es-nicht-tut--ehrliche-grenzen)
- [Serverseitiger Schutz vs. dieses Plugin](#serverseitiger-schutz-vs-dieses-plugin)
- [Wie es funktioniert — Der Mechanismus in drei Zeilen](#wie-es-funktioniert--der-mechanismus-in-drei-zeilen)
- [Konfigurationsreferenz](#konfigurationsreferenz)
- [Gate-Matrix — Was blockiert wird, was passiert](#gate-matrix--was-blockiert-wird-was-passiert)
- [Wo der Mensch die Kontrolle behält](#wo-der-mensch-die-kontrolle-behält)
- [Installation im Detail](#installation-im-detail)
- [FAQ](#faq)
- [Glossar](#glossar)
- [Roadmap](#roadmap)
- [Entwicklung](#entwicklung)
- [Support](#support)
- [Lizenz](#lizenz)

---

## Schnellstart — In 30 Sekunden zu einem geschützten Repository

**Schritt 1 — Installieren.** Alle sechs Clients verwenden dasselbe npm-Paket `agents-gitflow-guard` — wählen Sie den passenden Installationsmodus für Ihren Agenten:

```bash
# Modus A: CLI-Hook-Clients (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# Modus B: DSH In-Process-Plugin (DSH danach neu starten; Plugins laden beim Start)
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# Modus C: Pi In-Process-Erweiterung
npm i -D agents-gitflow-guard
```

> **Hinweis**: Ein einfaches `add` oder `npm i` installiert die neueste Version aus der npm-Registry. Falls Ihr Registry-Mirror Cache-Verzögerungen aufweist oder Sie eine feste Version benötigen, hängen Sie `@<version>` an (z. B. `npm i -g agents-gitflow-guard@<version>`). (Bei Verwendung von DSH ist die pnpm Peer-Dependency-*Warnung* normal — DSH stellt `@deepseek-ai/cordis` / `@deepseek-ai/dsh-tools` zur Laufzeit über sein geteiltes Profil-Modul-Fallback bereit; das Plugin funktioniert regulär.)
>
> CLI-Hook-Clients führen nach der Installation einen einzigen Verdrahtungsbefehl aus (siehe Schritt 2); Pi kopiert eine Erweiterungsdatei; DSH bindet sich bei der Plugin-Installation automatisch ein.

**Schritt 2 — Client verdrahten (keine Konfigurationsdatei erforderlich).** Der Guard bringt **integrierte Standardeinstellungen mit, die `develop` (Integration) + `main` (Archiv) schützen** — null Konfigurationsaufwand, standardmäßig aktiv. Sie müssen Ihrem KI-Client lediglich mitteilen, den Guard aufzurufen (ein Befehl pro Stdin-Hook-Client; DSH wird automatisch verdrahtet; Pi kopiert nur eine Datei, siehe unten):

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
# Vorschau (ohne Schreiben) / Entfernen / Interaktiver Einrichtungsassistent:
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` fügt sich **zerstörungsfrei** in Ihre bestehende Konfiguration ein (bereits vorhandene Hooks bleiben unberührt) und schreibt standardmäßig in Ihr **Projektverzeichnis** — `--global` (für alle Repositories auf diesem Rechner) fragt immer vorher nach oder erfordert `--yes`. Die dateispezifischen Pfade und Formate der einzelnen Clients sind unter [Installation im Detail](#installation-im-detail) aufgeführt.

> ⚠️ **main ist standardmäßig geschützt.** Nutzer von Trunk-Based-/Ein-Branch-Workflows (bei denen jeder direkt auf einen einzigen Branch pusht) werden bei direkten Pushes auf `main` blockiert, bis sie dies deaktivieren — erstellen Sie dazu eine `gitflow-guard.config.json` mit `{ "enabled": false }` oder bilden Sie Ihre eigenen Branches ab (siehe [Konfigurationsreferenz](#konfigurationsreferenz)). `gitflow-guard status` wiederholt diesen Hinweis, wann immer die integrierten Standardeinstellungen aktiv sind.

**Schritt 3 — Überprüfen.** Weisen Sie den Agenten an, `git push origin develop` auszuführen. Der Tool-Aufruf wird erwartungsgemäß verweigert:

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

Nachrichten sind standardmäßig auf Englisch; erstellen Sie eine Konfiguration mit `"locale": "zh"`, um auf Chinesisch umzuschalten — Nachrichten lauten dann etwa wie folgt: *已拦截:受保护分支「develop」禁止直推 / 下一步:集成分支(develop)由 PR/MR 合入 feature……* (siehe [Konfigurationsreferenz](#konfigurationsreferenz)).

**Fertig.** Der Guard ist für dieses Repository mit den integrierten Standardeinstellungen aktiv. Möchten Sie weitere Stufen (`preview` / `production`) oder andere Branch-Namen? Erstellen Sie eine `gitflow-guard.config.json` und definieren Sie nur die Felder, die Sie anpassen möchten — alles andere behält die integrierten Standardwerte bei. Die vollständige Entscheidungstabelle finden Sie in der [Gate-Matrix](#gate-matrix--was-blockiert-wird-was-passiert).

### Vollständiger Durchlauf — Ein Feature von Anfang bis Ende

Szenario: Ihr Team liefert eine Login-Seite aus (`feature/login-page`); `develop` ist der Integrations-Branch, `main` das Archiv. Was Sie und der Agent bei jedem Schritt erleben:

| # | Was der Agent ausführt | Plugin-Entscheidung | Was Sie sehen |
|---|---|---|---|
| 1 | `git checkout -b feature/login-page` (von develop) | ✅ allow (Feature-Entwicklung ist frei) | Branch erstellt |
| 2 | `git add . && git commit -m "feat: login"` | ✅ allow | Committet |
| 3 | `git push -u origin feature/login-page` | ✅ allow (Pushen des Features ist erlaubt) | Gepusht |
| 4 | `git checkout develop && git merge feature/login-page` | 🚫 **deny** — Integrations-Branch ist nur per PR/MR aktualisierbar | PR/MR in develop muss eröffnet werden |
| 5 | `gh pr create --base develop` | ✅ allow (Feature → Integration via PR) | PR erstellt, Sie prüfen & mergen |
| 6 | `git push origin main` oder in main mergen | 🚫 **deny** — Archiv ist ausschließlich manuell durch den Benutzer | Sie archivieren develop → main nach dem Release selbst |

Beachten Sie, was der Agent *nicht* tun kann: ein Feature direkt in `develop` mergen oder `main` überhaupt anrühren. Jeder sensible Merge ist eine bewusste menschliche Handlung auf der PR/MR-Webseite oder in Ihrem eigenen Terminal.

---

## Warum — Das Problem, das dieses Plugin löst

KI-Coding-Agenten arbeiten in Ihrem Repository. Ihnen wird — über System-Prompts, Projekt-Anweisungsdateien (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules` und ähnliche) sowie Projektdokumentationen — *gesagt*, dass sie einem Merge-Flow folgen sollen: auf einem Feature-Branch entwickeln, in den Integrations-Branch mergen (sowie in eventuell vorhandene Preview-/Production-Stufen) und Archiv-/Production-Merges Ihnen überlassen.

**Das ist eine weiche Regel.** Agenten überspringen sie, vertauschen die Reihenfolge oder „vergessen“ sie schlichtweg — nicht aus böser Absicht, sondern weil weiche Anweisungen für ein Sprachmodell unverbindlich sind.

Dieses Plugin verwandelt die weiche Regel in einen **harten Mechanismus**. Jede Git-Operation, die ein Agent versucht, wird gegen den *tatsächlichen Zustand Ihres lokalen Repositories* geprüft. Verstöße werden blockiert, bevor der Befehl ausgeführt wird — inklusive einer Erklärung des Grundes und der nächsten Schritte.

Niemand muss sich an die Regeln erinnern — die Regeln werden technisch durchgesetzt.

---

## Für wen dies gedacht ist — Szenarien & Teams

### Anzeichen, dass dieses Plugin für Sie geeignet ist

- Sie haben — oder wünschen sich — einen definierten Branch-Flow, von einem einzelnen `develop`-artigen Integrations-Branch bis hin zu mehrstufigen Preview-/Production-Pipelines.
- Ein Agent hat bereits einmal eine Abkürzung genommen: direkt auf einen geschützten Branch gepusht oder dorthin gemergt, wo er nicht sollte. Wenn es einmal passiert ist, wird es wieder passieren — dieses Plugin ist die strukturelle Lösung.
- Sie schützen Ihre Integrations-/Archiv-Branches, möchten sich aber nicht auf manuelle Reviews verlassen, um jeden Abkürzungsversuch abzufangen.
- Mehrere Features werden parallel entwickelt und landen in einer gemeinsamen Preview-Umgebung, und Sie möchten, dass jeder Übergang in eine strengere Stufe überprüft wird.

### Konkrete Szenarien

1. **Solo-Entwickler + Agent bei Kundenprojekten.** Sie übergeben dem Agenten ein Ticket; er „hilft“, indem er direkt auf den Integrations-Branch pusht. Eine kleine Konfigurationsdatei genügt, und der Agent kann geschützte Branches physisch nicht ohne PR/MR berühren — selbst wenn Sie gerade nicht hinsehen.
2. **Kleines Team (3–10 Personen) mit CI-bereitgestellter Preview.** Die Staging-Umgebung wird beim Merge automatisch deployt; eines Tages mergte ein Agent ein Feature ohne Review in `develop`. Von da an erfordert jeder Eintritt in die geschützten Stufen einen PR/MR — eine bewusste, auditierte Handlung.
3. **Unternehmen mit Multi-Umgebungs-Pipelines.** Viele Preview-Endpunkte plus eine reglementierte Produktions- und Archivlinie — jede Rolle wird einfach konfiguriert, und der Guard skaliert ohne zusätzliche Regeln.
4. **Asynchrone Zusammenarbeit.** Sie sind nicht immer online. Der Guard hält den Flow zwischen Ihren Sitzungen integer; Production-/Archive-Merges bleiben allein Ihre Sache.

**Nicht für Sie geeignet** (siehe auch [Was es NICHT tut](#was-es-nicht-tut--ehrliche-grenzen)):

- **Trunk-Based-Flow** — jeder mergt direkt in einen einzigen Branch: Das Plugin würde ständig blockieren.
- **Persönliches Repo ohne definierten Flow** — es gibt nichts durchzusetzen, kein Mehrwert.
- **Ein Team, das Branches keine Rollen zuweisen möchte** — das Plugin benötigt mindestens einen `integration`-Branch, den es schützen kann.

---

## Was es tut — Funktionen

- **Blockiert vor der Ausführung**: Direkter Push / Force-Push / Löschen geschützter Rollen-Branches (integration / preview / production / archive); Mergen von Agenten in Production oder Archive.
- **Rollengetrieben, vollständig konfigurierbar**: `integration` (integrierter Standard: `develop`) ist die Kernrolle; `preview` / `production` / `archive` sind optionale Arrays von Branch-Namen oder Regex-Mustern, jeweils mit eigenen Aktualisierungsregeln (`pr` / `flexible`, `mergeBy`).
- **Merge-by-User dort, wo es darauf ankommt**: Production- und Archive-Merges bleiben in Ihrer Hand — das Plugin blockiert den Agenten vor dem Klick auf Merge, sodass Ihre Handlung die Bestätigung *ist*.
- **Funktioniert mit jeder Benennung**: Branch-Namen werden über Ihre Konfiguration abgebildet, niemals fest einprogrammiert (siehe [Konfigurationsreferenz](#konfigurationsreferenz)).
- **Vollständig auditiert**: Jede Blockierung wird an ein Audit-Log in Ihrem Benutzer-Statusverzeichnis (`~/.local/state/gitflow-guard/`, `%LOCALAPPDATA%\gitflow-guard` unter Windows) angehängt — außerhalb des Repositories, niemals committet, außerhalb der beschreibbaren Sandbox des Agenten und geteilt über alle verknüpften Worktrees desselben Repositories.
- **Plattformunabhängiger Kern**: Reines lokales Git; zieht optional `gh` (GitHub) oder `glab` (GitLab) zur PR/MR-Zielauflösung heran und funktioniert auch ohne diese problemlos.

---

## Was es NICHT tut — Ehrliche Grenzen

- **Es ist keine Sicherheitsgrenze.** Die Befehlserkennung erfolgt nach bestem Wissen und Gewissen; ein Agent, der Befehle gezielt verschleiert, kann die Textanalyse umgehen.
- **Es fungiert nicht als Gate auf CI-Plattformen.** Der CI-Status wird lediglich als Referenz protokolliert, niemals als hartes Gate. Echter Branch-Schutz gehört in die Einstellungen von GitHub/GitLab, die zusätzlich geschaltet werden können.
- **Es ist kein Ersatz für den Flow selbst.** Ihr Projekt muss mindestens einen `integration`-Branch besitzen; wenn alle direkt auf denselben Branch pushen, blockiert dieses Plugin kontinuierlich — aktivieren Sie es dort nicht.
- **Production/Archive sind nicht automatisiert** — sie werden bewusst Ihrem menschlichen Klick überlassen; das Plugin sagt Agenten lediglich „Nein“.

---

## Serverseitiger Schutz vs. dieses Plugin

Serverseitiger Branch-Schutz (GitHub Branch Rules, geschützte GitLab Branches) und dieses Plugin lösen **unterschiedliche Probleme**. Sie ergänzen sich gegenseitig und sind keine Alternativen.

| Dimension | Serverseitiger Schutz | Dieses Plugin |
|---|---|---|
| Was geregelt wird | *Wer* auf geschützte Branches pushen / mergen darf (Berechtigungen) | *Wie* Agenten in den Flow eintreten dürfen (Workflow) — in welcher Rolle ein Merge landet |
| Verhindert Agenten-Merges in Production/Archive | Nein — kann nicht unterscheiden, ob „der Agent es getan hat“ | Ja — Production-/Archive-Merges sind für Agenten standardmäßig blockiert |
| Flexibilität pro Rolle | Eine Regel pro Branch auf dem Host | Pro-Rolle `update` (`pr`/`flexible`) + `mergeBy` (`user`/`anyone`) in einer Konfigurationsdatei |
| Geltungsbereich | Jeder Benutzer des Repositories, einschließlich Menschen | DSH-/Hook-Agenten mit konfiguriertem Plugin (Menschen werden nicht eingeschränkt) |
| Durchsetzungspunkt | Serverseitig, zum Push- / Merge-Zeitpunkt | Lokal, vor der Ausführung des Befehls |
| Plattform | An den Hosting-Dienst gebunden | Reines lokales Git, plattformunabhängig (`gh` / `glab` optional) |
| Umgehbar durch | Benutzer mit Administratorrechten | Jeden, der außerhalb der Agenten-Umgebung arbeitet, oder einen gezielt bösartigen Agenten |

Warum dies wichtig ist: Branch-Schutz beantwortet die Frage: *„Darf dieser Push überhaupt stattfinden?“*; dieses Plugin beantwortet: *„Darf dieser Agent unter der gegebenen Konfiguration diese Rolle betreten?“*. Das robusteste Setup nutzt **beides** — das Plugin sorgt dafür, dass Agenten den Workflow einhalten, und der serverseitige Branch-Schutz garantiert, dass niemand (weder Agent noch Mensch) direkt auf geschützte Branches pusht.

---

## Wie es funktioniert — Der Mechanismus in drei Zeilen

1. Ein Agent ruft ein Shell-Tool (`pwsh` / `bash`) mit einem Git-Befehl auf.
2. Das Plugin klassifiziert den Befehl, ermittelt die Branch-Rollen aus der `gitflow-guard.config.json` und wendet die Gate-Matrix an.
3. Verstoß → Der Tool-Aufruf wird **vor der Ausführung verweigert**, zusammen mit einer Begründung und dem nächsten Handlungsschritt. Erlaubt → Der Befehl wird ausgeführt; jede Verweigerung wird im benutzerweiten Audit-Log (`~/.local/state/gitflow-guard/repos/<repo>-<hash>/audit.jsonl`) protokolliert.

Keine Chat-Bestätigung oder Permit-Speicher nötig: Sensible Merges (Production / Archive) sind schlichtweg **ausschließlich dem Benutzer vorbehalten** — ein Agent kann den PR/MR vorbereiten, aber der Merge-Klick bleibt Ihre Entscheidung.

### Designprinzipien — Warum es funktioniert

#### 1. Die Konfiguration ist die einzige Quelle der Wahrheit

Nichts an Branch-Namen oder Regeln ist fest im Code verdrahtet. `integration` wird als integrierter Standard (`develop`) mitgeliefert; `preview` / `production` / `archive` sind optionale Arrays aus exakten Namen oder Regex-Mustern, jeweils mit eigenem `update` und `mergeBy` — per Deep-Merge über die Standardwerte gelegt. Dasselbe Binary skaliert vom Solo-`develop` bis zur unternehmensweiten Multi-Umgebungs-Pipeline.

#### 2. Das Blockieren erfolgt vor der Ausführung, nicht danach

Das Plugin klinkt sich an der Stelle `tools/pre-execute` in die Tool-Pipeline ein — dem Entscheidungspunkt, der abläuft, *bevor* der Befehl abgeschickt wird. Ein dortiges `deny` bedeutet, dass der Befehl **niemals ausgeführt wird**; der Agent sieht ausschließlich die Ablehnung. Eine nachträgliche Erkennung (Log-Scans im Nachhinein) kann keine Durchsetzung bieten — der Schaden wäre bereits entstanden.

#### 3. Sensible Merges sind unfälschbar menschlich

Kein Plugin-Code entscheidet für Production oder Archive: „Ist dieser Merge in Ordnung?“. Das Gate weigert sich schlicht, einen *Agenten* diese Merges durchführen zu lassen. Der einzige Weg führt somit über eine PR/MR-Seite, auf der **Sie** auf Merge klicken — und dieser Klick ist die Bestätigung. Es gibt kein Token, kein Permit und keine Chat-Nachricht, die ein Agent fälschen könnte, um an Ihnen vorbeizukommen.

---

## Konfigurationsreferenz

### Integrierte Standardeinstellungen & Deep-Merge-Override

Der Guard ist **standardmäßig aktiv** — keine `gitflow-guard.config.json` erforderlich. Er schützt:

| Standard | Rolle | Regel |
|---|---|---|
| `develop` | **integration** | Kein direkter Push; Aktualisierung über PR/MR (`update: "pr"`) |
| `main` | **archive** | Kein direkter Push / kein Agenten-Merge; der Archiv-Merge gehört Ihnen (`mergeBy: "user"`) |

Wenn Sie eine `gitflow-guard.config.json` erstellen, werden deren Felder per **Deep-Merge über die Standardeinstellungen** gelegt: Jedes von Ihnen definierte Feld bzw. jede Rolle ersetzt den Standardwert dafür, während alle nicht definierten Angaben den Standard beibehalten. Schreiben Sie nur das, was Sie ändern möchten:

```jsonc
{
  "branches": { "production": ["release-[\\w-]+"] }  // Standardwerte behalten develop+main; production wird hinzugefügt
}
```

**Vollständig deaktivieren** (Trunk- / Ein-Branch-Flows): `{ "enabled": false }`. Das Beheben einer versehentlichen Blockierung erfordert nur die Anpassung einer Datei, und `gitflow-guard status` erklärt jederzeit, was aktuell aktiv ist (auch wenn es die integrierten Standardwerte sind).

### Branch-Rollen — Das Modell hinter den Prüfungen

Eine **Rolle** ordnet Branch-Namen (oder Regex-Muster) einem Regelsatz zu. `integration` wird durch die Standardeinstellungen bereitgestellt; jede andere Rolle ist optional.

```text
Feature-Branches ──(frei)──> integration (Integrations-Branch; Aktualisierung via PR/MR)
                                   │
                                   ├──> preview (optional; Umgebungs-Endpunkte; Aktualisierung via PR/MR)
                                   │
                                   └──> production (optional; PR/MR + nur Sie klicken auf Merge)
archive (optional; Sie archivieren nach dem Release)
```

| Rolle | Konfigurationsschlüssel | Erforderlich? | Durchgesetztes Verhalten |
|---|---|---|---|
| **feature** | `featurePattern` | — | Frei: Commit / Push / Sync / Rebase |
| **integration** | `branches.integration` | Standard (`develop`) | Kein direkter Push (Standard `pr`); Features werden via PR/MR gemergt |
| **preview** | `branches.preview` (Array) | Optional | Kein direkter Push; Aktualisierung ausschließlich via PR/MR (Umgebungs-Endpunkte) |
| **production** | `branches.production` (Array) | Optional | Ausschließlich PR/MR; Merge nur durch Benutzer (`mergeBy: "user"`) |
| **archive** | `branches.archive` (Array) | Standard (`main`) | Archiv-PR/MR darf von Agenten erstellt werden; der Merge bleibt rein menschlich |

### Branch-Namen & Regeln anpassen — Jede Benennung funktioniert

**Kleines Team (Solo / 2–3 Entwickler) — Minimal: Nur Integration:**

```jsonc
{
  "enabled": true,
  "featurePattern": "feature/[\\w-]+",
  "branches": { "integration": ["develop"] }
}
```

**Größeres Team (Mehrere Preview-Umgebungen + Production + Archive):**

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

### Vollständige Feldreferenz

```jsonc
{
  "enabled": true,                     // Standard true — auf false setzen, um den Guard auszuschalten
  "featurePattern": "feature/[\\w-]+", // JS-Regex zum Erkennen Ihrer Arbeits-/Feature-Branches
  "branches": {
    "integration": { "branches": ["develop"], "update": "pr" },  // Standard: ["develop"] — weglassen zum Beibehalten
    "preview":     { "branches": ["ita1"], "update": "pr" },     // optional
    "production":  { "branches": ["prd"], "update": "pr", "mergeBy": "user" }, // optional
    "archive":     ["main"]                                      // optional
  },
  "locale": "en",                      // optional: Nachrichtensprache — jedes registrierte Locale ('en'/'zh' integriert); unbekannte Werte warnen in status und fallen auf Englisch zurück
  "strict": false,                     // optional: Fail-Closed — ungültige Konfiguration / interne Fehler blockieren statt zu warnen und durchzulassen
  "ci": { "enabled": true }            // optional: gh pr checks werden als Referenz protokolliert
}
```

- Rollen akzeptieren entweder ein **Array** (Kurzform) oder ein **Objekt** `{ branches, update?, mergeBy? }`.
- `update`: `pr` (Standard) = Aktualisierung nur über PR/MR; `flexible` = direkte/lokale Merges erlauben (kleine Teams).
- `mergeBy` (Production): `user` (Standard) = nur Sie klicken auf Merge; `anyone` = PR-Merge durchlassen.
- Jeder Branch-Eintrag ist ein exakter Name oder ein Regex (wird automatisch erkannt). **Regex-Sicherheit**: Branch-Muster werden von Ihnen verfasst und unverändert kompiliert — vermeiden Sie Konstrukte mit katastrophalem Backtracking (z. B. verschachtelte Quantifizierer wie `(\w+)+`) in `featurePattern` und Branch-Einträgen.
- **Sprache**: Nachrichten sind standardmäßig auf Englisch; fügen Sie `"locale": "zh"` für Chinesisch hinzu oder übergeben Sie `--locale <en|zh>` an einen beliebigen `gitflow-guard`-Unterbefehl (Priorität: CLI-Flag > Projektkonfiguration > Englisch). Alle benutzerseitigen Texte folgen dem Locale — einschließlich CLI-Framework-Meldungen wie `--help`, Hinweisen auf unbekannte Befehle und der Zeile bei leerem Audit-Log.
- **Eigene Locales**: Nachgelagerte Pakete können zur Laufzeit eine Sprache hinzufügen — `import { registerLocale } from 'agents-gitflow-guard'`, rufen Sie `registerLocale('fr', frDict)` mit einem Wörterbuch auf, das exakt dieselben Schlüssel wie das integrierte Englisch abdeckt (wird bei der Registrierung validiert), und setzen Sie dann `"locale": "fr"` in der Projektkonfiguration, um es zu aktivieren.

  ```js
  import { registerLocale, MESSAGE_KEYS } from 'agents-gitflow-guard'
  // MESSAGE_KEYS listet jeden Schlüssel auf, den ein Wörterbuch definieren muss (derselbe Satz wie im integrierten Englisch);
  // die Registrierung wirft einen Fehler, falls ein Schlüssel fehlt oder überzählig ist.
  const fr = { /* ein Eintrag pro MESSAGE_KEYS, z. B. */ 'deny.header': ({ why }) => `[gitflow-guard] bloqué : ${why}` }
  registerLocale('fr', fr)
  ```
- **Unbekannte Locales**: Ein nicht registrierter `"locale"`-Wert fällt während der Abfangung auf Englisch zurück (absichtliches Design — Hooks blockieren niemals wegen Formulierungen), sodass ein Tippfehler leicht übersehen werden kann; die einzeilige Warnung wird in `gitflow-guard status` angezeigt.
- **Validierung**: Sich überschneidende Rolleneinträge werden abgelehnt; ungültige Regex-Muster werden abgelehnt. **Jeder Konfigurationsfehler setzt das Projekt auf „nicht aktiviert“ zurück** (mit Bericht), anstatt ein halb erratenes Setup anzuwenden; achten Sie darauf, dass das Überschreiben einer Rolle mit demselben Branch-Namen wie eine Standardrolle (z. B. das Zuordnen von `main` zu integration, während das Standardarchiv noch `main` ist) ein Überschneidungsfehler ist — überschreiben oder entfernen Sie die andere Rolle ebenfalls.
- **Strict-Modus**: Standardmäßig gibt eine fehlerhafte Konfiguration eine einmalige Warnung auf stderr aus und lässt den Befehl passieren (Fail-Open, damit ein Tippfehler Ihre Toolchain nicht lahmlegt). `"strict": true` schaltet Konfigurationsfehler und interne Fehler auf **Blockieren** (Fail-Closed) um — für Hochrisiko-Repositories. Ein explizites `enabled: false` bleibt stumm; eine *fehlende* Datei ist kein Fehler mehr — die integrierten Standardwerte (develop+main) sind wirksam.

---

## Gate-Matrix — Was blockiert wird, was passiert

| Agenten-Aktion | Entscheidung |
|---|---|
| Commit / Push auf Feature / Sync / Rebase / Read-Only-Befehle | ✅ allow (erlaubt) |
| Direkter Push / Force-Push / Löschen von integration / preview / production / archive | 🚫 block (blockiert; bei integration/preview mit `flexible` ist direkter Push erlaubt) |
| PR/MR: Feature → integration / preview | ✅ allow (erlaubt) |
| PR/MR: Feature → production | ✅ Erstellung erlaubt; **Merge blockiert** (Sie mergen in der UI) |
| PR/MR in archive | ✅ Erstellung erlaubt; 🚫 Merge blockiert (Sie mergen in der UI) |
| Lokales `git merge feature/x`, während man sich auf integration / preview befindet | 🚫 block (PR/MR erforderlich); `update: flexible` erlaubt es |
| Verkettete Befehle (`checkout develop && merge feature/x`) | 🚫 blockiert — Branch-Wechsel werden pro Segment simuliert, keine Umgehung |
| Erzwungene Neuerstellung eines geschützten Branch (`git checkout -B/-C <branch>` / `git switch -C`) | 🚫 block (Gate für direkte Ref-Updates) |
| Umbiegen/Löschen eines geschützten Branch via `git symbolic-ref` | 🚫 block (Gate für direkte Ref-Updates) |
| `git cherry-pick` / `git revert`, während man sich auf integration / preview / production / archive befindet | 🚫 block (Verlaufsumschreibung auf einem geschützten Branch); `-n` / `--no-commit` sowie `--abort`/`--continue`/`--skip`/`--quit` passieren |
| Mit `sudo` gekapselte Git-Befehle (Privilegien-Wrapper) | 🚫 Wrapper wird entfernt (`sudo -u …` eingeschlossen), zugrunde liegender Befehl geprüft |

> Zwei bewusste Nicht-Blockierungen, damit sie später nicht versehentlich „geschlossen“ werden: `git tag -f` (Verschieben eines Tags, selbst wenn er auf einen geschützten Branch zeigt) bleibt ausgenommen — Tags liegen außerhalb des Branch-Rollen-Geltungsbereichs, genau wie `push --tags`; und ein einfaches `git commit` auf einem geschützten Branch bleibt erlaubt — der Guard regelt Branch-Rollen und Merge-Pfade, nicht Inhalte, und das nachfolgende `git push` wird weiterhin blockiert (das Remote bleibt sauber).

Das PR/MR-Ziel wird über `gh pr view` (GitHub) oder `glab mr view` (GitLab) aufgelöst. Ohne Plattform-CLI verhält sich das Plugin konservativ.

---

## Wo der Mensch die Kontrolle behält

- **Production-Merge** und **Archive** sind standardmäßig ausschließlich dem Benutzer vorbehalten: Ein Agent kann bei der Vorbereitung des PR/MR helfen, aber **Sie klicken auf den Merge-Button** — dieser Klick *ist* die Bestätigung. Es gibt keinen separaten Permit-Store, um diese Entscheidung auszulagern.
- Jede Verweigerung wird an das benutzerweite Audit-Log zur Überprüfung angehängt (`gitflow-guard audit`).

---

## Installation im Detail

**Voraussetzung**: **Node.js ≥ 22** in Ihrem `PATH` (die Mindestanforderung der Paket-`engines` und die unterste Stufe der CI-Matrix). Jeder Client nutzt **dasselbe npm-Paket** `agents-gitflow-guard` — lediglich der Einbindungs- und Verdrahtungsschritt unterscheidet sich.

| Client-Typ / Plattform | Installationsbefehl | Einbindungs- & Verdrahtungsschritt |
|---|---|---|
| Claude Code · Codex · OpenCode · Antigravity | `npm i -g agents-gitflow-guard` | `gitflow-guard wire --client <name> --project --yes` |
| DeepSeek Harness (DSH) | `dsh plugin --profile web add agents-gitflow-guard` | DSH neu starten — Plugin bindet sich automatisch als Profil-Layer ein |
| Pi | `npm i -D agents-gitflow-guard` | Kopieren Sie `pi/gitflow-guard.ts` nach `.pi/extensions/` |

### 1. Eigenständige CLI-Hook-Clients (Claude Code · Codex · OpenCode · Antigravity)

Installieren Sie das CLI einmal global und **verdrahten Sie jeden Client mit einem einzigen Befehl** (der Guard ist über seine Standardkonfiguration standardmäßig aktiv, sodass nur noch die Verdrahtung aussteht):

```bash
npm i -g agents-gitflow-guard   # stellt das Binary `gitflow-guard` bereit
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

`wire` liest die bestehende Konfigurationsdatei (falls vorhanden), fügt den Hook-Eintrag ein, ohne etwas anderes zu verändern, ist idempotent (bereits verdrahtet → wird übersprungen), unterstützt `--dry-run` zur Vorschau sowie `--unwire` zum Entfernen und fragt nach, bevor `--global`-Dateien verändert werden. Die genauen Dateien, die geschrieben werden (zur Referenz und zum manuellen Erstellen statt `wire`), lauten:

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

### 2. In-Process-Plugins und Erweiterungen (DSH · Pi)

- **DeepSeek Harness (DSH)**:
  ```bash
  dsh plugin --profile web add agents-gitflow-guard
  ```
  Starten Sie DSH danach neu. Das Paket deklariert `dsh.bundle.patch`, sodass `dsh plugin add` es automatisch als Profil-Layer einbindet, ohne dass ein manuelles Bearbeiten des Profils nötig ist. Upgrades erfolgen mit demselben Befehl und anschließendem Neustart.

- **Pi**:
  Pi lädt Erweiterungen prozessintern (kein Stdin-Payload, kein Subprozess-Hook). Installieren Sie den mitgelieferten Einstiegspunkt in das Projekt und behalten Sie das Paket in den devDependencies:
  ```bash
  npm i -D agents-gitflow-guard
  mkdir -p .pi/extensions
  cp node_modules/agents-gitflow-guard/pi/gitflow-guard.ts .pi/extensions/gitflow-guard.ts
  ```
  Konfigurieren Sie `.pi/settings.json`:
  ```jsonc
  // Pi — .pi/settings.json (Erweiterungen lösen sich relativ zu .pi auf)
  { "extensions": ["extensions/gitflow-guard.ts"] }
  ```

### 3. Aus dem Quellcode & Lokale Entwicklung

Für Mitwirkende oder Entwickler, die direkt mit dem neuesten Quellcode-Checkout arbeiten und debuggen möchten:

```bash
# Klonen und bauen
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build
```

Binden Sie den lokalen Build in Ihre Ziel-Agenten-Plattform ein:

```bash
# A. Eigenständige CLI-Hook-Clients (Claude Code · Codex · OpenCode · Antigravity)
npm link # oder npm install -g .
gitflow-guard wire --client <claude|codex|opencode|antigravity> --project --yes

# B. DeepSeek Harness (DSH)
dsh plugin --profile web add file:/path/to/AgentsGitFlowController
# oder ausführen: node scripts/install-dsh.mjs web (DSH danach neu starten)

# C. Pi
npm link
# oder kopieren Sie pi/gitflow-guard.ts aus dem Repository direkt nach .pi/extensions/
```

### 4. Hinweis zu GitHub Copilot

**GitHub Copilot — hier bewusst kein Hook.** Copilot bringt für genau diese Aufgabe eigene Schutzplanken mit: Tool-basierte **allow/deny/ask**-Berechtigungen und Projekt-**rules** (`rules.json` + `AGENTS.md`). Verweisen Sie Copilot-Nutzer auf die offizielle Dokumentation statt auf ein Plugin-Hook:

- [Tool-Nutzung erlauben und ablehnen (GitHub Docs)](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools)
- [Benutzerdefinierte Regeln für den Copilot-Coding-Agenten hinzufügen (GitHub Docs)](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-rules-for-the-copilot-coding-agent)
- Optional: Copilot verfügt auch über ein [Hooks-System](https://docs.github.com/en/copilot/reference/hooks-reference) (`preToolUse` → `permissionDecision:"deny"`), falls Sie ein Abfangen auf Befehlsebene wünschen.

### 5. Hook-Mechanismus & Technische Hinweise

- **Plattformprotokoll**: Der Hook liest das Payload auf Stdin und antwortet nach dem Protokoll der jeweiligen Plattform:
  - **Claude Code / OpenCode**: `exit 2` (stderr enthält den Grund und umsetzbare nächste Schritte).
  - **Codex**: stdout JSON `{"hookSpecificOutput":{"permissionDecision":"deny",...}}`.
  - **Antigravity**: stdout JSON `{"decision":"deny","reason":...}` mit `exit 0` (Antigravity verlangt Exit-Code 0).
  - **Pi**: In-Process-Erweiterung, die auf das `tool_call`-Event lauscht und über `{ block: true, reason }` ablehnt.
- **Pre-Tool-Ausführung**: Nur das Pre-Tool-Ereignis wird abgefangen; der Guard blockiert, *bevor* Befehle ausgeführt werden, sodass keine Post-Tool-Hooks oder Permit-Bereinigungsschritte erforderlich sind.
- **Binary PATH-Auflösung**: Die globale Installation (`npm i -g`) stellt das Binary `gitflow-guard` bereit. Falls Ihr Agent-Runner Ihren interaktiven `PATH` nicht erbt, verwenden Sie den vollständigen Pfad aus `npm bin -g`.
- **Standardmäßig aktiviert**: Die integrierten Standardwerte (`integration: ["develop"]`, `archive: ["main"]`) greifen ohne jede Konfigurationsdatei. Eigene Konfigurationen in `gitflow-guard.config.json` werden per Deep-Merge über die Standardwerte gelegt.
- **Zerstörungsfreie Verdrahtung**: `gitflow-guard wire` führt Hook-Konfigurationen idempotent zusammen, ohne bestehende Hooks zu verändern, und `wire --unwire` entfernt ausschließlich den Guard-Eintrag.

---

## FAQ

### Meine Branches folgen nicht den Standardnamen — kann ich es trotzdem nutzen?

Ja — nichts an den Branch-Namen ist fest vorgegeben. `integration` wird als integrierter Standard (`develop`) mitgeliefert, und jede benutzerdefinierte Konfiguration wird per Deep-Merge darüber gelegt; ihre Einträge (sowie die von `preview` / `production` / `archive`) können beliebige exakte Branch-Namen oder Regex-Muster sein. `featurePattern` teilt dem Plugin mit, wie es Ihre Arbeits-Branches erkennt.

Ein Team, das seinen Integrations-Branch `master` nennt, ein `beta`-Preview hinzufügt und Feature-Branches mit dem Präfix `fix/` versieht, schreibt genau das in die Konfiguration; jede Blockierung, jeder Bericht und jedes Audit verwendet daraufhin diese Namen. Es gibt keine Konvention, die Sie übernehmen müssen — nur eine Zuordnung, die Sie deklarieren. Siehe [Branch-Namen & Regeln anpassen](#branch-namen--regeln-anpassen--jede-benennung-funktioniert).

---

### Brauche ich überhaupt Preview/Production/Archive?

Nein. Fügen Sie nur die Rollen hinzu, die Ihr Flow tatsächlich besitzt. Ein Solo-Repository mit reinem `develop` konfiguriert `integration: ["develop"]` und sonst nichts; ein Unternehmen mit zehn Umgebungen ergänzt das `preview`-Array und eine `production`-Rolle. Der Rest bleibt unkonfiguriert.

---

### Ist dies ein Sicherheitswerkzeug?

Nein, und es ist wichtig, dass Sie es nicht als solches behandeln. Es ist ein Workflow-Guard: Er macht einen vereinbarten Prozess mechanisch durchsetzbar. Die textbasierte Befehlserkennung erfolgt naturgemäß nach bestem Bemühen — ein Agent, der fest entschlossen ist, einen Befehl zu verschleiern, kann am Parser vorbeikommen.

Innerhalb der unterstützten Befehlsformen wird die Rollengrenze lokal durchgesetzt: Das Mergen in einen geschützten Rollen-Branch (integration / preview / production / archive) erfordert den konfigurierten Pfad (PR/MR oder ein manueller Merge für Production/Archive). Gängige Verschleierungs-Wrapper werden klassifiziert und blockiert — Shell-Wrapper (`sh -c` / `bash -lc`), Subshells und Backtick-/`$()`-Verschachtelungen, Präfixe wie `env`/`command`/`nohup`/`xargs`/`sudo` und `VAR=x`-Zuweisungen, absolute Pfade, Pipelines und `||`-Anhänge, globale Git-Optionen (`-C .`, `--git-dir=…`), Wildcard-Refspecs (`refs/heads/*:refs/heads/*`), als Fetch+Merge verwendetes `git pull` sowie die Plumbing-Befehle `send-pack`/`update-ref`/`symbolic-ref`; das erzwungene Neuerstellen eines geschützten Branch (`checkout -B`/`switch -C`) und Cherry-Pick/Revert auf einem geschützten Branch werden durch die Ref-Update- / Ref-Move-Gates blockiert. Der ausführbare Korpus für gegnerische Tests befindet sich in `tests/accuracy-audit.spec.ts`.

Was **lokal nicht abwehrbar** bleibt: direkte Forge-API-Aufrufe (`gh api repos/…/pulls/N/merge`, `curl`) und Befehle innerhalb von Interpreter-Subprozessen (`node -e "child_process.exec('git push …')"`); beliebig tiefe Verschachtelungen von Anführungszeichen oder Kodierungen bleiben naturgemäß Best-Effort. Die echte, unumgehbare Grenze liegt in den Branch-Schutzregeln Ihres Hosting-Dienstes. Nutzen Sie beides — betrachten Sie diesen Guard als sofortiges Feedback und Audit-Trail, nicht als Sicherheitsgrenze.

---

### Warum kann der Agent nicht einfach selbst in Production/Archive mergen?

Weil das Gate diese Aktionen als **ausschließlich dem Benutzer vorbehalten** einstuft. Das Plugin verweigert den *Merge* für Production und Archive — das Erstellen eines PR/MR bleibt erlaubt, sodass ein Agent weiterhin einen `develop` → `main` Archiv-PR für Sie entwerfen kann. Der Merge selbst hat jedoch genau einen Weg: **Sie** klicken darauf — es gibt kein Permit, kein Token und keine Chat-Nachricht, die ein Agent nutzen könnte, um sich diese Befugnis selbst zu erteilen.

---

### Benötige ich das `gh`- oder `glab`-CLI?

Nein. Sie sind optionale Adapter, die nur verwendet werden, um aufzulösen, worauf ein `pr merge` / `mr merge` abzielt, damit das Gate zwischen „Merge in Integration/Preview“ (in Ordnung) und „Merge in Production/Archive“ (blockiert) unterscheiden kann. Wenn keines der CLIs das Ziel bestätigen kann — fehlend, nicht authentifiziert, offline oder die Abfrage schlägt fehl —, **verweigert das Gate den Merge**, selbst wenn er von einem Feature-Branch aus aufgerufen wird: Dieser PR könnte tatsächlich auf Production/Archive zeigen. Wiederholen Sie den Vorgang, sobald das CLI funktioniert, oder lassen Sie den Benutzer auf Merge klicken. Alles andere funktioniert wie gewohnt. Die Kerndurchsetzung berührt niemals einen Hosting-Dienst, weshalb sie auf GitHub, GitLab, selbst gehosteten Instanzen oder offline identisch funktioniert.

---

### Wird dadurch meine normale Arbeit blockiert?

Bewusst nein. Alles, wozu ein Feature-Branch da ist — Committen, Pushen, Synchronisieren von `integration`, Rebasen, Inspizieren mit Read-Only-Befehlen, Ausführen von `gitflow-guard status` — ist ohne Reibung erlaubt.

Die Blockierungen sind reserviert für: (1) direkte Schreibvorgänge auf geschützte Rollen-Branches und (2) Versuche eines Agenten, in Production oder Archive zu mergen. Wenn Sie jemals eine Blockierung sehen, die Sie für falsch halten, führen Sie `gitflow-guard status` aus — dort wird genau angezeigt, welche Rolle jeder lokale Branch erhalten hat, sodass Fehleinschätzungen sichtbar und korrigierbar sind.

---

### Was passiert, wenn meine Konfiguration einen Fehler enthält?

Ein halb erratenes Setup wird niemals versehentlich angewendet: Jeder Validierungsfehler deaktiviert den Guard für dieses Projekt und meldet die Fehler.

Häufige Fehler: Das Überschreiben einer Rolle mit demselben Branch-Namen wie eine Standardrolle (z. B. `main` als Integration, während das Standardarchiv noch `main` ist — ein expliziter Überschneidungsfehler; überschreiben oder entfernen Sie die andere Rolle ebenfalls), das Zuordnen eines Branch zu zwei Rollen (abgelehnt) und ein `featurePattern`, das sich nicht kompilieren lässt (als ungültiger Regex abgelehnt). Die Fehlermeldung ist unübersehbar und die Datei besteht aus einem einzigen JSON-Objekt, sodass die Korrektur meist in dreißig Sekunden erledigt ist.

---

### Was genau wird im lokalen Repository geprüft?

Der aktuelle Branch (`git branch --show-current`) und — nur für `pr merge` / `mr merge` — das PR/MR-Ziel über `gh pr view` / `glab mr view`. Es werden keine Angaben über die Abstammung benötigt, da das Modell rollengetrieben ist (welcher Branch *ist* das Ziel) und nicht reihenfolgegetrieben.

Es wird nichts geschrieben, kein Remote kontaktiert und keine Funktion des Hosting-Dienstes für die Kernprüfungen benötigt. Production-/Archive-Merges werden für Agenten schlicht verweigert; der menschliche Merge erfolgt in Ihrer UI.

---

### Lizenz / Kosten?

MIT, kostenlos, ohne Bedingungen. Nutzen Sie es, modifizieren Sie es, liefern Sie es aus — die einzige Verpflichtung besteht im Beibehalten des Urheberrechtshinweises.

Wenn es Ihrem Team eine schiefgegangene Abkürzung erspart, wird der Kaffee-Button oben auf dieser Seite geschätzt, ist aber niemals erforderlich. Siehe [Lizenz](#lizenz).

---

## Glossar

| Begriff | Bedeutung |
|---|---|
| **integration** | Die Kernrolle (integrierter Standard: `develop`); Features werden über PR/MR gemergt; geschützt |
| **preview** | Optionale Umgebungs-Endpunkt-Branches (`branches.preview`, Array); Aktualisierung nur via PR/MR |
| **production** | Optionale Produktions-Branches (`branches.production`, Array); PR/MR + Merge nur durch Benutzer |
| **archive** | Optionaler Post-Release-Archiv-Branch (`branches.archive`, Array); Agenten dürfen PR/MRs dorthin erstellen, aber der Merge bleibt rein menschlich |
| **feature branch** | Ihr Arbeits-Branch, erkannt über `featurePattern`; freie Zone |
| **gate matrix** | Die Entscheidungstabelle, die jeden klassifizierten Befehl auf Erlauben/Blockieren abbildet |
| **pre-execute** | Der Hook der Tool-Pipeline, an dem die Blockierung stattfindet — vor Ausführung des Befehls |
| **merge-by-user** | Production-/Archive-Merges bleiben in Ihrer Hand — Ihr Klick auf den PR/MR ist die Bestätigung |

---

## Roadmap

Zukünftige Funktionen und Bereiche unter aktiver Evaluierung:

- **Neue Agenten-Integrationen**: Erforschung und Anpassung an neue Agenten-Hooks/Erweiterungen (z. B. Cursor, Windsurf, neu entstehende Agenten-CLIs).
- **Audit-Aggregation**: Rechnerübergreifende Synchronisierung von Audit-Trails und Exportformate für Compliance auf Teamebene.
- **Workflow-Presets**: Gebrauchsfertige Konfigurations-Presets für gängige Git-Branching-Modelle (Trunk-Based Development, Multi-Umgebungs-Enterprise-Setups).
- **CI-Hard-Gating**: Native CI-Pipeline-Hooks und PR-Check-Integration unter Beibehaltung der abhängigkeitsfreien lokalen Ausführung.

Für bereits veröffentlichte Funktionen und die Versionshistorie siehe [CHANGELOG.md](CHANGELOG.md).

---

## Entwicklung

```bash
npm install
npm test              # Unit-Tests: classify / gate / config / cli / repo / platform / i18n / index / accuracy-audit / pi
npm run typecheck     # tsc --noEmit, 0 Fehler
npm run build         # tsdown → lib/ (CLI und Plugin teilen sich den Build)
npm run check:pins    # prüft, ob die package.json-Version mit dem CHANGELOG-Titel und Version-Pins in READMEs übereinstimmt
npm run verify:matrix # kontinuierliche agentenübergreifende Regression: DSH-Logik + zh-Locale + Multi-Client-Hooks + Pi-Erweiterung
```

- **Qualitätsregel**: Jede Logikänderung erfordert einen fehlerfreien Typecheck (0 Fehler), alle Tests im grünen Bereich und ein erfolgreiches `verify:matrix`.
- **Client-Erweiterungen**: Wenn Sie Unterstützung für eine neue Agenten-Plattform hinzufügen, befolgen Sie die Synchronisierungs-Checkliste in [AGENTS.md](AGENTS.md) §8.

---

## Support

Das Plugin ist kostenlos und Open Source (MIT). Wenn es Ihnen und Ihrem Team geholfen hat, eine verhängnisvolle Abkürzung zu verhindern, freuen wir uns über einen Kaffee:

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/keanz21)

---

## Lizenz

[MIT](LICENSE) © FeatureAgents
