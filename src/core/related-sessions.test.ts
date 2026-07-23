import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PostgresDatabase } from "./postgres/database";
import { POSTGRES_MIGRATIONS } from "./postgres/schema";
import { PostgresSessionRepository } from "./postgres/session-repository";
import { PGliteTestPool } from "./postgres/test-pglite";
import { findRelatedSessions } from "./related-sessions";
import type { IndexedSession, SessionSource } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const BASE_TIME = 1_720_000_000_000;

describe("findRelatedSessions", () => {
  let database: PostgresDatabase;
  let sessions: PostgresSessionRepository;

  beforeEach(async () => {
    database = new PostgresDatabase(new PGliteTestPool(), {
      migrationLock: false,
      migrations: POSTGRES_MIGRATIONS,
    });
    await database.initialize();
    sessions = new PostgresSessionRepository(database);
  });

  afterEach(async () => {
    await database.close();
  });

  async function insertSession(
    sessionKey: string,
    overrides: {
      title?: string;
      source?: SessionSource;
      project?: string;
      timestamp?: number;
    } = {},
  ): Promise<void> {
    const session: IndexedSession = {
      sessionKey,
      rawId: sessionKey,
      source: overrides.source ?? "codex-cli",
      projectPath: overrides.project ?? "/work/app",
      filePath: `/synthetic/${sessionKey}.jsonl`,
      originalTitle: overrides.title ?? "Untitled",
      firstQuestion: overrides.title ?? "Untitled",
      timestamp: overrides.timestamp ?? BASE_TIME,
      fileMtimeMs: 0,
      fileSize: 0,
      prUrl: null,
      prNumber: null,
    };
    await sessions.upsertIndexedSession(session, []);
  }

  it("returns empty for an unknown session", async () => {
    await expect(findRelatedSessions(database, "missing")).resolves.toEqual([]);
  });

  it("ranks same-project sessions higher", async () => {
    await insertSession("target", { project: "/work/app" });
    await insertSession("same-project", {
      project: "/work/app",
      timestamp: BASE_TIME + 30 * DAY,
    });
    await insertSession("other-project", {
      project: "/work/other",
      timestamp: BASE_TIME + 30 * DAY,
    });

    const related = await findRelatedSessions(database, "target");
    expect(related.map((item) => item.sessionKey)).toContain("same-project");
    expect(related.find((item) => item.sessionKey === "same-project")!.score)
      .toBeGreaterThanOrEqual(30);
  });

  it("adds score for shared tags", async () => {
    await insertSession("target");
    await insertSession("tagged-peer", { timestamp: BASE_TIME + 30 * DAY });
    await sessions.addTag("target", "auth");
    await sessions.addTag("tagged-peer", "auth");

    const peer = (await findRelatedSessions(database, "target"))
      .find((item) => item.sessionKey === "tagged-peer");
    expect(peer).toMatchObject({
      sharedTags: ["auth"],
      score: expect.any(Number),
    });
    expect(peer!.score).toBeGreaterThanOrEqual(20);
  });

  it("rewards temporal proximity within seven days", async () => {
    await insertSession("target", { title: "Alpha topic" });
    await insertSession("recent", {
      title: "Beta subject",
      project: "/work/other",
      source: "claude-cli",
      timestamp: BASE_TIME + 2 * DAY,
    });
    await insertSession("old", {
      title: "Gamma matter",
      project: "/work/other",
      source: "claude-cli",
      timestamp: BASE_TIME + 30 * DAY,
    });

    const related = await findRelatedSessions(database, "target");
    expect(related.find((item) => item.sessionKey === "recent")!.score)
      .toBeGreaterThanOrEqual(15);
    expect(related.find((item) => item.sessionKey === "old")).toBeUndefined();
  });

  it("rewards title keyword overlap", async () => {
    await insertSession("target", { title: "Fix login redirect bug" });
    await insertSession("keyword-peer", {
      title: "Debug login redirect issue",
      timestamp: BASE_TIME + 30 * DAY,
    });

    const peer = (await findRelatedSessions(database, "target"))
      .find((item) => item.sessionKey === "keyword-peer");
    expect(peer).toBeDefined();
    expect(peer!.score).toBeGreaterThanOrEqual(10);
  });

  it("excludes hidden sessions and the target itself", async () => {
    await insertSession("target");
    await insertSession("hidden-peer");
    await sessions.setHidden("hidden-peer", true);

    const related = await findRelatedSessions(database, "target");
    expect(related.every((item) => item.sessionKey !== "target")).toBe(true);
    expect(related.every((item) => item.sessionKey !== "hidden-peer")).toBe(true);
  });

  it("respects the limit and sorts by score", async () => {
    await insertSession("target");
    for (let index = 0; index < 12; index += 1) {
      await insertSession(`peer-${index}`, {
        timestamp: BASE_TIME + (index + 1) * DAY,
      });
    }
    const related = await findRelatedSessions(database, "target", 5);
    expect(related).toHaveLength(5);
    for (let index = 1; index < related.length; index += 1) {
      expect(related[index - 1].score).toBeGreaterThanOrEqual(related[index].score);
    }
  });
});
