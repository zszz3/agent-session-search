import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadSkillUsage, usageForSkill } from "./skill-usage";

function writeUsageLog(lines: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-search-usage-"));
  const usagePath = path.join(dir, "skill-usage.jsonl");
  fs.writeFileSync(usagePath, lines.join("\n"), "utf8");
  return usagePath;
}

describe("skill usage", () => {
  it("aggregates counts and last-used time per skill", () => {
    const usagePath = writeUsageLog([
      JSON.stringify({ skill: "brainstorming", ts: "2026-06-01T10:00:00.000Z" }),
      JSON.stringify({ skill: "brainstorming", ts: "2026-06-02T10:00:00.000Z" }),
      JSON.stringify({ skill: "tdd", ts: "2026-06-03T10:00:00.000Z" }),
    ]);

    const snapshot = loadSkillUsage({ usagePath });

    expect(snapshot.exists).toBe(true);
    expect(snapshot.totalEvents).toBe(3);
    expect(snapshot.stats).toEqual([
      { skill: "brainstorming", count: 2, lastUsedAt: Date.parse("2026-06-02T10:00:00.000Z") },
      { skill: "tdd", count: 1, lastUsedAt: Date.parse("2026-06-03T10:00:00.000Z") },
    ]);
    expect(usageForSkill(snapshot, "Brainstorming")?.count).toBe(2);

    fs.rmSync(path.dirname(usagePath), { recursive: true, force: true });
  });

  it("skips malformed lines and records without a skill name", () => {
    const usagePath = writeUsageLog([
      "not json",
      JSON.stringify({ ts: "2026-06-01T10:00:00.000Z" }),
      JSON.stringify({ skill: "  ", ts: "2026-06-01T10:00:00.000Z" }),
      JSON.stringify({ skill: "review-code", ts: "2026-06-01T10:00:00.000Z" }),
      "",
    ]);

    const snapshot = loadSkillUsage({ usagePath });

    expect(snapshot.totalEvents).toBe(1);
    expect(snapshot.stats.map((stat) => stat.skill)).toEqual(["review-code"]);

    fs.rmSync(path.dirname(usagePath), { recursive: true, force: true });
  });

  it("returns an empty snapshot when the log is missing", () => {
    const snapshot = loadSkillUsage({ usagePath: path.join(os.tmpdir(), "session-search-missing-usage.jsonl") });
    expect(snapshot.exists).toBe(false);
    expect(snapshot.totalEvents).toBe(0);
    expect(snapshot.stats).toEqual([]);
    expect(usageForSkill(snapshot, "anything")).toBeNull();
  });
});
