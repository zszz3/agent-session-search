import { describe, expect, it } from "vitest";
import { dateRangeLabel, dateRangeShortLabel, resolveDateRange } from "./date-range";

describe("date range filter", () => {
  it("resolves recent presets relative to the current time", () => {
    const now = Date.parse("2026-07-07T12:00:00.000Z");

    expect(resolveDateRange("7d", now)).toEqual({
      dateFrom: Date.parse("2026-06-30T12:00:00.000Z"),
      dateTo: now,
    });
    expect(resolveDateRange("30d", now)).toEqual({
      dateFrom: Date.parse("2026-06-07T12:00:00.000Z"),
      dateTo: now,
    });
    expect(resolveDateRange("90d", now)).toEqual({
      dateFrom: Date.parse("2026-04-08T12:00:00.000Z"),
      dateTo: now,
    });
  });

  it("leaves all time unbounded and localizes labels", () => {
    expect(resolveDateRange("all", Date.parse("2026-07-07T12:00:00.000Z"))).toEqual({});
    expect(dateRangeLabel("7d", "zh")).toBe("最近一周");
    expect(dateRangeLabel("90d", "en")).toBe("Last 3 months");
    expect(dateRangeShortLabel("30d", "zh")).toBe("30天");
    expect(dateRangeShortLabel("all", "en")).toBe("All");
  });
});
