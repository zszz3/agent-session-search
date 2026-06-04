import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const record = require(path.resolve("bin", "skill-usage-record.cjs"));

describe("skill usage record", () => {
  it("builds a record from a Skill tool call", () => {
    const result = record.buildRecord({
      hook_event_name: "PostToolUse",
      tool_name: "Skill",
      tool_input: { skill: "brainstorming", args: "go" },
    });
    expect(result).toMatchObject({ skill: "brainstorming", agent: "claude", event: "PostToolUse" });
    expect(typeof result.ts).toBe("string");
  });

  it("ignores non-Skill tools and missing skill names", () => {
    expect(record.buildRecord({ tool_name: "Bash", tool_input: { command: "ls" } })).toBeNull();
    expect(record.buildRecord({ tool_name: "Skill", tool_input: {} })).toBeNull();
    expect(record.buildRecord({})).toBeNull();
  });

  it("accepts alternate skill field names", () => {
    expect(record.extractSkillName({ skill_name: "tdd" })).toBe("tdd");
    expect(record.extractSkillName({ name: "debugging" })).toBe("debugging");
    expect(record.extractSkillName({ other: "x" })).toBe("");
  });
});
