import { describe, expect, it } from "vitest";
import { formatCompactNumber } from "./format-count";

describe("formatCompactNumber", () => {
  it("uses K/M/B suffixes instead of locale-specific compact units", () => {
    expect(formatCompactNumber(999)).toBe("999");
    expect(formatCompactNumber(1_200)).toBe("1.2K");
    expect(formatCompactNumber(1_250_000)).toBe("1.3M");
    expect(formatCompactNumber(3_400_000_000)).toBe("3.4B");
  });
});
