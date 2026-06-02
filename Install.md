# Agent-Session-Search Install

## 安装并使用（给使用者）

进入仓库目录后，先确认 Node.js 22 可用，再安装依赖、构建并注册全局命令：

```bash
nvm install 22
nvm use 22
npm ci
npm run build
npm install -g .
```

如果你不用 nvm，只要本机 `node --version` 是 22.13 或更高版本，可以直接从 `npm ci` 开始执行。

装好后，在任意终端运行即可启动：

```bash
agent-session-search
```

应用启动后常驻后台（菜单栏有图标），默认按 **⌥ Option + Space** 唤起搜索窗口；如果和 Raycast 等工具冲突，可以在 Settings 里修改或关闭全局快捷键。Settings 也可以用 `Cmd+,` 打开，Appearance 里可以切换明暗主题和 English / 中文界面。

### 后续启动还要 `nvm use 22` 吗？

不需要重新执行 `npm ci`、`npm run build` 或 `npm install -g .`。日常启动只需要：

```bash
agent-session-search
```

如果新终端里提示 `agent-session-search: command not found`，通常是因为全局命令安装在 nvm 的 Node 22 目录下，但当前 shell 没有选中 Node 22。可以二选一：

```bash
nvm use 22
agent-session-search
```

或者一次性把 Node 22 设成 nvm 默认版本，之后新终端就不需要手动 `nvm use 22`：

```bash
nvm alias default 22
```

如果你不用 nvm，而是系统里直接安装了 Node.js 22.13+，后续启动也不需要任何 nvm 命令。

> ⚠️ **请勿删除或移动这个仓库目录。** `npm install -g .` 注册的全局命令是一个指向本仓库的符号链接（npm 对本地目录安装的默认行为），它在运行时会从仓库内的 `node_modules` 加载 Electron 与构建产物 `out/`。如果之后删除、改名或移动了仓库，全局 `agent-session-search` 命令会因为链接失效而无法启动。需要换位置时，请在新位置重新执行一次安装命令。

### Windows

先安装 Node.js 22.13+（从 <https://nodejs.org> 下载 LTS 安装包，或使用 nvm-windows）。确认 `node --version` ≥ 22.13 后，在仓库目录里用 PowerShell 执行：

```powershell
npm ci
npm run build
npm install -g .
```

装好后在任意终端运行 `agent-session-search` 即可启动。应用常驻后台（系统托盘有图标），默认按 **Ctrl + Alt + Space** 唤起搜索窗口（Windows 下 `Alt+Space` 被系统窗口菜单占用，故默认用 `Ctrl+Alt+Space`）；可在 Settings 里修改或关闭。

Resume 会在所选终端里打开恢复命令；设置中可选 **Windows Terminal / PowerShell / Command Prompt**，默认优先 Windows Terminal，未安装时自动回退到 PowerShell 或 cmd。

下载 Electron 慢时，可在安装前设置镜像（PowerShell）：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
```

> ⚠️ 同样**请勿删除或移动仓库目录**：`npm install -g .` 在 Windows 上注册的全局命令是指向本仓库的 junction，移动或删除后命令会失效。

### 要求

- macOS 或 Windows
- Node.js 22.13 或更高版本（含 npm）

温馨提示：Electron binary 默认从 GitHub release 下载。如果下载很慢或失败，可在安装前设置镜像后再执行安装命令：

```bash
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
```

### 更新到新版本

先拉取最新代码，再重新跑安装命令：

```bash
git pull --ff-only
nvm install 22
nvm use 22
npm ci
npm run build
npm install -g .
```

### 卸载

```bash
npm uninstall -g agent-session-search
```

### 备选：从源码克隆安装

如果还没有本地仓库，先克隆：

```bash
git clone https://github.com/zszz3/agent-session-search.git
```

---

## 给编码 Agent 的引导

This section is for coding agents. If the Agent-Session-Search repository is not already cloned and open, clone `https://github.com/zszz3/agent-session-search.git` first, then continue from the repository root.

## Goal

Bootstrap a local development workspace for Agent-Session-Search with the least risky path available.

Default preference:

1. Install dependencies from the lockfile with npm.
2. Verify the app with tests and type checks.
3. Start the Electron development app only when the user asks to run it.

