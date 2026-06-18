import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

function sourceBlock(startNeedle: string, endNeedles: string[]): string {
  const start = mainSource.indexOf(startNeedle);
  expect(start).toBeGreaterThanOrEqual(0);
  const ends = endNeedles.map((needle) => mainSource.indexOf(needle, start + startNeedle.length)).filter((index) => index >= 0);
  expect(ends.length).toBeGreaterThan(0);
  return mainSource.slice(start, Math.min(...ends));
}

describe("skill usage refresh lifecycle", () => {
  it("refreshes skill usage after startup and on a background interval", () => {
    const startupBlock = sourceBlock("app.whenReady().then(() => {", ["app.on(\"window-all-closed\""]);
    const refreshBlock = sourceBlock("function startAutoSkillUsageRefresh(): void", ["function stopAutoSkillUsageRefresh"]);

    expect(mainSource).toContain("AUTO_SKILL_USAGE_REFRESH_INTERVAL_MS");
    expect(startupBlock).toContain("startAutoSkillUsageRefresh()");
    expect(refreshBlock).toContain("setTimeout(() => {");
    expect(refreshBlock).toContain("INITIAL_SKILL_USAGE_REFRESH_DELAY_MS");
    expect(refreshBlock).toContain("setInterval(() => {");
    expect(refreshBlock).toContain("refreshSkillUsageIndexSafely()");
    expect(refreshBlock).toContain("AUTO_SKILL_USAGE_REFRESH_INTERVAL_MS");
  });

  it("stops skill usage refresh timers before quitting", () => {
    const quitBlock = sourceBlock("app.on(\"before-quit\", () => {", ["});"]);

    expect(quitBlock).toContain("stopAutoSkillUsageRefresh()");
  });
});
