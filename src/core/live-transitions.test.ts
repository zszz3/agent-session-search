import { describe, expect, it } from "vitest";
import type { LiveSession } from "./types";
import { liveSessionKey, type TrackedLiveSession, updateLiveTracker } from "./live-transitions";

function live(family: LiveSession["family"], rawId: string, pid = 1): LiveSession {
  return { family, rawId, pid };
}

describe("updateLiveTracker", () => {
  it("records running sessions without reporting completions on the first poll", () => {
    const { tracker, completed } = updateLiveTracker(new Map(), [live("claude", "a"), live("codex", "b")], 1_000);
    expect(completed).toEqual([]);
    expect(tracker.get("claude:a")?.firstSeen).toBe(1_000);
    expect(tracker.get("codex:b")?.firstSeen).toBe(1_000);
  });

  it("preserves firstSeen across polls while a session keeps running", () => {
    const first = updateLiveTracker(new Map(), [live("claude", "a")], 1_000);
    const second = updateLiveTracker(first.tracker, [live("claude", "a")], 5_000);
    expect(second.completed).toEqual([]);
    expect(second.tracker.get("claude:a")?.firstSeen).toBe(1_000);
  });

  it("reports a session as completed when it disappears, with observed duration", () => {
    const first = updateLiveTracker(new Map(), [live("claude", "a"), live("codex", "b")], 1_000);
    const second = updateLiveTracker(first.tracker, [live("codex", "b")], 9_000);
    expect(second.completed).toEqual([{ key: "claude:a", family: "claude", rawId: "a", durationMs: 8_000 }]);
    expect(second.tracker.has("claude:a")).toBe(false);
    expect(second.tracker.get("codex:b")?.firstSeen).toBe(1_000);
  });

  it("ignores pid changes for the same family + rawId", () => {
    const prev = new Map<string, TrackedLiveSession>([["claude:a", { firstSeen: 1_000, family: "claude", rawId: "a" }]]);
    const { completed, tracker } = updateLiveTracker(prev, [live("claude", "a", 999)], 4_000);
    expect(completed).toEqual([]);
    expect(tracker.get("claude:a")?.firstSeen).toBe(1_000);
  });

  it("builds a stable key from family and rawId", () => {
    expect(liveSessionKey({ family: "trae", rawId: "x:y" })).toBe("trae:x:y");
  });
});
