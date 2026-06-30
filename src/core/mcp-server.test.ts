import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { SessionStore } from "./session-store";
import type { IndexedSession, SessionMessage } from "./types";
// The MCP server runs standalone; we exercise its SDK-free query functions here.
// The .mjs bin has no type declarations, so we type the imports explicitly.
// @ts-expect-error -- untyped .mjs bin
import * as mcp from "../../bin/agent-session-search-mcp.mjs";

type Db = import("node:sqlite").DatabaseSync;
type SearchResult = { sessionKey: string; project: string; title: string; summary: string | null };
const searchSessions = mcp.searchSessions as (db: Db, args?: Record<string, unknown>) => SearchResult[];
const getSession = mcp.getSession as (
  db: Db,
  args: Record<string, unknown>,
) => (SearchResult & { messages: Array<{ content: string }>; totalMessages: number; returned: number; nextOffset: number | null }) | null;
const listProjects = mcp.listProjects as (db: Db) => Array<{ project: string; sessions: number }>;
const listTags = mcp.listTags as (db: Db) => string[];

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => import("node:sqlite").DatabaseSync };

function seedStore(): { db: import("node:sqlite").DatabaseSync; store: SessionStore } {
  const db = new DatabaseSync(":memory:");
  const store = new SessionStore(db);
  const session = (overrides: Partial<IndexedSession>): IndexedSession => ({
    sessionKey: "codex:abc",
    rawId: "abc",
    source: "codex-cli",
    projectPath: "/repo",
    filePath: "/tmp/a.jsonl",
    originalTitle: "fix login",
    firstQuestion: "fix login expiry bug",
    timestamp: new Date("2026-06-01T10:00:00Z").getTime(),
    fileMtimeMs: 10,
    fileSize: 100,
    prUrl: null,
    prNumber: null,
    ...overrides,
  });
  const messages = (text: string): SessionMessage[] => [
    { role: "user", content: text, timestamp: "2026-06-01T10:00:00Z", index: 0 },
  ];
  store.upsertIndexedSession(session({}), messages("the refresh token expired after 30 minutes"), [], []);
  store.upsertIndexedSession(
    session({ sessionKey: "codex:def", rawId: "def", projectPath: "/other", firstQuestion: "add dark mode toggle", fileMtimeMs: 20 }),
    messages("implement a theme switcher in react"),
    [],
    [],
  );
  store.upsertIndexedSession(
    session({
      sessionKey: "codex:cn",
      rawId: "cn",
      originalTitle: "中文正文",
      firstQuestion: "unrelated question",
      projectPath: "/repo",
      fileMtimeMs: 25,
    }),
    messages("这里讨论的是登录态失效的问题"),
    [],
    [],
  );
  store.addTag("codex:abc", "auth");

  // A 60-message session for paging tests.
  const manyMessages: SessionMessage[] = Array.from({ length: 60 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `msg-${i}`,
    timestamp: "2026-06-01T10:00:00Z",
    index: i,
  }));
  store.upsertIndexedSession(session({ sessionKey: "codex:multi", rawId: "multi", projectPath: "/multi", fileMtimeMs: 30 }), manyMessages, [], []);

  return { db, store };
}

describe("MCP query functions", () => {
  it("finds a session by transcript keywords via FTS", () => {
    const { db } = seedStore();
    const results = searchSessions(db, { query: "refresh token" });
    expect(results.map((r) => r.sessionKey)).toContain("codex:abc");
    expect(results.find((r) => r.sessionKey === "codex:abc")?.project).toBe("/repo");
  });

  it("finds segmented Chinese transcript content", () => {
    const { db } = seedStore();
    const results = searchSessions(db, { query: "登录失效" });
    expect(results.map((r) => r.sessionKey)).toContain("codex:cn");
  });

  it("returns recent sessions when no query is given", () => {
    const { db } = seedStore();
    const results = searchSessions(db, {});
    // Ordered by file_mtime_ms DESC, so the newest session comes first.
    expect(results[0].sessionKey).toBe("codex:multi");
  });

  it("filters by project substring", () => {
    const { db } = seedStore();
    const results = searchSessions(db, { project: "other" });
    expect(results).toHaveLength(1);
    expect(results[0].sessionKey).toBe("codex:def");
  });

  it("does not break on FTS special characters", () => {
    const { db } = seedStore();
    expect(() => searchSessions(db, { query: 'token" OR (' })).not.toThrow();
  });

  it("gets a single session with messages", () => {
    const { db } = seedStore();
    const session = getSession(db, { sessionKey: "codex:abc" });
    expect(session?.title).toBe("fix login expiry bug");
    expect(session?.messages[0].content).toContain("refresh token");
    expect(getSession(db, { sessionKey: "missing" })).toBeNull();
  });

  it("pages through messages via offset and reports nextOffset", () => {
    const { db } = seedStore();
    const first = getSession(db, { sessionKey: "codex:multi", maxMessages: 40 });
    // Seeded with 60 messages below; first page returns 40 with more remaining.
    expect(first?.totalMessages).toBe(60);
    expect(first?.returned).toBe(40);
    expect(first?.nextOffset).toBe(40);
    const second = getSession(db, { sessionKey: "codex:multi", maxMessages: 40, offset: first!.nextOffset });
    expect(second?.returned).toBe(20);
    expect(second?.nextOffset).toBeNull();
    expect(second?.messages[19].content).toBe("msg-59");
  });

  it("lists projects and tags", () => {
    const { db } = seedStore();
    expect(listProjects(db).map((p) => p.project).sort()).toEqual(["/multi", "/other", "/repo"]);
    expect(listTags(db)).toContain("auth");
  });
});
