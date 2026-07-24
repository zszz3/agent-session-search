import { describe, expect, it, vi } from "vitest";
import type { SessionMessage, SessionTraceEvent } from "../../core/types";
import { filterConversationTimeline } from "./features/session-detail/detail-panel";
import {
  TOOL_EVENTS_VISIBILITY_STORAGE_KEY,
  readInitialToolEventsVisibility,
  readStoredToolEventsVisibility,
  storeToolEventsVisibility,
} from "./tool-events-visibility";

describe("tool-event visibility preference", () => {
  it("defaults missing and malformed values to hidden", () => {
    expect(readStoredToolEventsVisibility(null)).toBe(false);
    expect(readStoredToolEventsVisibility("false")).toBe(false);
    expect(readStoredToolEventsVisibility("1")).toBe(false);
    expect(readStoredToolEventsVisibility("invalid")).toBe(false);
  });

  it("restores only an explicitly enabled preference", () => {
    expect(readStoredToolEventsVisibility("true")).toBe(true);
  });

  it("falls back to hidden when reading storage fails", () => {
    const storage = { getItem: vi.fn(() => { throw new Error("denied"); }), setItem: vi.fn() };
    expect(readInitialToolEventsVisibility(storage)).toBe(false);
    expect(storage.getItem).toHaveBeenCalledWith(TOOL_EVENTS_VISIBILITY_STORAGE_KEY);
  });

  it("stores explicit changes and ignores write failures", () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    storeToolEventsVisibility(true, storage);
    storeToolEventsVisibility(false, storage);
    expect(storage.setItem).toHaveBeenNthCalledWith(1, TOOL_EVENTS_VISIBILITY_STORAGE_KEY, "true");
    expect(storage.setItem).toHaveBeenNthCalledWith(2, TOOL_EVENTS_VISIBILITY_STORAGE_KEY, "false");

    expect(() => storeToolEventsVisibility(true, {
      getItem: vi.fn(),
      setItem: vi.fn(() => { throw new Error("denied"); }),
    })).not.toThrow();
  });
});

describe("conversation tool filtering", () => {
  it("composes role filtering with independent tool-event visibility", () => {
    const user = {
      index: 0,
      role: "user",
      content: "question",
      timestamp: "2026-07-11T00:00:00.000Z",
    } as SessionMessage;
    const toolCall = {
      index: 0,
      kind: "tool_call",
      title: "Read",
      timestamp: "2026-07-11T00:00:01.000Z",
    } as SessionTraceEvent;
    const assistant = {
      index: 1,
      role: "assistant",
      content: "answer",
      timestamp: "2026-07-11T00:00:02.000Z",
    } as SessionMessage;
    const toolResult = {
      index: 1,
      kind: "tool_result",
      title: "tool output",
      timestamp: "2026-07-11T00:00:03.000Z",
    } as SessionTraceEvent;
    const items = [
      { kind: "message" as const, key: "message:0", timestampMs: 0, order: 0, message: user },
      { kind: "trace" as const, key: "trace:0", timestampMs: 1, order: 1, event: toolCall },
      { kind: "message" as const, key: "message:1", timestampMs: 2, order: 2, message: assistant },
      { kind: "trace" as const, key: "trace:1", timestampMs: 3, order: 3, event: toolResult },
    ];

    expect(filterConversationTimeline(items, "all", false).map((item) => item.key)).toEqual([
      "message:0",
      "message:1",
    ]);
    expect(filterConversationTimeline(items, "all", true).map((item) => item.key)).toEqual([
      "message:0",
      "trace:0",
      "message:1",
      "trace:1",
    ]);
    expect(filterConversationTimeline(items, "user", true).map((item) => item.key)).toEqual([
      "message:0",
      "trace:0",
      "trace:1",
    ]);
    expect(filterConversationTimeline(items, "assistant", false).map((item) => item.key)).toEqual([
      "message:1",
    ]);
  });
});
