<h1 align="center">Agent-Session-Search</h1>

<p align="center">A local desktop tool to search, organize, inspect, and resume AI coding-agent sessions</p>

<p align="center">
  <a href="../README.md">简体中文</a> ｜ English
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-555555" alt="platform">
  <img src="https://img.shields.io/badge/Electron-42-47848F?logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/Node-%E2%89%A5%2022.13-339933?logo=nodedotjs&logoColor=white" alt="Node">
</p>

<p align="center">
  <img src="../assets/show.png" alt="Agent-Session-Search preview" width="860">
</p>

Agent-Session-Search is a local desktop console for finding, organizing, inspecting, and resuming AI coding-agent sessions.

It indexes existing local Claude and Codex sessions by default, and can also read remote Claude/Codex sessions over SSH. Optional local sources, including CodeBuddy CLI, OpenClaw, Hermes, OpenCode, Cursor Agent, and Trae, can be enabled from Settings -> Optional sources. The app lets you add your own titles and tags, and keeps app metadata in a separate local SQLite database. Indexing and organizing do not modify the original agent session data. Independent source files are deleted only when the user explicitly confirms session deletion; shared Hermes/OpenCode SQLite databases are never deleted as a whole for one session.

## Features

- Search Claude Code, Codex, and enabled optional sources such as CodeBuddy CLI, OpenClaw, Hermes, OpenCode, Cursor Agent, and Trae from one desktop app.
- Full-text search across custom titles, original titles, first user questions, conversation text, and project paths.
- Paginated first load: long session lists render a small page first and load more on demand.
- Add custom titles, tags, favorites, pinned state, and hidden state without changing upstream session files.
- Delete tags and local session source files with confirmation.
- Filter by project, environment, tag, source, open/closed state, pinned sessions, or hidden sessions.
- Sort by latest activity, created time, or updated time.
- Add local and SSH environments; SSH environments can be refreshed manually or kept in sync through remote file watching.
- Resume a session in Terminal, iTerm, Ghostty, WezTerm, or Warp. If a local session is already open, Resume brings the existing terminal window/tab to front instead of starting another `codex resume` / `claude --resume`.
- Copy resume commands or export Markdown.
- Read details with Markdown / code block rendering, collapsed tool traces, and user / assistant / tool message filters.
- Track message and token usage for Today / 7D / 30D / All time.
- Show Codex subscription quota; Claude Code quota can be shown through a statusline snapshot bridge.
- Refresh the local index and usage stats from the tray menu or in-app controls.
- Manage installed Skills: list Codex / Claude Code skills, search, preview, filter by source, copy paths, reveal folders, and delete user skills.
- Track Skill usage: Claude Code uses a PostToolUse hook; Codex usage is inferred from local session function calls that read `SKILL.md`. Usage is indexed in local SQLite and refreshed incrementally after app startup, when the Skills panel opens, and from the manual refresh button.
- Switch Codex / Claude Code API providers with presets for CodexZH, DeepSeek, GLM, LongCat, Kimi, MiMo, plus custom base URL, model, and API key fields.
- Switch between light/dark themes and English/Chinese UI.
- Toggle the app with `Option+Space` on macOS by default; the shortcut can be changed or disabled in Settings.

## Supported Sources

| Source | Local files |
| --- | --- |
| Codex CLI | `~/.codex/sessions/**/*.jsonl` |
| Codex Desktop | `~/.codex/sessions/**/*.jsonl`, detected by session metadata |
| Claude Code CLI | `~/.claude/projects/*/*.jsonl` plus optional `~/.claude/sessions/*.json` metadata |
| Claude Desktop app | `~/Library/Application Support/Claude/claude-code-sessions/**/local_*.json` plus Claude Code project logs |
| CodeBuddy CLI | Optional in settings; reads `~/.codebuddy/projects/**/*.jsonl` |
| OpenClaw | Optional in settings; reads `~/.openclaw/agents/*/sessions/*.jsonl`, legacy `~/.clawdbot/agents/*/sessions/*.jsonl`, excluding `*.trajectory.jsonl` |
| Hermes | Optional in settings; reads `~/.hermes/state.db` |
| OpenCode | Optional in settings; reads `~/.local/share/opencode/opencode.db` |
| Cursor Agent | Optional in settings; reads `~/.cursor/projects/**/agent-transcripts/**/*.jsonl` |
| Trae | Optional in settings; reads `~/.trae-cn/memory/projects/**/session_memory_*.jsonl`; open-state detection reads Trae's local workspace state database |
| SSH remote environment | Reads the same Codex / Claude Code session paths under the remote user's home directory over SSH |

Codex title metadata is read from `~/.codex/session_index.jsonl` when that file exists. If no upstream title is available, the app uses the first meaningful user question as the default title.

CodeBuddy CLI, OpenClaw, Hermes, OpenCode, Cursor Agent, and Trae are off by default and can be selected from Settings -> Optional sources. Once enabled, they support local read-only indexing, search, details, and source filtering. Resume, SSH remote sync, and provider-specific usage stats for these sources are intentionally separate follow-up work. Trae also supports open-state detection.

