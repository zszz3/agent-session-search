import { describe, expect, it } from "vitest";
import { filterSessionsByLiveStatus, getLiveSessionState, liveSessionKeyForSession } from "./live-filter";

const codex = { source: "codex-cli", rawId: "codex-1", sessionKey: "codex:codex-1" } as const;
const claude = { source: "claude-cli", rawId: "claude-1", sessionKey: "claude:claude-1" } as const;
const codebuddy = { source: "codebuddy-cli", rawId: "codebuddy-1", sessionKey: "codebuddy:codebuddy-1" } as const;
const opencode = { source: "opencode-cli", rawId: "codebuddy-1", sessionKey: "opencode:codebuddy-1" } as const;
const trae = { source: "trae", rawId: "session_memory_trae-1", sessionKey: "trae:session_memory_trae-1" } as const;
const tclaude = { source: "tclaude-cli", rawId: "tclaude-1", sessionKey: "tclaude:tclaude-1" } as const;
const tcodex = { source: "tcodex-cli", rawId: "tcodex-1", sessionKey: "tcodex:tcodex-1" } as const;

describe("live session filtering", () => {
  it("builds stable live keys from session source family and raw id", () => {
    expect(liveSessionKeyForSession(codex)).toBe("codex:codex-1");
    expect(liveSessionKeyForSession(claude)).toBe("claude:claude-1");
    expect(liveSessionKeyForSession(codebuddy)).toBe("codebuddy:codebuddy-1");
    expect(liveSessionKeyForSession(trae)).toBe("trae:session_memory_trae-1");
    expect(liveSessionKeyForSession(tclaude)).toBe("tclaude:tclaude-1");
    expect(liveSessionKeyForSession(tcodex)).toBe("tcodex:tcodex-1");
    expect(liveSessionKeyForSession(opencode)).toBeNull();
  });

  it("filters sessions by open and closed live status", () => {
    const liveKeys = new Set(["codex:codex-1"]);

    expect(filterSessionsByLiveStatus([codex, claude], liveKeys, "all", false).map((session) => session.sessionKey)).toEqual([
      "codex:codex-1",
      "claude:claude-1",
    ]);
    expect(filterSessionsByLiveStatus([codex, claude], liveKeys, "open", false).map((session) => session.sessionKey)).toEqual([
      "codex:codex-1",
    ]);
    expect(filterSessionsByLiveStatus([codex, claude], liveKeys, "closed", false).map((session) => session.sessionKey)).toEqual([
      "claude:claude-1",
    ]);
  });

  it("treats sessions as closed when live detection fails", () => {
    expect(getLiveSessionState(codex, new Set(["codex:codex-1"]), true)).toBe("closed");
    expect(filterSessionsByLiveStatus([codex], new Set(["codex:codex-1"]), "open", true)).toEqual([]);
    expect(filterSessionsByLiveStatus([codex], new Set(["codex:codex-1"]), "closed", true)).toEqual([codex]);
  });

  it("treats unsupported sources as closed", () => {
    expect(getLiveSessionState(opencode, new Set(["codebuddy:codebuddy-1"]), false)).toBe("closed");
    expect(filterSessionsByLiveStatus([opencode], new Set(["codebuddy:codebuddy-1"]), "open", false)).toEqual([]);
    expect(filterSessionsByLiveStatus([opencode], new Set(["codebuddy:codebuddy-1"]), "closed", false)).toEqual([opencode]);
  });
});
