import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { indexMigratedSessionFile, syncLoadedSessionsInBatches } from "./indexer";
import { createInMemoryStore } from "./session-store";
import { writeMigratedSession } from "./session-migration-writers";
import type { IndexedSession, LoadedSession, MigrationAgent, PortableSession } from "./types";

function session(index: number): LoadedSession {
  const id = `session-${index}`;
  const item: IndexedSession = {
    sessionKey: `codex:${id}`,
    rawId: id,
    source: "codex-cli",
    projectPath: `/repo/${index}`,
    filePath: `/tmp/${id}.jsonl`,
    originalTitle: `Session ${index}`,
    firstQuestion: `Question ${index}`,
    timestamp: index,
    fileMtimeMs: index,
    fileSize: 100 + index,
    prUrl: null,
    prNumber: null,
  };

  return {
    session: item,
    messages: [{ role: "user", content: `Question ${index}`, timestamp: "2026-06-01T10:00:00Z", index: 0 }],
  };
}

describe("indexer", () => {
  it("indexes loaded sessions in batches and yields between batches", async () => {
    const store = createInMemoryStore();
    const progress: number[] = [];
    let yields = 0;

    const status = await syncLoadedSessionsInBatches(store, [session(1), session(2), session(3)], {
      batchSize: 1,
      onProgress: (nextStatus) => progress.push(nextStatus.indexed),
      yieldToEventLoop: async () => {
        yields++;
      },
    });

    expect(progress).toEqual([1, 2, 3]);
    expect(yields).toBe(3);
    expect(status).toMatchObject({ running: false, indexed: 3, total: 3, error: null });
    expect(store.searchSessions({ query: "Question", limit: 10 })).toHaveLength(3);
  });

  it.each(["claude", "codex", "codebuddy"] as const)("indexes one migrated %s session file without a full scan", async (target: MigrationAgent) => {
    const store = createInMemoryStore();
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-session-search-index-migration-"));
    try {
      const written = await writeMigratedSession({
        target,
        homeDir,
        now: new Date("2026-06-24T10:00:00.000Z"),
        session: portableSession(),
      });

      const status = indexMigratedSessionFile(store, target, written.filePath);

      expect(status).toMatchObject({ running: false, indexed: 1, total: 1, error: null });
      expect(store.searchSessions({ query: "migrated question", limit: 10 })).toHaveLength(1);
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });
});

function portableSession(): PortableSession {
  return {
    sourceSessionKey: "codex:source",
    sourceAgent: "codex",
    title: "Migrated session",
    projectPath: "/tmp/migrated-project",
    startedAt: "2026-06-24T09:00:00.000Z",
    messages: [
      { role: "user", content: "migrated question", timestamp: "2026-06-24T09:00:00.000Z", index: 0 },
      { role: "assistant", content: "migrated answer", timestamp: "2026-06-24T09:00:01.000Z", index: 1 },
    ],
  };
}
