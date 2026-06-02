# Cross-Platform (macOS + Windows) Support — Design

Date: 2026-06-02
Status: Approved (pending spec review)
Branch: `feat/cross-platform-windows`

## Goal

Make Agent-Session-Search fully usable on both macOS and Windows, including
one-click "Resume in terminal". The search/index/UI engine is already
cross-platform; this work adds the missing Windows implementations of the
OS-integration points and consolidates all platform-specific logic behind a
single boundary so future features rarely need per-OS work.

Out of scope (YAGNI):

- Windows installer / `electron-builder` packaging.
- Live-terminal focus on Windows (`session-activity.ts` stays stubbed).
- Full Linux parity (Linux only needs to not crash; best-effort fallback).
- Windows `%APPDATA%\Claude` Desktop-app session source (optional source;
  degrades gracefully by absence today).

## Guiding Principle: Single Platform Boundary

All OS integration funnels through **one module** (`src/core/platform.ts`).
Inside that module, each OS-touching operation is a single function whose body
branches on `darwin / win32 / linux`. Business code (`main/index.ts`,
`App.tsx`, `indexer.ts`) calls only platform-neutral function names and must
not contain `process.platform` checks for these operations.

Consequence for future features:

- A feature that does not touch the OS needs **zero** Windows work.
- A feature that touches one of the five OS-integration categories below is
  changed in **exactly one function** in `platform.ts` (add/adjust a branch);
  macOS and business code are untouched, and nothing is missed because the
  entry point is unique.

The five OS-integration categories:

1. Launching external processes (terminals, native apps).
2. OS-specific file paths (e.g. macOS `Library/Application Support`).
3. Global-shortcut default values.
4. Tray / menu / window chrome.
5. Revealing a file in the OS file manager.

This is consolidation, not a new abstraction layer: existing scattered
`process.platform` checks (currently in `main/index.ts` in ~4 places and
`App.tsx`) are pulled toward this boundary where they concern the five
categories above. Window-chrome checks that are inherently tied to
`BrowserWindow` construction may stay in `main/index.ts` but are documented as
the only sanctioned exception.

## Component Changes

### 1. Terminal resume — `src/core/platform.ts` (primary)

Platform-aware **command construction**, extracted so the quoting/chaining
rules live in one place:

- macOS / Linux: unchanged — POSIX form `cd '<path>' && <bin> --resume <id>`
  (existing `shellQuote`).
- Windows: Windows quoting (double quotes); the working directory is passed to
  the terminal via its own start-directory flag rather than being concatenated
  into the command, to avoid cross-shell `cd` chaining differences.

Add a `process.platform === "win32"` branch to `openResumeInTerminal` that
launches the selected Windows terminal with the resume command:

- **Windows Terminal**: `wt.exe -d "<projectPath>" <shell> -NoExit -Command "<resume>"`
  (uses `-d` for the start directory).
- **PowerShell**: prefer `pwsh.exe`, fall back to `powershell.exe`;
  `<pwsh> -NoExit -Command "<resume>"`, launched with `cwd` set to the project
  path.
- **cmd**: `cmd.exe /K "<resume>"`, launched with `cwd` set to the project path.

Launcher availability probe order when the chosen terminal is unavailable:
`wt → pwsh → powershell → cmd`, with a surfaced error if none succeed.

The resume command itself (binary + `--resume <id>` + skip-permission flags) is
identical across platforms; only the wrapping shell invocation and the
directory handling differ.

### 2. Platform-aware terminal settings — `src/core/platform.ts` + `src/renderer/src/App.tsx`

- Extend `AppSettings["defaultTerminal"]` union with
  `"WindowsTerminal" | "PowerShell" | "Cmd"`.
- `DEFAULT_TERMINAL_OPTIONS` in `App.tsx` is filtered by the renderer's
  platform: macOS users see the five macOS terminals; Windows users see the
  three Windows terminals.
- New `normalizeTerminal(setting, platform)`: if the stored value does not
  belong to the current platform (e.g. a config copied between machines), fall
  back to that platform's default (`Terminal` on macOS, `WindowsTerminal` on
  Windows). The renderer needs to know the platform; expose it via the existing
  preload bridge (e.g. `window.sessionSearch.platform` or a small `getPlatform`
  IPC) rather than sniffing the user agent.

### 3. Per-platform global shortcut — `src/core/shortcuts.ts`

- `DEFAULT_GLOBAL_SHORTCUT` becomes platform-derived: `Alt+Space`
  (= Option+Space) on macOS; `Ctrl+Alt+Space` on Windows, because `Alt+Space`
  is reserved by the Windows system menu and registration fails.
- Option labels are platform-aware: show "Option" on macOS, "Alt" on Windows.
- Existing registration-failure messaging is preserved.

### 4. Polish / lower priority

- **Tray icon** (`main/index.ts`): `setTemplateImage(true)` only affects macOS;
  Windows keeps the existing inline SVG (renders acceptably). No `.ico` for now.
- **Claude Desktop sessions**: Windows `%APPDATA%\Claude` not added; CLI
  `~/.claude` and `~/.codex` already resolve on Windows via `os.homedir()`.

## Data Flow

Unchanged. Sessions are read from home dotfile directories (cross-platform),
indexed into the SQLite store at `app.getPath("userData")` (cross-platform),
and searched. Only the *resume* action and *settings defaults* differ by OS,
both behind `platform.ts`.

## Error Handling

- Terminal launch failures throw with a clear, user-facing message
  (consistent with the existing `runProcess` rejection that surfaces
  stderr/stdout). On Windows, an unavailable selected terminal triggers the
  probe-and-fallback chain before erroring.
- Global-shortcut registration failure reuses the existing notification path.

## Testing

- `src/core/platform.test.ts`: add `win32` cases. Given
  `process.platform = "win32"` (or an injected platform parameter) and each
  terminal choice, assert the generated command string / argv is correct. These
  are pure-function assertions; no real process is spawned, matching the
  existing test style.
- Add `normalizeTerminal` unit tests (cross-platform fallback).
- Add `shortcuts` tests for the per-platform default.
- `npm test` and `npm run typecheck` must pass.

## Files Touched

- `src/core/platform.ts` — primary (Windows resume, command construction,
  `normalizeTerminal`, terminal-option metadata).
- `src/core/shortcuts.ts` — per-platform default + labels.
- `src/renderer/src/App.tsx` — platform-filtered terminal options.
- `src/preload/index.ts` + `src/renderer/src/global.d.ts` — expose platform to
  renderer (if not already available).
- `src/main/index.ts` — small: consume per-platform shortcut default; minor
  consolidation of OS-integration `process.platform` checks toward the boundary.
- Tests: `platform.test.ts`, `shortcuts` tests.
