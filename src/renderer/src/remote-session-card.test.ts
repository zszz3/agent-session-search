import { describe, expect, it } from "vitest";
import type { SessionSyncItem } from "../../core/remote-session-sync";
import type { SessionSearchResult } from "../../core/types";
import { primarySessionAction, sessionCopySummary } from "./features/remote-sessions/remote-sessions-dialog";

const local: SessionSearchResult = {
  sessionKey: "codex:local",
  rawId: "local",
  source: "codex-cli",
  projectPath: "/repo",
  filePath: "/tmp/local.jsonl",
  originalTitle: "Sync UX",
  firstQuestion: "Sync UX",
  timestamp: 100,
  fileMtimeMs: 200,
  fileSize: 10,
  prUrl: null,
  prNumber: null,
  gitBranch: "main",
  environmentId: "local",
  environmentKind: "local",
  environmentLabel: "Local",
  tokenUsage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 },
  customTitle: null,
  displayTitle: "Sync UX",
  favorited: false,
  pinned: false,
  hidden: false,
  tags: [],
  matchSnippet: null,
  lastOpenedAt: null,
  lastResumedAt: null,
  lastActivityAt: 4_000,
  messageCount: 41,
  aiSummary: null,
  aiSummaryStale: false,
};

function item(state: SessionSyncItem["state"], sides: { local?: boolean; remote?: boolean } = { local: true, remote: true }): SessionSyncItem {
  return {
    id: state,
    state,
    local: sides.local === false ? null : local,
    remote: sides.remote === false ? null : {
      id: "remote",
      sourceSessionKey: "codex:local",
      sourceAgent: "codex",
      sourceSource: "codex-cli",
      sourceEnvironmentId: "local",
      sourceEnvironmentKind: "local",
      sourceEnvironmentLabel: "Local",
      title: "Sync UX",
      projectPath: "/repo",
      startedAt: "2026-07-15T00:00:00.000Z",
      updatedAt: 2_000,
      contentHash: "remote",
      messageCount: 39,
      traceEventCount: 0,
      aiSummary: null,
      tags: [],
      searchText: "",
      detailObjectKey: "detail",
      portableObjectKey: "portable",
      detailSha256: "detail",
      portableSha256: "portable",
      createdAt: 1_000,
      syncedAt: 3_000,
    },
    localRevision: "local",
    remoteRevision: "remote",
    lastSyncedAt: 3_000,
  };
}

describe("remote session comparison cards", () => {
  it("chooses exactly one primary action for every sync state", () => {
    expect(primarySessionAction(item("local-only", { remote: false }))).toBe("upload");
    expect(primarySessionAction(item("local-newer"))).toBe("upload");
    expect(primarySessionAction(item("synced"))).toBe("view");
    expect(primarySessionAction(item("remote-newer"))).toBe("restore");
    expect(primarySessionAction(item("remote-only", { local: false }))).toBe("restore");
    expect(primarySessionAction(item("conflict"))).toBe("resolve");
  });

  it("keeps local and cloud metrics separate", () => {
    expect(sessionCopySummary(item("local-newer"), "local")).toMatchObject({ present: true, updatedAt: 4_000, messageCount: 41 });
    expect(sessionCopySummary(item("local-newer"), "remote")).toMatchObject({ present: true, updatedAt: 2_000, messageCount: 39, syncedAt: 3_000 });
    expect(sessionCopySummary(item("local-only", { remote: false }), "remote")).toEqual({ present: false, missing: "not-uploaded" });
    expect(sessionCopySummary(item("remote-only", { local: false }), "local")).toEqual({ present: false, missing: "no-local-copy" });
  });
});
