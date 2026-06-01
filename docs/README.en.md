# Agent-Session-Search

[中文文档](../README.md)

Agent-Session-Search is a local desktop console for finding, organizing, and resuming Claude Code and Codex sessions.

It indexes existing local session files, lets you add your own titles and tags, and keeps that metadata in a separate local SQLite database. It does not modify the original Claude or Codex session files.

## Features

- Search Claude Code and Codex sessions from one desktop app.
- Full-text search across custom titles, original titles, first user questions, conversation text, and project paths.
- Add custom titles and tags without changing the upstream session files.
- Filter by project, tag, source, pinned sessions, or hidden sessions.
- Resume a session in Terminal, iTerm, Ghostty, WezTerm, or Warp.
- Copy resume commands or conversation exports.
- Refresh the local index from the tray menu.
- Toggle the app with `Option+Space` on macOS.

## Supported Sources

| Source | Local files |
| --- | --- |
| Codex CLI | `~/.codex/sessions/**/*.jsonl` |
| Codex Desktop | `~/.codex/sessions/**/*.jsonl`, detected by session metadata |
| Claude Code CLI | `~/.claude/projects/*/*.jsonl` plus optional `~/.claude/sessions/*.json` metadata |
| Claude Desktop app | `~/Library/Application Support/Claude/claude-code-sessions/**/local_*.json` plus Claude Code project logs |

Codex title metadata is read from `~/.codex/session_index.jsonl` when that file exists. If no upstream title is available, the app uses the first meaningful user question as the default title.

## Data Model

Agent-Session-Search keeps two kinds of data separate:

- Upstream session data stays in the original Claude and Codex files and is treated as read-only input.
- App metadata, including custom titles, tags, pinned state, hidden state, and the search index, is stored in a local SQLite database under Electron's `userData` directory.

The SQLite database is runtime state and is intentionally ignored by git.

## Development Setup

Requirements:

- macOS
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

## SQLite Notes

This project uses Node/Electron's built-in `node:sqlite`, so it does not need a native SQLite npm module or runtime-specific rebuild scripts.

If you use nvm, run this from the repository root:

```bash
nvm use
```

## Useful Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Electron development app |
| `npm test` | Run tests |
| `npm run typecheck` | Run TypeScript checks |
| `npm run build` | Typecheck and build the Electron app |

## Repository Notes

- `README.md` is the Chinese project overview for users and developers.
- `docs/README.en.md` is the English project overview.
- `Install.md` is for Coding Agents that need to set up the repository safely on a user's machine.
