# DSH plugin protocol (in-process, not a stdin hook)

DSH is the only client that does **not** go through the stdin-payload / exit-code protocol used by Claude Code / Codex / OpenCode / Antigravity. It loads this package as an **in-process plugin**; there is no hook registration file and no stdin JSON.

## Mounting

- Declared in `package.json` via the `"dsh": { "bundle": { "patch": "./patch.yml" } }` key.
- After `dsh plugin --profile web add agents-gitflow-guard`, the rows in `patch.yml` are applied into the profile layer (id `gitflow-guard`, name `agents-gitflow-guard`).
- `patch.yml` config: `toolNames: ['pwsh', 'bash']` — which tool names the guard listens to (overridable per-id in the profile's `cordis.patch.yml`, also exposed as the plugin's `toolNames` plugin-config option).

## Interception (`apply()` in `src/index.ts`)

- `apply(ctx)` registers a listener on the `tools/pre-execute` event.
- The command text is read from `exec.arguments.command`; non-matching tool names and non-git repos fall through to `next()`.
- The repository and current branch are resolved in the directory the command actually runs in, not the session directory (`exec.agent.session.header.cwd`): the tool call's `workdir` argument (or `cwd`; relative to the session directory), then any leading `cd <dir>` / `pushd <dir>` joined by `&&`, `;` or a newline, then the `git -C <dir>` global options of the first gated git command (`resolveCommandCwd` in `src/classify.ts`). A step that cannot be resolved statically (`$VAR`, command substitution, `~`, `cd -`, `popd`, globs, subshells, a `cd` followed by `||` / `|` / `&`) falls back to the starting directory, and a resolved directory outside any repository falls back to the session directory's repository.
- Deny is expressed **via the return value**: `{ kind: 'deny', reason: '<formatted two-line message>' }` — no exit code, no stdout JSON.
- Allow is expressed by calling `next()` (pipeline continuation).

## Degradation

- Internal errors log an English warning (`gitflow-guard: gate internal error, allowed through: …`) and allow the command through (fail-open), matching the CLI behavior; `"strict": true` in the project config does not apply to the in-process path.

## Reference chain

- `patch.yml` (mount rows) · `package.json` (`dsh.bundle.patch`) · `src/index.ts` (`apply()`, `formatDeny`) — the three must stay consistent with this document.
