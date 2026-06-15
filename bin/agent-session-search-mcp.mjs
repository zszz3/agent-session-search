#!/usr/bin/env node
// MCP stdio server exposing the local agent-session-search database read-only,
// so Claude Code / Codex can recall "how did I solve X before" from past sessions.
//
// The query functions below are exported and SDK-free so they can be unit tested;
// the MCP wiring is loaded lazily in runServer().

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_RESULTS = 50;
const MAX_MESSAGES = 200;

// Mirrors src/core/app-paths.ts (this file runs standalone, outside the bundle).
export function resolveDbPath(env = process.env, home = homedir()) {
  const override = env.AGENT_SESSION_SEARCH_DB && env.AGENT_SESSION_SEARCH_DB.trim();
  if (override) return override;
  const pointer = path.join(home, ".agent-session-search", "db-path");
  try {
    if (!existsSync(pointer)) return null;
    return readFileSync(pointer, "utf8").trim() || null;
  } catch {
    return null;
  }
}

function clamp(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

// Quote each term so user input cannot break FTS5 MATCH syntax; terms AND together.
function ftsMatchExpr(query) {
  const terms = query
    .split(/\s+/)
    .map((term) => term.replace(/["']/g, "").trim())
    .filter(Boolean);
  return terms.length ? terms.map((term) => `"${term}"`).join(" ") : '""';
}

function toResult(row) {
  return {
    sessionKey: row.session_key,
    title: row.custom_title || row.first_question || row.original_title || "Untitled Session",
    source: row.source,
    project: row.project_path,
    timestamp: new Date(row.timestamp).toISOString(),
    summary: (row.ai_summary && row.ai_summary.trim()) || null,
  };
}

const BASE_COLUMNS = ["session_key", "source", "project_path", "timestamp", "original_title", "first_question", "custom_title"];

// ai_summary only exists once the app has migrated the DB; tolerate an older DB
// (the MCP server is read-only and cannot migrate it itself).
function hasColumn(db, table, column) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  } catch {
    return false;
  }
}

function resultColumns(db, prefix = "") {
  const summary = hasColumn(db, "sessions", "ai_summary") ? `${prefix}ai_summary` : "NULL AS ai_summary";
  return [...BASE_COLUMNS.map((c) => `${prefix}${c}`), summary].join(", ");
}

export function searchSessions(db, { query = "", source = "", project = "", limit = 20 } = {}) {
  const cap = clamp(limit, 20, MAX_RESULTS);
  const filters = [];
  const params = [];
  if (source) {
    filters.push("s.source = ?");
    params.push(source);
  }
  if (project) {
    filters.push("s.project_path LIKE ?");
    params.push(`%${project}%`);
  }

  const q = String(query || "").trim();
  if (q) {
    const where = ["session_fts MATCH ?", ...filters].join(" AND ");
    const rows = db
      .prepare(
        `SELECT ${resultColumns(db, "s.")}
         FROM session_fts JOIN sessions s ON s.session_key = session_fts.session_key
         WHERE ${where}
         ORDER BY rank
         LIMIT ?`,
      )
      .all(ftsMatchExpr(q), ...params, cap);
    return rows.map(toResult);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT ${resultColumns(db, "s.")} FROM sessions s ${where} ORDER BY s.file_mtime_ms DESC LIMIT ?`)
    .all(...params, cap);
  return rows.map(toResult);
}

export function getSession(db, { sessionKey, maxMessages = 40, offset = 0 } = {}) {
  if (!sessionKey) return null;
  const row = db.prepare("SELECT * FROM sessions WHERE session_key = ?").get(sessionKey);
  if (!row) return null;
  const cap = clamp(maxMessages, 40, MAX_MESSAGES);
  const start = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const totalRow = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE session_key = ?").get(sessionKey);
  const totalMessages = totalRow?.n ?? 0;
  const messages = db
    .prepare("SELECT role, content FROM messages WHERE session_key = ? ORDER BY message_index LIMIT ? OFFSET ?")
    .all(sessionKey, cap, start);
  const nextOffset = start + messages.length < totalMessages ? start + messages.length : null;
  return {
    ...toResult(row),
    totalMessages,
    offset: start,
    returned: messages.length,
    // Non-null when the session has more messages; pass it back as `offset` to continue.
    nextOffset,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
}

export function listProjects(db) {
  return db
    .prepare(
      "SELECT project_path, COUNT(*) AS sessions FROM sessions WHERE project_path <> '' GROUP BY project_path ORDER BY sessions DESC LIMIT 100",
    )
    .all()
    .map((row) => ({ project: row.project_path, sessions: row.sessions }));
}

export function listTags(db) {
  return db.prepare("SELECT name FROM tags ORDER BY lower(name)").all().map((row) => row.name);
}

function jsonContent(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

async function runServer() {
  const dbPath = resolveDbPath();
  if (!dbPath || !existsSync(dbPath)) {
    process.stderr.write(
      "agent-session-search database not found. Open the app at least once, or set AGENT_SESSION_SEARCH_DB.\n",
    );
    process.exit(1);
  }

  const { DatabaseSync } = await import("node:sqlite");
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { z } = await import("zod");

  const db = new DatabaseSync(dbPath, { readOnly: true });
  const server = new McpServer({ name: "agent-session-search", version: "0.1.0" });

  server.registerTool(
    "search_sessions",
    {
      description:
        "Search past AI coding sessions (Claude Code, Codex, etc.) by keywords. Matches titles, first questions, transcripts, and AI summaries. Use this to recall how a problem was solved before.",
      inputSchema: {
        query: z.string().describe("Keywords to search for.").optional(),
        source: z.string().describe("Optional source filter, e.g. claude-cli or codex-cli.").optional(),
        project: z.string().describe("Optional substring match on the project path.").optional(),
        limit: z.number().describe("Max results (1-50, default 20).").optional(),
      },
    },
    async (args) => jsonContent(searchSessions(db, args)),
  );

  server.registerTool(
    "get_session",
    {
      description:
        "Fetch a single session's metadata, AI summary, and messages by sessionKey. Returns messages from `offset` (default 0); for long sessions use the returned `nextOffset` as the next `offset` to page through the rest.",
      inputSchema: {
        sessionKey: z.string().describe("The sessionKey from search_sessions."),
        maxMessages: z.number().describe("Max messages to return (1-200, default 40).").optional(),
        offset: z.number().describe("Message index to start from (default 0). Use nextOffset from a previous call to continue.").optional(),
      },
    },
    async (args) => {
      const result = getSession(db, args);
      return result ? jsonContent(result) : { content: [{ type: "text", text: "Session not found." }], isError: true };
    },
  );

  server.registerTool(
    "list_projects",
    { description: "List indexed projects with session counts, to scope a search.", inputSchema: {} },
    async () => jsonContent(listProjects(db)),
  );

  server.registerTool(
    "list_tags",
    { description: "List all tags, to scope a search.", inputSchema: {} },
    async () => jsonContent(listTags(db)),
  );

  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  runServer().catch((error) => {
    process.stderr.write(`agent-session-search MCP server failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
