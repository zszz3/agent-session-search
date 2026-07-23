#!/usr/bin/env node
// MCP stdio server exposing the local AgentRecall PostgreSQL database, so
// Claude Code / Codex can recall "how did I solve X before" from past sessions
// and manage them (tag, favorite, visibility).
//
// The query and write functions below are exported and SDK-free so they can be
// unit tested; the MCP wiring is loaded lazily in runServer().

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MAX_RESULTS = 50;
const MAX_MESSAGES = 200;

export function resolveAppVersion(packageUrl = new URL("../package.json", import.meta.url)) {
  try {
    const value = JSON.parse(readFileSync(fileURLToPath(packageUrl), "utf8"));
    return typeof value.version === "string" && value.version ? value.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// Mirrors src/core/app-paths.ts (this file runs standalone, outside the bundle).
export function resolveDatabaseUrl(env = process.env, home = homedir()) {
  const override = env.AGENT_RECALL_DATABASE_URL && env.AGENT_RECALL_DATABASE_URL.trim();
  if (override) return override;
  const pointer = path.join(home, ".agent-recall", "database-url");
  try {
    if (!existsSync(pointer)) return null;
    return readFileSync(pointer, "utf8").trim() || null;
  } catch {
    return null;
  }
}

export const resolveDbPath = resolveDatabaseUrl;

function clamp(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

function searchTerms(query) {
  const terms = [];
  const pattern = /"([^"]+)"|(\S+)/gu;
  for (const match of String(query ?? "").matchAll(pattern)) {
    const value = (match[1] ?? match[2] ?? "").trim();
    if (value) terms.push(value);
  }
  return terms;
}

function likePattern(term) {
  return `%${term.replace(/[\\%_]/gu, (value) => `\\${value}`)}%`;
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

const RESULT_COLUMNS = `
  s.session_key, s.source, s.project_path, s.started_at AS timestamp, s.original_title,
  s.first_question, s.custom_title, s.ai_summary
`;

export async function searchSessions(db, { query = "", source = "", project = "", limit = 20 } = {}) {
  const cap = clamp(limit, 20, MAX_RESULTS);
  const filters = [];
  const params = [];
  if (source) {
    params.push(source);
    filters.push(`s.source = $${params.length}`);
  }
  if (project) {
    params.push(`%${project}%`);
    filters.push(`s.project_path ILIKE $${params.length}`);
  }

  const q = String(query || "").trim();
  if (q) {
    const searchable = `concat_ws(' ', t.search_text, s.original_title, s.first_question, s.custom_title, s.ai_summary)`;
    for (const term of searchTerms(q)) {
      params.push(likePattern(term));
      filters.push(`${searchable} ILIKE $${params.length} ESCAPE '\\'`);
    }
    params.push(q, cap);
    const rows = await db.query(
      `SELECT ${RESULT_COLUMNS},
              max(similarity(lower(t.search_text), lower($${params.length - 1}))) AS score
         FROM agent_recall.sessions s
         JOIN agent_recall.session_turns t ON t.session_key = s.session_key
        WHERE ${filters.join(" AND ")}
        GROUP BY s.session_key
        ORDER BY score DESC, s.file_mtime_ms DESC
        LIMIT $${params.length}`,
      params,
    );
    return rows.rows.map(toResult);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  params.push(cap);
  const rows = await db.query(
    `SELECT ${RESULT_COLUMNS}
       FROM agent_recall.sessions s
       ${where}
      ORDER BY s.file_mtime_ms DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows.rows.map(toResult);
}

export async function getSession(db, { sessionKey, maxMessages = 40, offset = 0 } = {}) {
  if (!sessionKey) return null;
  const row = (await db.query(
    `SELECT ${RESULT_COLUMNS}
       FROM agent_recall.sessions s
      WHERE s.session_key = $1`,
    [sessionKey],
  )).rows[0];
  if (!row) return null;
  const cap = clamp(maxMessages, 40, MAX_MESSAGES);
  const start = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const totalRow = (await db.query(
    `SELECT count(*)::integer AS n
       FROM agent_recall.turn_messages m
       JOIN agent_recall.session_turns t ON t.id = m.turn_id
      WHERE t.session_key = $1`,
    [sessionKey],
  )).rows[0];
  const totalMessages = Number(totalRow?.n ?? 0);
  const messages = (await db.query(
    `SELECT m.role, m.content
       FROM agent_recall.turn_messages m
       JOIN agent_recall.session_turns t ON t.id = m.turn_id
      WHERE t.session_key = $1
      ORDER BY t.turn_index, m.message_index
      LIMIT $2 OFFSET $3`,
    [sessionKey, cap, start],
  )).rows;
  const nextOffset = start + messages.length < totalMessages
    ? start + messages.length
    : null;
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

export async function listProjects(db) {
  const result = await db.query(
    `SELECT project_path, count(*)::integer AS sessions
       FROM agent_recall.sessions
      WHERE project_path <> ''
      GROUP BY project_path
      ORDER BY sessions DESC
      LIMIT 100`,
  );
  return result.rows.map((row) => ({ project: row.project_path, sessions: Number(row.sessions) }));
}

export async function listTags(db) {
  return (await db.query("SELECT name FROM agent_recall.tags ORDER BY lower(name)")).rows
    .map((row) => row.name);
}

// Returns the most recently active sessions (by file mtime / last activity).
// This lets an agent find "the session I'm currently in" or "my latest codex
// session" without a sessionKey — the missing piece for natural-language
// migration like "把这次会话迁移到 claude".
export async function getLatestSessions(db, { source = "", projectPath = "", limit = 5 } = {}) {
  const cap = clamp(limit, 1, 20);
  const filters = [];
  const params = [];
  if (source) {
    params.push(source);
    filters.push(`s.source = $${params.length}`);
  }
  if (projectPath) {
    params.push(`%${projectPath}%`);
    filters.push(`s.project_path ILIKE $${params.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  params.push(cap);
  const rows = await db.query(
    `SELECT ${RESULT_COLUMNS}
       FROM agent_recall.sessions s
       ${where}
      ORDER BY s.file_mtime_ms DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows.rows.map(toResult);
}

// --- Write operations -----------------------------------------------------
// These mirror the semantics of SessionStore's write methods, reimplemented in
// raw SQL because this bin runs standalone (outside the app bundle) and can't
// import SessionStore. All are idempotent.

async function sessionExists(db, sessionKey) {
  return (await db.query(
    "SELECT 1 FROM agent_recall.sessions WHERE session_key = $1",
    [sessionKey],
  )).rows.length > 0;
}

async function currentTags(db, sessionKey) {
  return (await db.query(
    `SELECT tags.name
       FROM agent_recall.session_tags
       JOIN agent_recall.tags ON tags.id = session_tags.tag_id
      WHERE session_tags.session_key = $1
      ORDER BY lower(tags.name)`,
    [sessionKey],
  )).rows.map((row) => row.name);
}

// Drop a tag from the tags table once no session references it (matches
// SessionStore.deleteUnusedTag), so removing the last use doesn't leave orphans.
async function deleteUnusedTag(db, tagName) {
  await db.query(
    `DELETE FROM agent_recall.tags
      WHERE name = $1
        AND NOT EXISTS (
          SELECT 1
            FROM agent_recall.session_tags
           WHERE session_tags.tag_id = tags.id
        )`,
    [tagName],
  );
}

export async function tagSession(db, { sessionKey, action, tag } = {}) {
  if (!sessionKey || !await sessionExists(db, sessionKey)) return { ok: false, error: "Session not found." };
  const name = String(tag ?? "").trim();
  if (!name) return { ok: false, error: "Tag must not be empty." };
  if (action !== "add" && action !== "remove") return { ok: false, error: 'action must be "add" or "remove".' };

  if (action === "add") {
    await db.query(
      "INSERT INTO agent_recall.tags (name) VALUES ($1) ON CONFLICT(name) DO NOTHING",
      [name],
    );
    await db.query(
      `INSERT INTO agent_recall.session_tags (session_key, tag_id)
       SELECT $1, id FROM agent_recall.tags WHERE name = $2
       ON CONFLICT DO NOTHING`,
      [sessionKey, name],
    );
  } else {
    await db.query(
      `DELETE FROM agent_recall.session_tags
        WHERE session_key = $1
          AND tag_id = (SELECT id FROM agent_recall.tags WHERE name = $2)`,
      [sessionKey, name],
    );
    await deleteUnusedTag(db, name);
  }
  return { ok: true, sessionKey, action, tag: name, tags: await currentTags(db, sessionKey) };
}

export async function toggleFavorite(db, { sessionKey, favorited } = {}) {
  if (!sessionKey || !await sessionExists(db, sessionKey)) return { ok: false, error: "Session not found." };
  await db.query(
    "UPDATE agent_recall.sessions SET favorited = $1 WHERE session_key = $2",
    [Boolean(favorited), sessionKey],
  );
  return { ok: true, sessionKey, favorited: Boolean(favorited) };
}

// Visibility is not a single column: it's derived from independent favorited /
// pinned / hidden flags (see App.tsx ViewMode). Each call sets the requested
// dimension and clears what would otherwise hide the session from that view,
// without disturbing unrelated flags (e.g. favoriting doesn't unpin).
export async function setVisibility(db, { sessionKey, visibility } = {}) {
  if (!sessionKey || !await sessionExists(db, sessionKey)) return { ok: false, error: "Session not found." };
  switch (visibility) {
    case "default":
      // Return to the normal list: un-hide and un-pin, leave favorite as-is.
      await db.query(
        "UPDATE agent_recall.sessions SET hidden = false, pinned = false WHERE session_key = $1",
        [sessionKey],
      );
      break;
    case "favorites":
      await db.query(
        "UPDATE agent_recall.sessions SET favorited = true, hidden = false WHERE session_key = $1",
        [sessionKey],
      );
      break;
    case "pinned":
      await db.query(
        "UPDATE agent_recall.sessions SET pinned = true, hidden = false WHERE session_key = $1",
        [sessionKey],
      );
      break;
    case "hidden":
      await db.query(
        "UPDATE agent_recall.sessions SET hidden = true WHERE session_key = $1",
        [sessionKey],
      );
      break;
    default:
      return { ok: false, error: 'visibility must be one of "default", "favorites", "hidden", "pinned".' };
  }
  const row = (await db.query(
    "SELECT favorited, pinned, hidden FROM agent_recall.sessions WHERE session_key = $1",
    [sessionKey],
  )).rows[0];
  return {
    ok: true,
    sessionKey,
    visibility,
    favorited: row.favorited === true,
    pinned: row.pinned === true,
    hidden: row.hidden === true,
  };
}

// The migration logic lives in src/core/mcp-migration.ts and is bundled (via
// scripts/build-mcp-bundle.mjs) so this standalone bin can call it without
// --experimental-strip-types. The bundle is resolved relative to this file.
let migrationBundle = null;

function validateMigrationBundle(bundle) {
  if (
    !Array.isArray(bundle?.MIGRATION_TARGET_IDS) ||
    bundle.MIGRATION_TARGET_IDS.length === 0 ||
    !bundle.MIGRATION_TARGET_IDS.every((value) => typeof value === "string")
  ) {
    throw new Error("migration bundle is missing MIGRATION_TARGET_IDS");
  }
  for (const name of ["isMigrationTarget", "openMcpSessionStore", "migrateSessionForMcp"]) {
    if (typeof bundle[name] !== "function") {
      throw new Error(`migration bundle is missing ${name}`);
    }
  }
}

async function loadMigrationBundle() {
  if (migrationBundle) return migrationBundle;
  const candidates = [
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "out", "mcp", "migration-entry.js"),
    path.join(path.dirname(fileURLToPath(import.meta.url)), "migration-entry.js"),
  ];
  let lastError = null;
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const candidateBundle = await import(pathToFileURL(candidate).href);
      validateMigrationBundle(candidateBundle);
      migrationBundle = candidateBundle;
      return migrationBundle;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    "MCP migration bundle not found. Run `npm run build:mcp` first." +
    (lastError ? ` (${lastError instanceof Error ? lastError.message : String(lastError)})` : ""),
  );
}

// SDK-free wrapper. It opens a typed SessionStore over the same PostgreSQL
// endpoint and delegates to the bundled migration facade.
export async function migrateSession(connectionUrl, { sessionKey, target } = {}) {
  if (!sessionKey || typeof sessionKey !== "string") {
    return { ok: false, error: "sessionKey is required." };
  }
  const bundle = await loadMigrationBundle();
  if (!bundle.isMigrationTarget(target)) {
    return { ok: false, error: `target must be one of ${bundle.MIGRATION_TARGET_IDS.map((value) => `"${value}"`).join(", ")}.` };
  }
  if (!connectionUrl || typeof connectionUrl !== "string") {
    return { ok: false, error: "PostgreSQL connection URL is unavailable." };
  }
  const store = await bundle.openMcpSessionStore(connectionUrl);
  try {
    const result = await bundle.migrateSessionForMcp(
      { sessionKey, target },
      { store },
    );
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await store.close().catch(() => undefined);
  }
}

// This is the same schema used by runServer's migrate_session registration.
// Its values come from the bundled core registry, keeping the standalone MCP
// boundary in lock-step with the typed migration facade.
export async function migrationTargetSchema(zod) {
  const bundle = await loadMigrationBundle();
  return zod.enum(bundle.MIGRATION_TARGET_IDS);
}

function jsonContent(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function errorContent(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function runServer() {
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    process.stderr.write(
      "AgentRecall PostgreSQL endpoint not found. Open the app, or set AGENT_RECALL_DATABASE_URL.\n",
    );
    process.exit(1);
  }

  const { Pool } = await import("pg");
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { z } = await import("zod");

  const db = new Pool({
    connectionString: databaseUrl,
    max: 3,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    application_name: "agent-recall-mcp",
  });
  await db.query("SELECT 1");
  const server = new McpServer({ name: "agent-recall", version: resolveAppVersion() });
  let migrateTargetSchema = null;
  try {
    migrateTargetSchema = await migrationTargetSchema(z);
  } catch (error) {
    process.stderr.write(
      `agent-recall MCP migration tools disabled: ${error instanceof Error ? error.message : String(error)}. ` +
        "Run `npm run build:mcp` in the AgentRecall install directory, then restart the MCP client.\n",
    );
  }

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
    async (args) => jsonContent(await searchSessions(db, args)),
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
      const result = await getSession(db, args);
      return result ? jsonContent(result) : { content: [{ type: "text", text: "Session not found." }], isError: true };
    },
  );

  server.registerTool(
    "list_projects",
    { description: "List indexed projects with session counts, to scope a search.", inputSchema: {} },
    async () => jsonContent(await listProjects(db)),
  );

  server.registerTool(
    "list_tags",
    { description: "List all tags, to scope a search.", inputSchema: {} },
    async () => jsonContent(await listTags(db)),
  );

  server.registerTool(
    "get_latest_sessions",
    {
      description:
        "获取最近活跃的会话（按修改时间倒序）。Get the most recently active sessions by mtime. " +
        "用于找到「当前会话」「最近的 codex/claude 会话」等，不需要 sessionKey。" +
        "典型场景：用户说「把这次会话迁移到 claude」「迁移最近的 codex 会话」时，" +
        "先调本工具拿到 sessionKey，再调 migrate_session。" +
        "可选按 source（如 codex-cli、claude-cli）和 projectPath 过滤。",
      inputSchema: {
        source: z.string().describe("Optional source filter, e.g. codex-cli or claude-cli.").optional(),
        projectPath: z.string().describe("Optional project path substring to filter by.").optional(),
        limit: z.number().describe("Max results (1-20, default 5).").optional(),
      },
    },
    async (args) => jsonContent(await getLatestSessions(db, args)),
  );

  server.registerTool(
    "tag_session",
    {
      description:
        "Add or remove a tag on a session. Use to mark sessions (e.g. 'important', 'review'). Idempotent. Returns the session's current tags.",
      inputSchema: {
        sessionKey: z.string().describe("The sessionKey from search_sessions."),
        action: z.enum(["add", "remove"]).describe("Whether to add or remove the tag."),
        tag: z.string().describe("Tag name, e.g. 'important'."),
      },
    },
    async (args) => {
      const result = await tagSession(db, args);
      return result.ok ? jsonContent(result) : errorContent(result.error);
    },
  );

  server.registerTool(
    "toggle_favorite",
    {
      description: "Favorite or unfavorite a session. Idempotent — set favorited to the desired final state.",
      inputSchema: {
        sessionKey: z.string().describe("The sessionKey from search_sessions."),
        favorited: z.boolean().describe("true to favorite, false to unfavorite."),
      },
    },
    async (args) => {
      const result = await toggleFavorite(db, args);
      return result.ok ? jsonContent(result) : errorContent(result.error);
    },
  );

  server.registerTool(
    "set_visibility",
    {
      description:
        "Set a session's visibility dimension. 'default' un-hides and un-pins; 'favorites' favorites it; 'pinned' pins it; 'hidden' hides it. These flags are independent (favoriting does not unpin), so this sets the chosen dimension rather than toggling exclusively.",
      inputSchema: {
        sessionKey: z.string().describe("The sessionKey from search_sessions."),
        visibility: z.enum(["default", "favorites", "hidden", "pinned"]).describe("Target visibility."),
      },
    },
    async (args) => {
      const result = await setVisibility(db, args);
      return result.ok ? jsonContent(result) : errorContent(result.error);
    },
  );

  if (migrateTargetSchema) {
    server.registerTool(
      "migrate_session",
    {
      description:
        "跨 Agent 迁移会话（Migrate session across agents）。把一个本地会话（Claude Code / Codex / CodeBuddy / CodeWiz）迁移到另一个目标 Agent，生成目标 Agent 能直接 resume 的会话文件。" +
        "典型场景：用户说「把这个会话迁移到 Claude/Codex/CodeBuddy」「把当前对话搬过去」「迁移会话」时调用此工具。" +
        "流程：先用 search_sessions 找到源会话的 sessionKey，再调用本工具传入 sessionKey 和 target。" +
        "迁移完成后返回 resumeCommand（如 cd /repo && claude --resume <id>），launched 恒为 false，需要用户自行在终端执行该命令。" +
        "四个可选目标 tclaude、tcodex、claude-internal、codex-internal 必须先在 Settings > Optional sources 中启用。" +
        "仅支持本地会话（environmentKind=local），远程会话不可迁移。",
      inputSchema: {
        sessionKey: z.string().describe("要迁移的源会话 sessionKey，可通过 search_sessions 获取。"),
        target: migrateTargetSchema.describe("目标 Agent：claude、codex、codebuddy、codewiz、cursor、tclaude、tcodex、claude-internal 或 codex-internal。四个可选目标需先在 Settings > Optional sources 启用。"),
      },
    },
    async (args) => {
      const result = await migrateSession(databaseUrl, args);
      return result.ok ? jsonContent(result) : errorContent(result.error);
    },
    );
  }

  const close = async () => {
    await db.end().catch(() => undefined);
  };
  process.once("SIGINT", () => void close().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void close().finally(() => process.exit(0)));
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  runServer().catch((error) => {
    process.stderr.write(`agent-recall MCP server failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
