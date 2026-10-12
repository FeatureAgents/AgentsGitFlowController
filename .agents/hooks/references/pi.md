# Pi extension protocol (in-process, not a stdin hook)

Pi ([earendil-works/pi-mono](https://github.com/earendil-works/pi-mono), formerly badlogic/pi) is — like DSH — a client that does **not** go through the stdin-payload / exit-code protocol used by Claude Code / Codex / OpenCode / Antigravity. Extensions are TypeScript modules loaded **in-process** by Pi (via jiti); there is no hook registration file for a subprocess and no stdin JSON.

## Loading

- Project-local extensions are declared in `.pi/settings.json` under `"extensions"` (paths resolve relative to `.pi`); user-level extensions auto-discover from `~/.pi/agent/extensions/`.
- This package ships `pi/gitflow-guard.ts`, a ready-to-copy default export. Copy it to `<project>/.pi/extensions/gitflow-guard.ts` and keep `agents-gitflow-guard` in the project's devDependencies — jiti resolves the bare import from the project's `node_modules`.
- User-level wiring (all projects at once): copy the same file to `~/.pi/agent/extensions/gitflow-guard.ts`, list it in `~/.pi/agent/settings.json` (user-level paths resolve from the agent directory), and make the package resolvable from `~/.pi/agent` (`cd ~/.pi/agent && npm i agents-gitflow-guard`). On Windows use a PowerShell junction in `~/.pi/agent/node_modules` — under MSYS `ln -s` degrades to a copy and `cmd /c mklink` swallows its arguments.
- Pi asks for project trust before loading project-local `.pi` resources; accepting is required for the guard to load.

## Interception (`src/pi.ts`)

- `createPiExtension()` registers a listener on the official `tool_call` event (ExtensionAPI).
- It only looks at `bash` / `powershell` tool calls (`event.toolName`), reads the command from `event.input.command`, and skips commands without a git-family token (`git` / `gh` / `glab` / `gitflow-guard`) as a fast path — the guard kernel stays authoritative.
- For matching commands it starts the guard as `node <bundled runner> check --platform claude --command <cmd>` with `cwd = ctx.cwd` (`resolvePiBin()`; `GITFLOW_GUARD_BIN` overrides). It never relies on a `gitflow-guard` entry in `PATH`: the npm shims on Windows (extension-less shim / `.cmd`) cannot be started by `execFile` without a shell, which used to make the extension fail open silently on Windows (verified 2026-10-06). This assumes Pi itself runs on Node (its CLI is a Node bundle); if a future Pi build ships a standalone runtime, point `GITFLOW_GUARD_BIN` at the wanted executable. The `--platform claude` flag only selects the deny encoding for this **internal process contract** (exit 2 + reason on stderr); it is not a Pi protocol statement.
- Deny is expressed **via the return value**: `{ block: true, reason: '<stderr from the CLI>' }` — Pi's official `tool_call` block shape (`{ block, reason?, terminate? }`). No exit code, no stdout JSON.
- Allow is expressed by returning `undefined`.

## Degradation

- Internal errors and any non-2 exit from the CLI (e.g. the binary is missing) allow the command through (fail-open), matching the DSH in-process path and the CLI's own fail-open behavior; `"strict": true` in the project config does not apply to the extension path. One exception: a subprocess killed by the 45 s timeout is reported as `timedOut` and **blocks** — a timeout must not degrade to allow.

## Reference chain

- `pi/gitflow-guard.ts` (shipped copyable wrapper) · `.pi/settings.json` + `.pi/extensions/gitflow-guard.ts` (this repo's dogfood mount) · `src/pi.ts` (`createPiExtension`) — the three must stay consistent with this document. Upstream protocol: [pi.dev/docs/extensions](https://pi.dev/docs/latest/extensions) (`tool_call` event, `{ block, reason }` return, `ctx.cwd`).
