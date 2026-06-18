import { describe, expect, it } from "vitest";
import { AUTO_INDEX_REFRESH_INTERVAL_MS, AUTO_SKILL_USAGE_REFRESH_INTERVAL_MS, INITIAL_INDEX_DELAY_MS, QUOTA_REFRESH_INTERVAL_MS } from "./refresh-policy";

describe("refresh policy", () => {
  it("keeps automatic indexing infrequent while still indexing shortly after startup", () => {
    expect(INITIAL_INDEX_DELAY_MS).toBe(750);
    expect(AUTO_INDEX_REFRESH_INTERVAL_MS).toBe(10 * 60 * 1000);
  });

  it("polls usage quotas often enough to track the statusline snapshot file", () => {
    expect(QUOTA_REFRESH_INTERVAL_MS).toBe(60 * 1000);
    expect(QUOTA_REFRESH_INTERVAL_MS).toBeLessThan(AUTO_INDEX_REFRESH_INTERVAL_MS);
  });

  it("refreshes skill usage automatically without matching the high-frequency quota poll", () => {
    expect(AUTO_SKILL_USAGE_REFRESH_INTERVAL_MS).toBe(10 * 60 * 1000);
    expect(AUTO_SKILL_USAGE_REFRESH_INTERVAL_MS).toBeGreaterThan(QUOTA_REFRESH_INTERVAL_MS);
  });
});
