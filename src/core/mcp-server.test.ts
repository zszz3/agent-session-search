import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { PostgresDatabase } from "./postgres/database";
import { POSTGRES_MIGRATIONS } from "./postgres/schema";
import { PGliteTestPool } from "./postgres/test-pglite";
import { PostgresSessionRepository } from "./postgres/session-repository";
import type { IndexedSession, SessionMessage } from "./types";
// The standalone MCP is JavaScript by design.
// @ts-expect-error no declaration file for the packaged executable
import * as mcp from "../../bin/agent-recall-mcp.mjs";

function indexedSession(
  sessionKey: string,
  projectPath: string,
  fileMtimeMs: number,
): IndexedSession {
  return {
    sessionKey,
    rawId: sessionKey,
    source: "codex-cli",
    projectPath,
    filePath: `/fixtures/${sessionKey}.jsonl`,
    originalTitle: "Authentication repair",
    firstQuestion: "How do I fix the login cache?",
    timestamp: Date.parse("2026-07-23T08:00:00.000Z") + fileMtimeMs,
    fileMtimeMs,
    fileSize: 100,
    prUrl: null,
    prNumber: null,
  };
}

function message(role: SessionMessage["role"], content: string, index: number): SessionMessage {
  return {
    role,
    content,
    index,
    timestamp: new Date(Date.parse("2026-07-23T08:00:00.000Z") + index * 1_000).toISOString(),
  };
}

describe("PostgreSQL MCP data facade", () => {
  let database: PostgresDatabase;
  let sessions: PostgresSessionRepository;

  beforeEach(async () => {
    database = new PostgresDatabase(new PGliteTestPool(), {
      migrationLock: false,
      migrations: POSTGRES_MIGRATIONS,
    });
    await database.initialize();
    sessions = new PostgresSessionRepository(database);
    await sessions.upsertIndexedSession(
      indexedSession("codex:auth", "/projects/auth", 20),
      [
        message("user", "login cache expired", 0),
        message("assistant", "refresh the token cache", 1),
        message("user", "verify the retry path", 2),
        message("assistant", "retry now succeeds", 3),
      ],
    );
    await sessions.upsertIndexedSession(
      indexedSession("codex:other", "/projects/other", 10),
      [message("user", "unrelated work", 0)],
    );
  });

  afterEach(async () => {
    await database.close();
  });

  it("searches Turns but returns deduplicated Session results", async () => {
    const results = await mcp.searchSessions(database, { query: "retry", limit: 10 });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      sessionKey: "codex:auth",
      project: "/projects/auth",
    });
  });

  it("pages messages and lists projects", async () => {
    const first = await mcp.getSession(database, {
      sessionKey: "codex:auth",
      maxMessages: 2,
    });
    expect(first).toMatchObject({
      totalMessages: 4,
      returned: 2,
      nextOffset: 2,
    });
    const second = await mcp.getSession(database, {
      sessionKey: "codex:auth",
      maxMessages: 2,
      offset: 2,
    });
    expect(second.messages.map((item: { content: string }) => item.content)).toEqual([
      "verify the retry path",
      "retry now succeeds",
    ]);
    expect((await mcp.listProjects(database)).map((item: { project: string }) => item.project))
      .toEqual(["/projects/auth", "/projects/other"]);
  });

  it("updates tags, favorites, and visibility idempotently", async () => {
    await mcp.tagSession(database, {
      sessionKey: "codex:auth",
      action: "add",
      tag: "important",
    });
    const duplicate = await mcp.tagSession(database, {
      sessionKey: "codex:auth",
      action: "add",
      tag: "important",
    });
    expect(duplicate.tags).toEqual(["important"]);

    expect(await mcp.toggleFavorite(database, {
      sessionKey: "codex:auth",
      favorited: true,
    })).toMatchObject({ ok: true, favorited: true });
    expect(await mcp.setVisibility(database, {
      sessionKey: "codex:auth",
      visibility: "hidden",
    })).toMatchObject({ ok: true, hidden: true });
  });

  it("resolves the private endpoint pointer and migration target schema", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agent-recall-mcp-"));
    try {
      const pointerDirectory = path.join(home, ".agent-recall");
      fs.mkdirSync(pointerDirectory);
      fs.writeFileSync(
        path.join(pointerDirectory, "database-url"),
        "postgresql://agent_recall:test@127.0.0.1:5432/agent_recall\n",
      );
      expect(mcp.resolveDatabaseUrl({}, home)).toContain("postgresql://");
      expect(mcp.resolveDatabaseUrl({
        AGENT_RECALL_DATABASE_URL: "postgresql://override/db",
      }, home)).toBe("postgresql://override/db");

      const schema = await mcp.migrationTargetSchema(z);
      expect(schema.parse("codex")).toBe("codex");
      expect(() => schema.parse("gemini")).toThrow();
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