## Resume Behavior

When you click Resume or press `Cmd/Ctrl+Enter`, the app first checks whether the selected session is already open locally:

- If it is open, the app follows the session process up to its owning terminal process and brings the existing Terminal / iTerm / Ghostty / WezTerm / Warp window to front. Terminal and iTerm try to focus the exact tty window or tab; if tty lookup is unavailable, the app falls back to activating the terminal app.
- If it is not open, the app starts a new restore command in the configured default terminal, such as `codex resume <session-id>` or `claude --resume <session-id>`.
- SSH remote sessions run a remote project-path and CLI preflight first, then execute the remote restore command through `ssh` in the local default terminal.

## SSH Remote Sessions

SSH environments do not require Agent-Session-Search to be installed on the remote machine, and the app does not create a remote database. The local app uses the system `ssh` command, runs a temporary Python collector on the remote host, reads session summaries from remote `~/.codex` and `~/.claude`, then stores those summaries in the local SQLite index.

Remote sync behavior:

- Adding or enabling an SSH environment starts with one full summary sync.
- If `inotifywait` exists on the remote host, the app keeps an SSH watcher open for `~/.codex/sessions`, `~/.codex/session_index.jsonl`, `~/.claude/projects`, and `~/.claude/sessions`.
- If `inotifywait` is missing but `fswatch` exists, it watches `~/.codex` and `~/.claude`.
- If neither watcher is available, it falls back to polling every 60 seconds.
- Remote details are loaded on demand: the list stores summaries first, and the original remote session file is fetched only when that session is opened.

Remote host requirements:

- Non-interactive `ssh` access from the local machine.
- `python3`.
- `inotifywait` or `fswatch` for real-time watching; polling still works without them.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Option+Space` | Show or hide the search window on macOS |
| `Cmd/Ctrl+K` | Focus and select the search box |
| `↑` / `↓` | Move through the main session list |
| `Space` | Open details for the selected session |
| `Enter` | Open details for the selected session when the search box is focused |
| `Cmd/Ctrl+Enter` | Resume the selected session in the default terminal |
| `Cmd/Ctrl+,` | Open Settings |

## Data Model

Agent-Session-Search keeps two kinds of data separate:

- Upstream session data stays in the original agent files or databases and is treated as read-only input while indexing, searching, and tagging. Confirmed deletion removes independent session files, but Hermes and OpenCode use shared SQLite databases, so the app does not delete an entire database for one session.
- SSH remote session files are also treated as read-only input and fetched over SSH only for summaries and on-demand details.
- App metadata, including custom titles, tags, favorites, pinned state, hidden state, the search index, remote environment configuration, Skill usage index, and API provider keys, is stored in a local SQLite database under Electron's `userData` directory.
- Applying Codex / Claude Code provider settings edits the local `~/.codex/config.toml` or `~/.claude/settings.json` using the CLI's native configuration format and writes backups first.

## Installation

### macOS

Requires Node.js 22.13+ (with npm). From the repository root, run these commands to install dependencies, build, and register the global command:

```bash
nvm install 22
nvm use 22
npm ci
npm run build
npm install -g .
```

If you do not use nvm, make sure `node --version` is 22.13 or newer, then start from `npm ci`.

Once installed, run `agent-session-search` from any terminal to launch it. The app stays in the background (with a menu bar icon); press **⌥ Option + Space** by default to open the search window. If it conflicts with Raycast or another launcher, change or disable the global shortcut in Settings.

Settings can also be opened with `Cmd+,`. Use Appearance to switch the color theme and English / Chinese UI.

For daily use, you do not need to reinstall dependencies or rebuild. Just run:

```bash
agent-session-search
```

If a new terminal says `agent-session-search: command not found`, the global command was probably installed under nvm's Node 22 directory while the current shell is using another Node version. Run:

```bash
nvm use 22
agent-session-search
```

Or set Node 22 as your nvm default once:

```bash
nvm alias default 22
```

If you do not use nvm and have Node.js 22.13+ installed system-wide, daily startup does not need any nvm command.

### Windows

With Node.js 22.13+ installed, run this from the repository root in PowerShell:

```powershell
npm ci && npm run build && npm install -g .
```

Once installed, run `agent-session-search` from any terminal to launch it. The app stays in the background (with a taskbar/tray icon); press **Ctrl + Alt + Space** by default to open the search window.

See [Install.md](../Install.md) for updating, uninstalling, installing from a fresh clone, and network mirror tips.

## Development Setup

Requirements:

- macOS or Windows
- Node.js 22.13 or newer
- npm

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Start the desktop app in development mode:

```bash
npm run dev
```

Build the app bundle output:

```bash
npm run build
```

## Repository Notes

- `README.md` is the Chinese project overview for users and developers.
- `docs/README.en.md` is the English project overview.
- `Install.md` covers install, update, and uninstall steps, plus a safe setup guide for Coding Agents.
