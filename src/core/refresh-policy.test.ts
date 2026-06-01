import { describe, expect, it } from "vitest";
import { AUTO_INDEX_REFRESH_INTERVAL_MS, INITIAL_INDEX_DELAY_MS } from "./refresh-policy";

describe("refresh policy", () => {
  it("keeps automatic indexing infrequent while still indexing shortly after startup", () => {
    expect(INITIAL_INDEX_DELAY_MS).toBe(750);
    expect(AUTO_INDEX_REFRESH_INTERVAL_MS).toBe(10 * 60 * 1000);
  });
});
