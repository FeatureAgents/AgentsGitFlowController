# agents-gitflow-guard

> **Vous en avez assez que les agents IA contournent votre GitFlow ?**

Un garde-fou configurable pour les rôles de branches Git, conçu pour les agents de codage IA — [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), [Codex](https://github.com/openai/codex), [OpenCode](https://github.com/opencode-ai/opencode), [Antigravity](https://github.com/google-deepmind), [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) et [Pi](https://github.com/mariozechner/pi).
Vous définissez vos propres branches —
**integration** (les fonctionnalités sont intégrées via PR/MR), **preview** (environnements de test), **production**, **archive** — chacune avec ses propres règles de mise à jour. Les agents ne peuvent pas contourner le processus et les fusions sensibles restent entre vos mains.

[English](README.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-tw.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Русский](README.ru.md) · [Licence](LICENSE)

[![Support on Ko-fi](https://img.shields.io/badge/Support_on_Ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## Table des matières

- [Démarrage rapide — 30 secondes pour protéger un dépôt](#démarrage-rapide--30-secondes-pour-protéger-un-dépôt)
- [Pourquoi — Le problème résolu par ce plugin](#pourquoi--le-problème-résolu-par-ce-plugin)
- [À qui s'adresse ce plugin — Scénarios et équipes](#à-qui-sadresse-ce-plugin--scénarios-et-équipes)
- [Ce qu'il fait — Fonctionnalités](#ce-quil-fait--fonctionnalités)
- [Ce qu'il ne fait PAS — Limites honnêtes](#ce-quil-ne-fait-pas--limites-honnêtes)
- [Protection côté serveur vs ce plugin](#protection-côté-serveur-vs-ce-plugin)
- [Comment ça marche — Le mécanisme en trois lignes](#comment-ça-marche--le-mécanisme-en-trois-lignes)
- [Référence de configuration](#référence-de-configuration)
- [Matrice de décision — Ce qui est bloqué, ce qui passe](#matrice-de-décision--ce-qui-est-bloqué-ce-qui-passe)
- [Là où l'humain garde le contrôle](#là-où-lhumain-garde-le-contrôle)
- [Installation détaillée](#installation-détaillée)
- [FAQ](#faq)
- [Glossaire](#glossaire)
- [Feuille de route](#feuille-de-route)
- [Développement](#développement)
- [Support](#support)
- [Licence](#licence)

---

## Démarrage rapide — 30 secondes pour protéger un dépôt

**Étape 1 — Installer.** Les six clients utilisent le même paquet npm `agents-gitflow-guard` — choisissez le mode d'installation correspondant à votre agent :

```bash
# Mode A : Clients Hook CLI (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# Mode B : Plugin interne DSH (redémarrer DSH ensuite ; les plugins se chargent au démarrage)
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# Mode C : Extension interne Pi
npm i -D agents-gitflow-guard
```

> **Remarque** : Une commande simple `add` ou `npm i` installe la dernière version depuis le registre npm. Si votre miroir présente un délai de cache ou si vous devez figer une version spécifique, ajoutez `@<version>` (ex. `npm i -g agents-gitflow-guard@<version>`). Les dépendances de pair spécifiques à DSH (`@deepseek-ai/cordis` / `@deepseek-ai/dsh-tools`) sont déclarées **optionnelles** — seul le plug-in intégré à DSH en a besoin, fournies par DSH via son mécanisme de repli de module de profil partagé à l'exécution ; les utilisateurs CLI / Pi / OpenCode ne sont pas contraints de les installer.
>
> Les clients hook CLI exécutent une commande de liaison après l'installation (voir Étape 2) ; Pi copie un fichier d'extension ; DSH se monte automatiquement lors de l'ajout du plugin.

**Étape 2 — Lier votre client (aucun fichier de configuration requis).** Le garde est livré avec **des valeurs par défaut intégrées qui protègent `develop` (intégration) + `main` (archive)** — zéro configuration, activé par défaut. La seule chose nécessaire est d'indiquer à votre client IA d'invoquer le garde, à l'aide d'une seule commande par client stdin-hook (DSH est lié automatiquement ; Pi copie simplement un fichier, voir ci-dessous) :

```bash
# Claude Code → .claude/settings.json de ce dépôt
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity (chacun son propre fichier de configuration ; --yes ignore la confirmation y/N)
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# Aperçu (sans écriture) / suppression / assistant interactif :
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` fusionne les modifications dans votre configuration existante de manière **non destructive** (les hooks déjà présents restent intacts) et écrit par défaut dans votre **répertoire de projet** — `--global` (pour tous les dépôts de cette machine) demande toujours confirmation ou nécessite `--yes`. Les fichiers et formats spécifiques à chaque client sont détaillés dans [Installation détaillée](#installation-détaillée).

> ⚠️ **main est protégé par défaut.** Les utilisateurs de flux Trunk-based ou à branche unique (où tout le monde pousse directement sur une seule branche) seront bloqués lors des pushs directs sur `main` jusqu'à ce qu'ils désactivent cette protection — créez un fichier `gitflow-guard.config.json` avec `{ "enabled": false }`, ou associez vos propres branches (voir [Référence de configuration](#référence-de-configuration)). `gitflow-guard status` rappelle cet avis chaque fois que les valeurs par défaut intégrées sont appliquées.

**Étape 3 — Vérifier.** Demandez à l'agent d'exécuter `git push origin develop`. L'appel d'outil doit être rejeté :

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

Les messages sont en anglais par défaut ; créez une configuration avec `"locale": "zh"` pour passer en chinois — les messages apparaîtront alors ainsi : *已拦截:受保护分支「develop」禁止直推 / 下一步:集成分支(develop)由 PR/MR 合入 feature……* (voir [Référence de configuration](#référence-de-configuration)).

**Terminé.** Le garde est actif pour ce dépôt avec les réglages par défaut intégrés. Vous souhaitez d'autres étapes (`preview` / `production`) ou des noms de branches différents ? Rédigez un fichier `gitflow-guard.config.json` en ne spécifiant que les champs qui vous intéressent — tout le reste conservera les valeurs par défaut intégrées. Pour consulter la table de décision complète, voir la [Matrice de décision](#matrice-de-décision--ce-qui-est-bloqué-ce-qui-passe).

### Déroulement complet — Une fonctionnalité de bout en bout

Scénario : votre équipe livre une page de connexion (`feature/login-page`) ; `develop` est la branche d'intégration, `main` est l'archive. Voici ce que vous et l'agent constatez à chaque étape :

| # | Ce que l'agent exécute | Décision du plugin | Ce que vous voyez |
|---|---|---|---|
| 1 | `git checkout -b feature/login-page` (depuis develop) | ✅ allow (le travail sur les features est libre) | Branche créée |
| 2 | `git add . && git commit -m "feat: login"` | ✅ allow | Committé |
| 3 | `git push -u origin feature/login-page` | ✅ allow (pousser sa feature est autorisé) | Poussé |
| 4 | `git checkout develop && git merge feature/login-page` | 🚫 **deny** — la branche d'intégration est accessible par PR/MR uniquement | Doit ouvrir une PR/MR vers develop |
| 5 | `gh pr create --base develop` | ✅ allow (feature → intégration via PR) | PR créée, vous relisez et fusionnez |
| 6 | `git push origin main` ou fusionner dans main | 🚫 **deny** — l'archive est exclusivement manuelle | Vous archivez develop → main vous-même après la release |

Remarquez ce que l'agent *ne peut pas* faire : fusionner une feature directement dans `develop`, ou toucher à `main`. Chaque fusion sensible est une action humaine délibérée sur la page de la PR/MR ou dans votre propre terminal.

---

## Pourquoi — Le problème résolu par ce plugin

Les agents de codage IA travaillent directement au sein de votre dépôt. Il leur est *demandé* — via des prompts système, des fichiers d'instructions de projet (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, etc.) et la documentation — de suivre un flux de fusion : développer sur une branche de fonctionnalité, fusionner dans la branche d'intégration (ainsi que dans vos étapes de preview/production si vous en avez), et vous confier les fusions vers l'archive et la production.

**Il s'agit d'une règle souple.** Les agents la contournent, inversent les étapes ou « l'oublient » tout simplement — non par malveillance, mais parce que les instructions informelles restent facultatives pour un modèle de langage.

Ce plugin transforme cette règle souple en un **mécanisme rigide**. Chaque opération Git tentée par un agent est confrontée à *l'état réel de votre dépôt local*. Les infractions sont bloquées avant l'exécution de la commande, avec une explication claire du motif et de la marche à suivre.

Personne n'a besoin de se remémorer les règles — elles sont appliquées de manière automatisée et stricte.

---

## À qui s'adresse ce plugin — Scénarios et équipes

### Signes que ce plugin est fait pour vous

- Vous disposez — ou souhaitez disposer — d'un flux de branches bien défini, qu'il s'agisse d'une simple branche d'intégration de type `develop` ou de pipelines multi-niveaux preview/production.
- Un agent a déjà pris un raccourci : poussé directement sur une branche protégée ou fusionné là où il ne le devait pas. Si cela est arrivé une fois, cela se reproduira — ce plugin apporte la solution structurelle.
- Vous protégez vos branches d'intégration et d'archive, mais ne souhaitez pas vous reposer uniquement sur la relecture humaine pour détecter chaque raccourci.
- Plusieurs fonctionnalités sont développées en parallèle et convergent vers un environnement de prévisualisation partagé, et vous exigez une validation humaine pour toute transition vers une étape plus stricte.

### Scénarios concrets

1. **Développeur solo + agent sur des projets clients.** Vous confiez un ticket à l'agent ; il tente « d'aider » en poussant directement sur la branche d'intégration. Un petit fichier de configuration suffit pour empêcher physiquement l'agent de toucher aux branches protégées sans PR/MR — même quand vous avez le dos tourné.
2. **Petite équipe (3 à 10 personnes) avec prévisualisation déployée par CI.** L'environnement de staging se déploie automatiquement lors de la fusion ; un jour, un agent a fusionné une fonctionnalité dans `develop` sans relecture. Dès lors, chaque passage vers les étapes protégées requiert une PR/MR — un acte délibéré et audité.
3. **Entreprise avec des pipelines multi-environnements.** De nombreux points de terminaison de test plus des lignes de production et d'archive verrouillées — chaque rôle se configure simplement, et le garde s'adapte à l'échelle sans règles superflues.
4. **Collaboration asynchrone.** Vous n'êtes pas toujours connecté. Le garde garantit l'intégrité du flux entre vos sessions de travail ; les fusions vers la production et l'archive demeurent sous votre contrôle exclusif.

**Ce plugin n'est pas fait pour vous** (voir également [Ce qu'il ne fait PAS](#ce-quil-ne-fait-pas--limites-honnêtes)) :

- **Flux Trunk-based** — tout le monde fusionne directement sur une seule branche : le plugin bloquerait en permanence.
- **Dépôt personnel sans flux défini** — rien à faire respecter, aucun intérêt.
- **Une équipe refusant d'attribuer des rôles aux branches** — le plugin nécessite au moins une branche `integration` à protéger.

---

## Ce qu'il fait — Fonctionnalités

- **Bloque avant exécution** : push direct / force-push / suppression de branches à rôles protégés (integration / preview / production / archive) ; tentative de fusion par l'agent vers production ou archive.
- **Piloté par les rôles, entièrement configurable** : `integration` (valeur intégrée par défaut : `develop`) est le rôle central ; `preview` / `production` / `archive` sont des tableaux optionnels de noms de branches ou de regex, chacun doté de ses propres règles de mise à jour (`pr` / `flexible`, `mergeBy`).
- **Fusion humaine là où c'est indispensable (Merge-by-user)** : les fusions vers production et archive restent entre vos mains — le plugin empêche l'agent de cliquer sur fusionner, faisant de votre action la seule confirmation valable.
- **Compatible avec toutes les nomenclatures** : les noms de branches sont mappés par votre configuration et ne sont jamais codés en dur (voir [Référence de configuration](#référence-de-configuration)).
- **Entièrement audité** : chaque refus est consigné dans un journal d'audit situé dans votre répertoire d'état utilisateur (`~/.local/state/gitflow-guard/`, `%LOCALAPPDATA%\gitflow-guard` sous Windows) — hors du dépôt, jamais committé, hors de la sandbox accessible en écriture par l'agent, et partagé entre tous les worktrees liés d'un même dépôt.
- **Cœur indépendant des plateformes** : Git local pur ; consulte facultativement `gh` (GitHub) ou `glab` (GitLab) pour résoudre la cible des PR/MR, et fonctionne parfaitement sans eux.

---

## Ce qu'il ne fait PAS — Limites honnêtes

- **Ce n'est pas une frontière de sécurité infranchissable.** L'analyse des commandes est réalisée au mieux ; un agent déterminé à obfusquer ses commandes peut tromper l'analyse syntaxique textuelle.
- **Il ne sert pas de barrière sur les plateformes de CI.** L'état de la CI est consigné à titre informatif uniquement, jamais comme un verrou bloquant. La véritable protection de branches relève des paramètres GitHub/GitLab, qui viennent s'ajouter en surcouche.
- **Il ne remplace pas le flux lui-même.** Votre projet doit posséder au moins une branche `integration` ; si tout le monde pousse directement sur une branche unique, ce plugin bloquera sans arrêt — ne l'activez pas dans ce contexte.
- **La production et l'archive ne sont pas automatisées** — elles sont délibérément laissées à votre validation manuelle ; le plugin se contente de dire « non » aux agents.

---

## Protection côté serveur vs ce plugin

La protection de branches côté serveur (règles de branches GitHub, branches protégées GitLab) et ce plugin répondent à **des problématiques distinctes**. Ils sont complémentaires et ne s'excluent pas.

| Dimension | Protection côté serveur | Ce plugin |
|---|---|---|
| Ce qu'elle régit | *Qui* a le droit de pousser / fusionner sur les branches protégées (permissions) | *Comment* les agents peuvent s'insérer dans le flux (workflow) — dans quel rôle atterrit une fusion |
| Empêche les agents de fusionner dans production/archive | Non — ne peut pas distinguer si « c'est l'agent qui l'a fait » | Oui — les fusions vers production/archive sont bloquées pour les agents par défaut |
| Flexibilité par rôle | Une règle par branche sur l'hébergeur | Par rôle : `update` (`pr`/`flexible`) + `mergeBy` (`user`/`anyone`) dans un seul fichier de configuration |
| Portée | Tous les utilisateurs du dépôt, humains compris | Agents avec plugin configuré (les humains ne sont pas restreints) |
| Point d'application | Côté serveur, au moment du push / de la fusion | Localement, avant que la commande ne soit exécutée |
| Plateforme | Lié au service d'hébergement distant | Git local pur, indépendant de la plateforme (`gh` / `glab` optionnels) |
| Contournable par | Les utilisateurs disposant de droits administrateur | Quiconque travaille hors de l'environnement d'agent, ou un agent malveillant déterminé |

Pourquoi cela compte : la protection de branches répond à la question *« Ce push peut-il avoir lieu ? »* ; ce plugin répond à la question *« Cet agent a-t-il le droit d'entrer dans ce rôle au vu de la configuration ? »*. La configuration la plus solide combine **les deux** — le plugin maintient la discipline du flux chez les agents, et la protection de branches serveur garantit que personne, humain ou agent, ne pousse directement sur une branche protégée.

---

## Comment ça marche — Le mécanisme en trois lignes

1. Un agent appelle un outil shell (`pwsh` / `bash`) avec une commande Git.
2. Le plugin classifie la commande, résout les rôles de branches d'après `gitflow-guard.config.json` et applique la matrice de décision.
3. Violation → l'appel d'outil est **rejeté avant son exécution**, avec le motif et l'action corrective. Autorisé → la commande s'exécute normalement ; chaque refus est consigné dans le journal utilisateur (`~/.local/state/gitflow-guard/repos/<repo>-<hash>/audit.jsonl`).

Aucune confirmation par chat ni magasin de jetons d'autorisation : les fusions sensibles (production / archive) sont simplement **réservées à l'humain** — l'agent peut préparer la PR/MR, mais le clic de validation finale vous appartient.

### Principes de conception — Pourquoi cela fonctionne

#### 1. La configuration est la source unique de vérité

Aucun nom de branche ni aucune règle n'est codé en dur. `integration` est fourni comme valeur intégrée par défaut (`develop`) ; `preview` / `production` / `archive` sont des tableaux optionnels de noms exacts ou de regex, chacun doté de ses paramètres `update` et `mergeBy` — fusionnés en profondeur sur les valeurs par défaut. Le même binaire s'adapte aussi bien à un dépôt individuel avec `develop` qu'à un pipeline d'entreprise multi-environnements.

#### 2. Le blocage a lieu avant l'exécution, pas après

Le plugin s'accroche au pipeline d'outils au niveau de `tools/pre-execute` — le point de décision exécuté *avant* la transmission de la commande. Un refus `deny` à cet endroit garantit que la commande **ne s'exécute jamais** ; l'agent ne reçoit que le message de rejet. Une détection a posteriori (analyse des logs après coup) ne peut pas servir de garde-fou — les dégâts seraient déjà causés.

#### 3. Les fusions sensibles sont infalsifiablement humaines

Aucun code du plugin ne décide si « cette fusion est acceptable » pour la production ou l'archive. La barrière refuse purement et simplement de laisser un *agent* exécuter ces fusions. La seule voie possible est donc une page de PR/MR sur laquelle **vous** cliquez sur fusionner — et ce clic constitue la validation. Il n'existe aucun token, autorisation ou message de chat qu'un agent pourrait forger pour outrepasser cette étape.

---

## Référence de configuration

### Valeurs par défaut intégrées et surcharge par fusion profonde

Le garde est **activé par défaut** — aucun fichier `gitflow-guard.config.json` n'est nécessaire. Il protège :

| Valeur par défaut | Rôle | Règle |
|---|---|---|
| `develop` | **integration** | Pas de push direct ; mise à jour via PR/MR (`update: "pr"`) |
| `main` | **archive** | Pas de push direct / pas de fusion par l'agent ; la fusion d'archive vous revient (`mergeBy: "user"`) |

Lorsque vous créez un fichier `gitflow-guard.config.json`, ses champs sont **fusionnés en profondeur sur les valeurs par défaut** : chaque champ ou rôle que vous déclarez remplace la valeur par défaut correspondante, et tout ce que vous ne précisez pas conserve sa valeur par défaut. Ne déclarez que ce que vous souhaitez modifier :

```jsonc
{
  "branches": { "production": ["release-[\\w-]+"] }  // conserve develop+main par défaut ; ajoute production
}
```

**Désactiver entièrement** (flux Trunk-based / mono-branche) : `{ "enabled": false }`. Corriger un blocage involontaire ne nécessite la modification que d'un seul fichier, et `gitflow-guard status` indique en permanence la configuration appliquée (y compris s'il s'agit des valeurs par défaut).

### Rôles de branches — Le modèle sous-jacent aux vérifications

Un **rôle** associe des noms de branches (ou regex) à un jeu de règles. `integration` est fourni par les valeurs par défaut ; tous les autres rôles sont optionnels.

```text
branches feature ──(libre)──> integration (branche d'intégration ; MAJ via PR/MR)
                                    │
                                    ├──> preview (optionnel ; environnements ; MAJ via PR/MR)
                                    │
                                    └──> production (optionnel ; PR/MR + fusion par vous uniquement)
archive (optionnel ; archivage manuel après release)
```

| Rôle | Clé de configuration | Requis ? | Comportement appliqué |
|---|---|---|---|
| **feature** | `featurePattern` | — | Libre : commit / push / synchronisation / rebase |
| **integration** | `branches.integration` | Par défaut (`develop`) | Pas de push direct (défaut `pr`) ; intégration des features via PR/MR |
| **preview** | `branches.preview` (tableau) | Optionnel | Pas de push direct ; mises à jour via PR/MR uniquement (environnements) |
| **production** | `branches.production` (tableau) | Optionnel | PR/MR uniquement ; fusion par l'utilisateur uniquement (`mergeBy: "user"`) |
| **archive** | `branches.archive` (tableau) | Par défaut (`main`) | L'agent peut créer des PR/MR vers l'archive ; la fusion reste strictement manuelle |

### Personnalisation des noms et règles de branches — Toute convention fonctionne

**Petite équipe (solo / 2–3 dévs) — minimaliste : intégration seule :**

```jsonc
{
  "enabled": true,
  "featurePattern": "feature/[\\w-]+",
  "branches": { "integration": ["develop"] }
}
```

**Équipe plus large (multiples environnements de test + production + archive) :**

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

### Référence complète des champs

```jsonc
{
  "enabled": true,                     // true par défaut — définir sur false pour désactiver le garde
  "featurePattern": "feature/[\\w-]+", // Regex JS pour identifier vos branches de travail/feature
  "branches": {
    "integration": { "branches": ["develop"], "update": "pr" },  // défaut: ["develop"] — omettre pour conserver
    "preview":     { "branches": ["ita1"], "update": "pr" },     // optionnel
    "production":  { "branches": ["prd"], "update": "pr", "mergeBy": "user" }, // optionnel
    "archive":     ["main"]                                      // optionnel
  },
  "worktree": {                        // optionnel: garde de l'arbre de travail et de la base amont
    "requireCleanOnPr": false,         // exige un état propre (staged/unstaged) avant de créer une PR (défaut false)
    "requireCleanOnMerge": false,      // exige un arbre de travail propre avant de fusionner (défaut false)
    "allowUntracked": true,            // autorise les fichiers non suivis (??); false bloque en leur présence (défaut true)
    "requireUpstreamSynced": false     // exige la synchronisation avec la base amont avant de créer une PR (défaut false)
  },
  "locale": "en",                      // optionnel: langue des messages — toute locale enregistrée ('en'/'zh' intégrées) ; les valeurs inconnues avertissent dans status et basculent sur l'anglais
  "strict": false,                     // optionnel: fail-closed — les erreurs de config / internes bloquent au lieu d'avertir et d'autoriser
  "ci": { "enabled": true }            // optionnel: contrôles gh pr journalisés à titre indicatif
}
```

- Les rôles acceptent soit un **tableau** (raccourci), soit un **objet** `{ branches, update?, mergeBy? }`.
- `update` : `pr` (par défaut) = mise à jour via PR/MR uniquement ; `flexible` = autorise les fusions directes/locales (petites équipes).
- `mergeBy` (production) : `user` (par défaut) = seul l'humain clique sur fusionner ; `anyone` = autorise la fusion de la PR par l'agent.
- **Garde de l'arbre de travail et de la base amont (`worktree`)** : vérifications optionnelles d'état et d'écart —— `requireCleanOnPr: true` bloque la création de PR en cas de modifications non validées (staged/unstaged) ; `requireCleanOnMerge: true` bloque les fusions locales et de PR sur un arbre de travail sale ; `allowUntracked` (`true` par défaut) autorise les fichiers non suivis (`??`) sans friction, ou peut être défini sur `false` pour une collaboration humain-agent stricte ; `requireUpstreamSynced: true` bloque la création de PR lorsque la branche est en retard sur la base amont. Pour les commandes composées multi-segments (ex. `git add . && git commit && gh pr create`), un état propre est simulé dynamiquement pour les segments suivants.
- Chaque entrée de branche est un nom exact ou une regex (détecté automatiquement). **Sécurité des regex** : les motifs de branches sont rédigés par vos soins et compilés tels quels — évitez les structures à rétrogradation catastrophique (ex. quantificateurs imbriqués comme `(\w+)+`) dans `featurePattern` et les déclarations de branches.
- **Langue** : les messages sont en anglais par défaut ; ajoutez `"locale": "zh"` pour le chinois, ou passez `--locale <en|zh>` à n'importe quelle sous-commande `gitflow-guard` (priorité : drapeau CLI > config projet > anglais). Tout le texte destiné à l'utilisateur suit la locale — y compris les messages du framework CLI comme `--help`, les avertissements de commande inconnue et la ligne d'audit vide.
- **Locales personnalisées** : les paquets dépendants peuvent ajouter une langue à l'exécution — `import { registerLocale } from 'agents-gitflow-guard'`, appelez `registerLocale('fr', frDict)` avec un dictionnaire couvrant exactement les mêmes clés que l'anglais intégré (validé à l'enregistrement), puis définissez `"locale": "fr"` dans la configuration du projet pour l'activer.

  ```js
  import { registerLocale, MESSAGE_KEYS } from 'agents-gitflow-guard'
  // MESSAGE_KEYS liste toutes les clés qu'un dictionnaire doit définir (identique à l'anglais intégré) ;
  // l'enregistrement lève une erreur si une clé est manquante ou superflue.
  const fr = { /* une entrée par clé MESSAGE_KEYS, ex. */ 'deny.header': ({ why }) => `[gitflow-guard] bloqué : ${why}` }
  registerLocale('fr', fr)
  ```
- **Locales inconnues** : une valeur `"locale"` non enregistrée bascule silencieusement sur l'anglais lors de l'interception (choix de conception — les hooks ne se bloquent jamais pour un libellé manquant), ce qui rend les fautes de frappe faciles à omettre ; un avertissement d'une ligne s'affiche alors dans `gitflow-guard status`.
- **Validation** : les entrées de rôles qui se chevauchent sont rejetées ; les regex invalides sont rejetées. **Toute erreur de configuration replace le projet en état « non activé »** (avec rapport) plutôt que d'appliquer une configuration bancale ; notez que surcharger un rôle avec le même nom de branche qu'un rôle par défaut (ex. mapper `main` sur integration alors que l'archive par défaut est toujours `main`) génère une erreur de chevauchement — surchargez ou supprimez également l'autre rôle.
- **Mode strict** : par défaut, une configuration corrompue affiche un avertissement sur stderr une seule fois et laisse passer la commande (fail-open, pour éviter qu'une coquille ne bloque vos outils). `"strict": true` transforme les erreurs de configuration et internes en **blocage** (fail-closed) — recommandé pour les dépôts critiques. Un `enabled: false` explicite reste silencieux ; un fichier *absent* n'est plus une erreur — les réglages par défaut intégrés (develop+main) s'appliquent.

---

## Matrice de décision — Ce qui est bloqué, ce qui passe

| Action de l'agent | Décision |
|---|---|
| Commit / push de feature / sync / rebase / commandes en lecture seule | ✅ allow (autorisé) |
| Push direct / force-push / suppression de integration / preview / production / archive | 🚫 block (bloqué ; push direct autorisé si integration/preview configuré en `flexible`) |
| PR/MR : feature → integration / preview | ✅ allow (autorisé) |
| PR/MR : feature → production | ✅ Création autorisée ; **Fusion bloquée** (vous fusionnez dans l'UI) |
| PR/MR vers archive | ✅ Création autorisée ; 🚫 Fusion bloquée (vous fusionnez dans l'UI) |
| `git merge feature/x` localement en étant sur integration / preview | 🚫 block (PR/MR requis) ; `update: flexible` l'autorise |
| Commandes enchaînées (`checkout develop && merge feature/x`) | 🚫 block — les changements de branche sont simulés par segment, aucun contournement possible |
| Forcer la recréation d'une branche protégée (`git checkout -B/-C <branche>` / `git switch -C`) | 🚫 block (barrière de mise à jour directe de ref) |
| Rediriger/supprimer une branche protégée via `git symbolic-ref` | 🚫 block (barrière de mise à jour directe de ref) |
| `git cherry-pick` / `git revert` sur integration / preview / production / archive | 🚫 block (réécriture d'historique sur branche protégée) ; `-n` / `--no-commit` et `--abort`/`--continue`/`--skip`/`--quit` sont autorisés |
| Commandes Git encapsulées avec `sudo` (enveloppe de privilèges) | 🚫 Enveloppe retirée (`sudo -u …` compris), commande sous-jacente évaluée |

> Deux exemptions délibérées pour éviter qu'elles ne soient « verrouillées » par erreur ultérieurement : `git tag -f` (déplacer un tag, même pointant sur une branche protégée) reste exempté — les tags sont hors du périmètre des rôles de branches, tout comme `push --tags` ; et un simple `git commit` sur une branche protégée reste autorisé — le garde régit les rôles de branches et les chemins d'intégration, pas le contenu, et le `git push` ultérieur restera bloqué (le dépôt distant reste intact).

La cible des PR/MR est résolue via `gh pr view` (GitHub) ou `glab mr view` (GitLab). En l'absence de CLI de plateforme, le plugin adopte une approche prudente.

---

## Là où l'humain garde le contrôle

- **La fusion vers production** et **l'archivage** sont réservés à l'humain par défaut : un agent peut aider à préparer la PR/MR, mais **c'est vous qui cliquez sur le bouton de fusion** — ce clic *constitue* la confirmation. Il n'existe aucun magasin de permissions distinct pour déléguer cette décision.
- Chaque refus est consigné dans le journal d'audit utilisateur pour consultation ultérieure (`gitflow-guard audit`).

---

## Installation détaillée

**Prérequis** : **Node.js ≥ 22** présent dans votre `PATH` (palier minimal spécifié dans les `engines` du paquet et étage le plus bas de la matrice CI). Tous les clients exploitent **le même paquet npm** `agents-gitflow-guard` — seule l'étape de montage et de liaison diffère.

| Type de client / Plateforme | Commande d'installation | Étape de montage et liaison |
|---|---|---|
| Claude Code · Codex · OpenCode · Antigravity | `npm i -g agents-gitflow-guard` | `gitflow-guard wire --client <nom> --project --yes` |
| DeepSeek Harness (DSH) | `dsh plugin --profile web add agents-gitflow-guard` | Redémarrer DSH — le plugin se monte automatiquement en couche de profil |
| Pi | `npm i -D agents-gitflow-guard` | Copier `pi/gitflow-guard.ts` dans `.pi/extensions/` |

### 1. Clients Hook CLI autonomes (Claude Code · Codex · OpenCode · Antigravity)

Installez la CLI globalement une seule fois, puis **liez chaque client avec une commande unique** (le garde est actif par défaut via sa configuration intégrée, la liaison est donc la seule étape restante) :

```bash
npm i -g agents-gitflow-guard   # fournit le binaire `gitflow-guard`
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

`wire` lit le fichier de configuration existant (le cas échéant), insère l'entrée du hook sans altérer le reste, est idempotent (déjà lié → ignoré), supporte `--dry-run` pour prévisualiser et `--unwire` pour supprimer, et demande confirmation avant de modifier les fichiers `--global`. Les fichiers exacts qu'il écrit (pour référence et pour configuration manuelle sans passer par `wire`) sont :

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

### 2. Plugins et extensions internes au processus (DSH · Pi)

- **DeepSeek Harness (DSH)** :
  ```bash
  dsh plugin --profile web add agents-gitflow-guard
  ```
  Redémarrez ensuite DSH. Le paquet déclarant `dsh.bundle.patch`, la commande `dsh plugin add` le monte automatiquement comme couche de profil sans nécessiter de modification manuelle. Les mises à jour s'effectuent via la même commande suivie d'un redémarrage.

- **Pi** :
  Pi charge les extensions en mémoire dans le même processus (pas de payload stdin, pas de hook de sous-processus). Installez le point d'entrée distribué dans le projet et conservez le paquet dans les devDependencies :
  ```bash
  npm i -D agents-gitflow-guard
  mkdir -p .pi/extensions
  cp node_modules/agents-gitflow-guard/pi/gitflow-guard.ts .pi/extensions/gitflow-guard.ts
  ```
  Configurez `.pi/settings.json` :
  ```jsonc
  // Pi — .pi/settings.json (les extensions se résolvent relativement à .pi)
  { "extensions": ["extensions/gitflow-guard.ts"] }
  ```

### 3. Depuis les sources et développement local

Pour les contributeurs ou développeurs souhaitant tester et déboguer directement depuis les sources :

```bash
# Cloner et compiler
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build
```

Montez le build local sur la plateforme d'agent ciblée :

```bash
# A. Clients Hook CLI autonomes (Claude Code · Codex · OpenCode · Antigravity)
npm link # ou npm install -g .
gitflow-guard wire --client <claude|codex|opencode|antigravity> --project --yes

# B. DeepSeek Harness (DSH)
dsh plugin --profile web add file:/chemin/vers/AgentsGitFlowController
# ou exécuter : node scripts/install-dsh.mjs web (redémarrer DSH ensuite)

# C. Pi
npm link
# ou copier le fichier pi/gitflow-guard.ts du dépôt directement dans .pi/extensions/
```

### 4. Note sur GitHub Copilot

**GitHub Copilot — délibérément aucun hook ici.** Copilot intègre ses propres mécanismes de garde-fous pour cet usage précis : permissions **allow/deny/ask** par outil et règles de projet **rules** (`rules.json` + `AGENTS.md`). Orientez les utilisateurs de Copilot vers la documentation officielle plutôt que vers un hook de plugin :

- [Autoriser et refuser l'utilisation des outils (GitHub Docs)](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools)
- [Ajout de règles personnalisées pour l'agent de codage Copilot (GitHub Docs)](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-rules-for-the-copilot-coding-agent)
- Optionnel : Copilot dispose également d'un [système de hooks](https://docs.github.com/en/copilot/reference/hooks-reference) (`preToolUse` → `permissionDecision:"deny"`) si vous souhaitez une interception au niveau des commandes.

### 5. Mécanisme de Hook et notes techniques

- **Protocole de plateforme** : Le hook lit le payload sur stdin et répond selon le protocole de chaque plateforme :
  - **Claude Code / OpenCode** : `exit 2` (stderr contient le motif et les instructions pour continuer).
  - **Codex** : JSON sur stdout `{"hookSpecificOutput":{"permissionDecision":"deny",...}}`.
  - **Antigravity** : JSON sur stdout `{"decision":"deny","reason":...}` avec `exit 0` (Antigravity impose un code de retour 0).
  - **Pi** : Extension en processus écoutant l'événement `tool_call` et rejetant via `{ block: true, reason }`.
- **Exécution avant outil (Pre-tool)** : Seul l'événement précédant l'outil est intercepté ; le garde bloque *avant* l'exécution des commandes, éliminant le besoin de hooks postérieurs ou d'étapes de nettoyage de permissions.
- **Résolution du binaire dans le PATH** : L'installation globale (`npm i -g`) fournit le binaire `gitflow-guard`. Si l'exécuteur de votre agent n'hérite pas de votre `PATH` interactif, utilisez le chemin absolu renvoyé par `npm bin -g`.
- **Activé par défaut** : Les valeurs par défaut intégrées (`integration: ["develop"]`, `archive: ["main"]`) prennent effet sans aucun fichier de configuration. Les configurations personnalisées dans `gitflow-guard.config.json` sont appliquées par fusion profonde sur ces valeurs.
- **Liaison non destructive** : `gitflow-guard wire` fusionne les configurations de hooks de manière idempotente sans modifier les hooks existants, et `wire --unwire` retire uniquement l'entrée du garde.

---

## FAQ

### Mes branches ne suivent pas les noms par défaut — puis-je l'utiliser ?

Oui — aucun nom de branche n'est imposé. `integration` est fourni par défaut (`develop`) et toute configuration personnalisée s'y superpose par fusion profonde ; ses entrées (ainsi que celles de `preview` / `production` / `archive`) peuvent être des noms exacts ou des expressions régulières de votre choix. `featurePattern` indique au plugin comment reconnaître vos branches de travail.

Une équipe nommant sa branche d'intégration `master`, ajoutant une prévisualisation `beta` et préfixant ses branches de fonctionnalités par `fix/` l'indique simplement dans la configuration ; chaque blocage, rapport et audit utilisera alors ces dénominations. Aucune convention ne vous est imposée — vous déclarez simplement votre propre correspondance. Voir [Personnalisation des noms et règles de branches](#personnalisation-des-noms-et-règles-de-branches--toute-convention-fonctionne).

---

### Ai-je vraiment besoin de preview / production / archive ?

Non. N'ajoutez que les rôles qui existent réellement dans votre organisation. Un dépôt individuel utilisant uniquement `develop` configurera `integration: ["develop"]` et rien d'autre ; une entreprise gérant dix environnements ajoutera le tableau `preview` et un rôle `production`. Le reste reste désactivé.

---

### Est-ce un outil de sécurité ?

Non, et il est essentiel de ne pas le considérer comme tel. Il s'agit d'un garde-fou de flux de travail (workflow guard) : il rend un processus convenu mécaniquement contraignant. La reconnaissance textuelle des commandes s'effectue par nature au mieux (best-effort) — un agent déterminé à masquer une commande peut contourner l'analyseur syntaxique.

Dans le périmètre des formes de commandes prises en charge, la frontière des rôles est appliquée localement : fusionner vers une branche à rôle protégé (integration / preview / production / archive) requiert le chemin configuré (PR/MR, ou fusion humaine pour production/archive). Les enveloppes d'obfuscation classiques sont classifiées et bloquées — wrappers shell (`sh -c` / `bash -lc`), sous-shells et imbrications par accents graves/`$()`, préfixes `env`/`command`/`nohup`/`xargs`/`sudo` et affectations `VAR=x`, chemins absolus, pipelines et segments `||`, options globales Git (`-C .`, `--git-dir=…`), refspecs avec jokers (`refs/heads/*:refs/heads/*`), `git pull` employé en guise de fetch+merge, ainsi que les commandes de plomberie `send-pack`/`update-ref`/`symbolic-ref` ; la recréation forcée d'une branche protégée (`checkout -B`/`switch -C`) et le cherry-pick/revert sur une branche protégée sont bloqués par les barrières de mise à jour et de déplacement de références. Le corpus de tests contradictoires exécutable se trouve dans `tests/accuracy-audit.spec.ts`.

Ce qui reste **non défendable localement** : les appels directs aux API de forge (`gh api repos/…/pulls/N/merge`, `curl`) et les commandes exécutées dans des sous-processus d'interpréteurs (`node -e "child_process.exec('git push …')"`) ; les niveaux d'échappement ou d'encodage arbitrairement profonds restent par essence du ressort du best-effort ; au-delà de 10 niveaux, les imbrications de `$()` ou de backticks ne sont plus développées (l'analyseur arrête le développement au lieu de planter sur une charge pathologique). La frontière infranchissable véritable réside dans les règles de protection de branches configurées sur votre service d'hébergement. Utilisez les deux — considérez ce garde comme un outil de rétroaction instantanée et de traçabilité d'audit, non comme un périmètre de sécurité absolu.

---

### Pourquoi l'agent ne peut-il pas fusionner lui-même vers production / archive ?

Parce que la barrière classe ces opérations comme étant **réservées à l'utilisateur**. Le plugin refuse la *fusion* vers production et archive — la création d'une PR/MR reste autorisée, permettant à un agent de préparer une PR d'archivage `develop` → `main` à votre intention. Cependant, la fusion effective ne dispose que d'une seule voie d'accès : **votre** clic de validation — il n'existe aucune autorisation, jeton ou message textuel qu'un agent pourrait invoquer pour s'octroyer ce pouvoir.

---

### Ai-je besoin de la CLI `gh` ou `glab` ?

Non. Ce sont des adaptateurs facultatifs servant uniquement à déterminer la cible d'un `pr merge` / `mr merge`, afin que la barrière puisse distinguer « fusion vers integration/preview » (autorisée) de « fusion vers production/archive » (bloquée). Lorsque ni l'un ni l'autre des CLI ne peut confirmer la cible — absent, non authentifié, hors ligne ou requête échouée —, la barrière **refuse la fusion**, y compris lorsqu'elle est lancée depuis une branche de fonctionnalité : cette PR pourrait en effet cibler production ou archive. Réessayez une fois la CLI opérationnelle, ou effectuez la fusion manuellement. Tout le reste fonctionne de manière identique. La vérification centrale n'interroge jamais aucun service d'hébergement, garantissant un comportement rigoureusement identique sur GitHub, GitLab, instances auto-hébergées ou hors ligne.

---

### Cela va-t-il bloquer mon travail normal ?

Délibérément, non. Toutes les opérations normales sur une branche de fonctionnalité — committer, pousser, synchroniser depuis `integration`, rebaser, inspecter via des commandes en lecture seule, exécuter `gitflow-guard status` — sont permises en toute transparence.

Les blocages sont strictement réservés à : (1) l'écriture directe sur des branches à rôles protégés, et (2) la tentative par un agent de fusionner vers la production ou l'archive. Si vous constatez un blocage que vous estimez injustifié, lancez `gitflow-guard status` — la commande affiche précisément le rôle attribué à chaque branche locale, rendant toute anomalie d'évaluation immédiatement visible et rectifiable.

---

### Que se passe-t-il si ma configuration contient une erreur ?

Une configuration incertaine ou mal renseignée n'est jamais appliquée par défaut : la moindre erreur de validation désactive le garde pour le projet concerné et consigne les erreurs.

Erreurs fréquentes : redéfinir un rôle avec le même nom de branche qu'un rôle par défaut (par exemple assigner `main` à integration alors que l'archive par défaut est toujours `main` — ce qui constitue une erreur de chevauchement explicite ; il convient de redéfinir ou de retirer l'autre rôle également), assigner une même branche à deux rôles différents (rejeté), ou fournir un `featurePattern` invalide (rejeté pour regex incorrecte). Le message d'erreur est explicite et le fichier ne comporte qu'un unique objet JSON, ce qui permet généralement une correction en moins de trente secondes.

---

### Qu'est-ce qui est exactement vérifié dans le dépôt local ?

La branche courante (`git branch --show-current`), et — uniquement lors d'un `pr merge` / `mr merge` — la cible de la PR/MR via `gh pr view` / `glab mr view`. Aucune analyse d'arborescence généalogique n'est nécessaire, le modèle étant **piloté par les rôles** (détermination de la branche cible) et non par l'ordre chronologique des commits.

Aucune donnée n'est écrite, aucun serveur distant n'est contacté et aucune fonctionnalité spécifique de plateforme d'hébergement n'est requise pour les vérifications fondamentales. Les fusions vers production/archive sont simplement refusées aux agents ; la validation humaine se déroule dans votre interface utilisateur.

---

### Licence / Coût ?

MIT, gratuit, libre de droits. Utilisez-le, modifiez-le, distribuez-le — la seule condition est de conserver la mention de copyright.

S'il vous évite un incident de production ou un raccourci malheureux, le bouton pour offrir un café en haut de cette page est apprécié mais nullement obligatoire. Voir [Licence](#licence).

---

## Glossaire

| Terme | Définition |
|---|---|
| **integration** | Rôle fondamental (valeur intégrée par défaut : `develop`) ; les features y sont intégrées via PR/MR ; protégé |
| **preview** | Branches optionnelles d'environnements de test (`branches.preview`, tableau) ; mises à jour via PR/MR uniquement |
| **production** | Branches optionnelles de production (`branches.production`, tableau) ; PR/MR + fusion exclusivement humaine |
| **archive** | Branche optionnelle d'archivage post-release (`branches.archive`, tableau) ; les agents peuvent y ouvrir des PR/MR, mais la fusion reste manuelle |
| **feature branch** | Votre branche de travail, reconnue par `featurePattern` ; zone libre de contraintes |
| **gate matrix** | Table de décision associant chaque commande classifiée à une issue d'autorisation ou de rejet |
| **pre-execute** | Point d'ancrage du pipeline d'outils où s'opère le blocage — avant l'exécution effective de la commande |
| **merge-by-user** | Principe selon lequel les fusions en production/archive restent entre vos mains — votre clic sur la PR/MR constitue la confirmation |

---

## Feuille de route

Fonctionnalités futures et axes de recherche actuellement explorés :

- **Intégrations de nouveaux agents** : étude et adaptation aux nouveaux systèmes de hooks/extensions d'agents (ex. Cursor, Windsurf, nouveaux CLI d'agents).
- **Agrégation d'audits** : synchronisation des journaux d'audit entre machines et formats d'export de conformité pour les équipes.
- **Préréglages de flux** : préréglages de configuration prêts à l'emploi pour les modèles de branches courants (Trunk-based development, déploiements multi-environnements d'entreprise).
- **Verrouillage strict en CI** : hooks natifs pour pipelines CI et intégration des vérifications de PR tout en conservant une exécution locale sans dépendance.

Pour consulter la liste des fonctionnalités publiées et l'historique des versions, voir [CHANGELOG.md](CHANGELOG.md).

---

## Développement

```bash
npm install
npm test              # tests unitaires : classify / gate / config / cli / repo / platform / i18n / index / accuracy-audit / pi
npm run typecheck     # tsc --noEmit, 0 erreur
npm run build         # tsdown → lib/ (la CLI et le plugin partagent le build)
npm run check:pins    # vérifie la cohérence de version entre package.json, les titres de CHANGELOG et les exemples dans les README
npm run verify:matrix # régression multi-agents continue : logique DSH + locale zh + hooks multi-clients + extension Pi
```

- **Règle de qualité** : toute modification logique exige une vérification de types sans erreur (0 erreur), l'ensemble des tests au vert et une validation complète de `verify:matrix`.
- **Ajout de clients** : lors de l'ajout d'une nouvelle plateforme d'agent, suivez rigoureusement la liste de contrôle de synchronisation dans [AGENTS.md](AGENTS.md) §8.

---

## Support

Ce plugin est gratuit et open source (MIT). S'il vous a épargné, à vous ou à votre équipe, les conséquences d'un raccourci mal maîtrisé, un café est toujours apprécié :

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/keanz21)

---

## Licence

[MIT](LICENSE) © FeatureAgents
