# agents-gitflow-guard

> **¿Cansado de que los agentes de IA ignoren tu GitFlow?**

Un guardián configurable para roles de ramas Git, diseñado para agentes de programación con IA — [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), [Codex](https://github.com/openai/codex), [OpenCode](https://github.com/opencode-ai/opencode), [Antigravity](https://github.com/google-deepmind), [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) y [Pi](https://github.com/mariozechner/pi).
Tú defines tus propias ramas —
**integration** (las funcionalidades se integran mediante PR/MR), **preview** (entornos de prueba), **production**, **archive** — cada una con sus propias reglas de actualización. Los agentes no pueden eludir el flujo y los merges críticos permanecen en tus manos.

[English](README.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-tw.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Português](README.pt.md) · [Español](README.es.md) · [Русский](README.ru.md) · [Licencia](LICENSE)

[![Support on Ko-fi](https://img.shields.io/badge/Support_on_Ko--fi-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/keanz21)

---

## Índice

- [Inicio Rápido — 30 segundos para proteger tu repositorio](#inicio-rápido--30-segundos-para-proteger-tu-repositorio)
- [Por qué — El problema que resuelve este plugin](#por-qué--el-problema-que-resuelve-este-plugin)
- [Para quién es esto — Escenarios y equipos](#para-quién-es-esto--escenarios-y-equipos)
- [Qué hace — Capacidades](#qué-hace--capacidades)
- [Qué NO hace — Límites honestos](#qué-no-hace--límites-honestos)
- [Protección del lado del servidor vs este plugin](#protección-del-lado-del-servidor-vs-este-plugin)
- [Cómo funciona — El mecanismo en tres líneas](#cómo-funciona--el-mecanismo-en-tres-líneas)
- [Referencia de Configuración](#referencia-de-configuración)
- [Matriz de Decisión — Qué se bloquea y qué se permite](#matriz-de-decisión--qué-se-bloquea-y-qué-se-permite)
- [Dónde el humano mantiene el control](#dónde-el-humano-mantiene-el-control)
- [Instalación Detallada](#instalación-detallada)
- [Preguntas Frecuentes (FAQ)](#preguntas-frecuentes-faq)
- [Glosario](#glosario)
- [Hoja de Ruta](#hoja-de-ruta)
- [Desarrollo](#desarrollo)
- [Soporte](#soporte)
- [Licencia](#licencia)

---

## Inicio Rápido — 30 segundos para proteger tu repositorio

**Paso 1 — Instalar.** Los seis clientes utilizan el mismo paquete npm `agents-gitflow-guard` — elige el modo de instalación correspondiente a tu agente:

```bash
# Modo A: Clientes Hook CLI (Claude Code · Codex · OpenCode · Antigravity)
npm i -g agents-gitflow-guard
```

```bash
# Modo B: Plugin en proceso DSH (reiniciar DSH después; los plugins se cargan al iniciar)
dsh plugin --profile web add agents-gitflow-guard
```

```bash
# Modo C: Extensión en proceso Pi
npm i -D agents-gitflow-guard
```

> **Nota**: Una instalación simple con `add` o `npm i` instala la última versión desde el registro npm. Si tu mirror tiene demora de caché o necesitas fijar una versión específica, añade `@<version>` (ej. `npm i -g agents-gitflow-guard@<version>`). Las dependencias pares específicas de DSH (`@deepseek-ai/cordis` / `@deepseek-ai/dsh-tools`) se declaran **opcionales** — solo el complemento integrado de DSH las necesita, y DSH las proporciona en tiempo de ejecución mediante su resolución modular compartida; los usuarios de CLI / Pi / OpenCode no están obligados a instalarlas.
>
> Los clientes hook CLI ejecutan un único comando de conexión tras la instalación (ver Paso 2); Pi copia un archivo de extensión; DSH se monta automáticamente al instalar el plugin.

**Paso 2 — Conectar tu cliente (sin necesidad de archivo de configuración).** El guardián incluye **valores predeterminados integrados que protegen `develop` (integración) + `main` (archivo)** — cero configuración, activo por defecto. Lo único que necesitas es indicarle a tu cliente de IA que invoque al guardián, con un comando por cliente stdin-hook (DSH se conecta automáticamente; Pi solo copia un archivo, ver más abajo):

```bash
# Claude Code → .claude/settings.json de este repositorio
gitflow-guard wire --client claude --project --yes
```

```bash
# Codex / OpenCode / Antigravity (cada uno con su propio archivo; --yes omite la confirmación y/N)
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

```bash
# Vista previa (sin escribir) / desinstalar / asistente interactivo:
gitflow-guard wire --client claude --dry-run
gitflow-guard wire --client claude --unwire
gitflow-guard setup
```

`wire` se fusiona en tu configuración existente de forma **no destructiva** (los hooks preexistentes no se tocan) y escribe por defecto en el **directorio de tu proyecto** — `--global` (para todos los repositorios en esta máquina) siempre solicita confirmación previa o requiere `--yes`. Los archivos y formatos específicos por cliente se detallan en [Instalación Detallada](#instalación-detallada).

> ⚠️ **main está protegido por defecto.** Los usuarios de flujos basados en tronco (Trunk-based / rama única donde todos hacen push directo a una sola rama) serán bloqueados en pushes directos a `main` hasta que lo desactiven — crea `gitflow-guard.config.json` con `{ "enabled": false }` o mapea tus propias ramas (ver [Referencia de Configuración](#referencia-de-configuración)). `gitflow-guard status` recuerda este aviso siempre que los valores predeterminados integrados estén en vigor.

**Paso 3 — Verificar.** Pide al agente que ejecute `git push origin develop`. La llamada a la herramienta será denegada:

```text
Error: [gitflow-guard] blocked: Protected branch "develop" forbids direct push
Next: Integration branch (develop) is updated via PR/MR from a feature branch: push the feature first, then `gh pr create --base develop` / `glab mr create --target-branch develop`.
```

Los mensajes están en inglés por defecto; crea una configuración con `"locale": "zh"` para cambiar a chino — los mensajes se leerán como: *已拦截:受保护分支「develop」禁止直推 / 下一步:集成分支(develop)由 PR/MR 合入 feature……* (ver [Referencia de Configuración](#referencia-de-configuración)).

**Listo.** El guardián está activo para este repositorio con los valores predeterminados integrados. ¿Quieres más etapas (`preview` / `production`) o nombres de rama diferentes? Crea un `gitflow-guard.config.json` y especifica únicamente los campos que deseas modificar — todo lo demás conservará los valores predeterminados. Para consultar la tabla completa de decisiones, consulta la [Matriz de Decisión](#matriz-de-decisión--qué-se-bloquea-y-qué-se-permite).

### Recorrido completo — Una funcionalidad de principio a fin

Escenario: tu equipo publica una página de inicio de sesión (`feature/login-page`); `develop` es la rama de integración, `main` es el archivo. Lo que tú y el agente experimentan en cada paso:

| # | Lo que ejecuta el agente | Decisión del plugin | Lo que ves tú |
|---|---|---|---|
| 1 | `git checkout -b feature/login-page` (desde develop) | ✅ allow (el trabajo en feature es libre) | Rama creada |
| 2 | `git add . && git commit -m "feat: login"` | ✅ allow | Commiteado |
| 3 | `git push -u origin feature/login-page` | ✅ allow (hacer push de tu feature está permitido) | Pusheado |
| 4 | `git checkout develop && git merge feature/login-page` | 🚫 **deny** — la rama de integración solo admite PR/MR | Debe abrir una PR/MR hacia develop |
| 5 | `gh pr create --base develop` | ✅ allow (feature → integración vía PR) | PR creada, tú revisas y haces merge |
| 6 | `git push origin main` o merge hacia main | 🚫 **deny** — el archivo es exclusivo para el usuario | Tú archivas develop → main manualmente tras el release |

Observa lo que el agente *no puede* hacer: fusionar una rama feature directamente en `develop` o tocar `main` en absoluto. Cada merge crítico es una acción humana consciente en la página de la PR/MR o en tu propia terminal.

---

## Por qué — El problema que resuelve este plugin

Los agentes de programación con IA trabajan directamente en tu repositorio. A través de prompts del sistema, archivos de instrucciones del proyecto (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, etc.) y documentación, se les *indica* que sigan un flujo de integración: desarrollar en una rama feature, fusionar en la rama de integración (y en tus etapas de preview/producción si las tienes) y dejarte a ti los merges hacia archivo/producción.

**Esa es una regla flexible (blanda).** Los agentes se la saltan, alteran el orden o simplemente la «olvidan» — no por malicia, sino porque las instrucciones blandas son optativas para un modelo de lenguaje.

Este plugin transforma esa regla flexible en un **mecanismo estricto (duro)**. Cada operación de Git intentada por un agente se evalúa frente al *estado real de tu repositorio local*. Las infracciones se bloquean antes de que el comando se ejecute, explicando el motivo y el siguiente paso a seguir.

Nadie tiene que acordarse de las reglas — las reglas se aplican técnicamente.

---

## Para quién es esto — Escenarios y equipos

### Señales de que este plugin es para ti

- Tienes — o deseas — un flujo de ramas definido, desde una única rama de integración tipo `develop` hasta pipelines de preview/producción de varias etapas.
- Un agente ya ha tomado un atajo indebido: hizo push directo a una rama protegida o un merge donde no debía. Si ocurrió una vez, volverá a ocurrir — este plugin es la solución estructural.
- Proteges tus ramas de integración/archivo pero no quieres depender exclusivamente de revisiones humanas para detectar cada atajo.
- Varias funcionalidades se desarrollan en paralelo e ingresan a un entorno de prueba compartido, y deseas que cada paso a una etapa más estricta sea auditado.

### Escenarios concretos

1. **Desarrollador individual + agente en proyectos de clientes.** Le asignas un ticket al agente; este intenta «ayudar» haciendo push directo a la rama de integración. Con un archivo de configuración mínimo, el agente no puede tocar ramas protegidas físicamente sin una PR/MR — incluso cuando no estás mirando.
2. **Equipo pequeño (3–10 desarrolladores) con preview desplegado por CI.** El entorno de staging se despliega automáticamente al hacer merge; un día un agente fusionó una feature en `develop` sin revisión. A partir de entonces, cada acceso a etapas protegidas exige una PR/MR — una acción deliberada y auditada.
3. **Empresas con pipelines multientorno.** Múltiples puntos de prueba más líneas reguladas de producción y archivo — cada rol se configura de forma sencilla y el guardián escala sin reglas complejas.
4. **Colaboración asíncrona.** No siempre estás conectado. El guardián mantiene la integridad del flujo entre tus sesiones de trabajo; los merges hacia producción/archivo siguen siendo únicamente tuyos.

**No es adecuado para ti** (ver también [Qué NO hace](#qué-no-hace--límites-honestos)):

- **Flujo basado en tronco (Trunk-based)** — todos hacen merge directo a una sola rama: el plugin bloquearía constantemente.
- **Repositorio personal sin un flujo definido** — no hay nada que aplicar, no aporta valor.
- **Un equipo reacio a asignar roles a las ramas** — el plugin necesita al menos una rama `integration` que proteger.

---

## Qué hace — Capacidades

- **Bloquea antes de la ejecución**: push directo / force-push / eliminación de ramas con roles protegidos (integration / preview / production / archive); intentos de agentes de hacer merge en producción o archivo.
- **Basado en roles, totalmente configurable**: `integration` (predeterminado integrado: `develop`) es el rol central; `preview` / `production` / `archive` son arrays opcionales de nombres de rama o expresiones regulares, cada uno con sus propias reglas de actualización (`pr` / `flexible`, `mergeBy`).
- **Merge humano donde realmente importa (Merge-by-user)**: los merges a producción y archivo permanecen en tus manos — el plugin impide que el agente haga clic en merge, haciendo que tu acción *sea* la confirmación.
- **Funciona con cualquier nomenclatura**: los nombres de ramas se asignan mediante tu configuración, nunca están predefinidos en código (ver [Referencia de Configuración](#referencia-de-configuración)).
- **Completamente auditado**: cada denegación se registra en un log de auditoría en el directorio de estado de usuario (`~/.local/state/gitflow-guard/`, `%LOCALAPPDATA%\gitflow-guard` en Windows) — fuera del repositorio, nunca commiteado, fuera del sandbox de escritura del agente y compartido entre todos los worktrees vinculados de un mismo repositorio.
- **Núcleo independiente de la plataforma**: Git local puro; consulta opcionalmente `gh` (GitHub) o `glab` (GitLab) para resolver el destino de PR/MR y funciona a la perfección sin ellos.

---

## Qué NO hace — Límites honestos

- **No es una barrera de seguridad absoluta.** El análisis de comandos es de mejor esfuerzo (best-effort); un agente empeñado en ofuscar comandos puede evadir el análisis sintáctico textual.
- **No actúa como barrera en plataformas de CI.** El estado de CI se registra únicamente como referencia, nunca como un bloqueo estricto. La verdadera protección de ramas pertenece a la configuración de GitHub/GitLab, que puede superponerse.
- **No reemplaza al flujo en sí mismo.** Tu proyecto debe contar con al menos una rama `integration`; si todos hacen push directo a una sola rama, este plugin bloqueará todo el tiempo — no lo habilites en ese caso.
- **Producción/archivo no están automatizados** — se reservan deliberadamente a tu clic humano; el plugin solo se encarga de decir «no» a los agentes.

---

## Protección del lado del servidor vs este plugin

La protección de ramas del lado del servidor (reglas de ramas de GitHub, ramas protegidas de GitLab) y este plugin resuelven **problemas diferentes**. Son complementarios, no excluyentes.

| Dimensión | Protección del servidor | Este plugin |
|---|---|---|
| Lo que regula | *Quién* puede hacer push / merge a ramas protegidas (permisos) | *Cómo* pueden los agentes entrar en el flujo (workflow) — en qué rol aterriza una integración |
| Impide que agentes hagan merge en producción/archivo | No — no puede distinguir si «lo hizo un agente» | Sí — los merges a producción/archivo están bloqueados para agentes por defecto |
| Flexibilidad por rol | Una regla por rama en el servidor | Por rol `update` (`pr`/`flexible`) + `mergeBy` (`user`/`anyone`) en un solo archivo de configuración |
| Alcance | Todos los usuarios del repositorio, humanos incluidos | Agentes con el plugin configurado (los humanos no tienen restricciones) |
| Punto de aplicación | En el servidor, al momento del push / merge | Localmente, antes de que el comando se ejecute |
| Plataforma | Vinculado al servicio de alojamiento | Git local puro, independiente de la plataforma (`gh` / `glab` opcionales) |
| Evadible por | Usuarios con privilegios de administrador | Cualquier persona fuera del entorno del agente, o un agente malicioso decidido |

Por qué esto importa: la protección de ramas responde a *«¿puede realizarse este push?»*; este plugin responde a *«¿puede este agente entrar en este rol según la configuración?»*. La arquitectura más sólida combina **ambos** — el plugin mantiene a los agentes respetando el flujo de trabajo y la protección de ramas garantiza que nadie (ni agente ni humano) haga push directo a una rama protegida.

---

## Cómo funciona — El mecanismo en tres líneas

1. Un agente invoca una herramienta de terminal (`pwsh` / `bash`) con un comando Git.
2. El plugin clasifica el comando, resuelve los roles de ramas desde `gitflow-guard.config.json` y aplica la matriz de decisión.
3. Infracción → la llamada a la herramienta es **denegada antes de ejecutarse**, con el motivo y el siguiente paso. Permitido → el comando continúa normalmente; cada bloqueo se audita en el registro de usuario (`~/.local/state/gitflow-guard/repos/<repo>-<hash>/audit.jsonl`).

Sin confirmaciones por chat ni almacenes de permisos: los merges sensibles (producción / archivo) son sencillamente **exclusivos para el usuario** — un agente puede preparar la PR/MR, pero el clic de merge final es exclusivamente tuyo.

### Principios de diseño — Por qué funciona

#### 1. La configuración es la única fuente de verdad

Nada relativo a nombres de ramas o reglas está codificado en duro. `integration` se incluye como valor predeterminado integrado (`develop`); `preview` / `production` / `archive` son arrays opcionales de nombres exactos o regex, cada uno con sus propios valores de `update` y `mergeBy` — fusionados en profundidad sobre los valores predeterminados. El mismo binario escala desde un `develop` individual hasta un pipeline empresarial multientorno.

#### 2. El bloqueo ocurre antes de la ejecución, no después

El plugin se acopla a la canalización de herramientas en `tools/pre-execute` — el punto de decisión que se evalúa *antes* de despachar el comando. Una denegación (`deny`) allí significa que el comando **nunca se ejecuta**; el agente solo recibe el rechazo. La detección posterior (analizar registros después del hecho) no sirve como mecanismo de control — el daño ya estaría hecho.

#### 3. Los merges sensibles son infalsificablemente humanos

Ningún código del plugin decide si «este merge está bien» para producción o archivo. La compuerta simplemente se niega a permitir que un *agente* ejecute esos merges, por lo que el único camino es una página de PR/MR donde **tú** haces clic en merge — y ese clic es la confirmación. No hay token, permiso ni mensaje de chat que un agente pueda falsificar para eludir tu control.

---

## Referencia de Configuración

### Valores predeterminados integrados y anulación por fusión profunda

El guardián está **activo por defecto** — no se requiere ningún archivo `gitflow-guard.config.json`. Protege:

| Predeterminado | Rol | Regla |
|---|---|---|
| `develop` | **integration** | Sin push directo; se actualiza mediante PR/MR (`update: "pr"`) |
| `main` | **archive** | Sin push directo / sin merge por agente; el merge de archivo te corresponde a ti (`mergeBy: "user"`) |

Cuando creas un `gitflow-guard.config.json`, sus campos se **fusionan en profundidad sobre los valores predeterminados**: cada campo o rol que declares reemplaza el valor predeterminado correspondiente, y todo lo que no declares conservará el valor predeterminado. Declara únicamente lo que desees cambiar:

```jsonc
{
  "branches": { "production": ["release-[\\w-]+"] }  // los predeterminados conservan develop+main; se añade production
}
```

**Desactivar por completo** (flujos Trunk-based / rama única): `{ "enabled": false }`. Corregir un bloqueo accidental requiere modificar un solo archivo, y `gitflow-guard status` explica en todo momento qué configuración está vigente (incluso cuando son los valores predeterminados integrados).

### Roles de ramas — El modelo detrás de las comprobaciones

Un **rol** asocia nombres de rama (o regex) a un conjunto de reglas. `integration` lo proporcionan los valores predeterminados; todos los demás roles son opcionales.

```text
ramas feature ──(libre)──> integration (rama de integración; se actualiza vía PR/MR)
                                 │
                                 ├──> preview (opcional; entornos de prueba; vía PR/MR)
                                 │
                                 └──> production (opcional; PR/MR + solo tú haces merge)
archive (opcional; tú archivas tras el release)
```

| Rol | Clave de configuración | ¿Requerido? | Comportamiento aplicado |
|---|---|---|---|
| **feature** | `featurePattern` | — | Libre: commit / push / sincronización / rebase |
| **integration** | `branches.integration` | Predeterminado (`develop`) | Sin push directo (predeterminado `pr`); features entran vía PR/MR |
| **preview** | `branches.preview` (array) | Opcional | Sin push directo; actualización solo vía PR/MR (entornos de prueba) |
| **production** | `branches.production` (array) | Opcional | Solo PR/MR; merge exclusivamente por el usuario (`mergeBy: "user"`) |
| **archive** | `branches.archive` (array) | Predeterminado (`main`) | El agente puede crear PR/MR hacia él; el merge permanece solo en manos del usuario |

### Personalizar nombres de ramas y reglas — Cualquier nomenclatura funciona

**Equipo pequeño (desarrollador individual / 2–3 devs) — Mínimo: solo integración:**

```jsonc
{
  "enabled": true,
  "featurePattern": "feature/[\\w-]+",
  "branches": { "integration": ["develop"] }
}
```

**Equipo grande (múltiples entornos preview + producción + archivo):**

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

### Referencia completa de campos

```jsonc
{
  "enabled": true,                     // true por defecto — poner false para desactivar el guardián
  "featurePattern": "feature/[\\w-]+", // Expresión regular JS para identificar ramas de trabajo/feature
  "branches": {
    "integration": { "branches": ["develop"], "update": "pr" },  // predeterminado: ["develop"] — omitir para conservar
    "preview":     { "branches": ["ita1"], "update": "pr" },     // opcional
    "production":  { "branches": ["prd"], "update": "pr", "mergeBy": "user" }, // opcional
    "archive":     ["main"]                                      // opcional
  },
  "worktree": {                        // opcional: guardián del árbol de trabajo y de la línea base aguas arriba
    "requireCleanOnPr": false,         // exigir cambios staged/unstaged limpios antes de crear PR (predeterminado false)
    "requireCleanOnMerge": false,      // exigir árbol de trabajo limpio antes de fusionar (predeterminado false)
    "allowUntracked": true,            // permitir archivos no rastreados (??); false bloquea si existen (predeterminado true)
    "requireUpstreamSynced": false     // exigir sincronización con la línea base aguas arriba antes de crear PR (predeterminado false)
  },
  "locale": "en",                      // opcional: idioma de mensajes — cualquier locale registrado ('en'/'zh' integrados); valores no reconocidos alertan en status y usan inglés
  "strict": false,                     // opcional: fail-closed — errores de config / internos bloquean en lugar de advertir y permitir
  "ci": { "enabled": true }            // opcional: comprobaciones de gh pr registradas como referencia
}
```

- Los roles aceptan tanto un **array** (atajo) como un **objeto** `{ branches, update?, mergeBy? }`.
- `update`: `pr` (predeterminado) = actualización únicamente mediante PR/MR; `flexible` = permite merges directos/locales (equipos reducidos).
- `mergeBy` (producción): `user` (predeterminado) = solo tú haces clic en merge; `anyone` = permite que el agente complete el merge del PR.
- **Guardián del árbol de trabajo y de la línea base aguas arriba (`worktree`)**: comprobaciones opcionales de estado y divergencia —— `requireCleanOnPr: true` bloquea la creación de PR si hay cambios no confirmados (staged/unstaged); `requireCleanOnMerge: true` bloquea merges locales y de PR en árboles de trabajo sucios; `allowUntracked` (`true` por defecto) permite archivos no rastreados (`??`) sin fricción, o puede configurarse en `false` para una colaboración estricta humano-agente; `requireUpstreamSynced: true` bloquea la creación de PR cuando la rama está por detrás de la línea base aguas arriba. En comandos compuestos multietapa (ej. `git add . && git commit && gh pr create`), se simula dinámicamente un estado limpio para los segmentos posteriores.
- Cada entrada de rama es un nombre exacto o una regex (detectada automáticamente). **Seguridad de regex**: los patrones de ramas son redactados por ti y se compilan tal cual — evita construcciones con retroceso catastrófico (ej. cuantificadores anidados como `(\w+)+`) en `featurePattern` y entradas de ramas.
- **Idioma**: los mensajes están en inglés por defecto; agrega `"locale": "zh"` para chino, o pasa `--locale <en|zh>` a cualquier subcomando de `gitflow-guard` (prioridad: flag de CLI > configuración del proyecto > inglés). Todo el texto visible para el usuario adopta el locale — incluidos mensajes del framework de CLI como `--help`, avisos de comandos desconocidos y la línea de auditoría vacía.
- **Locales personalizados**: los paquetes dependientes pueden registrar un nuevo idioma en tiempo de ejecución — `import { registerLocale } from 'agents-gitflow-guard'`, invoca `registerLocale('fr', frDict)` con un diccionario que cubra exactamente las mismas claves que el inglés integrado (validado al registrar), y luego establece `"locale": "fr"` en la configuración del proyecto para activarlo.

  ```js
  import { registerLocale, MESSAGE_KEYS } from 'agents-gitflow-guard'
  // MESSAGE_KEYS enumera todas las claves que un diccionario debe definir (el mismo conjunto que el inglés integrado);
  // el registro arroja un error si falta alguna clave o si sobra alguna.
  const fr = { /* una entrada por cada clave en MESSAGE_KEYS, ej. */ 'deny.header': ({ why }) => `[gitflow-guard] bloqué : ${why}` }
  registerLocale('fr', fr)
  ```
- **Locales desconocidos**: un valor de `"locale"` no registrado recurre silenciosamente al inglés durante la interceptación (por diseño — los hooks nunca deben atascarse por cuestiones de redacción), lo que facilita que un error tipográfico pase desapercibido; la advertencia de una sola línea se mostrará en `gitflow-guard status`.
- **Validación**: las entradas de roles que se superpongan serán rechazadas; las expresiones regulares no válidas serán rechazadas. **Cualquier error de configuración devuelve el proyecto al estado «no activado»** (con informe), en lugar de aplicar una configuración incompleta; ten en cuenta que redefinir un rol con el mismo nombre de rama que un rol predeterminado (ej. asignar `main` a integration mientras el archivo predeterminado sigue siendo `main`) genera un error de superposición — redefine o descarta el otro rol también.
- **Modo estricto**: por defecto, una configuración defectuosa emite una advertencia en stderr y permite que el comando se ejecute (fail-open, para evitar que una errata bloquee tus herramientas). `"strict": true` convierte los errores de configuración e internos en **bloqueos** (fail-closed) — ideal para repositorios de alto riesgo. Un `enabled: false` explícito permanece en silencio; un archivo *inexistente* ya no se considera un error — se aplican los valores predeterminados integrados (develop+main).

---

## Matriz de Decisión — Qué se bloquea y qué se permite

| Acción del agente | Decisión |
|---|---|
| Commit / push de feature / sincronización / rebase / comandos de solo lectura | ✅ allow (permitido) |
| Push directo / force-push / eliminación de integration / preview / production / archive | 🚫 block (bloqueado; permitido push directo en integration/preview con `flexible`) |
| PR/MR: feature → integration / preview | ✅ allow (permitido) |
| PR/MR: feature → production | ✅ Creación permitida; **Merge bloqueado** (tú haces merge en la UI) |
| PR/MR hacia archive | ✅ Creación permitida; 🚫 Merge bloqueado (tú haces merge en la UI) |
| `git merge feature/x` local mientras estás en integration / preview | 🚫 block (PR/MR requerido); `update: flexible` lo permite |
| Comandos encadenados (`checkout develop && merge feature/x`) | 🚫 block — los cambios de rama se simulan segmento por segmento, sin omisiones |
| Recreación forzada de una rama protegida (`git checkout -B/-C <rama>` / `git switch -C`) | 🚫 block (compuerta de actualización directa de refs) |
| Redirección/eliminación de una rama protegida mediante `git symbolic-ref` | 🚫 block (compuerta de actualización directa de refs) |
| `git cherry-pick` / `git revert` en integration / preview / production / archive | 🚫 block (reescritura de historial en rama protegida); `-n` / `--no-commit` y `--abort`/`--continue`/`--skip`/`--quit` pasan |
| Comandos Git envueltos con `sudo` (envoltorio de privilegios) | 🚫 Envoltorio retirado (`sudo -u …` incluido), comando subyacente evaluado |

> Dos omisiones deliberadas para evitar que se cierren por error en el futuro: `git tag -f` (mover un tag, incluso apuntando a una rama protegida) permanece exento — los tags están fuera del alcance de los roles de rama, igual que `push --tags`; y un `git commit` común en una rama protegida permanece permitido — el guardián regula los roles de rama y las rutas de merge, no el contenido, y el `git push` posterior seguirá siendo bloqueado (el repositorio remoto permanece limpio).

El destino de PR/MR se resuelve mediante `gh pr view` (GitHub) o `glab mr view` (GitLab). Sin una CLI de plataforma, el plugin adopta una postura conservadora.

---

## Dónde el humano mantiene el control

- **El merge a producción** y el **archivo** son exclusivos del usuario por defecto: un agente puede ayudar a preparar la PR/MR, pero **tú haces clic en el botón de merge** — ese clic *es* la confirmación. No hay un almacén de permisos separado para delegar esa decisión.
- Cada denegación se registra en el log de auditoría del usuario para su revisión (`gitflow-guard audit`).

---

## Instalación Detallada

**Requisito previo**: **Node.js ≥ 22** en tu `PATH` (el requisito mínimo de `engines` del paquete y el nivel inferior de la matriz de CI). Todos los clientes consumen **el mismo paquete npm** `agents-gitflow-guard` — solo difiere el paso de montaje y conexión.

| Tipo de cliente / Plataforma | Comando de instalación | Paso de montaje y conexión |
|---|---|---|
| Claude Code · Codex · OpenCode · Antigravity | `npm i -g agents-gitflow-guard` | `gitflow-guard wire --client <nombre> --project --yes` |
| DeepSeek Harness (DSH) | `dsh plugin --profile web add agents-gitflow-guard` | Reiniciar DSH — el plugin se monta automáticamente como capa de perfil |
| Pi | `npm i -D agents-gitflow-guard` | Copiar `pi/gitflow-guard.ts` dentro de `.pi/extensions/` |

### 1. Clientes Hook CLI autónomos (Claude Code · Codex · OpenCode · Antigravity)

Instala la CLI de forma global una vez y luego **conecta cada cliente con un solo comando** (el guardián está activo por defecto mediante su configuración integrada, por lo que la conexión es lo único restante):

```bash
npm i -g agents-gitflow-guard   # proporciona el binario `gitflow-guard`
gitflow-guard wire --client claude --project --yes
gitflow-guard wire --client codex --project --yes
gitflow-guard wire --client opencode --project --yes
gitflow-guard wire --client antigravity --project --yes
```

`wire` lee el archivo de configuración existente (si existe), inserta la entrada del hook sin alterar nada más, es idempotente (si ya está conectado → se omite), admite `--dry-run` para previsualizar y `--unwire` para desinstalar, y solicita confirmación antes de modificar archivos `--global`. Los archivos exactos que escribe (para referencia o para escribirlos manualmente en lugar de usar `wire`) son:

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

### 2. Plugins y extensiones en proceso (DSH · Pi)

- **DeepSeek Harness (DSH)**:
  ```bash
  dsh plugin --profile web add agents-gitflow-guard
  ```
  Reinicia DSH a continuación. El paquete declara `dsh.bundle.patch`, por lo que `dsh plugin add` lo monta automáticamente como una capa de perfil sin necesidad de editar perfiles manualmente. Las actualizaciones siguen el mismo comando y reinicio.

- **Pi**:
  Pi carga extensiones en memoria dentro del proceso (sin payload en stdin, sin hook de subproceso). Instala el punto de entrada distribuido en el proyecto y mantén el paquete en devDependencies:
  ```bash
  npm i -D agents-gitflow-guard
  mkdir -p .pi/extensions
  cp node_modules/agents-gitflow-guard/pi/gitflow-guard.ts .pi/extensions/gitflow-guard.ts
  ```
  Configura `.pi/settings.json`:
  ```jsonc
  // Pi — .pi/settings.json (las extensiones se resuelven relativas a .pi)
  { "extensions": ["extensions/gitflow-guard.ts"] }
  ```

### 3. Desde el código fuente y desarrollo local

Para contribuidores o desarrolladores que deseen ejecutar y depurar directamente con el código fuente más reciente:

```bash
# Clonar y compilar
git clone https://github.com/FeatureAgents/AgentsGitFlowController.git
cd AgentsGitFlowController
npm install && npm run build
```

Monta la compilación local en tu plataforma de agente de destino:

```bash
# A. Clientes Hook CLI autónomos (Claude Code · Codex · OpenCode · Antigravity)
npm link # o npm install -g .
gitflow-guard wire --client <claude|codex|opencode|antigravity> --project --yes

# B. DeepSeek Harness (DSH)
dsh plugin --profile web add file:/ruta/hacia/AgentsGitFlowController
# o ejecutar: node scripts/install-dsh.mjs web (reiniciar DSH después)

# C. Pi
npm link
# o copiar pi/gitflow-guard.ts del repositorio directamente a .pi/extensions/
```

### 4. Nota sobre GitHub Copilot

**GitHub Copilot — deliberadamente sin hook aquí.** Copilot incluye sus propios mecanismos de protección para este propósito exacto: permisos **allow/deny/ask** por herramienta y reglas de proyecto **rules** (`rules.json` + `AGENTS.md`). Dirige a los usuarios de Copilot a la documentación oficial en lugar de usar un hook de plugin:

- [Permitir y denegar el uso de herramientas (GitHub Docs)](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools)
- [Adición de reglas personalizadas para el agente de codificación Copilot (GitHub Docs)](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-rules-for-the-copilot-coding-agent)
- Opcional: Copilot también dispone de un [sistema de hooks](https://docs.github.com/en/copilot/reference/hooks-reference) (`preToolUse` → `permissionDecision:"deny"`) si deseas interceptación a nivel de comando.

### 5. Mecanismo de Hook y notas técnicas

- **Protocolo de plataforma**: El hook lee el payload en stdin y responde según el protocolo de cada plataforma:
  - **Claude Code / OpenCode**: `exit 2` (stderr contiene el motivo y los pasos a seguir).
  - **Codex**: JSON en stdout `{"hookSpecificOutput":{"permissionDecision":"deny",...}}`.
  - **Antigravity**: JSON en stdout `{"decision":"deny","reason":...}` con `exit 0` (Antigravity exige código de salida 0).
  - **Pi**: Extensión en proceso que escucha el evento `tool_call` y deniega mediante `{ block: true, reason }`.
- **Ejecución previa a la herramienta (Pre-tool)**: Solo se intercepta el evento previo a la herramienta; el guardián bloquea *antes* de que los comandos se ejecuten, por lo que no se necesitan hooks posteriores ni pasos de limpieza de permisos.
- **Resolución del binario en PATH**: La instalación global (`npm i -g`) proporciona el binario `gitflow-guard`. Si el ejecutor de tu agente no hereda tu `PATH` interactivo, usa la ruta absoluta obtenida con `npm bin -g`.
- **Habilitado por defecto**: Los valores predeterminados integrados (`integration: ["develop"]`, `archive: ["main"]`) entran en vigor sin ningún archivo de configuración. Las configuraciones personalizadas en `gitflow-guard.config.json` se aplican por fusión profunda sobre estos valores.
- **Conexión no destructiva**: `gitflow-guard wire` fusiona las configuraciones de hooks de forma idempotente sin modificar los hooks existentes, y `wire --unwire` elimina únicamente la entrada del guardián.

---

## Preguntas Frecuentes (FAQ)

### Mis ramas no siguen los nombres predeterminados — ¿puedo usarlo?

Sí — ningún nombre de rama es rígido. `integration` se proporciona como valor predeterminado integrado (`develop`) y cualquier configuración personalizada se fusiona en profundidad sobre él; sus entradas (así como las de `preview` / `production` / `archive`) pueden ser cualquier nombre exacto o patrón de regex que desees. `featurePattern` le indica al plugin cómo reconocer tus ramas de trabajo.

Un equipo que llame a su rama de integración `master`, agregue una previsualización `beta` y prefije sus ramas de características con `fix/` simplemente escribe eso en la configuración; cada bloqueo, informe y auditoría utilizará esos nombres. No hay convenciones obligatorias que debas adoptar — únicamente un mapeo que tú declaras. Ver [Personalizar nombres de ramas y reglas](#personalizar-nombres-de-ramas-y-reglas--cualquier-nomenclatura-funciona).

---

### ¿Necesito configurar preview / production / archive obligatoriamente?

No. Agrega únicamente los roles que existan realmente en tu flujo. Un repositorio individual con solo `develop` configura `integration: ["develop"]` y nada más; una empresa con diez entornos agrega el array `preview` y un rol `production`. El resto permanece desactivado.

---

### ¿Es esta una herramienta de seguridad?

No, y es fundamental que no la trates como tal. Es un guardián de flujo de trabajo (workflow guard): hace que un proceso acordado sea aplicable mecánicamente. El reconocimiento de comandos basado en texto es por naturaleza de mejor esfuerzo (best-effort) — un agente decidido a ofuscar un comando puede eludir el analizador sintáctico.

Dentro de las formas de comandos soportadas, el límite de roles se aplica localmente: fusionar en una rama de rol protegido (integration / preview / production / archive) requiere la ruta configurada (PR/MR, o un merge humano para producción/archivo). Los envoltorios de ofuscación habituales se clasifican y bloquean — envoltorios shell (`sh -c` / `bash -lc`), subshells y anidamientos con comillas invertidas/`$()`, prefijos `env`/`command`/`nohup`/`xargs`/`sudo` y asignaciones `VAR=x`, rutas absolutas, canalizaciones y colas con `||`, opciones globales de Git (`-C .`, `--git-dir=…`), refspecs con comodines (`refs/heads/*:refs/heads/*`), `git pull` utilizado como fetch+merge, así como los comandos de fontanería `send-pack`/`update-ref`/`symbolic-ref`; la recreación forzada de una rama protegida (`checkout -B`/`switch -C`) y cherry-pick/revert en una rama protegida se bloquean mediante las compuertas de ref-update y ref-move. El corpus ejecutable de pruebas adversarias se encuentra en `tests/accuracy-audit.spec.ts`.

Lo que sigue siendo **no defendible localmente**: llamadas directas a APIs de forjas (`gh api repos/…/pulls/N/merge`, `curl`) y comandos dentro de subprocesos de intérpretes (`node -e "child_process.exec('git push …')"`); las transformaciones con comillas o codificaciones arbitrariamente profundas siguen siendo de mejor esfuerzo por naturaleza. La frontera real e insalvable radica en las reglas de protección de ramas en tu servicio de alojamiento. Utiliza ambas — concibe este guardián como retroalimentación instantánea y registro de auditoría, no como un perímetro de seguridad.

---

### ¿Por qué el agente no puede hacer merge directamente en production/archive?

Porque la compuerta clasifica esas acciones como **exclusivas del usuario**. El plugin deniega el *merge* para producción y archivo — la creación de PR/MR sigue estando permitida, por lo que un agente puede redactar una PR de archivo `develop` → `main` para ti. Sin embargo, el merge en sí tiene exactamente una vía: **tu** clic directo — no existe permiso, token o mensaje de chat que un agente pueda utilizar para conferirse ese poder a sí mismo.

---

### ¿Necesito la CLI `gh` o `glab`?

No. Son adaptadores opcionales que se usan únicamente para resolver a qué apunta un `pr merge` / `mr merge`, de modo que la compuerta pueda distinguir entre «merge hacia integración/preview» (permitido) y «merge hacia producción/archivo» (bloqueado). Cuando ninguna de las CLI puede confirmar el destino — por ausencia, falta de autenticación, estar fuera de línea o fallo de consulta —, la compuerta **rechaza el merge**, incluso si se ejecuta desde una rama feature: esa PR podría estar apuntando en realidad a producción/archivo. Vuelve a intentarlo cuando la CLI esté operativa o realiza el merge manualmente en la interfaz. Todo lo demás funciona exactamente igual. La verificación central nunca se conecta a ningún servicio de alojamiento, por lo que opera de forma idéntica en GitHub, GitLab, entornos autoalojados o sin conexión.

---

### ¿Bloqueará mi trabajo normal?

Deliberadamente, no. Todo para lo que sirve una rama feature — commitear, hacer push, sincronizar desde `integration`, hacer rebase, inspeccionar con comandos de solo lectura, ejecutar `gitflow-guard status` — está permitido sin fricción.

Los bloqueos están reservados para: (1) escrituras directas en ramas de roles protegidos, y (2) intentos de un agente de hacer merge en producción o archivo. Si alguna vez presencias un bloqueo que consideres erróneo, ejecuta `gitflow-guard status` — muestra con precisión qué rol se le asignó a cada rama local, permitiendo visualizar y corregir cualquier discrepancia.

---

### ¿Qué pasa si mi configuración contiene un error?

Una configuración mal definida nunca se aplica por accidente: cualquier error de validación desactiva el guardián para ese proyecto y reporta los fallos.

Errores comunes: redefinir un rol con el mismo nombre de rama que un rol predeterminado (ej. mapear `main` como integración mientras el archivo predeterminado sigue siendo `main` — un error explícito de superposición; redefine o elimina el otro rol también), superponer una misma rama en dos roles diferentes (rechazado), o un `featurePattern` que no compila (rechazado por regex no válida). El aviso de error es claro y el archivo es un único objeto JSON, por lo que la corrección normalmente toma menos de medio minuto.

---

### ¿Qué se verifica exactamente en el repositorio local?

La rama actual (`git branch --show-current`), y — únicamente para `pr merge` / `mr merge` — el destino de la PR/MR mediante `gh pr view` / `glab mr view`. No se requiere ningún análisis genealógico de commits, ya que el modelo está **basado en roles** (cuál *es* la rama destino) y no en el orden de los commits.

No se escribe nada en disco, no se contacta a ningún servidor remoto y no se requiere ninguna función del servicio de alojamiento para las comprobaciones fundamentales. Los merges hacia producción/archivo son simplemente denegados a los agentes; el merge humano se efectúa en tu interfaz web.

---

### ¿Licencia / coste?

MIT, gratuito, sin condiciones. Úsalo, modifícalo, distribúyelo — la única obligación es conservar el aviso de derechos de autor.

Si le ahorra a tu equipo un incidente por un atajo no deseado, el botón de café en la parte superior de esta página es bienvenido, aunque nunca obligatorio. Ver [Licencia](#licencia).

---

## Glosario

| Término | Significado |
|---|---|
| **integration** | El rol principal (predeterminado integrado: `develop`); las features se integran vía PR/MR; protegido |
| **preview** | Ramas opcionales de prueba (`branches.preview`, array); actualización únicamente vía PR/MR |
| **production** | Ramas opcionales de producción (`branches.production`, array); PR/MR + merge exclusivo por el usuario |
| **archive** | Rama opcional de archivo post-release (`branches.archive`, array); los agentes pueden abrir PR/MR hacia ella, pero el merge es solo manual |
| **feature branch** | Tu rama de trabajo, identificada por `featurePattern`; zona libre |
| **gate matrix** | La tabla de decisión que asigna cada comando clasificado a permitir o denegar |
| **pre-execute** | El hook de la canalización de herramientas donde se produce el bloqueo — antes de que el comando se ejecute |
| **merge-by-user** | Los merges hacia producción/archivo permanecen bajo tu control — tu clic en la PR/MR es la confirmación |

---

## Hoja de Ruta

Capacidades futuras y áreas bajo exploración activa:

- **Nuevas integraciones de agentes**: investigación y adaptación a hooks/extensiones de nuevos agentes (ej. Cursor, Windsurf, nuevas CLI de agentes).
- **Agregación de auditorías**: sincronización de registros de auditoría entre máquinas y formatos de exportación para cumplimiento normativo de equipos.
- **Preajustes de flujo de trabajo**: preajustes de configuración listos para usar según flujos de ramas comunes de Git (desarrollo basado en tronco, configuraciones empresariales multientorno).
- **Comprobación estricta en CI**: hooks nativos para pipelines de CI e integración con verificaciones de PR manteniendo la ejecución local con cero dependencias.

Para conocer las funciones publicadas y el historial de versiones, consulta [CHANGELOG.md](CHANGELOG.md).

---

## Desarrollo

```bash
npm install
npm test              # pruebas unitarias: classify / gate / config / cli / repo / platform / i18n / index / accuracy-audit / pi
npm run typecheck     # tsc --noEmit, 0 errores
npm run build         # tsdown → lib/ (la CLI y el plugin comparten la compilación)
npm run check:pins    # comprueba que la versión de package.json coincida con el título de CHANGELOG y los pins en READMEs
npm run verify:matrix # regresión continua multiagente: lógica DSH + locale zh + hooks multicliente + extensión Pi
```

- **Regla de calidad**: cualquier cambio de lógica requiere una verificación de tipos sin errores (0 errores), todas las pruebas en verde y superar `verify:matrix`.
- **Incorporación de clientes**: al añadir soporte para una nueva plataforma de agente, sigue la lista de verificación de sincronización en [AGENTS.md](AGENTS.md) §8.

---

## Soporte

El plugin es gratuito y de código abierto (MIT). Si te ha ahorrado a ti y a tu equipo un susto por un atajo indebido, un café siempre es apreciado:

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/keanz21)

---

## Licencia

[MIT](LICENSE) © FeatureAgents
