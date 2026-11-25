# DSH plugin protocol (in-process, not a stdin hook)

DSH is the only client that does **not** go through the stdin-payload / exit-code protocol used by Claude Code / Codex / OpenCode / Antigravity. It loads this package as an **in-process plugin**; there is no hook registration file and no stdin JSON.

## Mounting

- Declared in `package.json` via the `"dsh": { "bundle": { "patch": "./patch.yml" } }` key.
- After `dsh plugin --profile web add agents-gitflow-guard`, the rows in `patch.yml` are applied into the profile layer (id `gitflow-guard`, name `agents-gitflow-guard`).
- `patch.yml` config: `toolNames: ['pwsh', 'bash']` — which tool names the guard listens to (overridable per-id in the profile's `cordis.patch.yml`, also exposed as the plugin's `toolNames` plugin-config option).

## Interception (`apply()` in `src/index.ts`)

- `apply(ctx)` registers a listener on the `tools/pre-execute` event.
- The command text is read from `exec.arguments.command`; non-matching tool names and non-git repos fall through to `next()`.
- The repository and current branch are resolved in the directory each gated segment actually runs in, not the session directory (`exec.agent.session.header.cwd`): the tool call's `workdir` argument (or `cwd`; relative to the session directory), then any leading `cd <dir>` / `pushd <dir>` joined by `&&`, `;` or a newline, then the `git -C <dir>` global options of that segment itself (`resolveSegmentCwds` in `src/classify.ts`, one directory per gated segment). When a repository with the guard enabled is involved (any resolved directory, or the session directory), the command is **denied** when the gated segments run in different directories, or when the directory of any gated segment cannot be determined statically (`$VAR`, command substitution, `~`, `cd -`, `popd`, globs, subshells and command groups, a `cd` followed by `||` / `|` / `&`, a dynamic `-C` value); an undeterminable step is harmless when no gated segment follows it (`git merge develop && cd $VAR`). The deny is audited and uses the repository's configured locale; without an enabled guard the command passes through as before. When all gated segments share one directory they are judged there, and a directory outside any repository falls back to the session directory's repository. Not resolved (out of scope): `cd` scoping inside command groups and subshells, directories inside wrappers (`env` / `sudo` / `sh -c` / `command` / `builtin`) and nested contexts (`$(...)`, backticks, shell keywords such as `then` / `do`), and `--git-dir` / `--work-tree` / `GIT_DIR` redirection.
- Deny is expressed **via the return value**: `{ kind: 'deny', reason: '<formatted two-line message>' }` — no exit code, no stdout JSON.
- Allow is expressed by calling `next()` (pipeline continuation).

## Degradation

- Internal errors log an English warning (`gitflow-guard: gate internal error, allowed through: …`) and allow the command through (fail-open), matching the CLI behavior; `"strict": true` in the project config does not apply to the in-process path.

## Reference chain

- `patch.yml` (mount rows) · `package.json` (`dsh.bundle.patch`) · `src/index.ts` (`apply()`, `formatDeny`) — the three must stay consistent with this document.
