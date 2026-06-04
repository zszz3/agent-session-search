import { describe, expect, it } from "vitest";
import { truncateTraceDetail } from "./trace-detail";

describe("truncateTraceDetail", () => {
  it("keeps small trace details unchanged", () => {
    expect(truncateTraceDetail("small output", 20)).toBe("small output");
  });

  it("caps large trace details and marks the indexed preview", () => {
    const detail = "x".repeat(120);
    const truncated = truncateTraceDetail(detail, 80);

    expect(truncated.length).toBeLessThanOrEqual(80);
    expect(truncated).toContain("Indexed preview truncated");
    expect(truncated).toContain("characters omitted");
  });
});
