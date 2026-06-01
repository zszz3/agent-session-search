# Agent-Session-Search

[English](./docs/README.en.md)

Agent-Session-Search 是一个本地桌面工具，用来搜索、整理和恢复 Claude Code 与 Codex 的历史会话。

它会读取本机已有的 Claude / Codex session 文件，建立本地搜索索引，并允许你给每个 session 添加自定义标题、标签、置顶和隐藏状态。这些额外信息都存放在独立的本地 SQLite 数据库里，不会修改原始 session 文件。

## 功能

- 在一个桌面应用里统一搜索 Claude Code 和 Codex 会话。
- 支持全文搜索：自定义标题、原始标题、首个用户问题、会话正文和项目路径。
- 支持给 session 添加自定义标题和标签。
- 支持按项目、标签、来源、置顶状态、隐藏状态过滤。
- 支持从 Terminal、iTerm、Ghostty、WezTerm 或 Warp 恢复会话。
- 支持复制 resume 命令，或导出会话内容。
- 支持从菜单栏刷新本地索引。
- macOS 下默认使用 `Option+Space` 唤起窗口。

## 支持的数据源

| 来源 | 本地文件 |
| --- | --- |
| Codex CLI | `~/.codex/sessions/**/*.jsonl` |
| Codex Desktop | `~/.codex/sessions/**/*.jsonl`，通过 session metadata 识别 |
| Claude Code CLI | `~/.claude/projects/*/*.jsonl`，以及可选的 `~/.claude/sessions/*.json` 元数据 |
| Claude Desktop app | `~/Library/Application Support/Claude/claude-code-sessions/**/local_*.json`，以及 Claude Code 项目日志 |

当 `~/.codex/session_index.jsonl` 存在时，应用会读取 Codex 的标题元数据。没有上游标题时，会使用第一个有效用户问题作为默认标题。

## 数据边界

Agent-Session-Search 会把两类数据分开处理：

- Claude / Codex 的原始 session 文件只作为只读输入。
- 自定义标题、标签、置顶、隐藏状态和搜索索引存放在 Electron `userData` 目录下的本地 SQLite 数据库中。

SQLite 数据库属于运行时状态，不应该提交到 git。

## 开发环境

要求：

- macOS
- Node.js 22.13 或更高版本
- npm

安装依赖：

```bash
npm install
```

运行测试：

```bash
npm test
```

启动开发版桌面应用：

```bash
npm run dev
```

构建应用：

```bash
npm run build
```

## SQLite 说明

项目使用 Node/Electron 内置的 `node:sqlite`，不需要安装或 rebuild 原生 SQLite npm 模块。

如果使用 nvm，可以在仓库根目录执行：

```bash
nvm use
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动 Electron 开发版应用 |
| `npm test` | 运行测试 |
| `npm run typecheck` | 执行 TypeScript 类型检查 |
| `npm run build` | 类型检查并构建 Electron 应用 |

## 仓库文档

- `README.md`：中文项目说明，面向普通读者和开发者。
- `docs/README.en.md`：英文项目说明。
- `Install.md`：面向 Coding Agent 的安装执行文档，用于让 agent 安全地初始化项目环境。
