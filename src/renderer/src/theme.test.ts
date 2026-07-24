import { describe, expect, it } from "vitest";
import { readStoredLanguage } from "./language";
import { readStoredTheme } from "./theme";

describe("theme storage", () => {
  it("defaults to light and restores only an explicit supported theme", () => {
    expect(readStoredTheme(null)).toBe("light");
    expect(readStoredTheme("dark")).toBe("dark");
    expect(readStoredTheme("light")).toBe("light");
    expect(readStoredTheme("system")).toBe("light");
  });
});

describe("language storage", () => {
  it("defaults to Chinese and restores only an explicit supported language", () => {
    expect(readStoredLanguage(null)).toBe("zh");
    expect(readStoredLanguage("en")).toBe("en");
    expect(readStoredLanguage("zh")).toBe("zh");
    expect(readStoredLanguage("system")).toBe("zh");
  });
});