## Success Criteria

- The repository root is confirmed by checking `package.json`, `src/`, and `electron.vite.config.ts`.
- `node_modules/` exists after `npm ci`.
- `npm test` passes.
- `npm run typecheck` passes.
- `npm run build` passes when the user wants a build verification.
- The user receives the exact command to launch the development app.
- No Claude or Codex source session files are modified.
- No runtime SQLite database is committed to git.

## Operating Rules

- Be idempotent. Re-running this document should not damage an existing setup.
- Prefer package scripts over ad hoc shell commands.
- Do not use `sudo` or install system packages without explicit user approval.
- Do not run `npm audit fix`, dependency upgrades, formatters, or broad refactors unless the user asks.
- Do not delete `node_modules/`, build output, Electron user data, or existing SQLite databases unless the user asks.
- Do not read or print secret-bearing files such as `.env`, shell profiles, or private Claude/Codex configuration files.
- Treat Claude and Codex session files as read-only input.
- If a command fails, stop, report the smallest blocker, and provide the next command that would unblock setup.
- If a development server or Electron process is started for verification, do not leave it running after the task is complete unless the user asked for a persistent app session.

## Prerequisites

Expected tools:

- Node.js 22.13 or newer
- npm
- Git
- macOS for the current desktop workflow

Important dependency note:

- The app depends on Electron 42+ because the runtime must expose built-in `node:sqlite`.
- Do not add `better-sqlite3` or other native SQLite packages as an install workaround.
- A first-time install may download an Electron binary around 100MB+. This is expected and does not require Xcode.

Check versions:

```bash
node --version
npm --version
git --version
```

If nvm is available, use the repository version before installing dependencies:

```bash
nvm use
```

The project uses Electron's built-in `node:sqlite`, so it does not need native SQLite npm rebuilds.

## Install Steps

1. Confirm the repository root:

   ```bash
   test -f package.json && test -d src && test -f electron.vite.config.ts
   ```

2. Install dependencies from the lockfile:

   ```bash
   npm ci
   ```

3. Run the test suite:

   ```bash
   npm test
   ```

4. Run TypeScript checks:

   ```bash
   npm run typecheck
   ```

5. Build the app when build verification is requested:

   ```bash
   npm run build
   ```

6. Register the global launch command when installing for daily use:

   ```bash
   npm install -g .
   ```

7. Start the app only when the user asks to run it:

   ```bash
   npm run dev
   ```

## Troubleshooting

### `No such built-in module: node:sqlite`

This means the app is running under an Electron version that is too old for the current SQLite implementation.

Fix:

```bash
npm ci
npm run typecheck
npm run build
```

Confirm Electron exposes SQLite:

```bash
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron -p "process.versions.node + ' sqlite=' + Boolean(process.getBuiltinModule?.('node:sqlite'))"
```

Expected output should include:

```text
sqlite=true
```

Do not fix this by installing `better-sqlite3`; that reintroduces native build tooling requirements.

## Runtime Data Boundary

The app creates a local SQLite database at Electron's `userData` path:

```text
<Electron userData>/session-search.sqlite
```

This database contains the search index and app-only metadata such as custom titles, tags, pinned state, and hidden state. It is runtime state, not source code.

Never commit:

```text
*.sqlite
*.sqlite-shm
*.sqlite-wal
*.db
```

The app should read upstream sessions from these locations when they exist:

```text
~/.codex/sessions/**/*.jsonl
~/.codex/session_index.jsonl
~/.claude/projects/*/*.jsonl
~/.claude/sessions/*.json
~/Library/Application Support/Claude/claude-code-sessions/**/local_*.json
```

Do not edit, rewrite, or delete those source files during installation.

## TODO

- [ ] Confirm the repository root.
- [ ] Install dependencies with `npm ci`.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build` if build verification is requested.
- [ ] Confirm `node:sqlite` is available in Electron if startup fails.
- [ ] Report the exact development launch command: `npm run dev`.
- [ ] Confirm no SQLite database files are staged for commit.

## EXECUTE NOW

Complete the setup steps above. When finished, stop at the setup boundary and report status instead of continuing into feature work, dependency upgrades, or unrelated repository changes.
