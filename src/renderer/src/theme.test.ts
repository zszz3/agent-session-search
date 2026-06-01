import { describe, expect, it } from "vitest";
import { readStoredTheme } from "./theme";

describe("theme storage", () => {
  it("defaults to light when no theme is stored", () => {
    expect(readStoredTheme(null)).toBe("light");
  });

  it("keeps dark only when dark is explicitly stored", () => {
    expect(readStoredTheme("dark")).toBe("dark");
    expect(readStoredTheme("light")).toBe("light");
    expect(readStoredTheme("system")).toBe("light");
  });
});
