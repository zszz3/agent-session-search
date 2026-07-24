import { describe, expect, it } from "vitest";
import type { SkillRootStatus } from "../../core/skill-manager";
import { summarizeSkillRoots } from "./features/skills/skills-page";

describe("summarizeSkillRoots", () => {
  it("removes missing duplicate project roots while preserving available roots", () => {
    const roots: SkillRootStatus[] = [
      {
        agent: "codex",
        source: "codex-user",
        path: "/home/.codex/skills",
        exists: true,
        skillCount: 10,
      },
      {
        agent: "codex",
        source: "codex-shared",
        path: "/home/.agents/skills",
        exists: true,
        skillCount: 3,
      },
      {
        agent: "codex",
        source: "codex-project",
        path: "/repo/.codex/skills",
        exists: true,
        skillCount: 2,
      },
      {
        agent: "codex",
        source: "codex-project",
        path: "/repo/app/.codex/skills",
        exists: false,
        skillCount: 0,
      },
      {
        agent: "claude",
        source: "claude-project",
        path: "/repo/.claude/skills",
        exists: false,
        skillCount: 0,
      },
    ];

    expect(
      summarizeSkillRoots(roots).map(({ source, exists, skillCount }) => ({
        source,
        exists,
        skillCount,
      })),
    ).toEqual([
      { source: "codex-user", exists: true, skillCount: 10 },
      { source: "codex-shared", exists: true, skillCount: 3 },
      { source: "codex-project", exists: true, skillCount: 2 },
    ]);
  });
});
