# agents-gitflow-guard

> **Vous en avez assez que les agents IA contournent votre GitFlow ?**

Un garde-fou configurable pour les rôles de branches Git, conçu pour les agents de codage IA — [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH), Claude Code, Codex, OpenCode, Antigravity et Pi.  
Définissez vos propres branches — **integration** (les fonctionnalités sont intégrées via PR/MR), **preview** (environnements de test), **production**, **archive** — chacune avec ses propres règles. Les agents ne peuvent pas contourner le processus et les fusions sensibles restent sous contrôle humain.

[English](README.md) · [简体中文](README.zh.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Licence](LICENSE)

[![ko-fi](https://img.shields.io/badge/ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## Table des matières

- [Démarrage rapide — 30 secondes pour protéger un dépôt](#démarrage-rapide--30-secondes-pour-protéger-un-dépôt)
- [Pourquoi — Le problème résolu par ce plugin](#pourquoi--le-problème-résolu-par-ce-plugin)
- [Pour qui — Cas d'usage et équipes](#pour-qui--cas-dusage-et-équipes)
- [Fonctionnalités — Ce que fait le plugin](#fonctionnalités--ce-que-fait-le-plugin)
- [Ce que le plugin ne fait PAS — Limites](#ce-que-le-plugin-ne-fait-pas--limites)
- [Protection côté serveur vs ce plugin](#protection-côté-serveur-vs-ce-plugin)
- [Fonctionnement — Le mécanisme en trois lignes](#fonctionnement--le-mécanisme-en-trois-lignes)
- [Référence de configuration](#référence-de-configuration)
- [Matrice de décision — Ce qui est bloqué ou autorisé](#matrice-de-décision--ce-qui-est-bloqué-ou-autorisé)
- [Le contrôle reste humain](#le-contrôle-reste-humain)
- [Installation détaillée](#installation-détaillée)
- [Foire aux questions (FAQ)](#foire-aux-questions-faq)
- [Glossaire](#glossaire)
- [Feuille de route](#feuille-de-route)
- [Support](#support)
- [Développement](#développement)
- [Licence](#licence)

---

## Démarrage rapide — 30 secondes pour protéger un dépôt

**Étape 1 — Installation.** Les six clients utilisent le même paquet npm `agents-gitflow-guard` :

```bash
# DSH — Plugin interne au processus (redémarrer DSH après installation)
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# Claude Code · Codex · OpenCode · Antigravity — Hooks autonomes (sans DSH)
npm i -g agents-gitflow-guard
```

```bash
# Pi — Extension interne
npm i -D agents-gitflow-guard
```

> **Remarque** : Une commande standard installe la dernière version. Pour figer une version spécifique, ajoutez `@<version>` (ex: `npm i -g agents-gitflow-guard@<version>`).

**Étape 2 — Connexion du client (aucun fichier de configuration requis).** Le plugin intègre des **valeurs par défaut qui protègent `develop` (intégration) + `main` (archive)** — activé d'office avec zéro configuration :

```bash
# Claude Code → .claude/settings.json de ce dépôt
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity (fichiers de configuration dédiés)
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# Aperçu sans écriture / Désinstallation / Assistant interactif :
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` insère la configuration de façon **non destructive** dans vos fichiers existants.

> ⚠️ **main est protégé par défaut.** Pour les flux de type Trunk-based (où tout le monde pousse sur une branche unique), désactivez le garde avec `{ "enabled": false }` dans `gitflow-guard.config.json`.

**Étape 3 — Vérification.** Demandez à l'agent d'exécuter `git push origin develop`. L'opération sera bloquée :

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

---

## Pourquoi — Le problème résolu par ce plugin

Les agents IA de codage travaillent directement dans votre dépôt. Les instructions dans les fichiers Markdown (`AGENTS.md`, `CLAUDE.md`, etc.) sont des **règles souples** : les modèles peuvent les ignorer ou les oublier.

Ce plugin transforme les consignes textuelles en **mécanismes rigides**. Toute commande Git exécutée par l'agent est interceptée et validée par rapport à l'état réel du dépôt local avant exécution.

---

## Fonctionnalités — Ce que fait le plugin

- **Blocage pré-exécution** : Pousser directement, forcer le push ou supprimer des branches protégées (integration, preview, production, archive) est bloqué.
- **Fusion par l'humain uniquement (Merge-by-user)** : Les agents peuvent créer des PR/MR vers la production et l'archive, mais la fusion effective est réservée à l'humain.
- **Journal d'audit inviolable** : Chaque refus est consigné dans `~/.local/state/gitflow-guard/` en dehors du dépôt.

---

## Matrice de décision — Ce qui est bloqué ou autorisé

| Action de l'agent | Décision |
|---|---|
| commit / push sur branche feature / rebase / sync | ✅ allow (autorisé) |
| Push direct / force push / suppression sur integration / preview / production / archive | 🚫 block (bloqué) |
| Création de PR/MR : feature → integration / preview | ✅ allow (autorisé) |
| Création de PR/MR : feature → production | ✅ Création autorisée ; **Fusion bloquée** (réservée à l'humain) |
| Création de PR/MR → archive | ✅ Création autorisée ; 🚫 **Fusion bloquée** (réservée à l'humain) |
| `git merge feature/x` localement sur integration / preview | 🚫 block (PR/MR requis) |
| `git checkout -B` / `git switch -C` ciblant une branche protégée | 🚫 block |
| Commandes Git encapsulées dans `sudo` | 🚫 Enveloppe retirée et commande sous-jacente vérifiée |

---

## Installation détaillée

**Prérequis** : **Node.js ≥ 22** dans votre `PATH`.

```bash
npm i -g agents-gitflow-guard
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

---

## Licence

[MIT](LICENSE) © FeatureAgents
