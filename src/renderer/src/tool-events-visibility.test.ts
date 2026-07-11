import { describe, expect, it, vi } from "vitest";
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
