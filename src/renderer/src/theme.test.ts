import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readStoredLanguage } from "./language";
import { readStoredTheme } from "./theme";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

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

describe("language storage", () => {
  it("defaults to English and keeps explicit Chinese", () => {
    expect(readStoredLanguage(null)).toBe("en");
    expect(readStoredLanguage("en")).toBe("en");
    expect(readStoredLanguage("zh")).toBe("zh");
    expect(readStoredLanguage("system")).toBe("en");
  });
});

describe("theme controls", () => {
  it("keeps light and dark mode selection inside settings", () => {
    const toolbar = appSource.slice(
      appSource.indexOf('<header className="toolbar">'),
      appSource.indexOf('<div className="result-count">'),
    );
    const settingsDialog = appSource.slice(appSource.indexOf("function SettingsDialog"), appSource.indexOf("function DeleteTagDialog"));

    expect(toolbar).not.toContain("setTheme");
    expect(settingsDialog).toContain("theme-setting-toggle");
    expect(settingsDialog).toContain("onThemeChange");
    expect(settingsDialog).toMatch(/Appearance/);
  });

  it("keeps language selection inside settings", () => {
    const settingsDialog = appSource.slice(appSource.indexOf("function SettingsDialog"), appSource.indexOf("function DeleteTagDialog"));

    expect(settingsDialog).toContain("language-setting-toggle");
    expect(settingsDialog).toContain("onLanguageChange");
    expect(settingsDialog).toMatch(/Language/);
  });

  it("opens settings with the standard preferences shortcut", () => {
    expect(appSource).toContain('event.key === ","');
    expect(appSource).toContain("setSettingsOpen(true)");
  });
});
