# agents-gitflow-guard

> **Você está cansado de agentes ignorando o seu GitFlow?**

Um guardião configurável de funções de branch para agentes de codificação por IA — [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), [Codex](https://github.com/openai/codex), [OpenCode](https://github.com/opencode-ai/opencode), [Antigravity](https://github.com/google-deepmind), [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) e [Pi](https://github.com/mariozechner/pi).
Você define suas próprias branches —
**integration** (features são mescladas via PR/MR), **preview** (endpoints de ambiente), **production**, **archive** — cada uma com suas próprias regras de atualização. Os agentes não conseguem contornar o fluxo, e os merges sensíveis permanecem em suas mãos.

[English](README.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-tw.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Русский](README.ru.md) · [Licença](LICENSE)

[![Support on Ko-fi](https://img.shields.io/badge/Support_on_Ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## Índice

- [Início Rápido — 30 segundos para proteger o repositório](#início-rápido--30-segundos-para-proteger-o-repositório)
- [Por que — O problema que este plugin resolve](#por-que--o-problema-que-este-plugin-resolve)
- [Para quem é indicado — Cenários e equipes](#para-quem-é-indicado--cenários-e-equipes)
- [O que ele faz — Recursos](#o-que-ele-faz--recursos)
- [O que ele NÃO faz — Limites reais](#o-que-ele-não-faz--limites-reais)
- [Proteção no lado do servidor vs este plugin](#proteção-no-lado-do-servidor-vs-este-plugin)
- [Como funciona — O mecanismo em três linhas](#como-funciona--o-mecanismo-em-três-linhas)
- [Referência de Configuração](#referência-de-configuração)
- [Matriz de Decisão (Gate Matrix) — O que é bloqueado e o que passa](#matriz-de-decisão-gate-matrix--o-que-é-bloqueado-e-o-que-passa)
- [Onde o humano mantém o controle](#onde-o-humano-mantém-o-controle)
- [Instalação Detalhada](#instalação-detalhada)
- [FAQ](#faq)
- [Glossário](#glossário)
- [Roadmap](#roadmap)
- [Desenvolvimento](#desenvolvimento)
- [Suporte](#suporte)
- [Licença](#licença)

---

## Início Rápido — 30 segundos para proteger o repositório

**Passo 1 — instalação.** Todos os seis clientes utilizam o mesmo pacote npm `agents-gitflow-guard` — escolha o modo de instalação correspondente ao seu agente:

```bash
# Modo A: Clientes Hook CLI (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# Modo B: Plugin in-process DSH (reinicie o DSH após a instalação; os plugins carregam na inicialização)
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# Modo C: Extensão in-process Pi
npm i -D agents-gitflow-guard
```

> **Nota**: Um comando simples `add` ou `npm i` instala a versão mais recente do registro npm. Se o espelho do seu registro tiver atraso de cache ou você precisar fixar uma versão específica, adicione `@<versão>` (ex.: `npm i -g agents-gitflow-guard@<versão>`). (Ao usar o DSH, o *aviso* de dependência de pares do pnpm é esperado — o DSH fornece `@deepseek-ai/cordis` / `@deepseek-ai/dsh-tools` através do fallback de módulos do perfil compartilhado em tempo de execução; o plugin funciona normalmente.)
>
> Clientes hook CLI executam um comando de conexão (wiring) após a instalação (veja o Passo 2); Pi copia um arquivo de extensão; DSH monta automaticamente na instalação do plugin.

**Passo 2 — conecte seu cliente (sem necessidade de arquivo de configuração).** O guardião vem com **padrões integrados que protegem `develop` (integration) + `main` (archive)** — zero configuração, ativo por padrão. A única coisa necessária é instruir o seu cliente de IA a invocar o guardião, com um único comando por cliente stdin-hook (o DSH é conectado automaticamente; o Pi apenas copia um arquivo, veja abaixo):

```bash
# Claude Code → .claude/settings.json deste repositório
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity (cada um com seu próprio arquivo de configuração; --yes ignora a confirmação y/N)
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# Pré-visualização (sem gravações) / remoção / guia interativo:
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

O comando `wire` realiza a mesclagem na sua configuração existente de forma **não destrutiva** (hooks já existentes permanecem intocados) e grava no **diretório do projeto por padrão** — `--global` (todos os repositórios nesta máquina) sempre solicita confirmação prévia ou requer `--yes`. Os arquivos e formatos de cada cliente estão descritos em [Instalação Detalhada](#instalação-detalhada).

> ⚠️ **main é protegido por padrão.** Usuários de fluxo baseado em tronco / branch única (onde todos realizam push direto em uma única branch) serão bloqueados em pushes diretos na `main` até desativarem a opção — crie `gitflow-guard.config.json` com `{ "enabled": false }` ou mapeie suas próprias branches (veja [Referência de Configuração](#referência-de-configuração)). `gitflow-guard status` repete este aviso sempre que os padrões integrados estão em vigor.

**Passo 3 — verificação.** Peça ao agente para executar `git push origin develop`. Espere que a chamada de ferramenta seja negada:

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

As mensagens são em inglês por padrão; crie uma configuração com `"locale": "zh"` para alternar para chinês — as mensagens serão exibidas como: *已拦截:受保护分支「develop」禁止直推 / 下一步:集成分支(develop)由 PR/MR 合入 feature……* (veja [Referência de Configuração](#referência-de-configuração)).

**Pronto.** O guardião está ativo para este repositório com os padrões integrados. Deseja mais estágios (`preview` / `production`) ou nomes de branches diferentes? Crie um arquivo `gitflow-guard.config.json` apenas com os campos que desejar alterar — tudo o mais manterá os padrões integrados. Para a tabela completa de decisões, consulte a [Matriz de Decisão (Gate Matrix)](#matriz-de-decisão-gate-matrix--o-que-é-bloqueado-e-o-que-passa).

### Demonstração completa — uma feature de ponta a ponta

Cenário: sua equipe entrega uma página de login (`feature/login-page`); `develop` é a branch de integração, `main` é o arquivo. O que você e o agente vivenciam a cada passo:

| # | o que o agente executa | decisão do plugin | o que você vê |
|---|---|---|---|
| 1 | `git checkout -b feature/login-page` (a partir de develop) | ✅ permitido (trabalho em feature é livre) | branch criada |
| 2 | `git add . && git commit -m "feat: login"` | ✅ permitido | commit realizado |
| 3 | `git push -u origin feature/login-page` | ✅ permitido (fazer push da sua feature é seguro) | push realizado |
| 4 | `git checkout develop && git merge feature/login-page` | 🚫 **negado** — branch de integração aceita apenas PR/MR | é necessário abrir uma PR/MR para develop |
| 5 | `gh pr create --base develop` | ✅ permitido (feature → integração via PR) | PR criada, você revisa e mescla |
| 6 | `git push origin main` ou merge em main | 🚫 **negado** — arquivo é apenas para ação humana | você mesmo arquiva develop → main após o release |

Observe o que o agente *não pode* fazer: mesclar uma feature diretamente na `develop`, ou tocar na `main` de qualquer forma. Cada merge sensível é uma ação humana deliberada na página do PR/MR ou no seu próprio terminal.

---

## Por que — O problema que este plugin resolve

Agentes de codificação por IA trabalham diretamente no seu repositório. Eles são *instruídos* — via prompts de sistema, arquivos de instruções de projeto (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules` e similares) e documentação de projeto — a seguir um fluxo de merge: desenvolver em uma branch de feature, mesclar na branch de integração (e nos estágios de preview/production, se houver) e deixar os merges de arquivo/produção para você.

**Isso é uma regra suave (soft rule).** Agentes pulam etapas, reordenam ou simplesmente "esquecem" dela — não por malícia, mas porque instruções textuais são tratadas como opcionais por um modelo.

Este plugin transforma a regra suave em um **mecanismo rígido (hard mechanism)**. Cada operação git que um agente tenta executar é validada contra o *estado real do seu repositório local*. Violações são bloqueadas antes que o comando seja executado, com uma explicação do motivo e do próximo passo a ser tomado.

Ninguém precisa se lembrar das regras — as regras são aplicadas compulsoriamente.

---

## Para quem é indicado — Cenários e equipes

### Sinais de que este plugin é para você

- Você tem — ou deseja ter — um fluxo de branches definido, desde uma única branch de integração no estilo `develop` até pipelines de preview/production em múltiplos estágios.
- Um agente já tentou pegar um atalho: fez push direto para uma branch protegida ou realizou merge onde não deveria. Se aconteceu uma vez, acontecerá novamente — este plugin é a correção estrutural.
- Você protege suas branches de integração/arquivo, mas não quer depender de revisão humana para detectar cada atalho.
- Múltiplas features se desenvolvem em paralelo e convergem em um único ambiente de preview compartilhado, e você quer que cada entrada em um estágio mais rigoroso seja revisada.

### Cenários concretos

1. **Desenvolvedor solo + agente em projetos de clientes.** Você entrega uma tarefa ao agente; ele tenta "ajudar" fazendo push direto na branch de integração. Com um pequeno arquivo de configuração, o agente fica fisicamente impedido de tocar em branches protegidas sem uma PR/MR — mesmo quando você não estiver supervisionando.
2. **Equipe pequena (3–10 pessoas) com preview implantado por CI.** O ambiente de homologação é implantado automaticamente no merge; um dia, um agente mesclou uma feature na `develop` sem revisão. A partir de então, cada entrada nos estágios protegidos exige uma PR/MR — um ato deliberado e auditado.
3. **Empresa com pipelines multi-ambiente.** Vários endpoints de preview combinados com linhas de produção e arquivo controladas — cada função é simplesmente configurada, e o guardião escala sem necessidade de regras adicionais.
4. **Colaboração assíncrona.** Você nem sempre está online. O guardião mantém a integridade do fluxo entre suas sessões; os merges de produção e arquivo continuam sendo exclusivamente seus.

**Não indicado para você** (veja também [O que ele NÃO faz — Limites reais](#o-que-ele-não-faz--limites-reais)):

- **Fluxo baseado em tronco (Trunk-based)** — todos realizam merge diretamente em uma única branch: o plugin bloquearia constantemente.
- **Repositório pessoal sem um fluxo definido** — nada a impor, nenhum valor agregado.
- **Uma equipe indisposta a atribuir funções às branches** — o plugin necessita de pelo menos uma branch `integration` para proteger.

---

## O que ele faz — Recursos

- **Bloqueia antes da execução**: push direto / force-push / exclusão de branches de funções protegidas (integration / preview / production / archive); tentativa de merge do agente em production ou archive.
- **Baseado em funções, totalmente configurável**: `integration` (padrão integrado: `develop`) é a função principal; `preview` / `production` / `archive` são arrays opcionais de nomes de branches ou expressões regulares, cada um com suas próprias regras de atualização (`pr` / `flexible`, `mergeBy`).
- **Merge pelo usuário onde é crítico (Merge-by-user)**: os merges de produção e arquivo permanecem em suas mãos — o plugin impede o agente de clicar em merge, garantindo que sua ação *seja* a confirmação definitiva.
- **Compatível com qualquer nomenclatura**: os nomes das branches são mapeados pela sua configuração, nunca fixados em código (veja [Referência de Configuração](#referência-de-configuração)).
- **Totalmente auditado**: cada bloqueio é registrado em um log de auditoria no diretório de estado do usuário (`~/.local/state/gitflow-guard/`, `%LOCALAPPDATA%\gitflow-guard` no Windows) — fora do repositório, nunca commitado, fora da sandbox gravável pelo agente e compartilhado entre todos os worktrees vinculados a um repositório.
- **Núcleo independente de plataforma**: git puramente local; opcionalmente consulta `gh` (GitHub) ou `glab` (GitLab) para resolução de destino de PR/MR, funcionando perfeitamente sem eles.

---

## O que ele NÃO faz — Limites reais

- **Não é uma barreira de segurança absoluta.** A análise de comandos é feita com o melhor esforço (best-effort); um agente determinado a ofuscar comandos pode burlar a análise textual.
- **Não atua como portão em plataformas de CI.** O status da CI é registrado apenas como referência, nunca como uma barreira rígida. A proteção real de branches pertence às configurações do GitHub/GitLab, que podem ser combinadas em camadas.
- **Não substitui o fluxo em si.** Seu projeto precisa ter pelo menos uma branch `integration`; se todos realizam push direto em uma única branch, este plugin bloqueará constantemente — não o ative nesse cenário.
- **Produção e arquivo não são automatizados** — eles são deixados deliberadamente para o seu clique humano; o plugin apenas diz "não" aos agentes.

---

## Proteção no lado do servidor vs este plugin

A proteção de branches no lado do servidor (regras de branch do GitHub, branches protegidas do GitLab) e este plugin resolvem **problemas distintos**. Eles são complementares, não concorrentes.

| dimensão | proteção no lado do servidor | este plugin |
|---|---|---|
| o que governa | *quem* pode fazer push / merge em branches protegidas (permissões) | *como* os agentes entram no fluxo (fluxo de trabalho) — em qual função o merge incide |
| impede agentes de mesclarem em produção/arquivo | não — não consegue distinguir "foi um agente que fez" | sim — merges em produção/arquivo são bloqueados para agentes por padrão |
| flexibilidade por função | uma regra por branch no host | `update` (`pr`/`flexible`) + `mergeBy` (`user`/`anyone`) por função em um único arquivo de configuração |
| escopo | todos os usuários do repositório, incluindo humanos | agentes DSH com o plugin configurado (humanos não têm restrições) |
| ponto de aplicação | no lado do servidor, no momento do push / merge | localmente, antes da execução do comando |
| plataforma | vinculada ao serviço de hospedagem | git puramente local, independente de plataforma (`gh` / `glab` opcionais) |
| contornável por | usuários com privilégios de administrador | qualquer pessoa operando fora do DSH, ou um agente malicioso determinado |

Por que isso é relevante: a proteção de branches responde *"este push pode acontecer?"*; este plugin responde *"este agente pode acessar esta função, de acordo com a configuração?"*. A configuração mais segura utiliza **ambos** — o plugin mantém os agentes alinhados ao fluxo de trabalho, e a proteção de branches garante que ninguém, agente ou humano, faça push direto em uma branch protegida.

---

## Como funciona — O mecanismo em três linhas

1. Um agente invoca uma ferramenta de shell (`pwsh` / `bash`) com um comando git.
2. O plugin classifica o comando, resolve as funções das branches a partir de `gitflow-guard.config.json` e aplica a matriz de decisão.
3. Violação → a chamada de ferramenta é **negada antes de ser executada**, acompanhada pelo motivo e pelo próximo passo. Permitido → o comando prossegue; cada negação é registrada no log de auditoria do usuário (`~/.local/state/gitflow-guard/repos/<repo>-<hash>/audit.jsonl`).

Sem confirmações em chat ou armazenamento de permissões: merges sensíveis (produção / arquivo) são simplesmente **exclusivos do usuário** — um agente pode preparar a PR/MR, mas o clique de merge permanece sendo seu.

### Princípios de design — por que funciona

#### 1. A configuração é a única fonte da verdade

Nada sobre nomes de branches ou regras é fixo no código. `integration` é fornecido como padrão integrado (`develop`); `preview` / `production` / `archive` são arrays opcionais de nomes exatos ou regexes, cada um com seus próprios parâmetros `update` e `mergeBy` — mesclados via deep-merge sobre os padrões. O mesmo binário escala de um único `develop` a uma pipeline corporativa com múltiplos ambientes.

#### 2. O bloqueio ocorre antes da execução, não depois

O plugin intercepta o fluxo de ferramentas em `tools/pre-execute` — o ponto de decisão que roda *antes* do despacho do comando. Uma resposta `deny` nesse ponto significa que o comando **nunca é executado**; o agente recebe apenas a rejeição. Detecção posterior (varredura de logs após o fato) não serve como imposição — o dano já teria sido causado.

#### 3. Os merges sensíveis são infalsificavelmente humanos

Nenhum código de plugin decide "este merge está liberado?" para produção ou arquivo. O portão simplesmente recusa permitir que um *agente* realize esses merges, tornando o único caminho viável a página da PR/MR onde **você** clica em merge — e esse clique é a confirmação. Não há token, passe ou mensagem de chat que um agente possa forjar para passar por você.

---

## Referência de Configuração

### Padrões integrados e substituição via deep-merge

O guardião vem **ativado por padrão** — nenhum `gitflow-guard.config.json` é necessário. Ele protege:

| padrão | função | regra |
|---|---|---|
| `develop` | **integration** | sem push direto; atualizações via PR/MR (`update: "pr"`) |
| `main` | **archive** | sem push direto / sem merge por agente; o merge de arquivamento é seu (`mergeBy: "user"`) |

Quando você cria um `gitflow-guard.config.json`, seus campos são **mesclados via deep-merge sobre os padrões**: cada campo/função que você declarar substitui o padrão correspondente, e tudo o que você omitir manterá o padrão integrado. Escreva apenas o que deseja alterar:

```jsonc
{
  "branches": { "production": ["release-[\\w-]+"] }  // padrões mantêm develop+main; production é adicionado
}
```

**Desativar completamente** (fluxos trunk / branch única): `{ "enabled": false }`. Corrigir um bloqueio acidental é uma mudança em um único arquivo, e o comando `gitflow-guard status` sempre explica o que está em vigor (inclusive quando são os padrões integrados).

### Funções de branch — o modelo por trás das verificações

Uma **função (role)** mapeia nomes de branches (ou regexes) para um conjunto de regras. `integration` é provido pelos padrões; qualquer outra função é opcional.

```text
branches de feature ──(livre)──> integration (branch de integração; atualizações via PR/MR)
                                       │
                                       ├──> preview (opcional; endpoints de ambiente; via PR/MR)
                                       │
                                       └──> production (opcional; PR/MR + apenas você clica em merge)
archive (opcional; você arquiva após o release)
```

| função | chave de configuração | obrigatório? | comportamento imposto |
|---|---|---|---|
| **feature** | `featurePattern` | — | livre: commit / push / sync / rebase |
| **integration** | `branches.integration` | padrão (`develop`) | sem push direto (padrão `pr`); features entram via PR/MR |
| **preview** | `branches.preview` (array) | opcional | sem push direto; atualizações apenas via PR/MR (endpoints de ambiente) |
| **production** | `branches.production` (array) | opcional | apenas PR/MR; merge exclusivamente pelo usuário (`mergeBy: "user"`) |
| **archive** | `branches.archive` (array) | padrão (`main`) | PR/MR para arquivo pode ser criada por agentes; o merge permanece manual pelo usuário |

### Personalizando nomes e regras de branches — qualquer convenção funciona

**Equipe pequena (solo / 2–3 devs) — minimalista: apenas integração:**

```jsonc
{
  "enabled": true,
  "featurePattern": "feature/[\\w-]+",
  "branches": { "integration": ["develop"] }
}
```

**Equipe maior (múltiplos ambientes de preview + produção + arquivo):**

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

### Referência completa de campos

```jsonc
{
  "enabled": true,                     // padrão true — defina como false para desligar o guardião
  "featurePattern": "feature/[\\w-]+", // regex JS correspondente às suas branches de trabalho/feature
  "branches": {
    "integration": { "branches": ["develop"], "update": "pr" },  // padrão: ["develop"] — omita para manter
    "preview":     { "branches": ["ita1"], "update": "pr" },     // opcional
    "production":  { "branches": ["prd"], "update": "pr", "mergeBy": "user" }, // opcional
    "archive":     ["main"]                                      // opcional
  },
  "locale": "en",                      // opcional: idioma das mensagens — qualquer locale registrado ('en'/'zh' integrados); valores desconhecidos avisam no status e usam inglês como fallback
  "strict": false,                     // opcional: fail-closed — configuração inválida / erros internos bloqueiam em vez de alertar e permitir
  "ci": { "enabled": true }            // opcional: verificações gh pr registradas como referência
}
```

- As funções aceitam um **array** (forma reduzida) ou um **objeto** `{ branches, update?, mergeBy? }`.
- `update`: `pr` (padrão) = atualizações apenas via PR/MR; `flexible` = permite merges diretos/locais (equipes pequenas).
- `mergeBy` (produção): `user` (padrão) = apenas você clica em merge; `anyone` = permite merge do PR.
- Cada entrada de branch é um nome exato ou uma regex (detectada automaticamente). **Segurança de regex**: os padrões de branch são definidos por você e compilados diretamente — evite construções com retrocesso catastrófico (ex.: quantificadores aninhados como `(\w+)+`) em `featurePattern` e nas entradas de branch.
- **Idioma**: mensagens são em inglês por padrão; adicione `"locale": "zh"` para chinês, ou passe `--locale <en|zh>` para qualquer subcomando do `gitflow-guard` (prioridade: flag de CLI > configuração do projeto > inglês). Todo o texto voltado ao usuário segue o locale — incluindo mensagens de framework de CLI como `--help`, avisos de comando desconhecido e a linha de auditoria vazia.
- **Locales customizados**: pacotes a jusante podem adicionar idiomas em tempo de execução — `import { registerLocale } from 'agents-gitflow-guard'`, chame `registerLocale('fr', frDict)` com um dicionário que cubra exatamente as mesmas chaves do inglês embutido (validado no registro), e depois defina `"locale": "fr"` na configuração do projeto para ativá-lo.

  ```js
  import { registerLocale, MESSAGE_KEYS } from 'agents-gitflow-guard'
  // MESSAGE_KEYS lista cada chave que um dicionário deve definir (mesmo conjunto do inglês integrado);
  // o registro lança erro se faltar alguma chave ou se houver chaves extras.
  const fr = { /* uma entrada por item de MESSAGE_KEYS, ex.: */ 'deny.header': ({ why }) => `[gitflow-guard] bloqué : ${why}` }
  registerLocale('fr', fr)
  ```
- **Locales desconhecidos**: um valor não registrado em `"locale"` recorre silenciosamente ao inglês durante a interceptação (por design — hooks nunca travam por problemas de texto), facilitando a passagem despercebida de erros de digitação; um aviso de linha única é exibido em `gitflow-guard status`.
- **Validação**: entradas de funções sobrepostas são rejeitadas; regex inválida é rejeitada. **Qualquer erro de configuração reverte o projeto para "não habilitado"** (relatado) em vez de aplicar uma configuração parcial presumida; preste atenção para não sobrescrever uma função com o mesmo nome de branch de uma função padrão (por exemplo, mapear `main` para integration enquanto o archive padrão ainda é `main`), o que gera erro de sobreposição — substitua ou remova a outra função também.
- **Modo estrito (strict)**: por padrão, uma configuração corrompida emite aviso no stderr uma vez e permite a execução do comando (fail-open, para que um erro de digitação não trave seu ferramental). `"strict": true` faz erros de configuração e erros internos resultarem em **bloqueio** (fail-closed) — indicado para repositórios de alto risco. Um `enabled: false` explícito permanece silencioso; a *ausência* do arquivo não é mais um erro — os padrões integrados (develop+main) entram em vigor.

---

## Matriz de Decisão (Gate Matrix) — O que é bloqueado e o que passa

| ação do agente | decisão |
|---|---|
| commit / push de feature / sync / rebase / comandos somente leitura | ✅ permitido |
| push direto / force-push / exclusão de integration / preview / production / archive | 🚫 bloqueado (push direto permitido em integration/preview configurados como `flexible`) |
| PR/MR: feature → integration / preview | ✅ permitido |
| PR/MR: feature → production | ✅ criação permitida; **merge bloqueado** (você faz o merge na interface) |
| PR/MR para archive | ✅ criação permitida; 🚫 merge bloqueado (você faz o merge na interface) |
| `git merge feature/x` local estando em integration / preview | 🚫 bloqueado (PR/MR obrigatório); permitido com `update: flexible` |
| comandos encadeados (`checkout develop && merge feature/x`) | 🚫 bloqueado — mudanças de branch são simuladas por segmento, sem desvios |
| recriação forçada de branch protegida (`git checkout -B/-C <branch>` / `git switch -C`) | 🚫 bloqueado (portão de atualização direta de ref) |
| redirecionar/excluir branch protegida via `git symbolic-ref` | 🚫 bloqueado (portão de atualização direta de ref) |
| `git cherry-pick` / `git revert` em integration / preview / production / archive | 🚫 bloqueado (reescrita de histórico em branch protegida); `-n` / `--no-commit` e `--abort`/`--continue`/`--skip`/`--quit` passam |
| comandos git envolvidos em `sudo` (wrapper de privilégio) | 🚫 wrapper desempacotado (`sudo -u …` incluído), comando subjacente avaliado |

> Dois casos deliberadamente não bloqueados, para que não sejam "fechados" acidentalmente no futuro: `git tag -f` (mover uma tag, mesmo apontando para uma branch protegida) permanece isento — tags estão fora do escopo de funções de branch, assim como `push --tags`; e um simples `git commit` em uma branch protegida permanece permitido — o guardião governa funções de branch e caminhos de merge, não o conteúdo, e o subsequente `git push` continuará sendo bloqueado (o remoto permanece limpo).

O destino do PR/MR é resolvido via `gh pr view` (GitHub) ou `glab mr view` (GitLab). Sem a CLI da plataforma, o plugin atua de forma conservadora.

---

## Onde o humano mantém o controle
- **Merge de produção** e **arquivo** são exclusivos do usuário por padrão: um agente pode auxiliar na preparação da PR/MR, mas **você clica no botão de merge** — esse clique *é* a confirmação. Não há armazenamento separado de permissões para terceirizar essa decisão.
- Cada bloqueio é adicionado ao log de auditoria no nível do usuário para consulta (`gitflow-guard audit`).

---

## Instalação Detalhada

**Pré-requisito**: **Node.js ≥ 22** no seu `PATH` (requisito mínimo do campo `engines` do pacote e base da matriz de CI). Todos os clientes utilizam o **mesmo pacote npm** `agents-gitflow-guard` — apenas a etapa de montagem e conexão varia.

| Tipo de Cliente / Plataforma | Comando de Instalação | Etapa de Montagem e Conexão |
|---|---|---|
| Claude Code · Codex · OpenCode · Antigravity | `npm i -g agents-gitflow-guard` | `gitflow-guard wire --client <nome> --project --yes` |
| DeepSeek Harness (DSH) | `dsh plugin --profile web add agents-gitflow-guard` | Reiniciar o DSH — plugin monta automaticamente como camada de perfil |
| Pi | `npm i -D agents-gitflow-guard` | Copiar `pi/gitflow-guard.ts` para `.pi/extensions/` |

### 1. Clientes Hook CLI Autônomos (Claude Code · Codex · OpenCode · Antigravity)

Instale a CLI globalmente uma única vez, depois **conecte cada cliente com um único comando** (o guardião já está ativo por padrão via sua configuração integrada, restando apenas a conexão):

```bash
npm i -g agents-gitflow-guard   # disponibiliza o binário `gitflow-guard`
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

O comando `wire` lê o arquivo de configuração existente (se houver), mescla a entrada do hook sem tocar em nada mais, é idempotente (já conectado → ignorado), suporta `--dry-run` para pré-visualização e `--unwire` para remoção, e sempre solicita confirmação antes de alterar arquivos `--global`. Os arquivos exatos gerados (para referência e para edição manual alternativa ao `wire`) são:

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

### 2. Plugins e Extensões em Processo (DSH · Pi)

- **DeepSeek Harness (DSH)**:
  ```bash
  dsh plugin --profile web add agents-gitflow-guard
  ```
  Em seguida, reinicie o DSH. O pacote declara `dsh.bundle.patch`, portanto o `dsh plugin add` o monta automaticamente como uma camada de perfil sem necessidade de edição manual. Atualizações seguem o mesmo comando e reinicialização.

- **Pi**:
  O Pi carrega extensões em processo (sem payload via stdin, sem hook de subprocesso). Instale o ponto de entrada distribuído no projeto e mantenha o pacote em devDependencies:
  ```bash
  npm i -D agents-gitflow-guard
  mkdir -p .pi/extensions
  cp node_modules/agents-gitflow-guard/pi/gitflow-guard.ts .pi/extensions/gitflow-guard.ts
  ```
  Configure `.pi/settings.json`:
  ```jsonc
  // Pi — .pi/settings.json (as extensões são resolvidas relativamente a .pi)
  { "extensions": ["extensions/gitflow-guard.ts"] }
  ```

### 3. A partir do Código-Fonte e Desenvolvimento Local

Para colaboradores ou desenvolvedores que desejam executar e depurar a partir do checkout de código mais recente:

```bash
# Clonar e compilar
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build
```

Monte a build local na sua plataforma de agente alvo:

```bash
# A. Clientes Hook CLI Autônomos (Claude Code · Codex · OpenCode · Antigravity)
npm link # ou npm install -g .
gitflow-guard wire --client <claude|codex|opencode|antigravity> --project --yes

# B. DeepSeek Harness (DSH)
dsh plugin --profile web add file:/path/to/AgentsGitFlowController
# ou execute: node scripts/install-dsh.mjs web (reinicie o DSH depois)

# C. Pi
npm link
# ou copie diretamente o pi/gitflow-guard.ts do repositório para .pi/extensions/
```

### 4. Nota sobre o GitHub Copilot

**GitHub Copilot — deliberadamente sem hook neste projeto.** O Copilot já fornece suas próprias proteções para essa finalidade: permissões **allow/deny/ask** por ferramenta e **regras** de projeto (`rules.json` + `AGENTS.md`). Direcione os usuários do Copilot para a documentação oficial em vez de usar um hook deste plugin:

- [Permitindo e negando uso de ferramentas (GitHub Docs)](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools)
- [Adicionando regras personalizadas para o agente de codificação Copilot (GitHub Docs)](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-rules-for-the-copilot-coding-agent)
- Opcional: O Copilot também possui um [sistema de hooks](https://docs.github.com/en/copilot/reference/hooks-reference) (`preToolUse` → `permissionDecision:"deny"`) se desejar interceptação no nível de comando.

### 5. Mecanismo de Hook e Notas Técnicas

- **Protocolo de plataforma**: O hook lê o payload em stdin e responde de acordo com o protocolo da plataforma:
  - **Claude Code / OpenCode**: `exit 2` (stderr contém o motivo e os passos acionáveis).
  - **Codex**: stdout JSON `{"hookSpecificOutput":{"permissionDecision":"deny",...}}`.
  - **Antigravity**: stdout JSON `{"decision":"deny","reason":...}` com `exit 0` (exigência do Antigravity).
  - **Pi**: Extensão em processo ouvindo o evento `tool_call` e negando via `{ block: true, reason }`.
- **Execução pré-ferramenta**: Apenas o evento pré-ferramenta é interceptado; o guardião bloqueia *antes* que os comandos sejam executados, eliminando a necessidade de hooks pós-ferramenta ou etapas de limpeza de permissões.
- **Resolução de PATH para o executável**: A instalação global (`npm i -g`) provê o binário `gitflow-guard`. Se o ambiente do seu agente não herdar o `PATH` interativo, use o caminho absoluto retornado por `npm bin -g`.
- **Ativo por padrão**: Os padrões integrados (`integration: ["develop"]`, `archive: ["main"]`) entram em vigor sem nenhum arquivo de configuração. Configurações personalizadas em `gitflow-guard.config.json` são mescladas via deep-merge sobre os padrões.
- **Conexão não destrutiva**: `gitflow-guard wire` mescla as configurações de hook de forma idempotente sem alterar hooks existentes, e `wire --unwire` remove apenas a entrada do guardião.

---

## FAQ

### Minhas branches não seguem os nomes padrão — posso usar?

Sim — nada nos nomes das branches é fixo. `integration` vem como padrão integrado (`develop`) e qualquer configuração personalizada é mesclada via deep-merge sobre ele; suas entradas (e as de `preview` / `production` / `archive`) podem ser qualquer nome exato de branch ou padrão de regex que você desejar. `featurePattern` informa ao plugin como reconhecer suas branches de trabalho.

Uma equipe que nomeia sua branch de integração como `master`, adiciona uma preview `beta` e prefixa branches de feature com `fix/` pode escrever exatamente isso na configuração; cada bloqueio, relatório e auditoria refletirá esses nomes. Não há convenção que você seja obrigado a adotar — apenas um mapeamento que você declara. Veja [Personalizando nomes e regras de branches — qualquer convenção funciona](#personalizando-nomes-e-regras-de-branches--qualquer-convenção-funciona).

---

### Eu realmente preciso de preview/production/archive?

Não. Adicione apenas as funções que o seu fluxo realmente possui. Um repositório solo com apenas `develop` configura `integration: ["develop"]` e nada mais; uma empresa com dez ambientes adiciona o array `preview` e a função `production`. O restante permanece desativado.

---

### Esta é uma ferramenta de segurança?

Não, e é essencial que você não a trate como uma. Trata-se de um guardião de fluxo de trabalho: torna um processo previamente acordado mecanicamente executável. O reconhecimento de comandos baseado em texto é inerentemente de melhor esforço (best-effort) — um agente determinado a ofuscar comandos pode burlar o analisador.

Dentro dos formatos de comando suportados, os limites das funções são aplicados localmente: mesclar em uma branch de função protegida (integration / preview / production / archive) exige o caminho configurado (PR/MR, ou merge manual humano para production/archive). Wrappers comuns de ofuscação são classificados e bloqueados — wrappers de shell (`sh -c` / `bash -lc`), subshells e aninhamento com crases/`$()`, prefixos `env`/`command`/`nohup`/`xargs`/`sudo` e atribuições `VAR=x`, caminhos absolutos, pipelines e sufixos `||`, opções globais do git (`-C .`, `--git-dir=…`), refspecs com curingas (`refs/heads/*:refs/heads/*`), `git pull` usado como fetch+merge, e comandos de encanamento (plumbing) como `send-pack`/`update-ref`/`symbolic-ref`; recriação forçada de branches protegidas (`checkout -B`/`switch -C`) e cherry-pick/revert em branches protegidas são bloqueados pelas travas de atualização e movimentação de refs. O conjunto executável de testes adversariais está em `tests/accuracy-audit.spec.ts`.

O que permanece **não defensável localmente**: chamadas diretas às APIs do forge (`gh api repos/…/pulls/N/merge`, `curl`) e comandos dentro de subprocessos de interpretadores (`node -e "child_process.exec('git push …')"`); encadeamento arbitrário e profundo de aspas ou codificações permanece sujeito ao limite do melhor esforço. O limite real e incontornável reside nas regras de proteção de branches no seu serviço de hospedagem. Use ambos — encare este guardião como feedback instantâneo e trilha de auditoria, não como uma fronteira de segurança.

---

### Por que o agente não pode simplesmente fazer o merge em production/archive por conta própria?

Porque o portão classifica essas ações como **exclusivas do usuário**. O plugin nega o *merge* para production e para archive — a criação de PR/MR continua permitida, permitindo que um agente elabore uma PR de arquivamento de `develop` → `main` para você. A realização do merge em si, no entanto, tem exatamente um caminho: **você** clicando no botão — não há passe, token ou mensagem de chat que um agente possa utilizar para conferir esse poder a si próprio.

---

### Eu preciso da CLI `gh` ou `glab`?

Não. Elas são adaptadores opcionais usados apenas para identificar o destino de um `pr merge` / `mr merge`, permitindo ao portão diferenciar "merge em integration/preview" (permitido) de "merge em production/archive" (bloqueado). Quando nenhuma das CLIs consegue confirmar o destino — por estar ausente, não autenticada, offline ou em caso de falha na consulta —, o portão **recusa o merge**, mesmo quando executado a partir de uma branch de feature: aquela PR poderia estar apontando para production/archive. Tente novamente quando a CLI estiver acessível ou realize o merge manualmente. Tudo o mais funciona da mesma forma. A validação central nunca acessa serviços de hospedagem, funcionando de forma idêntica no GitHub, GitLab, servidores auto-hospedados ou offline.

---

### Isso vai bloquear meu trabalho normal?

Deliberadamente, não. Tudo o que cabe a uma branch de feature — commitar, fazer push, sincronizar a partir de `integration`, rebasear, inspecionar com comandos somente leitura, rodar `gitflow-guard status` — é permitido sem atrito.

Os bloqueios são reservados para: (1) gravações diretas em branches de funções protegidas e (2) tentativas do agente de realizar merge em production ou archive. Caso veja um bloqueio que considere incorreto, execute `gitflow-guard status` — ele exibe exatamente qual função cada branch local recebeu, tornando qualquer divergência visível e corrigível.

---

### E se houver um erro na minha configuração?

Uma configuração mal definida nunca é aplicada por acidente: qualquer erro de validação desativa o guardião para aquele projeto e reporta os erros.

Erros comuns: sobrescrever uma função com o mesmo nome de branch de uma função padrão (ex.: mapear `main` para integration enquanto o archive padrão permanece `main` — um erro explícito de sobreposição; cubra ou remova a outra função também), atribuir a mesma branch a duas funções diferentes (rejeitado) e fornecer um `featurePattern` inválido (rejeitado por erro de regex). O erro é destacado de forma clara e o arquivo consiste em um único objeto JSON, tornando a correção uma tarefa de poucos segundos.

---

### O que exatamente é verificado no repositório local?

A branch atual (`git branch --show-current`) e — apenas para `pr merge` / `mr merge` — o destino da PR/MR via `gh pr view` / `glab mr view`. Nenhuma verificação de ancestralidade é necessária, pois o modelo é **orientado a funções** (qual branch *é* o destino) em vez de ordenação temporal.

Nada é gravado, nenhum servidor remoto é contatado e nenhum recurso de serviço de hospedagem é exigido para as validações principais. Merges em produção/arquivo são simplesmente negados para agentes; o merge humano ocorre na sua interface.

---

### Licença / custo?

MIT, gratuito, sem amarras. Use, modifique, distribua — a única obrigação é manter o aviso de direitos autorais.

Se esta ferramenta evitar que sua equipe sofra com um atalho indevido, uma contribuição de café no topo desta página é apreciada, mas nunca obrigatória. Veja [Licença](#licença).

---

## Glossário

| termo | significado |
|---|---|
| **integration** | a função central (padrão integrado: `develop`); features são mescladas via PR/MR; protegida |
| **preview** | branches opcionais para endpoints de ambiente (`branches.preview`, array); atualizações apenas via PR/MR |
| **production** | branches opcionais de produção (`branches.production`, array); PR/MR + merge exclusivamente por humano |
| **archive** | branch opcional de arquivamento pós-release (`branches.archive`, array); agentes podem criar PR/MRs para ela, mas o merge permanece restrito ao usuário |
| **feature branch** | sua branch de trabalho, identificada por `featurePattern`; área livre |
| **gate matrix** | a tabela de decisão que mapeia cada comando classificado em permitir/negar |
| **pre-execute** | o hook na esteira de ferramentas onde a negação ocorre — antes da execução do comando |
| **merge-by-user** | merges de produção/arquivo permanecem em suas mãos — seu clique na PR/MR é a confirmação |

---

## Roadmap

Recursos futuros e áreas sob exploração ativa:

- **Novas integrações de agentes**: Pesquisar e adaptar a hooks/extensões de agentes emergentes (ex.: Cursor, Windsurf, novas CLIs de agentes).
- **Agregação de auditoria**: Sincronização de trilhas de auditoria entre máquinas e formatos de exportação para conformidade em nível de equipe.
- **Predefinições de fluxo de trabalho**: Presets de configuração prontos para uso para fluxos Git comuns (desenvolvimento baseado em tronco, configurações corporativas multi-ambiente).
- **Barreiras rígidas em CI**: Hooks nativos de pipeline de CI e integração de verificação de PR, mantendo execução local com zero dependências.

Para recursos lançados e histórico de versões, veja [CHANGELOG.md](CHANGELOG.md).

---

## Desenvolvimento

```bash
npm install
npm test              # testes unitários: classify / gate / config / cli / repo / platform / i18n / index / accuracy-audit / pi
npm run typecheck     # tsc --noEmit, 0 erros
npm run build         # tsdown → lib/ (CLI e plugin compartilham a compilação)
npm run check:pins    # valida se a versão do package.json coincide com o cabeçalho do CHANGELOG e versões fixadas nos READMEs
npm run verify:matrix # regressão contínua entre agentes: lógica DSH + locale zh + hooks multi-cliente + extensão Pi
```

- **Regra de Qualidade**: Toda alteração de lógica exige typecheck sem erros (0 erros), todos os testes passando e `verify:matrix` com sucesso.
- **Adições de Clientes**: Ao adicionar suporte a uma nova plataforma de agente, siga a lista de verificação de sincronização em [AGENTS.md](AGENTS.md) §8.

---

## Suporte

O plugin é gratuito e de código aberto (MIT). Se ele salvou você e sua equipe de um atalho indevido, um café é bem-vindo:

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/keanz21)

---

## Licença

[MIT](LICENSE) © FeatureAgents
